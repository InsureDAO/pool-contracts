pragma solidity 0.8.12;

/**
 * @author InsureDAO
 * @title Index Pool Template
 * SPDX-License-Identifier: GPL-3.0
 */

import "./InsureDAOERC20.sol";
import "../interfaces/IIndexTemplate.sol";
import "../interfaces/IUniversalPool.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IRegistry.sol";
import "../interfaces/IParameters.sol";
import "../interfaces/IMarketTemplate.sol";
import "../interfaces/IReserveTemplate.sol";

/**
 * An index pool can index a certain number of markets with leverage.
 *
 * Index A
 * 　├ Market A
 * 　├ Market B
 * 　├ Market C
 * 　...
 *
 */

contract IndexTemplate is InsureDAOERC20, IIndexTemplate, IUniversalPool {
    event Deposit(address indexed depositor, uint256 amount, uint256 mint);
    event WithdrawRequested(address indexed withdrawer, uint256 amount, uint256 unlockTime);
    event Withdraw(address indexed withdrawer, uint256 amount, uint256 retVal);
    event Compensated(address indexed index, uint256 amount);
    event Paused(bool paused);
    event Resumed();
    event Locked();
    event MetadataChanged(string metadata);
    event LeverageSet(uint256 target);
    event newAllocation(address market, uint256 allocPoints);

    /// @notice Pool setting
    bool public initialized;
    bool public paused;
    bool public locked;
    string public metadata;

    /// @notice External contract call addresses
    IParameters public parameters;
    IVault public vault;
    IRegistry public registry;

    /// @notice Market variables for margin account
    uint256 public totalAllocatedCredit;
    mapping(address => uint256) public allocPoints;
    uint256 public totalAllocPoint;
    address[] public marketList;
    uint256 public targetLev; //1e6 = x1
    /**
     * @notice
     * The allocated credits are deemed as liquidity in each underlying market
     * Credit amount(liquidity) will be determined by the following math
     * credit for a market = total liquidity of this pool * leverage rate * allocation point for a market / total allocation point
     */

    ///@notice user status management
    struct Withdrawal {
        uint64 timestamp;
        uint192 amount;
    }
    mapping(address => Withdrawal) public withdrawalReq;

    struct MarketStatus {
        uint256 current;
        uint256 available;
        uint256 allocation;
        uint256 shortage;
        uint256 _freeableCredits;
        address addr;
    }

    ///@notice magic numbers
    uint256 private constant MAGIC_SCALE_1E6 = 1e6; //internal multiplication scale 1e6 to reduce decimal truncation

    modifier onlyOwner() {
        require(msg.sender == parameters.getOwner(), "Caller is not allowed to operate");
        _;
    }

    constructor() {
        initialized = true;
    }

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
    ) external {
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
     * @notice Supply coverage to this pool and receive LP token.
     * @param _amount amount of token to deposit
     * @return _mintAmount the amount of LP token minted
     */
    function deposit(uint256 _amount) external returns (uint256 _mintAmount) {
        require(!locked, "ERROR: LOCKED");
        require(!paused, "ERROR: PAUSED");
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
        uint256 _leverage = (totalAllocatedCredit * MAGIC_SCALE_1E6) / _liquidityAfter;
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

        uint64 _unlocksAt = (uint64)(block.timestamp + parameters.getRequestDuration(address(this)));

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

        require(request.timestamp < block.timestamp, "ERROR: WITHDRAWAL_QUEUE");
        require(
            request.timestamp + parameters.getWithdrawableDuration(address(this)) > block.timestamp,
            "WITHDRAWAL_NO_ACTIVE_REQUEST"
        );
        require(request.amount >= _amount, "WITHDRAWAL_EXCEEDED_REQUEST");

        //Calculate underlying value
        uint256 _liquidty = totalLiquidity();
        _retVal = (_liquidty * _amount) / totalSupply();
        require(_retVal <= withdrawable(), "WITHDRAW_INSUFFICIENT_LIQUIDITY");

        //reduce requested amount
        withdrawalReq[msg.sender].amount -= (uint192)(_amount);
        //Burn iToken
        _burn(msg.sender, _amount);

        //Check current leverage rate and get updated target total credit allocation
        uint256 _liquidityAfter = _liquidty - _retVal;

        if (_liquidityAfter != 0) {
            uint256 _leverage = (totalAllocatedCredit * MAGIC_SCALE_1E6) / _liquidityAfter;
            //execute adjustAlloc only when the leverage became above target + upper-slack
            if (targetLev + parameters.getUpperSlack(address(this)) < _leverage) {
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
     * we should also reserve 100% the lockedCredits for the market with most locked
     * @return withdrawable amount
     */
    function withdrawable() public view returns (uint256) {
        uint256 _totalLiquidity = totalLiquidity();

        if (_totalLiquidity == 0) return 0;

        uint256 _length = marketList.length;
        uint256 _totalLockedCredits;
        uint256 _maxLockedCredits;

        for (uint256 i; i < _length; ) {
            (uint256 _allocated, uint256 _available) = IMarketTemplate(marketList[i]).pairValues(address(this));
            if (_allocated > _available) {
                uint256 _locked = _allocated - _available;
                _totalLockedCredits += _locked;
                if (_locked > _maxLockedCredits) {
                    _maxLockedCredits = _locked;
                }
            }

            unchecked {
                ++i;
            }
        }

        if (_totalLockedCredits == 0) {
            return _totalLiquidity;
        }

        uint256 _necessaryAmount = (_totalLockedCredits * MAGIC_SCALE_1E6) / targetLev;
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
    function adjustAlloc() external {
        _adjustAlloc();
    }

    function _adjustAlloc() internal {
        _adjustAlloc(totalLiquidity());
    }

    /**
     * @notice adjust credit allocation
     * @param _liquidity available liquidity of the index.
     * @dev credit adjustment is done based on _liquidity and targetLeverage
     *
     * 1) calculate goal amount of totalCredits
     * 2) perform calculation for un-usual markets (get _totalFreeableCredits)
     * 3) if _targetTotalCredits <= (_totalAllocatedCredit - _totalFreeableCredits), go with withdraw-only mode
     * 4) else allocate the allocatable credits to the markets proportionally to the shortage of each market
     */
    function _adjustAlloc(uint256 _liquidity) internal {
        uint256 _targetTotalCredits = (targetLev * _liquidity) / MAGIC_SCALE_1E6;

        uint256 _allocatablePoints = totalAllocPoint;
        uint256 _totalAllocatedCredit = totalAllocatedCredit;
        uint256 _marketLength = marketList.length;

        uint256 _totalFreeableCredits;
        uint256 _totalFrozenCredits;

        MarketStatus[] memory _markets = new MarketStatus[](_marketLength);

        for (uint256 i; i < _marketLength; ) {
            address _marketAddr = marketList[i];
            uint256 _current;
            uint256 _available;
            (_current, _available) = IMarketTemplate(_marketAddr).pairValues(address(this));
            uint256 _allocation = allocPoints[_marketAddr];

            uint256 _freeableCredits = (_available > _current ? _current : _available);
            if (IMarketTemplate(_marketAddr).marketStatus() == IMarketTemplate.MarketStatus.Payingout) {
                _allocatablePoints -= _allocation;
                _allocation = 0;
                _freeableCredits = 0;
                _totalFrozenCredits += _current;
            } else if (_allocation == 0 || IMarketTemplate(_marketAddr).paused()) {
                _allocatablePoints -= _allocation;
                _allocation = 0;
                IMarketTemplate(_marketAddr).withdrawCredit(_freeableCredits);
                _totalAllocatedCredit -= _freeableCredits;
                _current -= _freeableCredits;
                _freeableCredits = 0;
                _totalFrozenCredits += _current;
            }

            _totalFreeableCredits += _freeableCredits;

            _markets[i].addr = _marketAddr;
            _markets[i].current = _current;
            _markets[i].available = _available;
            _markets[i]._freeableCredits = _freeableCredits;
            _markets[i].allocation = _allocation;

            unchecked {
                ++i;
            }
        }

        if (_targetTotalCredits <= _totalFrozenCredits) {
            _targetTotalCredits = 0;
        } else {
            _targetTotalCredits -= _totalFrozenCredits;
        }
        uint256 _totalFixedCredits = _totalAllocatedCredit - _totalFreeableCredits - _totalFrozenCredits;
        // if target credit is less than _totalFixedCredits, we go withdraw-only mode
        if (_totalFixedCredits >= _targetTotalCredits) {
            for (uint256 i; i < _marketLength; ) {
                if (_markets[i]._freeableCredits > 0) {
                    IMarketTemplate(_markets[i].addr).withdrawCredit(_markets[i]._freeableCredits);
                }
                unchecked {
                    ++i;
                }
            }
            totalAllocatedCredit = _totalAllocatedCredit - _totalFreeableCredits;
        } else {
            uint256 _totalAllocatableCredits = _targetTotalCredits - _totalFixedCredits;
            uint256 _totalShortage;

            for (uint256 i; i < _marketLength; ++i) {
                if (_markets[i].allocation == 0) continue;
                uint256 _target = (_targetTotalCredits * _markets[i].allocation) / _allocatablePoints;
                uint256 _fixedCredits = _markets[i].current - _markets[i]._freeableCredits;
                // when _fixedCredits > target, we should withdraw all freeable credits
                if (_fixedCredits > _target) {
                    IMarketTemplate(_markets[i].addr).withdrawCredit(_markets[i]._freeableCredits);
                    _totalAllocatedCredit -= _markets[i]._freeableCredits;
                } else {
                    uint256 _shortage = _target - _fixedCredits;
                    _totalShortage += _shortage;
                    _markets[i].shortage = _shortage;
                }
            }

            for (uint256 i; i < _marketLength; ++i) {
                if (_markets[i].shortage == 0) continue;
                uint256 _reallocate = (_totalAllocatableCredits * _markets[i].shortage) / _totalShortage;
                // when _reallocate >= _freeableCredits, we deposit
                if (_reallocate >= _markets[i]._freeableCredits) {
                    // _freeableCredits is part of the `_reallocate`
                    uint256 _allocate = _reallocate - _markets[i]._freeableCredits;
                    IMarketTemplate(_markets[i].addr).allocateCredit(_allocate);
                    _totalAllocatedCredit += _allocate;
                } else {
                    uint256 _removal = _markets[i]._freeableCredits - _reallocate;
                    IMarketTemplate(_markets[i].addr).withdrawCredit(_removal);
                    _totalAllocatedCredit -= _removal;
                }
            }

            totalAllocatedCredit = _totalAllocatedCredit;
        }
    }

    /**
     * @notice Make a payout to underlying market
     * @param _amount amount of liquidity to compensate for the called market
     * We compensate underlying markets by the following steps
     * 1) Compensate underlying markets from the liquidity of this pool
     * 2) If this pool is unable to cover a compensation, can get compensated from the Reserve pool
     */
    function compensate(uint256 _amount) external returns (uint256 _compensated) {
        require(allocPoints[msg.sender] != 0, "COMPENSATE_UNAUTHORIZED_CALLER");

        uint256 _value = vault.underlyingValue(address(this));
        if (_value >= _amount) {
            //When the deposited value without earned premium is enough to cover
            _compensated = _amount;
        } else {
            //Withdraw credit to cashout the earnings
            unchecked {
                IReserveTemplate(registry.getReserve(address(this))).compensate(_amount - _value);
            }
            _compensated = vault.underlyingValue(address(this));
        }

        vault.offsetDebt(_compensated, msg.sender);

        // totalLiquity has been changed, adjustAlloc() will be called by the market contract

        emit Compensated(msg.sender, _compensated);
    }

    /**
     * @notice Resume market
     */
    function resume() external {
        require(locked, "ERROR: MARKET_IS_NOT_LOCKED");
        uint256 _marketLength = marketList.length;

        for (uint256 i; i < _marketLength; ) {
            require(
                IMarketTemplate(marketList[i]).marketStatus() == IMarketTemplate.MarketStatus.Trading,
                "ERROR: MARKET_IS_PAYINGOUT"
            );
            unchecked {
                ++i;
            }
        }
        _adjustAlloc();
        locked = false;
        emit Resumed();
    }

    /**
     * @notice lock market withdrawal
     */
    function lock() external {
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
     * @notice Return total Liquidity of this pool (how much can the pool sell cover)
     * @return liquidity of this pool
     */
    function totalLiquidity() public view returns (uint256) {
        return vault.underlyingValue(address(this)) + _accruedPremiums();
    }

    function accruedPremiums() external view returns (uint256) {
        return _accruedPremiums();
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
     * @notice Get all indexed markets
     * @return market array
     */
    function getAllMarkets() external view returns (address[] memory) {
        return marketList;
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
     * @notice Change target leverate rate for this index x 1e6
     * @param _target new leverage rate
     */
    function setLeverage(uint256 _target) external onlyOwner {
        require(_target >= MAGIC_SCALE_1E6, "leverage must be x1 or higher");
        targetLev = _target;
        _adjustAlloc();
        emit LeverageSet(_target);
    }

    /**
     * @notice Incorporate market into this index pool. That market gains capacity for additional insurance sales.
     * @param _marketListIndex array's index to add, remove, or update.
     * @param _market address of a market. Set address(0) when removing market.
     * @param _allocPoint allocation point of the _market. Use 1e18 as default.
     *
     * @dev if branches are based on following purposes.
     * A. add new market (latest _marketListIndex, new market)
     * B. update allocPoint (exist _marketListIndex. same market as _marketListIndex)
     * C. remove market (exist _marketListIndex. market is address(0) )
     * D. overwrite market (exist _marketListIndex. market is new)
     */
    function set(uint256 _marketListIndex, address _market, uint256 _allocPoint) external onlyOwner {
        require(_marketListIndex <= parameters.getMaxList(address(this)), "ERROR: EXCEEEDED_MAX_INDEX");

        uint256 _marketLength = marketList.length;

        if (_marketListIndex >= _marketLength) {
            //register new market
            require(_marketListIndex == _marketLength, "NOT_NEXT_SLOT");
            _addMarket(_market, _allocPoint);
        } else {
            //update/remove/overwrite a registered market
            address _currentMarket = marketList[_marketListIndex];
            require(_currentMarket != address(0), "_currentMarket is address(0)"); //this should never happen

            if (_market == _currentMarket) {
                _updateAllocPoint(_currentMarket, _allocPoint);
            } else if (_market == address(0)) {
                _removeMarket(_currentMarket, _marketListIndex);
            } else {
                _removeMarket(_currentMarket, _marketListIndex);
                _addMarket(_market, _allocPoint);
            }
        }

        _adjustAlloc();
    }

    //update allocPoint ver.
    function set(uint256 _marketListIndex, uint256 _allocPoint) public onlyOwner {
        address _currentMarket = marketList[_marketListIndex];
        _updateAllocPoint(_currentMarket, _allocPoint);
        _adjustAlloc();
    }

    /**
     * @notice update allocPoint.
     * @param _market address of a market. Set address(0) when removing market.
     * @param _allocPoint allocation point of the _market. Use 1e18 as default.
     */
    function _updateAllocPoint(address _market, uint256 _allocPoint) internal {
        totalAllocPoint -= allocPoints[_market];
        totalAllocPoint += _allocPoint;
        allocPoints[_market] = _allocPoint;

        emit newAllocation(_market, _allocPoint);
    }

    /**
     * @notice register new market
     * @param _market address of a market.
     * @param _allocPoint allocation point of the _market. Use 1e18 as default.
     */
    function _addMarket(address _market, uint256 _allocPoint) internal {
        require(registry.isListed(_market), "ERROR:UNLISTED_POOL");

        //register
        IMarketTemplate(_market).registerIndex();

        marketList.push(_market);

        //update allocPoint
        totalAllocPoint += _allocPoint;
        allocPoints[_market] = _allocPoint;

        emit newAllocation(_market, _allocPoint);
    }

    /**
     * @notice remove registered market
     * @param _market address of a market.
     * @param _marketListIndex array's index to remove.
     */
    function _removeMarket(address _market, uint256 _marketListIndex) internal {
        //adjustAlloc has to be done first before removing market from marketList to remove credits from the removing market.
        totalAllocPoint -= allocPoints[_market];
        allocPoints[_market] = 0;
        _adjustAlloc();

        //unregister
        IMarketTemplate(_market).unregisterIndex();

        uint256 _latestArrayIndex = marketList.length - 1;
        if (_latestArrayIndex != 0) {
            marketList[_marketListIndex] = marketList[_latestArrayIndex];
        }
        marketList.pop();

        emit newAllocation(_market, 0);
    }

    /**
     * @notice Internal function to offset withdraw request and latest balance
     * @param from the account who send
     * @param to a
     * @param amount the amount of token to offset
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
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
     * @return _totalValue accrued but yet claimed premium within underlying markets
     */
    function _accruedPremiums() internal view returns (uint256 _totalValue) {
        uint256 _marketLength = marketList.length;
        for (uint256 i; i < _marketLength; ) {
            if (allocPoints[marketList[i]] != 0) {
                _totalValue = _totalValue + IMarketTemplate(marketList[i]).pendingPremium(address(this));
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
        if (_a >= _b) {
            _result = _a - _b;
        } else {
            _result = 0;
        }
    }
}
