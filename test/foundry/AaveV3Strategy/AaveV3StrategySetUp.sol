// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "forge-std/Test.sol";

import "../utils/AddressHelper.sol";

import "../../../contracts/strategies/AaveV3Strategy.sol";
import "../../../contracts/Vault.sol";
import "../../../contracts/Registry.sol";
import "../../../contracts/Ownership.sol";
import "../../../contracts/logics/ExchangeLogicUniswapV3.sol";

abstract contract AaveV3StrategySetUp is Test {
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
    address uniswapV3Router;
    address uniswapV3Quoter;

    string OPTIMISM_RPC_URL = vm.envString("OPTIMISM_URL");

    IOwnership ownership;
    IRegistry registry;
    IVault vault;
    IExchangeLogic exchangeLogic;

    function setUp() public virtual {
        optimismFork = vm.createFork(OPTIMISM_RPC_URL);
        vm.selectFork(optimismFork);
        AddressHelper.Addr memory addresses = AddressHelper.addresses(10);
        usdc = addresses.usdc;
        ausdc = addresses.ausdc;
        aaveRewardToken = addresses.aaveRewardToken;
        aavePool = addresses.aavePool;
        aaveReward = addresses.aaveReward;
        uniswapV3Router = addresses.uniswapV3Router;
        uniswapV3Quoter = addresses.uniswapV3Quoter;

        vm.startPrank(deployer);
        ownership = new Ownership();
        registry = new Registry(address(ownership));
        vault = new Vault(addresses.usdc, address(registry), address(0), address(ownership));
        exchangeLogic = new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter);
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
}
