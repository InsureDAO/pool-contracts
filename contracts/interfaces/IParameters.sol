pragma solidity 0.8.12;

interface IParameters {
    function setVault(address _token, address _vault) external;

    function setRequestDuration(address _address, uint256 _target) external;

    function setUnlockGracePeriod(address _address, uint256 _target) external;

    function setMaxInsureSpan(address _address, uint256 _target) external;

    function setMinInsureSpan(address _address, uint256 _target) external;

    function setUpperSlack(address _address, uint256 _target) external;

    function setLowerSlack(address _address, uint256 _target) external;

    function setWithdrawableDuration(address _address, uint256 _target) external;

    function setPremiumModel(address _address, address _target) external;

    function setFeeRate(address _address, uint256 _target) external;

    function setMaxList(address _address, uint256 _target) external;

    function setCondition(bytes32 _reference, bytes32 _target) external;

    function getOwner() external view returns (address);

    function getVault(address _token) external view returns (address);

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount,
        address _target
    ) external view returns (uint256);

    function getFeeRate(address _target) external view returns (uint256);

    function getUpperSlack(address _target) external view returns (uint256);

    function getLowerSlack(address _target) external view returns (uint256);

    function getRequestDuration(address _target) external view returns (uint256);

    function getWithdrawableDuration(address _target) external view returns (uint256);

    function getUnlockGracePeriod(address _target) external view returns (uint256);

    function getMaxInsureSpan(address _target) external view returns (uint256);

    function getMinInsureSpan(address _target) external view returns (uint256);

    function getMaxList(address _target) external view returns (uint256);

    function getCondition(bytes32 _reference) external view returns (bytes32);
}
