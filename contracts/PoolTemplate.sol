pragma solidity 0.8.10;

/**
 * @author InsureDAO
 * @title InsureDAO pool template contract
 * SPDX-License-Identifier: GPL-3.0
 */
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "./InsureDAOERC20.sol";
import "./interfaces/IPoolTemplate.sol";
import "./interfaces/IUniversalMarket.sol";

import "./interfaces/IParameters.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/IIndexTemplate.sol";

contract PoolTemplate is InsureDAOERC20, IPoolTemplate, IUniversalMarket {
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
    event Unlocked(uint256 indexed id, uint256 amount);
    event Insured(
        uint256 indexed id,
        uint256 amount,
        bytes32 target,
        uint256 startTime,
        uint256 endTime,
        address insured,
        address agent,
        uint256 premium
    );
    event Redeemed(
        uint256 indexed id,
        address insured,
        bytes32 target,
        uint256 amount,
        uint256 payout
    );
    event CoverApplied(
        uint256 pending,
        uint256 payoutNumerator,
        uint256 payoutDenominator,
        uint256 incidentTimestamp,
        bytes32 merkleRoot,
        string rawdata,
        string memo
    );
    event BountyPaid(uint256 amount, address contributor, uint256[] ids);

    event CreditIncrease(address indexed depositor, uint256 credit);
    event CreditDecrease(address indexed withdrawer, uint256 credit);
    event MarketStatusChanged(MarketStatus statusValue);
    event Paused(bool paused);
    event MetadataChanged(string metadata);

    /**
     * Storage
     */
    /// @notice Market setting
    bool public initialized;
    bool public override paused;
    string public metadata;

    /// @notice External contract call addresses
    IParameters public parameters;
    IRegistry public registry;
    IVault public vault;

    /// @notice Market variables
    uint256 public attributionDebt; //pool's attribution for indices
    uint256 public override lockedAmount; //Liquidity locked when utilized
    uint256 public override totalCredit; //Liquidity from index
    uint256 public rewardPerCredit; //Times MAGIC_SCALE_1E6. To avoid reward decimal truncation *See explanation below.
    uint256 public pendingEnd; //pending time when paying out

    /// @notice Market variables for margin account
    struct IndexInfo {
        uint256 credit; //How many credit (equal to liquidity) the index has allocated
        uint256 rewardDebt; // Reward debt. *See explanation below.
        uint256 index; //index number
        bool exist; //true if the index has allocated credit
    }

    mapping(address => IndexInfo) public indices;
    address[] public indexList;

    //
    // * We do some fancy math for premium calculation of indices.
    // Basically, any point in time, the amount of premium entitled to an index but is pending to be distributed is:
    //
    //   pending reward = (index.credit * rewardPerCredit) - index.rewardDebt
    //
    // When the pool receives premium, it updates rewardPerCredit
    //
    // Whenever an index deposits, withdraws credit to a pool, Here's what happens:
    //   1. The index receives the pending reward sent to the index vault.
    //   2. The index's rewardDebt get updated.
    //
    // This mechanism is widely used (e.g. SushiSwap: MasterChef.sol)
    //

    ///@notice Market status transition management
    MarketStatus public override marketStatus;

    ///@notice user's withdrawal status management
    struct Withdrawal {
        uint256 timestamp;
        uint256 amount;
    }
    mapping(address => Withdrawal) public withdrawalReq;

    ///@notice insurance status management
    struct Insurance {
        uint256 id; //each insuance has their own id
        uint48 startTime; //timestamp of starttime
        uint48 endTime; //timestamp of endtime
        uint256 amount; //insured amount
        bytes32 target; //target id in bytes32
        address insured; //the address holds the right to get insured
        address agent; //address have control. can be different from insured.
        bool status; //true if insurance is not expired or redeemed
    }
    mapping(uint256 => Insurance) public insurances;
    uint256 public allInsuranceCount;

    ///@notice incident status management
    struct Incident {
        uint256 payoutNumerator;
        uint256 payoutDenominator;
        uint256 incidentTimestamp;
        bytes32 merkleRoot;
    }
    Incident public incident;
    uint256 private constant MAGIC_SCALE_1E6 = 1e6; //internal multiplication scale 1e6 to reduce decimal truncation

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
     * references[0] = target governance token address
     * references[1] = underlying token address
     * references[2] = registry
     * references[3] = parameter
     * conditions[0] = minimim deposit amount defined by the factory
     * conditions[1] = initial deposit amount defined by the creator
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
                _references[2] != address(0) &&
                _references[3] != address(0) &&
                _conditions[0] <= _conditions[1],
            "INITIALIZATION_BAD_CONDITIONS"
        );
        initialized = true;

        string memory _name = "InsureDAO Insurance LP";
        string memory _symbol = "iNsure";
        
        try this.getTokenMetadata(_references[0]) returns (string memory name_, string memory symbol_) {
            _name = name_;
            _symbol = symbol_;
        } catch {}

        uint8 _decimals = IERC20Metadata(_references[1]).decimals();

        initializeToken(_name, _symbol, _decimals);

        registry = IRegistry(_references[2]);
        parameters = IParameters(_references[3]);
        vault = IVault(parameters.getVault(_references[1]));

        metadata = _metaData;

        marketStatus = MarketStatus.Trading;

        if (_conditions[1] != 0) {
            _depositFrom(_conditions[1], _depositor);
        }
    }

    function getTokenMetadata(address _token) external view returns (string memory _name, string memory _symbol) {
        _name = string(abi.encodePacked("InsureDAO ", IERC20Metadata(_token).name(), " Insurance LP"));
        _symbol = string(abi.encodePacked("i", IERC20Metadata(_token).symbol()));
    }

    /**
     * Pool interactions
     */

    /**
     * @notice A liquidity provider supplies tokens to the pool and receives iTokens
     * @param _amount amount of tokens to deposit
     * @return _mintAmount the amount of iTokens minted from the transaction
     */
    function deposit(uint256 _amount) external returns (uint256 _mintAmount) {
        _mintAmount = _depositFrom(_amount, msg.sender);
    }

    /**
     * @notice Internal deposit function that allows third party to deposit
     * @param _amount amount of tokens to deposit
     * @param _from deposit beneficiary's address
     * @return _mintAmount the amount of iTokens minted from the transaction
     */
    function _depositFrom(uint256 _amount, address _from)
        internal
        returns (uint256 _mintAmount)
    {
        require(_amount != 0, "ERROR: DEPOSIT_ZERO");
        require(
            marketStatus == MarketStatus.Trading,
            "ERROR: DEPOSIT_DISABLED(1)"
        );
        require(
            !paused,
            "ERROR: DEPOSIT_DISABLED(2)"
        );

        _mintAmount = worth(_amount);

        vault.addValue(_amount, _from, address(this));

        emit Deposit(_from, _amount, _mintAmount);

        //mint iToken
        _mint(_from, _mintAmount);
    }

    /**
     * @notice A liquidity provider request withdrawal of collateral
     * @param _amount amount of iTokens to burn
     */
    function requestWithdraw(uint256 _amount) external {
        require(_amount != 0, "ERROR: REQUEST_ZERO");
        require(balanceOf(msg.sender) >= _amount, "ERROR: REQUEST_EXCEED_BALANCE");
        
        uint256 _unlocksAt = block.timestamp + parameters.getLockup(address(this));

        withdrawalReq[msg.sender].timestamp = _unlocksAt;
        withdrawalReq[msg.sender].amount = _amount;
        emit WithdrawRequested(msg.sender, _amount, _unlocksAt);
    }

    /**
     * @notice A liquidity provider burns iTokens and receives collateral from the pool
     * @param _amount amount of iTokens to burn
     * @return _retVal the amount underlying tokens returned
     */
    function withdraw(uint256 _amount) external returns (uint256 _retVal) {
        require(
            marketStatus == MarketStatus.Trading,
            "ERROR: WITHDRAWAL_MARKET_PENDING"
        );

        Withdrawal memory request = withdrawalReq[msg.sender];

        require(
            request.timestamp < block.timestamp,
            "ERROR: WITHDRAWAL_QUEUE"
        );
        require(
            request.timestamp + parameters.getWithdrawable(address(this)) > block.timestamp,
            "WITHDRAWAL_NO_ACTIVE_REQUEST"
        );
        require(
            request.amount >= _amount,
            "WITHDRAWAL_EXCEEDED_REQUEST"
        );
        require(_amount != 0, "ERROR: WITHDRAWAL_ZERO");

        uint256 _supply = totalSupply();
        require(_supply != 0, "ERROR: NO_AVAILABLE_LIQUIDITY");

        uint256 _liquidity = originalLiquidity();
        _retVal = (_amount * _liquidity) / _supply;

        require(
            _retVal <= _availableBalance(),
            "WITHDRAW_INSUFFICIENT_LIQUIDITY"
        );

        //reduce requested amount
        unchecked {
            withdrawalReq[msg.sender].amount -= _amount;
        }

        //Burn iToken
        _burn(msg.sender, _amount);

        //Withdraw liquidity
        vault.withdrawValue(_retVal, msg.sender);

        emit Withdraw(msg.sender, _amount, _retVal);
    }

    /**
     * @notice Unlocks an array of insurances
     * @param _ids array of ids to unlock
     */
    function unlockBatch(uint256[] calldata _ids) external {
        require(marketStatus == MarketStatus.Trading, "ERROR: UNLOCK_BAD_COINDITIONS");
        uint256 idsLength = _ids.length;
        for (uint256 i; i < idsLength;) {
            _unlock(_ids[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @param _id id of the insurance policy to unlock liquidity
     */
    function unlock(uint256 _id) external {
        require(marketStatus == MarketStatus.Trading, "ERROR: UNLOCK_BAD_COINDITIONS");
        _unlock(_id);
    }

    /**
     * @notice Unlock funds locked in the expired insurance (for internal usage)
     * @param _id id of the insurance policy to unlock liquidity
     */
    function _unlock(uint256 _id) internal {
        require(
            insurances[_id].status &&
                insurances[_id].endTime + parameters.getGrace(address(this)) <
                block.timestamp,
            "ERROR: UNLOCK_BAD_COINDITIONS"
        );
        insurances[_id].status = false;

        lockedAmount = lockedAmount - insurances[_id].amount;

        emit Unlocked(_id, insurances[_id].amount);
    }

    /**
     * Index interactions
     */

    /**
     * @notice Register an index that can allocate credit to the pool
     * @param _index index number of an index pool to get registered in the pool
     */

    function registerIndex(uint256 _index)external override{
        require(
            IRegistry(registry).isListed(msg.sender),
            "ERROR: UNREGISTERED_INDEX"
        );
        require(
            _index <= parameters.getMaxList(address(this)),
            "ERROR: EXCEEEDED_MAX_LIST"
        );
        uint256 _length = indexList.length;
        if (_length <= _index) {
            require(_length == _index, "ERROR: BAD_INDEX");
            indexList.push(msg.sender);
            indices[msg.sender].exist = true;
            indices[msg.sender].index = _index;
        } else {
            address _indexAddress = indexList[_index];
            if (_indexAddress != address(0) && _indexAddress != msg.sender) {
                require(indices[msg.sender].credit == 0,"ERROR: ALREADY_ALLOCATED");
                require(indices[_indexAddress].credit == 0,"ERROR: WITHDRAW_CREDIT_FIRST");

                indices[_indexAddress].index = 0;
                indices[_indexAddress].exist = false;
                indices[msg.sender].index = _index;
                indices[msg.sender].exist = true;
                indexList[_index] = msg.sender;
            }
        }
    }

    /**
     * @notice Allocate credit from an index. Allocated credits are deemed as equivalent liquidity as real token deposits.
     * @param _credit credit (liquidity amount) to be added to this pool
     * @return _pending pending preium for the caller index
     */

    function allocateCredit(uint256 _credit)
        external
        override
        returns (uint256 _pending)
    {
        IndexInfo storage _index = indices[msg.sender];
        require(
            _index.exist,
            "ALLOCATE_CREDIT_BAD_CONDITIONS"
        );

        uint256 _rewardPerCredit = rewardPerCredit;

        if (_index.credit != 0){
            _pending = _sub(
                (_index.credit * _rewardPerCredit) / MAGIC_SCALE_1E6,
                _index.rewardDebt
            );
            if (_pending != 0) {
                vault.transferAttribution(_pending, msg.sender);
                attributionDebt -= _pending;
            }
        }
        if (_credit != 0) {
            totalCredit += _credit;
            _index.credit += _credit;
            emit CreditIncrease(msg.sender, _credit);
        }
        _index.rewardDebt =
            (_index.credit * _rewardPerCredit) /
            MAGIC_SCALE_1E6;
    }

    /**
     * @notice An index withdraw credit and earn accrued premium
     * @param _credit credit (liquidity amount) to be withdrawn from this pool
     * @return _pending pending preium for the caller index
     */
    function withdrawCredit(uint256 _credit)
        external
        override
        returns (uint256 _pending)
    {
        require(
            marketStatus == MarketStatus.Trading,
            "POOL_IS_IN_TRADING_STATUS"
        );

        IndexInfo storage _index = indices[msg.sender];

        require(
            _index.exist &&
            _index.credit >= _credit &&
            _credit <= _availableBalance(),
            "WITHDRAW_CREDIT_BAD_CONDITIONS"
        );

        uint256 _rewardPerCredit = rewardPerCredit;

        //calculate acrrued premium
        _pending = _sub(
            (_index.credit * _rewardPerCredit) / MAGIC_SCALE_1E6,
            _index.rewardDebt
        );

        //Withdraw liquidity
        if (_credit != 0) {
            totalCredit -= _credit;
            unchecked {
                _index.credit -= _credit;
            }
            emit CreditDecrease(msg.sender, _credit);
        }

        //withdraw acrrued premium
        if (_pending != 0) {
            vault.transferAttribution(_pending, msg.sender);
            attributionDebt -= _pending;
        }
        
        _index.rewardDebt =
                (_index.credit * _rewardPerCredit) /
                MAGIC_SCALE_1E6;
    }

    /**
     * Insurance interactions
     */

    /**
     * @notice Get insured for the specified amount for specified span
     * @param _amount target amount to get covered
     * @param _maxCost maximum cost to pay for the premium. revert if the premium is higher
     * @param _span length to get covered(e.g. 7 days)
     * @param _target Insurance type id. eg Smart Contract Hacking Cover = 0x00..00
     * @return id of the insurance policy
     */
    function insure(
        uint256 _amount,
        uint256 _maxCost,
        uint256 _span,
        bytes32 _target,
        address _for,
        address _agent
    ) external returns (uint256) {
        require(!paused, "ERROR: INSURE_MARKET_PAUSED");
        require(_for != address(0), "ERROR: ZERO_ADDRESS");
        require(_agent != address(0), "ERROR: ZERO_ADDRESS");
        require(
            marketStatus == MarketStatus.Trading,
            "ERROR: INSURE_MARKET_PENDING"
        );
        require(
            _amount <= _availableBalance(),
            "INSURE_EXCEEDED_AVAIL_BALANCE"
        );

        require(_span <= 365 days, "ERROR: INSURE_EXCEEDED_MAX_SPAN");
        require(
            parameters.getMinDate(address(this)) <= _span,
            "ERROR: INSURE_SPAN_BELOW_MIN"
        );

        //Distribute premium and fee
        uint256 _premium = getPremium(_amount, _span);
        require(_premium <= _maxCost, "ERROR: INSURE_EXCEEDED_MAX_COST");
        
        uint256 _endTime = _span + block.timestamp;
        uint256 _fee = parameters.getFeeRate(address(this));
        
        //current liquidity
        uint256 _liquidity = totalLiquidity();
        uint256 _totalCredit = totalCredit;

        //accrue premium/fee
        uint256[2] memory _newAttribution = vault.addValueBatch(
            _premium,
            msg.sender,
            [address(this), parameters.getOwner()],
            [MAGIC_SCALE_1E6 - _fee, _fee]
        );

        //Lock covered amount
        uint256 _id = allInsuranceCount;
        lockedAmount += _amount;
        insurances[_id] = Insurance(
            _id,
            (uint48)(block.timestamp),
            (uint48)(_endTime),
            _amount,
            _target,
            _for,
            _agent,
            true
        );
        
        unchecked {
            ++allInsuranceCount;
        }

        //Calculate liquidity for index
        if (_totalCredit != 0 && _liquidity != 0) {
            uint256 _attributionForIndex = (_newAttribution[0] * _totalCredit) / _liquidity;
            attributionDebt += _attributionForIndex;
            rewardPerCredit += ((_attributionForIndex * MAGIC_SCALE_1E6) /
                _totalCredit);
        }

        emit Insured(
            _id,
            _amount,
            _target,
            block.timestamp,
            _endTime,
            _for,
            _agent,
            _premium
        );

        return _id;
    }

    /**
     * @notice Redeem an insurance policy
     * @param _id the id of the insurance policy
     * @param _merkleProof merkle proof (similar to "verify" function of MerkleProof.sol of OpenZeppelin
     * Ref: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/MerkleProof.sol
     */
    function redeem(uint256 _id, uint256 _loss, bytes32[] calldata _merkleProof) external {
        require(
            marketStatus == MarketStatus.Payingout,
            "ERROR: NO_APPLICABLE_INCIDENT"
        );
        
        Insurance memory _insurance = insurances[_id];
        require(_insurance.status, "ERROR: INSURANCE_NOT_ACTIVE");
        require(_insurance.insured == msg.sender || _insurance.agent == msg.sender, "ERROR: NOT_YOUR_INSURANCE");
        uint48 _incidentTimestamp = (uint48)(incident.incidentTimestamp);
        require(
            _insurance.startTime <= _incidentTimestamp && _insurance.endTime >= _incidentTimestamp,
            "ERROR: INSURANCE_NOT_APPLICABLE"
        );

        bytes32 _targets = incident.merkleRoot;
        require(
            MerkleProof.verify(
                _merkleProof,
                _targets,
                keccak256(
                    abi.encodePacked(_insurance.target, _insurance.insured, _loss)
                )
            ) ||
                MerkleProof.verify(
                    _merkleProof,
                    _targets,
                    keccak256(abi.encodePacked(_insurance.target, address(0), _loss))
                ),
            "ERROR: INSURANCE_EXEMPTED"
        );
        insurances[_id].status = false;
        lockedAmount -= _insurance.amount;


        _loss = _loss * incident.payoutNumerator / incident.payoutDenominator;
        uint256 _payoutAmount = _insurance.amount > _loss ? _loss : _insurance.amount;

        vault.borrowValue(_payoutAmount, _insurance.insured);

        emit Redeemed(
            _id,
            _insurance.insured,
            _insurance.target,
            _insurance.amount,
            _payoutAmount
        );
    }

    /**
     * @notice Get how much premium for the specified amount and span
     * @param _amount amount to get insured
     * @param _span span to get covered
     */
    function getPremium(uint256 _amount, uint256 _span)
        public
        view
        returns (uint256)
    {
        return
            parameters.getPremium(
                _amount,
                _span,
                totalLiquidity(),
                lockedAmount,
                address(this)
            );
    }

    /**
     * Reporting interactions
     */

    /**
     * @notice Decision to make a payout
     * @param _pending length of time to allow policyholders to redeem their policy
     * @param _payoutNumerator Numerator of the payout *See below
     * @param _payoutDenominator Denominator of the payout *See below
     * @param _incidentTimestamp Unixtimestamp of the incident
     * @param _merkleRoot Merkle root of the payout id list
     * @param _rawdata raw data before the data set is coverted to merkle tree (to be emiｔted within event)
     * @param _memo additional memo for the payout report (to be emmited within event)
     * payout ratio is determined by numerator/denominator (e.g. 50/100 = 50% payout
     */
    function applyCover(
        uint256 _pending,
        uint256 _payoutNumerator,
        uint256 _payoutDenominator,
        uint256 _incidentTimestamp,
        bytes32 _merkleRoot,
        string calldata _rawdata,
        string calldata _memo
    ) external override onlyOwner {
        require(_incidentTimestamp < block.timestamp, "ERROR: INCIDENT_DATE");

        incident.payoutNumerator = _payoutNumerator;
        incident.payoutDenominator = _payoutDenominator;
        incident.incidentTimestamp = _incidentTimestamp;
        incident.merkleRoot = _merkleRoot;
        marketStatus = MarketStatus.Payingout;
        pendingEnd = block.timestamp + _pending;

        uint256 indexLength = indexList.length;
        for (uint256 i; i < indexLength;) {
            if (indices[indexList[i]].credit != 0) {
                IIndexTemplate(indexList[i]).lock();
            }
            unchecked {
                ++i;
            }
        }
        emit CoverApplied(
            _pending,
            _payoutNumerator,
            _payoutDenominator,
            _incidentTimestamp,
            _merkleRoot,
            _rawdata,
            _memo
        );
        emit MarketStatusChanged(MarketStatus.Payingout);
    }

    function applyBounty(
        uint256 _amount,
        address _contributor,
        uint256[] calldata _ids
    )external override onlyOwner {
        require(marketStatus == MarketStatus.Trading, "ERROR: NOT_TRADING_STATUS");

        //borrow value just like redeem()
        vault.borrowValue(_amount, _contributor);

        _liquidation();

        //unlock policies
        uint256 totalAmountToUnlock;
        for (uint256 i; i < _ids.length; ++i) {
            uint _id = _ids[i];
            require(insurances[_id].status);

            uint unlockAmount = insurances[_id].amount;

            insurances[_id].status = false;
            totalAmountToUnlock += unlockAmount;
            emit Unlocked(_id, unlockAmount);
        }
        lockedAmount -= totalAmountToUnlock;

        emit BountyPaid(_amount, _contributor, _ids) ;
    }

    /**
     * @notice Anyone can resume the market after a pending period ends
     */
    function resume() external {
        require(
            marketStatus == MarketStatus.Payingout &&
                pendingEnd < block.timestamp,
            "ERROR: UNABLE_TO_RESUME"
        );

        _liquidation();

        marketStatus = MarketStatus.Trading;

        uint256 indexLength = indexList.length;
        for (uint256 i; i < indexLength;) {
            IIndexTemplate(indexList[i]).adjustAlloc();
            unchecked {
                ++i;
            }
        }

        emit MarketStatusChanged(MarketStatus.Trading);
    }

    function _liquidation()internal{
        uint256 _totalLiquidity = totalLiquidity();
        uint256 _totalCredit = totalCredit;
        uint256 _debt = vault.debts(address(this));
        uint256 _deductionFromIndex;
        
        if (_totalLiquidity != 0) {
            _deductionFromIndex = _debt * _totalCredit / _totalLiquidity;
        }
        
        uint256 _actualDeduction;
        uint256 indexLength = indexList.length;
        for (uint256 i; i < indexLength;) {
            address _index = indexList[i];
            uint256 _credit = indices[_index].credit;

            if (_credit != 0) {
                uint256 _shareOfIndex = (_credit * MAGIC_SCALE_1E6) /
                    _totalCredit;
                uint256 _redeemAmount = _deductionFromIndex * _shareOfIndex / MAGIC_SCALE_1E6;
                _actualDeduction += IIndexTemplate(_index).compensate(
                    _redeemAmount
                );
            }
            unchecked {
                ++i;
            }
        }

        uint256 _deductionFromPool = _debt -
            _deductionFromIndex;
        uint256 _shortage = _deductionFromIndex  -
            _actualDeduction;
            
        if (_deductionFromPool != 0) {
            vault.offsetDebt(_deductionFromPool, address(this));
        }

        vault.transferDebt(_shortage);
    }

    /**
     * Utilities
     */

    /**
     * @notice Get the exchange rate of LP tokens against underlying asset(scaled by MAGIC_SCALE_1E6)
     * @return The value against the underlying tokens balance.
     */
    function rate() external view returns (uint256) {
        uint256 _supply = totalSupply();
        uint256 originalLiquidity = originalLiquidity();
        
        if (originalLiquidity != 0 && _supply != 0) {
            return (originalLiquidity * MAGIC_SCALE_1E6) / _supply;
        } else {
            return 0;
        }
    }

    /**
     * @notice Get the underlying balance of the `owner`
     * @param _owner the target address to look up value
     * @return The balance of underlying tokens for the specified address
     */
    function valueOfUnderlying(address _owner)
        external
        view
        override
        returns (uint256)
    {
        uint256 _balance = balanceOf(_owner);
        uint256 _totalSupply = totalSupply();
        
        if (_balance != 0 || _totalSupply != 0) {
            return (_balance * originalLiquidity()) / _totalSupply;
        }
    }

    /**
     * @notice Get the accrued value for an index
     * @param _index the address of index
     * @return The pending premium for the specified index
     */
    function pendingPremium(address _index)
        external
        view
        override
        returns (uint256)
    {
        uint256 _credit = indices[_index].credit;
        if (_credit != 0) {
            return
                _sub(
                    (_credit * rewardPerCredit) / MAGIC_SCALE_1E6,
                    indices[_index].rewardDebt
                );
        }
    }

    /**
     * @notice Get token number for the specified underlying value
     * @param _value the amount of the underlying
     * @return _amount the number of the iTokens corresponding to _value
     */
    function worth(uint256 _value) public view returns (uint256 _amount) {
    
        uint256 _supply = totalSupply();
        uint256 _originalLiquidity = originalLiquidity();
        if (_supply != 0 && _originalLiquidity != 0) {
            _amount = (_value * _supply) / _originalLiquidity;
        } else if (_supply != 0 && _originalLiquidity == 0) {
            _amount = _value * _supply;
        } else {
            _amount = _value;
        }
    }

    /**
     * @notice Get allocated credit & available balance
     * @param _index address of an index
     * @return The balance of credit allocated by the specified index
     */
    function pairValues(address _index)
        external
        view
        override
        returns (uint256, uint256)
    {
        return (indices[_index].credit, _availableBalance());
    }

    /**
     * @notice Returns the amount of underlying tokens available for withdrawals
     * @return available liquidity of this pool
     */
    function availableBalance()
        external
        view
        override
        returns (uint256)
    {
        return _availableBalance();
    }

    function _availableBalance()
        internal
        view
        returns (uint256)
    {
        uint256 _totalLiquidity = totalLiquidity();
        if (_totalLiquidity != 0) {
            return _totalLiquidity - lockedAmount;
        }
    }

    /**
     * @notice Returns the utilization rate for this pool. Scaled by 1e6 (100% = 1e6)
     * @return utilization rate
     */
    function utilizationRate() external view override returns (uint256) {
        uint256 _lockedAmount = lockedAmount;
        uint256 _totalLiquidity = totalLiquidity();
        
        if (_lockedAmount != 0 && _totalLiquidity != 0) {
            return (_lockedAmount * MAGIC_SCALE_1E6) / _totalLiquidity;
        }
    }

    /**
     * @notice Pool's Liquidity + Liquidity from Index (how much can the pool sell cover)
     * @return total liquidity of this pool
     */
    function totalLiquidity() public view override returns (uint256) {
        return originalLiquidity() + totalCredit;
    }

    /**
     * @notice Pool's Liquidity
     * @return total liquidity of this pool
     */
    function originalLiquidity() public view returns (uint256) {
        return
            vault.underlyingValue(address(this)) -
            vault.attributionValue(attributionDebt);
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
     * Internal functions
     */

    /**
     * @notice Internal function to offset withdraw request and latest balance
     * @param from the account who send
     * @param to a
     * @param amount the amount of tokens to offset
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (from != address(0)) {
            uint256 reqAmount = withdrawalReq[from].amount;
            if (reqAmount != 0){
                uint256 _after = balanceOf(from) - amount;
                if (_after < reqAmount) {
                    withdrawalReq[from].amount = _after;
                }
            } 
        }  
    }

    /**
     * @notice Internal function for safe division
     */
    function _divCeil(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0);
        uint256 c = a / b;
        if (a % b != 0) ++c;
        return c;
    }

    /**
     * @notice Internal function for overflow free subtraction
     */
    function _sub(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a >= b) {
            unchecked {return a - b;}
        }
    }
}
