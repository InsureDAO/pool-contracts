pragma solidity ^0.6.0;

import "./libraries/tokens/IERC20.sol";
import "./libraries/tokens/SafeERC20.sol";
import "./libraries/math/SafeMath.sol";
import "./libraries/utils/Address.sol";
import "./interfaces/IController.sol";
import "./interfaces/IRegistry.sol";

contract Vault {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    IERC20 public token;
    IController public controller;
    IRegistry public registry;

    uint256 public min = 9500;
    uint256 public constant max = 10000;

    mapping(address => uint256) public attributions;
    uint256 public totalAttributions;

    address public owner;
    address public future_owner;
    uint256 public transfer_ownership_deadline;
    uint256 public constant ADMIN_ACTIONS_DELAY = 3 * 86400;

    event CommitNewAdmin(uint256 deadline, address future_admin);
    event NewAdmin(address admin);

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

    function addValue(
        uint256 _amount,
        address _from,
        address _beneficiary
    ) external returns (uint256 _attributions) {
        require(IRegistry(registry).isListed(msg.sender), "not registered");
        uint256 _pool = valueAll();
        token.safeTransferFrom(_from, address(this), _amount);
        if (totalAttributions == 0) {
            _attributions = _amount;
        } else {
            _attributions = _amount.mul(totalAttributions).div(_pool);
        }
        totalAttributions = totalAttributions.add(_attributions);
        attributions[_beneficiary] = attributions[_beneficiary].add(
            _attributions
        );
    }

    function withdrawValue(uint256 _amount, address _to)
        external
        returns (uint256 _attributions)
    {
        require(
            attributions[msg.sender] > 0 &&
                underlyingValue(msg.sender) >= _amount,
            "check"
        );
        _attributions = totalAttributions.mul(_amount).div(valueAll());
        attributions[msg.sender] = attributions[msg.sender].sub(_attributions);
        totalAttributions = totalAttributions.sub(_attributions);
        if (available() < _amount) {
            uint256 _shortage = _amount.sub(available());
            _unutilize(_shortage);
        }
        token.transfer(_to, _amount);
    }

    function transferValue(uint256 _amount, address _destination) external {
        require(
            attributions[msg.sender] > 0 &&
                underlyingValue(msg.sender) >= _amount,
            "exceeds"
        );
        uint256 _targetAttribution =
            _amount.mul(valueAll()).div(totalAttributions);
        attributions[msg.sender] = attributions[msg.sender].sub(
            _targetAttribution
        );
        attributions[_destination] = attributions[_destination].add(
            _targetAttribution
        );
    }

    function withdrawAttribution(uint256 _attribution, address _to)
        external
        returns (uint256 _retVal)
    {
        require(attributions[msg.sender] > _attribution);
        _retVal = _attribution.mul(valueAll()).div(totalAttributions);
        attributions[msg.sender] = attributions[msg.sender].sub(_attribution);
        if (available() < _retVal) {
            uint256 _shortage = _retVal.sub(available());
            _unutilize(_shortage);
        }
        token.transfer(_to, _retVal);
    }

    function withdrawAllAttribution(address _to)
        external
        returns (uint256 _retVal)
    {
        require(attributions[msg.sender] > 0);
        _retVal = attributions[msg.sender].mul(valueAll()).div(
            totalAttributions
        );
        attributions[msg.sender] = 0;
        if (available() < _retVal) {
            uint256 _shortage = _retVal.sub(available());
            _unutilize(_shortage);
        }
        token.transfer(_to, _retVal);
    }

    function transferAttribution(uint256 _amount, address _destination)
        external
    {
        require(
            attributions[msg.sender] > 0 && attributions[msg.sender] >= _amount
        );
        attributions[msg.sender] = attributions[msg.sender].sub(_amount);
        attributions[_destination] = attributions[_destination].add(_amount);
    }

    function utilize(address _reserve, uint256 _amount) external {
        require(msg.sender == address(controller), "!controller");
        require(_reserve != address(token), "token");
        IERC20(_reserve).safeTransfer(address(controller), _amount);
    }

    function _unutilize(uint256 _amount) internal {
        IController(controller).withdraw(address(token), _amount);
    }

    function earn() public {
        uint256 _bal = available();
        token.safeTransfer(address(controller), _bal);
        IController(controller).earn(address(token), _bal);
    }

    function attributionOf(address _target) external view returns (uint256) {
        return attributions[_target];
    }

    function attributionAll() external view returns (uint256) {
        return totalAttributions;
    }

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

    function underlyingValue(address _target) public view returns (uint256) {
        if (attributions[_target] > 0) {
            return valueAll().mul(attributions[_target]).div(totalAttributions);
        } else {
            return 0;
        }
    }

    function valueAll() public view returns (uint256) {
        return
            token.balanceOf(address(this)).add(
                IController(controller).balanceOf(address(token))
            );
    }

    function setController(address _controller) public {
        require(msg.sender == owner, "dev: only owner");
        controller = IController(_controller);
    }

    function setMin(uint256 _min) external {
        require(msg.sender == owner, "dev: only owner");
        min = _min;
    }

    function available() public view returns (uint256) {
        return token.balanceOf(address(this)).mul(min).div(max);
    }

    function getPricePerFullShare() public view returns (uint256) {
        return valueAll().mul(1e18).div(totalAttributions);
    }

    //----- ownership -----//
    function commit_transfer_ownership(address _owner) external {
        require(msg.sender == owner, "dev: only owner");
        require(transfer_ownership_deadline == 0, "dev: active transfer");

        uint256 _deadline = block.timestamp.add(ADMIN_ACTIONS_DELAY);
        transfer_ownership_deadline = _deadline;
        future_owner = _owner;

        emit CommitNewAdmin(_deadline, _owner);
    }

    function apply_transfer_ownership() external {
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
}
