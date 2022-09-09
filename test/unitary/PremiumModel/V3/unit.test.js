const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const { snapshot, restore } = require("../../test-utils");

const { ZERO_ADDRESS } = require("../../constant-utils");

describe("PremiumModelV3", function () {
  const defaultRate = BigNumber.from("100000"); //1e5 => 10%
  const BASE_LIQUIDITY = BigNumber.from("1000000000000000000"); //1e18
  const RATE_DENOMINATOR = BigNumber.from("1000000"); //1e6
  let rateSlope1 = BigNumber.from("100000");
  let rateSlope2 = BigNumber.from("400000");
  let OPTIMAL_UTILIZE_RATIO = BigNumber.from("900000");

  before(async () => {
    //import
    [gov] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const PMV3 = await ethers.getContractFactory("PremiumModelV3");

    //deploy
    ownership = await Ownership.deploy();
    pm = await PMV3.deploy(ownership.address, defaultRate, rateSlope1, rateSlope2, OPTIMAL_UTILIZE_RATIO);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("PremiumModelV3", function () {
    describe("constructor", function () {
      it("set successfully", async () => {});

      it("revert when invalid parameter", async () => {});
    });

    describe("getCurrentPremiumRate", function () {
      it("return correct value", async () => {
        //random number (smaller than 1e6)
        const utilizeRatio = BigNumber.from("100000"); //10%

        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(RATE_DENOMINATOR);
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, BASE_LIQUIDITY, lockedAmount);

        if (utilizeRatio.gt(OPTIMAL_UTILIZE_RATIO)) {
          const expectedRate = defaultRate
            .add(rateSlope1)
            .add(rateSlope2.mul(utilizeRatio.sub(OPTIMAL_UTILIZE_RATIO)).div(RATE_DENOMINATOR));

          console.log(expectedRate);
          expect(rate).to.equal(expectedRate);
        } else {
          const expectedRate = defaultRate.add(rateSlope1.mul(utilizeRatio).div(RATE_DENOMINATOR));
          console.log(expectedRate);
          expect(rate).to.equal(expectedRate);
        }
      });
    });

    describe("getPremiumRate", function () {
      it("return correct value", async () => {});
    });

    describe("getPremium", function () {
      it("return correct value", async () => {});

      it("revert when exceed totalLiquidity", async () => {});
    });
  });
});
