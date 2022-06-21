pragma solidity 0.8.10;

import "@openzeppelin/contracts/utils/Address.sol";

contract TestPremiumModel {
    using Address for address;

    constructor() {}

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256) {
        //always return premium as rate of 10%
        return _amount / 10;
    }
}
