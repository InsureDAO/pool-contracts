pragma solidity 0.8.7;
/**
 * @author InsureDAO
 * @title InsureDAO market template contract
 * SPDX-License-Identifier: GPL-3.0
 */
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IVault.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/IParameters.sol";
import "./interfaces/IPoolTemplate.sol";
import "./interfaces/ICDS.sol";

contract IndexTemplate is IERC20 {
    using Address for address;
    using SafeMath for uint256;

    /**
     * EVENTS
     */

    event Deposit(address indexed depositor, uint256 amount, uint256 mint);
    event WithdrawRequested(
        address indexed withdrawer,
        uint256 amount,
        uint256 time
    );
    event Withdraw(address indexed withdrawer, uint256 amount, uint256 retVal);
    event Compensated(address indexed index, uint256 amount);
    event Paused(bool paused);
    event Resumed();
    event Locked();
    event MetadataChanged(string metadata);
    event LeverageSet(uint256 target);
    event AllocationSet(
        uint256 indexed _index,
        address indexed pool,
        uint256 allocPoint
    );

    /**
     * Storage
     */

    /// @notice Market setting
    bool public initialized;
    bool public paused;
    bool public locked;
    uint256 public pendingEnd;
    string public metadata;

    /// @notice EIP-20 token variables
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    /// @notice External contract call addresses
    IParameters public parameters;
    IVault public vault;
    IRegistry public registry;

    /// @notice Market variables for margin account
    uint256 public totalAllocatedCredit; //total allocated credit(liquidity)
    mapping(address => uint256) public allocPoints; //allocation point for each pool
    uint256 public totalAllocPoint; //total allocation point
    address[] public poolList; //list of all pools
    uint256 public targetLev; //1x = 1e3
    //The allocated credits are regarded as liquidity in each underlying pool
    //Credit amount(liquidity) will be determined by the following math
    //credit for a pool = total liquidity of this pool * leverage rate * allocation point for a pool / total allocation point

    ///@notice user status management
    struct Withdrawal {
        uint256 timestamp;
        uint256 amount;
    }
    mapping(address => Withdrawal) public withdrawalReq;

    ///@notice magic numbers
    uint256 public constant LEVERAGE_DIVISOR = 1e3;
    uint256 public constant UTILIZATION_RATE_LENGTH = 1e8;

    /**
     * @notice Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(
            msg.sender == parameters.getOwner(),
            "Restricted: caller is not allowed to operate"
        );
        _;
    }

    constructor() public {
        initialized = true;
    }

    /**
     * Initialize interaction
     */

    /**
     * @notice Initialize market
     * This function registers market conditions.
     * references[0] = underlying token address
     * references[1] = registry
     * references[2] = parameter
     * @param _metaData arbitrary string to store market information
     * @param _conditions array of conditions
     * @param _references array of references
     */
    function initialize(
        string calldata _metaData,
        uint256[] calldata _conditions,
        address[] calldata _references
    ) external {
        require(
            initialized == false &&
                bytes(_metaData).length > 0 &&
                _references[0] != address(0) &&
                _references[1] != address(0) &&
                _references[2] != address(0),
            "ERROR: INITIALIZATION_BAD_CONDITIONS"
        );

        initialized = true;

        name = "InsureDAO-Index";
        symbol = "iIndex";
        decimals = IERC20Metadata(_references[0]).decimals();

        parameters = IParameters(_references[2]);
        vault = IVault(parameters.getVault(_references[0]));
        registry = IRegistry(_references[1]);

        metadata = _metaData;
    }

    /**
     * Pool initeractions
     */

    /**
     * @notice A provider supplies collateral to the pool and receives iTokens
     * @param _amount amount of token to deposit
     * @return _mintAmount the amount of iToken minted from the transaction
     */
    function deposit(uint256 _amount) public returns (uint256 _mintAmount) {
        require(locked == false && paused == false, "ERROR: DEPOSIT_DISABLED");
        require(_amount > 0, "ERROR: DEPOSIT_ZERO");

        uint256 _cds = parameters.getCDSPremium(_amount, msg.sender);
        uint256 _fee = parameters.getDepositFee(_amount, msg.sender);
        uint256 _add = _amount.sub(_cds).sub(_fee);
        uint256 _supply = totalSupply();
        uint256 _totalLiquidity = totalLiquidity();
        vault.addValue(_add, msg.sender, address(this));
        vault.addValue(
            _cds,
            msg.sender,
            address(registry.getCDS(address(this)))
        );
        vault.addValue(_fee, msg.sender, parameters.getOwner());

        if (_supply > 0 && _totalLiquidity > 0) {
            _mintAmount = _add.mul(_supply).div(_totalLiquidity);
        } else if (_supply > 0 && _totalLiquidity == 0) {
            _mintAmount = _add.div(_supply);
        } else {
            _mintAmount = _add;
        }
        emit Deposit(msg.sender, _amount, _mintAmount);
        //mint iToken
        _mint(msg.sender, _mintAmount);
        adjustAlloc();
    }

    /**
     * @notice Provider request withdrawal of collateral
     * @param _amount amount of iToken to burn
     */
    function requestWithdraw(uint256 _amount) external {
        uint256 _balance = balanceOf(msg.sender);
        require(_balance >= _amount, "ERROR: REQUEST_EXCEED_BALANCE");
        require(_amount > 0, "ERROR: REQUEST_ZERO");
        withdrawalReq[msg.sender].timestamp = block.timestamp;
        withdrawalReq[msg.sender].amount = _amount;
        emit WithdrawRequested(msg.sender, _amount, block.timestamp);
    }

    /**
     * @notice Provider burns iToken and receives collatral from the pool
     * @param _amount amount of iToken to burn
     * @return _retVal the amount underlying token returned
     */
    function withdraw(uint256 _amount) external returns (uint256 _retVal) {
        //Calculate underlying value
        _retVal = totalLiquidity().mul(_amount).div(totalSupply());

        require(locked == false, "ERROR: WITHDRAWAL_PENDING");
        require(
            withdrawalReq[msg.sender].timestamp.add(
                parameters.getLockup(msg.sender)
            ) < block.timestamp,
            "ERROR: WITHDRAWAL_QUEUE"
        );
        require(
            withdrawalReq[msg.sender]
                .timestamp
                .add(parameters.getLockup(msg.sender))
                .add(parameters.getWithdrawable(msg.sender)) > block.timestamp,
            "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
        );
        require(
            withdrawalReq[msg.sender].amount >= _amount,
            "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
        );
        require(_amount > 0, "ERROR: WITHDRAWAL_ZERO");
        require(
            _retVal <= withdrawable(),
            "ERROR: WITHDRAW_INSUFFICIENT_LIQUIDITY"
        );

        //reduce requested amount
        withdrawalReq[msg.sender].amount = withdrawalReq[msg.sender].amount.sub(
            _amount
        );
        //Burn iToken
        _burn(msg.sender, _amount);

        //Check current leverage rate and get updated target total credit allocation
        uint256 _liquidityAfter = totalLiquidity().sub(_retVal);
        _adjustAlloc(_liquidityAfter);
        //Withdraw liquidity
        vault.withdrawValue(_retVal, msg.sender);

        emit Withdraw(msg.sender, _amount, _retVal);
    }

    /**
     * @notice Get how much can a user withdraw from this index
     * Withdrawable is limited to the amount which does not break the balance of credit allocation
     * @return _retVal withdrawable amount
     */
    function withdrawable() public view returns (uint256 _retVal) {
        if (totalLiquidity() > 0) {
            uint256 _lowest;
            for (uint256 i = 0; i < poolList.length; i++) {
                if (allocPoints[poolList[i]] > 0) {
                    uint256 _utilization = IPoolTemplate(poolList[i])
                        .utilizationRate();
                    if (i == 0) {
                        _lowest = _utilization;
                    }
                    if (_utilization > _lowest) {
                        _lowest = _utilization;
                    }
                }
            }
            if (leverage() > targetLev) {
                _retVal = 0;
            } else if (_lowest == 0) {
                _retVal = totalLiquidity();
            } else {
                _retVal = (UTILIZATION_RATE_LENGTH - _lowest)
                    .mul(totalLiquidity())
                    .mul(LEVERAGE_DIVISOR)
                    .div(UTILIZATION_RATE_LENGTH)
                    .div(leverage())
                    .add(_accruedPremiums());
            }
        } else {
            _retVal = 0;
        }
    }

    /**
     * @notice Adjust allocation of credit based on the target leverage rate
     */
    function adjustAlloc() public {
        _adjustAlloc(totalLiquidity());
    }

    /**
     * @notice Internal function to adjust allocation
     * We adjust credit allocation to meet the following priorities
     * 1) Keep the leverage rate
     * 2) Make credit allocatuion aligned to credit allocaton points
     * we also clear/withdraw accrued premiums in underlying pools to this pool.
     */
    function _adjustAlloc(uint256 _liquidity) internal {
        //Check current leverage rate and get target total credit allocation
        uint256 _targetCredit = targetLev.mul(totalLiquidity()).div(
            LEVERAGE_DIVISOR
        ); //Allocatable credit
        address[] memory _poolList = new address[](poolList.length); // log which pool has exceeded
        uint256 _allocatable = _targetCredit;
        uint256 _allocatablePoints = totalAllocPoint;
        //Check each pool and if current credit allocation > target & it is impossble to adjust, then withdraw all availablle credit
        for (uint256 i = 0; i < poolList.length; i++) {
            if (poolList[i] != address(0)) {
                uint256 _target = _targetCredit
                    .mul(allocPoints[poolList[i]])
                    .div(totalAllocPoint);
                uint256 _current = IPoolTemplate(poolList[i]).allocatedCredit(
                    address(this)
                );
                uint256 _available = IPoolTemplate(poolList[i])
                    .availableBalance();
                if (
                    (_current > _target &&
                        _current.sub(_target) > _available) ||
                    IPoolTemplate(poolList[i]).paused() == true
                ) {
                    IPoolTemplate(poolList[i]).withdrawCredit(_available);
                    totalAllocatedCredit = totalAllocatedCredit.sub(_available);
                    _poolList[i] = address(0);
                    _allocatable -= _current.sub(_available);
                    _allocatablePoints -= allocPoints[poolList[i]];
                } else {
                    _poolList[i] = poolList[i];
                }
            }
        }
        //Check pools that was not falling under the previous criteria, then adjust to meet the target credit allocation.
        for (uint256 i = 0; i < _poolList.length; i++) {
            if (_poolList[i] != address(0)) {
                //Target credit allocation for a pool
                uint256 _target = _allocatable
                    .mul(allocPoints[poolList[i]])
                    .div(_allocatablePoints);
                //get how much has been allocated for a pool
                uint256 _current = IPoolTemplate(poolList[i]).allocatedCredit(
                    address(this)
                );

                uint256 _available = IPoolTemplate(poolList[i])
                    .availableBalance();
                if (_current > _target && _available != 0) {
                    //if allocated credit is higher than the target, try to decrease
                    uint256 _decrease = _current.sub(_target);
                    IPoolTemplate(poolList[i]).withdrawCredit(_decrease);
                    totalAllocatedCredit = totalAllocatedCredit.sub(_decrease);
                }
                if (_current < _target) {
                    //Sometimes we need to allocate more
                    uint256 _allocate = _target.sub(_current);
                    IPoolTemplate(poolList[i]).allocateCredit(_allocate);
                    totalAllocatedCredit = totalAllocatedCredit.add(_allocate);
                }
                if (_current == _target) {
                    IPoolTemplate(poolList[i]).allocateCredit(0);
                }
            }
        }
    }

    /**
     * Insurance interactions
     */

    /**
     * @notice Make a payout if an accident occured in a underlying pool
     * We compensate underlying pools by the following steps
     * 1) Compensate underlying pools from the liquidtiy of this pool
     * 2) If this pool is unable to cover a compesation, compensate from the CDS pool
     */
    function compensate(uint256 _amount) external {
        require(
            allocPoints[msg.sender] > 0,
            "ERROR_COMPENSATE_UNAUTHORIZED_CALLER"
        );
        if (vault.underlyingValue(address(this)) >= _amount) {
            //When the deposited value without earned premium is enough to cover
            vault.transferValue(_amount, msg.sender);
        } else {
            //When the deposited value without earned premium is *NOT* enough to cover
            //Withdraw credit to cashout the earnings
            for (uint256 i = 0; i < poolList.length; i++) {
                IPoolTemplate(poolList[i]).allocateCredit(0);
            }
            if (totalLiquidity() < _amount) {
                //Insolvency case
                uint256 _shortage = _amount.sub(totalLiquidity());
                ICDS(registry.getCDS(address(this))).compensate(_shortage);
            }

            vault.transferValue(_amount, msg.sender);
        }
        adjustAlloc();
        emit Compensated(msg.sender, _amount);
    }

    /**
     * Reporting interactions
     */

    /**
     * @notice Resume market
     */
    function resume() external {
        require(pendingEnd <= block.timestamp);
        locked = false;
        emit Resumed();
    }

    /**
     * @notice lock market withdrawal
     * @param _pending pending span length in unix timestamp
     */
    function lock(uint256 _pending) external {
        require(allocPoints[msg.sender] > 0);
        uint256 _tempEnd = block.timestamp.add(_pending);
        if (pendingEnd < _tempEnd) {
            pendingEnd = block.timestamp.add(_pending);
        }
        locked = true;
        emit Locked();
    }

    /**
     * iToken functions
     */

    /**
     * @notice See `IERC20.totalSupply`.
     */
    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice See `IERC20.balanceOf`.
     */
    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice See `IERC20.transfer`.
     */
    function transfer(address recipient, uint256 amount)
        public
        override
        returns (bool)
    {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    /**
     * @notice See `IERC20.allowance`.
     */
    function allowance(address owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    /**
     * @notice See `IERC20.approve`.
     */
    function approve(address spender, uint256 value)
        public
        override
        returns (bool)
    {
        _approve(msg.sender, spender, value);
        return true;
    }

    /**
     * @notice See `IERC20.transferFrom`.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            msg.sender,
            _allowances[sender][msg.sender].sub(amount)
        );
        return true;
    }

    /**
     * @notice Atomically increases the allowance granted to `spender` by the caller.
     */
    function increaseAllowance(address spender, uint256 addedValue)
        public
        returns (bool)
    {
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender].add(addedValue)
        );
        return true;
    }

    /**
     * @notice Atomically decreases the allowance granted to `spender` by the caller.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        returns (bool)
    {
        require(
            _allowances[msg.sender][spender] >= subtractedValue,
            "ERC20: decreased allowance below zero"
        );
        _approve(
            msg.sender,
            spender,
            _allowances[msg.sender][spender].sub(subtractedValue)
        );
        return true;
    }

    /**
     * @notice Moves tokens `amount` from `sender` to `recipient`.
     */
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        require(
            sender != address(0) && recipient != address(0),
            "ERC20: TRANSFER_BAD_CONDITIONS"
        );
        require(
            _balances[sender] >= amount,
            "ERC20: transfer amount exceeds balance"
        );
        _beforeTokenTransfer(sender, amount);

        _balances[sender] = _balances[sender].sub(amount);
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    /**
     * @notice Creates `amount` tokens and assigns them to `account`, increasing
     */
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: mint to the zero address");

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    /**
     * @notice Destoys `amount` tokens from `account`, reducing the
     */
    function _burn(address account, uint256 value) internal {
        require(account != address(0), "ERC20: burn from the zero address");

        _totalSupply = _totalSupply.sub(value);
        _balances[account] = _balances[account].sub(value);
        emit Transfer(account, address(0), value);
    }

    /**
     * @notice Sets `amount` as the allowance of `spender` over the `owner`s tokens.
     */
    function _approve(
        address _owner,
        address _spender,
        uint256 _value
    ) internal {
        require(
            _owner != address(0) && _spender != address(0),
            "ERC20: APPROVE_BAD_CONDITIONS"
        );

        _allowances[_owner][_spender] = _value;
        emit Approval(_owner, _spender, _value);
    }

    /**
     * Utilities
     */

    /**
     * @notice get the current leverage rate 1e3x
     * @return _rate leverage rate
     */
    function leverage() public view returns (uint256 _rate) {
        //check current leverage rate
        if (totalLiquidity() > 0) {
            return
                totalAllocatedCredit.mul(LEVERAGE_DIVISOR).div(
                    totalLiquidity()
                );
        } else {
            return 0;
        }
    }

    /**
     * @notice total Liquidity of the pool (how much can the pool sell cover)
     * @return _balance total liquidity of the pool
     */
    function totalLiquidity() public view returns (uint256 _balance) {
        return vault.underlyingValue(address(this)).add(_accruedPremiums());
    }

    /**
     * @notice Get the exchange rate of LP token against underlying asset(scaled by 1e18)
     * @return The value against the underlying token balance.
     */
    function rate() external view returns (uint256) {
        if (_totalSupply > 0) {
            return totalLiquidity().mul(1e18).div(_totalSupply);
        } else {
            return 0;
        }
    }

    /**
     * @notice Get the underlying balance of the `owner`
     * @param _owner the target address to look up value
     * @return The balance of underlying token for the specified address
     */
    function valueOfUnderlying(address _owner) public view returns (uint256) {
        uint256 _balance = balanceOf(_owner);
        if (_balance == 0) {
            return 0;
        } else {
            return _balance.mul(totalLiquidity()).div(totalSupply());
        }
    }

    /**
     * @notice Get all underlying pools
     * @return pool array
     */
    function getAllPools() external view returns (address[] memory) {
        return poolList;
    }

    /**
     * Admin functions
     */

    /**
     * @notice Used for changing settlementFeeRecipient
     * @param _state true to set paused and vice versa
     */
    function setPaused(bool _state) external onlyOwner {
        if (paused != _state) {
            paused = _state;
            emit Paused(_state);
        }
    }

    /**
     * @notice Change metadata string
     * @param _metadata new metadata string
     */
    function changeMetadata(string calldata _metadata) external onlyOwner {
        metadata = _metadata;
        emit MetadataChanged(_metadata);
    }

    /**
     * @notice Change target leverate rate for this index x 1e3
     * @param _target new leverage rate
     */
    function setLeverage(uint256 _target) external onlyOwner {
        targetLev = _target;
        adjustAlloc();
        emit LeverageSet(_target);
    }

    /**
     * @notice Change allocation point for each pool
     * @param _index target id of the underlying pool
     * @param _pool address of pool
     * @param _allocPoint new allocation point
     */
    function set(
        uint256 _index,
        address _pool,
        uint256 _allocPoint
    ) public onlyOwner {
        require(registry.isListed(_pool), "ERROR:UNREGISTERED_POOL");
        require(
            _index <= parameters.getMaxList(address(this)),
            "ERROR: EXCEEEDED_MAX_INDEX"
        );
        //create a new pool or replace existing
        if (poolList.length <= _index) {
            require(poolList.length == _index, "ERROR: BAD_INDEX");
            poolList.push(_pool);
        } else {
            if (poolList[_index] != address(0) && poolList[_index] != _pool) {
                uint256 _current = IPoolTemplate(poolList[_index])
                    .allocatedCredit(address(this));
                IPoolTemplate(poolList[_index]).withdrawCredit(_current);
            }
            poolList[_index] = _pool;
        }
        if (totalAllocPoint > 0) {
            totalAllocPoint = totalAllocPoint.sub(allocPoints[_pool]).add(
                _allocPoint
            );
        } else {
            totalAllocPoint = _allocPoint;
        }
        allocPoints[_pool] = _allocPoint;
        adjustAlloc();
        emit AllocationSet(_index, _pool, _allocPoint);
    }

    /**
     * Internal functions
     */

    /**
     * @notice Internal function to offset withdraw request and latest balance
     * @param _from the account who send
     * @param _amount the amount of token to offset
     */
    function _beforeTokenTransfer(address _from, uint256 _amount) internal {
        //withdraw request operation
        uint256 _after = balanceOf(_from).sub(_amount);
        if (_after < withdrawalReq[_from].amount) {
            withdrawalReq[_from].amount = _after;
        }
    }

    /**
     * @notice Get the total equivalent value of credit to token
     * @return _totalValue accrued but yet claimed premium within underlying pools
     */
    function _accruedPremiums() internal view returns (uint256 _totalValue) {
        for (uint256 i = 0; i < poolList.length; i++) {
            if (allocPoints[poolList[i]] > 0) {
                _totalValue = _totalValue.add(
                    IPoolTemplate(poolList[i]).pendingPremium(address(this))
                );
            }
        }
    }
}
