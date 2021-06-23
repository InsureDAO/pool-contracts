pragma solidity ^0.6.0;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/Address.sol";
import "./libraries/utils/Ownable.sol";

contract FeeModel is Ownable {
    using SafeMath for uint256;
    using Address for address;

    uint256 public _feeRate;

    function getFee(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        return _amount.mul(_feeRate).mul(_term).div(365 days).div(100000);
    }

    function setFee(uint256 _target) external onlyOwner {
        _feeRate = _target;
    }
}
