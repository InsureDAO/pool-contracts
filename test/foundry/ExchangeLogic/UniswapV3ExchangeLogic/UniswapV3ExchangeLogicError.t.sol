// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "./UniswapV3ExchangeLogicSetUp.sol";

contract UniswapV3ExchangeLogicErrorTest is UniswapV3ExchangeLogicSetUp {
    IExchangeLogic private uniswapV3ExchangeLogic;

    function setUp() public {
        uniswapV3ExchangeLogic = new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter, 3_000, 975_000);
        deal(aaveRewardToken, alice, 10_000 * 1e18);
    }

    function testCannotEncodeInputAddressZero() public {
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.abiEncodeSwap(address(0), usdc, 100 * 1e18, 0, alice);
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.abiEncodeSwap(aaveRewardToken, address(0), 100 * 1e18, 0, alice);
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.abiEncodeSwap(aaveRewardToken, usdc, 100 * 1e18, 0, address(0));
    }

    function testCannotEncodeAmountZero() public {
        vm.expectRevert(AmountZero.selector);
        uniswapV3ExchangeLogic.abiEncodeSwap(aaveRewardToken, usdc, 0, 1, alice);
        vm.expectRevert(AmountZero.selector);
        uniswapV3ExchangeLogic.abiEncodeSwap(aaveRewardToken, usdc, 100 * 1e18, 0, alice);
    }

    function testCannotEstimateAmountInAddressZero() public {
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.estimateAmountIn(address(0), usdc, 100 * 1e6);
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.estimateAmountIn(aaveRewardToken, address(0), 100 * 1e6);
    }

    function testCannotEsimateAmountInAmountZero() public {
        vm.expectRevert(AmountZero.selector);
        uniswapV3ExchangeLogic.estimateAmountIn(aaveRewardToken, usdc, 0);
    }

    function testCannotEstimateAmountOutAddressZero() public {
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.estimateAmountOut(address(0), usdc, 100 * 1e6);
        vm.expectRevert(ZeroAddress.selector);
        uniswapV3ExchangeLogic.estimateAmountOut(aaveRewardToken, address(0), 100 * 1e6);
    }

    function testCannotEsimateAmountOutAmountZero() public {
        vm.expectRevert(AmountZero.selector);
        uniswapV3ExchangeLogic.estimateAmountOut(aaveRewardToken, usdc, 0);
    }

    function testCannotSetFeeTierZero() public {
        vm.expectRevert(FeeTierZero.selector);
        new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter, 0, 975_000);
    }

    function testCannotSetSlippageToleranceZero() public {
        vm.expectRevert(ZeroSlippageTolerance.selector);
        new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter, 3_000, 0);
    }

    function testCannotSetSlippageOutOfRange() public {
        vm.expectRevert(SlippageToleranceOutOfRange.selector);
        new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter, 3_000, 1e6 + 1);
    }
}
