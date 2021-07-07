pragma solidity ^0.6.0;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/Address.sol";
import "./libraries/utils/Ownable.sol";

contract FeeModel is Ownable {
    using SafeMath for uint256;
    using Address for address;

    uint256 public _feeRate;

    function getFee(uint256 _premium) external view returns (uint256) {
        return _premium.mul(_feeRate).div(100000);
    }

    function setFee(uint256 _target) external onlyOwner {
        _feeRate = _target;
    }
}
