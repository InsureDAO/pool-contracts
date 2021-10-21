pragma solidity 0.8.7;
/**
 * @author InsureDAO
 * @title InsureDAO vault contract
 * SPDX-License-Identifier: GPL-3.0
 */

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IController.sol";
import "./interfaces/IRegistry.sol";

contract Vault {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;
    /**
     * Storage
     */

    IERC20 public token;
    IController public controller;
    IRegistry public registry;

    mapping(address => uint256) public attributions;
    uint256 public totalAttributions;
    uint256 public debt;

    address public owner; //owner of the contract
    address public keeper; //keeper can operate utilize(), if address zero, anyone can operate.
    uint256 public balance; //balance of underlying token
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;

    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);
    event ControllerSet(address controller);

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

    constructor(
        address _token,
        address _registry,
        address _controller
    ) public {
        token = IERC20(_token);
        registry = IRegistry(_registry);
        controller = IController(_controller);
        owner = msg.sender;
    }

    /**
     * Vault Functions
     */

    /**
     * @notice A registered contract can deposit collateral and get attribution point in return
     * @param  _amount amount of token to deposit
     * @param _from sender's address
     * @param _beneficiary beneficiary's address
     * @return _attributions attribution amount generated from the transaction
     */

    function addValue(
        uint256 _amount,
        address _from,
        address _beneficiary
    ) external returns (uint256 _attributions) {
        require(
            IRegistry(registry).isListed(msg.sender),
            "ERROR_ADD-VALUE_BADCONDITOONS"
        );
        if (totalAttributions == 0) {
            _attributions = _amount;
        } else {
            uint256 _pool = valueAll();
            _attributions = _amount.mul(totalAttributions).div(_pool);
        }
        token.safeTransferFrom(_from, address(this), _amount);
        balance = balance.add(_amount);
        totalAttributions = totalAttributions.add(_attributions);
        attributions[_beneficiary] = attributions[_beneficiary].add(
            _attributions
        );
    }

    /**
     * @notice an address that has balance in the vault can withdraw underlying value
     * @param _amount amount of token to withdraw
     * @param _to address to get underlying token
     * @return _attributions amount of attributions burnet
     */

    function withdrawValue(uint256 _amount, address _to)
        external
        returns (uint256 _attributions)
    {
        require(
            attributions[msg.sender] > 0 &&
                underlyingValue(msg.sender) >= _amount,
            "ERROR_WITHDRAW-VALUE_BADCONDITOONS"
        );
        _attributions = totalAttributions.mul(_amount).div(valueAll());
        attributions[msg.sender] = attributions[msg.sender].sub(_attributions);
        totalAttributions = totalAttributions.sub(_attributions);
        if (available() < _amount) {
            uint256 _shortage = _amount.sub(available());
            _unutilize(_shortage);
        }
        balance = balance.sub(_amount);
        token.safeTransfer(_to, _amount);
    }

    /**
     * @notice an address that has balance in the vault can transfer underlying value
     * @param _amount sender of value
     * @param _destination reciepient of value
     */

    function transferValue(uint256 _amount, address _destination) external {
        require(
            attributions[msg.sender] > 0 &&
                underlyingValue(msg.sender) >= _amount,
            "ERROR_TRANSFER-VALUE_BADCONDITOONS"
        );
        uint256 _targetAttribution = _amount.mul(totalAttributions).div(
            valueAll()
        );
        attributions[msg.sender] = attributions[msg.sender].sub(
            _targetAttribution
        );
        attributions[_destination] = attributions[_destination].add(
            _targetAttribution
        );
    }

    /**
     * @notice an address that has balance in the vault can withdraw value denominated in attribution
     * @param _attribution amount of attribution to burn
     * @param _to beneficiary's address
     * @return _retVal number of token withdrawn from the transaction
     */
    function withdrawAttribution(uint256 _attribution, address _to)
        external
        returns (uint256 _retVal)
    {
        _retVal = _withdrawAttribution(_attribution, _to);
    }

    /**
     * @notice an address that has balance in the vault can withdraw all value
     * @param _to beneficiary's address
     * @return _retVal number of token withdrawn from the transaction
     */
    function withdrawAllAttribution(address _to)
        external
        returns (uint256 _retVal)
    {
        _retVal = _withdrawAttribution(attributions[msg.sender], _to);
    }

    /**
     * @notice an address that has balance in the vault can withdraw all value
     * @param _attribution amount of attribution to burn
     * @param _to beneficiary's address
     * @return _retVal number of token withdrawn from the transaction
     */
    function _withdrawAttribution(uint256 _attribution, address _to)
        internal
        returns (uint256 _retVal)
    {
        require(
            attributions[msg.sender] > 0,
            "ERROR_WITHDRAW-ALL-ATTRIBUTION_BADCONDITOONS"
        );
        _retVal = attributions[msg.sender].mul(valueAll()).div(
            totalAttributions
        );
        attributions[msg.sender] = 0;
        if (available() < _retVal) {
            uint256 _shortage = _retVal.sub(available());
            _unutilize(_shortage);
        }
        balance = balance.sub(_retVal);
        token.safeTransfer(_to, _retVal);
    }

    /**
     * @notice an address that has balance in the vault can transfer value denominated in attribution
     * @param _amount amount of attribution to transfer
     * @param _destination reciepient of attribution
     */
    function transferAttribution(uint256 _amount, address _destination)
        external
    {
        require(
            attributions[msg.sender] > 0 && attributions[msg.sender] >= _amount,
            "ERROR_TRANSFER-ATTRIBUTION_BADCONDITOONS"
        );
        attributions[msg.sender] = attributions[msg.sender].sub(_amount);
        attributions[_destination] = attributions[_destination].add(_amount);
    }

    /**
     * @notice the controller can utilize all available stored funds
     * @return _amount amount of token utilized
     */
    function utilize() external returns (uint256 _amount) {
        if (keeper != address(0)) {
            require(msg.sender == keeper, "ERROR_NOT_KEEPER");
        }
        _amount = available();
        if (_amount > 0) {
            token.safeTransfer(address(controller), _amount);
            balance = balance.sub(_amount);
            controller.earn(address(token), _amount);
        }
    }

    /**
     * @notice the controller can utilize all available stored funds
     * @param _keeper keeper address
     */
    function setKeeper(address _keeper)
        external
        onlyOwner
        returns (uint256 _amount)
    {
        if (keeper != _keeper) {
            keeper = _keeper;
        }
    }

    /**
     * @notice get attribution number for the specified address
     * @param _target target address
     * @return amount of attritbution
     */

    function attributionOf(address _target) external view returns (uint256) {
        return attributions[_target];
    }

    /**
     * @notice get all attribution number for this contract
     * @return amount of all attribution
     */
    function attributionAll() external view returns (uint256) {
        return totalAttributions;
    }

    /**
     * @notice Convert attribution number into underlying assset value
     * @param _attribution amount of attribution
     * @return token value of input attribution
     */
    function attributionValue(uint256 _attribution)
        external
        view
        returns (uint256)
    {
        if (totalAttributions > 0 && _attribution > 0) {
            return _attribution.mul(valueAll()).div(totalAttributions);
        } else {
            return 0;
        }
    }

    /**
     * @notice return underlying value of the specified address
     * @param _target target address
     * @return token value of target address
     */
    function underlyingValue(address _target) public view returns (uint256) {
        if (attributions[_target] > 0) {
            return valueAll().mul(attributions[_target]).div(totalAttributions);
        } else {
            return 0;
        }
    }

    /**
     * @notice return underlying value of this contract
     * @return all token value of the vault
     */
    function valueAll() public view returns (uint256) {
        return balance.add(controller.valueAll());
    }

    /**
     * @notice admin function to set controller address
     * @param _controller address of the controller
     */
    function setController(address _controller) public onlyOwner {
        controller.migrate(address(_controller));
        controller = IController(_controller);
        emit ControllerSet(_controller);
    }

    /**
     * @notice internal function to unutilize the funds and keep utilization rate
     * @param _amount amount to withdraw from controller
     */
    function _unutilize(uint256 _amount) internal {
        controller.withdraw(address(this), _amount);
        balance = balance.add(_amount);
    }

    /**
     * @notice return how much funds in this contract is available to be utilized
     * @return available balance to utilize
     */
    function available() public view returns (uint256) {
        return balance;
    }

    /**
     * @notice return how much price for each attribution
     * @return value of one share of attribution
     */
    function getPricePerFullShare() public view returns (uint256) {
        return valueAll().mul(1e18).div(totalAttributions);
    }

    /**
     * @notice withdraw redundant token stored in this contract
     * @param _token token address
     * @param _to beneficiary's address
     */
    function withdrawRedundant(address _token, address _to) external {
        require(msg.sender == owner, "dev: only owner");
        if (
            _token == address(token) && balance < token.balanceOf(address(this))
        ) {
            uint256 _redundant = token.balanceOf(address(this)).sub(balance);
            token.safeTransfer(_to, _redundant);
        } else if (IERC20(_token).balanceOf(address(this)) > 0) {
            IERC20(_token).safeTransfer(
                _to,
                IERC20(_token).balanceOf(address(this))
            );
        }
    }

    /**
     * Ownership Functions
     */

    /**
     * @notice Commit ownership change transaction
     * @param _owner new owner address
     */

    function commitTransferOwnership(address _owner) external onlyOwner {
        require(transfer_ownership_deadline == 0, "dev: active transfer");
        require(_owner != address(0), "dev: address zero");

        uint256 _deadline = block.timestamp.add(ADMIN_ACTIONS_DELAY);
        transfer_ownership_deadline = _deadline;
        future_owner = _owner;

        emit CommitNewAdmin(_deadline, _owner);
    }

    /**
     * @notice Execute ownership change transaction
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
