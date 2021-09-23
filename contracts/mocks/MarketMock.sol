pragma solidity 0.8.0;

import "../PoolTemplate.sol";

contract MarketMock is PoolTemplate {
    constructor() public {}

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
