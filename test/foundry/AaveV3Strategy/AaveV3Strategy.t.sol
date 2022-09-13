// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "forge-std/Test.sol";

import "../utils/AddressHelper.sol";

import "./AaveV3StrategySetUp.sol";

contract AaveV3StrategyTest is AaveV3StrategySetUp {
    function setUp() public {
        vault = new Vault(usdc, address(registry), address(0), address(ownership));
        strategy = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken)
        );
        // approve unlimited transfer
        vm.prank(dealer);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(alice);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(bob);
        IERC20(usdc).approve(address(vault), type(uint256).max);

        vm.prank(dealer);
        vault.addValue(10_000 * 1e6, dealer, address(0));
        vm.prank(alice);
        vault.borrowValue(1_000 * 1e6, alice);

        vm.startPrank(deployer);
        vault.setController(address(strategy));
        // set managing fund ratio
        strategy.setMaxManagingRatio(1e5); // 10%
        strategy.adjustFund();
        vm.stopPrank();
    }

    function testTotalValueAll() public {
        assertEq(strategy.totalValueAll(), 9_000 * 1e6);
    }

    function testValueAll() public {
        assertEq(strategy.valueAll(), 900 * 1e6);
    }

    function testReturnFund() public {
        vm.prank(address(vault));
        strategy.returnFund(100 * 1e6);

        assertEq(strategy.valueAll(), 800 * 1e6);
        assertApproxEqRel(IERC20(ausdc).balanceOf(address(strategy)), 800 * 1e6, 0.001e18); // within 0.1%
    }

    function testAdjustFund() public {
        vm.prank(address(deployer));
        strategy.setMaxManagingRatio(0.2e6);
        strategy.adjustFund();

        assertEq(strategy.valueAll(), 1_800 * 1e6);
        assertApproxEqRel(IERC20(ausdc).balanceOf(address(strategy)), 1_800 * 1e6, 0.001e18);
    }

    function testMigration() public {
        IController newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken)
        );

        vm.prank(address(vault));
        strategy.emigrate(address(newController));
        assertEq(strategy.valueAll(), 0);
        assertEq(IERC20(ausdc).balanceOf(address(strategy)), 0);
        assertEq(newController.valueAll(), 900 * 1e6);
        assertEq(IERC20(ausdc).balanceOf(address(newController)), 900 * 1e6);
    }

    function testCurrentManagingRatio() public {
        uint256 _currentRatio = strategy.currentManagingRatio();
        assertEq(_currentRatio, 1e5);
    }

    function testSetMaxUtilizationRatio() public {
        assertEq(strategy.maxManagingRatio(), 1e5);
        vm.prank(address(deployer));
        strategy.setMaxManagingRatio(2e5);
        assertEq(strategy.maxManagingRatio(), 2e5);
    }

    function testSetExchangeLogic() public {
        assertEq(address(strategy.exchangeLogic()), address(exchangeLogic));
        IExchangeLogic _newLogic = new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter);
        vm.prank(address(deployer));
        strategy.setExchangeLogic(_newLogic);
        assertEq(address(strategy.exchangeLogic()), address(_newLogic));
    }

    function testSetAaveRewardToken() public {
        assertEq(address(strategy.aaveRewardToken()), aaveRewardToken);
        vm.prank(address(deployer));
        strategy.setAaveRewardToken(IERC20(usdc));
        assertEq(address(strategy.aaveRewardToken()), usdc);
    }

    function testWithdrawReward() public {
        skip(1e6);
        uint256 _unclaimed = strategy.getUnclaimedReward();
        uint256 _fundBeforeClaiming = strategy.managingFund();
        uint256 _expectedUsdcOut = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _unclaimed);
        vm.prank(deployer);
        strategy.withdrawReward(_unclaimed);
        assertApproxEqRel(IERC20(ausdc).balanceOf(address(strategy)), _fundBeforeClaiming + _expectedUsdcOut, 0.003e18);
        assertApproxEqRel(strategy.managingFund(), _fundBeforeClaiming + _expectedUsdcOut, 0.003e18);
    }

    function testWithdrawAllReward() public {
        skip(1e6);
        uint256 _unclaimed = strategy.getUnclaimedReward();
        uint256 _fundBeforeClaiming = strategy.managingFund();
        uint256 _expectedUsdcOut = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _unclaimed);
        vm.prank(deployer);
        strategy.withdrawAllReward();
        assertApproxEqRel(IERC20(ausdc).balanceOf(address(strategy)), _fundBeforeClaiming + _expectedUsdcOut, 0.003e18);
        assertApproxEqRel(strategy.managingFund(), _fundBeforeClaiming + _expectedUsdcOut, 0.003e18);
    }

    function testGetUnclaimedReward() public {
        skip(1e6);
        assertGt(strategy.getUnclaimedReward(), 0);
    }
}
