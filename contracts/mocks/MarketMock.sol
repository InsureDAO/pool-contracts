pragma solidity 0.8.12;

import "../implementations/MarketTemplate.sol";

contract MarketMock is MarketTemplate {
    constructor() {}

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}
