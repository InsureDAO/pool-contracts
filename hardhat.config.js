require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

const {
  TEST_KEY,
  DEPLOY_KEY,
  CONTROLL_KEY,

  SHIBUYA_URL,
  ASTAR_URL,
  MUMBAI_URL,
  GOERI_URL,

  INFURA_KEY,
  ETHERSCAN_API,
  OPT_ETHERSCAN_API,
  FORK_URL,
} = process.env;

module.exports = {
  solidity: "0.8.10",
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200000,
      },
    },
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      //forking: { url: `${FORK_URL}` }, //remove comment when preform fork environment
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${DEPLOY_KEY}`, `0x${CONTROLL_KEY}`],
      gas: 6e6,
      gasPrice: 8e10, //80Gwei
      timeout: 2000000000,
    },
    astar: {
      url: ASTAR_URL,
      accounts: [`0x${DEPLOY_KEY}`, `0x${CONTROLL_KEY}`],
      gasPrice: 3e9, //3Gwei
    },
    optimisticEthereum: {
      url: `https://optimism-mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${DEPLOY_KEY}`, `0x${CONTROLL_KEY}`],
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
      url: GOERI_URL,
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
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
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
