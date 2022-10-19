pragma solidity 0.8.12;

interface IRegistry {
    function isListed(address _market) external view returns (bool);

    function getReserve(address _address) external view returns (address);

    function confirmExistence(address _template, address _target) external view returns (bool);

    //onlyOwner
    function setFactory(address _factory) external;

    function addPool(address _market) external;

    function setExistence(address _template, address _target) external;

    function setReserve(address _address, address _reserve) external;
}
