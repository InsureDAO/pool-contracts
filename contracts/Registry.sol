// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "./interfaces/IRegistry.sol";

contract Registry is IRegistry{


    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);
    event ExistenceSet(
        address indexed target,
        uint256 indexed typeId,
        bytes32 indexed hashId
    );
    event NewMarketRegistered(address market);
    event FactorySet(address factory);
    event CDSSet(address indexed target, address cds);

    address public factory;
    address public owner;
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;

    mapping(address => address) cds; //index => cds
    mapping(address => bool) markets; //true if the market is registered
    mapping(bytes32 => bool) existence; //true if the certain id is already registered in market
    address[] allMarkets;

    /**
     * @notice Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "Restricted: caller is not allowed to operate"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Set the factory address and allow it to regiser a new market
     * @param _factory factory address
     */
    function setFactory(address _factory) external {
        require(msg.sender == owner);
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
        require(msg.sender == factory || msg.sender == owner);
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
        require(msg.sender == factory || msg.sender == owner);
        bytes32 _hashId = keccak256(abi.encodePacked(_target, _typeId));
        existence[_hashId] = true;
        emit ExistenceSet(_target, _typeId, _hashId);
    }

    /**
     * @notice Register the cds address for a particular address
     * @param _address address to set CDS
     * @param _cds CDS contract address
     */
    function setCDS(address _address, address _cds) external onlyOwner {
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

    //----- ownership -----//

    /**
     * @notice commit new owner address.
     * actutal change occurs after ADMIN_ACTIONS_DELAY passed.
     * @param _owner new owner address
     */
    function commitTransferOwnership(address _owner) external onlyOwner {
        require(transfer_ownership_deadline == 0, "dev: active transfer");
        require(_owner != address(0), "dev: address zero");

        uint256 _deadline = block.timestamp + ADMIN_ACTIONS_DELAY;
        transfer_ownership_deadline = _deadline;
        future_owner = _owner;

        emit CommitNewAdmin(_deadline, _owner);
    }

    /**
     * @notice apply transfer of ownership.
     */
    function applyTransferOwnership() external onlyOwner {
        require(
            block.timestamp >= transfer_ownership_deadline,
            "dev: insufficient time"
        );
        require(transfer_ownership_deadline != 0, "dev: no active transfer");

        transfer_ownership_deadline = 0;
        address _owner = future_owner;

        owner = _owner;

        emit NewAdmin(owner);
    }
}
