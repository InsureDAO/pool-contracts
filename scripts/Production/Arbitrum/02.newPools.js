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
  /* GMX */
  {
    tokenAddress: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
    rate: 5,
  },
  /* Radiant */
  {
    tokenAddress: "0x0C4681e6C0235179ec3D4F4fc4DF3d14FDD96017",
    rate: 5,
  },
  /* Dopex */
  {
    tokenAddress: "0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55",
    rate: 5,
  },
  /* Vesta */
  {
    tokenAddress: "0xa684cd057951541187f288294a1e1C2646aA2d24",
    rate: 5,
  },
  /* Mycelium */
  {
    tokenAddress: "0xC74fE4c715510Ec2F8C61d70D397B32043F55Abe",
    rate: 5,
  },
  /* MUX */
  {
    tokenAddress: "0x4e352cF164E64ADCBad318C3a1e222E9EBa4Ce42",
    rate: 5,
  },
  /* dForce */
  {
    tokenAddress: "0xaE6aab43C4f3E0cea4Ab83752C278f8dEbabA689",
    rate: 5,
  },
  /* Abracadabra */
  {
    tokenAddress: "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF",
    rate: 5,
  },
  /* Premia */
  {
    tokenAddress: "0x51fC0f6660482Ea73330E414eFd7808811a57Fa2",
    rate: 5,
  },
  /* Hop */
  {
    tokenAddress: "0xDa7c0de432a9346bB6e96aC74e3B61A36d8a77eB",
    rate: 5,
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
