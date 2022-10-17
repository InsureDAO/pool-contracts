const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const { verifyIndexInfo, verifyIndexStatus } = require("../test-utils");

const {
  ZERO_ADDRESS,
  TEST_ADDRESS,
  NULL_ADDRESS,
  ten_to_the_18,
  INITIAL_DEPOSIT,
  SmartContractHackingCover,
  long,
  wrong,
  short,
  YEAR,
  WEEK,
  DAY,
  ZERO,
  ONE,
} = require("../constant-utils");

async function snapshot() {
  return network.provider.send("evm_snapshot", []);
}

async function restore(snapshotId) {
  return network.provider.send("evm_revert", [snapshotId]);
}

async function now() {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

async function moveForwardPeriods(days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true;
}

async function setNextBlock(time) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [time.toNumber()]);
}

describe("multiIndex", function () {
  const initialMint = BigNumber.from("100000").mul(ten_to_the_18);

  const depositAmount = BigNumber.from("10000").mul(ten_to_the_18);

  const defaultRate = BigNumber.from("1000000");

  const defaultLeverage = BigNumber.from("1000000");
  let targetLeverage = defaultLeverage.mul(2);

  const governanceFeeRate = BigNumber.from("100000"); //10%

  before(async () => {
    //import
    [gov, alice, bob, chad, tom, minter] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
    IndexTemplate = await ethers.getContractFactory("IndexTemplate");
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");

    //deploy
    ownership = await Ownership.deploy();
    usdc = await USDC.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    premium = await PremiumModel.deploy();
    vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);

    poolTemplate = await MarketTemplate.deploy();
    cdsTemplate = await CDSTemplate.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    //setup
    await usdc.mint(alice.address, initialMint);
    await usdc.mint(bob.address, initialMint);
    await usdc.mint(chad.address, initialMint);

    await usdc.connect(alice).approve(vault.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);
    await usdc.connect(chad).approve(vault.address, initialMint);

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, true, true);
    await factory.approveTemplate(indexTemplate.address, true, false, true);
    await factory.approveTemplate(cdsTemplate.address, true, false, true);

    await factory.setCondition(poolTemplate.address, 0, INITIAL_DEPOSIT); //initial deposit

    await factory.approveReference(poolTemplate.address, 0, usdc.address, true);
    await factory.approveReference(poolTemplate.address, 1, usdc.address, true);
    await factory.approveReference(poolTemplate.address, 2, registry.address, true);
    await factory.approveReference(poolTemplate.address, 3, parameters.address, true);

    await factory.approveReference(indexTemplate.address, 0, usdc.address, true);
    await factory.approveReference(indexTemplate.address, 1, registry.address, true);
    await factory.approveReference(indexTemplate.address, 2, parameters.address, true);

    await factory.approveReference(cdsTemplate.address, 0, usdc.address, true);
    await factory.approveReference(cdsTemplate.address, 1, registry.address, true);
    await factory.approveReference(cdsTemplate.address, 2, parameters.address, true);

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    await parameters.setGrace(ZERO_ADDRESS, WEEK.mul(2));
    await parameters.setLockup(ZERO_ADDRESS, WEEK);
    await parameters.setWithdrawable(ZERO_ADDRESS, WEEK.mul(2));
    await parameters.setMaxDate(ZERO_ADDRESS, YEAR);
    await parameters.setMinDate(ZERO_ADDRESS, WEEK);
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setVault(usdc.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");
    await parameters.setUpperSlack(ZERO_ADDRESS, "500000"); //leverage+50% (+0.5)
    await parameters.setLowerSlack(ZERO_ADDRESS, "500000"); //leverage-50% (-0.5)

    //create Single Pools
    {
      let tx = await factory
        .connect(alice)
        .createMarket(
          poolTemplate.address,
          "Here is metadata.",
          [0, INITIAL_DEPOSIT],
          [usdc.address, usdc.address, registry.address, parameters.address]
        );

      let receipt = await tx.wait();

      tx = await factory
        .connect(alice)
        .createMarket(
          poolTemplate.address,
          "Here is metadata.",
          [0, INITIAL_DEPOSIT],
          [usdc.address, usdc.address, registry.address, parameters.address]
        );
      receipt = await tx.wait();

      tx = await factory
        .connect(alice)
        .createMarket(
          poolTemplate.address,
          "Here is metadata.",
          [0, INITIAL_DEPOSIT],
          [usdc.address, usdc.address, registry.address, parameters.address]
        );
      receipt = await tx.wait();

      tx = await factory
        .connect(alice)
        .createMarket(
          poolTemplate.address,
          "Here is metadata.",
          [0, INITIAL_DEPOSIT],
          [usdc.address, usdc.address, registry.address, parameters.address]
        );
      receipt = await tx.wait();

      tx = await factory
        .connect(alice)
        .createMarket(
          poolTemplate.address,
          "Here is metadata.",
          [0, INITIAL_DEPOSIT],
          [usdc.address, usdc.address, registry.address, parameters.address]
        );
      receipt = await tx.wait();

      //create CDS
      tx = await factory.createMarket(
        cdsTemplate.address,
        "Here is metadata.",
        [],
        [usdc.address, registry.address, parameters.address]
      );

      //create Index
      tx = await factory.createMarket(
        indexTemplate.address,
        "Here is metadata.",
        [],
        [usdc.address, registry.address, parameters.address]
      );

      //create Index
      tx = await factory.createMarket(
        indexTemplate.address,
        "Here is metadata.",
        [],
        [usdc.address, registry.address, parameters.address]
      );
      receipt = await tx.wait();

      //create Index
      tx = await factory.createMarket(
        indexTemplate.address,
        "Here is metadata.",
        [],
        [usdc.address, registry.address, parameters.address]
      );
      receipt = await tx.wait();
    }

    //attach markets
    let markets = await registry.getAllMarkets();
    market1 = await MarketTemplate.attach(markets[0]);
    market2 = await MarketTemplate.attach(markets[1]);
    market3 = await MarketTemplate.attach(markets[2]);
    market4 = await MarketTemplate.attach(markets[3]);
    market5 = await MarketTemplate.attach(markets[4]);
    cds = await CDSTemplate.attach(markets[5]);
    index1 = await IndexTemplate.attach(markets[6]);
    index2 = await IndexTemplate.attach(markets[7]);
    index3 = await IndexTemplate.attach(markets[8]);
    await registry.setCDS(ZERO_ADDRESS, cds.address); //default CDS

    //index1 setup
    await index1.setLeverage(targetLeverage); //2x

    //index2 setup
    await index2.setLeverage(targetLeverage); //2x

    /**
     * A. add new pool (latest indexA, new pool)
     */
    console.log("----- test cases for test() -----");
    console.log("A. add new pool");
    console.log("B. update allocPoint");
    console.log("C. remove pool");
    console.log("D. overwrite pool");

    console.log("---------------------------------");
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("A. add new pool", function () {
    it("A", async function () {
      //set 1st pool
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);

      //check
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("A (index => 2pool)", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("1", market2.address, ten_to_the_18);

      //check
      expect((await index1.getAllPools()).length).equal(2);

      expect(await index1.poolList(0)).equal(market1.address);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      expect(await index1.poolList(1)).equal(market2.address);
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("A (index => 3pool)", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("1", market2.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("2", market3.address, ten_to_the_18);

      //check
      expect((await index1.getAllPools()).length).equal(3);

      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.poolList(1)).equal(market2.address);
      expect(await index1.poolList(2)).equal(market3.address);

      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("A (2index => pool)", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index2["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);

      //check
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      expect((await index2.getAllPools()).length).equal(1);
      expect(await index2.poolList(0)).equal(market1.address);
      await verifyIndexInfo({
        pool: market1,
        index: index2.address,
        credit: 0,
        rewardDebt: 0,
        slot: 2,
      });
    });

    it("A (3index => pool)", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index2["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index3["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);

      //check
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      expect((await market1.getIndicies()).length).equal(3);

      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      await verifyIndexInfo({
        pool: market1,
        index: index2.address,
        credit: 0,
        rewardDebt: 0,
        slot: 2,
      });

      await verifyIndexInfo({
        pool: market1,
        index: index3.address,
        credit: 0,
        rewardDebt: 0,
        slot: 3,
      });
    });
  });

  describe("index => pool", function () {
    beforeEach(async () => {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);

      //check index
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18);

      //check market
      expect(await index1.allocPoints(market1.address)).equal(ten_to_the_18);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("B", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ZERO);

      //check index
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.allocPoints(market1.address)).equal(ZERO);

      //check market
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("C", async function () {
      await index1["set(uint256,address,uint256)"]("0", ZERO_ADDRESS, ZERO);

      //check
      expect((await index1.getAllPools()).length).equal(0);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });
    });

    it("D", async function () {
      await index1["set(uint256,address,uint256)"]("0", market2.address, ten_to_the_18);

      //check index
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market2.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18);

      //check old market
      expect(await index1.allocPoints(market1.address)).equal(ZERO);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });

      //check new market
      expect(await index1.allocPoints(market2.address)).equal(ten_to_the_18);
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });
  });

  describe("index => pool w/ credits", function () {
    beforeEach(async () => {
      await index1.connect(alice).deposit(depositAmount); //10000 * 1e18

      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);

      //check index
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18);

      //check market
      expect(await index1.allocPoints(market1.address)).equal(ten_to_the_18);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: depositAmount.mul(2),
        rewardDebt: 0,
        slot: 1,
      });

      await verifyIndexStatus({
        index: index1,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        totalAllocatedCredit: depositAmount.mul(2),
        totalAllocPoint: ten_to_the_18,
        targetLev: targetLeverage,
        leverage: targetLeverage,
        withdrawable: depositAmount,
        rate: defaultRate,
      });
    });

    it("B", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ZERO); //[market1: 0]

      //check index
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.allocPoints(market1.address)).equal(ZERO);

      await verifyIndexStatus({
        index: index1,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        totalAllocatedCredit: 0,
        totalAllocPoint: 0,
        targetLev: targetLeverage,
        leverage: 0,
        withdrawable: depositAmount,
        rate: defaultRate,
      });

      //check market
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0, //credits withdrawn
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("C", async function () {
      await index1["set(uint256,address,uint256)"]("0", ZERO_ADDRESS, ZERO); //[address(0): ]

      //check
      expect((await index1.getAllPools()).length).equal(0);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });
    });
  });

  describe("index => 2pool", function () {
    beforeEach(async () => {
      //prepare
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("1", market2.address, ten_to_the_18);

      //check index
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.poolList(1)).equal(market2.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));

      //check market
      expect(await index1.allocPoints(market1.address)).equal(ten_to_the_18);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("B", async function () {
      //update 1st market
      await index1["set(uint256,address,uint256)"]("0", market1.address, ZERO);

      //check index
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18);
      expect(await index1.allocPoints(market1.address)).equal(ZERO);

      //check market
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      //update 2nd market
      await index1["set(uint256,address,uint256)"]("1", market2.address, ZERO);

      //check index
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(1)).equal(market2.address);
      expect(await index1.totalAllocPoint()).equal(ZERO);
      expect(await index1.allocPoints(market2.address)).equal(ZERO);

      //check market
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("C", async function () {
      //execute
      await index1["set(uint256,address,uint256)"]("0", ZERO_ADDRESS, ZERO);

      //check
      expect((await index1.getAllPools()).length).equal(1);
      expect(await index1.poolList(0)).equal(market2.address);

      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });

      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("D", async function () {
      await index1["set(uint256,address,uint256)"]("0", market3.address, ONE);
      //check index
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market2.address);
      expect(await index1.poolList(1)).equal(market3.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.add(ONE));

      //check old market
      expect(await index1.allocPoints(market1.address)).equal(ZERO);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });

      //check new market
      expect(await index1.allocPoints(market3.address)).equal(ONE);
      await verifyIndexInfo({
        pool: market3,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      //no change on market2
      expect(await index1.allocPoints(market2.address)).equal(ten_to_the_18);
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("D2", async function () {
      await index1["set(uint256,address,uint256)"]("1", market3.address, ONE);
      //check index
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.poolList(1)).equal(market3.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.add(ONE));

      //check old market
      expect(await index1.allocPoints(market1.address)).equal(ten_to_the_18);
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      expect(await index1.allocPoints(market2.address)).equal(ZERO);
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });

      expect(await index1.allocPoints(market3.address)).equal(ONE);
      await verifyIndexInfo({
        pool: market3,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });
  });

  describe("index => 3pool", function () {
    beforeEach(async () => {
      //prepare
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("1", market2.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("2", market3.address, ten_to_the_18);

      /**
       * - index1
       * poolList [market1, market2, market3]
       *
       * - market1
       * indexList [index1]
       *
       * - market2
       * indexList [index1]
       *
       * - market3
       * indexList [index1]
       */
    });

    it("B", async function () {
      //update 1st market
      await index1["set(uint256,address,uint256)"]("0", market1.address, ZERO);

      //check index
      expect((await index1.getAllPools()).length).equal(3);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));
      expect(await index1.allocPoints(market1.address)).equal(ZERO);

      //check market
      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      //update 2nd market with different function
      await index1["set(uint256,uint256)"]("1", ZERO);

      //check index
      expect((await index1.getAllPools()).length).equal(3);
      expect(await index1.poolList(1)).equal(market2.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18);
      expect(await index1.allocPoints(market2.address)).equal(ZERO);

      //check market
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("B2", async function () {
      //update 2nd market
      await index1["set(uint256,uint256)"]("1", ZERO);

      //check index
      expect((await index1.getAllPools()).length).equal(3);
      expect(await index1.poolList(1)).equal(market2.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));
      expect(await index1.allocPoints(market2.address)).equal(ZERO);

      //check market
      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("C", async function () {
      //execute
      await index1["set(uint256,address,uint256)"]("0", ZERO_ADDRESS, ZERO);

      /**
       * - index1
       * poolList [market3, market2]
       *
       * - market1
       * indexList []
       *
       * - market2
       * indexList [index1]
       *
       * - market3
       * indexList [index1]
       */

      //check
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market3.address);
      expect(await index1.poolList(1)).equal(market2.address);

      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));
      expect(await index1.allocPoints(market1.address)).equal(ZERO);

      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });

      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      await verifyIndexInfo({
        pool: market3,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("C2", async function () {
      //execute
      await index1["set(uint256,address,uint256)"]("1", ZERO_ADDRESS, ZERO);

      /**
       * - index1
       * poolList [market1, market3]
       *
       * - market1
       * indexList [index1]
       *
       * - market2
       * indexList []
       *
       * - market3
       * indexList [index1]
       */

      //check
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.poolList(1)).equal(market3.address);

      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));
      expect(await index1.allocPoints(market2.address)).equal(ZERO);

      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });

      await verifyIndexInfo({
        pool: market3,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });
    });

    it("C3", async function () {
      //execute
      await index1["set(uint256,address,uint256)"]("2", ZERO_ADDRESS, ZERO);

      /**
       * - index1
       * poolList [market1, market2]
       *
       * - market1
       * indexList [index1]
       *
       * - market2
       * indexList [index1]
       *
       * - market3
       * indexList []
       */

      //check
      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.poolList(1)).equal(market2.address);

      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));
      expect(await index1.allocPoints(market3.address)).equal(ZERO);

      await verifyIndexInfo({
        pool: market1,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      await verifyIndexInfo({
        pool: market2,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 1,
      });

      await verifyIndexInfo({
        pool: market3,
        index: index1.address,
        credit: 0,
        rewardDebt: 0,
        slot: 0,
      });
    });
  });

  describe("scenario test", function () {
    it("Perform complex", async function () {
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("1", market2.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("2", market3.address, ten_to_the_18); //[1,2,3]
      await index1["set(uint256,address,uint256)"]("1", market4.address, ten_to_the_18); //[1,3,4]
      await index1["set(uint256,address,uint256)"]("1", market5.address, ten_to_the_18); //[1,4,5]
      await index1["set(uint256,address,uint256)"]("1", ZERO_ADDRESS, ten_to_the_18); //[1,5]

      expect((await index1.getAllPools()).length).equal(2);
      expect(await index1.poolList(0)).equal(market1.address);
      expect(await index1.poolList(1)).equal(market5.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(2));

      await index1["set(uint256,address,uint256)"]("2", market3.address, ten_to_the_18); //[1,5,3]
      await index1["set(uint256,address,uint256)"]("3", market4.address, ten_to_the_18); //[1,5,3,4]
      await index1["set(uint256,address,uint256)"]("0", market2.address, ten_to_the_18); //[4,5,3,2]

      expect((await index1.getAllPools()).length).equal(4);
      expect(await index1.poolList(0)).equal(market4.address);
      expect(await index1.poolList(1)).equal(market5.address);
      expect(await index1.poolList(2)).equal(market3.address);
      expect(await index1.poolList(3)).equal(market2.address);
      expect(await index1.totalAllocPoint()).equal(ten_to_the_18.mul(4));
    });
  });

  describe("scenario test w/ credits", function () {
    it("Perform complex", async function () {
      await index1.connect(alice).deposit(depositAmount); //10000 * 1e18

      //simple add/remove/overwrite markets
      await index1["set(uint256,address,uint256)"]("0", market1.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("1", market2.address, ten_to_the_18);
      await index1["set(uint256,address,uint256)"]("2", market3.address, ten_to_the_18); //[1,2,3]

      await index1["set(uint256,address,uint256)"]("1", market4.address, ten_to_the_18); //[1,3,4]
      await index1["set(uint256,address,uint256)"]("1", market5.address, ten_to_the_18); //[1,4,5]
      await index1["set(uint256,address,uint256)"]("1", ZERO_ADDRESS, ten_to_the_18); //[1,5]

      await index1["set(uint256,address,uint256)"]("2", market3.address, ten_to_the_18); //[1,5,3]
      await index1["set(uint256,address,uint256)"]("3", market4.address, ten_to_the_18); //[1,5,3,4]
      await index1["set(uint256,address,uint256)"]("0", market2.address, ten_to_the_18); //[4,5,3,2]

      {
        await verifyIndexInfo({
          pool: market4,
          index: index1.address,
          credit: depositAmount.mul(2).div(4),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market5,
          index: index1.address,
          credit: depositAmount.mul(2).div(4),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market3,
          index: index1.address,
          credit: depositAmount.mul(2).div(4),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market2,
          index: index1.address,
          credit: depositAmount.mul(2).div(4),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market1,
          index: index1.address,
          credit: 0,
          rewardDebt: 0,
          slot: 0,
        });
      }

      //change allocPoint
      await index1["set(uint256,address,uint256)"]("0", ZERO_ADDRESS, ten_to_the_18); //[2,5,3]
      await index1["set(uint256,address,uint256)"]("1", market5.address, ZERO); //[2,5,3]

      {
        await verifyIndexInfo({
          pool: market2,
          index: index1.address,
          credit: depositAmount.mul(2).div(2),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market5,
          index: index1.address,
          credit: ZERO,
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market3,
          index: index1.address,
          credit: depositAmount.mul(2).div(2),
          rewardDebt: 0,
          slot: 1,
        });
      }

      await index1["set(uint256,address,uint256)"]("2", market4.address, ZERO); //[2,5,4]
      {
        await verifyIndexInfo({
          pool: market2,
          index: index1.address,
          credit: depositAmount.mul(2),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market5,
          index: index1.address,
          credit: ZERO,
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market4,
          index: index1.address,
          credit: 0,
          rewardDebt: 0,
          slot: 1,
        });
      }
      await index1["set(uint256,uint256)"]("2", ten_to_the_18); //[2,5,4]
      {
        await verifyIndexInfo({
          pool: market2,
          index: index1.address,
          credit: depositAmount.mul(2).div(2),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market5,
          index: index1.address,
          credit: ZERO,
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market4,
          index: index1.address,
          credit: depositAmount.mul(2).div(2),
          rewardDebt: 0,
          slot: 1,
        });
      }

      await index1["set(uint256,address,uint256)"]("0", market3.address, ten_to_the_18); //[4,5,3]

      {
        await verifyIndexInfo({
          pool: market4,
          index: index1.address,
          credit: depositAmount.mul(2).div(2),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market5,
          index: index1.address,
          credit: ZERO,
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market3,
          index: index1.address,
          credit: depositAmount.mul(2).div(2),
          rewardDebt: 0,
          slot: 1,
        });
      }

      await index1["set(uint256,uint256)"]("1", ten_to_the_18); //[4,5,3]

      {
        expect((await index1.getAllPools()).length).equal(3);
        expect(await index1.poolList(0)).equal(market4.address);
        expect(await index1.poolList(1)).equal(market5.address);
        expect(await index1.poolList(2)).equal(market3.address);

        expect(await index1.allocPoints(market1.address)).equal(ZERO);
        expect(await index1.allocPoints(market2.address)).equal(ZERO);
        expect(await index1.allocPoints(market3.address)).equal(ten_to_the_18);
        expect(await index1.allocPoints(market4.address)).equal(ten_to_the_18);
        expect(await index1.allocPoints(market5.address)).equal(ten_to_the_18);

        await verifyIndexInfo({
          pool: market4,
          index: index1.address,
          credit: depositAmount.mul(2).div(3),
          rewardDebt: 0,
          slot: 1,
        });

        await verifyIndexInfo({
          pool: market5,
          index: index1.address,
          credit: depositAmount.mul(2).div(3),
          rewardDebt: 0,
          slot: 1,
        });
        await verifyIndexInfo({
          pool: market3,
          index: index1.address,
          credit: depositAmount.mul(2).div(3),
          rewardDebt: 0,
          slot: 1,
        });
      }
    });
  });
});
