pragma solidity 0.8.12;

import "../implementations/PoolTemplate.sol";

contract MarketMock is PoolTemplate {
    constructor() {}

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
