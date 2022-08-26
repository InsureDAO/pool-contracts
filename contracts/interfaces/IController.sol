// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

interface IController {
    function earn(address _token, uint256 _amount) external;

    function lend(address _strategy, uint256 _amount) external;

    function report(
        uint256 _profit,
        uint256 _loss,
        uint256 _debtPayment
    ) external;

    function withdraw(address _to, uint256 _amount) external;

    function valueAll() external view returns (uint256);

    function utilizeAmount() external returns (uint256);

    function migrate(address) external;

    function addStrategy(address _strategy) external;

    function activateStrategy(address _strategy) external;

    function setDebtLimitRatio(address _strategy, uint256 _debtLimitRatio) external;

    function setWithdrawalQueue(address[] calldata _withdrawlQueue) external;

    function debtOutstanding(address _strategy) external view returns (uint256);

    function debtOutstanding() external view returns (uint256);

    function creditAvailable(address _strategy) external view returns (uint256);

    function creditAvailable() external view returns (uint256);
}
