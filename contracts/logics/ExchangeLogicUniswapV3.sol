// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "../interfaces/IExchangeLogic.sol";

/**
 * @title ExchangeLogicUniswapV3
 * @author @InsureDAO
 * @notice InsureDAO's Depeg insurance exchager of UniswapV3
 **/
contract ExchangeLogicUniswapV3 is IExchangeLogic {
    address public immutable swapper;
    uint256 public slippageTolerance;

    constructor(address _uniswap) {
        swapper = _uniswap;
        slippageTolerance = 985_000;
    }

    function abiEncodeSwap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMin,
        address _to
    ) external view returns (bytes memory) {
        uint256 _deadline;
        unchecked {
            _deadline = block.timestamp + 60; // using 'now' for convenience, for mainnet pass _deadline from frontend!
        }

        uint24 _fee = 3000;
        uint160 _sqrtPriceLimitX96 = 0;

        //setup for swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams(
            _tokenIn,
            _tokenOut,
            _fee,
            _to,
            _deadline,
            _amountIn,
            _amountOutMin,
            _sqrtPriceLimitX96
        );

        return abi.encodeWithSelector(ISwapRouter.exactInputSingle.selector, params);
    }

    function estimateAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external view returns (uint256) {
        if (_amountIn == 0) return 0;
        // TODO under implementation
        _tokenIn = address(0);
        _tokenOut = address(0);
        return 0;
    }

    function estimateAmountIn(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountMinOut
    ) external view returns (uint256) {
        if (_amountMinOut == 0) return 0;
        // TODO under implementation
        _tokenIn = address(0);
        _tokenOut = address(0);
        return 0;
    }

    function setSlippageTolerance(uint256 _tolerance) external {
        require(_tolerance != 0, "Slippage tolerance cannot be zero");

        slippageTolerance = _tolerance;
    }
}
