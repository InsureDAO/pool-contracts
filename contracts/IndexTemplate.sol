pragma solidity 0.8.10;
/**
 * @author InsureDAO
 * @title InsureDAO market template contract
 * SPDX-License-Identifier: GPL-3.0
 */

import "./InsureDAOERC20.sol";
import "./interfaces/IIndexTemplate.sol";
import "./interfaces/IUniversalMarket.sol";

import "./interfaces/IVault.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/IParameters.sol";
import "./interfaces/IPoolTemplate.sol";
import "./interfaces/ICDSTemplate.sol";

/**
 * An index pool can index a certain number of pools with leverage.
 *
 * Index A
 * 　├ Pool A
 * 　├ Pool B
 * 　├ Pool C
 * 　...
 *
 */

contract IndexTemplate is InsureDAOERC20, IIndexTemplate, IUniversalMarket {
    /**
     * EVENTS
     */
    event Deposit(address indexed depositor, uint256 amount, uint256 mint);
    event WithdrawRequested(
        address indexed withdrawer,
        uint256 amount,
        uint256 unlockTime
    );
    event Withdraw(address indexed withdrawer, uint256 amount, uint256 retVal);
    event Compensated(address indexed index, uint256 amount);
    event Paused(bool paused);
    event Resumed();
    event Locked();
    event MetadataChanged(string metadata);
    event LeverageSet(uint256 target);
    event AllocationSet(
        uint256 indexed _indexA,
        uint256 indexed _indexB,
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
    string public metadata;

    /// @notice External contract call addresses
    IParameters public parameters;
    IVault public vault;
    IRegistry public registry;

    /// @notice Market variables for margin account
    uint256 public totalAllocatedCredit; //total allocated credit(liquidity)
    mapping(address => uint256) public allocPoints; //allocation point for each pool
    uint256 public totalAllocPoint; //total allocation point
    address[] public poolList; //list of all pools
    uint256 public targetLev; //1x = MAGIC_SCALE_1E6
    //The allocated credits are deemed as liquidity in each underlying pool
    //Credit amount(liquidity) will be determined by the following math
    //credit for a pool = total liquidity of this pool * leverage rate * allocation point for a pool / total allocation point

    ///@notice user status management
    struct Withdrawal {
        uint64 timestamp;
        uint192 amount;
    }
    mapping(address => Withdrawal) public withdrawalReq;

    struct PoolStatus {
        uint256 current;
        uint256 available;
        uint256 allocation;
        address addr;
    }

    ///@notice magic numbers
    uint256 private constant MAGIC_SCALE_1E6 = 1e6; //internal multiplication scale 1e6 to reduce decimal truncation

    /**
     * @notice Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(
            msg.sender == parameters.getOwner(),
            "Caller is not allowed to operate"
        );
        _;
    }

    constructor() {
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
        address _depositor,
        string calldata _metaData,
        uint256[] calldata _conditions,
        address[] calldata _references
    ) external override {
        require(
            !initialized &&
                bytes(_metaData).length != 0 &&
                _references[0] != address(0) &&
                _references[1] != address(0) &&
                _references[2] != address(0),
            "INITIALIZATION_BAD_CONDITIONS"
        );

        initialized = true;

        string memory _name = "InsureDAO-Index";
        string memory _symbol = "iIndex";
        uint8 _decimals = IERC20Metadata(_references[0]).decimals();

        initializeToken(_name, _symbol, _decimals);

        parameters = IParameters(_references[2]);
        vault = IVault(parameters.getVault(_references[0]));
        registry = IRegistry(_references[1]);

        metadata = _metaData;
    }

    /**
     * Pool interactions
     */

    /**
     * @notice A liquidity provider supplies collateral to the pool and receives iTokens
     * @param _amount amount of token to deposit
     * @return _mintAmount the amount of iToken minted from the transaction
     */
    function deposit(uint256 _amount) external returns (uint256 _mintAmount) {
        require(!locked && !paused, "ERROR: DEPOSIT_DISABLED");
        require(_amount != 0, "ERROR: DEPOSIT_ZERO");

        uint256 _supply = totalSupply();
        uint256 _totalLiquidity = totalLiquidity();
        vault.addValue(_amount, msg.sender, address(this));

        if (_supply == 0) {
            _mintAmount = _amount;
        } else if (_totalLiquidity == 0) {
            _mintAmount = _amount * _supply;
        } else {
            _mintAmount = (_amount * _supply) / _totalLiquidity;
        }
        
        emit Deposit(msg.sender, _amount, _mintAmount);
        //mint iToken
        _mint(msg.sender, _mintAmount);
        uint256 _liquidityAfter = _totalLiquidity + _amount;
        uint256 _leverage = (totalAllocatedCredit * MAGIC_SCALE_1E6) /
            _liquidityAfter;
        //execut adjustAlloc only when the leverage became below target - lower-slack
        if (targetLev - parameters.getLowerSlack(address(this)) > _leverage) {
            _adjustAlloc(_liquidityAfter);
        }
    }

    /**
     * @notice A liquidity provider requests withdrawal of collateral
     * @param _amount amount of iToken to burn
     */
    function requestWithdraw(uint256 _amount) external {
        require(_amount != 0, "ERROR: REQUEST_ZERO");
        require(balanceOf(msg.sender) >= _amount, "ERROR: REQUEST_EXCEED_BALANCE");
        
        uint64 _unlocksAt = (uint64)(block.timestamp + parameters.getLockup(address(this)));

        withdrawalReq[msg.sender].timestamp = _unlocksAt;
        withdrawalReq[msg.sender].amount = (uint192)(_amount);
        
        emit WithdrawRequested(msg.sender, _amount, _unlocksAt);
    }

    /**
     * @notice A liquidity provider burns iToken and receives collateral from the pool
     * @param _amount amount of iToken to burn
     * @return _retVal the amount underlying token returned
     */
    function withdraw(uint256 _amount) external returns (uint256 _retVal) {
        require(_amount != 0, "ERROR: WITHDRAWAL_ZERO");
        require(!locked, "ERROR: WITHDRAWAL_MARKET_PAUSED");

        Withdrawal memory request = withdrawalReq[msg.sender];
        
        require(
            request.timestamp < block.timestamp,
            "ERROR: WITHDRAWAL_QUEUE"
        );
        require(
            request.timestamp + parameters.getWithdrawable(address(this)) >
                block.timestamp,
            "WITHDRAWAL_NO_ACTIVE_REQUEST"
        );
        require(
            request.amount >= _amount,
            "WITHDRAWAL_EXCEEDED_REQUEST"
        );

        //Calculate underlying value
        uint256 _liquidty = totalLiquidity();
        _retVal = (_liquidty * _amount) / totalSupply();
        require(
            _retVal <= withdrawable(),
            "WITHDRAW_INSUFFICIENT_LIQUIDITY"
        );

        //reduce requested amount
        withdrawalReq[msg.sender].amount -= (uint192)(_amount);
        //Burn iToken
        _burn(msg.sender, _amount);

        //Check current leverage rate and get updated target total credit allocation
        uint256 _liquidityAfter = _liquidty - _retVal;

        if (_liquidityAfter != 0) {
            uint256 _leverage = (totalAllocatedCredit * MAGIC_SCALE_1E6) /
                _liquidityAfter;
            //execute adjustAlloc only when the leverage became above target + upper-slack
            if (
                targetLev + parameters.getUpperSlack(address(this)) < _leverage
            ) {
                _adjustAlloc(_liquidityAfter);
            }
        } else {
            _adjustAlloc(0);
        }

        //Withdraw liquidity
        vault.withdrawValue(_retVal, msg.sender);

        emit Withdraw(msg.sender, _amount, _retVal);
    }

    /**
     * @notice Get how much can be withdrawn from this index by users
     * Withdrawable amount = Index liquidity - necessary amount to support credit liquidity
     * necessary amount = totalLockedCredits / leverageRate
     * eg. if leverageRate = 2, then necessary amount = totalLockedCredits / 2
     * we should also reserve 100% the lockedCredits for the pool with most locked
     * @return withdrawable amount
     */
    function withdrawable() public view returns (uint256) {
        uint256 _totalLiquidity = totalLiquidity();

        if (_totalLiquidity == 0) return 0;

        uint256 _length = poolList.length;
        uint256 _totalLockedCredits;
        uint256 _maxLockedCredits;

        for (uint256 i; i < _length; ++i) {
            (uint256 _allocated, uint256 _available) = IPoolTemplate(poolList[i]).pairValues(address(this));
            if (_allocated > _available) {
                uint _locked = _allocated - _available;
                _totalLockedCredits += _locked;
                if (_locked > _maxLockedCredits) {
                    _maxLockedCredits = _locked;
                }
            }
        }

        if (_totalLockedCredits == 0) {
            return _totalLiquidity;
        } 

        uint256 _necessaryAmount = _totalLockedCredits * MAGIC_SCALE_1E6 / targetLev;
        if (_maxLockedCredits > _necessaryAmount) {
            _necessaryAmount = _maxLockedCredits;
        }
        if (_necessaryAmount < _totalLiquidity) {
            unchecked {
                return _totalLiquidity - _necessaryAmount;
            }
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
     * @param _liquidity available liquidity of the index
     * Allocation adjustment of credit is done by the following steps
     * 1)Check total allocatable balance of the index
     * 2)Calculate ideal allocation for each pool
     * 3)Check Current allocated balance for each pool
     * 4)Adjust (withdraw/deposit) allocation for each Pool*
     *
     * Liquidity in pool may be locked and cannot withdraw. In that case, the index try to withdraw all available liquidity first,
     * then recalculated available balance and iterate 1)~4) for the remaining.
     *
     * The index may allocate credit beyond the share settings to maintain the leverage rate not to surpass the leverage setting.
     *
     * Along with adjustment the index clears accrued premiums in underlying pools to this pool during allocation.
     */
    function _adjustAlloc(uint256 _liquidity) internal {
        //Check current leverage rate and get target total credit allocation
        uint256 _targetCredit = (targetLev * _liquidity) / MAGIC_SCALE_1E6;
        uint256 _allocatable = _targetCredit;
        uint256 _allocatablePoints = totalAllocPoint;
        uint256 _totalAllocatedCredit = totalAllocatedCredit;
        uint256 _length = poolList.length;
        PoolStatus[] memory _poolList = new PoolStatus[](_length);
        //Check each pool and if current credit allocation > target && it is impossible to adjust, then withdraw all availablle credit
        for (uint256 i; i < _length;) {
            address _pool = poolList[i];
            if (_pool != address(0)) {
                uint256 _allocation = allocPoints[_pool];
                //Target credit allocation for a pool
                uint256 _target = (_targetCredit * _allocation) /
                    _allocatablePoints;
                //get how much has been allocated for a pool and get how much liquidty is available to withdraw
                uint256 _current;
                uint256 _available;
                (_current, _available) = IPoolTemplate(_pool).pairValues(address(this));
                //if needed to withdraw credit but unable, then withdraw all available.
                //Otherwise, skip.
                if(
                    IPoolTemplate(_pool).marketStatus() == IPoolTemplate.MarketStatus.Payingout
                ){
                    totalAllocatedCredit -= _current;
                    _poolList[i].addr = address(0);
                    _allocatable = _safeMinus(_allocatable, _current);
                    _allocatablePoints -= _allocation;
                } else if (
                    _current > _target && _current - _target > _available
                ) {
                    IPoolTemplate(_pool).withdrawCredit(_available);
                    _totalAllocatedCredit -= _available;
                    _poolList[i].addr = address(0);
                    _allocatable -= _current - _available;
                    _allocatablePoints -= _allocation;
                } else if (
                    IPoolTemplate(_pool).paused()
                ) {
                    if(_current > _available){
                        IPoolTemplate(_pool).withdrawCredit(_available);
                        totalAllocatedCredit -= _available;
                        _poolList[i].addr = address(0);
                        _allocatable -= _safeMinus(_allocatable, _available);
                        _allocatablePoints -= _allocation;
                    } else {
                        IPoolTemplate(_pool).withdrawCredit(_current);
                        totalAllocatedCredit -= _current;
                        _poolList[i].addr = address(0);
                        _allocatable -= _safeMinus(_allocatable, _current);
                        _allocatablePoints -= _allocation;
                    }
                } else {
                    _poolList[i].addr = _pool;
                    _poolList[i].current = _current;
                    _poolList[i].available = _available;
                    _poolList[i].allocation = _allocation;
                }
            }
            unchecked {
                ++i;
            }
        }
        //Check pools that was not falling under the previous criteria, then adjust to meet the target credit allocation.
        for (uint256 i; i < _length;) {
            if (_poolList[i].addr != address(0)) {
                //Target credit allocation for a pool
                uint256 _target = (_allocatable * _poolList[i].allocation) /
                    _allocatablePoints;
                //get how much has been allocated for a pool
                uint256 _current = _poolList[i].current;
                //get how much liquidty is available to withdraw
                uint256 _available = _poolList[i].available;
                //Withdraw or Deposit credit

                if (_current == _target) {
                    IPoolTemplate(_poolList[i].addr).allocateCredit(0);
                } else if (_current < _target) {
                    //Sometimes we need to allocate more
                    uint256 _allocate;
                    unchecked {
                        _allocate = _target - _current;
                    }
                    IPoolTemplate(_poolList[i].addr).allocateCredit(_allocate);
                    _totalAllocatedCredit += _allocate;
                } else if (_current > _target && _available != 0) {
                    //if allocated credit is higher than the target, try to decrease
                    uint256 _decrease;
                    unchecked {
                        _decrease = _current - _target;
                    }
                    IPoolTemplate(_poolList[i].addr).withdrawCredit(_decrease);
                    _totalAllocatedCredit -= _decrease;
                }
            }
            unchecked {
                ++i;
            }
        }

        totalAllocatedCredit = _totalAllocatedCredit;
    }

    /**
     * Insurance interactions
     */

    /**
     * @notice Make a payout if an accident occured in a underlying pool
     * @param _amount amount of liquidity to compensate for the called pool
     * We compensate underlying pools by the following steps
     * 1) Compensate underlying pools from the liquidity of this pool
     * 2) If this pool is unable to cover a compensation, can get compensated from the CDS pool
     */
    function compensate(uint256 _amount)
        external
        override
        returns (uint256 _compensated)
    {
        require(
            allocPoints[msg.sender] != 0,
            "COMPENSATE_UNAUTHORIZED_CALLER"
        );
        uint256 _value = vault.underlyingValue(address(this));
        if (_value >= _amount) {
            //When the deposited value without earned premium is enough to cover
            _compensated = _amount;
        } else {
            //Withdraw credit to cashout the earnings
            unchecked {
                ICDSTemplate(registry.getCDS(address(this))).compensate(_amount - _value);
            }
            _compensated = vault.underlyingValue(address(this));
        }

        vault.offsetDebt(_compensated, msg.sender);
        
        //totalLiquity has been changed
        adjustAlloc();

        emit Compensated(msg.sender, _compensated);
    }

    /**
     * Reporting interactions
     */

    /**
     * @notice Resume market
     */
    function resume() external override {
        require(locked, "ERROR: MARKET_IS_NOT_LOCKED");
        uint256 _poolLength = poolList.length;

        for (uint256 i; i < _poolLength;) {
            require(
                IPoolTemplate(poolList[i]).marketStatus() == IPoolTemplate.MarketStatus.Trading,
                "ERROR: POOL_IS_PAYINGOUT"
            );
            unchecked {
                ++i;
            }
        }
        adjustAlloc();
        locked = false;
        emit Resumed();
    }

    /**
     * @notice lock market withdrawal
     */
    function lock() external override {
        require(allocPoints[msg.sender] != 0);

        locked = true;
        emit Locked();
    }

    /**
     * Utilities
     */

    /**
     * @notice get the current leverage rate 1e6x
     * @return leverage rate
     */

    function leverage() external view returns (uint256) {
        uint256 _totalLiquidity = totalLiquidity();
        //check current leverage rate
        if (_totalLiquidity != 0) {
            return (totalAllocatedCredit * MAGIC_SCALE_1E6) / _totalLiquidity;
        }
    }

    /**
     * @notice total Liquidity of the pool (how much can the pool sell cover)
     * @return total liquidity of the pool
     */
    function totalLiquidity() public view returns (uint256) {
        return vault.underlyingValue(address(this)) + _accruedPremiums();
    }

    /**
     * @notice Get the exchange rate of LP token against underlying asset(scaled by MAGIC_SCALE_1E6)
     * @return The value against the underlying token balance.
     */
    function rate() external view returns (uint256) {
        uint256 _totalSupply = totalSupply();
        if (_totalSupply != 0) {
            return (totalLiquidity() * MAGIC_SCALE_1E6) / _totalSupply;
        }
    }

    /**
     * @notice Get the underlying balance of the `owner`
     * @param _owner the target address to look up value
     * @return The balance of underlying token for the specified address
     */
    function valueOfUnderlying(address _owner) external view returns (uint256) {
        uint256 _balance = balanceOf(_owner);
        uint256 _totalSupply = totalSupply();
        if (_balance != 0 && _totalSupply != 0) {
            return (_balance * totalLiquidity()) / _totalSupply;
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
    function setPaused(bool _state) external override onlyOwner {
        if (paused != _state) {
            paused = _state;
            emit Paused(_state);
        }
    }

    /**
     * @notice Change metadata string
     * @param _metadata new metadata string
     */
    function changeMetadata(string calldata _metadata)
        external
        override
        onlyOwner
    {
        metadata = _metadata;
        emit MetadataChanged(_metadata);
    }

    /**
     * @notice Change target leverate rate for this index x 1e6
     * @param _target new leverage rate
     */
    function setLeverage(uint256 _target) external override onlyOwner {
        require(_target >= MAGIC_SCALE_1E6, "leverage must be x1 or higher");
        targetLev = _target;
        adjustAlloc();
        emit LeverageSet(_target);
    }

    /**
     * @notice Change allocation point for each pool
     * @param _indexA target index id of the underlying pool
     * @param _indexB target index id of the index address within the underlying pool
     * @param _pool address of pool
     * @param _allocPoint new allocation point
     */
    function set(
        uint256 _indexA,
        uint256 _indexB,
        address _pool,
        uint256 _allocPoint
    ) external override onlyOwner {
        require(registry.isListed(_pool), "ERROR:UNREGISTERED_POOL");
        require(
            _indexA <= parameters.getMaxList(address(this)),
            "ERROR: EXCEEEDED_MAX_INDEX"
        );
        uint256 _length = poolList.length;

        //create a new pool or replace existing
        if (_length <= _indexA) {
            require(_length == _indexA, "ERROR: BAD_INDEX");
            IPoolTemplate(_pool).registerIndex(_indexB);
            poolList.push(_pool);
        } else {
            //action for existing slot
            address _poolAddress = poolList[_indexA];
            if (_poolAddress != address(0) && _poolAddress != _pool) {
                uint256 _current;
                (_current, ) = IPoolTemplate(_poolAddress).pairValues(address(this));
                
                require(
                    IPoolTemplate(_poolAddress).marketStatus() == IPoolTemplate.MarketStatus.Trading &&
                    IPoolTemplate(_poolAddress).availableBalance() >= _current,
                    "ERROR: CANNOT_EXIT_POOL"
                );
                IPoolTemplate(_poolAddress).withdrawCredit(_current);
            }
            IPoolTemplate(_pool).registerIndex(_indexB);
            poolList[_indexA] = _pool;
        }

        uint256 _totalAllocPoint = totalAllocPoint;

        if (_totalAllocPoint != 0) {
            totalAllocPoint =
                _totalAllocPoint -
                allocPoints[_pool] +
                _allocPoint;
        } else {
            totalAllocPoint = _allocPoint;
        }
        allocPoints[_pool] = _allocPoint;
        adjustAlloc();
        emit AllocationSet(_indexA, _indexB, _pool, _allocPoint);
    }

    /**
     * Internal functions
     */

    /**
     * @notice Internal function to offset withdraw request and latest balance
     * @param from the account who send
     * @param to a
     * @param amount the amount of token to offset
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (from != address(0)) {
            uint256 _after = balanceOf(from) - amount;
            if (_after < withdrawalReq[from].amount) {
                withdrawalReq[from].amount = (uint192)(_after);
            }
        }
    }

    /**
     * @notice Get the total equivalent value of credit to token
     * @return _totalValue accrued but yet claimed premium within underlying pools
     */
    function _accruedPremiums() internal view returns (uint256 _totalValue) {

        uint256 poolLength = poolList.length;
        for (uint256 i; i < poolLength;) {
            if (allocPoints[poolList[i]] != 0) {
                _totalValue =
                    _totalValue +
                    IPoolTemplate(poolList[i]).pendingPremium(address(this));
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Overflow free minus function that returns zero
     * @return _result result of the subtraction operation
     */
    function _safeMinus(uint256 _a, uint256 _b) internal pure returns (uint256 _result) {
        if(_a >= _b){
            _result = _a - _b;
        }else{
            _result = 0;
        }
    }
    
}
