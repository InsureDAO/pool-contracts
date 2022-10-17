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
  } = require("./config.js");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const ReserveTemplate = await ethers.getContractFactory("ReserveTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const PremiumModel = await ethers.getContractFactory("FlatPremium");
  const Parameters = await ethers.getContractFactory("Parameters");

  const usdc = await USDC.deploy(creator.address);
  await usdc.deployed();
  console.log("usdc deployed to:", usdc.address);

  //----- DEPLOY -----//
  const ownership = await Ownership.deploy();
  await ownership.deployed();
  console.log("ownership deployed to:", ownership.address);

  const registry = await Registry.deploy(ownership.address);
  await registry.deployed();
  console.log("registry deployed to:", registry.address);

  const factory = await Factory.deploy(registry.address, ownership.address);
  await factory.deployed();
  console.log("factory deployed to:", factory.address);

  const premium1 = await PremiumModel.deploy(ownership.address);
  await premium1.deployed();
  console.log("premium1 deployed to:", premium1.address);

  const premium2 = await PremiumModel.deploy(ownership.address);
  await premium2.deployed();
  console.log("premium2 deployed to:", premium2.address);

  const parameters = await Parameters.deploy(ownership.address);
  await parameters.deployed();
  console.log("parameters deployed to:", parameters.address);

  const vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);
  await vault.deployed();
  console.log("vault deployed to:", vault.address);

  //Pools Template
  const marketTemplate = await MarketTemplate.deploy();
  await marketTemplate.deployed();
  console.log("marketTemplate deployed to:", marketTemplate.address);

  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);
  await tx.wait();

  tx = await factory.approveTemplate(marketTemplate.address, true, true, false); //anyone can create pool.
  await tx.wait();

  //pool setup
  tx = await factory.approveReference(marketTemplate.address, 0, ZERO_ADDRESS, true);
  await tx.wait();
  tx = await factory.approveReference(marketTemplate.address, 1, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(marketTemplate.address, 2, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(marketTemplate.address, 3, parameters.address, true);
  await tx.wait();

  //set parameters
  tx = await parameters.setFeeRate(ZERO_ADDRESS, GovFeeRatio);
  await tx.wait();

  tx = await parameters.setUnlockGrace(ZERO_ADDRESS, GracePeriod);
  await tx.wait();

  tx = await parameters.setRequestDuration(ZERO_ADDRESS, LockUpPeriod);
  await tx.wait();

  tx = await parameters.setMaxInsureSpan(ZERO_ADDRESS, MaxDate);
  await tx.wait();

  tx = await parameters.setMinInsureSpan(ZERO_ADDRESS, MinDate);
  await tx.wait();

  tx = await parameters.setWithdrawableTime(ZERO_ADDRESS, WithdrawablePeriod);
  await tx.wait();

  tx = await parameters.setVault(usdc.address, vault.address);
  await tx.wait();

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
  let markets = await registry.getAllMarkets();

  let market1 = await MarketTemplate.attach(markets[0]);
  let market2 = await MarketTemplate.attach(markets[1]);
  console.log("market1 deployed to: ", market1.address);
  console.log("market2 deployed to: ", market2.address);

  tx = await market1.setOpenDeposit(false);
  await tx.wait();
  tx = await market2.setOpenDeposit(false);
  await tx.wait();

  tx = await parameters.setPremiumModel(market1.address, premium1.address);
  await tx.wait();
  tx = await parameters.setPremiumModel(market2.address, premium2.address);
  await tx.wait();

  tx = await premium1.setPremiumParameters(PremiumRate1, 0, 0, 0);
  await tx.wait();
  tx = await premium2.setPremiumParameters(PremiumRate2, 0, 0, 0);
  await tx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
