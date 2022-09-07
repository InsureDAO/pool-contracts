// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

/**
 * @title IExchangeLogic
 * @author @InsureDAO
 * @notice Defines the basic interface for an InsureDAO Exchange Logic.
 **/
interface IExchangeLogic {
    function abiEncodeSwap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountOutMin,
        address _to
    ) external view returns (bytes memory);

    function swapper() external returns (address);

    function estimateAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external view returns (uint256);

    function estimateAmountIn(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountMinOut
    ) external view returns (uint256);

    function slippageTolerance() external view returns (uint256);

    function setSlippageTolerance(uint256 _tolerance) external;
}
