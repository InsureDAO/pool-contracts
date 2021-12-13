// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "./interfaces/IOwnership.sol";
import "./interfaces/IRegistry.sol";

contract Registry is IRegistry{

    event ExistenceSet(
        address indexed target,
        uint256 indexed typeId,
        bytes32 indexed hashId
    );
    event NewMarketRegistered(address market);
    event FactorySet(address factory);
    event CDSSet(address indexed target, address cds);

    address public factory;

    mapping(address => address) cds; //index => cds
    mapping(address => bool) markets; //true if the market is registered
    mapping(bytes32 => bool) existence; //true if the certain id is already registered in market
    address[] allMarkets;

    IOwnership public ownership;

    modifier onlyOwner() {
        require(ownership.owner() == msg.sender, 'Restricted: caller is not allowed to operate');
        _;
    }


    constructor(address _ownership) {
        ownership = IOwnership(_ownership);
    }

    /**
     * @notice Set the factory address and allow it to regiser a new market
     * @param _factory factory address
     */
    function setFactory(address _factory) external override onlyOwner{
        require(_factory != address(0), "dev: zero address");

        factory = _factory;
        emit FactorySet(_factory);
    }

    /**
     * @notice Register a new market.
     * @param _market market address to register
     */
    function supportMarket(address _market) external override {
        require(!markets[_market]);
        require(msg.sender == factory || msg.sender == ownership.owner());
        require(_market != address(0), "dev: zero address");
        
        allMarkets.push(_market);
        markets[_market] = true;
        emit NewMarketRegistered(_market);
    }

    /**
     * @notice Register a new bytes32 id and address set.
     * @param _target target address
     * @param _typeId id
     */
    function setExistence(address _target, uint256 _typeId) external override {
        require(msg.sender == factory || msg.sender == ownership.owner());

        bytes32 _hashId = keccak256(abi.encodePacked(_target, _typeId));
        existence[_hashId] = true;
        emit ExistenceSet(_target, _typeId, _hashId);
    }

    /**
     * @notice Register the cds address for a particular address
     * @param _address address to set CDS
     * @param _cds CDS contract address
     */
    function setCDS(address _address, address _cds) external override onlyOwner{
        require(_cds != address(0), "dev: zero address");

        cds[_address] = _cds;
        emit CDSSet(_address, _cds);
    }

    /**
     * @notice Get the cds address for a particular address
     * @param _address address covered by CDS
     * @return true if the id within the market already exists
     */
    function getCDS(address _address) external override view returns (address) {
        if (cds[_address] == address(0)) {
            return cds[address(0)];
        } else {
            return cds[_address];
        }
    }

    /**
     * @notice Get whether the target address and id set exists
     * @param _target target address
     * @param _typeId id
     * @return true if the id within the market already exists
     */
    function confirmExistence(address _target, uint256 _typeId)
        external override
        view
        returns (bool)
    {
        return existence[keccak256(abi.encodePacked(_target, _typeId))];
    }

    /**
     * @notice Get whether market is registered
     * @param _market market address to inquire
     * @return true if listed
     */
    function isListed(address _market) external override view returns (bool) {
        return markets[_market];
    }

    /**
     * @notice Get all market
     * @return all markets
     */
    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }
}
