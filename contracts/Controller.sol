// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

import "./interfaces/IController.sol";
import "./interfaces/IVault.sol";

contract Controller is IController {
    address keeper; // An address of a keeper(who can only utilize vault asset)
    IVault vault; // A vault where a controller is associated
    IERC20 token; // Token this controller hold

    uint256 totalDebtRatio; // Total debt all strategies have
    VaultParameter vaultParameter;
    mapping(address => StrategyParameter) public strategies;
    address[] withdrawalQueue; // An order of strategy addresses from which asset is withdrawn

    struct StrategyParameter {
        uint256 debtLimitRatio; // limit of a debt ratio
        uint256 currentDebtRatio; // total debt ratio from a controller
        uint256 activation; // last activation timestamp of a strategy transaction(default is zero)
        uint256 totalDebt;
        uint256 totalGain;
        uint256 totalLoss;
    }

    struct VaultParameter {
        uint256 maxUtilizeRate;
        uint256 utilizedRate;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "Caller is not allowed to operate");
        _;
    }

    constructor(
        address _token,
        address _keeper,
        address _vault
    ) {
        token = IERC20(_token);
        keeper = _keeper;
        vault = IVault(_vault);
        vaultParameter = VaultParameter(0, 0);
    }

    /**
    @notice returns how far a strategy exceeds its debt limit
     */
    function debtOutstanding(address _strategy) external view returns (uint256) {
        // TODO: implement
    }

    function debtOutstanding() external view returns (uint256) {
        // TODO: implement
    }

    /**
    @notice returns the rest of credit the controller has for a strategy
     */
    function creditAvailable(address _strategy) external view returns (uint256) {
        // TODO implement
    }

    function creditAvailable() external view returns (uint256) {
        // TODO implement
    }

    /**
    @notice set max amount of tokens a vault can utilize
     */
    function setCapacity(uint256 _rate) external onlyKeeper {
        // TODO: check if rate is within the safe range
        vaultParameter.maxUtilizeRate = _rate;
    }

    /**
    @notice withdraw specified amount of USDC.
     */
    function withdraw(address _to, uint256 _amount) external onlyKeeper {}

    /**
    @notice utilized USDC amount of a controller.
     */
    function utilizeAmount() external onlyKeeper returns (uint256) {}

    /**
    @notice get sum of a controller balace and utilized amount
     */
    function valueAll() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
    @notice approve and receive tokens from a vault.
    this method should be called by a vault.
     */
    function earn(address _token, uint256 _amount) external {
        require(_token == address(token), "Different token was given");

        uint256 _availableRate = vaultParameter.maxUtilizeRate - vaultParameter.utilizedRate;
        uint256 _availableAmount = token.balanceOf(address(vault)) * _availableRate;
        require(_amount > _availableAmount, "Amount exceed capacity the vault can utilize");

        //TODO: implement
    }

    /**
    @notice lend asset to strategy.
     */
    function lend(address _strategy, uint256 _amount) external onlyKeeper {
        // TODO: implement
        // revert if amount exceeds debt limit
    }

    /**
    @notice get strategy's current profit, loss and debt that can be paid,
    which must be called by strategy
     */
    function report(
        uint256 _profit,
        uint256 _loss,
        uint256 _debtPayment
    ) external {
        // TODO: implement
        // revert if a sender is not equal to active strategy
    }

    /**
    @notice migrate all asset(balance and all debt of strategy) into new controller
    this method should be called by a vault.
     */
    function migrate(address) external {
        // TODO: implement
        // revert if a sender is not equal to a registered vault
    }

    /**
    @notice add new strategy to a controller
     */
    function addStrategy(address _strategy) external onlyKeeper {
        require(strategies[_strategy].activation == 0, "Can't override an active strategy");
        strategies[_strategy] = StrategyParameter(0, 0, 0, 0, 0, 0);
    }

    /**
    @notice activate strategy to send balance of a controller
     */
    function activateStrategy(address _strategy) external onlyKeeper {
        strategies[_strategy].activation = block.timestamp;
    }

    /**
    @notice set debt limit to a strategy
     */
    function setDebtLimitRatio(address _strategy, uint256 _debtLimitRatio) external onlyKeeper {
        // TODO: revert if totalDebtRatio exceeds limit
        strategies[_strategy].debtLimitRatio = _debtLimitRatio;
    }

    /**
    @notice organize withdrawing order
     */
    function setWithdrawalQueue(address[] calldata _withdrawalQueue) external onlyKeeper {
        // TODO: check if all queue addresses are registered as strategies
        withdrawalQueue = _withdrawalQueue;
    }
}
