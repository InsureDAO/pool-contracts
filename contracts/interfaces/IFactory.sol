// SPDX-License-Identifier: MIT

pragma solidity 0.8.12;

import "./IUniversalPool.sol";

interface IFactory {
    function approveTemplate(IUniversalPool _template, bool _approval, bool _isOpen, bool _duplicate) external;

    function approveReference(IUniversalPool _template, uint256 _slot, address _target, bool _approval) external;

    function setCondition(IUniversalPool _template, uint256 _slot, uint256 _target) external;

    function createMarket(
        IUniversalPool _template,
        string memory _metaData,
        uint256[] memory _conditions,
        address[] memory _references
    ) external returns (address);
}
