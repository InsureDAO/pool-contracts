pragma solidity 0.8.10;
/**
 * @title FlatPremium v2
 * @author @InsureDAO
 * @notice Insurance Premium Calclator
 * SPDX-License-Identifier: GPL-3.0
 */

import "../interfaces/IPremiumModelV2.sol";
import "../interfaces/IOwnership.sol";

contract FlatPremiumV2 is IPremiumModelV2 {
    IOwnership public immutable ownership;

    //variables
    mapping(address => uint256) rates;

    uint256 public constant MAX_RATE = 1e6;
    uint256 private constant RATE_DENOMINATOR = 1e6;

    modifier onlyOwner() {
        require(
            ownership.owner() == msg.sender,
            "Caller is not allowed to operate"
        );
        _;
    }

    constructor(address _ownership) {
        require(_ownership != address(0), "zero address");
        ownership = IOwnership(_ownership);
    }

    function getCurrentPremiumRate(
        address _market,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view override returns (uint256) {
        return rates[_market];
    }

    function getPremiumRate(
        address _market,
        uint256 _amount,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) public view override returns (uint256) {
        return rates[_market];
    }

    function getPremium(
        address _market,
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view override returns (uint256) {
        require(
            _amount + _lockedAmount <= _totalLiquidity,
            "Amount exceeds total liquidity"
        );

        if (_amount == 0) {
            return 0;
        }

        uint256 premium = (_amount * rates[_market] * _term) /
            365 days /
            RATE_DENOMINATOR;

        return premium;
    }

    function setRate(address _market, uint256 _rate)
        external
        override
        onlyOwner
    {
        rates[_market] = _rate;
    }
}
