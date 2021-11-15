pragma solidity 0.8.7;

interface IRegistry {

    function supportMarket(address _market) external;

    function isListed(address _market) external view returns (bool);

    function getCDS(address _address) external view returns (address);

    function setExistence(address _target, uint256 _typeId) external;

    function confirmExistence(address _target, uint256 _typeId)
        external
        view
        returns (bool);
}
