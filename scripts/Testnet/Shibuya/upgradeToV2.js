const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

/**
 * two pools, no index/reserve, FlatPremiumV2, ParameterV2, openDeposit=false
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
  } = require("./config");

  const {
    OwnershipAddress,
    RegistryAddress,
    FactoryAddress,
    VaultAddress,
    ParametersAddress,
    marketTemplateAddress,
  } = require("./deployments");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const ReserveTemplate = await ethers.getContractFactory("ReserveTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const FlatPremiumV2 = await ethers.getContractFactory("FlatPremiumV2"); //V2
  const ParametersV2 = await ethers.getContractFactory("ParametersV2"); //V2

  //----- DEPLOY -----//
  const ownership = await Ownership.attach(OwnershipAddress);
  console.log("ownership attached to:", ownership.address);

  const registry = await Registry.attach(RegistryAddress);
  console.log("registry attached to:", registry.address);

  const factory = await Factory.attach(FactoryAddress);
  console.log("factory attached to:", factory.address);

  const vault = await Vault.attach(VaultAddress);
  console.log("vault attached to:", vault.address);

  const marketTemplate = await MarketTemplate.attach(marketTemplateAddress);
  console.log("marketTemplate attached to:", marketTemplateAddress);

  const premiumV2 = await FlatPremiumV2.deploy(ownership.address, defaultRate);
  await premiumV2.deployed();
  console.log("premiumV2 deployed to:", premiumV2.address);

  const parametersV2 = await ParametersV2.deploy(ownership.address);
  await parametersV2.deployed();
  console.log("parametersV2 deployed to:", parametersV2.address);

  //----- SETUP -----//
  //Turn Off the old parameters
  tx = await factory.approveReference(marketTemplateAddress, 3, ParametersAddress, false);
  await tx.wait();

  //Turn On the new parameters
  tx = await factory.approveReference(marketTemplateAddress, 3, parametersV2.address, true);
  await tx.wait();

  //set parameters
  tx = await parametersV2.setFeeRate(ZERO_ADDRESS, GovFeeRatio);
  await tx.wait();

  tx = await parametersV2.setUnlockGrace(ZERO_ADDRESS, GracePeriod);
  await tx.wait();

  tx = await parametersV2.setRequestDuration(ZERO_ADDRESS, LockUpPeriod);
  await tx.wait();

  tx = await parametersV2.setMaxInsureSpan(ZERO_ADDRESS, MaxDate);
  await tx.wait();

  tx = await parametersV2.setMinInsureSpan(ZERO_ADDRESS, MinDate);
  await tx.wait();

  tx = await parametersV2.setWithdrawableTime(ZERO_ADDRESS, WithdrawablePeriod);
  await tx.wait();

  tx = await parametersV2.setVault(USDC_ADDRESS, vault.address);
  await tx.wait();

  tx = await parametersV2.setPremiumModel(ZERO_ADDRESS, premiumV2.address);

  //MarketTemplate
  for (const addr of GOV_TOKENS) {
    console.log("creating pool for: ", addr);
    tx = await factory.createMarket(
      marketTemplate.address,
      "0x",
      [0, 0], //initial deposit 0
      [addr, USDC_ADDRESS, RegistryAddress, parametersV2.address]
    );
    await tx.wait();
  }
  let markets = await registry.getAllMarkets();

  let market1 = await MarketTemplate.attach(markets[2]);
  let market2 = await MarketTemplate.attach(markets[3]);
  console.log("market1 deployed to: ", market1.address);
  console.log("market2 deployed to: ", market2.address);

  tx = await market1.setOpenDeposit(false);
  tx = await market2.setOpenDeposit(false);
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
