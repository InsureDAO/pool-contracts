pragma solidity 0.8.7;

interface IIndexTemplate {
    function compensate(uint256) external returns (uint256 _compensated);

    function lock(uint256) external;

    function resume() external;
}
