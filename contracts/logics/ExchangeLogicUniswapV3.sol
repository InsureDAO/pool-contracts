// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "../interfaces/IExchangeLogic.sol";

import "../errors/CommonError.sol";

/**
 * @title ExchangeLogicUniswapV3
 * @author @InsureDAO
 * @notice InsureDAO's Depeg insurance exchager of UniswapV3
 **/
contract ExchangeLogicUniswapV3 is IExchangeLogic {
    address public immutable swapper;
    IQuoter public immutable quoter;

    uint256 public slippageTolerance;
    uint24 public fee;
    uint160 public sqrtPriceLimitX96;

    constructor(address _router, address _quoter) {
        swapper = _router;
        quoter = IQuoter(_quoter);
        slippageTolerance = 985_000; // 1.5%
        fee = 3_000;
        sqrtPriceLimitX96 = 0;
    }

    function abiEncodeSwap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMin,
        address _to
    ) external view returns (bytes memory) {
        if (_tokenIn == address(0) || _tokenOut == address(0) || _to == address(0)) revert ZeroAddress();
        if (_amountIn == 0 || _amountOutMin == 0) revert AmountZero();

        uint256 _deadline;
        unchecked {
            _deadline = block.timestamp + 60; // using 'now' for convenience, for mainnet pass _deadline from frontend!
        }

        //setup for swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(
            _tokenIn,
            _tokenOut,
            fee,
            _to,
            _deadline,
            _amountIn,
            _amountOutMin,
            sqrtPriceLimitX96
        );

        return abi.encodeWithSelector(ISwapRouter.exactInputSingle.selector, params);
    }

    function estimateAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external returns (uint256) {
        if (_tokenIn == address(0) || _tokenOut == address(0)) revert ZeroAddress();
        if (_amountIn == 0) revert AmountZero();
        return quoter.quoteExactInputSingle(_tokenIn, _tokenOut, fee, _amountIn, sqrtPriceLimitX96);
    }

    function estimateAmountIn(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountOutMin
    ) external returns (uint256) {
        if (_tokenIn == address(0) || _tokenOut == address(0)) revert ZeroAddress();
        if (_amountOutMin == 0) revert AmountZero();
        return quoter.quoteExactOutputSingle(_tokenIn, _tokenOut, fee, _amountOutMin, sqrtPriceLimitX96);
    }

    function setSlippageTolerance(uint256 _tolerance) external {
        if (_tolerance == 0) revert ZeroSlippageTolerance();
        if (_tolerance > 1e6) revert SlippageToleranceOutOfRange();

        slippageTolerance = _tolerance;
    }
}
