pragma solidity ^0.6.0;

interface IUniversalMarket {
    function initialize(
        string calldata _metaData,
        uint256[] calldata _conditions,
        address[] calldata _references
    ) external returns (bool);

    function setPaused(bool state) external;

    function changeMetadata(string calldata _metadata) external;
}
