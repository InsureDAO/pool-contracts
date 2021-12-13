pragma solidity 0.8.7;
//SPDX-License-Identifier: MIT

interface IOwnership {
    function owner() external view returns (address);
    function future_owner() external view returns (address);

    function commitTransferOwnership(address newOwner)external;
    function acceptTransferOwnership()external;
}
