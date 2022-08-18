const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const { USDC_ADDRESS } = require("./config");

const { RegistryAddress, FactoryAddress, ParametersAddress, PoolTemplateAddress } = require("./deployments");

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
  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("Parameters");
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
    const premium = await PremiumV1.deploy(manager.address);
    await premium.deployed();

    // setting premium rate
    const rate = BigNumber.from((PREMIUM_RATE_BASE * pool.rate) / 100);
    const setParameter = await parameters.connect(manager).setPremiumModel(marketAddress, premium.address);
    await setParameter.wait();

    console.log("rate", rate.toString());

    const owner = await premium.ownership();
    const _rate = await premium.rate();
    console.debug("owner", owner);
    console.debug("manager", manager.address);
    console.debug("rate", _rate.toString());

    const setPremium = await premium.connect(manager).setPremiumParameters(rate.toString(), "0", "0", "0");
    await setPremium.wait();

    console.log(
      `new pool for ${
        pool.tokenAddress
      } successfully deployed: \nmarketAddress: ${marketAddress} \nrate: ${rate.toString()}`
    );
    console.log(`new premium model for ${marketAddress} deployed: ${premium.address}`);
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
