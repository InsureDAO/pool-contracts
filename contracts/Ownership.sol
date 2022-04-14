// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./interfaces/IOwnership.sol";

contract Ownership is IOwnership {
    address private _owner;
    address private _futureOwner;

    event CommitNewOwnership(address indexed futureOwner);
    event AcceptNewOwnership(address indexed owner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _owner = msg.sender;
        emit AcceptNewOwnership(msg.sender);
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() external view override returns (address) {
        return _owner;
    }

    function futureOwner() external view override returns (address) {
        return _futureOwner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(
            _owner == msg.sender,
            "Caller is not allowed to operate"
        );
        _;
    }

    modifier onlyFutureOwner() {
        require(
            _futureOwner == msg.sender,
            "Caller is not allowed to operate"
        );
        _;
    }

    function commitTransferOwnership(address newOwner)
        external
        override
        onlyOwner
    {
        /***
         *@notice Transfer ownership of GaugeController to `newOwner`
         *@param newOwner Address to have ownership transferred to
         */
        _futureOwner = newOwner;
        emit CommitNewOwnership(newOwner);
    }

    function acceptTransferOwnership() external override onlyFutureOwner {
        /***
         *@notice Accept a transfer of ownership
         */
        _owner = msg.sender;
        _futureOwner = address(0);
        emit AcceptNewOwnership(msg.sender);
    }
}
