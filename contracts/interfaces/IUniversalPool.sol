pragma solidity 0.8.12;

interface IUniversalPool {
    function initialize(
        address _depositor,
        string calldata _metaData,
        uint256[] calldata _conditions,
        address[] calldata _references
    ) external;

    //onlyOwner
    function setPaused(bool state) external;

    function changeMetadata(string calldata _metadata) external;
}
