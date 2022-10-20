const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const { USDC_ADDRESS, PREMIUM_RATE_BASE } = require("./config");

const {
  RegistryAddress,
  FactoryAddress,
  ParametersAddress,
  marketTemplateAddress,
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

  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("Parameters");

  const registry = Registry.attach(RegistryAddress);
  const factory = Factory.attach(FactoryAddress);
  const parameters = Parameters.attach(ParametersAddress);

  for (const pool of NEW_POOLS) {
    const existence = await registry.connect(manager).confirmExistence(marketTemplateAddress, pool.tokenAddress);

    // skip deployment if the pool is already exist
    if (existence) {
      console.log(`\n\u001b[33m pool for ${pool.tokenAddress} already exist. skip deployment \u001b[0m\n`);

      continue;
    }

    // deploying pool
    const marketAddress = await (async () => {
      try {
        console.log(`start deploying pool for ${pool.tokenAddress}...`);
        const createMarket = await factory
          .connect(manager)
          .createMarket(
            marketTemplateAddress,
            "0x",
            [0, 0],
            [pool.tokenAddress, USDC_ADDRESS, registry.address, parameters.address]
          );

        const receipt = await createMarket.wait();

        const marketCreatedEvent = receipt.events[2];
        const createdAddress = marketCreatedEvent.args[0];

        return createdAddress;
      } catch (err) {
        console.error(err);
        return null;
      }
    })();

    if (!marketAddress) throw new Error(`An error occurred while deploying the token address: ${pool.tokenAddress}`);

    console.log(
      `new pool for ${
        pool.tokenAddress
      } successfully deployed \u001b[32m\n\nmarketAddress: ${marketAddress} \nrate: ${rate.toString()} \npremium model: ${
        premium.address
      }\u001b[0m\n\n`
    );
  }

  const end = process.hrtime(start);

  console.log("✨ finished (%ds %dms)", end[0], end[1] / 10000);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
