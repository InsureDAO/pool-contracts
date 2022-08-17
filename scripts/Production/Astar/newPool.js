const { ethers } = require("hardhat");
const fs = require("fs");
const { BigNumber } = require("ethers");
const {
  RegistryAddress,
  FactoryAddress,
  ParametersV2Address,
  PremiumV2Address,
  PoolTemplateAddress,
  IndexTemplateAddress,
} = require("./deployments");

const PREMIUM_RATE_BASE = BigNumber.from(1000000);

const { USDC_ADDRESS, ZERO_ADDRESS } = require("./config");

/**
 * @typedef PoolConfig
 * @type {Object}
 * @property {string} address - Governance token address
 * @property {number} rate - Premium rate based on percentage (e.g. 10(%))
 * @property {number} indexPositions - Index position pool should be added
 */

/**
 * @type {PoolConfig[]}
 */
const NEW_POOLS = [
  {
    address: "0x5271D85CE4241b310C0B34b7C2f1f036686A6d7C",
    rate: 12,
    indexPositions: [0],
  },
];

async function main() {
  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("Parameters");
  const PremiumV2 = await ethers.getContractFactory("FlatPremiumV2");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");

  const registry = Registry.attach(RegistryAddress);
  const factory = Factory.attach(FactoryAddress);
  const parametersV2 = Parameters.attach(ParametersV2Address);
  const premiumV2 = PremiumV2.attach(PremiumV2Address);

  const poolDeployPromises = NEW_POOLS.map(async (pool) => {
    const existence = await registry.connect(manager).confirmExistence(PoolTemplateAddress, pool.address);

    if (existence) {
      console.log(`pool ${pool.address} already exist. skip deployment`);

      return;
    }

    // deploying pool
    const marketAddress = (async () => {
      try {
        tx = await factory.connect(manager).createMarket(
          PoolTemplateAddress,
          "0x",
          [0, 0][(addr, USDC_ADDRESS, registry.address, parametersV2.address)] // set minimum and initial deposit amount to 0
        );

        const receipt = await tx.wait();
        console.log(receipt);

        return receipt.events[1].args[0];
      } catch (err) {
        return null;
      }
    })();

    if (!marketAddress) throw new Error(`An error occurred while deploying the token address: ${pool.address}`);

    // setting premium rate
    const rate = (PREMIUM_RATE_BASE * rate) / 100;

    await premiumV2.connect(manager).setRate(marketAddress, rate);
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
