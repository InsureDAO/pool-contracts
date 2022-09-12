pragma solidity 0.8.12;
/**
 * @title PremiumModelV3
 * @author @InsureDAO
 * @notice PremiumModelV3
 * check the model here: https://www.desmos.com/calculator/fyf66soh6v
 * SPDX-License-Identifier: GPL-3.0
 */

import "../interfaces/IPremiumModelV2.sol";
import "../interfaces/IOwnership.sol";
import "hardhat/console.sol";

contract PremiumModelV3 {
    IOwnership public immutable ownership;

    mapping(address => uint256) public baseRates;

    uint256 public immutable rateSlope1;
    uint256 public immutable rateSlope2;

    uint256 public immutable OPTIMAL_UTILIZE_RATIO;

    uint256 internal immutable MAX_EXCESS_UTILIZE_RATIO;
    uint256 internal constant MAX_RATE = 1e6;
    uint256 internal constant MAGIC_SCALE = 1e6; //100%

    modifier onlyOwner() {
        require(ownership.owner() == msg.sender, "Caller is not allowed to operate");
        _;
    }

    constructor(
        address _ownership,
        uint256 _defaultRate,
        uint256 _rateSlope1,
        uint256 _rateSlope2,
        uint256 _OPTIMAL_USAGE_RATIO
    ) {
        require(_ownership != address(0), "zero address");
        require(_defaultRate != 0, "rate is zero");
        require(_rateSlope1 != 0, "slope1 is zero");
        require(_rateSlope2 != 0, "slope2 is zero");
        require(_OPTIMAL_USAGE_RATIO != 0, "ratio is zero");

        require(_OPTIMAL_USAGE_RATIO <= MAX_RATE, "exceed max rate");

        ownership = IOwnership(_ownership);
        baseRates[address(0)] = _defaultRate;
        rateSlope1 = _rateSlope1;
        rateSlope2 = _rateSlope2;
        OPTIMAL_UTILIZE_RATIO = _OPTIMAL_USAGE_RATIO;
        MAX_EXCESS_UTILIZE_RATIO = MAGIC_SCALE - _OPTIMAL_USAGE_RATIO;
    }

    function getCurrentPremiumRate(
        address _market,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        uint256 _utilizedRate;

        if (_lockedAmount != 0 && _totalLiquidity != 0) {
            _utilizedRate = (_lockedAmount * MAGIC_SCALE) / _totalLiquidity;
        }
        return _getPremiumRate(_market, _utilizedRate);
    }

    function getPremium(
        address _market,
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        uint256 _utilizedRateBefore = (_lockedAmount * MAGIC_SCALE) / _totalLiquidity;
        uint256 _utilizedRateAfter = ((_lockedAmount + _amount) * MAGIC_SCALE) / _totalLiquidity;
        assert(_utilizedRateBefore < _utilizedRateAfter);

        uint256 _premium;

        if (_utilizedRateAfter <= OPTIMAL_UTILIZE_RATIO || OPTIMAL_UTILIZE_RATIO <= _utilizedRateBefore) {
            //slope1 or 2
            _premium += _calcOneSidePremiumAmount(_market, _totalLiquidity, _utilizedRateBefore, _utilizedRateAfter);
        } else {
            //slope1 & 2
            _premium += _calcOneSidePremiumAmount(_market, _totalLiquidity, _utilizedRateBefore, OPTIMAL_UTILIZE_RATIO);
            _premium += _calcOneSidePremiumAmount(_market, _totalLiquidity, OPTIMAL_UTILIZE_RATIO, _utilizedRateAfter);
        }

        _premium = (_premium * _term) / 365 days;

        return _premium;
    }

    function setBaseRate(address _market, uint256 _rate) external onlyOwner {
        baseRates[_market] = _rate;
    }

    function _calcOneSidePremiumAmount(
        address _market,
        uint256 _totalLiquidity,
        uint256 _utilizedRateBefore,
        uint256 _utilizedRateAfter
    ) internal view returns (uint256) {
        require(
            !(_utilizedRateBefore < OPTIMAL_UTILIZE_RATIO && OPTIMAL_UTILIZE_RATIO < _utilizedRateAfter),
            "Contains the corner"
        );

        uint256 _currentPremiumBefore = _getPremiumRate(_market, _utilizedRateBefore);
        uint256 _currentPremiumAfter = _getPremiumRate(_market, _utilizedRateAfter);
        uint256 _avePremiumRate = (_currentPremiumBefore + _currentPremiumAfter) / 2;
        uint256 _amount = ((_utilizedRateAfter - _utilizedRateBefore) * _totalLiquidity) / MAGIC_SCALE;

        uint256 _premium = (_amount * _avePremiumRate) / MAGIC_SCALE;

        return _premium;
    }

    /**
     * @dev return BaseRate when _utilizedRate is 0;
     */
    function _getPremiumRate(address _market, uint256 _utilizedRate) internal view returns (uint256) {
        uint256 _currentPremiumRate = _getBaseRate(_market);

        if (_utilizedRate > OPTIMAL_UTILIZE_RATIO) {
            uint256 excessUtilizeRatio;
            unchecked {
                excessUtilizeRatio = _utilizedRate - OPTIMAL_UTILIZE_RATIO;
            }
            _currentPremiumRate += (rateSlope1 + ((rateSlope2 * excessUtilizeRatio) / MAX_EXCESS_UTILIZE_RATIO));
        } else {
            _currentPremiumRate += (rateSlope1 * _utilizedRate) / OPTIMAL_UTILIZE_RATIO;
        }

        return _currentPremiumRate;
    }

    function _getBaseRate(address _market) internal view returns (uint256) {
        uint256 _rate = baseRates[_market];
        if (_rate == 0) {
            return baseRates[address(0)];
        } else {
            return _rate;
        }
    }
}
