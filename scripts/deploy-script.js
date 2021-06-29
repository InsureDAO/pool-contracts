const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  //constants
  //const creator = "0x6589b2186e4346c264efEd5fe3Aae5c11Abc1773";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  [creator] = await ethers.getSigners();
  //contracts
  const DAI = await ethers.getContractFactory("ERC20Mock");
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const CDS = await ethers.getContractFactory("CDS");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const FeeModel = await ethers.getContractFactory("FeeModel");
  const PremiumModel = await ethers.getContractFactory("PremiumModel");
  const Parameters = await ethers.getContractFactory("Parameters");
  const Contorller = await ethers.getContractFactory("Controller");
  //deploy
  const dai = await DAI.deploy(creator.address);
  await dai.deployed();
  console.log("dai deployed to:", dai.address);
  const registry = await Registry.deploy();
  await registry.deployed();
  console.log("registry deployed to:", registry.address);
  const factory = await Factory.deploy(registry.address);
  await factory.deployed();
  console.log("factory deployed to:", factory.address);
  const fee = await FeeModel.deploy();
  await fee.deployed();
  console.log("fee deployed to:", fee.address);
  const premium = await PremiumModel.deploy();
  await premium.deployed();
  console.log("premium deployed to:", premium.address);
  const controller = await Contorller.deploy(dai.address);
  await controller.deployed();
  console.log("controller deployed to:", controller.address);
  const vault = await Vault.deploy(
    dai.address,
    registry.address,
    controller.address
  );
  await vault.deployed();
  console.log("vault deployed to:", vault.address);
  const poolTemplate = await PoolTemplate.deploy();
  await poolTemplate.deployed();
  console.log("poolTemplate deployed to:", poolTemplate.address);
  const cdsTemplate = await CDS.deploy();
  await cdsTemplate.deployed();
  console.log("cdsTemplate deployed to:", cdsTemplate.address);
  const indexTemplate = await IndexTemplate.deploy();
  await indexTemplate.deployed();
  console.log("indexTemplate deployed to:", indexTemplate.address);
  const parameters = await Parameters.deploy(creator.address);
  await parameters.deployed();
  console.log("parameters deployed to:", parameters.address);

  await registry.setFactory(factory.address);
  await factory.approveTemplate(poolTemplate.address, true, false);
  await factory.approveTemplate(indexTemplate.address, true, false);
  await factory.approveTemplate(cdsTemplate.address, true, false);
  await factory.approveReference(
    poolTemplate.address,
    0,
    parameters.address,
    true
  );
  await factory.approveReference(poolTemplate.address, 1, vault.address, true);
  await factory.approveReference(
    poolTemplate.address,
    2,
    registry.address,
    true
  );

  await factory.approveReference(
    indexTemplate.address,
    0,
    parameters.address,
    true
  );
  await factory.approveReference(indexTemplate.address, 1, vault.address, true);
  await factory.approveReference(
    indexTemplate.address,
    2,
    registry.address,
    true
  );

  await factory.approveReference(
    cdsTemplate.address,
    0,
    parameters.address,
    true
  );
  await factory.approveReference(cdsTemplate.address, 1, vault.address, true);
  await factory.approveReference(
    cdsTemplate.address,
    2,
    registry.address,
    true
  );
  await factory.approveReference(cdsTemplate.address, 3, creator.address, true);
  console.log("parameters configured 1");
  await premium.setPremium("2000", "50000");
  await fee.setFee("1000");
  await parameters.setPremium2(ZERO_ADDRESS, "2000");
  await parameters.setFee2(ZERO_ADDRESS, "1000");
  await parameters.setGrace(ZERO_ADDRESS, "259200");
  await parameters.setLockup(ZERO_ADDRESS, "604800");
  await parameters.setMindate(ZERO_ADDRESS, "604800");
  await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
  await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
  await parameters.setWithdrawable(ZERO_ADDRESS, "86400000");
  console.log("parameters configured 2");
  await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    "test-name",
    "test-symbol",
    18,
    [0, 0],
    [parameters.address, vault.address, registry.address]
  );
  await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    "test-name",
    "test-symbol",
    18,
    [0, 0],
    [parameters.address, vault.address, registry.address]
  );
  const marketAddress1 = await factory.markets(0);
  const marketAddress2 = await factory.markets(1);
  market1 = await PoolTemplate.attach(marketAddress1);
  market2 = await PoolTemplate.attach(marketAddress2);
  console.log("pools deployed");
  await factory.createMarket(
    cdsTemplate.address,
    "Here is metadata.",
    "test-name",
    "test-symbol",
    18,
    [],
    [parameters.address, vault.address, registry.address, creator.address]
  );
  console.log("cds deployed");
  await factory.createMarket(
    indexTemplate.address,
    "Here is metadata.",
    "test-name",
    "test-symbol",
    18,
    [],
    [parameters.address, vault.address, registry.address]
  );
  console.log("index deployed");

  const marketAddress3 = await factory.markets(2);
  const marketAddress4 = await factory.markets(3);
  cds = await CDS.attach(marketAddress3);
  index = await IndexTemplate.attach(marketAddress4);
  await registry.setCDS(ZERO_ADDRESS, cds.address);
  await index.set(market1.address, "1000");
  await index.set(market2.address, "1000");
  await index.setLeverage("20000");
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
