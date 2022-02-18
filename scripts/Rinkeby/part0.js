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
    ZERO_ADDRESS,
    GOV_TOKENS,
    INDEX_LIST,
    slotB,
    APPROVE_AMOUNT,
    GovFeeRatio,
    GracePeriod,
    LockUpPeriod,
    MinDate,
    WithdrawablePeriod,
    MinDeposit,
    MAX_LIST,
    ALLOCATION_POINT
  } = require("./config.js");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const PremiumModel = await ethers.getContractFactory("BondingPremium");
  const Parameters = await ethers.getContractFactory("Parameters");

  const usdc = await USDC.deploy(creator.address);
  console.log("usdc deployed to:", usdc.address);


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


  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);

  tx = await factory.approveTemplate(poolTemplate.address, true, true, false); //anyone can create pool.

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
  tx = await parameters.setFeeRate(ZERO_ADDRESS, GovFeeRatio);

  tx = await parameters.setGrace(ZERO_ADDRESS, GracePeriod);

  tx = await parameters.setLockup(ZERO_ADDRESS, LockUpPeriod);

  tx = await parameters.setMinDate(ZERO_ADDRESS, MinDate);

  tx = await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);

  tx = await parameters.setWithdrawable(ZERO_ADDRESS, WithdrawablePeriod);

  tx = await parameters.setVault(usdc.address, vault.address);

  tx = await parameters.setMaxList(ZERO_ADDRESS, MAX_LIST);

  await tx.wait();


  console.log(5)

  tx = await usdc.approve(vault.address, APPROVE_AMOUNT)
  await tx.wait()

  //PoolTemplate
  for(const addr of GOV_TOKENS){
    console.log("creating pool for: ", addr)
    tx = await factory.createMarket(
      poolTemplate.address,
      "meta",
      [0, 0], //initial deposit 0
      [addr, usdc.address, registry.address, parameters.address]
    );
    await tx.wait()
  }

  //INDEX
  for(let i=0; i<INDEX_LIST.length; i++){
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

  
  //set Index
  let markets = await registry.getAllMarkets();
  let pools = []
  let indicies = []
  let cds = []
  for(let i=0; i<markets.length; i++){
    let addr = markets[i]

    if(i < GOV_TOKENS.length){
      pools.push(addr)
    }else if(i < INDEX_LIST.length + GOV_TOKENS.length){
      indicies.push(addr)
    }else{
      cds.push(addr)
    }
  }


  for(let i=0; i<INDEX_LIST.length; i++){
    let index = await IndexTemplate.attach(indicies[i]);

    for(let t=0; t<INDEX_LIST[i].length; t++){
      tx = await index.set(t, slotB[i][t], pools[INDEX_LIST[i][t]], ALLOCATION_POINT)
      await tx.wait()
      console.log("set")
    }
  }

  //minimum deposit
  await factory.setCondition(
    poolTemplate.address,
    0, //initial deposit
    MinDeposit,
  );



  //----- WRITE -----//
  let markets_text = await registry.getAllMarkets();

  let pools_text = []
  let indicies_text = []
  let cds_text = []

  for(let i=0; i<markets_text.length; i++){
    let text = `\n       "` + markets_text[i] + `"`

    if(i < GOV_TOKENS.length){
      pools_text.push(text)
    }else if(i < INDEX_LIST.length + GOV_TOKENS.length){
      indicies_text.push(text)
    }else{
      cds_text.push(text)
    }
  }

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
    const Pools= [${pools_text}\n      ]\n
    const Indicies = [${indicies_text}\n      ]\n
    const CDS = [${cds_text}\n      ]\n

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
    fs.writeFileSync("./scripts/Rinkeby/deployments.js", text);
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
