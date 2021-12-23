const hre = require("hardhat");
const ethers = hre.ethers;

/***
 * deploy markets
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


  //----- CREATE MARKETS -----//
  
  const marketAddress1 = await factory.markets(0);
  const marketAddress2 = await factory.markets(1);
  const marketAddress3 = await factory.markets(2);
  market1 = await PoolTemplate.attach(marketAddress1);
  market2 = await PoolTemplate.attach(marketAddress2);
  market3 = await PoolTemplate.attach(marketAddress3);
  console.log("pool1 deployed to", market1.address);
  console.log("pool2 deployed to", market2.address);
  console.log("pool3 deployed to", market3.address);

  //cds&index
  tx = await factory.createMarket(
    cdsTemplate.address,
    "Here is metadata.",
    [0],
    [usdc.address, registry.address, parameters.address]
  );
  await tx.wait();

  tx = await factory.createMarket(
    indexTemplate.address,
    "Here is metadata.",
    [0],
    [usdc.address, registry.address, parameters.address]
  );
  await tx.wait();

  const marketAddress4 = await factory.markets(3);
  const marketAddress5 = await factory.markets(4);
  cds = await CDSTemplate.attach(marketAddress4);
  index = await IndexTemplate.attach(marketAddress5);
  console.log("cds deployed to", marketAddress4);
  console.log("index deployed to", marketAddress5);

  //set parameters
  tx = await registry.setCDS(ZERO_ADDRESS, cds.address);
  await tx.wait();

  tx = await index.set(0, market1.address, "1000");
  await tx.wait();
  tx = await index.set(1, market2.address, "1000");
  await tx.wait();
  tx = await index.set(2, market3.address, "1000");
  await tx.wait();

  tx = await index.setLeverage("2000");
  console.log("all done");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
