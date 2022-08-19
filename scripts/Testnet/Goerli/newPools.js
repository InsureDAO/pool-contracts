const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const { USDC_ADDRESS } = require("./config");

const {
  RegistryAddress,
  FactoryAddress,
  ParametersAddress,
  PoolTemplateAddress,
  OwnershipAddress,
} = require("./deployments");

const PREMIUM_RATE_BASE = BigNumber.from("1000000");

/**
 * @typedef PoolConfig
 * @type {Object}
 * @property {string} tokenAddress - Governance token address
 * @property {number} rate - Premium rate based on percentage (e.g. 10(%))
 */

/**
 * @type {PoolConfig[]}
 */
const NEW_POOLS = [
  {
    tokenAddress: "0x5271D85CE4241b310C0B34b7C2f1f036686A6d7C",
    rate: 12,
  },
];

async function main() {
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("ParametersV2");
  const PremiumV1 = await ethers.getContractFactory("FlatPremium");

  const registry = Registry.attach(RegistryAddress);
  const factory = Factory.attach(FactoryAddress);
  const parameters = Parameters.attach(ParametersAddress);

  const poolDeployPromises = NEW_POOLS.map(async (pool) => {
    const existence = await registry.connect(manager).confirmExistence(PoolTemplateAddress, pool.tokenAddress);

    // skip deployment if the pool is already exist
    if (existence) return console.log(`pool for ${pool.tokenAddress} already exist. skip deployment`);

    // deploying pool
    const marketAddress = await (async () => {
      try {
        console.log("start deploying pool...");
        const createMarket = await factory.connect(manager).createMarket(
          PoolTemplateAddress,
          "0x",
          [0, 0],
          [pool.tokenAddress, USDC_ADDRESS, registry.address, parameters.address] // set minimum and initial deposit amount to 0
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

    // deploy premium model for pool
    const premium = await PremiumV1.connect(manager).deploy(OwnershipAddress);
    await premium.deployed();

    // setting premium rate
    const setParameter = await parameters.connect(manager).setPremiumModel(marketAddress, premium.address);
    await setParameter.wait();

    const rate = BigNumber.from((PREMIUM_RATE_BASE * pool.rate) / 100);
    const setPremium = await premium.setPremiumParameters(rate.toString(), "0", "0", "0");
    await setPremium.wait();

    console.log(
      `new pool for ${
        pool.tokenAddress
      } successfully deployed \u001b[32m\n\nmarketAddress: ${marketAddress} \nrate: ${rate.toString()} \npremium model: ${
        premium.address
      }\u001b[0m\n\n`
    );

    const end = process.hrtime(start);

    console.log("✨ success (%ds %dms)", end[0], end[1] / 10000);
  });

  // wait until all deployment succeed
  await Promise.all(poolDeployPromises);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
