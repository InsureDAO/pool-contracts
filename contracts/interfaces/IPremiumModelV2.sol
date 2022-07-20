pragma solidity 0.8.12;

interface IPremiumModelV2 {
    function getCurrentPremiumRate(
        address _market,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256);

    function getPremiumRate(
        address _market,
        uint256 _amount,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256);

    function getPremium(
        address _market,
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount
    ) external view returns (uint256);

    //onlyOwner
    function setRate(address _market, uint256 _rate) external;
}
