pragma solidity 0.8.7;
/**
 * @title BondingPremium
 * @author @InsureDAO
 * @notice Insurance Premium Calclator
 * SPDX-License-Identifier: GPL-3.0
 */

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IOwnership.sol";
import "./ABDKMath64x64.sol";
import "hardhat/console.sol";

contract BondingPremium {

    ABDKMath64x64 public calculator;
    IOwnership public ownership;

    //variables
    uint256 public k; //final curve rate of the dynamic pricing
    uint256 public c; //initial base fee
    uint256 public b; //final base fee
    uint256 public T_1; //goal TVL (USDC)

    //constants
    uint256 public constant DECIMAL = uint256(1e6); //Decimals of USDC
    uint256 public constant BASE = uint256(1e6); //bonding curve graph takes 1e6 as 100.0000%
    uint256 public constant BASE_x2 = uint256(1e12); //BASE^2
    uint256 public constant ADJUSTER = uint256(10); //adjuster of 1e6 to 1e5 (100.0000% to 100.000%)


    modifier onlyOwner() {
        require(ownership.owner() == msg.sender, 'Restricted: caller is not allowed to operate');
        _;
    }


    constructor(
      address _calculator,
      address _ownership
    ) {
      calculator = ABDKMath64x64(_calculator);
      ownership = IOwnership(_ownership);

      //setPremium()
      k = 200100000;
      c = 10000;
      b = 1000;
      T_1 = 1000000 * DECIMAL;
    }


    function getCurrentPremiumRate(
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) public view returns (uint256){
        // utilization rate (0~1000000)
        uint256 _util = _lockedAmount * BASE / _totalLiquidity;

        // yearly premium rate
        uint256 _premiumRate;

        uint256 T_0 = _totalLiquidity;
        if(T_0 > T_1){
            T_0 = T_1;
        }

        uint256 a = (sqrt((BASE_x2*BASE_x2*T_1 + 4*k*T_0*BASE_x2)/T_1) - BASE_x2)/2; //a*BASE (in calc)

        uint256 Q = (BASE - _util) + a/BASE; //x+a (in calc)

        _premiumRate = 365 * (k * T_0 * BASE - a * Q * T_1) + Q*(c-b)*(T_1-T_0)*BASE + b * Q * T_1 * BASE;

        _premiumRate = _premiumRate / Q / T_1 / BASE;

        //Return premium
        return _premiumRate;
    }

    /***
    * @notice Get premium rate.
    * @param _amount  token amount of insurance be bought
    * @param _totalLiquidity total liquidity token amount in the insurance pool.
    * @param _lockedAmount utilized token amount of the insurance pool.
    * @dev This returns value without divides by BASE_DEGITS to keep precision. have to devide by BASE_DEGITS at last of getPremium().
    */
    struct Temp{
      int128 u;
      int128 a;
      int128 BASE_temp;
    }
    function getPremiumRate(
        uint256 _amount,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) public view returns (uint256) {
        require(_amount + _lockedAmount <= _totalLiquidity, "exceed available balance");

        if(_totalLiquidity == 0 || _amount == 0){
            return 0;
        }

        uint256 u1 = BASE - (_lockedAmount * BASE / _totalLiquidity); //util rate before. 1000000 = 100.000%
        uint256 u2 = BASE - ((_lockedAmount + _amount) * BASE / _totalLiquidity); //util rate after. 1000000 = 100.000%

        uint256 T_0 = _totalLiquidity;
        if(T_0 > T_1){
            T_0 = T_1;
        }

        uint256 a = (sqrt((BASE_x2*BASE_x2*T_1 + 4*k*T_0*BASE_x2)/T_1) - BASE_x2)/2; //a*BASE (in calc)
        
        Temp memory temp;
        temp.a = calculator.fromUInt(a);
        temp.BASE_temp = calculator.fromUInt(BASE);
        temp.a = calculator.div(temp.a, temp.BASE_temp);

        //calc 0=>u1 area
        temp.u = calculator.fromUInt(u1);
        int128 ln_u1 = calculator.ln(calculator.add(temp.u, temp.a));
        uint256 ln_res_u1 = calculator.mulu(ln_u1, k); //k*ln(x+a) //very percise.

        uint256 _premium_u1 = (365 * T_0 * ln_res_u1 * BASE) + u1 * ((T_1-T_0) * c * BASE + T_0 * b * BASE) - T_1 * 365 * a * u1;

        //calc 0=>u2 area
        temp.u = calculator.fromUInt(u2);
        int128 ln_u2 = calculator.ln(calculator.add(temp.u, temp.a));
        uint256 ln_res_u2 = calculator.mulu(ln_u2, k); //k*ln(x+a) //very percise.

        uint _premium_u2 = (365 * T_0 * ln_res_u2 * BASE) + u2 * ((T_1-T_0) * c * BASE + T_0 * b * BASE) - T_1 * 365 * a * u2;

        //(u1 area) - (u2 area) = premium rate between u1 and u2
        uint256 premiumRate = _premium_u1 - _premium_u2;
        premiumRate = premiumRate / T_1 / (u1-u2) / BASE ;

        console.log("sc: premiumRate:", premiumRate);

        return premiumRate;
    }

    /***
    * @notice Get premium. This returns token amount of premium buyer has to pay.
    * @param _amount 
    * @param _term
    * @param _totalLiquidity total liquidity token amount in the insurance pool.
    * @param _lockedAmount utilized token amount of the insurance pool.
    */
    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        require(_amount + _lockedAmount <= _totalLiquidity, "Amount exceeds.");
        require(_totalLiquidity != 0, "_totalLiquidity cannnot be 0");

        if (_amount == 0) {
            return 0;
        }
        
        uint256 premiumRate = getPremiumRate(_amount, _totalLiquidity, _lockedAmount);

        uint256 premium = _amount * premiumRate * _term / 365 days / BASE_x2;
        
        return premium;
    }


    /**
     * @notice Set a premium model
     * @param _multiplierPerYear The curve rate of premium per year.
     * @param _initialBaseRatePerYear The Initial Base rate addition to the bonding curve.
     * @param _finalBaseRatePerYear The Final Base rate addition to the bonding curve.
     * @param _goalTVL As TVL grows twords goalTVL, parameters gradually shift from initial to final value.
     */
    function setPremium(uint256 _multiplierPerYear, uint256 _initialBaseRatePerYear, uint256 _finalBaseRatePerYear, uint256 _goalTVL)
        external
        onlyOwner
    {
        k = _multiplierPerYear;
        c = _initialBaseRatePerYear;
        b = _finalBaseRatePerYear;
        T_1 = _goalTVL;
    }

    function sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
