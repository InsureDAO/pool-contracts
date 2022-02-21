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

const {
  ZERO_ADDRESS,
  TEST_ADDRESS,
  NULL_ADDRESS,
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

async function moveForwardPeriods(days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true;
}

async function now() {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

describe("Pool", function () {
  const initialMint = BigNumber.from("100000"); //initial token amount for users

  const depositAmount = BigNumber.from("10000"); //default deposit amount for test
  const depositAmountLarge = BigNumber.from("40000"); //default deposit amount (large) for test
  const defaultRate = BigNumber.from("1000000"); //initial rate between USDC and LP token
  const insureAmount = BigNumber.from("10000"); //default insure amount for test
  const loss = BigNumber.from("1000000");

  const governanceFeeRate = BigNumber.from("100000"); //10% of the Premium
  const RATE_DIVIDER = BigNumber.from("1000000"); //1e6
  const UTILIZATION_RATE_LENGTH_1E6 = BigNumber.from("1000000"); //1e6
  const padded1 = ethers.utils.hexZeroPad("0x1", 32);

  const insure = async({pool, insurer, amount, maxCost, span, target, insured, agent}) => {
    let tx = await pool.connect(insurer).insure(amount, maxCost, span, target, insured, agent );
    premiumAmount = (await tx.wait()).events[2].args["premium"];

    return premiumAmount
  } 

  const applyCover = async ({
    pool,
    pending,
    targetAddress,
    payoutNumerator,
    payoutDenominator,
    incidentTimestamp,
    lossAmount
  }) => {
    const padded1 = ethers.utils.hexZeroPad("0x1", 32);
    const padded2 = ethers.utils.hexZeroPad("0x2", 32);
    const _loss = lossAmount

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

      return list.map(({ id, account, loss }) => {
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
    [gov, alice, bob, chad, tom] = await ethers.getSigners();
    accounts = [gov, alice, bob, chad, tom];

    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("ControllerMock");

    //deploy
    ownership = await Ownership.deploy();
    usdc = await USDC.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(usdc.address, ownership.address);
    vault = await Vault.deploy(
      usdc.address,
      registry.address,
      controller.address,
      ownership.address
    );
    poolTemplate = await PoolTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    //set up
    await usdc.mint(gov.address, initialMint);
    await usdc.mint(chad.address, initialMint);
    await usdc.mint(bob.address, initialMint);
    await usdc.mint(alice.address, initialMint);
    await usdc.mint(tom.address, initialMint);

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
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
    await factory.approveReference(poolTemplate.address, 4, ZERO_ADDRESS, true); //everyone can be initialDepositor

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMinDate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "2592000");
    await parameters.setVault(usdc.address, vault.address);

    let tx = await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0, 0], //deposit 0 USDC
      [
        usdc.address,
        usdc.address,
        registry.address,
        parameters.address,
      ]
    );
    let receipt = await tx.wait();
    const marketAddress = receipt.events[2].args[0];
    market = await PoolTemplate.attach(marketAddress);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("PoolTemplate", function () {
    describe("metadata", function () {
      it("should return correct metadata", async () => {
        expect(await market.name()).to.equal("InsureDAO DAI Insurance LP");
        expect(await market.symbol()).to.equal("iDAI");
      })
    });
    describe("insure", function () {
      beforeEach(async () => {
        await usdc.connect(alice).approve(vault.address, initialMint)
        await market.connect(alice).deposit(initialMint)

        await usdc.connect(bob).approve(vault.address, initialMint)
      });

      it("insure for someone else", async () => {
        await insure({
          pool: market,
          insurer: bob,
          amount: insureAmount,
          maxCost: insureAmount,
          span: WEEK,
          target: padded1,
          insured: chad.address,
          agent: bob.address
        })

        expect((await market.insurances(0)).insured).to.equal(chad.address)
        expect((await market.insurances(0)).agent).to.equal(bob.address)
      });
    });

    describe("redeem", function () {
      beforeEach(async () => {
        await usdc.connect(alice).approve(vault.address, initialMint)
        await market.connect(alice).deposit(initialMint)

        await usdc.connect(bob).approve(vault.address, initialMint)
        await insure({
          pool: market,
          insurer: bob,
          amount: insureAmount,
          maxCost: insureAmount,
          span: WEEK,
          target: padded1,
          insured: chad.address,
          agent: tom.address
        })

        let incident = await now();
        proof = await applyCover({
          pool: market,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 10000,
          payoutDenominator: 10000,
          incidentTimestamp: incident,
          lossAmount: loss
        });
      });

      it("can redeem for myself", async () => {
        let current = await usdc.balanceOf(chad.address)
  
        await market.connect(chad).redeem(0, loss, proof);

        expect(await usdc.balanceOf(chad.address)).to.equal(current.add(insureAmount))
      });

      it("agent can redeem", async () => {
        let current = await usdc.balanceOf(chad.address)
  
        await market.connect(tom).redeem(0, loss, proof);

        expect(await usdc.balanceOf(chad.address)).to.equal(current.add(insureAmount))
      });

      it("revert when not holder nor agent redeem", async () => {
        await expect(market.connect(bob).redeem(0, loss, proof)).to.revertedWith("ERROR: NOT_YOUR_INSURANCE")       
      });
    });
    describe("redeem2", function () {
      beforeEach(async () => {
        await usdc.connect(alice).approve(vault.address, initialMint)
        await market.connect(alice).deposit(initialMint)

        await usdc.connect(bob).approve(vault.address, initialMint)
        await insure({
          pool: market,
          insurer: bob,
          amount: insureAmount,
          maxCost: insureAmount,
          span: WEEK,
          target: padded1,
          insured: chad.address,
          agent: tom.address
        })
      });

      it("redeem amount capped at loss", async () => {
        let smallLoss = insureAmount.div(2)
        let incident = await now();

        proof = await applyCover({
          pool: market,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 10000,
          payoutDenominator: 10000,
          incidentTimestamp: incident,
          lossAmount: smallLoss
        });

        let current = await usdc.balanceOf(chad.address)
  
        await market.connect(chad).redeem(0, smallLoss, proof);

        expect(await usdc.balanceOf(chad.address)).to.equal(current.add(smallLoss))
      });

      it("loss has effect of partial payment", async () => {
        let smallLoss = insureAmount.div(2)
        let incident = await now();

        proof = await applyCover({
          pool: market,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 5000, 
          payoutDenominator: 10000, //50%
          incidentTimestamp: incident,
          lossAmount: smallLoss
        });

        let current = await usdc.balanceOf(chad.address)
  
        await market.connect(chad).redeem(0, smallLoss, proof);

        expect(await usdc.balanceOf(chad.address)).to.equal(current.add(smallLoss.div(2)))
      });

      it("only loss has effect of partial payment", async () => {
        let smallLoss = insureAmount.div(2)
        let incident = await now();

        proof = await applyCover({
          pool: market,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 5000, 
          payoutDenominator: 10000, //50%
          incidentTimestamp: incident,
          lossAmount: loss
        });

        let current = await usdc.balanceOf(chad.address)
  
        await market.connect(chad).redeem(0, loss, proof);

        expect(await usdc.balanceOf(chad.address)).to.equal(current.add(insureAmount))
      });

      it("revert when loss input differ than the merkle tree", async () => {
        let smallLoss = insureAmount.div(2)
        let incident = await now();

        proof = await applyCover({
          pool: market,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 5000, 
          payoutDenominator: 10000, //50%
          incidentTimestamp: incident,
          lossAmount: smallLoss
        });
  
        await expect(market.connect(chad).redeem(0, loss, proof)).to.revertedWith("ERROR: INSURANCE_EXEMPTED");
      });
    });

    describe("applyBounty", function () {
      beforeEach(async () => {
        await usdc.connect(alice).approve(vault.address, initialMint)
        await market.connect(alice).deposit(initialMint)

        await usdc.connect(bob).approve(vault.address, initialMint)
        premiumAmount = await insure({
          pool: market,
          insurer: bob,
          amount: insureAmount,
          maxCost: insureAmount,
          span: WEEK,
          target: padded1,
          insured: chad.address,
          agent: tom.address
        })
         
        govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER);
        income = premiumAmount.sub(govFee);
      });

      it("suucessflly payout for bounty", async () => {
        await verifyPoolsStatus({
          pools: [
            {
              pool: market,
              totalSupply: initialMint,
              totalLiquidity: initialMint.add(income),
              availableBalance: initialMint.add(income).sub(insureAmount),
              rate: defaultRate.mul(initialMint.add(income)).div(initialMint),
              utilizationRate: defaultRate.mul(insureAmount).div(initialMint.add(income)),
              allInsuranceCount: 1,
            }
          ]
        });
        
        //transfer Bounty & unlock policies
        let payout = initialMint.div(2)

        expect((await market.insurances(0)).status).to.equal(true)
        expect(await usdc.balanceOf(tom.address)).to.equal(initialMint)
        
        await market.applyBounty(payout, tom.address, [0])

        expect((await market.insurances(0)).status).to.equal(false)
        expect(await usdc.balanceOf(tom.address)).to.equal(initialMint.add(payout))

        //check debt
        await verifyVaultStatusOf({
          vault: vault,
          target: market.address,
          attributions: initialMint.add(income).sub(payout),
          underlyingValue: initialMint.add(income).sub(payout),
          debt: ZERO
        })

        //unlock liquidity
        await verifyPoolsStatus({
          pools: [
            {
              pool: market,
              totalSupply: initialMint,
              totalLiquidity: initialMint.add(income).sub(payout),
              availableBalance: initialMint.add(income).sub(payout),
              rate: defaultRate.mul(initialMint.add(income).sub(payout)).div(initialMint),
              utilizationRate: ZERO,
              allInsuranceCount: 1,
            }
          ]
        });


      });

      it("revert when market is paused", async () => {
        await market.setPaused(true)

        let payout = initialMint.div(2)
        await expect(market.applyBounty(payout, tom.address, [0])).to.revertedWith("ERROR: MARKET_IS_PAUSED")
      });

      it("revert when market is in Payout", async () => {
        await applyCover({
          pool: market,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 10000,
          payoutDenominator: 10000,
          incidentTimestamp: await now(),
          lossAmount: loss
        });

        let payout = initialMint.div(2)
        await expect(market.applyBounty(payout, tom.address, [0])).to.revertedWith("ERROR: NOT_TRADING_STATUS")
      });
    });
  });
});
