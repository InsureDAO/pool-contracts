/**
 * @title Parameters
 * @author @kohshiba
 * @notice This contract manages parameters of markets.
 */

pragma solidity 0.8.7;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IPremiumModel.sol";
import "./interfaces/IFeeModel.sol";

contract Parameters {
    using SafeMath for uint256;
    using Address for address;

    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);
    event VaultSet(address indexed token, address vault);
    event FeeSet(address indexed target, address model);
    event Fee2Set(address indexed target, uint256 rate);
    event PremiumSet(address indexed target, address model);
    event Premium2Set(address indexed target, uint256 rate);
    event LockupSet(address indexed target, uint256 span);
    event GraceSet(address indexed target, uint256 span);
    event MinDateSet(address indexed target, uint256 span);
    event WithdrawableSet(address indexed target, uint256 span);
    event ConditionSet(bytes32 indexed ref, bytes32 condition);
    event MaxListSet(address target, uint256 max);

    address public owner;
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;

    mapping(address => address) private _vaults;
    mapping(address => address) private _fee;
    mapping(address => address) private _premium;
    mapping(address => uint256) private _depositFee;
    mapping(address => uint256) private _CDSPremium;
    mapping(address => uint256) private _grace;
    mapping(address => uint256) private _lockup;
    mapping(address => uint256) private _min;
    mapping(address => uint256) private _maxList;
    mapping(address => uint256) private _withdawable;
    mapping(bytes32 => bytes32) private _conditions;

    constructor(address _target) public {
        owner = _target;
    }

    function getOwner() public view returns (address) {
        return owner;
    }

    modifier onlyOwner() {
        require(isOwner(), "Restricted: caller is not allowed to operate");
        _;
    }

    function isOwner() public view returns (bool) {
        return msg.sender == owner;
    }

    function commitTransferOwnership(address _owner) external onlyOwner {
        require(transfer_ownership_deadline == 0, "dev: active transfer");
        require(_owner != address(0), "dev: address zero");

        uint256 _deadline = block.timestamp.add(ADMIN_ACTIONS_DELAY);
        transfer_ownership_deadline = _deadline;
        future_owner = _owner;

        emit CommitNewAdmin(_deadline, _owner);
    }

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

    function setVault(address _token, address _vault) external onlyOwner {
        require(_vaults[_token] == address(0), "dev: already initialized");
        require(_vault != address(0), "dev: zero address");
        _vaults[_token] = _vault;
        emit VaultSet(_token, _vault);
    }

    function setLockup(address _address, uint256 _target) external onlyOwner {
        _lockup[_address] = _target;
        emit LockupSet(_address, _target);
    }

    function setGrace(address _address, uint256 _target) external onlyOwner {
        _grace[_address] = _target;
        emit GraceSet(_address, _target);
    }

    function setMindate(address _address, uint256 _target) external onlyOwner {
        _min[_address] = _target;
        emit MinDateSet(_address, _target);
    }

    function setCDSPremium(address _address, uint256 _target)
        external
        onlyOwner
    {
        _CDSPremium[_address] = _target;
        emit Premium2Set(_address, _target);
    }

    function setDepositFee(address _address, uint256 _target)
        external
        onlyOwner
    {
        _depositFee[_address] = _target;
        emit Fee2Set(_address, _target);
    }

    function setWithdrawable(address _address, uint256 _target)
        external
        onlyOwner
    {
        _withdawable[_address] = _target;
        emit WithdrawableSet(_address, _target);
    }

    function setPremiumModel(address _address, address _target)
        external
        onlyOwner
    {
        require(_target != address(0), "dev: zero address");
        _premium[_address] = _target;
        emit PremiumSet(_address, _target);
    }

    function setFeeModel(address _address, address _target) external onlyOwner {
        require(_target != address(0), "dev: zero address");
        _fee[_address] = _target;
        emit FeeSet(_address, _target);
    }

    function setMaxList(address _address, uint256 _target) external onlyOwner {
        _maxList[_address] = _target;
        emit MaxListSet(_address, _target);
    }

    function setCondition(bytes32 _reference, bytes32 _target)
        external
        onlyOwner
    {
        _conditions[_reference] = _target;
        emit ConditionSet(_reference, _target);
    }

    function getVault(address _token) external view returns (address) {
        return _vaults[_token];
    }

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount,
        address _target
    ) external view returns (uint256) {
        if (_premium[_target] == address(0)) {
            return
                IPremiumModel(_premium[address(0)]).getPremium(
                    _amount,
                    _term,
                    _totalLiquidity,
                    _lockedAmount
                );
        } else {
            return
                IPremiumModel(_premium[_target]).getPremium(
                    _amount,
                    _term,
                    _totalLiquidity,
                    _lockedAmount
                );
        }
    }

    function getFee(uint256 _amount, address _target)
        external
        view
        returns (uint256)
    {
        if (_fee[_target] == address(0)) {
            return IFeeModel(_fee[address(0)]).getFee(_amount);
        } else {
            return IFeeModel(_fee[_target]).getFee(_amount);
        }
    }

    function getDepositFee(uint256 _amount, address _target)
        external
        view
        returns (uint256)
    {
        if (_depositFee[_target] == 0) {
            return _amount.mul(_depositFee[address(0)]).div(100000);
        } else {
            return _amount.mul(_depositFee[_target]).div(100000);
        }
    }

    function getCDSPremium(uint256 _amount, address _target)
        external
        view
        returns (uint256)
    {
        if (_CDSPremium[_target] == 0) {
            return _amount.mul(_CDSPremium[address(0)]).div(100000);
        } else {
            return _amount.mul(_CDSPremium[_target]).div(100000);
        }
    }

    function getLockup(address _target) external view returns (uint256) {
        if (_lockup[_target] == 0) {
            return _lockup[address(0)];
        } else {
            return _lockup[_target];
        }
    }

    function getWithdrawable(address _target) external view returns (uint256) {
        if (_withdawable[_target] == 0) {
            return _withdawable[address(0)];
        } else {
            return _withdawable[_target];
        }
    }

    function getGrace(address _target) external view returns (uint256) {
        if (_grace[_target] == 0) {
            return _grace[address(0)];
        } else {
            return _grace[_target];
        }
    }

    function getMin(address _target) external view returns (uint256) {
        if (_min[_target] == 0) {
            return _min[address(0)];
        } else {
            return _min[_target];
        }
    }

    function getMaxList(address _target) external view returns (uint256) {
        if (_maxList[_target] == 0) {
            return _maxList[address(0)];
        } else {
            return _maxList[_target];
        }
    }

    function getCondition(bytes32 _reference) external view returns (bytes32) {
        return _conditions[_reference];
    }
}
