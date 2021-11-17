const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("test BondingPremium", () => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    [creator, alice] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const Fee = await ethers.getContractFactory("FeeModel");

    ownership = await Ownership.deploy();
    fee = await Fee.deploy(ownership.address);
  });

  describe("Condition", function () {
    it("contract should be deployed", async () => {
      await expect(fee.address).to.exist;
    });
  });

  describe.skip("ownership functions", function () {
    //revert test
    it("test_commit_owner_only", async () => {
      await expect(
        fee.connect(alice).commitTransferOwnership(alice.address)
      ).to.revertedWith("Restricted: caller is not allowed to operate");
    });

    it("test_apply_owner_only", async () => {
      await expect(fee.connect(alice).applyTransferOwnership()).to.revertedWith(
        "Restricted: caller is not allowed to operate"
      );
    });

    //test
    it("test_commitTransferOwnership", async () => {
      await fee.commitTransferOwnership(alice.address);

      expect(await fee.owner()).to.equal(creator.address);
      expect(await fee.future_owner()).to.equal(alice.address);
    });

    it("test_applyTransferOwnership", async () => {
      await fee.commitTransferOwnership(alice.address);
      await ethers.provider.send("evm_increaseTime", [86400 * 4]);
      await fee.applyTransferOwnership();

      expect(await fee.owner()).to.equal(alice.address);
      expect(await fee.future_owner()).to.equal(alice.address);
    });

    it("test_apply_without_commit", async () => {
      await expect(fee.applyTransferOwnership()).to.revertedWith(
        "dev: no active transfer"
      );
    });
  });
});
