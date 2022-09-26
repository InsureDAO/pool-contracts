// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "./UniswapV3ExchangeLogicSetUp.sol";

contract UniswapV3ExchangeLogicTest is UniswapV3ExchangeLogicSetUp {
    IExchangeLogic private uniswapV3ExchangeLogic;

    function setUp() public {
        uniswapV3ExchangeLogic = new ExchangeLogicUniswapV3(uniswapV3Router, uniswapV3Quoter);
        deal(aaveRewardToken, alice, 10_000 * 1e18);
    }

    function testAbiEncodeSwap() public {
        address _swapper = uniswapV3ExchangeLogic.swapper();
        bytes memory _encodedCallData = uniswapV3ExchangeLogic.abiEncodeSwap(
            aaveRewardToken,
            usdc,
            1_000 * 1e18,
            1,
            alice
        );
        vm.startPrank(alice);
        IERC20(aaveRewardToken).approve(_swapper, 1_000 * 1e18);
        (bool _success, bytes memory _res) = _swapper.call(_encodedCallData);
        uint256 _swapped = abi.decode(_res, (uint256));
        assertTrue(_success);
        assertGt(_swapped, 0);
        vm.stopPrank();
    }

    function testEstimateAmountOut() public {
        uint256 _amountOut = uniswapV3ExchangeLogic.estimateAmountOut(aaveRewardToken, usdc, 1000 * 1e18);
        assertGt(_amountOut, 0);
    }

    function testEstimateAmountIn() public {
        uint256 _amountIn = uniswapV3ExchangeLogic.estimateAmountIn(aaveRewardToken, usdc, 1000 * 1e6);
        assertGt(_amountIn, 0);
    }

    function testSetSlippageTolerance() public {
        uniswapV3ExchangeLogic.setSlippageTolerance(1e6);
        assertEq(uniswapV3ExchangeLogic.slippageTolerance(), 1e6);
    }
}
