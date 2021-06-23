pragma solidity ^0.6.0;

abstract contract IIndexTemplate {
    function compensate(uint256) external virtual;

    function lock() external virtual;

    function resume() external virtual;

    function adjustAlloc() public virtual;
}
