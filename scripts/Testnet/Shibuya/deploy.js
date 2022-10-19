const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

/***
 * attach Underlying asset. Then, deploy all contracts
 */

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const {
    ZERO_ADDRESS,
    USDC_ADDRESS,

    GOV_TOKENS,

    GovFeeRatio,
    GracePeriod,

    LockUpPeriod,

    WithdrawablePeriod,
    MaxDate,
    MinDate,

    PremiumRate1,
    PremiumRate2,
    defaultRate,
  } = require("./config.js");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const ReserveTemplate = await ethers.getContractFactory("ReserveTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const PremiumModel = await ethers.getContractFactory("FlatPremiumV2");
  const Parameters = await ethers.getContractFactory("ParametersV2");

  const usdc = await USDC.deploy(creator.address);
  console.log("usdc deployed to:", usdc.address);

  //----- DEPLOY -----//
  const ownership = await Ownership.deploy();
  console.log("ownership deployed to:", ownership.address);

  const registry = await Registry.deploy(ownership.address);
  console.log("registry deployed to:", registry.address);

  const factory = await Factory.deploy(registry.address, ownership.address);
  console.log("factory deployed to:", factory.address);

  const premium = await PremiumModel.deploy(ownership.address, defaultRate);
  console.log("premium deployed to:", premium.address);

  /*
  const premium1 = await PremiumModel.deploy(ownership.address);
  console.log("premium1 deployed to:", premium1.address);

  const premium2 = await PremiumModel.deploy(ownership.address);
  console.log("premium2 deployed to:", premium2.address);
  */

  const parameters = await Parameters.deploy(ownership.address);
  console.log("parameters deployed to:", parameters.address);

  const vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);
  console.log("vault deployed to:", vault.address);

  //Pools Template
  const marketTemplate = await MarketTemplate.deploy();
  console.log("marketTemplate deployed to:", marketTemplate.address);

  const indexTemplate = await IndexTemplate.deploy();
  console.log("indexTemplate deployed to:", indexTemplate.address);

  const reserveTemplate = await ReserveTemplate.deploy();
  console.log("reserveTemplate deployed to:", reserveTemplate.address);

  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);

  tx = await factory.approveTemplate(marketTemplate.address, true, true, false); //anyone can create pool.
  await tx.wait();

  //pool setup
  tx = await factory.approveReference(marketTemplate.address, 0, ZERO_ADDRESS, true);
  tx = await factory.approveReference(marketTemplate.address, 1, usdc.address, true);
  tx = await factory.approveReference(marketTemplate.address, 2, registry.address, true);
  tx = await factory.approveReference(marketTemplate.address, 3, parameters.address, true);

  //set parameters
  tx = await parameters.setFeeRate(ZERO_ADDRESS, GovFeeRatio);

  tx = await parameters.setUnlockGracePeriod(ZERO_ADDRESS, GracePeriod);

  tx = await parameters.setRequestDuration(ZERO_ADDRESS, LockUpPeriod);

  tx = await parameters.setMaxInsureSpan(ZERO_ADDRESS, MaxDate);
  await tx.wait();

  tx = await parameters.setMinInsureSpan(ZERO_ADDRESS, MinDate);

  tx = await parameters.setWithdrawableDuration(ZERO_ADDRESS, WithdrawablePeriod);

  tx = await parameters.setVault(usdc.address, vault.address);

  //MarketTemplate
  for (const addr of GOV_TOKENS) {
    console.log("creating pool for: ", addr);
    tx = await factory.createMarket(
      marketTemplate.address,
      "0x",
      [0, 0], //initial deposit 0
      [addr, usdc.address, registry.address, parameters.address]
    );
    await tx.wait();
  }
  let pools = await registry.getAllPools();

  let market1 = await MarketTemplate.attach(pools[0]);
  let market2 = await MarketTemplate.attach(pools[1]);
  console.log("market1 deployed to: ", market1.address);
  console.log("market2 deployed to: ", market2.address);

  await market1.setOpenDeposit(false);
  await market2.setOpenDeposit(false);

  //tx = await parameters.setPremiumModel(market1.address, premium1.address);
  //tx = await parameters.setPremiumModel(market2.address, premium2.address);

  //tx = await premium1.setPremiumParameters(PremiumRate1, 0, 0, 0);
  //tx = await premium2.setPremiumParameters(PremiumRate2, 0, 0, 0);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
