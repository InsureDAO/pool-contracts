/**
 * @title Parameters
 * @author @kohshiba
 * @notice This contract manages parameters of markets.
 */

pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "./libraries/math/SafeMath.sol";
import "./libraries/utils/Address.sol";
import "./interfaces/IParameters.sol";
import "./interfaces/IPremiumModel.sol";
import "./interfaces/IFeeModel.sol";

contract Parameters is IParameters {
    using SafeMath for uint256;
    using Address for address;

    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);

    address public owner;
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;

    mapping(address => address) private _vaults;
    mapping(address => address) private _fee;
    mapping(address => address) private _premium;
    mapping(address => uint256) private _fee2;
    mapping(address => uint256) private _premium2;
    mapping(address => uint256) private _grace;
    mapping(address => uint256) private _lockup;
    mapping(address => uint256) private _min;
    mapping(address => uint256) private _withdawable;
    mapping(bytes32 => bytes32) private _conditions;

    constructor(address _target) public {
        owner = _target;
    }

    function get_owner() public view override returns (address) {
        return owner;
    }

    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    function isOwner() public view override returns (bool) {
        return msg.sender == owner;
    }

    function commit_transfer_ownership(address _owner) external override {
        require(msg.sender == owner, "dev: only owner");
        require(transfer_ownership_deadline == 0, "dev: active transfer");

        uint256 _deadline = block.timestamp.add(ADMIN_ACTIONS_DELAY);
        transfer_ownership_deadline = _deadline;
        future_owner = _owner;

        emit CommitNewAdmin(_deadline, _owner);
    }

    function apply_transfer_ownership() external override {
        require(msg.sender == owner, "dev: only owner");
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

    function setVault(address _token, address _vault)
        external
        override
        onlyOwner
    {
        require(_vaults[_token] == address(0), "dev: already initialized");
        _vaults[_token] = _vault;
    }

    function setLockup(address _address, uint256 _target)
        external
        override
        onlyOwner
    {
        _lockup[_address] = _target;
    }

    function setGrace(address _address, uint256 _target)
        external
        override
        onlyOwner
    {
        _grace[_address] = _target;
    }

    function setMindate(address _address, uint256 _target)
        external
        override
        onlyOwner
    {
        _min[_address] = _target;
    }

    function setPremium2(address _address, uint256 _target)
        external
        override
        onlyOwner
    {
        _premium2[_address] = _target;
    }

    function setFee2(address _address, uint256 _target)
        external
        override
        onlyOwner
    {
        _fee2[_address] = _target;
    }

    function setWithdrawable(address _address, uint256 _target)
        external
        override
        onlyOwner
    {
        _withdawable[_address] = _target;
    }

    function setPremiumModel(address _address, address _target)
        external
        override
        onlyOwner
    {
        _premium[_address] = _target;
    }

    function setFeeModel(address _address, address _target)
        external
        override
        onlyOwner
    {
        _fee[_address] = _target;
    }

    function setCondition(bytes32 _reference, bytes32 _target)
        external
        override
        onlyOwner
    {
        _conditions[_reference] = _target;
    }

    function getVault(address _token) external view override returns (address) {
        if (_vaults[_token] == address(0)) {
            return address(0);
        } else {
            return _vaults[_token];
        }
    }

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view override returns (uint256) {
        if (_premium[msg.sender] == address(0)) {
            return
                IPremiumModel(_premium[address(0)]).getPremium(
                    _amount,
                    _term,
                    _totalLiquidity,
                    _lockedAmount
                );
        } else {
            return
                IPremiumModel(_premium[msg.sender]).getPremium(
                    _amount,
                    _term,
                    _totalLiquidity,
                    _lockedAmount
                );
        }
    }

    function getFee(
        uint256 _amount
        
    ) external view override returns (uint256) {
        if (_fee[msg.sender] == address(0)) {
            return
                IFeeModel(_fee[address(0)]).getFee(
                    _amount        );
        } else {
            return
                IFeeModel(_fee[msg.sender]).getFee(
                    _amount
                );
        }
    }

    function getFee2(uint256 _amount) external view override returns (uint256) {
        if (_fee2[msg.sender] == 0) {
            return _amount.mul(_fee2[address(0)]).div(100000);
        } else {
            return _amount.mul(_fee2[msg.sender]).div(100000);
        }
    }

    function getPremium2(uint256 _amount)
        external
        view
        override
        returns (uint256)
    {
        if (_premium2[msg.sender] == 0) {
            return _amount.mul(_premium2[address(0)]).div(100000);
        } else {
            return _amount.mul(_premium2[msg.sender]).div(100000);
        }
    }

    function getLockup() external view override returns (uint256) {
        if (_lockup[msg.sender] == 0) {
            return _lockup[address(0)];
        } else {
            return _lockup[msg.sender];
        }
    }

    function getWithdrawable() external view override returns (uint256) {
        if (_withdawable[msg.sender] == 0) {
            return _withdawable[address(0)];
        } else {
            return _withdawable[msg.sender];
        }
    }

    function getGrace() external view override returns (uint256) {
        if (_grace[msg.sender] == 0) {
            return _grace[address(0)];
        } else {
            return _grace[msg.sender];
        }
    }

    function getMin() external view override returns (uint256) {
        if (_min[msg.sender] == 0) {
            return _min[address(0)];
        } else {
            return _min[msg.sender];
        }
    }

    function getCondition(bytes32 _reference)
        external
        view
        override
        returns (bytes32)
    {
        return _conditions[_reference];
    }
}
