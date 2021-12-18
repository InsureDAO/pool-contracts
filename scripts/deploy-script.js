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
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const FeeModel = await ethers.getContractFactory("FeeModel");
  const PremiumModel = await ethers.getContractFactory("BondingPremiumV1");
  const Parameters = await ethers.getContractFactory("Parameters");
  const Contorller = await ethers.getContractFactory("ControllerMock");
  //deploy
  const dai = await DAI.deploy(creator.address);
  await dai.deployed();
  console.log("usdc deployed to:", dai.address);
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
  const controller = await Contorller.deploy(dai.address, creator.address);
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
  const cdsTemplate = await CDSTemplate.deploy();
  await cdsTemplate.deployed();
  console.log("cdsTemplate deployed to:", cdsTemplate.address);
  const indexTemplate = await IndexTemplate.deploy();
  await indexTemplate.deployed();
  console.log("indexTemplate deployed to:", indexTemplate.address);
  const parameters = await Parameters.deploy(creator.address);
  await parameters.deployed();
  console.log("parameters deployed to:", parameters.address);

  let tx = await registry.setFactory(factory.address);
  await tx.wait();
  tx = await factory.approveTemplate(poolTemplate.address, true, false, true);
  await tx.wait();
  tx = await factory.approveTemplate(indexTemplate.address, true, false, true);
  await tx.wait();
  tx = await factory.approveTemplate(cdsTemplate.address, true, false, true);
  await tx.wait();
  console.log("parameters configured 0");
  tx = await factory.approveReference(
    poolTemplate.address,
    0,
    ZERO_ADDRESS,
    true
  );
  await tx.wait();

  tx = await factory.approveReference(
    poolTemplate.address,
    1,
    dai.address,
    true
  );
  await tx.wait();
  tx = await factory.approveReference(
    poolTemplate.address,
    2,
    registry.address,
    true
  );
  await tx.wait();
  tx = await factory.approveReference(
    poolTemplate.address,
    3,
    parameters.address,
    true
  );
  await tx.wait();
  tx = await factory.approveReference(
    indexTemplate.address,
    0,
    dai.address,
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
  tx = await factory.approveReference(
    cdsTemplate.address,
    0,
    dai.address,
    true
  );
  await tx.wait();
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
  await tx.wait();
  console.log("parameters configured 1");
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
  tx = await parameters.setVault(dai.address, vault.address);
  await tx.wait();
  tx = await parameters.setMaxList(ZERO_ADDRESS, "10");
  await tx.wait();
  console.log("parameters configured 2");
  tx = await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    [1, 0],
    [dai.address, dai.address, registry.address, parameters.address]
  );
  await tx.wait();
  tx = await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    [1, 0],
    [dai.address, dai.address, registry.address, parameters.address]
  );
  await tx.wait();
  tx = await factory.createMarket(
    poolTemplate.address,
    "Here is metadata.",
    [1, 0],
    [dai.address, dai.address, registry.address, parameters.address]
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
  tx = await factory.createMarket(
    cdsTemplate.address,
    "Here is metadata.",
    [0],
    [dai.address, registry.address, parameters.address]
  );
  await tx.wait();
  tx = await factory.createMarket(
    indexTemplate.address,
    "Here is metadata.",
    [0],
    [dai.address, registry.address, parameters.address]
  );
  await tx.wait();
  const marketAddress4 = await factory.markets(3);
  const marketAddress5 = await factory.markets(4);
  cds = await CDSTemplate.attach(marketAddress4);
  index = await IndexTemplate.attach(marketAddress5);
  console.log("cds deployed to", marketAddress4);
  console.log("index deployed to", marketAddress5);
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
