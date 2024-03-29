// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

import "../abstracts/OpsReady.sol";
import "../interfaces/IController.sol";
import "../interfaces/IOwnership.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IAaveV3Pool.sol";
import "../interfaces/IAaveV3Reward.sol";
import "../interfaces/IExchangeLogic.sol";
import "../errors/CommonError.sol";

/**
 * @title AaveV3Strategy
 * @author @InsureDAO
 * @notice This contract pulls a vault fund then utilize for various strategies.
 * @dev This strategy also has Controller functionality because currently the controller
 *      has 1 strategy and the strategy is not complicated. In the future, Strategy methods
 *      will be generalized as interface and separated from Controller.
 */
contract AaveV3Strategy is IController, OpsReady {
    using SafeERC20 for IERC20;

    IOwnership public immutable ownership;
    IVault public immutable vault;
    IAaveV3Pool public immutable aave;
    IAaveV3Reward public immutable aaveReward;
    IExchangeLogic public exchangeLogic;

    /// @inheritdoc IController
    uint256 public maxManagingRatio;

    /// @notice We use usdc as vault asset
    IERC20 public immutable usdc;

    /// @dev Supplying USDC to Aave pool, aUSDC is minted as your position.
    IERC20 public immutable ausdc;

    /// @dev Current supplying assets array used to claim reward. This should be a*** token.
    address[] public supplyingAssets;

    /// @dev This variable is significant to avoid locking asset in Aave pool.
    uint256 public aaveMaxOccupancyRatio;

    /// @dev What minimum reward a compound should be triggered by check() function.
    uint256 public minOpsTrigger;

    /// @dev internal multiplication scale 1e6 to reduce decimal truncation
    uint256 private constant MAGIC_SCALE_1E6 = 1e6; //

    modifier onlyOwner() {
        if (ownership.owner() != msg.sender) revert OnlyOwner();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != address(vault)) revert OnlyVault();
        _;
    }

    modifier withinValidRatio(uint256 _ratio) {
        if (_ratio > MAGIC_SCALE_1E6) revert RatioOutOfRange();
        _;
    }

    event FundPulled(address indexed _vault, uint256 _amount);
    event FundReturned(address indexed _vault, uint256 _amount);
    event FundEmigrated(address indexed _to, uint256 _amount);
    event FundImmigrated(address indexed _from, uint256 _amount);
    event EmergencyExit(address indexed _destination, uint256 _withdrawnAmount);
    event SupplyIncreased(address indexed _token, uint256 _amount);
    event SupplyDecreased(address indexed _token, uint256 _amount);
    event MaxManagingRatioSet(uint256 _ratio);
    event MaxOccupancyRatioSet(uint256 _ratio);
    event ExchangeLogicSet(address _logic);
    event RewardTokenSet(address _token);
    event RewardClaimed(address _token, uint256 _amount);
    event SwapSucceeded(address indexed _tokenIn, address indexed _tokenOut, uint256 _amountIn, uint256 _amountOut);

    constructor(
        IOwnership _ownership,
        IVault _vault,
        IExchangeLogic _exchangeLogic,
        IAaveV3Pool _aave,
        IAaveV3Reward _aaveReward,
        IERC20 _usdc,
        IERC20 _ausdc,
        address _ops
    ) {
        ownership = _ownership;
        vault = _vault;
        exchangeLogic = _exchangeLogic;
        aave = _aave;
        aaveReward = _aaveReward;
        usdc = _usdc;
        ausdc = _ausdc;
        ops = _ops;
        supplyingAssets.push(address(_ausdc));

        maxManagingRatio = MAGIC_SCALE_1E6;
        aaveMaxOccupancyRatio = (MAGIC_SCALE_1E6 * 10) / 100;
        minOpsTrigger = 100e6;
    }

    /**
     * Controller methods
     */

    /// @inheritdoc IController
    function managingFund() public view returns (uint256) {
        return ausdc.balanceOf(address(this));
    }

    /// @inheritdoc IController
    function adjustFund() external {
        uint256 expectUtilizeAmount = (totalValueAll() * maxManagingRatio) / MAGIC_SCALE_1E6;
        if (expectUtilizeAmount > managingFund()) {
            unchecked {
                uint256 _shortage = expectUtilizeAmount - managingFund();
                _pullFund(_shortage);
            }
        }
    }

    /// @inheritdoc IController
    function returnFund(uint256 _amount) external onlyVault {
        _unutilize(_amount);
        usdc.safeTransfer(address(vault), _amount);

        emit FundReturned(address(vault), _amount);
    }

    /// @inheritdoc IController
    function setMaxManagingRatio(uint256 _ratio) external onlyOwner withinValidRatio(_ratio) {
        maxManagingRatio = _ratio;
        emit MaxManagingRatioSet(_ratio);
    }

    /// @inheritdoc IController
    function emigrate(address _to) external onlyVault {
        if (_to == address(0)) revert ZeroAddress();

        // liquidate all positions
        _withdrawAllReward();
        uint256 _underlying = managingFund();
        if (_underlying != 0) {
            aave.withdraw(address(usdc), _underlying, address(this));
        }

        // approve to pull all balance
        usdc.safeApprove(_to, type(uint256).max);

        uint256 _migrateAmount = usdc.balanceOf(address(this));

        IController(_to).immigrate(address(this));

        emit FundEmigrated(_to, _migrateAmount);
    }

    /// @inheritdoc IController
    function immigrate(address _from) external {
        if (_from == address(0)) revert ZeroAddress();
        if (_from == address(this)) revert MigrateToSelf();
        if (managingFund() != 0) revert AlreadyInUse();

        uint256 _amount = usdc.balanceOf(_from);

        usdc.safeTransferFrom(_from, address(this), _amount);

        emit FundImmigrated(_from, _amount);

        _utilize(_amount);
    }

    /// @inheritdoc IController
    function emergencyExit(address _to) external onlyOwner {
        if (_to == address(0)) revert ZeroAddress();

        uint256 _transferAmount = managingFund();
        IERC20(ausdc).safeTransfer(_to, _transferAmount);

        emit EmergencyExit(_to, _transferAmount);
    }

    /// @inheritdoc IController
    function currentManagingRatio() public view returns (uint256) {
        return _calcManagingRatio(managingFund());
    }

    /// @dev Internal function to pull fund from a vault. This is called only in adjustFund().
    function _pullFund(uint256 _amount) internal {
        if (_calcManagingRatio(managingFund() + _amount) > maxManagingRatio) revert ExceedManagingRatio();

        // receive usdc from the vault
        vault.utilize(_amount);
        emit FundPulled(address(vault), _amount);

        // directly utilize all amount
        _utilize(_amount);
    }

    /// @notice Returns sum of vault available asset and controller managing fund.
    function totalValueAll() public view returns (uint256) {
        return vault.available() + managingFund();
    }

    /// @dev Calculate what percentage of a vault fund to be utilized from amount given.
    function _calcManagingRatio(uint256 _amount) internal view returns (uint256 _managingRatio) {
        unchecked {
            _managingRatio = (_amount * MAGIC_SCALE_1E6) / totalValueAll();
        }
    }

    /**
     * Strategy methods
     */

    /**
     * @notice Claims all reward token, then compounds it automatically.
     * @param _token token address to be swapped
     * @param _amount what amount of the token to be swapped
     * @param _minAmountOut minimum amount of USDC caller expects to receive.
     *                      This prevent MEV attacks.
     */
    function compound(address _token, uint256 _amount, uint256 _minAmountOut) external onlyOps {
        if (_token == address(0)) revert ZeroAddress();
        if (_amount == 0) revert AmountZero();
        if (_minAmountOut == 0) revert AmountZero();
        uint256 _reward = aaveReward.claimRewards(supplyingAssets, _amount, address(this), _token);
        IERC20(_token).safeIncreaseAllowance(exchangeLogic.swapper(), _reward);
        uint256 _swapped = _swap(_token, address(usdc), _reward, _minAmountOut);
        _utilize(_swapped);
    }

    /**
     * @inheritdoc OpsReady
     * @notice Check the rewards can be compounded. If the contract has sufficient reward,
     *         returns compound() function payload to execute.
     */
    function check() external override returns (bool _canExec, bytes memory _execPayload) {
        // default payload is the error message
        _execPayload = bytes("No enough reward to withdraw");
        // all token addresse and reward amount list
        (address[] memory _tokens, uint256[] memory _rewards) = getUnclaimedRewards();

        // check if any reward is eligible for compound
        uint256 _rewardsLength = _tokens.length;
        for (uint256 i = 0; i < _rewardsLength; ) {
            address _token = _tokens[i];
            uint256 _reward = _rewards[i];
            uint256 _estimatedOutUsdc = _reward != 0
                ? exchangeLogic.estimateAmountOut(_token, address(usdc), _reward)
                : 0;
            uint256 _minAmountOut = (_estimatedOutUsdc * exchangeLogic.slippageTolerance()) / MAGIC_SCALE_1E6;
            _canExec = _minAmountOut >= minOpsTrigger;
            // unclaimed reward is larger than trigger, compound will be executed
            if (_canExec) {
                _execPayload = abi.encodeWithSelector(this.compound.selector, _token, _reward, _minAmountOut);
                break;
            }

            unchecked {
                ++i;
            }
        }
    }

    function setOps(address _ops) external onlyOwner {
        if (_ops == address(0)) revert ZeroAddress();
        ops = _ops;
    }

    function setMinOpsTrigger(uint256 _min) external onlyOwner {
        if (_min == 0) revert AmountZero();
        minOpsTrigger = _min;
    }

    /**
     * @notice Sets aaveMaxOccupancyRatio
     * @param _ratio The portion of the aave total supply
     */
    function setAaveMaxOccupancyRatio(uint256 _ratio) external onlyOwner withinValidRatio(_ratio) {
        aaveMaxOccupancyRatio = _ratio;
        emit MaxOccupancyRatioSet(_ratio);
    }

    /**
     * @notice Sets exchangeLogic contract for the strategy
     * @param _exchangeLogic ExchangeLogic contract
     */
    function setExchangeLogic(IExchangeLogic _exchangeLogic) public onlyOwner {
        _setExchangeLogic(_exchangeLogic);
    }

    /**
     * @notice Gets amount of unclaimed reward token from Aave.
     */
    function getUnclaimedRewards() public view returns (address[] memory _tokens, uint256[] memory _rewards) {
        (_tokens, _rewards) = aaveReward.getAllUserRewards(supplyingAssets, address(this));
    }

    function currenRewardTokens() external view returns (address[] memory _tokens) {
        (_tokens, ) = aaveReward.getAllUserRewards(supplyingAssets, address(this));
    }

    /**
     * @notice this function called when migration is being executed.
     */
    function _withdrawAllReward() internal {
        (address[] memory _rewards, uint256[] memory _gotRewards) = aaveReward.claimAllRewards(
            supplyingAssets,
            address(this)
        );

        // compound each reward tokens got
        uint256 _rewardsCount = _rewards.length;
        for (uint256 i = 0; i < _rewardsCount; ) {
            address _rewardToken = _rewards[i];
            uint256 _amount = _gotRewards[i];
            if (_amount > 0) {
                IERC20(_rewardToken).safeIncreaseAllowance(exchangeLogic.swapper(), _amount);
                // execute swap regardless any slippage
                _swap(_rewardToken, address(usdc), _amount, 1);
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Supplies given amount of USDC to Aave pool. If all supplying asset of this contract exceeds
     *      Aave total supply, transaction failed to be revereted.
     * @param _amount The amount of USDC to supply
     */
    function _utilize(uint256 _amount) internal {
        if (_amount == 0) revert AmountZero();
        if (managingFund() + _amount > _calcAaveNewSupplyCap()) revert AaveSupplyCapExceeded();

        // supply utilized assets into aave pool
        usdc.approve(address(aave), _amount);
        aave.supply(address(usdc), _amount, address(this), 0);
        emit SupplyIncreased(address(usdc), _amount);
    }

    /**
     * @dev Withdraws given amount of supplying USDC from Aave pool.
     * @param _amount The amount of USDC to withdraw
     */
    function _unutilize(uint256 _amount) internal {
        if (_amount == 0) revert AmountZero();
        if (_amount > managingFund()) revert InsufficientManagingFund();

        aave.withdraw(address(usdc), _amount, address(this));
        emit SupplyDecreased(address(usdc), _amount);
    }

    /**
     * @dev Calculates the amount limit of aUSDC token to be supplied.
     */
    function _calcAaveNewSupplyCap() internal view returns (uint256 _available) {
        uint256 _reserve = ausdc.totalSupply();

        unchecked {
            _available = (_reserve * aaveMaxOccupancyRatio) / MAGIC_SCALE_1E6;
        }
    }

    /**
     * @dev Internal function that actually set exchange logic to the contract.
     */
    function _setExchangeLogic(IExchangeLogic _exchangeLogic) private {
        if (address(_exchangeLogic) == address(0)) revert ZeroAddress();
        if (address(_exchangeLogic) == address(exchangeLogic)) revert SameAddressUsed();
        // check the given address is valid
        assert(_exchangeLogic.swapper() != address(0));

        address _oldSwapper = exchangeLogic.swapper();
        address[] memory _rewards = aaveReward.getRewardsByAsset(address(ausdc));
        uint256 _rewardsCount = _rewards.length;
        //revoke allowance of current swapper
        for (uint256 i = 0; i < _rewardsCount; ) {
            IERC20(_rewards[i]).safeApprove(_oldSwapper, 0);

            unchecked {
                ++i;
            }
        }

        //update, and approve to new swapper
        exchangeLogic = _exchangeLogic;
        emit ExchangeLogicSet(address(_exchangeLogic));
    }

    /**
     * @dev Swap function to be used reward token conversion.
     *      You can see more details in the IExchangeLogic interface.
     */
    function _swap(address _tokenIn, address _tokenOut, uint256 _amountIn, uint256 _minAmountOut)
        internal
        returns (uint256)
    {
        address _swapper = exchangeLogic.swapper();
        (bool _success, bytes memory _res) = _swapper.call(
            exchangeLogic.abiEncodeSwap(_tokenIn, _tokenOut, _amountIn, _minAmountOut, address(this))
        );

        if (!_success) revert NoRewardClaimable();

        uint256 _swapped = abi.decode(_res, (uint256));
        emit SwapSucceeded(_tokenIn, _tokenOut, _amountIn, _swapped);

        return _swapped;
    }
}
