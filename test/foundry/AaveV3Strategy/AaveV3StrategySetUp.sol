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
    address gelatoOps;
    address gelatoNetwork;
    address gelatoTaskTreasury;

    string OPTIMISM_RPC_URL = vm.envString("OPTIMISM_URL");

    IOwnership ownership;
    IRegistry registry;
    Vault vault;
    IExchangeLogic exchangeLogic;

    constructor() {
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
        gelatoOps = addresses.gelatoOps;
        gelatoNetwork = addresses.gelatoNetwork;
        gelatoTaskTreasury = addresses.gelatoTaskTreasury;

        vm.startPrank(deployer);
        ownership = new Ownership();
        registry = new Registry(address(ownership));
        // exchangeLogic = new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter);
        exchangeLogic = new ExchangeLogicUniswapV3(
            uniswapV3Router,
            uniswapV3Quoter,
            3_000, // fee => 0.3%
            997_000 // slippage tolerance => 0.3%
        );
        vault = new Vault(usdc, address(registry), address(0), address(ownership));
        strategy = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            gelatoOps
        );

        vault.setController(address(strategy));

        // treated as market
        registry.addPool(dealer);
        registry.addPool(alice);
        registry.addPool(bob);
        vm.stopPrank();

        deal(usdc, dealer, 1_000_000 * 1e6);
        deal(usdc, alice, 1_000_000 * 1e6);
        deal(usdc, bob, 1_000_000 * 1e6);

        // approve unlimited transfer
        vm.prank(dealer);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(alice);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(bob);
        IERC20(usdc).approve(address(vault), type(uint256).max);

        vm.prank(dealer);
        vault.addValue(10_000 * 1e6, dealer, dealer);
        vm.prank(alice);
        vault.borrowValue(1_000 * 1e6, alice);

        // set managing fund ratio
        vm.startPrank(deployer);
        strategy.setMaxManagingRatio(1e5); // 10%
        strategy.adjustFund();
        vm.stopPrank();
    }

    function isRewardActive() internal returns (bool _isActive) {
        address[] memory _supplyingAssets = new address[](1);
        _supplyingAssets[0] = ausdc;
        (address[] memory _tokens, uint256[] memory _rewards) = IAaveV3Reward(aaveReward).getAllUserRewards(
            _supplyingAssets,
            address(this)
        );
        uint256 _lenRewards = _tokens.length;

        for (uint256 i; i < _lenRewards; i++) {
            (, , , uint256 _distributionEnd) = IAaveV3Reward(aaveReward).getRewardsData(ausdc, _tokens[i]);
            if (_distributionEnd > block.timestamp) _isActive = true;
        }
    }
}
