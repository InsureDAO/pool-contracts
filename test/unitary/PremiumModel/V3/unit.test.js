const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const { snapshot, restore } = require("../../test-utils");

const { ZERO_ADDRESS, YEAR, ZERO, ONE } = require("../../constant-utils");

describe("PremiumModelV3", function () {
  const defaultRate = BigNumber.from("100000"); //1e5 => 10%
  const BASE_LIQUIDITY = BigNumber.from("1000000000000000000"); //1e18
  const MAGIC_SCALE = BigNumber.from("1000000"); //1e6
  let rateSlope1 = BigNumber.from("100000"); //10%
  let rateSlope2 = BigNumber.from("400000"); //40%
  let OPTIMAL_UTILIZE_RATIO = BigNumber.from("900000"); //90%

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
      it("set successfully", async () => {
        expect(await pm.ownership()).to.equal(ownership.address);
        expect(await pm.baseRates(ZERO_ADDRESS)).to.equal(defaultRate);
        expect(await pm.rateSlope1()).to.equal(rateSlope1);
        expect(await pm.rateSlope2()).to.equal(rateSlope2);

        expect(await pm.OPTIMAL_UTILIZE_RATIO()).to.equal(OPTIMAL_UTILIZE_RATIO);
      });

      it("revert when invalid parameter", async () => {
        const PMV3 = await ethers.getContractFactory("PremiumModelV3");

        await expect(
          PMV3.deploy(ZERO_ADDRESS, defaultRate, rateSlope1, rateSlope2, OPTIMAL_UTILIZE_RATIO)
        ).to.revertedWith("zero address");

        await expect(
          PMV3.deploy(ownership.address, ZERO, rateSlope1, rateSlope2, OPTIMAL_UTILIZE_RATIO)
        ).to.revertedWith("rate is zero");

        await expect(
          PMV3.deploy(ownership.address, defaultRate, ZERO, rateSlope2, OPTIMAL_UTILIZE_RATIO)
        ).to.revertedWith("slope1 is zero");

        await expect(
          PMV3.deploy(ownership.address, defaultRate, rateSlope1, ZERO, OPTIMAL_UTILIZE_RATIO)
        ).to.revertedWith("slope2 is zero");

        await expect(PMV3.deploy(ownership.address, defaultRate, rateSlope1, rateSlope2, ZERO)).to.revertedWith(
          "ratio is zero"
        );

        await expect(PMV3.deploy(ownership.address, defaultRate, rateSlope1, rateSlope2, 1e6 + 1)).to.revertedWith(
          "exceed max rate"
        );
      });
    });

    describe("getCurrentPremiumRate", function () {
      it("Return correct rate when 0", async () => {
        const utilizeRatio = BigNumber.from("0"); //0%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, BASE_LIQUIDITY, lockedAmount);

        //when 0% utilized, expection is
        //Base
        //10%
        expect(rate).to.equal("100000");
      });

      it("Return correct rate only ranged on slope1", async () => {
        const utilizeRatio = BigNumber.from("450000"); //45%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, BASE_LIQUIDITY, lockedAmount);

        //when 45% utilized, expection is
        //Base + (slope1 * utilization/optimal_ratio)
        //10% + (10% * 45%/90%) = 15%
        expect(rate).to.equal("150000");
      });

      it("Return correct rate when OPTIMIZED_RATIO", async () => {
        const utilizeRatio = BigNumber.from("900000"); //90%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, BASE_LIQUIDITY, lockedAmount);

        //when 90% utilized, expection is
        //Base + slope1
        //10% + 10%
        expect(rate).to.equal("200000");
      });

      it("Return correct rate only ranged on slope2", async () => {
        const utilizeRatio = BigNumber.from("950000"); //95%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, BASE_LIQUIDITY, lockedAmount);

        //when 95% utilized, expection is
        //Base + slope1 + (slope2 * half)
        //10% + 10% + ( 40% * 50% )= 40%
        expect(rate).to.equal("400000");
      });

      it("Return correct rate when 100% utilized", async () => {
        const utilizeRatio = BigNumber.from("1000000"); //100%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, BASE_LIQUIDITY, lockedAmount);

        //when 100% utilized, expection is
        //Base + slope1 + slope2
        //10% + 10% + 40% = 60%
        expect(rate).to.equal("600000");
      });

      it("Return baseRate when _totalLiquidity = 0", async () => {
        const rate = await pm.getCurrentPremiumRate(ZERO_ADDRESS, ZERO, ZERO);

        expect(rate).to.equal(defaultRate);
      });
    });

    describe("getPremium", function () {
      it("Return correct premium only ranged on slope1 (0% to 45%)", async () => {
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(10).mul(9).div(2); //45%
        const term = YEAR;
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("0"); //0%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium
        // = average_rate * amount
        // = (10% + 15%)/2 * (45 * 1e16)
        // = 12.5% * (45 * 1e16)
        // = 5.625 * 1e16
        // = 5625 * 1e13
        expect(premium).to.equal("56250000000000000");
      });

      it("Return correct premium only ranged on slope1 (45% to 90%)", async () => {
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(10).mul(9).div(2); //45%
        const term = YEAR;
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("450000"); //45%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium
        // = average_rate * amount
        // = (15% + 20%)/2 * (45 * 1e16)
        // = 17.5% * 45 * 1e16
        // = 7.875 * 1e16
        // = 7875 * 1e13
        expect(premium).to.equal("78750000000000000");
      });

      it("Return correct premium only ranged on slope2 (90% to 95%)", async () => {
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(20); //5%
        const term = YEAR;
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("900000"); //90%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium
        // = average_rate * amount
        // = (20% + 40%)/2 * (5 * 1e16)
        // = 30% * 5 * 1e16
        // = 1.5 * 1e16
        // = 1500 * 1e13
        expect(premium).to.equal("15000000000000000");
      });

      it("Return correct premium only ranged on slope2 (95% to 100%)", async () => {
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(20); //5%
        const term = YEAR;
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("950000"); //95%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium
        // = average_rate * amount
        // = (40% + 60%)/2 * (5 * 1e16)
        // = 50% * 5 * 1e16
        // = 2.5 * 1e16
        // = 2500 * 1e13
        expect(premium).to.equal("25000000000000000");
      });

      it("Return correct premium ranged on slope1&2 (45% to 95%)", async () => {
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(2); //50%
        const term = YEAR;
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("450000"); //45%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium
        // = test(45% to 90%) + test(90% to 95%)
        // = (7875 + 1500) * 1e13
        expect(premium).to.equal("93750000000000000");
      });

      it("Return correct premium based on term", async () => {
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(2); //50%
        const term = YEAR.div(2);
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("450000"); //45%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium = prior premium * term(year)
        // = 93750000000000000 / 2
        // = 46875000000000000
        expect(premium).to.equal("46875000000000000");
      });

      it("revert when exceed totalLiquidity", async () => {
        const market = ZERO_ADDRESS;
        const amount = BigNumber.from("900001");
        const term = YEAR;
        const totalLiquidity = BigNumber.from("1000000");
        const lockedAmount = BigNumber.from("100000");

        await expect(pm.getPremium(market, amount, term, totalLiquidity, lockedAmount)).to.revertedWith(
          "Amount exceeds total liquidity"
        );
      });
    });

    describe("getPremiumRate", function () {
      it("return correcrt rate based on getPremium", async () => {
        //Use the test "Return correct premium ranged on slope1&2 (45% to 95%)"
        const market = ZERO_ADDRESS;
        const amount = BASE_LIQUIDITY.div(2); //50%
        const term = YEAR;
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("450000"); //45%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const premium = await pm.getPremium(market, amount, term, totalLiquidity, lockedAmount);

        //expected premium
        // = test(45% to 90%) + test(90% to 95%)
        // = (7875 + 1500) * 1e13
        expect(premium).to.equal("93750000000000000");

        const rate = await pm.getPremiumRate(market, amount, totalLiquidity, lockedAmount);
        const expectedRate = premium.mul(MAGIC_SCALE).div(amount);

        await expect(rate).to.equal(expectedRate);
      });
      it("return 0 when amount is 0", async () => {
        const totalLiquidity = BASE_LIQUIDITY;
        const utilizeRatio = BigNumber.from("450000"); //45%
        const lockedAmount = BASE_LIQUIDITY.mul(utilizeRatio).div(MAGIC_SCALE);

        const rate = await pm.getPremiumRate(ZERO_ADDRESS, ZERO, totalLiquidity, lockedAmount);
        await expect(rate).to.equal(ZERO);
      });
      it("retrun 0 when totalLiquidity is 0", async () => {
        expect(await pm.getPremiumRate(ZERO_ADDRESS, ONE, ZERO, ZERO)).to.equal(ZERO);
      });
    });
  });
});
