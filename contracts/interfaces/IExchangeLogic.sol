// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/**
 * @title IExchangeLogic
 * @author @InsureDAO
 * @notice Defines the basic interface for an InsureDAO Exchange Logic.
 **/
interface IExchangeLogic {
    /**
     * @dev Returns swap function abi, which enables to perform interchangeability of various swap specs.
     *      Caller exactly execute low level function call with abi.
     * @param _tokenIn The token address to be swapped.
     * @param _tokenOut The token address a caller receives.
     * @param _amountIn The amount of token to be swapped.
     * @param _amountOutMin The minimum amount the caller should receive.
     */
    function abiEncodeSwap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMin,
        address _to
    ) external view returns (bytes memory);

    /**
     * @dev Returns the contract address providing swap feature.
     */
    function swapper() external returns (address);

    /**
     * @dev Returns the token amount to receive
     */
    function estimateAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external returns (uint256);

    /**
     * @dev Returns the token amount a caller need to provide for given amount.
     */
    function estimateAmountIn(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountMinOut
    ) external returns (uint256);

    /**
     * @dev Returns what portion of tokens to be lost from swap operation.
     */
    function slippageTolerance() external view returns (uint256);
}

error ZeroSlippageTolerance();
error SlippageToleranceOutOfRange();
