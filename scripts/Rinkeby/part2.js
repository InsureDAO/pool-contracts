const hre = require("hardhat");
const ethers = hre.ethers;

/***
 * attach Underlying asset. Then, deploy all contracts
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
    USDCAddress
  } = require("./deployment.js");


  //----- DEPLOY -----//

  //attach
  const usdc = await USDC.attach(USDCAddress);
  console.log("usdc attached to:", usdc.address);

  //Fundamental
  const ownership = await Ownership.deploy();
  await ownership.deployed();
  console.log("ownership deployed to:", ownership.address);

  const registry = await Registry.deploy(ownership.address);
  await registry.deployed();
  console.log("registry deployed to:", registry.address);

  const factory = await Factory.deploy(registry.address, ownership.address);
  await factory.deployed();
  console.log("factory deployed to:", factory.address);

  const premium = await PremiumModel.deploy(ownership.address);
  await premium.deployed();
  console.log("premium deployed to:", premium.address);

  const parameters = await Parameters.deploy(ownership.address);
  await parameters.deployed();
  console.log("parameters deployed to:", parameters.address);
  
  const vault = await Vault.deploy(
    usdc.address,
    registry.address,
    ZERO_ADDRESS,
    ownership.address
  );
  await vault.deployed();
  console.log("vault deployed to:", vault.address);

  //Pools Template
  const poolTemplate = await PoolTemplate.deploy();
  await poolTemplate.deployed();
  console.log("poolTemplate deployed to:", poolTemplate.address);

  const cdsTemplate = await CDSTemplate.deploy();
  await cdsTemplate.deployed();
  console.log("cdsTemplate deployed to:", cdsTemplate.address);

  const indexTemplate = await IndexTemplate.deploy();
  await indexTemplate.deployed();
  console.log("indexTemplate deployed to:", indexTemplate.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
