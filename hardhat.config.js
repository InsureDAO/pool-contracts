require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-web3");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config()

const { 
  ETHERSCAN_API,
  KEY,
  PRODUCTION_KEY,
  INFURA_KEY
 } = process.env

module.exports = {
  solidity: "0.8.10",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      //forking: {url: "https://eth-mainnet.alchemyapi.io/v2/-vmufhhPyGeTxZH6ep9q2PuHjaPp4l0u",} //remove comment when testing mainnet fork
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${PRODUCTION_KEY}`],
      gas: 6e6,
      gasPrice: 7e10,//70Gwei
      timeout: 2000000000,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${KEY}`],
      gas: 6e6,
      gasPrice: 3e10,
      timeout: 2000000000,
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${KEY}`],
      gas: 6e6,
      gasPrice: 1e10,
      timeout: 2000000000,
    },
    rinkarbitrum: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      accounts: [`0x${KEY}`]
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
    tests: "./test/unitary/PoolTemplate",
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
