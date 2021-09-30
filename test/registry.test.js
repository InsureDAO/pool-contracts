const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("registry", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    //import
    [creator, alice, market1, market2, cds1, cds2, factory] =
      await ethers.getSigners();
    const Registry = await ethers.getContractFactory("Registry");
    //deploy
    registry = await Registry.deploy();
  });
  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(registry.address).to.exist;
    });
  });
  describe("ownership functions", function () {
    //revert test
    it("test_commit_owner_only", async () => {
      await expect(
        registry.connect(alice).commitTransferOwnership(alice.address)
      ).to.revertedWith("Restricted: caller is not allowed to operate");
    });

    it("test_apply_owner_only", async () => {
      await expect(
        registry.connect(alice).applyTransferOwnership()
      ).to.revertedWith("Restricted: caller is not allowed to operate");
    });

    //test
    it("test_commitTransferOwnership", async () => {
      await registry.commitTransferOwnership(alice.address);

      expect(await registry.owner()).to.equal(creator.address);
      expect(await registry.future_owner()).to.equal(alice.address);
    });

    it("test_applyTransferOwnership", async () => {
      await registry.commitTransferOwnership(alice.address);
      await ethers.provider.send("evm_increaseTime", [86400 * 4]);
      await registry.applyTransferOwnership();

      expect(await registry.owner()).to.equal(alice.address);
      expect(await registry.future_owner()).to.equal(alice.address);
    });

    it("test_apply_without_commit", async () => {
      await expect(registry.applyTransferOwnership()).to.revertedWith(
        "dev: no active transfer"
      );
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
