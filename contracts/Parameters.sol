pragma solidity 0.8.7;

/**
 * @title Parameters
 * @author @InsureDAO
 * @notice This contract manages parameters of markets.
 * SPDX-License-Identifier: GPL-3.0
 */


import "./interfaces/IOwnership.sol";
import "./interfaces/IParameters.sol";
import "./interfaces/IPremiumModel.sol";
import "./interfaces/IFeeModel.sol";

import "hardhat/console.sol";

contract Parameters is IParameters{

    event MinterSet(address minter);
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

    address public minter;
    address public ownership;

    mapping(address => address) private _vaults; //address of the vault contract for each token
    mapping(address => address) private _fee; //address for each fee model contract
    mapping(address => address) private _premium; //address for each premium model contract
    mapping(address => uint256) private _depositFee; //fee rate for deposit (100% = 1e5, 10% =1e4
    mapping(address => uint256) private _CDSPremium; //CDS premium rate (100% = 1e5, 10% =1e4
    mapping(address => uint256) private _grace; //grace before an insurance policy expires
    mapping(address => uint256) private _lockup; //funds lock up period after user requested to withdraw liquidity
    mapping(address => uint256) private _min; //minimum period to purchase an insurance policy
    mapping(address => uint256) private _maxList; //maximum number of pools one index can allocate
    mapping(address => uint256) private _withdawable; //a certain period a user can withdraw after lock up ends
    mapping(bytes32 => bytes32) private _conditions; //condition mapping for future use cases

    constructor(address _ownership) {
        ownership = _ownership;
    }

    /**
     * @notice Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(IOwnership(ownership).owner() == msg.sender, 'Restricted: caller is not allowed to operate');
        _;
    }


    /**
     * @notice set the minter address
     * @param _minter minter address
     */
    function setMinter(address _minter) external override onlyOwner {
        require(minter == address(0), "dev: already initialized");
        minter = _minter;
        emit MinterSet(_minter);
    }

    /**
     * @notice set the vault address corresponding to the token address
     * @param _token address of token
     * @param _vault vault for token
     */
    function setVault(address _token, address _vault) external override onlyOwner {
        require(_vaults[_token] == address(0), "dev: already initialized");
        require(_vault != address(0), "dev: zero address");
        _vaults[_token] = _vault;
        emit VaultSet(_token, _vault);
    }

    /**
     * @notice set lock up periods in unix timestamp length (1 day = 86400)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setLockup(address _address, uint256 _target) external override onlyOwner {
        _lockup[_address] = _target;
        emit LockupSet(_address, _target);
    }

    /**
     * @notice set grace period length in unix timestamp length (1 day = 86400)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setGrace(address _address, uint256 _target) external override onlyOwner {
        _grace[_address] = _target;
        emit GraceSet(_address, _target);
    }

    /**
     * @notice set min length in unix timestamp length (1 day = 86400)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setMindate(address _address, uint256 _target) external override onlyOwner {
        _min[_address] = _target;
        emit MinDateSet(_address, _target);
    }

    /**
     * @notice set CDS premium rate in 1e5 scale (100% = 1e5, 10% = 1e4)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setCDSPremium(address _address, uint256 _target)
        external override
        onlyOwner
    {
        _CDSPremium[_address] = _target;
        emit Premium2Set(_address, _target);
    }

    /**
     * @notice set deposit fee rate in 1e5 scale (100% = 1e5, 10% = 1e4)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setDepositFee(address _address, uint256 _target)
        external override
        onlyOwner
    {
        _depositFee[_address] = _target;
        emit Fee2Set(_address, _target);
    }

    /**
     * @notice set withdrawable period in unixtimestamp length (1 day = 86400)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setWithdrawable(address _address, uint256 _target)
        external override
        onlyOwner
    {
        _withdawable[_address] = _target;
        emit WithdrawableSet(_address, _target);
    }

    /**
     * @notice set the contract address of premium model
     * @param _address address to set the premium model
     * @param _target premium model contract address
     */
    function setPremiumModel(address _address, address _target)
        external override
        onlyOwner
    {
        require(_target != address(0), "dev: zero address");
        _premium[_address] = _target;
        emit PremiumSet(_address, _target);
    }

    /**
     * @notice set the contract address of fee model
     * @param _address address to set the fee model
     * @param _target fee model contract address
     */
    function setFeeModel(address _address, address _target) external override onlyOwner {
        require(_target != address(0), "dev: zero address");
        _fee[_address] = _target;
        emit FeeSet(_address, _target);
    }

    /**
     * @notice set the max list number (e.g. 10)
     * @param _address address to set the parameter
     * @param _target parameter
     */
    function setMaxList(address _address, uint256 _target) external override onlyOwner {
        _maxList[_address] = _target;
        emit MaxListSet(_address, _target);
    }

    /**
     * @notice set the condition in bytes32 corresponding to bytes32
     * @param _reference bytes32 value to refer the parameter
     * @param _target parameter
     */
    function setCondition(bytes32 _reference, bytes32 _target)
        external override
        onlyOwner
    {
        _conditions[_reference] = _target;
        emit ConditionSet(_reference, _target);
    }

    /**
     * @notice Get the address of the owner
     * @return owner's address
     */
    function getOwner() public override view returns (address) {
        return IOwnership(ownership).owner();
    }

    /**
     * @notice Get the minter address
     * @return minter's address
     */
    function getMinter() public override view returns (address) {
        return minter;
    }

    /**
     * @notice get the address of the vault contract
     * @param _token token address
     * @return vault address
     */
    function getVault(address _token) external override view returns (address) {
        return _vaults[_token];
    }

    /**
     * @notice get premium amount for the specified conditions
     * @param _amount amount to get insured
     * @param _term term length
     * @param _totalLiquidity liquidity of the target contract's pool
     * @param _lockedAmount locked amount of the total liquidity
     * @param _target address of insurance market
     * @return premium amount
     */
    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount,
        address _target
    ) external override view returns (uint256) {
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

    /**
     * @notice get fee amount for the specified conditions
     * @param _amount amount to get insured
     * @param _target address of insurance market
     * @return fee amount
     */
    function getFee(uint256 _amount, address _target)
        external override
        view
        returns (uint256)
    {
        if (_fee[_target] == address(0)) {
            return IFeeModel(_fee[address(0)]).getFee(_amount);
        } else {
            return IFeeModel(_fee[_target]).getFee(_amount);
        }
    }

    /**
     * @notice get deposit fee amount for the specified conditions
     * @param _amount amount to deposit
     * @param _target target contract's address
     * @return fee amount
     */
    function getDepositFee(uint256 _amount, address _target)
        external override
        view
        returns (uint256)
    {
        if (_depositFee[_target] == 0) {
            return _amount * _depositFee[address(0)] / 100000;
        } else {
            return _amount * _depositFee[_target] / 100000;
        }
    }

    /**
     * @notice get cds premium amount for the specified conditions
     * @param _amount amount to deposit
     * @param _target target contract's address
     * @return premium amount
     */
    function getCDSPremium(uint256 _amount, address _target)
        external override
        view
        returns (uint256)
    {
        if (_CDSPremium[_target] == 0) {
            return _amount * _CDSPremium[address(0)] / 100000;
        } else {
            return _amount * _CDSPremium[_target] / 100000;
        }
    }

    /**
     * @notice get lock up period length
     * @param _target target contract's address
     * @return lock up period
     */
    function getLockup(address _target) external override view returns (uint256) {
        if (_lockup[_target] == 0) {
            return _lockup[address(0)];
        } else {
            return _lockup[_target];
        }
    }

    /**
     * @notice get withdrawable period length
     * @param _target target contract's address
     * @return withdrawable period
     */
    function getWithdrawable(address _target) external override view returns (uint256) {
        if (_withdawable[_target] == 0) {
            return _withdawable[address(0)];
        } else {
            return _withdawable[_target];
        }
    }

    /**
     * @notice get grace period length
     * @param _target target contract's address
     * @return grace period
     */
    function getGrace(address _target) external override view returns (uint256) {
        if (_grace[_target] == 0) {
            return _grace[address(0)];
        } else {
            return _grace[_target];
        }
    }

    /**
     * @notice get minimum period length for an insurance policy
     * @param _target target contract's address
     * @return minimum lenght of policy
     */
    function getMin(address _target) external override view returns (uint256) {
        if (_min[_target] == 0) {
            return _min[address(0)];
        } else {
            return _min[_target];
        }
    }

    /**
     * @notice get max number of pools for an index
     * @param _target target contract's address
     * @return maximum number of pools
     */
    function getMaxList(address _target) external override view returns (uint256) {
        if (_maxList[_target] == 0) {
            return _maxList[address(0)];
        } else {
            return _maxList[_target];
        }
    }

    /**
     * @notice get conditions for the corresponding reference parameter in bytes32
     * @param _reference reference address
     * @return condition parameter
     */
    function getCondition(bytes32 _reference) external override view returns (bytes32) {
        return _conditions[_reference];
    }
}
