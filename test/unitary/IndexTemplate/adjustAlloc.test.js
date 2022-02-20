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

describe("Index", function () {
  const initialMint = BigNumber.from("100000");
  const loss = BigNumber.from("1000000");

  const depositAmount = BigNumber.from("10000");
  const depositAmountLarge = BigNumber.from("40000");
  const defaultRate = BigNumber.from("1000000");

  const defaultLeverage = BigNumber.from("1000000");
  let targetLeverage = defaultLeverage.mul(2);

  const defaultAllocPoint = BigNumber.from("1000000");

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
    const _loss = BigNumber.from("1000000");

    const getLeaves = (target) => {
      return [
        { id: padded1, account: target, loss: _loss },
        { id: padded1, account: TEST_ADDRESS, loss: _loss },
        { id: padded2, account: TEST_ADDRESS, loss: _loss },
        { id: padded2, account: NULL_ADDRESS, loss: _loss },
        { id: padded1, account: NULL_ADDRESS, loss: _loss },
      ];
    };

    //test for pools
    const encoded = (target) => {
      const list = getLeaves(target);

      return list.map(({ id, account, loss}) => {
        return ethers.utils.solidityKeccak256(
          ["bytes32", "address", "uint256"],
          [id, account, loss]
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
    const Controller = await ethers.getContractFactory("ControllerMock");

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
    controller = await Controller.deploy(usdc.address, ownership.address);

    //setup
    await usdc.mint(alice.address, initialMint);
    await usdc.mint(bob.address, initialMint);
    await usdc.mint(chad.address, initialMint);

    await usdc.connect(alice).approve(vault.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);
    await usdc.connect(chad).approve(vault.address, initialMint);

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true); //allow duplicate for test
    await factory.approveTemplate(indexTemplate.address, true, false, true);
    await factory.approveTemplate(cdsTemplate.address, true, false, true);

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
    await parameters.setGrace(ZERO_ADDRESS, DAY.mul("3"));
    await parameters.setLockup(ZERO_ADDRESS, WEEK);
    await parameters.setWithdrawable(ZERO_ADDRESS, WEEK.mul(2));
    await parameters.setMinDate(ZERO_ADDRESS, WEEK);
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setVault(usdc.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");

    //create Single Pools
    for(let i=0; i<5; i++){
      await factory.createMarket(
        poolTemplate.address,
        "Here is metadata.",
        [0, 0],
        [
          usdc.address,
          usdc.address,
          registry.address,
          parameters.address,
        ]
      );
    }

    //create CDS
    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      [],
      [usdc.address, registry.address, parameters.address]
    );

    //create Index
    await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      [],
      [usdc.address, registry.address, parameters.address]
    );


    let markets = await registry.getAllMarkets()
    market1 = await PoolTemplate.attach(markets[0]);
    market2 = await PoolTemplate.attach(markets[1]);
    market3 = await PoolTemplate.attach(markets[2]);
    market4 = await PoolTemplate.attach(markets[3]);
    market5 = await PoolTemplate.attach(markets[4]);
    cds = await CDSTemplate.attach(markets[5]);
    index = await IndexTemplate.attach(markets[6]);

    await registry.setCDS(ZERO_ADDRESS, cds.address); //default CDS

    await controller.setVault(vault.address)
    await vault.setController(controller.address)
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("adjustAlloc", function () {
    beforeEach(async () => {
      await index.set("0", "0", market1.address, defaultAllocPoint); //set market1 to the Index
      await index.set("1", "0", market2.address, defaultAllocPoint); //set market2 to the Index
      await index.set("2", "0", market3.address, defaultAllocPoint); //set market2 to the Index

      await index.setLeverage(targetLeverage); //2x
    });

    it("only 3rd loop. increase credits", async function () {
      await index.connect(alice).deposit(depositAmount)

      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });

      //sanity check before
      await verifyPoolsStatusForIndex({
        pools: [
          {
            pool: market1,
            indexAddress: index.address,
            allocatedCredit: depositAmount.mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.mul(2).div(3),
            pendingPremium: ZERO,
          },
        ],
      });

        
      //increase of undering value
      await controller.earn(gov.address, depositAmount) //gov.address has no meaning. mint usdc to controller

      //successfully increase index's liquidity
      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: depositAmount,
        underlyingValue: depositAmount.add(depositAmount),
        debt: ZERO,
      });

      //test
      await index.adjustAlloc()


      //sanity check after
      await verifyPoolsStatusForIndex({
        pools: [
          {
            pool: market1,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).mul(2).div(3),
            pendingPremium: ZERO,
          },
        ],
      });
    });

    it("only 3rd loop. decrease credits", async function () {
      //increase liquidity
      await index.connect(alice).deposit(depositAmount)
      await controller.earn(gov.address, depositAmount)
      await index.adjustAlloc()

      await verifyPoolsStatusForIndex({
        pools: [
          {
            pool: market1,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).mul(2).div(3),
            pendingPremium: ZERO,
          },
        ],
      });

      //decrease liquidity
      await controller.migrate(tom.address)

      //test
      await index.adjustAlloc()

      await verifyPoolsStatusForIndex({
        pools: [
          {
            pool: market1,
            indexAddress: index.address,
            allocatedCredit: depositAmount.mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.mul(2).div(3),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.mul(2).div(3),
            pendingPremium: ZERO,
          },
        ],
      });
      
    });

    it("when one of the pool is over utilized, other pool have less credits to meet the target leverage", async function () {
      await index.connect(alice).deposit(depositAmount)
      await controller.earn(gov.address, depositAmount)
      await index.setLeverage(targetLeverage.div(2).mul(3)); //3x

      //sanity check before
      await verifyPoolsStatusForIndex({
        pools: [
          {
            pool: market1,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount),
            pendingPremium: ZERO,
          },
        ],
      });

      //lock credits
      let tx = await market1.connect(chad).insure(
        depositAmount.add(depositAmount), //insured amount
        depositAmount.add(depositAmount), //max-cost
        YEAR, //span
        target, //targetID
        chad.address,
        chad.address
      );
      console.log("insured!")

      let premiumAmount = (await tx.wait()).events[2].args["premium"];
      let govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER);
      let income = premiumAmount.sub(govFee);

      await index.adjustAlloc() //rewardPerCredit has issue when there is earning by controller.
      //await index.adjustAlloc() //second adjustAlloc can make it right.

      //sanity check
      await verifyPoolsStatusForIndex({
        pools: [
          {
            pool: market1,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).add(income),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).add(income),
            pendingPremium: ZERO,
          },
          {
            pool: market2,
            indexAddress: index.address,
            allocatedCredit: depositAmount.add(depositAmount).add(income),
            pendingPremium: ZERO,
          },
        ],
      });


      //decrease liquidity
      //await controller.migrate(tom.address)

      //expect(await index.totalLiquidity()).equal(depositAmount.add(income))


      //test when one of the pool is over utilized
      //await index.adjustAlloc()
      //await index.adjustAlloc()

      

      
      
    });

    it("only 1st loop. only Payout", async function () {
      
    });

    it.skip("only 1st loop. only paused", async function () {
      // write test here
    });

    it.skip("only 1st loop. Payout and paused", async function () {
      // write test here
    });

    it.skip("1st and 3rd loops. Payout, paused, and normal pools", async function () {
      // write test here
    });

    it.skip("All 1st, 2nd, and 3rd loops. use all branch together", async function () {
      // write test here
    });
  });
});
