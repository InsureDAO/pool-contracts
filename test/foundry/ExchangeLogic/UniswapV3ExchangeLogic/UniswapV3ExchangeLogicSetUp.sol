// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "../../utils/AddressHelper.sol";
import "../../../../contracts/interfaces/IExchangeLogic.sol";
import "../../../../contracts/logics/ExchangeLogicUniswapV3.sol";

abstract contract UniswapV3ExchangeLogicSetUp is Test {
    string OPTIMISM_RPC_URL = vm.envString("OPTIMISM_URL");

    uint256 optimismFork = vm.createFork(OPTIMISM_RPC_URL);

    AddressHelper.Addr addresses;

    address alice = vm.addr(1);
    address usdc;
    address aaveRewardToken;
    address uniswapV3Router;
    address uniswapV3Quoter;

    constructor() {
        vm.selectFork((optimismFork));
        addresses = AddressHelper.addresses(10);

        usdc = addresses.usdc;
        aaveRewardToken = addresses.aaveRewardToken;
        uniswapV3Router = addresses.uniswapV3Router;
        uniswapV3Quoter = addresses.uniswapV3Quoter;
    }
}
