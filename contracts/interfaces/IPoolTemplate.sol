pragma solidity 0.8.10;

interface IPoolTemplate {
    enum MarketStatus {
        Trading,
        Payingout
    }

    function registerIndex(uint256 _index) external;

    function allocateCredit(uint256 _credit)
        external
        returns (uint256 _mintAmount);

    function pairValues(address _index)
        external
        view
        returns (uint256, uint256);

    function withdrawCredit(uint256 _credit) external returns (uint256 _retVal);

    function marketStatus() external view returns (MarketStatus);

    function availableBalance() external view returns (uint256 _balance);

    function utilizationRate() external view returns (uint256 _rate);

    function totalLiquidity() external view returns (uint256 _balance);

    function totalCredit() external view returns (uint256);

    function lockedAmount() external view returns (uint256);

    function valueOfUnderlying(address _owner) external view returns (uint256);

    function pendingPremium(address _index) external view returns (uint256);

    function paused() external view returns (bool);

    //onlyOwner
    function applyCover(
        uint256 _pending,
        uint256 _payoutNumerator,
        uint256 _payoutDenominator,
        uint256 _incidentTimestamp,
        bytes32 _merkleRoot,
        string calldata _rawdata,
        string calldata _memo
    ) external;

    function applyBounty(
        uint256 _amount,
        address _contributor,
        uint256[] calldata _ids
    ) external;
}
