pragma solidity 0.8.7;

//SPDX-License-Identifier: MIT
interface IMinter {
    function emergency_mint(uint256 _amount) external returns (bool);
}
