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
 * @notice InsureDAO's utilized asset exchager of UniswapV3
 **/
contract ExchangeLogicUniswapV3 is IExchangeLogic {
    /// @dev UniswapV3 router contract. See https://github.com/Uniswap/v3-periphery
    address public immutable swapper;
    /// @dev UniswapV3 quoter contract. See https://github.com/Uniswap/v3-periphery
    IQuoter public immutable quoter;

    /// @inheritdoc IExchangeLogic
    uint256 public immutable slippageTolerance; // 0.3%

    /// @dev What tier of swap fees this contract used. See detail for https://docs.uniswap.org/protocol/concepts/V3-overview/fees.
    uint24 public fee;
    /// @dev The limit for the price the swap will push the pool to. We disable this feature. See detail for https://docs.uniswap.org/protocol/guides/swaps/single-swaps
    uint160 public constant sqrtPriceLimitX96 = 0;

    constructor(
        address _router,
        address _quoter,
        uint24 _fee,
        uint256 _slippageTolerance
    ) {
        swapper = _router;
        quoter = IQuoter(_quoter);
        fee = _fee;
        slippageTolerance = _slippageTolerance;
    }

    /// @inheritdoc IExchangeLogic
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

    /// @inheritdoc IExchangeLogic
    function estimateAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external returns (uint256) {
        if (_tokenIn == address(0) || _tokenOut == address(0)) revert ZeroAddress();
        if (_amountIn == 0) revert AmountZero();
        return quoter.quoteExactInputSingle(_tokenIn, _tokenOut, fee, _amountIn, sqrtPriceLimitX96);
    }

    /// @inheritdoc IExchangeLogic
    function estimateAmountIn(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountOutMin
    ) external returns (uint256) {
        if (_tokenIn == address(0) || _tokenOut == address(0)) revert ZeroAddress();
        if (_amountOutMin == 0) revert AmountZero();
        return quoter.quoteExactOutputSingle(_tokenIn, _tokenOut, fee, _amountOutMin, sqrtPriceLimitX96);
    }
}
