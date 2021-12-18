const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const{ 
  ZERO_ADDRESS,
  YEAR,
  ten_to_the_18,
  ten_to_the_6,
  ONE,
  TWO
} = require('../constant-utils');

describe.skip("test PremiumModel", () => {

  beforeEach(async () => {
    [creator, alice] = await ethers.getSigners();

    const Premium = await ethers.getContractFactory("PremiumModel");

    premium = await Premium.deploy();
  });

  describe("Condition", function () {
    it("contract should be deployed", async () => {
      await expect(premium.address).to.exist;
    });
  });

  describe("test getPremiumRate", function () {
    it("getPremiumRate correctlly", async () => {
      await premium.setPremium("2000", "50000"); //max 52%
      let total = BigNumber.from("1000000").mul(ten_to_the_18);
      let locked_amount = BigNumber.from("771863").mul(ten_to_the_18); //77.1863% utilized

      let p_amount = await premium.getPremiumRate(total, locked_amount);

      await expect(p_amount).to.equal(BigNumber.from("40593")); //40.593%
    });
  });

  describe("ownership functions", function () {
    //revert test
    it("test_commit_owner_only", async () => {
      await expect(
        premium.connect(alice).commitTransferOwnership(alice.address)
      ).to.revertedWith("Restricted: caller is not allowed to operate");
    });

    it("test_apply_owner_only", async () => {
      await expect(
        premium.connect(alice).applyTransferOwnership()
      ).to.revertedWith("Restricted: caller is not allowed to operate");
    });

    //test
    it("test_commitTransferOwnership", async () => {
      await premium.commitTransferOwnership(alice.address);

      expect(await premium.owner()).to.equal(creator.address);
      expect(await premium.future_owner()).to.equal(alice.address);
    });

    it("test_applyTransferOwnership", async () => {
      await premium.commitTransferOwnership(alice.address);
      await ethers.provider.send("evm_increaseTime", [86400 * 4]);
      await premium.applyTransferOwnership();

      expect(await premium.owner()).to.equal(alice.address);
      expect(await premium.future_owner()).to.equal(alice.address);
    });

    it("test_apply_without_commit", async () => {
      await expect(premium.applyTransferOwnership()).to.revertedWith(
        "dev: no active transfer"
      );
    });
  });
});
