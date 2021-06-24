const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("Pool", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    //import
    [creator, alice, bob, chad, tom, test] = await ethers.getSigners();
    const Parameters = await ethers.getContractFactory("Parameters");

    parameters = await Parameters.deploy(creator.address);
  });
  describe("ownership functions", function () {
    //revert test
    it("test_commit_owner_only", async () => {
      await expect(
        parameters.connect(alice).commit_transfer_ownership(alice.address)
      ).to.revertedWith("dev: only owner");
    });

    it("test_apply_owner_only", async () => {
      await expect(
        parameters.connect(alice).apply_transfer_ownership()
      ).to.revertedWith("dev: only owner");
    });

    //test
    it("test_commit_transfer_ownership", async () => {
      await parameters.commit_transfer_ownership(alice.address);

      expect(await parameters.owner()).to.equal(creator.address);
      expect(await parameters.future_owner()).to.equal(alice.address);
    });

    it("test_apply_transfer_ownership", async () => {
      await parameters.commit_transfer_ownership(alice.address);
      await ethers.provider.send("evm_increaseTime", [86400 * 4]);
      await parameters.apply_transfer_ownership();

      expect(await parameters.owner()).to.equal(alice.address);
      expect(await parameters.future_owner()).to.equal(alice.address);
    });

    it("test_apply_without_commit", async () => {
      await expect(parameters.apply_transfer_ownership()).to.revertedWith(
        "dev: no active transfer"
      );
    });
  });
  describe("parameters functions", function () {
    it("registers universal params", async () => {
      await parameters.setPremium2(ZERO_ADDRESS, "1000");
      await parameters.setFee2(ZERO_ADDRESS, "1000");
      await parameters.setGrace(ZERO_ADDRESS, "1000");
      await parameters.setLockup(ZERO_ADDRESS, "1000");
      await parameters.setMindate(ZERO_ADDRESS, "1000");

      await parameters.setVault(ZERO_ADDRESS, test.address);
      await parameters.setWithdrawable(ZERO_ADDRESS, "1000");

      expect(await parameters.getPremium2("10000")).to.equal("100");
      expect(await parameters.getFee2(10000)).to.equal("100");
      expect(await parameters.getGrace()).to.equal("1000");
      expect(await parameters.getLockup()).to.equal("1000");
      expect(await parameters.getMin()).to.equal("1000");
      expect(await parameters.getWithdrawable()).to.equal("1000");
      expect(await parameters.getVault(test.address)).to.equal(ZERO_ADDRESS);
    });

    it("registers specific params for the specifed address", async () => {
      await parameters.setPremium2(test.address, "10000");
      await parameters.setFee2(test.address, "10000");
      await parameters.setGrace(test.address, "10000");
      await parameters.setLockup(test.address, "10000");
      await parameters.setMindate(test.address, "10000");
      await parameters.setVault(test.address, test.address);
      await parameters.setWithdrawable(test.address, "10000");

      expect(await parameters.connect(test).getPremium2("10000")).to.equal(
        "1000"
      );
      expect(await parameters.connect(test).getFee2(10000)).to.equal("1000");
      expect(await parameters.connect(test).getGrace()).to.equal("10000");
      expect(await parameters.connect(test).getLockup()).to.equal("10000");
      expect(await parameters.connect(test).getMin()).to.equal("10000");
      expect(await parameters.connect(test).getWithdrawable()).to.equal(
        "10000"
      );
      expect(await parameters.getVault(test.address)).to.equal(test.address);
    });
  });
});
