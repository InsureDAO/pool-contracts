const hre = require("hardhat");
const ethers = hre.ethers;

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


  //----- DEPLOY -----//
  //Fundamental
  const ownership = await Ownership.deploy();
  await ownership.deployed();
  console.log("ownership deployed to:", ownership.address);

  const usdc = await USDC.deploy(creator.address);
  await usdc.deployed();
  console.log("usdc deployed to:", usdc.address);

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

  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);
  await tx.wait();

  tx = await factory.approveTemplate(poolTemplate.address, true, true, true); //anyone can create pool.
  await tx.wait();

  tx = await factory.approveTemplate(indexTemplate.address, true, false, true);
  await tx.wait();

  tx = await factory.approveTemplate(cdsTemplate.address, true, false, true);
  await tx.wait();


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



  //----- CREATE MARKETS -----//
  //pools
  tx = await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    [0, 0],
    [usdc.address, usdc.address, registry.address, parameters.address, creator.address]
  );
  await tx.wait();

  tx = await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    [0, 0],
    [usdc.address, usdc.address, registry.address, parameters.address, creator.address]
  );
  await tx.wait();

  tx = await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    [0, 0],
    [usdc.address, usdc.address, registry.address, parameters.address, creator.address]
  );
  await tx.wait();

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
