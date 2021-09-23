pragma solidity 0.8.7;

interface IIndexTemplate {
    function compensate(uint256) external;

    function lock(uint256) external;

    function resume() external;
}
