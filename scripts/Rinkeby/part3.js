const hre = require("hardhat");
const ethers = hre.ethers;
const { BigNumber } = require('ethers');

/***
 * attach and setup for all contracts
 */

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const {
    ZERO_ADDRESS
  } = require("./config.js");

  const {
    USDCAddress,
    OwnershipAddress,
    RegistryAddress,
    FactoryAddress,
    PremiumModelAddress,
    ParametersAddress,
    VaultAddress,
    PoolTemplateAddress,
    CDSTemplateAddress,
    IndexTemplateAddress,
  } = require("./deployments.js");

  const Ownership = await ethers.getContractFactory("Ownership");
  const USDC = await ethers.getContractFactory("ERC20Mock");
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const PremiumModel = await ethers.getContractFactory("BondingPremium");
  const Parameters = await ethers.getContractFactory("Parameters");
  
  const usdc = await USDC.attach(USDCAddress);
  const ownership = await Ownership.attach(OwnershipAddress);
  const registry = await Registry.attach(RegistryAddress);
  const factory = await Factory.attach(FactoryAddress);
  const premium = await PremiumModel.attach(PremiumModelAddress);
  const parameters = await Parameters.attach(ParametersAddress);
  const vault = await Vault.attach(VaultAddress);
  const poolTemplate = await PoolTemplate.attach(PoolTemplateAddress);
  const cdsTemplate = await CDSTemplate.attach(CDSTemplateAddress);
  const indexTemplate = await IndexTemplate.attach(IndexTemplateAddress);

  console.log("usdc attached to:", usdc.address);
  console.log("ownership attached to:", ownership.address);
  console.log("registry attached to:", registry.address);
  console.log("factory attached to:", factory.address);
  console.log("premium attached to:", premium.address);
  console.log("parameters attached to:", parameters.address);
  console.log("vault attached to:", vault.address);
  console.log("poolTemplate attached to:", poolTemplate.address);
  console.log("cdsTemplate attached to:", cdsTemplate.address);
  console.log("indexTemplate attached to:", indexTemplate.address);


  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);

  tx = await factory.approveTemplate(poolTemplate.address, true, true, true); //anyone can create pool.

  tx = await factory.approveTemplate(indexTemplate.address, true, false, true);

  tx = await factory.approveTemplate(cdsTemplate.address, true, false, true);

  await tx.wait();

  console.log(1)


  //pool setup
  tx = await factory.approveReference(
    poolTemplate.address,
    0, //target governance token address
    ZERO_ADDRESS,
    true
  );

  tx = await factory.approveReference(
    poolTemplate.address,
    1, //underlying token address
    usdc.address,
    true
  );

  tx = await factory.approveReference(
    poolTemplate.address,
    2, //registry
    registry.address,
    true
  );

  tx = await factory.approveReference(
    poolTemplate.address,
    3, //parameter
    parameters.address,
    true
  );

  tx = await factory.setCondition(
    poolTemplate.address,
    0, //initial deposit
    BigNumber.from("1000000000"), //1000USDC w/6decimals
  );


  console.log(2)
  //index setup
  tx = await factory.approveReference(
    indexTemplate.address,
    0,
    usdc.address,
    true
  );

  tx = await factory.approveReference(
    indexTemplate.address,
    1,
    registry.address,
    true
  );

  tx = await factory.approveReference(
    indexTemplate.address,
    2,
    parameters.address,
    true
  );

  console.log(3)
  //cds setup
  tx = await factory.approveReference(
    cdsTemplate.address,
    0,
    usdc.address,
    true
  );

  tx = await factory.approveReference(
    cdsTemplate.address,
    1,
    registry.address,
    true
  );

  await factory.approveReference(
    cdsTemplate.address,
    2,
    parameters.address,
    true
  );

  console.log(4)
  //set parameters
  tx = await parameters.setFeeRate(ZERO_ADDRESS, "10000");

  tx = await parameters.setGrace(ZERO_ADDRESS, "259200");

  tx = await parameters.setLockup(ZERO_ADDRESS, "7200");

  tx = await parameters.setMinDate(ZERO_ADDRESS, "604800");

  tx = await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);

  tx = await parameters.setWithdrawable(ZERO_ADDRESS, "604800");

  tx = await parameters.setVault(usdc.address, vault.address);

  tx = await parameters.setMaxList(ZERO_ADDRESS, "10");

  await tx.wait();


  console.log(5)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
