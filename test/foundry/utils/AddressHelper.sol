// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.12;

library AddressHelper {
    struct Addr {
        address aavePool;
        address aaveReward;
        address usdc;
        address ausdc;
        address aaveRewardToken;
        address uniswapV3Router;
        address uniswapV3Quoter;
        address gelatoOps;
        // these are needed only for test
        address gelatoNetwork;
        address gelatoTaskTreasury;
    }

    function addresses(uint256 _chainid) internal pure returns (Addr memory) {
        if (_chainid == 10) {
            // optimism
            return
                Addr({
                    aavePool: 0x794a61358D6845594F94dc1DB02A252b5b4814aD,
                    aaveReward: 0x929EC64c34a17401F460460D4B9390518E5B473e,
                    usdc: 0x7F5c764cBc14f9669B88837ca1490cCa17c31607,
                    ausdc: 0x625E7708f30cA75bfd92586e17077590C60eb4cD,
                    // OP token
                    aaveRewardToken: 0x4200000000000000000000000000000000000042,
                    uniswapV3Router: 0xE592427A0AEce92De3Edee1F18E0157C05861564,
                    uniswapV3Quoter: 0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6,
                    gelatoOps: 0x340759c8346A1E6Ed92035FB8B6ec57cE1D82c2c,
                    gelatoNetwork: 0x01051113D81D7d6DA508462F2ad6d7fD96cF42Ef,
                    gelatoTaskTreasury: 0xB3f5503f93d5Ef84b06993a1975B9D21B962892F
                });
        }

        return
            Addr({
                aavePool: address(0),
                aaveReward: address(0),
                usdc: address(0),
                ausdc: address(0),
                aaveRewardToken: address(0),
                uniswapV3Router: address(0),
                uniswapV3Quoter: address(0),
                gelatoOps: address(0),
                gelatoNetwork: address(0),
                gelatoTaskTreasury: address(0)
            });
    }
}
