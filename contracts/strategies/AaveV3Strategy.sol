// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

import "../interfaces/IController.sol";
import "../interfaces/IOwnership.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IAaveV3Pool.sol";
import "../interfaces/IAaveV3Reward.sol";

contract AaveV3Strategy is IController {
    using SafeERC20 for IERC20;

    IOwnership public immutable ownership;
    IVault public immutable vault;
    IAaveV3Pool public immutable aave;
    IAaveV3Reward public immutable aaveReward;

    IERC20 public immutable usdc;
    IERC20 public immutable ausdc;
    address public immutable aaveRewardToken;
    address[] public supplyingAssets;

    uint256 public maxSupplyRatio;
    uint256 public maxUtilizationRatio;
    uint256 public utilizedAmount;

    /**
    @notice internal multiplication scale 1e6 to reduce decimal truncation
    */
    uint256 private constant MAGIC_SCALE_1E6 = 1e6; //

    modifier onlyOwner() {
        require(ownership.owner() == msg.sender, "Caller is not allowed to operate");
        _;
    }

    modifier onlyVault() {
        require(msg.sender == address(vault), "Vault can only utilize the balance");
        _;
    }

    modifier validUtilizeToken(address _utilizedToken) {
        require(_utilizedToken == address(usdc), "Unsupported token address");
        _;
    }

    modifier withinValidRatio(uint256 _ratio) {
        require(_ratio <= MAGIC_SCALE_1E6, "Exceeded limit for ratio");
        _;
    }

    constructor(
        address _ownership,
        address _vault,
        address _aave,
        address _aaveReward,
        address _usdc,
        address _ausdc,
        address _aaveRewardToken
    ) {
        ownership = IOwnership(_ownership);
        vault = IVault(_vault);
        aave = IAaveV3Pool(_aave);
        aaveReward = IAaveV3Reward(_aaveReward);
        usdc = IERC20(_usdc);
        ausdc = IERC20(_ausdc);
        aaveRewardToken = _aaveRewardToken;
        supplyingAssets.push(_usdc);

        maxUtilizationRatio = MAGIC_SCALE_1E6;
        maxSupplyRatio = MAGIC_SCALE_1E6;
    }

    function utilize(address _token, uint256 _amount) external override validUtilizeToken(_token) {
        _utilize(_amount);
    }

    function _utilize(uint256 _amount) internal {
        require(
            _calcUtilizationRatio(utilizedAmount + _amount) <= maxUtilizationRatio,
            "Exceeded max utilization ratio"
        );

        usdc.safeTransferFrom(address(vault), address(this), _amount);

        utilizedAmount += _amount;
    }

    function unutilize(address _token, uint256 _amount) external override validUtilizeToken(_token) {
        _unutilize(_amount);
    }

    function _unutilize(uint256 _amount) internal {
        uint256 _available = usdc.balanceOf(address(this));

        if (_amount > _available) {
            uint256 _coverAmount;
            unchecked {
                _coverAmount = _amount - _available;
            }
            require(ausdc.balanceOf(address(this)) >= _coverAmount, "Cannot cover the requested amount");

            aave.withdraw(address(usdc), _coverAmount, address(this));
        }

        utilizedAmount -= _amount;

        usdc.safeTransfer(address(vault), _amount);
    }

    function adjustUtilization() external override {
        int256 _shouldUtilizedRatio = int256(maxUtilizationRatio) - int256(currentUtilizationRatio());
        uint256 _diffAmount = (vault.available() * _abs(_shouldUtilizedRatio)) / MAGIC_SCALE_1E6;

        if (_shouldUtilizedRatio != 0) {
            _shouldUtilizedRatio > 0 ? _utilize(_diffAmount) : _unutilize(_diffAmount);
        }
    }

    function emigrate(address _to) external override onlyOwner {
        // liquidate all positions
        aave.withdraw(address(usdc), ausdc.balanceOf(address(this)), address(this));

        usdc.safeApprove(_to, type(uint256).max);

        IController(_to).immigrate(address(this));

        utilizedAmount = 0;
    }

    function immigrate(address _from) external override {
        require(utilizedAmount == 0, "Already in use");

        usdc.safeTransferFrom(_from, address(this), usdc.balanceOf(_from));
        utilizedAmount = IController(_from).utilizedAmount();
    }

    function valueAll() public view override returns (uint256) {
        uint256 _usdc = usdc.balanceOf(address(this));
        uint256 _ausdc = ausdc.balanceOf(address(this));
        uint256 _pendingReward = getAccruedReward();

        return _usdc + _ausdc + _pendingReward;
    }

    function setMaxUtilizationRatio(uint256 _ratio) external override onlyOwner withinValidRatio(_ratio) {
        maxUtilizationRatio = _ratio;
    }

    function setMaxSupplyRatio(uint256 _ratio) external onlyOwner withinValidRatio(_ratio) {
        maxSupplyRatio = _ratio;
    }

    function supply(uint256 _amount) external {
        uint256 _expectedSupply = ausdc.balanceOf(address(this)) + _amount;
        require(_calcSuppliedAssetsRatio(_expectedSupply) <= maxSupplyRatio, "Exceeded supply limit of the controller");

        aave.supply(address(usdc), _amount, address(this), 0);
    }

    function withdraw(uint256 _amount) external {
        require(ausdc.balanceOf(address(this)) >= _amount, "Insufficient supply for withdraw");

        aave.withdraw(address(usdc), _amount, address(this));
    }

    function withdrawReward(uint256 _amount, address _to) external onlyOwner {
        require(_to != address(0), "Zero address specified");
        require(_amount != 0, "No amount specified");
        require(_amount > getAccruedReward(), "Insufficient reward to withdraw");

        aaveReward.claimRewards(supplyingAssets, _amount, _to, aaveRewardToken);
    }

    function withdrawAllReward(address _to) external onlyOwner {
        require(_to != address(0), "Zero address specified");
        require(getAccruedReward() > 0, "No reward claimable");

        aaveReward.claimAllRewards(supplyingAssets, _to);
    }

    function getAccruedReward() public view returns (uint256) {
        return aaveReward.getUserAccruedRewards(address(this), aaveRewardToken);
    }

    function currentUtilizationRatio() public view returns (uint256) {
        return _calcUtilizationRatio(valueAll());
    }

    function _calcUtilizationRatio(uint256 _amount) internal view returns (uint256) {
        uint256 _totalBalance = vault.available() + valueAll();

        return (_amount * MAGIC_SCALE_1E6) / _totalBalance;
    }

    function _calcSuppliedAssetsRatio(uint256 _amount) internal view returns (uint256) {
        uint256 _utilizedAssets = currentUtilizationRatio() * vault.available();

        return (_amount / _utilizedAssets) * MAGIC_SCALE_1E6;
    }

    function _calcSuppliedAssetsRatio() internal view returns (uint256) {
        uint256 _utilizedAssets = currentUtilizationRatio() * vault.available();

        return (ausdc.balanceOf(address(this)) / _utilizedAssets) * MAGIC_SCALE_1E6;
    }

    function _abs(int256 _number) internal pure returns (uint256) {
        return _number >= 0 ? uint256(_number) : uint256(-_number);
    }
}
