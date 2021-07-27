const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe.skip("test BondingPremium", () => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ten_to_the_18 = BigNumber.from("1000000000000000000");
  const ten_to_the_6 = BigNumber.from("1000000");

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
        premium.connect(alice).commit_transfer_ownership(alice.address)
      ).to.revertedWith("dev: only owner");
    });

    it("test_apply_owner_only", async () => {
      await expect(
        premium.connect(alice).apply_transfer_ownership()
      ).to.revertedWith("dev: only owner");
    });

    //test
    it("test_commit_transfer_ownership", async () => {
      await premium.commit_transfer_ownership(alice.address);

      expect(await premium.owner()).to.equal(creator.address);
      expect(await premium.future_owner()).to.equal(alice.address);
    });

    it("test_apply_transfer_ownership", async () => {
      await premium.commit_transfer_ownership(alice.address);
      await ethers.provider.send("evm_increaseTime", [86400 * 4]);
      await premium.apply_transfer_ownership();

      expect(await premium.owner()).to.equal(alice.address);
      expect(await premium.future_owner()).to.equal(alice.address);
    });

    it("test_apply_without_commit", async () => {
      await expect(premium.apply_transfer_ownership()).to.revertedWith(
        "dev: no active transfer"
      );
    });
  });
});
