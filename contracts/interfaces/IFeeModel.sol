pragma solidity 0.8.7;

interface IFeeModel {
    function getFee(uint256 _premium) external view returns (uint256);
}
