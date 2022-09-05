// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface IController {
    function utilize(address _token, uint256 _amount) external;

    function unutilize(address _token, uint256 _amount) external;

    function adjustUtilization() external;

    function emigrate(address _to) external;

    function immigrate(address _from) external;

    function valueAll() external view returns (uint256);

    function getUtlizedAmount() external view returns (uint256);

    function setMaxUtilizationRatio(uint256 _ratio) external;

    function getCurrentUtilizationRatio() external view returns (uint256);
}
