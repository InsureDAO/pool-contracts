pragma solidity 0.8.7;

interface ICDS {
    function compensate(uint256) external returns (uint256 _compensated);

    //function lock() external;

    //function resume() external;
}
