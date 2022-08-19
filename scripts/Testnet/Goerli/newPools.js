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
const NEW_POOLS = [
  // TODO: DELETE these params (just for test)
  /* algem */
  {
    tokenAddress: "0xE511ED88575C57767BAfb72BfD10775413E3F2b0",
    rate: 5,
  },
  /* AstridDAO */
  {
    tokenAddress: "0x5271D85CE4241b310C0B34b7C2f1f036686A6d7C",
    rate: 12,
  },
  /* Sirius-finance */
  {
    tokenAddress: "0x9448610696659de8F72e1831d392214aE1ca4838",
    rate: 12,
  },
  // /* Avault */
  // {
  //   tokenAddress: "0x03065E84748a9e4a1AEbef15AC89da1Cdf18B202",
  //   rate: 12,
  // },
  // /* SiO2 Finance */
  // {
  //   tokenAddress: "0xcCA488aEEf7A1D5C633f877453784F025e7cF160",
  //   rate: 12,
  // },
  // /* Zenlink */
  // {
  //   tokenAddress: "0x998082C488e548820F970Df5173bD2061Ce90635",
  //   rate: 12,
  // },
  // /* AstarFarm */
  // {
  //   tokenAddress: "0x992bad137Fc8a50a486B5C6375f581964b4A15FC",
  //   rate: 5,
  // },
  // /* Muuu */
  // {
  //   tokenAddress: "0xc5BcAC31cf55806646017395AD119aF2441Aee37",
  //   rate: 12,
  // },
  // /* KAGLA Finance */
  // {
  //   tokenAddress: "0x257f1a047948f73158DaDd03eB84b34498bCDc60",
  //   rate: 10,
  // },
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
