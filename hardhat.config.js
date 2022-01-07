require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config()

const { 
  ETHERSCAN_API,
  KEY,
  INFURA_KEY
 } = process.env

module.exports = {
  solidity: "0.8.7",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${KEY}`],
      gas: 6e6,
      gasPrice: 1e9,
      timeout: 2000000000
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${KEY}`]
    },
  },
  solidity: {
    version: "0.8.7",
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
    apiKey: `${ETHERSCAN_API}`,
  },
  mocha: {
    timeout: 20000000,
  },
  loggingEnabled: true,
};
