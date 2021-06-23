pragma solidity ^0.6.0;

import "../libraries/tokens/ERC20.sol";

contract ERC20Mock is ERC20 {
    string public name = "DAI";
    string public symbol = "DAI";
    uint8 public decimals = 18;

    constructor(address _address) public {
        _mint(_address, 1e26);
    }

    mapping(address => bool) minted;

    function mint() public {
        require(minted[msg.sender] == false);
        minted[msg.sender] = true;
        _mint(msg.sender, 1e22);
    }
}
