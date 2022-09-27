// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

abstract contract OpsReady {
    /// @dev The address execute routine task. In this case, claiming reward.
    address public ops;

    modifier onlyOps() {
        if (msg.sender != ops) revert OnlyOps();
        _;
    }

    /**
     * @dev Checks the function is executable, and returns some data for executing the function.
     *      This function needs for Gelato. See more details below
     *      https://docs.gelato.network/developer-products/gelato-ops-smart-contract-automation-hub/guides/writing-a-resolver/smart-contract-resolver
     */
    function check() external virtual returns (bool _canExec, bytes memory _execPayload);
}

error OnlyOps();
