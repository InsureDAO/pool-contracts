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

  SHIBUYA_URL,
  ASTAR_URL,
  MUMBAI_URL,
  GOERLI_URL,

  INFURA_KEY,
  ETHERSCAN_API,
  OPT_ETHERSCAN_API,
  FORK_URL,
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
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${TEST_KEY}`],
      gas: 6e6,
      gasPrice: 5e10, //50GWei
      timeout: 2000000000,
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${TEST_KEY}`],
      gas: 6e6,
      gasPrice: 1e10, //10Gwei
      timeout: 2000000000,
    },
    rinkarbitrum: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts: [`0x${TEST_KEY}`],
    },
    shibuya: {
      url: SHIBUYA_URL,
      accounts: [`0x${TEST_KEY}`],
      timeout: 2000000000,
    },
    goerli: {
      url: GOERLI_URL,
      accounts: [`0x${TEST_KEY}`],
    },
    mumbai: {
      url: MUMBAI_URL,
      accounts: [`0x${TEST_KEY}`],
    },
    optkovan: {
      url: `https://optimism-kovan.infura.io/v3/${INFURA_KEY}`,
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
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: {
      mainnet: `${ETHERSCAN_API}`,
      optimisticKovan: `${OPT_ETHERSCAN_API}`,
      optimisticEthereum: `${OPT_ETHERSCAN_API}`,
    },
  },
  mocha: {
    timeout: 20000000,
  },
  loggingEnabled: true,
};
