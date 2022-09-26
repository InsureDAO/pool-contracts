// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
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
contract AaveV3Strategy is IController {
    using SafeERC20 for IERC20;

    IOwnership public immutable ownership;
    IVault public immutable vault;
    IAaveV3Pool public immutable aave;
    IAaveV3Reward public immutable aaveReward;
    IExchangeLogic public exchangeLogic;

    /// @inheritdoc IController
    uint256 public maxManagingRatio;

    /// @inheritdoc IController
    uint256 public managingFund;

    /// @notice We use usdc as vault asset
    IERC20 public immutable usdc;

    /// @dev Supplying USDC to Aave pool, aUSDC is minted as your position.
    IERC20 public immutable ausdc;

    /// @notice Reward token could be changed by Aave. Owner need to reflect it properly.
    IERC20 public aaveRewardToken;

    /// @dev Current supplying assets array used to claim reward. This should be a*** token.
    address[] public supplyingAssets;

    /// @dev This variable is significant to avoid locking asset in Aave pool.
    uint256 public aaveMaxOccupancyRatio;

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
        IERC20 _aaveRewardToken
    ) {
        ownership = _ownership;
        vault = _vault;
        exchangeLogic = _exchangeLogic;
        aave = _aave;
        aaveReward = _aaveReward;
        usdc = _usdc;
        ausdc = _ausdc;
        aaveRewardToken = _aaveRewardToken;
        supplyingAssets.push(address(_ausdc));

        maxManagingRatio = MAGIC_SCALE_1E6;
        aaveMaxOccupancyRatio = (MAGIC_SCALE_1E6 * 10) / 100;

        address _swapper = IExchangeLogic(exchangeLogic).swapper();
        IERC20(aaveRewardToken).safeApprove(_swapper, type(uint256).max);
    }

    /**
     * Controller methods
     */

    /// @inheritdoc IController
    function adjustFund() external override {
        uint256 expectUtilizeAmount = (totalValueAll() * maxManagingRatio) / MAGIC_SCALE_1E6;
        if (expectUtilizeAmount > managingFund) {
            unchecked {
                uint256 _shortage = expectUtilizeAmount - managingFund;
                _pullFund(_shortage);
            }
        }
    }

    /// @inheritdoc IController
    function returnFund(uint256 _amount) external onlyVault {
        _unutilize(_amount);
        usdc.safeTransfer(address(vault), _amount);

        unchecked {
            managingFund -= _amount;
        }

        emit FundReturned(address(vault), _amount);
    }

    /// @inheritdoc IController
    function setMaxManagingRatio(uint256 _ratio) external override onlyOwner withinValidRatio(_ratio) {
        maxManagingRatio = _ratio;
        emit MaxManagingRatioSet(_ratio);
    }

    /// @inheritdoc IController
    function emigrate(address _to) external override onlyVault {
        if (_to == address(0)) revert ZeroAddress();

        // liquidate all positions
        uint256 _aaveBalance = ausdc.balanceOf(address(this));
        if (_aaveBalance != 0) {
            aave.withdraw(address(usdc), _aaveBalance, address(this));
        }

        // approve to pull all assets
        usdc.safeApprove(_to, type(uint256).max);

        IController(_to).immigrate(address(this));

        emit FundEmigrated(_to, managingFund);

        managingFund = 0;
    }

    /// @inheritdoc IController
    function immigrate(address _from) external override {
        if (_from == address(0)) revert ZeroAddress();
        if (_from == address(this)) revert MigrateToSelf();
        if (managingFund != 0) revert AlreadyInUse();

        uint256 _amount = IController(_from).managingFund();

        usdc.safeTransferFrom(_from, address(this), _amount);

        emit FundImmigrated(_from, _amount);

        _utilize(_amount);

        managingFund = _amount;
    }

    /// @inheritdoc IController
    function emergencyExit(address _to) external onlyOwner {
        if (_to == address(0)) revert ZeroAddress();

        uint256 _aaveBalance = ausdc.balanceOf(address(this));
        IERC20(ausdc).safeTransfer(_to, _aaveBalance);

        emit EmergencyExit(_to, _aaveBalance);

        managingFund -= _aaveBalance;
    }

    /// @inheritdoc IController
    function currentManagingRatio() public view returns (uint256) {
        return _calcManagingRatio(managingFund);
    }

    /// @dev Internal function to pull fund from a vault. This is called only in adjustFund().
    function _pullFund(uint256 _amount) internal {
        if (_calcManagingRatio(managingFund + _amount) > maxManagingRatio) revert ExceedManagingRatio();

        // receive usdc from the vault
        vault.utilize(_amount);
        emit FundPulled(address(vault), _amount);

        // directly utilize all amount
        _utilize(_amount);

        unchecked {
            managingFund += _amount;
        }
    }

    /// @notice Returns sum of vault available asset and controller managing fund.
    function totalValueAll() public view returns (uint256) {
        return vault.available() + managingFund;
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
     * @notice Sets Aave reward token to be claimed as a token could be changed.
     * @param _token New reward token to be claimed
     */
    function setAaveRewardToken(IERC20 _token) public onlyOwner {
        if (address(_token) == address(0)) revert ZeroAddress();

        address _swapper = exchangeLogic.swapper();

        //revoke old token's allowance to the swapper
        IERC20(aaveRewardToken).safeApprove(_swapper, 0);

        aaveRewardToken = _token;
        emit RewardTokenSet(address(_token));

        //approve new token to the swapper
        IERC20(_token).safeApprove(_swapper, type(uint256).max);
    }

    /**
     * @notice Claims specific amount of reward token. Claimed token is automatically compounded
     * @param _amount The amount of reward token to be claimed
     */
    function withdrawReward(uint256 _amount) external onlyOwner {
        if (_amount == 0) revert AmountZero();
        if (_amount > getUnclaimedReward()) revert InsufficientRewardToWithdraw();

        aaveReward.claimRewards(supplyingAssets, _amount, address(this), address(aaveRewardToken));
        emit RewardClaimed(address(aaveRewardToken), _amount);

        uint256 _swapped = _swap(address(aaveRewardToken), address(usdc), _amount);

        // compound swapped usdc
        _utilize(_swapped);

        managingFund += _swapped;
    }

    /**
     * @notice Claim all reward token. Claimed token is automatically compounded
     */
    function withdrawAllReward() external onlyOwner {
        uint256 _claimable = getUnclaimedReward();
        if (_claimable == 0) revert NoRewardClaimable();

        aaveReward.claimAllRewards(supplyingAssets, address(this));
        emit RewardClaimed(address(aaveRewardToken), _claimable);

        uint256 _swapped = _swap(address(aaveRewardToken), address(usdc), aaveRewardToken.balanceOf(address(this)));

        // compound swapped usdc
        _utilize(_swapped);

        managingFund += _swapped;
    }

    /**
     * @notice Gets amount of unclaimed reward token from Aave.
     */
    function getUnclaimedReward() public view returns (uint256) {
        return aaveReward.getUserRewards(supplyingAssets, address(this), address(aaveRewardToken));
    }

    /**
     * @dev Supplies given amount of USDC to Aave pool. If all supplying asset of this contract exceeds
     *      Aave total supply, transaction failed to be revereted.
     * @param _amount The amount of USDC to supply
     */
    function _utilize(uint256 _amount) internal {
        if (_amount == 0) revert AmountZero();
        if (managingFund + _amount > _calcAaveNewSupplyCap()) revert AaveSupplyCapExceeded();

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
        if (_amount > managingFund) revert InsufficientManagingFund();

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

        //revoke allowance of current swapper
        address _oldSwapper = exchangeLogic.swapper();
        IERC20(aaveRewardToken).safeApprove(_oldSwapper, 0);

        //update, and approve to new swapper
        exchangeLogic = _exchangeLogic;
        emit ExchangeLogicSet(address(_exchangeLogic));

        address _swapper = _exchangeLogic.swapper();
        IERC20(aaveRewardToken).safeApprove(_swapper, type(uint256).max);
    }

    /**
     * @dev Swap function to be used reward token conversion.
     *      You can see more details in the IExchangeLogic interface.
     */
    function _swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) internal returns (uint256) {
        uint256 _amountOutMin;
        unchecked {
            uint256 _estimatedAmount = exchangeLogic.estimateAmountOut(_tokenIn, _tokenOut, _amountIn);
            _amountOutMin = (_estimatedAmount * exchangeLogic.slippageTolerance()) / MAGIC_SCALE_1E6;
        }

        address _swapper = exchangeLogic.swapper();
        (bool _success, bytes memory _res) = _swapper.call(
            exchangeLogic.abiEncodeSwap(_tokenIn, _tokenOut, _amountIn, _amountOutMin, address(this))
        );

        if (!_success) revert NoRewardClaimable();

        uint256 _swapped = abi.decode(_res, (uint256));
        emit SwapSucceeded(_tokenIn, _tokenOut, _amountIn, _swapped);

        return _swapped;
    }
}
