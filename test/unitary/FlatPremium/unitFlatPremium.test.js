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
} = require("../test-utils");

const { ZERO_ADDRESS, TEST_ADDRESS, NULL_ADDRESS, short, YEAR, WEEK, DAY, ZERO } = require("../constant-utils");

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

describe("FlatPremium", function () {
  const defaultRate = BigNumber.from("100000"); //1e5 => 10%
  const RATE_DENOMINATOR = BigNumber.from("1000000"); //1e6

  before(async () => {
    //import
    [gov] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const FlatPremium = await ethers.getContractFactory("FlatPremium");

    //deploy
    ownership = await Ownership.deploy();
    premium = await FlatPremium.deploy(ownership.address);
    await premium.connect(gov).setPremiumParameters(defaultRate, ZERO, ZERO, ZERO);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("FlatPremium", function () {
    describe("", function () {
      it("", async () => {});
    });
  });
});
