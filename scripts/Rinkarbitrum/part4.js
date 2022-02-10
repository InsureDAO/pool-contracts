const hre = require("hardhat");
const ethers = hre.ethers;
const { BigNumber } = require('ethers');
const fs = require("fs");

/***
 * deploy markets
 */

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const {
    ZERO_ADDRESS,
    APPROVE_AMOUNT,
    GOV_TOKENS_RINKEBY,
    INDEX_COUNT,
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


  //----- CREATE MARKETS -----//
  let tx;
  tx = await usdc.approve(vault.address, APPROVE_AMOUNT)
  await tx.wait()

  //PoolTemplate
  for(const addr of GOV_TOKENS_RINKEBY){
    console.log("creating pool for: ", addr)
    tx = await factory.createMarket(
      poolTemplate.address,
      "meta",
      [0, BigNumber.from("1000000000")], //initial deposit
      [addr, usdc.address, registry.address, parameters.address]
    );
    await tx.wait()
  }

  //INDEX
  for(let i=0; i<INDEX_COUNT; i++){
    tx = await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      [0],
      [usdc.address, registry.address, parameters.address]
    );
    await tx.wait()
  }
  

  //CDS
  tx = await factory.createMarket(
    cdsTemplate.address,
    "Here is metadata.",
    [0],
    [usdc.address, registry.address, parameters.address]
  );
  await tx.wait()


  //Get Addresses
  let markets = await registry.getAllMarkets();

  let pools = []
  let indicies = []
  let cds = []

  for(let i=0; i<markets.length; i++){
    let text = `\n       "` + markets[i] + `"`

    if(i < GOV_TOKENS_RINKEBY.length){
      pools.push(text)
    }else if(i < INDEX_COUNT + GOV_TOKENS_RINKEBY.length){
      indicies.push(text)
    }else{
      cds.push(text)
    }
  }

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
    const CDSTemplateAddress = "${cdsTemplate.address}"  \n
    const Pools= [${pools}\n      ]\n
    const Indicies = [${indicies}\n      ]\n
    const CDS = [${cds}\n      ]\n

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
      CDSTemplateAddress,
      Pools,
      Indicies,
      CDS
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
