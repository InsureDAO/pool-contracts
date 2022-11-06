// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "./AaveV3StrategySetUp.sol";

contract AaveV3StrategyErrorTest is AaveV3StrategySetUp {
    /**
     * Controller methods
     */
    function testCannotReturnFundWithoutVault() public {
        uint256 _managingFund = strategy.managingFund();
        vm.expectRevert(OnlyVault.selector);
        strategy.returnFund(_managingFund + 1);
    }

    function testCannotReturnFundAmountExceed() public {
        uint256 _managingFund = strategy.managingFund();
        vm.expectRevert(InsufficientManagingFund.selector);
        vm.prank(address(vault));
        strategy.returnFund(_managingFund + 1);
    }

    function testCannotEmigrateWithoutVault() public {
        vm.expectRevert(OnlyVault.selector);
        strategy.emigrate(alice);
    }

    function testCannotEmigrateToZeroAddress() public {
        vm.expectRevert(ZeroAddress.selector);
        vm.prank(address(vault));
        strategy.emigrate(address(0));
    }

    function testCannotEmigrateToNonController() public {
        vm.expectRevert();
        vm.prank(address(vault));
        strategy.emigrate(alice);
    }

    function testCannotImmigrateFromZeroAddress() public {
        IController _newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            gelatoOps
        );
        vm.expectRevert(ZeroAddress.selector);
        _newController.immigrate(address(0));
    }

    function testFailImmigrateWithoutApprove() public {
        IController _newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            gelatoOps
        );
        _newController.immigrate(address(strategy));
    }

    function testCannotImmigrateAlreadyInUsed() public {
        IController _newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            gelatoOps
        );
        vm.expectRevert(AlreadyInUse.selector);
        strategy.immigrate(address(_newController));
    }

    function testCannotImmigrateFromSelf() public {
        vm.expectRevert(MigrateToSelf.selector);
        strategy.immigrate(address(strategy));
    }

    function testCannotEmergencyExitWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        vm.prank(alice);
        strategy.emergencyExit(alice);
    }

    /**
     * Strategy methods
     */

    function testCannotSetExceededManagingRatio() public {
        vm.prank(deployer);
        vm.expectRevert(RatioOutOfRange.selector);
        strategy.setMaxManagingRatio(1e6 + 1);
    }

    function testCannotSetExchangeLogicWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        strategy.setExchangeLogic(exchangeLogic);
    }

    function testCannotSetSameExchangeLogicAddress() public {
        vm.prank(deployer);
        vm.expectRevert(SameAddressUsed.selector);
        strategy.setExchangeLogic(exchangeLogic);
    }

    function testCannotSetZeroAddressToExchangeLogic() public {
        vm.prank(deployer);
        vm.expectRevert(ZeroAddress.selector);
        strategy.setExchangeLogic(IExchangeLogic(address(0)));
    }

    function testCannotSetNonExchangeController() public {
        vm.prank(deployer);
        vm.expectRevert();
        strategy.setExchangeLogic(IExchangeLogic(alice));
    }

    function testCannotSetMinOpsTriggerZero() public {
        vm.prank(deployer);
        vm.expectRevert(AmountZero.selector);
        strategy.setMinOpsTrigger(0);
    }

    function testCannotSetMinOpsTriggerWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        strategy.setMinOpsTrigger(10e6);
    }

    function testCannotCompoundWithoutOps() public {
        if (!isRewardActive()) return;
        skip(1e6);
        (address[] memory _tokens, uint256[] memory _rewards) = strategy.getUnclaimedRewards();
        address _token = _tokens[0];
        uint256 _unclaimed = _rewards[0];
        uint256 _expectedUsdcOut = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _unclaimed);
        uint256 _minAmountOut = (_expectedUsdcOut * exchangeLogic.slippageTolerance()) / 1e6;
        vm.expectRevert(OnlyOps.selector);
        strategy.compound(_token, _unclaimed, _minAmountOut);
    }

    function testCannotCompoundAmountOrAddressZero() public {
        if (!isRewardActive()) return;
        skip(1e6);
        (address[] memory _tokens, uint256[] memory _rewards) = strategy.getUnclaimedRewards();
        address _token = _tokens[0];
        uint256 _unclaimed = _rewards[0];
        uint256 _expectedUsdcOut = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _unclaimed);
        uint256 _minAmountOut = (_expectedUsdcOut * exchangeLogic.slippageTolerance()) / 1e6;
        vm.startPrank(gelatoOps);
        vm.expectRevert(AmountZero.selector);
        strategy.compound(_token, 0, _minAmountOut);
        vm.expectRevert(AmountZero.selector);
        strategy.compound(_token, _unclaimed, 0);
        vm.expectRevert(ZeroAddress.selector);
        strategy.compound(address(0), _unclaimed, _minAmountOut);
        vm.stopPrank();
    }

    function testCannotSetOpsWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        strategy.setOps(alice);
    }
}
