/**
 * @title Factory
 * @author @InsureDAO
 * @notice This contract is the functory contract that manages functions related to market creation activities.
 * SPDX-License-Identifier: GPL-3.0
 */

pragma solidity 0.8.7;

import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IUniversalMarket.sol";
import "./interfaces/IRegistry.sol";

contract Factory {

    event MarketCreated(
        address indexed market,
        address indexed template,
        string _metaData,
        uint256[] conditions,
        address[] references
    );
    event TemplateApproval(
        IUniversalMarket indexed template,
        bool approval,
        bool isOpen,
        bool duplicate
    );
    event ReferenceApproval(
        IUniversalMarket indexed template,
        uint256 indexed slot,
        address target,
        bool approval
    );
    event ConditionApproval(
        IUniversalMarket indexed template,
        uint256 indexed slot,
        uint256 target
    );
    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);

    address[] public markets;

    struct Template {
        bool isOpen; //true if the market allows anyone to create a market
        bool approval; //true if the market exists
        bool allowDuplicate; //true if the market with same ID is allowed
    }
    mapping(address => Template) public templates;
    //mapping of authorized market template address

    mapping(address => mapping(uint256 => mapping(address => bool)))
        public reflist;
    //Authorized reference(address) list for market market template
    //Each template has different set of references
    //true if that address is authorized within the template
    // Example reference list for pool template v1
    // references[0] = target governance token address
    // references[1] = underlying token address
    // references[2] = registry
    // references[3] = parameter

    mapping(address => mapping(uint256 => uint256)) public conditionlist;
    //Authorized condition(uint256) list for market temaplate
    //Each template has different set of conditions
    //true if that address is authorized within the template
    // Example condition list for pool template v1
    // conditions[0] = target id
    // conditions[1] = minimim deposit amount

    address public registry;
    address public owner;
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;

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

    constructor(address _registry) public {
        owner = msg.sender;
        registry = _registry;
    }

    /**
     * @notice A function to approve or disapprove templates.
     * Only owner of the contract can operate.
     * @param _template template address, which must be registered
     * @param _approval true if a market is allowed to create based on the template
     * @param _isOpen true if anyone can create a market based on the template
     * @param _duplicate true if a market with duplicate target id is allowed
     */
    function approveTemplate(
        IUniversalMarket _template,
        bool _approval,
        bool _isOpen,
        bool _duplicate
    ) external onlyOwner {
        require(address(_template) != address(0));
        templates[address(_template)].approval = _approval;
        templates[address(_template)].isOpen = _approval;
        templates[address(_template)].allowDuplicate = _duplicate;
        emit TemplateApproval(_template, _approval, _isOpen, _duplicate);
    }

    /**
     * @notice A function to preset reference.
     * Only owner of the contract can operate.
     * @param _template template address, which must be registered
     * @param _slot the index within reference array
     * @param _target the reference  address
     * @param _approval true if the reference is approved
     */
    function approveReference(
        IUniversalMarket _template,
        uint256 _slot,
        address _target,
        bool _approval
    ) external onlyOwner {
        require(msg.sender == owner, "dev: only owner");
        require(templates[address(_template)].approval == true);
        reflist[address(_template)][_slot][_target] = _approval;
        emit ReferenceApproval(_template, _slot, _target, _approval);
    }

    /**
     * @notice A function to preset reference.
     * Only owner of the contract can operate.
     * @param _template template address, which must be registered
     * @param _slot the index within condition array
     * @param _target the condition uint
     */
    function setCondition(
        IUniversalMarket _template,
        uint256 _slot,
        uint256 _target
    ) external onlyOwner {
        require(templates[address(_template)].approval == true);
        conditionlist[address(_template)][_slot] = _target;
        emit ConditionApproval(_template, _slot, _target);
    }

    /**
     * @notice A function to create markets.
     * This function is market model agnostic.
     * @param _template template address, which must be registered
     * @param _metaData arbitrary string to store market information
     * @param _conditions array of conditions
     * @param _references array of references
     * @return created market address
     */
    function createMarket(
        IUniversalMarket _template,
        string memory _metaData,
        uint256[] memory _conditions,
        address[] memory _references
    ) public returns (address) {
        require(
            templates[address(_template)].approval == true,
            "UNAUTHORIZED_TEMPLATE"
        );
        if (templates[address(_template)].isOpen == false) {
            require(owner == msg.sender, "UNAUTHORIZED_SENDER");
        }
        if (_references.length > 0) {
            for (uint256 i = 0; i < _references.length; i++) {
                require(
                    reflist[address(_template)][i][_references[i]] == true ||
                        reflist[address(_template)][i][address(0)] == true,
                    "UNAUTHORIZED_REFERENCE"
                );
            }
        }

        if (_conditions.length > 0) {
            for (uint256 i = 0; i < _conditions.length; i++) {
                if (conditionlist[address(_template)][i] > 0) {
                    _conditions[i] = conditionlist[address(_template)][i];
                }
            }
        }

        IUniversalMarket market = IUniversalMarket(
            _createClone(address(_template))
        );

        market.initialize(_metaData, _conditions, _references);

        emit MarketCreated(
            address(market),
            address(_template),
            _metaData,
            _conditions,
            _references
        );
        markets.push(address(market));
        IRegistry(registry).supportMarket(address(market));

        if (
            IRegistry(registry).confirmExistence(
                _references[0],
                _conditions[0]
            ) == false
        ) {
            IRegistry(registry).setExistence(_references[0], _conditions[0]);
        } else {
            if (templates[address(_template)].allowDuplicate == false) {
                revert("DUPLICATE_MARKET");
            }
        }

        return address(market);
    }

    /**
     * @notice Template Code for the create clone method:
     * https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1167.md
     */
    function _createClone(address target) internal returns (address result) {
        // convert address to bytes20 for assembly use
        bytes20 targetBytes = bytes20(target);
        assembly {
            // allocate clone memory
            let clone := mload(0x40)
            // store initial portion of the delegation contract code in bytes form
            mstore(
                clone,
                0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000
            )
            // store the provided address
            mstore(add(clone, 0x14), targetBytes)
            // store the remaining delegation contract code
            mstore(
                add(clone, 0x28),
                0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
            )
            // create the actual delegate contract reference and return its address
            result := create(0, clone, 0x37)
        }
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
