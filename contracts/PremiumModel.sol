pragma solidity ^0.6.0;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/Address.sol";
import "./libraries/utils/Ownable.sol";

contract PremiumModel is Ownable {
    using SafeMath for uint256;
    using Address for address;

    uint256 public _multiplier;
    uint256 public _baseRate;

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        if (_amount == 0) {
            return 0;
        }
        // 1) Calculate utilization rate
        uint256 _util =
            _lockedAmount
                .add(_amount)
                .add(_lockedAmount)
                .mul(1e5)
                .div(_totalLiquidity)
                .div(2);
        // 2) Calculate premium
        uint256 _premium = _amount.mul(_multiplier).mul(_util).div(1e10);
        _premium = _amount.mul(_baseRate).div(1e5).add(_premium);
        _premium = _premium.mul(_term).div(365 days);
        // 3) Return premium
        return _premium;
    }

    /**
     * @notice Set a premium model
     * @param _baseRatePerYear The approximate target base APR, as a mantissa (scaled by 1e18)
     * @param _multiplierPerYear The rate of increase in premium rate wrt utilization (scaled by 1e18)
     */
    function setPremium(uint256 _baseRatePerYear, uint256 _multiplierPerYear)
        external
        onlyOwner
    {
        _baseRate = _baseRatePerYear;
        _multiplier = _multiplierPerYear;
    }
}
