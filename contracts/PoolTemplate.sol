pragma solidity 0.8.7;

/**
 * @author InsureDAO
 * @title InsureDAO pool template contract
 * SPDX-License-Identifier: GPL-3.0
 */
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IParameters.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/IIndexTemplate.sol";

contract PoolTemplate is IERC20 {
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
    event Unlocked(uint256 indexed id, uint256 amount);
    event Insured(
        uint256 indexed id,
        uint256 amount,
        bytes32 target,
        uint256 startTime,
        uint256 endTime,
        address insured,
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
        bytes32[] rawdata,
        string memo
    );
    event TransferInsurance(uint256 indexed id, address from, address to);
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
    bool public paused;
    string public metadata;
    uint256 public target;

    /// @notice EIP-20 token variables
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    /// @notice External contract call addresses
    IParameters public parameters;
    IRegistry public registry;
    IVault public vault;

    /// @notice Market variables
    uint256 public ownAttributions; //how much attribution point this pool's original liquidity has
    uint256 public lockedAmount; //Liquidity locked when utilized
    uint256 public totalCredit; //Liquidity from index
    uint256 public rewardPerCredit; //Times REWARD_DECIMALS. To avoid overdlow
    uint256 public pendingEnd; //pending time when paying out

    /// @notice Market variables for margin account
    struct IndexInfo {
        uint256 credit; //How many credit (equal to liquidity) the index has allocated
        uint256 rewardDebt; // Reward debt. *See explanation below.
        bool exist; //true if the index has allocated credit
        //
        // We do some fancy math here. Basically, any point in time, the amount of premium
        // entitled to an index but is pending to be distributed is:
        //
        //   pending reward = (index.credit * rewardPerCredit) - index.rewardDebt
        //
        // When the pool receives premium, it updates rewardPerCredit
        //
        // Whenever an index deposits, withdraws credit to a pool, Here's what happens:
        //   1. The index receives the pending reward sent to the index vault.
        //   2. The index's rewardDebt get updated.
    }
    mapping(address => IndexInfo) public indexes;
    address[] public indexList;

    ///@notice Market status transition management
    enum MarketStatus {
        Trading,
        Payingout
    }
    MarketStatus public marketStatus;

    ///@notice user's withdrawal status management
    struct Withdrawal {
        uint256 timestamp;
        uint256 amount;
    }
    mapping(address => Withdrawal) public withdrawalReq;

    ///@notice insurance status management
    struct Insurance {
        uint256 id; //each insuance has their own id
        uint256 startTime; //timestamp of starttime
        uint256 endTime; //timestamp of endtime
        uint256 amount; //insured amount
        bytes32 target; //target id in bytes32
        address insured; //the address holds the right to get insured
        bool status; //true if insurance is not expired or redeemed
    }
    Insurance[] public insurances;
    mapping(address => uint256[]) public insuranceHoldings;

    ///@notice incident status management
    struct Incident {
        uint256 payoutNumerator;
        uint256 payoutDenominator;
        uint256 incidentTimestamp;
        bytes32 merkleRoot;
    }
    Incident public incident;

    ///@notice magic numbers
    uint256 public constant UTILIZATION_RATE_LENGTH = 1e8;
    uint256 public constant CREDIT_DECIMALS = 1e12;

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
     * references[0] = target governance token address
     * references[1] = underlying token address
     * references[2] = registry
     * references[3] = parameter
     * conditions[0] = target id
     * conditions[1] = minimim deposit amount
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
                _references[2] != address(0) &&
                _references[3] != address(0),
            "ERROR: INITIALIZATION_BAD_CONDITIONS"
        );
        initialized = true;

        name = string(
            abi.encodePacked(
                "InsureDAO-",
                IERC20Metadata(_references[1]).name(),
                "-PoolInsurance"
            )
        );
        symbol = string(
            abi.encodePacked("i-", IERC20Metadata(_references[1]).name())
        );
        decimals = IERC20Metadata(_references[0]).decimals();

        registry = IRegistry(_references[2]);
        parameters = IParameters(_references[3]);
        vault = IVault(parameters.getVault(_references[1]));

        metadata = _metaData;

        marketStatus = MarketStatus.Trading;

        target = _conditions[0];
        if (_conditions[1] > 0) {
            deposit(_conditions[1]);
        }
    }

    /**
     * Pool initeractions
     */

    /**
     * @notice A provider supplies token to the pool and receives iTokens
     * @param _amount amount of token to deposit
     * @return _mintAmount the amount of iToken minted from the transaction
     */
    function deposit(uint256 _amount) public returns (uint256 _mintAmount) {
        require(
            marketStatus == MarketStatus.Trading && paused == false,
            "ERROR: DEPOSIT_DISABLED"
        );
        require(_amount > 0, "ERROR: DEPOSIT_ZERO");

        _mintAmount = worth(_amount);

        uint256 _newAttribution = vault.addValue(
            _amount,
            msg.sender,
            address(this)
        );
        ownAttributions = ownAttributions.add(_newAttribution);

        emit Deposit(msg.sender, _amount, _mintAmount);

        //mint iToken
        _mint(msg.sender, _mintAmount);
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
        uint256 _supply = totalSupply();

        uint256 _liquidity = vault.attributionValue(ownAttributions);
        _retVal = _divMinus(_amount.mul(_liquidity), _supply);

        require(
            marketStatus == MarketStatus.Trading,
            "ERROR: WITHDRAWAL_PENDING"
        );
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
            _retVal <= availableBalance(),
            "ERROR: WITHDRAW_INSUFFICIENT_LIQUIDITY"
        );
        //reduce requested amount
        withdrawalReq[msg.sender].amount = withdrawalReq[msg.sender].amount.sub(
            _amount
        );

        //Burn iToken
        _burn(msg.sender, _amount);

        //Withdraw liquidity
        uint256 _deductAttribution = vault.withdrawValue(_retVal, msg.sender);
        ownAttributions = ownAttributions.sub(_deductAttribution);

        emit Withdraw(msg.sender, _amount, _retVal);
    }

    /**
     * @notice Unlocks an array of insurances
     * @param _ids array of ids to unlock
     */
    function unlockBatch(uint256[] calldata _ids) external {
        for (uint256 i = 0; i < _ids.length; i++) {
            unlock(_ids[i]);
        }
    }

    /**
     * @notice Unlock funds locked in the expired insurance
     * @param _id id of the insurance policy to unclock liquidity
     */
    function unlock(uint256 _id) public {
        Insurance storage insurance = insurances[_id];
        require(
            insurance.status == true &&
                marketStatus == MarketStatus.Trading &&
                insurance.endTime.add(parameters.getGrace(msg.sender)) <
                block.timestamp,
            "ERROR: UNLOCK_BAD_COINDITIONS"
        );
        insurance.status == false;

        lockedAmount = lockedAmount.sub(insurance.amount);

        emit Unlocked(_id, insurance.amount);
    }

    /**
     * Index interactions
     */

    /**
     * @notice Allocate credit from indexes. Allocated credits are treated as equivalent to deposited real token.
     * @param _credit credit (liquidity amount) to be added to this pool
     * @return _pending pending preium for the caller index
     */

    function allocateCredit(uint256 _credit)
        external
        returns (uint256 _pending)
    {
        require(
            IRegistry(registry).isListed(msg.sender),
            "ERROR: ALLOCATE_CREDIT_BAD_CONDITIONS"
        );
        IndexInfo storage _index = indexes[msg.sender];
        if (indexes[msg.sender].exist == false) {
            indexes[msg.sender].exist = true;
            indexList.push(msg.sender);
        }
        if (_index.credit > 0) {
            _pending = _sub(
                _index.credit.mul(rewardPerCredit).div(REWARD_DECIMALS),
                _index.rewardDebt
            );
            if (_pending > 0) {
                vault.transferAttribution(_pending, msg.sender);
            }
        }
        if (_credit > 0) {
            totalCredit = totalCredit.add(_credit);
            indexes[msg.sender].credit = indexes[msg.sender].credit.add(
                _credit
            );
            emit CreditIncrease(msg.sender, _credit);
        }
        _index.rewardDebt = _index.credit.mul(rewardPerCredit).div(
            REWARD_DECIMALS
        );
    }

    /**
     * @notice An index withdraw credit and earn accrued premium
     * @param _credit credit (liquidity amount) to be withdrawn from this pool
     * @return _pending pending preium for the caller index
     */
    function withdrawCredit(uint256 _credit)
        external
        returns (uint256 _pending)
    {
        IndexInfo storage _index = indexes[msg.sender];
        require(
            IRegistry(registry).isListed(msg.sender) &&
                _index.credit >= _credit &&
                _credit <= availableBalance(),
            "ERROR: WITHDRAW_CREDIT_BAD_CONDITIONS"
        );

        //calculate acrrued premium
        _pending = _sub(
            _index.credit.mul(rewardPerCredit).div(REWARD_DECIMALS),
            _index.rewardDebt
        );

        //Withdraw liquidity
        if (_credit > 0) {
            totalCredit = totalCredit.sub(_credit);
            indexes[msg.sender].credit = indexes[msg.sender].credit.sub(
                _credit
            );
            emit CreditDecrease(msg.sender, _credit);
        }

        //withdraw acrrued premium
        if (_pending > 0) {
            vault.transferAttribution(_pending, msg.sender);
            _index.rewardDebt = _index.credit.mul(rewardPerCredit).div(
                REWARD_DECIMALS
            );
        }
    }

    /**
     * Insurance interactions
     */

    /**
     * @notice Get insured for the specified amount for specified span
     * @param _amount target amount to get covered
     * @param _maxCost maxmum cost to pay for the premium. revert if the premium is hifger
     * @param _span length to get covered(e.g. 7 days)
     * @param _target target id
     * @return id of the insurance policy
     */
    function insure(
        uint256 _amount,
        uint256 _maxCost,
        uint256 _span,
        bytes32 _target
    ) external returns (uint256) {
        //Distribute premium and fee
        uint256 _endTime = _span.add(block.timestamp);
        uint256 _premium = getPremium(_amount, _span);
        uint256 _fee = parameters.getFee(_premium, msg.sender);
        uint256 _deducted = _premium.sub(_fee);

        require(
            _amount <= availableBalance(),
            "ERROR: INSURE_EXCEEDED_AVAILABLE_BALANCE"
        );
        require(_premium <= _maxCost, "ERROR: INSURE_EXCEEDED_MAX_COST");
        require(_span <= 365 days, "ERROR: INSURE_EXCEEDED_MAX_SPAN");
        require(
            parameters.getMin(msg.sender) <= _span,
            "ERROR: INSURE_SPAN_BELOW_MIN"
        );

        require(
            marketStatus == MarketStatus.Trading,
            "ERROR: INSURE_MARKET_PENDING"
        );
        require(paused == false, "ERROR: INSURE_MARKET_PAUSED");

        //accrue fee
        vault.addValue(_fee, msg.sender, parameters.getOwner());
        //accrue premium
        uint256 _newAttribution = vault.addValue(
            _deducted,
            msg.sender,
            address(this)
        );

        //Lock covered amount
        uint256 _id = insurances.length;
        lockedAmount = lockedAmount.add(_amount);
        Insurance memory _insurance = Insurance(
            _id,
            block.timestamp,
            _endTime,
            _amount,
            _target,
            msg.sender,
            true
        );
        insurances.push(_insurance);
        insuranceHoldings[msg.sender].push(_id);

        //Calculate liquidity
        uint256 _attributionForIndex = _newAttribution.mul(totalCredit).div(
            totalLiquidity()
        );
        ownAttributions = ownAttributions.add(_newAttribution).sub(
            _attributionForIndex
        );
        if (totalCredit > 0) {
            rewardPerCredit = rewardPerCredit.add(
                _attributionForIndex.mul(REWARD_DECIMALS).div(totalCredit)
            );
        }

        emit Insured(
            _id,
            _amount,
            _target,
            block.timestamp,
            _endTime,
            msg.sender,
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
    function redeem(uint256 _id, bytes32[] calldata _merkleProof) external {
        Insurance storage insurance = insurances[_id];
        require(insurance.status == true, "ERROR: INSURANCE_NOT_ACTIVE");

        uint256 _payoutNumerator = incident.payoutNumerator;
        uint256 _payoutDenominator = incident.payoutDenominator;
        uint256 _incidentTimestamp = incident.incidentTimestamp;
        bytes32 _targets = incident.merkleRoot;
        uint256 MAGIC_SCALE = 1e8; //1e8 to reduce truncation

        require(
            marketStatus == MarketStatus.Payingout,
            "ERROR: NO_APPLICABLE_INCIDENT"
        );
        require(insurance.insured == msg.sender, "ERROR: NOT_YOUR_INSURANCE");
        require(
            marketStatus == MarketStatus.Payingout &&
                insurance.startTime <= _incidentTimestamp &&
                insurance.endTime >= _incidentTimestamp &&
                MerkleProof.verify(
                    _merkleProof,
                    _targets,
                    keccak256(abi.encodePacked(insurance.target))
                ),
            "ERROR: INSURANCE_NOT_APPLICABLE"
        );
        insurance.status = false;
        lockedAmount = lockedAmount.sub(insurance.amount);

        uint256 _payoutAmount = insurance.amount.mul(_payoutNumerator).div(
            _payoutDenominator
        );
        uint256 _deductionFromIndex = _payoutAmount
            .mul(totalCredit)
            .mul(MAGIC_SCALE)
            .div(totalLiquidity());

        for (uint256 i = 0; i < indexList.length; i++) {
            if (indexes[indexList[i]].credit > 0) {
                uint256 _shareOfIndex = indexes[indexList[i]]
                    .credit
                    .mul(MAGIC_SCALE)
                    .div(totalCredit);
                uint256 _redeemAmount = _divCeil(
                    _deductionFromIndex,
                    _shareOfIndex
                );
                IIndexTemplate(indexList[i]).compensate(_redeemAmount);
            }
        }

        uint256 _paidAttribution = vault.withdrawValue(
            _payoutAmount,
            msg.sender
        );
        uint256 _indexAttribution = _paidAttribution
            .mul(_deductionFromIndex)
            .div(MAGIC_SCALE)
            .div(_payoutAmount);
        ownAttributions = ownAttributions.sub(
            _paidAttribution.sub(_indexAttribution)
        );
        emit Redeemed(
            _id,
            msg.sender,
            insurance.target,
            insurance.amount,
            _payoutAmount
        );
    }

    /**
     * @notice Transfers an active insurance
     * @param _id id of the insurance policy
     * @param _to receipient of of the policy
     */
    function transferInsurance(uint256 _id, address _to) external {
        Insurance storage insurance = insurances[_id];

        require(
            _to != address(0) &&
                insurance.insured == msg.sender &&
                insurance.endTime >= block.timestamp &&
                insurance.status == true,
            "ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS"
        );

        insurance.insured = _to;
        emit TransferInsurance(_id, msg.sender, _to);
    }

    /**
     * @notice Get how much premium for the specified amound and span
     * @param _amount amount to get insured
     * @param _span span to get covered
     */
    function getPremium(uint256 _amount, uint256 _span)
        public
        view
        returns (uint256 premium)
    {
        return
            parameters.getPremium(
                _amount,
                _span,
                totalLiquidity(),
                lockedAmount,
                msg.sender
            );
    }

    /**
     * Reporting interactions
     */

    /**
     * @notice Decision to make a payout
     * @param _pending length to allow policy holders to redeem their policy
     * @param _payoutNumerator Numerator of the payout *See below
     * @param _payoutDenominator Denominator of the payout *See below
     * @param _incidentTimestamp Unixtimestamp of the incident
     * @param _merkleRoot Merkle root of the payout id list
     * @param _rawdata raw data before the data set is coverted to merkle tree
     * @param _memo additional note for the payout report
     * payout ratio is determined by numerator/denominator
     * e.g. 50/100 = 50% payout
     */
    function applyCover(
        uint256 _pending,
        uint256 _payoutNumerator,
        uint256 _payoutDenominator,
        uint256 _incidentTimestamp,
        bytes32 _merkleRoot,
        bytes32[] calldata _rawdata,
        string calldata _memo
    ) external onlyOwner {
        require(
            marketStatus != MarketStatus.Payingout,
            "ERROR: UNABLE_TO_APPLY"
        );
        incident.payoutNumerator = _payoutNumerator;
        incident.payoutDenominator = _payoutDenominator;
        incident.incidentTimestamp = _incidentTimestamp;
        incident.merkleRoot = _merkleRoot;
        marketStatus = MarketStatus.Payingout;
        pendingEnd = block.timestamp.add(_pending);
        for (uint256 i = 0; i < indexList.length; i++) {
            if (indexes[indexList[i]].credit > 0) {
                IIndexTemplate(indexList[i]).lock(_pending);
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
        emit MarketStatusChanged(marketStatus);
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
        marketStatus = MarketStatus.Trading;
        emit MarketStatusChanged(marketStatus);
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
    function allowance(address _owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return _allowances[_owner][spender];
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
     * @notice Get the exchange rate of LP token against underlying asset(scaled by 1e18)
     * @return The value against the underlying token balance.
     */
    function rate() external view returns (uint256) {
        if (_totalSupply > 0) {
            return
                vault.attributionValue(ownAttributions).mul(1e18).div(
                    _totalSupply
                );
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
            return
                _balance.mul(vault.attributionValue(ownAttributions)).div(
                    totalSupply()
                );
        }
    }

    /**
     * @notice Get the accrued value for an index
     * @param _index the address of index
     * @return The pending premium for the specified index
     */
    function pendingPremium(address _index) external view returns (uint256) {
        uint256 _credit = indexes[_index].credit;
        if (_credit == 0) {
            return 0;
        } else {
            return
                _sub(
                    _credit.mul(rewardPerCredit).div(REWARD_DECIMALS),
                    indexes[_index].rewardDebt
                );
        }
    }

    /**
     * @notice Get token number for the specified underlying value
     * @param _value amount of iToken
     * @return _amount The balance of underlying token for the specified amount
     */
    function worth(uint256 _value) public view returns (uint256 _amount) {
        uint256 _supply = totalSupply();
        if (_supply > 0 && ownAttributions > 0) {
            _amount = _value.mul(_supply).div(
                vault.attributionValue(ownAttributions)
            );
        } else if (_supply > 0 && ownAttributions == 0) {
            _amount = _value.div(_supply);
        } else {
            _amount = _value;
        }
    }

    /**
     * @notice Get allocated credit
     * @param _index address of an index
     * @return The balance of credit allocated by the specified index
     */
    function allocatedCredit(address _index) public view returns (uint256) {
        return indexes[_index].credit;
    }

    /**
     * @notice Get the number of total insurances
     * @return Number of insurance policies to date
     */
    function allInsuranceCount() public view returns (uint256) {
        return insurances.length;
    }

    /**
     * @notice Get the underlying balance of the `owner`
     * @param _user account address
     * @return Number of insurance policies to date for the specified user
     */
    function getInsuranceCount(address _user) public view returns (uint256) {
        return insuranceHoldings[_user].length;
    }

    /**
     * @notice Returns the amount of underlying token available for withdrawals
     * @return _balance available liquidity of this pool
     */
    function availableBalance() public view returns (uint256 _balance) {
        if (totalLiquidity() > 0) {
            return totalLiquidity().sub(lockedAmount);
        } else {
            return 0;
        }
    }

    /**
     * @notice Returns the utilization rate for this pool. Scaled by 1e8 (100% = 1e8)
     * @return _rate utilization rate
     */
    function utilizationRate() public view returns (uint256 _rate) {
        if (lockedAmount > 0) {
            return
                lockedAmount.mul(UTILIZATION_RATE_LENGTH).div(totalLiquidity());
        } else {
            return 0;
        }
    }

    /**
     * @notice total Liquidity of the pool (how much can the pool sell cover)
     * @return _balance total liquidity of this pool
     */
    function totalLiquidity() public view returns (uint256 _balance) {
        return vault.attributionValue(ownAttributions).add(totalCredit);
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
     * @notice Internal function for safe division
     */
    function _divCeil(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0);
        uint256 c = a / b;
        if (a % b != 0) c = c + 1;
        return c;
    }

    /**
     * @notice Internal function to prevent liquidity to go zero
     */
    function _divMinus(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0);
        uint256 c = a / b;
        if (a % b != 0 && c != 0) c = c - 1;
        return c;
    }

    /**
     * @notice Internal function for overflow free subtraction
     */
    function _sub(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a < b) {
            return 0;
        } else {
            return a - b;
        }
    }
}
