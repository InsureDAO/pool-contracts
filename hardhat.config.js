require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.12",
    settings: {
      optimizer: {
        enabled: true,
        runs: 25000,
      },
    },
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      accounts: [
        { privateKey: `0x${process.env.DEPLOY_KEY}`, balance: "1000000000000000000000000000000" },
        { privateKey: `0x${process.env.CONTROL_KEY}`, balance: "1000000000000000000000000000000" },
        { privateKey: `0x${process.env.TEST_KEY}`, balance: "1000000000000000000000000000000" },
      ],
      forking: {
        url: process.env.ARBITRUM_URL,
        enabled: true, // set true when perform fork environment
      },
    },
    mainnet: {
      url: `${process.env.MAINNET_URL}`,
      accounts: [`0x${process.env.DEPLOY_KEY}`, `0x${process.env.CONTROL_KEY}`],
    },
    astar: {
      url: process.env.ASTAR_URL,
      accounts: [`0x${process.env.DEPLOY_KEY}`, `0x${process.env.CONTROL_KEY}`],
      gasPrice: 3e9,
    },
    optimisticEthereum: {
      url: `${process.env.OPTIMISM_URL}`,
      accounts: [`0x${process.env.DEPLOY_KEY}`, `0x${process.env.CONTROL_KEY}`],
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_URL,
      accounts: [`0x${process.env.DEPLOY_KEY}`],
    },
    goerli: {
      url: process.env.GOERLI_URL,
      accounts: [`0x${process.env.TEST_KEY}`],
    },
    optimisticGoerli: {
      url: process.env.OP_GOERLI_URL,
      accounts: [`0x${process.env.TEST_KEY}`],
    },
    arbitrumGoerli: {
      url: process.env.ARB_GOERLI_URL,
      accounts: [`0x${process.env.TEST_KEY}`],
    },
    mumbai: {
      url: process.env.MUMBAI_URL,
      accounts: [`0x${process.env.TEST_KEY}`],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test/unitary",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  etherscan: {
    apiKey: {
      mainnet: `${process.env.ETHERSCAN_API}`,
      goerli: `${process.env.ETHERSCAN_API}`,
      optimisticEthereum: `${process.env.OPT_ETHERSCAN_API}`,
      optimisticGoerli: `${process.env.OPT_ETHERSCAN_API}`,
      arbitrumOne: `${process.env.ARB_ETHERSCAN_API}`,
      arbitrumGoerli: `${process.env.ARB_ETHERSCAN_API}`,
      polygonMumbai: `${process.env.POLYGONSCAN_API}`,
    },
  },
  mocha: {
    timeout: 20000000,
  },
  loggingEnabled: true,
};
