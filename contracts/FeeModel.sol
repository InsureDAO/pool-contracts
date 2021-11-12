// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract FeeModel {
    using SafeMath for uint256;
    using Address for address;

    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);

    uint256 public _feeRate; //fee rate represented in 1e5 scale. (100% = 1e5, 10% = 1e4)

    address public owner;
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;
    uint256 public constant MAX_RATE = 30000; //30% of the premium

    /**
     * @notice Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(isOwner(), "Restricted: caller is not allowed to operate");
        _;
    }

    constructor(){
        owner = msg.sender;
    }

    /**
     * @notice Set fee for the specified premium amount
     * @param _premium premium amount
     * @return fee amount
     */
    function getFee(uint256 _premium) external view returns (uint256) {
        return _premium.mul(_feeRate).div(100000);
    }

    /**
     * @notice Set fee rate in 1e5 scale (100% = 1e5, 10% = 1e4)
     * @param _target fee ratio
     */
    function setFee(uint256 _target) external onlyOwner {
        require(_target <= MAX_RATE, "ERROR: MAX_RATE_EXCEEDED");
        _feeRate = _target;
    }

    /**
     * @notice Get the address of the owner
     * @return owner's address
     */
    function getOwner() public view returns (address) {
        return owner;
    }

    /**
     * @notice Get the owner address
     * @return true if the caller is owner
     */
    function isOwner() public view returns (bool) {
        return msg.sender == owner;
    }

    /**
     * @notice commit new owner address.
     * actutal change occurs after ADMIN_ACTIONS_DELAY passed.
     * @param _owner new owner address
     */
    function commitTransferOwnership(address _owner) external onlyOwner {
        require(transfer_ownership_deadline == 0, "dev: active transfer");
        require(_owner != address(0), "dev: address zero");

        uint256 _deadline = block.timestamp.add(ADMIN_ACTIONS_DELAY);
        transfer_ownership_deadline = _deadline;
        future_owner = _owner;

        emit CommitNewAdmin(_deadline, _owner);
    }

    /**
     * @notice apply transfer of ownership.
     */
    function applyTransferOwnership() external onlyOwner {
        require(
            block.timestamp >= transfer_ownership_deadline,
            "dev: insufficient time"
        );
        require(transfer_ownership_deadline != 0, "dev: no active transfer");

        transfer_ownership_deadline = 0;
        address _owner = future_owner;

        owner = _owner;

        emit NewAdmin(owner);
    }
}
