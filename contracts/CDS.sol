pragma solidity 0.8.7;

/**
 * @author InsureDAO
 * @title InsureDAO CDS template contract
 * SPDX-License-Identifier: GPL-3.0
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./InsureDAOERC20.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/IParameters.sol";
import "./interfaces/ICDS.sol";
import "./interfaces/IMinter.sol";

contract CDS is InsureDAOERC20, ICDS {

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
    event MetadataChanged(string metadata);


    /**
     * Storage
     */
    /// @notice Market setting
    bool public initialized;
    bool public paused;
    string public metadata;

    /// @notice External contract call addresses
    IParameters public parameters;
    IRegistry public registry;
    IVault public vault;

    ///@notice user status management
    struct Withdrawal {
        uint256 timestamp;
        uint256 amount;
    }
    mapping(address => Withdrawal) public withdrawalReq;


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

        string memory name = "InsureDAO-CDS";
        string memory symbol = "iCDS";
        uint8 decimals = IERC20Metadata(_references[0]).decimals();

        initializeToken(name, symbol, decimals);

        parameters = IParameters(_references[2]);
        vault = IVault(parameters.getVault(_references[0]));
        registry = IRegistry(_references[1]);

        metadata = _metaData;
    }

    /**
     * Pool initeractions
     */

    /**
     * @notice A liquidity provider supplies collatral to the pool and receives iTokens
     * @param _amount amount of token to deposit
     */
    function deposit(uint256 _amount) public returns (uint256 _mintAmount) {
        require(paused == false, "ERROR: DEPOSIT_DISABLED");
        require(_amount > 0, "ERROR: DEPOSIT_ZERO");

        uint256 _fee = parameters.getDepositFee(_amount, msg.sender);
        uint256 _add = _amount - _fee;
        uint256 _supply = totalSupply();
        uint256 _totalLiquidity = totalLiquidity();
        //deposit and pay fees
        vault.addValue(_add, msg.sender, address(this));
        vault.addValue(_fee, msg.sender, parameters.getOwner());

        //Calculate iToken value
        if (_supply > 0 && _totalLiquidity > 0) {
            _mintAmount = _add * _supply / _totalLiquidity;
        } else if (_supply > 0 && _totalLiquidity == 0) {
            _mintAmount = _add / _supply;
        } else {
            _mintAmount = _add;
        }

        emit Deposit(msg.sender, _amount, _mintAmount);

        //mint iToken
        _mint(msg.sender, _mintAmount);
    }

    /**
     * @notice A liquidity provider request withdrawal of collateral
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
     * @notice A liquidity provider burns iToken and receives collatral from the pool
     * @param _amount amount of iToken to burn
     * @return _retVal the amount underlying token returned
     */
    function withdraw(uint256 _amount) external returns (uint256 _retVal) {
        //Calculate underlying value
        _retVal = vault.underlyingValue(address(this)) * _amount / totalSupply();
        require(paused == false, "ERROR: WITHDRAWAL_PENDING");
        require(
            withdrawalReq[msg.sender].timestamp + parameters.getLockup(msg.sender) < block.timestamp,
            "ERROR: WITHDRAWAL_QUEUE"
        );
        require(
            withdrawalReq[msg.sender].timestamp 
            + parameters.getLockup(msg.sender) 
            + parameters.getWithdrawable(msg.sender) 
            > block.timestamp,
            "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
        );
        require(
            withdrawalReq[msg.sender].amount >= _amount,
            "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
        );
        require(_amount > 0, "ERROR: WITHDRAWAL_ZERO");
        //reduce requested amount
        withdrawalReq[msg.sender].amount -= _amount;

        //Burn iToken
        _burn(msg.sender, _amount);

        //Withdraw liquidity
        vault.withdrawValue(_retVal, msg.sender);
        emit Withdraw(msg.sender, _amount, _retVal);
    }

    /**
     * Insurance interactions
     */

    /**
     * @notice Compensate the shortage if an index is insolvent
     * @param _amount amount of underlier token to compensate shortage within index
     */
    function compensate(uint256 _amount) external override {
        require(registry.isListed(msg.sender));
        uint256 _available = vault.underlyingValue(address(this));
        if (_available >= _amount) {
            //Normal case
            vault.transferValue(_amount, msg.sender);
        } else {
            uint256 _shortage = _amount - _available;
            //transfer as much as possible
            vault.transferValue(_available, msg.sender);
            //check token address
            address _token = vault.token();
            //mint and swap for the shortage
            IMinter(parameters.getMinter()).emergency_mint(_token, _shortage);
            IERC20(_token).approve(address(vault), _shortage);
            vault.addValue(_shortage, address(this), msg.sender);
        }
        emit Compensated(msg.sender, _amount);
    }


    /**
     * Utilities
     */

    /**
     * @notice total Liquidity of the pool (how much can the pool sell cover)
     * @return _balance available liquidity of this pool
     */
    function totalLiquidity() public view returns (uint256 _balance) {
        return vault.underlyingValue(address(this));
    }

    /**
     * @notice Get the exchange rate of LP token against underlying asset(scaled by 1e18, if 1e18, the value of iToken vs underlier is 1:1)
     * @return The value against the underlying token balance.
     */
    function rate() external view returns (uint256) {
        if (totalSupply() > 0) {
            return totalLiquidity() * 1e18 / totalSupply();
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
                _balance * (vault.underlyingValue(address(this)) / totalSupply());
        }
    }

    /**
     * Admin functions
     */

    /**
     * @notice Change metadata string
     * @param _metadata new metadata string
     */
    function changeMetadata(string calldata _metadata) external onlyOwner {
        metadata = _metadata;
        emit MetadataChanged(_metadata);
    }

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
     * Internal functions
     */

    /**
     * @notice Internal function to offset request balance
     * @param _from the account who send
     * @param _amount the amount of token to offset
     */
    function _beforeTokenTransfer(address _from, uint256 _amount) internal {
        //withdraw request operation
        uint256 _after = balanceOf(_from) - _amount;
        if (_after < withdrawalReq[_from].amount) {
            withdrawalReq[_from].amount = _after;
        }
    }
}
