const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("Vault", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    //import
    [creator, alice, bob, chad] = await ethers.getSigners();
    const DAI = await ethers.getContractFactory("TestERC20Mock");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const Contorller = await ethers.getContractFactory("Controller");
    //deploy
    dai = await DAI.deploy();
    registry = await Registry.deploy();
    controller = await Contorller.deploy(dai.address, creator.address);
    vault = await Vault.deploy(
      dai.address,
      registry.address,
      controller.address
    );

    //set up
    await dai.mint(alice.address, (100000).toString());

    await controller.setVault(vault.address);

    await registry.supportMarket(alice.address);
  });
  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(dai.address).to.exist;
      expect(vault.address).to.exist;
      expect(controller.address).to.exist;
    });
  });
  describe("ownership functions", function () {
    //revert test
    it("test_commit_owner_only", async () => {
      await expect(
        vault.connect(alice).commit_transfer_ownership(alice.address)
      ).to.revertedWith("dev: only owner");
    });

    it("test_apply_owner_only", async () => {
      await expect(
        vault.connect(alice).apply_transfer_ownership()
      ).to.revertedWith("dev: only owner");
    });

    //test
    it("test_commit_transfer_ownership", async () => {
      await vault.commit_transfer_ownership(alice.address);

      expect(await vault.owner()).to.equal(creator.address);
      expect(await vault.future_owner()).to.equal(alice.address);
    });

    it("test_apply_transfer_ownership", async () => {
      await vault.commit_transfer_ownership(alice.address);
      await ethers.provider.send("evm_increaseTime", [86400 * 4]);
      await vault.apply_transfer_ownership();

      expect(await vault.owner()).to.equal(alice.address);
      expect(await vault.future_owner()).to.equal(alice.address);
    });

    it("test_apply_without_commit", async () => {
      await expect(vault.apply_transfer_ownership()).to.revertedWith(
        "dev: no active transfer"
      );
    });
  });
  describe("vault functions", function () {
    beforeEach(async () => {
      await dai.connect(alice).approve(vault.address, 10000);
    });

    it("allows add and withdraw value", async () => {
      await vault.connect(alice).addValue(10000, alice.address, alice.address);
      await controller.yield();
      expect(await vault.underlyingValue(alice.address)).to.equal(15000);
      expect(await vault.getPricePerFullShare()).to.equal(
        "1500000000000000000"
      );
      await vault.connect(alice).withdrawAllAttribution(alice.address);
      expect(await dai.balanceOf(alice.address)).to.equal(105000);
    });

    it("allows transfer value", async () => {
      await vault.connect(alice).addValue(10000, alice.address, alice.address);
      await controller.yield();
      expect(await vault.underlyingValue(alice.address)).to.equal(15000);
      await vault.connect(alice).transferValue(15000, bob.address);
      expect(await vault.underlyingValue(bob.address)).to.equal(15000);
      expect(await vault.attributionOf(bob.address)).to.equal(10000);
      await vault.connect(bob).transferAttribution(10000, chad.address);
      await vault.connect(chad).withdrawAllAttribution(chad.address);
      expect(await dai.balanceOf(chad.address)).to.equal(15000);
    });
  });
});
