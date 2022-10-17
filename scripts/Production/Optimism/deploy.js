const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

/**
 * two pools, no index/cds, FlatPremiumV2, ParameterV2, openDeposit=false
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

    defaultRate,
  } = require("./config.js");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const FlatPremiumV2 = await ethers.getContractFactory("FlatPremiumV2"); //V2
  const ParametersV2 = await ethers.getContractFactory("ParametersV2"); //V2

  const usdc = await USDC.attach(USDC_ADDRESS);
  console.log("usdc attached to:", usdc.address);

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

  const premiumV2 = await FlatPremiumV2.deploy(ownership.address, defaultRate);
  await premiumV2.deployed();
  console.log("premiumV2 deployed to:", premiumV2.address);

  const parametersV2 = await ParametersV2.deploy(ownership.address);
  await parametersV2.deployed();
  console.log("parametersV2 deployed to:", parametersV2.address);

  const vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);
  await vault.deployed();
  console.log("vault deployed to:", vault.address);

  //Pools Template
  const marketTemplate = await MarketTemplate.deploy();
  await marketTemplate.deployed();
  console.log("marketTemplate deployed to:", marketTemplate.address);

  const indexTemplate = await IndexTemplate.deploy();
  await indexTemplate.deployed();
  console.log("indexTemplate deployed to:", indexTemplate.address);

  const cdsTemplate = await CDSTemplate.deploy();
  await cdsTemplate.deployed();
  console.log("cdsTemplate deployed to:", cdsTemplate.address);

  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);
  await tx.wait();

  tx = await factory.approveTemplate(marketTemplate.address, true, false, false); //creation not public
  await tx.wait();
  tx = await factory.approveTemplate(indexTemplate.address, true, false, false); //creation not public
  await tx.wait();
  tx = await factory.approveTemplate(cdsTemplate.address, true, false, false); //creation not public
  await tx.wait();

  //pool setup
  tx = await factory.approveReference(marketTemplate.address, 0, ZERO_ADDRESS, true);
  await tx.wait();
  tx = await factory.approveReference(marketTemplate.address, 1, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(marketTemplate.address, 2, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(marketTemplate.address, 3, parametersV2.address, true);
  await tx.wait();

  //index setup
  tx = await factory.approveReference(indexTemplate.address, 0, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(indexTemplate.address, 1, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(indexTemplate.address, 2, parametersV2.address, true);
  await tx.wait();

  //cds setup
  tx = await factory.approveReference(cdsTemplate.address, 0, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(cdsTemplate.address, 1, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(cdsTemplate.address, 2, parametersV2.address, true);
  await tx.wait();

  //set parametersV2
  tx = await parametersV2.setFeeRate(ZERO_ADDRESS, GovFeeRatio);
  await tx.wait();

  tx = await parametersV2.setGrace(ZERO_ADDRESS, GracePeriod);
  await tx.wait();

  tx = await parametersV2.setLockup(ZERO_ADDRESS, LockUpPeriod);
  await tx.wait();

  tx = await parametersV2.setMaxDate(ZERO_ADDRESS, MaxDate);
  await tx.wait();

  tx = await parametersV2.setMinDate(ZERO_ADDRESS, MinDate);
  await tx.wait();

  tx = await parametersV2.setWithdrawable(ZERO_ADDRESS, WithdrawablePeriod);
  await tx.wait();

  tx = await parametersV2.setVault(usdc.address, vault.address);
  await tx.wait();

  tx = await parametersV2.setPremiumModel(ZERO_ADDRESS, premiumV2.address);

  //MarketTemplate
  for (const addr of GOV_TOKENS) {
    console.log("creating pool for: ", addr);
    tx = await factory.createMarket(
      marketTemplate.address,
      "0x",
      [0, 0], //initial deposit 0
      [addr, usdc.address, registry.address, parametersV2.address]
    );
    await tx.wait();
  }
  let markets = await registry.getAllMarkets();

  let market1 = await MarketTemplate.attach(markets[0]);
  let market2 = await MarketTemplate.attach(markets[1]);
  console.log("market1 deployed to: ", market1.address);
  console.log("market2 deployed to: ", market2.address);

  await market1.setOpenDeposit(false);
  await market2.setOpenDeposit(false);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
