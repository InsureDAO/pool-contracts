// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface IController {
    function returnFund(uint256 _amount) external;

    function adjustFund() external;

    function emigrate(address _to) external;

    function immigrate(address _from) external;

    function valueAll() external view returns (uint256);

    function managingFund() external view returns (uint256);

    function setMaxManagingRatio(uint256 _ratio) external;

    function currentManagingRatio() external view returns (uint256);
}
