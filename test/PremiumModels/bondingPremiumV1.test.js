const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("test BondingPremium", () => {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const YEAR = BigNumber.from("86400").mul(365);

  const ten_to_the_18 = BigNumber.from("1000000000000000000");
  const ten_to_the_6 = BigNumber.from("1000000");
  const ten_to_the_5 = BigNumber.from("100000");

  //sqrt
  const ONE = ethers.BigNumber.from(1);
  const TWO = ethers.BigNumber.from(2);

  async function sqrt(value) {
    x = value;
    let z = x.add(ONE).div(TWO);
    let y = x;
    while (z.sub(y).isNegative()) {
      y = z;
      z = x.div(z).add(z).div(TWO);
    }
    return y;
  }

  beforeEach(async () => {
    [creator, alice] = await ethers.getSigners();

    const BondignPremium = await ethers.getContractFactory("BondingPremiumV1");

    premium = await BondignPremium.deploy();
  });

  describe("Condition", function () {
    it("contract should be deployed", async () => {
      await expect(premium.address).to.exist;
    });

    it("check parameters", async () => {
      //initial values
      let b = BigNumber.from("30000");
      let k = BigNumber.from("300100000");
      let a = BigNumber.from("300");
      let low_risk_b = BigNumber.from("5000");
      let low_risk_liquidity = BigNumber.from("1000000000000"); //1e12 (1e6 * 1e6) = 1M USDC
      let low_risk_util = BigNumber.from("150000");

      expect(await premium.k()).to.equal(k);
      expect(await premium.b()).to.equal(b);
      expect(await premium.a()).to.equal(a);
      expect(await premium.low_risk_b()).to.equal(low_risk_b);
      expect(await premium.low_risk_liquidity()).to.equal(low_risk_liquidity);
      expect(await premium.low_risk_util()).to.equal(low_risk_util);
    });
  });

  describe("test setPremium", function () {
    it("setPremium correctly", async () => {
      let b = BigNumber.from("500012"); //arbitrary
      let k = BigNumber.from("302927736472"); //arbitrary
      let a = ten_to_the_6
        .add(await sqrt(ten_to_the_6.mul(ten_to_the_6).add(k.mul(4))))
        .div(2)
        .sub(ten_to_the_6);

      await premium.setPremium(b, k);

      expect(await premium.k()).to.equal(k);
      expect(await premium.b()).to.equal(b);
      expect(await premium.a()).to.equal(a);
    });

    it("revert setPremium", async () => {
      let b = BigNumber.from("500012"); //arbitrary
      let k = BigNumber.from("302927736472"); //arbitrary

      await expect(premium.connect(alice).setPremium(b, k)).to.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("test setOptions", function () {
    it("setOptions correctly", async () => {
      //initial value
      let low_risk_b = BigNumber.from("5000");
      let low_risk_liquidity = BigNumber.from("1000000000000");
      let low_risk_util = BigNumber.from("150000");

      expect(await premium.low_risk_b()).to.equal(low_risk_b);
      expect(await premium.low_risk_liquidity()).to.equal(low_risk_liquidity);
      expect(await premium.low_risk_util()).to.equal(low_risk_util);

      //new value
      low_risk_b = BigNumber.from("2030");
      low_risk_liquidity = BigNumber.from("102544520000000");
      low_risk_util = BigNumber.from("121400");

      await premium.setOptions(
        low_risk_liquidity,
        low_risk_b,
        low_risk_util,
        0
      );

      expect(await premium.low_risk_b()).to.equal(low_risk_b);
      expect(await premium.low_risk_liquidity()).to.equal(low_risk_liquidity);
      expect(await premium.low_risk_util()).to.equal(low_risk_util);
    });

    it("revert setOptions", async () => {
      //new value
      low_risk_b = BigNumber.from("4000030");

      await expect(premium.setOptions(0, low_risk_b, 0, 0)).to.revertedWith(
        "low_risk_base_fee must lower than base_fee"
      );
      await expect(
        premium.connect(alice).setOptions(0, 0, 0, 0)
      ).to.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("test getPremiumRate", function () {
    it("getPremiumRate correctlly", async () => {
      let total = BigNumber.from("1000000").mul(ten_to_the_18);
      let locked_amount = BigNumber.from("771863").mul(ten_to_the_18); //77.1863% utilized

      let p_amount = await premium.getPremiumRate(total, locked_amount);

      await expect(p_amount).to.equal(BigNumber.from("40000")); //40.000%
    });
  });

  describe("test getPremium", function () {
    it("getPremium correctlly", async () => {
      let total = BigNumber.from("1000000").mul(ten_to_the_18);
      let locked_amount = BigNumber.from("771863").mul(ten_to_the_18); //77.1863% utilized
      let amount = BigNumber.from("1").mul(ten_to_the_18); //amount to buy
      let length = YEAR;

      let p_amount = await premium.getPremium(
        amount,
        length,
        total,
        locked_amount
      );

      await expect(p_amount).to.equal(BigNumber.from("400000000000000000")); //40.000% of 1 token
    });

    it("low risk getPremium correctlly", async () => {
      //parameters
      let b = BigNumber.from("30000");
      let k = BigNumber.from("300100000");
      let a = BigNumber.from("300");
      let low_risk_b = BigNumber.from("5000");

      //input
      let total = BigNumber.from("1000000").mul(ten_to_the_18);
      let locked_amount = BigNumber.from("100000").mul(ten_to_the_18); //10% utilized
      let amount = BigNumber.from("1").mul(ten_to_the_18); //amount to buy
      let length = YEAR;

      //getPremium
      let p_amount = await premium.getPremium(
        amount,
        length,
        total,
        locked_amount
      );

      //expection
      let util = locked_amount
        .add(amount)
        .add(locked_amount)
        .mul(ten_to_the_6)
        .div(total)
        .div(2);
      let Q = ten_to_the_6.sub(util).add(a);
      let _premiumRate = k
        .mul(365)
        .sub(Q.mul(a).mul(365))
        .add(Q.mul(low_risk_b))
        .div(Q).div(10);
      let expected = amount
        .mul(_premiumRate)
        .mul(length)
        .div(YEAR)
        .div(ten_to_the_5);

      console.log(expected.mul(100000).div(amount).toNumber()); //17.16% => 9.9977 utilized% in desmos(https://www.desmos.com/calculator/qcvsko1opq)
      await expect(p_amount).to.equal(BigNumber.from(expected));
    });

    it("lgetPremium return 0", async () => {
      //parameters
      let b = BigNumber.from("30000");
      let k = BigNumber.from("300100000");
      let a = BigNumber.from("300");
      let low_risk_b = BigNumber.from("5000");

      //input
      let total = BigNumber.from("1000000").mul(ten_to_the_18);
      let locked_amount = BigNumber.from("100000").mul(ten_to_the_18); //10% utilized
      let amount = BigNumber.from("0"); //amount to buy
      let length = YEAR;

      //getPremium
      let p_amount = await premium.getPremium(
        amount,
        length,
        total,
        locked_amount
      );

      //expection
      let expected = BigNumber.from("0");

      await expect(p_amount).to.equal(BigNumber.from(expected));
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
