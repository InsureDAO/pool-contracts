const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

/***
 * deploy markets
 */

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const {
    ZERO_ADDRESS,
    GOV_TOKENS_RINKEBY,
    INDEX_COUNT
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
    IndexTemplateAddress,
    CDSTemplateAddress,
    Pools,
    Indicies,
    CDS
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

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
  }

  //----- Set Indicies -----//
  
  //memory for PoolTemplate:indexList[]
  let pairs = new Array(Pools.length)
  for(let i=0; i<pairs.length; i++){
    pairs[i] = 0
  }

  //Randomly set a random number of pools.
  for(const indexAddress of Indicies){
    const index = await IndexTemplate.attach(indexAddress);

    let poolCounts = getRandomInt(3, 11); //Parameters.maxList()

    let settingPools = []
    for(let i=0; i<poolCounts; i++){
      console.log(i)
      let pass = false

      while(!pass){
        let slot = getRandomInt(0, Pools.length)
        if(settingPools.includes(slot) == false){
          settingPools.push(slot)
          pass = true
        }
      }
    }
    console.log("settingPools:", settingPools)

    //set
    console.log("index: ", index.address)
    for(let i = 0; i < settingPools.length; i++){
      tx = await index.set(i, pairs[settingPools[i]], Pools[settingPools[i]], "1000");
      await tx.wait()
      console.log("set(",i, ",", pairs[settingPools[i]], ",", Pools[settingPools[i]], "1000")
    }

    tx = await index.setLeverage("2000000"); //x2
    await tx.wait()

    //calc index:pool pair
    for(const pool of settingPools){
      pairs[pool]++
    }
  }

  await registry.setCDS(ZERO_ADDRESS, CDS[0]);

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
