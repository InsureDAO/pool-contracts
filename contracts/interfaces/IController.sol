// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

/**
 * @title IController
 * @author @InsureDAO
 * @dev Defines the basic interface for an InsureDAO Controller.
 * @notice Controller invests market deposited tokens on behalf of Vault contract.
 *         This contract gets utilized a vault assets then invests these assets via
 *         Strategy contract. To Avoid unnecessary complexity, sometimes the controller
 *         includes the functionality of a strategy.
 */
interface IController {
    /**
     * @notice Utilizes a vault fund to strategies, which invest fund to
     *         various protocols. Vault fund is utilized up to maxManagingRatio
     *         determined by the owner.
     * @dev You **should move all pulled fund to strategies** in this function
     *      to avoid unnecessary complexity of asset management.
     *      Controller exists to route vault fund to strategies safely.
     */
    function adjustFund() external;

    /**
     * @notice Returns utilized fund to a vault. If the amount exceeds all
     *         assets the controller manages, transaction should be reverted.
     * @param _amount the amount to be returned to a vault
     */
    function returnFund(uint256 _amount) external;

    /**
     * @notice Returns all assets this controller manages. Value is denominated
     *         in USDC token amount. (e.g. If the controller utilizes 100 USDC
     *         for strategies, valueAll() returns 100,000,000(100 * 1e6)) .
     */
    function managingFund() external view returns (uint256);

    /**
     * @notice The proportion of a vault fund to be utilized. 1e6 regarded as 100%.
     */
    function maxManagingRatio() external view returns (uint256);

    /**
     * @notice Changes maxManagingRatio which
     * @param _ratio maxManagingRatio to be set. See maxManagingRatio() for more detail
     */
    function setMaxManagingRatio(uint256 _ratio) external;

    /**
     * @notice Returns the proportion of a vault fund managed by the controller.
     */
    function currentManagingRatio() external view returns (uint256);

    /**
     * @notice Moves managing asset to new controller. Only vault should call
     *         this method for safety.
     * @param _to the destination of migration. this address should be a
     *            controller address as this method expected call immigrate() internally.
     */
    function emigrate(address _to) external;

    /**
     * @notice Receives the asset from old controller. New controller should call this method.
     * @param _from The address that fund received from. the address should be a controller address.
     */
    function immigrate(address _from) external;

    /**
     * @notice Sends managing fund to any address. This method should be called in case that
     *         managing fund cannot be moved by the controller (e.g. A protocol contract is
     *         temporary unavailable so the controller cannot withdraw managing fund directly,
     *         where emergencyExit() should move to the right to take reward like aUSDC on Aave).
     * @param _to The address that fund will be sent.
     */
    function emergencyExit(address _to) external;
}

error RatioOutOfRange();
error ExceedManagingRatio();
error AlreadyInUse();
error AaveSupplyCapExceeded();
error InsufficientManagingFund();
error InsufficientRewardToWithdraw();
error NoRewardClaimable();
error MigrateToSelf();
error SameAddressUsed();
