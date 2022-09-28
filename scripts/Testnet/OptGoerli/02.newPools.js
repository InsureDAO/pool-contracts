const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const { USDC_ADDRESS, PREMIUM_RATE_BASE } = require("./config");

const {
  RegistryAddress,
  FactoryAddress,
  ParametersV2Address,
  PoolTemplateAddress,
  PremiumV2Address,
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
const NEW_POOLS = [
  /* Synthetix */
  {
    tokenAddress: "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4",
    rate: 2.5,
  },
  /* Lyra */
  {
    tokenAddress: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    rate: 5,
  },
  /* Perpetual */
  {
    tokenAddress: "0x9e1028F5F1D5eDE59748FFceE5532509976840E0",
    rate: 2.5,
  },
  /* Kwenta */
  {
    tokenAddress: "0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe",
    rate: 5,
  },
  /* Pika */
  {
    tokenAddress: "0x80898b704bAa55e7e37F1128Fc6ae5836661f54a",
    rate: 8,
  },
  /* Thales */
  {
    tokenAddress: "0x217D47011b23BB961eB6D93cA9945B7501a5BB11",
    rate: 5,
  },
  /* Polynomial */
  {
    tokenAddress: "0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37",
    rate: 8,
  },
  /* Beefy */
  {
    tokenAddress: "0x4E720DD3Ac5CFe1e1fbDE4935f386Bb1C66F4642",
    rate: 5,
  },
  /* dForce */
  {
    tokenAddress: "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75",
    rate: 5,
  },
  /* Tarot */
  {
    tokenAddress: "0x5b0390bccCa1F040d8993eB6e4ce8DeD93721765",
    rate: 8,
  },
  /* Arrakis */
  {
    tokenAddress: "0x88215a2794ddC031439C72922EC8983bDE831c78",
    rate: 8,
  },
  /* Hop */
  {
    tokenAddress: "0xaa30D6bba6285d0585722e2440Ff89E23EF68864",
    rate: 5,
  },
  /* Velodrome */
  {
    tokenAddress: "0x3c8B650257cFb5f272f799F5e2b4e65093a11a05",
    rate: 5,
  },
  /* BeethovenX */
  {
    tokenAddress: "0x97513e975a7fA9072c72C92d8000B0dB90b163c5",
    rate: 8,
  },
  /* Rubicon */
  {
    tokenAddress: "0x3204AC6F848e05557c6c7876E09059882e07962F",
    rate: 8,
  },
  /* PoolTogether */
  {
    tokenAddress: "0x8d352083F7094dc51Cd7dA8c5C0985AD6e149629",
    rate: 5,
  },
  /* dHEDGE V2 */
  {
    tokenAddress: "0x90b1a66957914EbbE7a8df254c0c1E455972379C",
    rate: 8,
  },
];

async function main() {
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("ParametersV2");
  const PremiumV2 = await ethers.getContractFactory("FlatPremiumV2");

  const registry = Registry.attach(RegistryAddress);
  const factory = Factory.attach(FactoryAddress);
  const parameters = Parameters.attach(ParametersV2Address);
  const premium = PremiumV2.attach(PremiumV2Address);

  for (const pool of NEW_POOLS) {
    const existence = await registry.connect(manager).confirmExistence(PoolTemplateAddress, pool.tokenAddress);

    // skip deployment if the pool is already exist
    if (existence) {
      console.log(`\n\u001b[33m pool for ${pool.tokenAddress} already exist. skip deployment \u001b[0m\n`);

      continue;
    }

    // deploying pool
    const marketAddress = await (async () => {
      try {
        console.log(`start deploying pool for ${pool.tokenAddress}...`);
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

    // setting premium rate
    const rate = BigNumber.from((PREMIUM_RATE_BASE * pool.rate) / 100);
    const setRate = await premium.connect(manager).setRate(marketAddress, rate.toString());
    await setRate.wait();

    console.log(
      `new pool for ${
        pool.tokenAddress
      } successfully deployed \u001b[32m\n\nmarketAddress: ${marketAddress} \nrate: ${rate.toString()} \n\u001b[0m\n`
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
