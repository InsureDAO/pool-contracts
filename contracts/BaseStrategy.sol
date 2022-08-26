//SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import "./interfaces/IController.sol";

abstract contract BaseStrategy {
    address keeper;
    IController controller;

    /**
    @dev these variables used to trigger harvest or tend
     */
    uint256 minReportDelay; // minimum interval until next report can be sent
    uint256 maxReportDelay; // maximum interval until next report can be sent
    uint256 lossThreshold; // how far the strategy can go into loss without report

    uint256 gasCalculationFactor; // minimum multiplication for gas which makes call cost profitable

    bool emergency_exit; // it enables force exit all position and send to the controller

    constructor(address _keeper, address _controller) {
        _initialize(_keeper, _controller);
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "Caller is not allowed to operate");
        _;
    }

    function _initialize(address _keeper, address _controller) internal {
        keeper = _keeper;
        controller = IController(_controller);
        minReportDelay = 0;
        maxReportDelay = 0;
        lossThreshold = 0;
    }

    /**
    @notice returns total assets the strategy manages(balance + managed tokens outside)
     */
    function estimatedTotalAssets() external view returns (uint256) {
        // TODO: implement
    }

    /**
    @notice returns the strategy should be tended
     */
    function tendTrigger() external virtual onlyKeeper returns (bool) {
        return false;
    }

    /**
    @notice adjust the strategy position(do not report to the controller)
     */
    function tend() external onlyKeeper {
        _adjustPosition(controller.debtOutstanding());
    }

    /**
    @notice returns the strategy should be harvested
     */
    function harvetTrigger() external virtual onlyKeeper {}

    /**
    @notice get all reward and report to the controller
     */
    function harvest() external onlyKeeper {}

    /**
    @notice liquidate specified amount of position from outside
     */
    function _liquidatePosition(uint256 _amountNeeded)
        internal
        virtual
        returns (uint256 _liquidatedAmount, uint256 _loss)
    {}

    /**
    @notice liquidate all position from outside
     */
    function _liquidateAllPosition() internal virtual returns (uint256 _amountFreed) {}

    /**
    @notice adjust the strategy position. this used by tend and harvest
     */
    function _adjustPosition(uint256 debtOutstanding) internal virtual {}

    /**
    @notice get all claimable reward and return payment information for the controller
     */
    function _prepareReturn()
        internal
        virtual
        returns (
            uint256 _profit,
            uint256 _loss,
            uint256 _debtPayment
        )
    {}
}

/**
@notice this used for create clone of a contract
 */
abstract contract BaseStrategyInitializable is BaseStrategy {
    function initialize(address _keeper, address _controller) external {
        _initialize(_keeper, _controller);
    }

    function clone() external {
        // TODO: implement
    }
}
