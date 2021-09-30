pragma solidity 0.8.7;

abstract contract IParameters {
    function commitTransferOwnership(address _owner) external virtual;

    function applyTransferOwnership() external virtual;

    function setVault(address _token, address _vault) external virtual;

    function setLockup(address _address, uint256 _target) external virtual;

    function setGrace(address _address, uint256 _target) external virtual;

    function setMindate(address _address, uint256 _target) external virtual;

    function setCDSPremium(address _address, uint256 _target) external virtual;

    function setDepositFee(address _address, uint256 _target) external virtual;

    function setWithdrawable(address _address, uint256 _target)
        external
        virtual;

    function setPremiumModel(address _address, address _target)
        external
        virtual;

    function setMaxList(address _address, uint256 _target) external virtual;

    function setFeeModel(address _address, address _target) external virtual;

    function setCondition(bytes32 _reference, bytes32 _target) external virtual;

    function getVault(address _token) external view virtual returns (address);

    function getPremium(
        uint256 _amount,
        uint256 _term,
        uint256 _totalLiquidity,
        uint256 _lockedAmount,
        address _target
    ) external view virtual returns (uint256);

    function getFee(uint256 _amount, address _target)
        external
        view
        virtual
        returns (uint256);

    function getLockup(address _target) external view virtual returns (uint256);

    function getWithdrawable(address _target)
        external
        view
        virtual
        returns (uint256);

    function getGrace(address _target) external view virtual returns (uint256);

    function getOwner() public view virtual returns (address);

    function isOwner() public view virtual returns (bool);

    function getMin(address _target) external view virtual returns (uint256);

<<<<<<< HEAD
    function getMaxList(address _target)
        external
        view
        virtual
        returns (uint256);

    function getFee2(uint256 _amoun, address _targett)
=======
    function getDepositFee(uint256 _amoun, address _targett)
>>>>>>> QSP-BP-3
        external
        view
        virtual
        returns (uint256);

    function getCDSPremium(uint256 _amount, address _target)
        external
        view
        virtual
        returns (uint256);

    function getCondition(bytes32 _reference)
        external
        view
        virtual
        returns (bytes32);
}
