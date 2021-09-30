const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("test BondingPremium", () => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    [creator, alice] = await ethers.getSigners();

    const Fee = await ethers.getContractFactory("FeeModel");

    fee = await Fee.deploy();
  });

  describe("Condition", function () {
    it("contract should be deployed", async () => {
      await expect(fee.address).to.exist;
    });
  });

  describe("ownership functions", function () {
    //revert test
    it("test_commit_owner_only", async () => {
      await expect(
        fee.connect(alice).commit_transfer_ownership(alice.address)
      ).to.revertedWith("Restricted: caller is not allowed to operate");
    });

    it("test_apply_owner_only", async () => {
<<<<<<< HEAD
      await expect(
        fee.connect(alice).apply_transfer_ownership()
      ).to.revertedWith("Restricted: caller is not allowed to operate");
=======
      await expect(fee.connect(alice).applyTransferOwnership()).to.revertedWith(
        "dev: only owner"
      );
>>>>>>> QSP-BP-3
    });

    //test
    it("test_commit_transfer_ownership", async () => {
      await fee.commit_transfer_ownership(alice.address);

      expect(await fee.owner()).to.equal(creator.address);
      expect(await fee.future_owner()).to.equal(alice.address);
    });

    it("test_applyTransferOwnership", async () => {
      await fee.commit_transfer_ownership(alice.address);
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
