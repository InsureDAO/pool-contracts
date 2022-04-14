pragma solidity 0.8.10;

abstract contract IPoolTemplate {

    enum MarketStatus {
        Trading,
        Payingout
    }
    function registerIndex(uint256 _index)external virtual;
    function allocateCredit(uint256 _credit)
        external
        virtual
        returns (uint256 _mintAmount);

    function pairValues(address _index)
        external
        view
        virtual
        returns (uint256, uint256);

    function withdrawCredit(uint256 _credit)
        external
        virtual
        returns (uint256 _retVal);

    function marketStatus() external view virtual returns(MarketStatus);
    function availableBalance() external view virtual returns (uint256 _balance);

    function utilizationRate() external view virtual returns (uint256 _rate);
    function totalLiquidity() public view virtual returns (uint256 _balance);
    function totalCredit() external view virtual returns (uint256);
    function lockedAmount() external view virtual returns (uint256);

    function valueOfUnderlying(address _owner)
        external
        view
        virtual
        returns (uint256);

    function pendingPremium(address _index)
        external
        view
        virtual
        returns (uint256);

    function paused() external view virtual returns (bool);

    //onlyOwner
    function applyCover(
        uint256 _pending,
        uint256 _payoutNumerator,
        uint256 _payoutDenominator,
        uint256 _incidentTimestamp,
        bytes32 _merkleRoot,
        string calldata _rawdata,
        string calldata _memo
    ) external virtual;

    function applyBounty(
        uint256 _amount,
        address _contributor,
        uint256[] calldata _ids
    )external virtual;
}
