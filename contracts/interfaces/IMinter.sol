pragma solidity 0.8.7;

//SPDX-License-Identifier: MIT
interface IMinter {
    function emergency_mint(address _tokenOut, uint256 _amountOut) external;
}
