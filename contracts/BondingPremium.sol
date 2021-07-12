pragma solidity ^0.6.0;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/Ownable.sol";

contract BondingPremium is Ownable {
    using SafeMath for uint256;

    uint256 public k; //k
    uint256 public b; //b
    uint256 public low_risk_b;
    uint256 public a; //a

    /***
    * -- Fondamental Equation f(x)--
    * (x-a)(y-a) = k
    * 
    * f(x) = k/(x-a)+a
    * f(x) pass through (1000000, 0) (0, 1000000)
    *
    * Using Quadratic Formula,
    * a = (1e6 - sqrt(1e6^2+4k))/2
    *
    * use below instead of above to avoid negative value.
    * -a  = (1e6 + sqrt(1e6^2+4k))/2 - 1e6
    * f(x) = k/(x+a)-a
    *
    * --Daily Premium Equation g(x)--
    * g(x) = f(x)*365 + b
    *      = 365(k/(x+a)-a)+b
    * x = 1e6 - Utilization Rate
    * 
    * Premium%
    * |
    * \
    * ||
    * |\
    * | \-_
    * |    \-_
    * |       \-____
    * |-------------\------->Utilization%
    * Like uniswap bonding curve that crrosses axis at the point (100000, 0)
    * Base rate is applied addition to this.
    *
    * -- Initial Parameters --
    * k = 300100000
    * b = 30000
    * => a=300
    */

    constructor()public{
        //setPremium()
        b = 30000;
        k = 300100000;
        a = (uint256(1e6).add(sqrt(uint256(1e6).mul(uint256(1e6)).add(k.mul(4))))).div(2).sub(uint256(1e6));

        low_risk_b = 5000; //0.5%
    }

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        if (_amount == 0) {
            return 0;
        }
        // utilization rate (0~1000000) 
        uint256 _util =
            _lockedAmount
                .add(_amount)
                .add(_lockedAmount)
                .mul(1e6)
                .div(_totalLiquidity)
                .div(2);

        // yearly premium rate
        uint256 Q = uint256(1e6).sub(_util).add(a);

        uint256 _premiumRate;
        if(_util < 100000 && _lockedAmount > uint256(1e6).mul(1e18)){// under 10% && 1M DAI
            _premiumRate = k.mul(365).sub(Q.mul(a).mul(365)).add(Q.mul(low_risk_b)).div(Q);
        }else{
            _premiumRate = k.mul(365).sub(Q.mul(a).mul(365)).add(Q.mul(b)).div(Q);
        }
        

        // calc yearly premium amount
        uint256 _premium = _amount.mul(_premiumRate);


        // 3) adjust premium for daily basis
        _premium = _premium.mul(_term).div(365 days).div(1e6);


        // 4) Return premium
        return _premium;
    }

    /**
     * @notice Set a premium model
     * @param _baseRatePerYear The Base rate addition to the bonding curve. (scaled by 1e5)
     * @param _multiplierPerYear The rate of mixmum premium(scaled by 1e5)
     */
    function setPremium(uint256 _baseRatePerYear, uint256 _multiplierPerYear)
        external
        onlyOwner
    {
        b = _baseRatePerYear;
        k = _multiplierPerYear;
        a = (uint256(1e6).add(sqrt(uint256(1e6).mul(uint256(1e6)).add(k.mul(4))))).div(2).sub(uint256(1e6));
    }



    function sqrt(uint x)internal pure returns (uint y) {
        uint z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z =
            (x / z + z) / 2;
        }
    }
    
}
