pragma solidity 0.8.12;

import "./IParameters.sol";

interface IParametersV2 is IParameters {
    function getPremiumModel(address _market) external view returns (address);
}
