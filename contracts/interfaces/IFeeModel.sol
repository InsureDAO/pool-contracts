pragma solidity ^0.6.0;

interface IFeeModel {
    function getFee(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256);
}
