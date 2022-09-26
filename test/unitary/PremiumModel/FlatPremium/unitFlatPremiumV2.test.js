const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalances,
  verifyAllowance,

  verifyPoolsStatus,
  verifyPoolsStatusForIndex,

  verifyValueOfUnderlying,

  verifyIndexStatus,

  verifyVaultStatusOf,
  verifyVaultStatus_legacy,
  verifyVaultStatusOf_legacy,
  verifyDebtOf,

  verifyRate,
} = require("../../test-utils");

const { ZERO_ADDRESS, TEST_ADDRESS, NULL_ADDRESS, short, YEAR, WEEK, DAY, ZERO, ONE } = require("../../constant-utils");

async function snapshot() {
  return network.provider.send("evm_snapshot", []);
}

async function restore(snapshotId) {
  return network.provider.send("evm_revert", [snapshotId]);
}

async function moveForwardPeriods(days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true;
}

async function now() {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

describe("FlatPremiumV2", function () {
  const defaultRate = BigNumber.from("100000"); //1e5 => 10%
  const RATE_DENOMINATOR = BigNumber.from("1000000"); //1e6

  before(async () => {
    //import
    [gov] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const FlatPremiumV2 = await ethers.getContractFactory("FlatPremiumV2");

    //deploy
    ownership = await Ownership.deploy();
    premium = await FlatPremiumV2.deploy(ownership.address, defaultRate);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("constructor", function () {
    it("set successfully", async () => {
      expect(await premium.ownership()).to.equal(ownership.address);
      expect(await premium.getRate(ZERO_ADDRESS)).to.equal(defaultRate);
    });

    it("revert when zero address", async () => {
      const FlatPremiumV2 = await ethers.getContractFactory("FlatPremiumV2");
      await expect(FlatPremiumV2.deploy(ZERO_ADDRESS, defaultRate)).to.revertedWith("zero address");
    });

    it("revert when zero rate", async () => {
      const FlatPremiumV2 = await ethers.getContractFactory("FlatPremiumV2");
      await expect(FlatPremiumV2.deploy(ownership.address, ZERO)).to.revertedWith("rate is zero");
    });
  });

  describe("getCurrentPremiumRate", function () {
    it("return correct value", async () => {
      const currentRate = await premium.getRate(ZERO_ADDRESS);
      expect(await premium.getCurrentPremiumRate(ZERO_ADDRESS, ZERO, ZERO)).to.equal(currentRate);
    });

    it("return correct value2", async () => {
      await premium.setRate(TEST_ADDRESS, ONE);
      expect(await premium.getCurrentPremiumRate(TEST_ADDRESS, ZERO, ZERO)).to.equal(ONE);
    });
  });

  describe("getPremiumRate", function () {
    it("return correct value", async () => {
      const currentRate = await premium.getRate(TEST_ADDRESS);
      expect(await premium.getPremiumRate(TEST_ADDRESS, ZERO, ZERO, ZERO)).to.equal(currentRate);
    });

    it("return correct value2", async () => {
      await premium.setRate(TEST_ADDRESS, ONE);
      expect(await premium.getPremiumRate(TEST_ADDRESS, ZERO, ZERO, ZERO)).to.equal(ONE);
    });
  });

  describe("getPremium", function () {
    it("return correct value", async () => {
      const amount = BigNumber.from("100000");
      const term = YEAR;
      const totalLiquidity = BigNumber.from("1000000");
      const lockedAmount = BigNumber.from("100000");
      const currentRate = await premium.getRate(TEST_ADDRESS);

      const expectPremium = amount.mul(term).mul(currentRate).div(YEAR).div(RATE_DENOMINATOR);
      console.log(expectPremium);

      expect(await premium.getPremium(TEST_ADDRESS, amount, term, totalLiquidity, lockedAmount)).to.equal(
        expectPremium
      );
    });

    it("revert when exceed totalLiquidity", async () => {
      const amount = BigNumber.from("900001");
      const term = YEAR;
      const totalLiquidity = BigNumber.from("1000000");
      const lockedAmount = BigNumber.from("100000");

      await expect(premium.getPremium(TEST_ADDRESS, amount, term, totalLiquidity, lockedAmount)).to.revertedWith(
        "Amount exceeds total liquidity"
      );
    });
  });
});
