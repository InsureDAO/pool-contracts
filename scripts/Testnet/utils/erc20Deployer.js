const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const { USDC_ADDRESS, PREMIUM_RATE_BASE } = require("./config");

const {
  RegistryAddress,
  FactoryAddress,
  ParametersAddress,
  PoolTemplateAddress,
  OwnershipAddress,
} = require("./deployments");

/**
 * @typedef PoolConfig
 * @type {Object}
 * @property {string} tokenAddress - Governance token address
 * @property {number} rate - Premium rate based on percentage (e.g. 10(%))
 */

/**
 * @type {PoolConfig[]}
 */
const NEW_POOLS = [];

async function main() {
  const start = process.hrtime();
  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const Token = await ethers.getContractFactory("ERC20");

  const end = process.hrtime(start);
  console.log("✨ finished (%ds %dms)", end[0], end[1] / 10000);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
