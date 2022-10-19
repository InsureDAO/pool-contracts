// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.12;

import "../mocks/TestERC20Mock.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IOwnership.sol";
import "../interfaces/IController.sol";

contract ControllerMock is IController {
    TestERC20Mock public token;
    IVault public vault;
    IOwnership public ownership;

    modifier onlyOwner() {
        require(ownership.owner() == msg.sender, "Caller is not allowed to operate");
        _;
    }

    constructor(address _token, address _ownership) {
        token = TestERC20Mock(_token);
        ownership = IOwnership(_ownership);
    }

    function returnFund(uint256 _amount) external {
        require(msg.sender == address(vault));
        token.transfer(address(vault), _amount);
    }

    function valueAll() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function managingFund() external view returns (uint256) {
        return token.balanceOf(address(this)); //for test
    }

    function maxManagingRatio() external pure returns (uint256) {
        return 1e6;
    }

    function setVault(address _address) external onlyOwner {
        vault = IVault(_address);
    }

    function pullFund(uint256 _amount) external {
        //do something for yield here in real contracts
        token.mint(address(this), _amount);
    }

    function migrate(address _to) external onlyOwner {
        //do something for yield here in real contracts
        uint256 amount = token.balanceOf(address(this));
        token.transfer(_to, amount);
    }

    function adjustFund() external {}

    function emigrate(address _to) external {}

    function immigrate(address _from) external {}

    function emergencyExit(address _to) external {}

    function setMaxManagingRatio(uint256 _ratio) external {}

    function currentManagingRatio() external view returns (uint256) {}
}
