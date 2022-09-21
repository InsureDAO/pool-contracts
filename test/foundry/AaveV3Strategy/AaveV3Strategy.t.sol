// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "forge-std/Test.sol";

import "../utils/AddressHelper.sol";

import "./AaveV3StrategySetUp.sol";

contract AaveV3StrategyTest is AaveV3StrategySetUp {
    /**
     * Controller methods
     */
    function testAdjustFund() public {
        vm.prank(address(deployer));
        strategy.setMaxManagingRatio(0.2e6); //10% => 20%
        strategy.adjustFund(); //+900

        assertEq(strategy.valueAll(), 1_800 * 1e6);
        assertApproxEqRel(IERC20(ausdc).balanceOf(address(strategy)), 1_800 * 1e6, 0.001e18);
    }

    function testReturnFund() public {
        vm.prank(address(vault));
        strategy.returnFund(100 * 1e6);

        assertEq(strategy.valueAll(), 800 * 1e6);
        assertApproxEqRel(IERC20(ausdc).balanceOf(address(strategy)), 800 * 1e6, 0.001e18); // within 0.1%
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

        //check old controller
        assertEq(strategy.valueAll(), 0);
        assertEq(IERC20(ausdc).balanceOf(address(strategy)), 0);

        //check new controller
        assertEq(newController.valueAll(), 900 * 1e6);
        assertEq(IERC20(ausdc).balanceOf(address(newController)), 900 * 1e6);
    }

    function testEmergencyExit() public {
        assertEq(IERC20(ausdc).balanceOf(alice), 0);
        vm.prank(deployer);
        strategy.emergencyExit(alice);
        assertEq(IERC20(ausdc).balanceOf(alice), 900 * 1e6);
    }

    function testCurrentManagingRatio() public {
        uint256 _currentRatio = strategy.currentManagingRatio();
        assertEq(_currentRatio, 1e5); //10%
    }

    function testTotalValueAll() public {
        //available: 8100 + managingFund: 900 (10% utilize)
        assertEq(strategy.totalValueAll(), 9_000 * 1e6);
    }

    function testValueAll() public {
        //managingFund: 900
        assertEq(strategy.valueAll(), 900 * 1e6);
    }

    /**
     * Strategy methods
     */
    function testSetMaxUtilizationRatio() public {
        assertEq(strategy.maxManagingRatio(), 1e5);
        vm.prank(address(deployer));
        strategy.setMaxManagingRatio(2e5);
        assertEq(strategy.maxManagingRatio(), 2e5);
    }

    function testSetAaveMaxOccupancyRatio() public {
        assertEq(strategy.aaveMaxOccupancyRatio(), 1e5);
        vm.prank(address(deployer));
        strategy.setAaveMaxOccupancyRatio(2e5);
        assertEq(strategy.aaveMaxOccupancyRatio(), 2e5);
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
        strategy.setAaveRewardToken(IERC20(ausdc));
        assertEq(address(strategy.aaveRewardToken()), ausdc);
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
