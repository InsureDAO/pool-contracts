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
    ZERO_ADDRESS
  } = require("./config.js");

  const {
    USDCAddress
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
  console.log("usdc attached to:", usdc.address);


  //----- DEPLOY -----//
  const ownership = await Ownership.deploy();
  console.log("ownership deployed to:", ownership.address);

  const registry = await Registry.deploy(ownership.address);
  console.log("registry deployed to:", registry.address);

  const factory = await Factory.deploy(registry.address, ownership.address);
  console.log("factory deployed to:", factory.address);

  const premium = await PremiumModel.deploy(ownership.address);
  console.log("premium deployed to:", premium.address);

  const parameters = await Parameters.deploy(ownership.address);
  console.log("parameters deployed to:", parameters.address);
  
  const vault = await Vault.deploy(
    usdc.address,
    registry.address,
    ZERO_ADDRESS,
    ownership.address
  );
  console.log("vault deployed to:", vault.address);

  //Pools Template
  const poolTemplate = await PoolTemplate.deploy();
  console.log("poolTemplate deployed to:", poolTemplate.address);

  const indexTemplate = await IndexTemplate.deploy();
  console.log("indexTemplate deployed to:", indexTemplate.address);

  const cdsTemplate = await CDSTemplate.deploy();
  console.log("cdsTemplate deployed to:", cdsTemplate.address);


  //----- WRITE -----//
  let text = 
    `
    const USDCAddress = "${usdc.address}" 
    const OwnershipAddress = "${ownership.address}"  
    const RegistryAddress = "${registry.address}"  
    const FactoryAddress = "${factory.address}"  
    const PremiumModelAddress = "${premium.address}"  
    const ParametersAddress = "${parameters.address}"  
    const VaultAddress = "${vault.address}"  \n
    const PoolTemplateAddress = "${poolTemplate.address}" 
    const IndexTemplateAddress = "${indexTemplate.address}"  
    const CDSTemplateAddress = "${cdsTemplate.address}"  

    Object.assign(exports, {
      USDCAddress,
      OwnershipAddress,
      RegistryAddress,
      FactoryAddress,
      PremiumModelAddress,
      ParametersAddress,
      VaultAddress,
      PoolTemplateAddress,
      IndexTemplateAddress,
      CDSTemplateAddress
    })
    `
  try {
    fs.writeFileSync("./scripts/Rinkarbitrum/deployments.js", text);
    console.log('write end');
  }catch(e){
    console.log(e);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
