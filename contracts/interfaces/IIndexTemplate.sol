pragma solidity 0.8.12;

interface IIndexTemplate {
    function compensate(uint256) external returns (uint256 _compensated);

    function lock() external;

    function resume() external;

    function adjustAlloc() external;

    //onlyOwner
    function setLeverage(uint256 _target) external;

    function set(
        uint256 _indexA,
        address _pool,
        uint256 _allocPoint
    ) external;
}
