pragma solidity 0.8.12;

interface IReserveTemplate {
    function compensate(uint256) external returns (uint256 _compensated);

    //onlyOwner
    function defund(address _to, uint256 _amount) external;
}
