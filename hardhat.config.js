require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

const {
  TEST_KEY,
  DEPLOY_KEY,
  CONTROL_KEY,

  ASTAR_URL,
  MUMBAI_URL,
  GOERLI_URL,

  INFURA_KEY,
  ETHERSCAN_API,
  OPT_ETHERSCAN_API,
} = process.env;

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
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      /**
      accounts: [
        //{ privateKey: `0x${DEPLOY_KEY}`, balance: "2903004000000000000000000000000000000" },
        //{ privateKey: `0x${CONTROL_KEY}`, balance: "2903004000000000000000000000000000000" },
        // { privateKey: `0x${TEST_KEY}`, balance: "2903004000000000000000000000000000000" },
      ],
      forking: {
        url: GOERLI_URL,
        enabled: false, // set true when perform fork environment
      },
      */
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${DEPLOY_KEY}`, `0x${CONTROL_KEY}`],
      gas: 6e6,
      gasPrice: 8e10, //80Gwei
      timeout: 2000000000,
    },
    astar: {
      url: ASTAR_URL,
      accounts: [`0x${DEPLOY_KEY}`, `0x${CONTROL_KEY}`],
      gasPrice: 3e9, //3Gwei
    },
    optimisticEthereum: {
      url: `https://optimism-mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${DEPLOY_KEY}`, `0x${CONTROL_KEY}`],
    },
    goerli: {
      url: GOERLI_URL,
      accounts: [`0x${TEST_KEY}`],
      gasPrice: 10e9, //10Gwei
    },
    mumbai: {
      url: MUMBAI_URL,
      accounts: [`0x${TEST_KEY}`],
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
      mainnet: `${ETHERSCAN_API}`,
      goerli: `${ETHERSCAN_API}`,
      optimisticEthereum: `${OPT_ETHERSCAN_API}`,
    },
  },
  mocha: {
    timeout: 20000000,
  },
  loggingEnabled: true,
};
