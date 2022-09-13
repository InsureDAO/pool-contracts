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
            IERC20(aaveRewardToken)
        );
        vm.expectRevert(ZeroAddress.selector);
        _newController.immigrate(address(0));
    }

    function testCannotImmigrateFromNonController() public {
        IController _newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken)
        );
        vm.expectRevert();
        _newController.immigrate(alice);
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
            IERC20(aaveRewardToken)
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
            IERC20(aaveRewardToken)
        );
        vm.expectRevert(AlreadyInUse.selector);
        strategy.immigrate(address(_newController));
    }

    function testCannotImmigrateFromSelf() public {
        vm.expectRevert(MigrateToSelf.selector);
        strategy.immigrate(address(strategy));
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

    function testCannotSetAaveRewardTokenWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        strategy.setAaveRewardToken(IERC20(aaveRewardToken));
    }

    function testCannotSetZeroAddressToAaveRewardToken() public {
        vm.prank(deployer);
        vm.expectRevert(ZeroAddress.selector);
        strategy.setAaveRewardToken(IERC20(address(0)));
    }

    function testFailSetNonERC20ToAaveRewardToken() public {
        vm.prank(deployer);
        vm.expectRevert();
        strategy.setAaveRewardToken(IERC20(alice));
    }

    function testCannotWithdrawRewardWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        strategy.withdrawReward(1);
    }

    function testCannotWithdrawRewardForAmountZero() public {
        vm.prank(deployer);
        vm.expectRevert(AmountZero.selector);
        strategy.withdrawReward(0);
    }

    function testCannotWithdrawRewardForInsufficientAmount() public {
        vm.prank(deployer);
        vm.expectRevert(InsufficientRewardToWithdraw.selector);
        strategy.withdrawReward(1);
    }

    function testCannotWithdrawAllRewardWithoutOwner() public {
        vm.expectRevert(OnlyOwner.selector);
        strategy.withdrawAllReward();
    }

    function testCannotWithdrawAllRewardForNoBalance() public {
        vm.prank(deployer);
        vm.expectRevert(NoRewardClaimable.selector);
        strategy.withdrawAllReward();
    }
}
