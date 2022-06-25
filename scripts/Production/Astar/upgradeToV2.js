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
  } = require("./config");

  const {
    OwnershipAddress,
    RegistryAddress,
    FactoryAddress,
    VaultAddress,
    ParametersAddress,
    PoolTemplateAddress,
  } = require("./deployments");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
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

  const premiumV2 = await FlatPremiumV2.deploy(ownership.address, defaultRate);
  await premiumV2.deployed();
  console.log("premiumV2 deployed to:", premiumV2.address);

  const parametersV2 = await ParametersV2.deploy(ownership.address);
  await parametersV2.deployed();
  console.log("parametersV2 deployed to:", parametersV2.address);

  //Pools Template
  const poolTemplate = await PoolTemplate.deploy();
  await poolTemplate.deployed();
  console.log("poolTemplate deployed to:", poolTemplate.address);

  //----- SETUP -----//
  //Turn Off the old parameters
  tx = await factory.approveReference(poolTemplate.address, 3, ParametersAddress, false);
  await tx.wait();

  //Turn On the new parameters
  tx = await factory.approveReference(poolTemplate.address, 3, parametersV2.address, true);
  await tx.wait();

  //set parameters
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
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
