// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "forge-std/Test.sol";

import "../utils/AddressHelper.sol";

import "../../../contracts/strategies/AaveV3Strategy.sol";
import "../../../contracts/Vault.sol";
import "../../../contracts/Registry.sol";
import "../../../contracts/Ownership.sol";
import "../../../contracts/logics/ExchangeLogicUniswapV3.sol";

contract AaveV3StrategyTest is Test {
    uint256 optimismFork;

    AaveV3Strategy public strategy;

    address deployer = vm.addr(1);
    address alice = vm.addr(2);
    address bob = vm.addr(3);
    address dealer = vm.addr(4);

    address usdc;
    address ausdc;
    address aaveRewardToken;

    address aavePool;
    address aaveReward;
    address uniswapV3;

    string OPTIMISM_RPC_URL = vm.envString("OPTIMISM_URL");

    IOwnership ownership;
    IRegistry registry;
    IVault vault;
    IExchangeLogic exchangeLogic;

    function setUp() public {
        optimismFork = vm.createFork(OPTIMISM_RPC_URL);
        vm.selectFork(optimismFork);
        AddressHelper.Addr memory addresses = AddressHelper.addresses(10);
        usdc = addresses.usdc;
        ausdc = addresses.ausdc;
        aaveRewardToken = addresses.aaveRewardToken;
        aavePool = addresses.aavePool;
        aaveReward = addresses.aaveReward;
        uniswapV3 = addresses.uniswapV3Router;

        vm.startPrank(deployer);
        ownership = new Ownership();
        registry = new Registry(address(ownership));
        vault = new Vault(addresses.usdc, address(registry), address(0), address(ownership));
        exchangeLogic = new ExchangeLogicUniswapV3(addresses.uniswapV3Router);
        strategy = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(addresses.aavePool),
            IAaveV3Reward(addresses.aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken)
        );
        vault.setController(address(strategy));
        // set managing fund ratio
        strategy.setMaxManagingRatio(1e5); // 10%
        // treated as market
        registry.supportMarket(dealer);
        registry.supportMarket(alice);
        registry.supportMarket(bob);
        vm.stopPrank();
        // approve unlimited transfer
        vm.prank(dealer);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(alice);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(bob);
        IERC20(usdc).approve(address(vault), type(uint256).max);

        deal(usdc, dealer, 1e8);
        deal(usdc, alice, 1e6);
        deal(usdc, bob, 1e6);

        vm.prank(dealer);
        vault.addValue(1e6, dealer, address(0));
        strategy.adjustFund();
    }

    function testTotalValueAll() public {
        assertEq(strategy.totalValueAll(), 1e6);
    }

    function testValueAll() public {
        assertEq(strategy.valueAll(), 1e5);
    }

    function testReturnFund() public {
        vm.prank(address(vault));
        strategy.returnFund(10_000);

        assertEq(strategy.valueAll(), 90_000);
    }

    function testAdjustFund() public {
        vm.prank(address(deployer));
        strategy.setMaxManagingRatio(2e5);
        strategy.adjustFund();

        assertEq(strategy.valueAll(), 2e5);
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
        assertEq(newController.valueAll(), 1e5);
    }

    function testSetMaxUtilizationRatio() public {
        assertEq(strategy.maxManagingRatio(), 1e5);
        vm.prank(address(deployer));
        strategy.setMaxManagingRatio(2e5);
        assertEq(strategy.maxManagingRatio(), 2e5);
    }

    function testSetExchangeLogic() public {
        assertEq(address(strategy.exchangeLogic()), address(exchangeLogic));
        IExchangeLogic _newLogic = new ExchangeLogicUniswapV3(uniswapV3);
        vm.prank(address(deployer));
        strategy.setExchangeLogic(address(_newLogic));
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
        vm.prank(deployer);
        strategy.withdrawReward(_unclaimed);
        // FIXME: confirm actual reward value
        assertGt(strategy.managingFund(), _fundBeforeClaiming);
    }

    function testWithdrawAllReward() public {}

    function testGetUnclaimedReward() public {
        skip(1e6);
        // FIXME: confirm actual reward value
        assertGt(strategy.getUnclaimedReward(), 0);
    }
}
