const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
}


describe("registry", function () {

  before(async () => {
    //import
    [creator, alice, market1, market2, cds1, cds2, factory] =
      await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const Registry = await ethers.getContractFactory("Registry");
    //deploy
    ownership = await Ownership.deploy();
    registry = await Registry.deploy(ownership.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)
  })

  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(registry.address).to.exist;
    });
  });

  describe("registry functions", function () {
    it("allows register markets", async () => {
      await registry.supportMarket(market1.address);
      await registry.supportMarket(market2.address);

      expect(await registry.isListed(market1.address)).to.equal(true);
      expect(await registry.isListed(market2.address)).to.equal(true);
    });

    it("allows register CDS", async () => {
      await registry.setCDS(market1.address, cds1.address);
      await registry.setCDS(market2.address, cds2.address);

      expect(await registry.getCDS(market1.address)).to.equal(cds1.address);
      expect(await registry.getCDS(market2.address)).to.equal(cds2.address);
    });

    it("allows register market from factory", async () => {
      await registry.setFactory(factory.address);
      await registry.connect(factory).supportMarket(market1.address);
      
      expect(await registry.isListed(market1.address)).to.equal(true);
    });
  });
});
