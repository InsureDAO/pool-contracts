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

contract AaveV3Strategy is IController {
    using SafeERC20 for IERC20;

    IOwnership public immutable ownership;
    IVault public immutable vault;
    IAaveV3Pool public immutable aave;
    IAaveV3Reward public immutable aaveReward;
    IExchangeLogic public exchangeLogic;

    IERC20 public immutable usdc;
    IERC20 public immutable ausdc;
    IERC20 public aaveRewardToken;
    address[] public supplyingAssets;

    uint256 public maxManagingRatio;
    uint256 public managingFund;

    uint256 public aaveMaxOccupancyRatio;

    /**
    @notice internal multiplication scale 1e6 to reduce decimal truncation
    */
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
    }

    /**
     * Controller methods
     */
    function adjustFund() external override {
        uint256 expectUtilizeAmount = (totalValueAll() * maxManagingRatio) / MAGIC_SCALE_1E6;
        if (expectUtilizeAmount > managingFund) {
            unchecked {
                uint256 _shortage = expectUtilizeAmount - managingFund;
                _pullFund(_shortage);
            }
        }
    }

    function _pullFund(uint256 _amount) internal {
        if (_calcManagingRatio(managingFund + _amount) > maxManagingRatio) revert ExceedManagingRatio();

        // receive usdc from the vault
        vault.utilize(_amount);

        unchecked {
            managingFund += _amount;
        }
        // directly utilize all amount
        _utilize(_amount);
    }

    function returnFund(uint256 _amount) external onlyVault {
        _unutilize(_amount);
        usdc.safeTransfer(address(vault), _amount);

        unchecked {
            managingFund -= _amount;
        }
    }

    function emigrate(address _to) external override onlyVault {
        if (_to == address(0)) revert ZeroAddress();

        // liquidate all positions
        aave.withdraw(address(usdc), ausdc.balanceOf(address(this)), address(this));

        // approve to pull all assets
        usdc.safeApprove(_to, type(uint256).max);

        IController(_to).immigrate(address(this));

        managingFund = 0;
    }

    function immigrate(address _from) external override {
        if (_from == address(0)) revert ZeroAddress();
        if (_from == address(this)) revert MigrateToSelf();
        if (managingFund != 0) revert AlreadyInUse();

        uint256 _amount = IController(_from).managingFund();

        usdc.safeTransferFrom(_from, address(this), _amount);

        _utilize(_amount);

        managingFund = _amount;
    }

    function currentManagingRatio() public view returns (uint256) {
        return _calcManagingRatio(valueAll());
    }

    function _calcManagingRatio(uint256 _amount) internal view returns (uint256 _managingRatio) {
        unchecked {
            _managingRatio = (_amount * MAGIC_SCALE_1E6) / totalValueAll();
        }
    }

    function totalValueAll() public view returns (uint256) {
        return vault.available() + valueAll();
    }

    function valueAll() public view override returns (uint256) {
        return managingFund;
    }

    /**
     * Strategy methods
     */
    function _utilize(uint256 _amount) internal {
        if (_amount == 0) revert AmountZero();
        if (_amount > _calcAaveNewSupplyCap()) revert AaveSupplyCapExceeded();

        // supply utilized assets into aave pool
        usdc.approve(address(aave), _amount);
        aave.supply(address(usdc), _amount, address(this), 0);
    }

    function _unutilize(uint256 _amount) internal {
        if (_amount == 0) revert AmountZero();
        if (_amount > managingFund) revert InsufficientManagingFund();

        aave.withdraw(address(usdc), _amount, address(this));
    }

    function setMaxManagingRatio(uint256 _ratio) external override onlyOwner withinValidRatio(_ratio) {
        maxManagingRatio = _ratio;
    }

    function setExchangeLogic(IExchangeLogic _exchangeLogic) public onlyOwner {
        _setExchangeLogic(_exchangeLogic);
    }

    function setAaveRewardToken(IERC20 _token) public onlyOwner {
        if (address(_token) == address(0)) revert ZeroAddress();
        aaveRewardToken = _token;
    }

    function withdrawReward(uint256 _amount) external onlyOwner {
        if (_amount == 0) revert AmountZero();
        if (_amount > getUnclaimedReward()) revert InsufficientRewardToWithdraw();

        aaveReward.claimRewards(supplyingAssets, _amount, address(this), address(aaveRewardToken));

        uint256 _swapped = _swap(address(aaveRewardToken), address(usdc), _amount);

        // compound swapped usdc
        _utilize(_swapped);

        managingFund += _swapped;
    }

    function withdrawAllReward() external onlyOwner {
        if (getUnclaimedReward() == 0) revert NoRewardClaimable();

        aaveReward.claimAllRewards(supplyingAssets, address(this));

        uint256 _swapped = _swap(address(aaveRewardToken), address(usdc), aaveRewardToken.balanceOf(address(this)));

        // compound swapped usdc
        _utilize(_swapped);

        managingFund += _swapped;
    }

    function getUnclaimedReward() public view returns (uint256) {
        return aaveReward.getUserRewards(supplyingAssets, address(this), address(aaveRewardToken));
    }

    function _calcAaveNewSupplyCap() internal view returns (uint256 _available) {
        uint256 _reserve = ausdc.totalSupply();

        unchecked {
            _available = (_reserve * aaveMaxOccupancyRatio) / MAGIC_SCALE_1E6;
        }
    }

    function _setExchangeLogic(IExchangeLogic _exchangeLogic) private {
        if (address(_exchangeLogic) == address(0)) revert ZeroAddress();
        if (address(_exchangeLogic) == address(exchangeLogic)) revert SameAddressUsed();
        exchangeLogic = _exchangeLogic;

        address _swapper = exchangeLogic.swapper();
        usdc.safeApprove(_swapper, type(uint256).max);
        IERC20(aaveRewardToken).safeApprove(_swapper, type(uint256).max);
    }

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
        aaveRewardToken.approve(_swapper, _amountIn);
        (bool _success, bytes memory _res) = _swapper.call(
            exchangeLogic.abiEncodeSwap(_tokenIn, _tokenOut, _amountIn, _amountOutMin, address(this))
        );

        if (!_success) revert NoRewardClaimable();

        uint256 _swapped = abi.decode(_res, (uint256));

        return _swapped;
    }

    function _abs(int256 _number) internal pure returns (uint256) {
        return _number >= 0 ? uint256(_number) : uint256(-_number);
    }
}
