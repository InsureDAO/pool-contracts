const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalances,
  verifyPoolsStatus,
  verifyPoolsStatusForIndex,
  verifyIndexStatus,
  verifyIndexStatusOf,
  verifyIndexStatusOfPool,
  verifyCDSStatus,
  verifyVaultStatus,
  verifyVaultStatusOf,
} = require("../test-utils");

const {
  ZERO_ADDRESS,
  TEST_ADDRESS,
  NULL_ADDRESS,
  ten_to_the_18,
  INITIAL_DEPOSIT,
  long,
  wrong,
  short,
  YEAR,
  WEEK,
  DAY,
  ZERO,
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
  const depositAmountLarge = BigNumber.from("40000").mul(ten_to_the_18);
  const defaultRate = BigNumber.from("1000000");

  const defaultLeverage = BigNumber.from("1000000");
  let targetLeverage = defaultLeverage.mul(2);

  const governanceFeeRate = BigNumber.from("100000"); //10%
  const RATE_DIVIDER = BigNumber.from("1000000");
  const UTILIZATION_RATE_LENGTH_1E6 = BigNumber.from("1000000");
  const target = ethers.utils.hexZeroPad("0x1", 32);

  const applyCover = async ({
    pool,
    pending,
    targetAddress,
    payoutNumerator,
    payoutDenominator,
    incidentTimestamp,
  }) => {
    const padded1 = ethers.utils.hexZeroPad("0x1", 32);
    const padded2 = ethers.utils.hexZeroPad("0x2", 32);

    const getLeaves = (target) => {
      return [
        { id: padded1, account: target },
        { id: padded1, account: TEST_ADDRESS },
        { id: padded2, account: TEST_ADDRESS },
        { id: padded2, account: NULL_ADDRESS },
        { id: padded1, account: NULL_ADDRESS },
      ];
    };

    //test for pools
    const encoded = (target) => {
      const list = getLeaves(target);

      return list.map(({ id, account }) => {
        return ethers.utils.solidityKeccak256(
          ["bytes32", "address"],
          [id, account]
        );
      });
    };

    const leaves = encoded(targetAddress);
    const tree = await new MerkleTree(leaves, keccak256, { sort: true });
    const root = await tree.getHexRoot();
    const leaf = leaves[0];
    const proof = await tree.getHexProof(leaf);
    //console.log("tree", tree.toString());
    //console.log("proof", leaves, proof, root, leaf);
    //console.log("verify", tree.verify(proof, leaf, root)); // true

    await pool.applyCover(
      pending,
      payoutNumerator,
      payoutDenominator,
      incidentTimestamp,
      root,
      "raw data",
      "metadata"
    );

    return proof;
  };

  before(async () => {
    //import
    [gov, alice, bob, chad, tom, minter] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
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
    vault = await Vault.deploy(
      usdc.address,
      registry.address,
      ZERO_ADDRESS,
      ownership.address
    );

    poolTemplate = await PoolTemplate.deploy();
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
    await factory.approveReference(
      poolTemplate.address,
      2,
      registry.address,
      true
    );
    await factory.approveReference(
      poolTemplate.address,
      3,
      parameters.address,
      true
    );

    await factory.approveReference(
      indexTemplate.address,
      0,
      usdc.address,
      true
    );
    await factory.approveReference(
      indexTemplate.address,
      1,
      registry.address,
      true
    );
    await factory.approveReference(
      indexTemplate.address,
      2,
      parameters.address,
      true
    );

    await factory.approveReference(cdsTemplate.address, 0, usdc.address, true);
    await factory.approveReference(
      cdsTemplate.address,
      1,
      registry.address,
      true
    );
    await factory.approveReference(
      cdsTemplate.address,
      2,
      parameters.address,
      true
    );

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    await parameters.setGrace(ZERO_ADDRESS, WEEK.mul(2));
    await parameters.setLockup(ZERO_ADDRESS, WEEK);
    await parameters.setWithdrawable(ZERO_ADDRESS, WEEK.mul(2));
    await parameters.setMinDate(ZERO_ADDRESS, WEEK);
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setVault(usdc.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");

    console.log(1)

    //create Single Pools
    await usdc.connect(alice).approve(vault.address, INITIAL_DEPOSIT);
    let tx = await factory.connect(alice).createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0, INITIAL_DEPOSIT],
      [
        usdc.address,
        usdc.address,
        registry.address,
        parameters.address,
      ]
    );
    
    let receipt = await tx.wait();

    await usdc.connect(alice).approve(vault.address, INITIAL_DEPOSIT);
    tx = await factory.connect(alice).createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0, INITIAL_DEPOSIT],
      [
        usdc.address,
        usdc.address,
        registry.address,
        parameters.address,
      ]
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

    let markets = await registry.getAllMarkets()

    market1 = await PoolTemplate.attach(markets[0]);
    market2 = await PoolTemplate.attach(markets[1]);
    cds = await CDSTemplate.attach(markets[2]);
    index1 = await IndexTemplate.attach(markets[3]);
    index2 = await IndexTemplate.attach(markets[4]);

    await registry.setCDS(ZERO_ADDRESS, cds.address); //default CDS

    await index1.set("0", "0", market1.address, defaultLeverage); //set market1 to the Index
    await index1.set("1", "0", market2.address, defaultLeverage); //set market2 to the Index

    await index2.set("0", "1", market1.address, defaultLeverage); //set market1 to the Index
    await index2.set("1", "1", market2.address, defaultLeverage); //set market2 to the Index

    await index1.setLeverage(targetLeverage); //2x
    await index2.setLeverage(targetLeverage); //2x

    await parameters.setUpperSlack(ZERO_ADDRESS, "500000"); //leverage+50% (+0.5)
    await parameters.setLowerSlack(ZERO_ADDRESS, "500000"); //leverage-50% (-0.5)
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("registerIndex", function () {
    beforeEach(async () => {
    });
    it("renew index", async function () {
      
    });
  });
});
