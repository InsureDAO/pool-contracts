const hre = require("hardhat");
const ethers = hre.ethers;

/***
 * attach and setup for all contracts
 */

async function main() {
  //configs
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  [creator] = await ethers.getSigners();


  //contracts
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

  //addresses
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
  } = require("./deployment.js");

  //----- DEPLOY -----//

  //attach
  const usdc = await USDC.attach(USDCAddress);
  console.log("usdc attached to:", usdc.address);

  const ownership = await Ownership.attach(OwnershipAddress);
  console.log("ownership attached to:", ownership.address);

  const registry = await Registry.attach(RegistryAddress);
  console.log("registry attached to:", registry.address);

  const factory = await Factory.attach(FactoryAddress);
  console.log("factory attached to:", factory.address);

  const premium = await PremiumModel.attach(PremiumModelAddress);
  console.log("premium attached to:", premium.address);

  const parameters = await Parameters.attach(ParametersAddress);
  console.log("parameters attached to:", parameters.address);
  
  const vault = await Vault.attach(VaultAddress);
  console.log("vault attached to:", vault.address);

  const poolTemplate = await PoolTemplate.attach(PoolTemplateAddress);
  console.log("poolTemplate attached to:", poolTemplate.address);

  const cdsTemplate = await CDSTemplate.attach(CDSTemplateAddress);
  console.log("cdsTemplate attached to:", cdsTemplate.address);

  const indexTemplate = await IndexTemplate.attach(IndexTemplateAddress);
  console.log("indexTemplate attached to:", indexTemplate.address);



  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);
  await tx.wait();

  tx = await factory.approveTemplate(poolTemplate.address, true, true, true); //anyone can create pool.
  await tx.wait();

  tx = await factory.approveTemplate(indexTemplate.address, true, false, true);
  await tx.wait();

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
  await tx.wait();

  tx = await factory.approveReference(
    poolTemplate.address,
    1, //underlying token address
    usdc.address,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    poolTemplate.address,
    2, //registry
    registry.address,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    poolTemplate.address,
    3, //parameter
    parameters.address,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    poolTemplate.address,
    4, //initial deposit
    ZERO_ADDRESS,
    true
  );
  await tx.wait();


  console.log(2)
  //index setup
  tx = await factory.approveReference(
    indexTemplate.address,
    0,
    usdc.address,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    indexTemplate.address,
    1,
    registry.address,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    indexTemplate.address,
    2,
    parameters.address,
    true
  );
  await tx.wait();

  console.log(3)
  //cds setup
  tx = await factory.approveReference(
    cdsTemplate.address,
    0,
    usdc.address,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    cdsTemplate.address,
    1,
    registry.address,
    true
  );
  await tx.wait();

  await factory.approveReference(
    cdsTemplate.address,
    2,
    parameters.address,
    true
  );
  await tx.wait();

  console.log(4)
  //set parameters
  tx = await parameters.setFeeRate(ZERO_ADDRESS, "10000");
  await tx.wait();

  tx = await parameters.setGrace(ZERO_ADDRESS, "259200");
  await tx.wait();

  tx = await parameters.setLockup(ZERO_ADDRESS, "7200");
  await tx.wait();

  tx = await parameters.setMinDate(ZERO_ADDRESS, "604800");
  await tx.wait();

  tx = await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
  await tx.wait();

  tx = await parameters.setWithdrawable(ZERO_ADDRESS, "604800");
  await tx.wait();

  tx = await parameters.setVault(usdc.address, vault.address);
  await tx.wait();

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
