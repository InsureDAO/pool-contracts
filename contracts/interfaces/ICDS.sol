pragma solidity 0.8.0;

interface ICDS {
    function compensate(uint256) external;

    function lock() external;

    function resume() external;
}
