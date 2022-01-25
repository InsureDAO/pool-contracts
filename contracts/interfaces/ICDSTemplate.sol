pragma solidity 0.8.10;

interface ICDSTemplate {
    function compensate(uint256) external returns (uint256 _compensated);

    //onlyOwner
    function defund(uint256 _amount) external;
}
