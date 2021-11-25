pragma solidity 0.8.7;

/**
 * @title FeeModel
 * @author @InsureDAO
 * @notice
 * SPDX-License-Identifier: GPL-3.0
 */

import "./interfaces/IOwnership.sol";
import "./interfaces/IFeeModel.sol";

contract FeeModel is IFeeModel{


    uint256 public _feeRate; //fee rate represented in 1e5 scale. (100% = 1e5, 10% = 1e4)
    uint256 public constant MAX_RATE = 30000; //30% of the premium

    IOwnership public ownership;


    modifier onlyOwner() {
        require(ownership.owner() == msg.sender, 'Restricted: caller is not allowed to operate');
        _;
    }

    constructor(address _ownership){
        ownership = IOwnership(_ownership);
    }

    /**
     * @notice Set fee for the specified premium amount
     * @param _premium premium amount
     * @return fee amount
     */
    function getFee(uint256 _premium) external override view returns (uint256) {
        return _premium * _feeRate / 100000;
    }

    /**
     * @notice Set fee rate in 1e5 scale (100% = 1e5, 10% = 1e4)
     * @param _target fee ratio
     */
    function setFee(uint256 _target) external onlyOwner {
        require(_target <= MAX_RATE, "ERROR: MAX_RATE_EXCEEDED");
        _feeRate = _target;
    }
}
