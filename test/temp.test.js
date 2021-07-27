const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
describe("Index", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  beforeEach(async () => {
    //import
    [creator, alice, bob, chad, tom, minter] = await ethers.getSigners();
    const DAI = await ethers.getContractFactory("TestERC20Mock");
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
    dai = await DAI.deploy();
    registry = await Registry.deploy();
    factory = await Factory.deploy(registry.address);
    fee = await FeeModel.deploy();
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(dai.address, creator.address);
    vault = await Vault.deploy(
      dai.address,
      registry.address,
      controller.address
    );
    poolTemplate = await PoolTemplate.deploy();
    cdsTemplate = await CDS.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(creator.address);
    //set up
    await dai.mint(chad.address, "100000000000000".toString());
    await dai.mint(bob.address, "100000000000000".toString());
    await dai.mint(alice.address, "100000000000000".toString());
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
    await factory.approveReference(
      poolTemplate.address,
      1,
      vault.address,
      true
    );
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
    await factory.approveReference(
      indexTemplate.address,
      1,
      vault.address,
      true
    );
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
    await factory.approveReference(
      cdsTemplate.address,
      3,
      minter.address,
      true
    );
    await premium.setPremium("2000", "50000");
    await fee.setFee("10000");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "86400000");
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
    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [],
      [parameters.address, vault.address, registry.address, minter.address]
    );
    await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [],
      [parameters.address, vault.address, registry.address]
    );
    const marketAddress3 = await factory.markets(2);
    const marketAddress4 = await factory.markets(3);
    cds = await CDS.attach(marketAddress3);
    index = await IndexTemplate.attach(marketAddress4);
    await registry.setCDS(ZERO_ADDRESS, cds.address);
    await index.set(market1.address, "1000");
    await index.set(market2.address, "1000");
    await index.setLeverage("2000");
  });
  describe("Condition", function () {
    it("devaluate underlying when cover claim is accepted", async function () {
      await dai.connect(alice).approve(vault.address, "200000000000000");
      //Simulation: partial payout
      await index.connect(alice).deposit("90000000000011");
      await index.connect(alice).requestWithdraw("90000000000011");
      await dai.connect(bob).approve(vault.address, "90000000000011");
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market1
        .connect(bob)
        .insure(
          "90000000000009",
          "90000000000009",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market1.applyCover("604800", 1000, 2000, incident, [
        "0x4e69636b00000000000000000000000000000000000000000000000000000000",
      ]);
      expect(await market1.totalLiquidity()).to.closeTo("90000000000011", "1");
      expect(await market1.pendingPremium(index.address)).to.closeTo(
        "21869594999912",
        "0"
      );
      await market1.connect(bob).redeem("0");
      expect(await market1.pendingPremium(index.address)).to.closeTo("0", "0");
      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );
    });
  });
});
