const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalance,
  verifyBalances,
  verifyAllowance,
  verifyPoolsStatus,
  verifyPoolsStatus_legacy,
  verifyPoolsStatusForIndex,
  verifyPoolsStatusForIndex_legacy,
  verifyIndexStatus,
  verifyCDSStatus_legacy,
  verifyVaultStatus_legacy,
  verifyVaultStatusOf_legacy,
} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
  long,
  short,
  YEAR,
  WEEK,
  DAY,
  ZERO
} = require('../constant-utils');

async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
}

async function moveForwardPeriods (days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true
}

async function now () {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

describe.skip("CDS", function () {
  const initialMint = BigNumber.from("100000"); //initial token amount for users
  const depositAmount = BigNumber.from("10000"); //default deposit amount for test
  const defaultRate = BigNumber.from("1000000000000000000"); //initial rate between USDC and LP token
  const insureAmount = BigNumber.from("10000"); //default insure amount for test

  const defaultLeverage = BigNumber.from("1000");
  let leverage = BigNumber.from("20000");

  const governanceFeeRate = BigNumber.from("10000"); //10% of the Premium
  const RATE_DIVIDER = BigNumber.from("100000"); //1e5
  const UTILIZATION_RATE_LENGTH_1E8 = BigNumber.from("100000000"); //1e8

  const approveDeposit = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);
  }

  const insure = async ({pool, insurer, amount, maxCost, span, target}) => {
    await dai.connect(insurer).approve(vault.address, maxCost)
    let tx = await pool.connect(insurer).insure(amount, maxCost, span, target);

    let receipt = await tx.wait()
    let premium = receipt.events[2].args['premium']

    //return value
    return premium
  }

  const applyCover = async ({pool, pending, payoutNumerator, payoutDenominator, incidentTimestamp}) => {

    const tree = await new MerkleTree(short, keccak256, {
      hashLeaves: true,
      sortPairs: true,
    });

    const root = await tree.getHexRoot();
    const leaf = keccak256(short[0]);
    const proof = await tree.getHexProof(leaf);

    await pool.applyCover(
      pending,
      payoutNumerator,
      payoutDenominator,
      incidentTimestamp,
      root,
      short,
      "metadata"
    );

    return proof
  }

  before(async () => {
    //import
    [creator, alice, bob, chad, tom] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const DAI = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("ControllerMock");
    const Minter = await ethers.getContractFactory("MinterMock");
    //deploy

    ownership = await Ownership.deploy();
    dai = await DAI.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(dai.address, ownership.address);
    vault = await Vault.deploy(
      dai.address,
      registry.address,
      controller.address,
      ownership.address
    );

    poolTemplate = await PoolTemplate.deploy();
    cdsTemplate = await CDSTemplate.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);
    minter = await Minter.deploy();


    //set up
    await dai.mint(chad.address, (100000).toString());
    await dai.mint(bob.address, (100000).toString());
    await dai.mint(alice.address, (100000).toString());

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
    await factory.approveTemplate(indexTemplate.address, true, false, true);
    await factory.approveTemplate(cdsTemplate.address, true, false, true);

    await factory.approveReference(poolTemplate.address, 0, dai.address, true);
    await factory.approveReference(poolTemplate.address, 1, dai.address, true);
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
      2,
      parameters.address,
      true
    );
    await factory.approveReference(indexTemplate.address, 0, dai.address, true);
    await factory.approveReference(
      indexTemplate.address,
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
    await factory.approveReference(cdsTemplate.address, 0, dai.address, true);
    await factory.approveReference(
      cdsTemplate.address,
      1,
      registry.address,
      true
    );

    await parameters.setFeeRate(ZERO_ADDRESS, "10000");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMinDate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "86400000");
    await parameters.setVault(dai.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");
    await parameters.setMinter(minter.address);

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [1, 0],
      [dai.address, dai.address, registry.address, parameters.address]
    );
    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [1, 0],
      [dai.address, dai.address, registry.address, parameters.address]
    );
    const marketAddress1 = await factory.markets(0);
    const marketAddress2 = await factory.markets(1);
    market1 = await PoolTemplate.attach(marketAddress1);
    market2 = await PoolTemplate.attach(marketAddress2);

    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      [0],
      [dai.address, registry.address, parameters.address]
    );
    await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      [0],
      [dai.address, registry.address, parameters.address]
    );
    const marketAddress3 = await factory.markets(2);
    const marketAddress4 = await factory.markets(3);
    cds = await CDSTemplate.attach(marketAddress3);
    index = await IndexTemplate.attach(marketAddress4);

    await registry.setCDS(ZERO_ADDRESS, cds.address);


    await index.set("0", market1.address, "1000");
    await index.setLeverage("20000");
  });

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)
  })

  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(dai.address).to.exist;
      expect(factory.address).to.exist;
      expect(parameters.address).to.exist;
      expect(vault.address).to.exist;
      expect(market1.address).to.exist;
      expect(market2.address).to.exist;
      expect(index.address).to.exist;
      expect(cds.address).to.exist;
      expect(await index.totalAllocPoint()).to.equal("1000");
      expect(await index.targetLev()).to.equal("20000");
    });
  });

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })

      await cds.connect(alice).requestWithdraw(depositAmount);

      expect(await cds.totalSupply()).to.equal(depositAmount);
      expect(await cds.totalLiquidity()).to.equal(depositAmount);

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: cds.address,
        attributions: depositAmount,
        underlyingValue: depositAmount
      })

      await moveForwardPeriods(8)

      const withdrawAmount = BigNumber.from("9900");

      await cds.connect(alice).withdraw(withdrawAmount);

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: depositAmount.sub(withdrawAmount),
        totalAttributions: depositAmount.sub(withdrawAmount)
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: cds.address,
        attributions: depositAmount.sub(withdrawAmount),
        underlyingValue: depositAmount.sub(withdrawAmount)
      })
    });

    it("DISABLES withdraw more than balance", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })
      await cds.connect(alice).requestWithdraw(depositAmount);

      await moveForwardPeriods(8)

      await expect(cds.connect(alice).withdraw(depositAmount.add(1))).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
    });

    it("DISABLES withdraw zero balance", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })
      await cds.connect(alice).requestWithdraw(depositAmount);

      await moveForwardPeriods(8)
      await expect(cds.connect(alice).withdraw(ZERO)).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("DISABLES withdraw until lockup period ends", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })
      await cds.connect(alice).requestWithdraw(depositAmount);

      await expect(cds.connect(alice).withdraw(depositAmount)).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );
    });

    it("accrues premium after deposit", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })
      await cds.connect(alice).requestWithdraw(depositAmount);

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        rate: defaultRate
      })

      await approveDeposit({
        token: dai,
        target: index,
        depositer: bob,
        amount: depositAmount
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        rate: defaultRate
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: depositAmount.mul(2),
        totalAttributions: depositAmount.mul(2),
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: creator.address,
        attributions: ZERO,
        underlyingValue: ZERO
      })

      //withdrawal also harvest accrued premium
      await moveForwardPeriods(10)

      await cds.connect(alice).withdraw(depositAmount);

      //Harvested premium is reflected on their account balance
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: initialMint
      })
    });

    it("DISABLE deposit when locked(withdrawal is possible)", async function () {

      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })

      await cds.connect(alice).requestWithdraw(depositAmount);

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        rate: defaultRate
      })

      await cds.setPaused(true);


      await dai.connect(alice).approve(vault.address, depositAmount);
      await expect(cds.connect(alice).deposit(depositAmount)).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
    });

    it("devaluate underlying when cover claim is accepted", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: depositAmount
      })
      await cds.connect(alice).requestWithdraw(depositAmount);

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: depositAmount
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        totalAllocatedCredit: depositAmount.mul(leverage).div(defaultLeverage),
        leverage: leverage,
        withdrawable: depositAmount,
        rate: defaultRate
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLP: ZERO,
            totalLiquidity: depositAmount.mul(leverage).div(defaultLeverage), //all deposited amount 
            availableBalance: depositAmount.mul(leverage).div(defaultLeverage), //all amount - locked amount = available amount
            rate: ZERO,
            utilizationRate: ZERO,
            allInsuranceCount: ZERO
          }
        ]
      })

      await verifyPoolsStatusForIndex_legacy({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: depositAmount.mul(leverage).div(defaultLeverage),
          }
        ]
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        rate: defaultRate
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: market1.address,
        attributions: ZERO,
        underlyingValue: ZERO
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: depositAmount,
        underlyingValue: depositAmount
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: cds.address,
        attributions: depositAmount,
        underlyingValue: depositAmount
      })

      let premium = await insure({
        pool: market1,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      let govFee = premium.mul(governanceFeeRate).div(RATE_DIVIDER)
      let fee = premium.sub(govFee)

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: initialMint.sub(premium)
      })

      let payoutNumerator = 5000;
      let payoutDenominator = 10000
      let incident = await now();

      let proof = await applyCover({
        pool: market1,
        pending: 604800,
        payoutNumerator: payoutNumerator,
        payoutDenominator: payoutDenominator,
        incidentTimestamp: incident
      })

      await market1.connect(bob).redeem("0", proof);
      let redeemed_amount = insureAmount.mul(payoutNumerator).div(payoutDenominator)

      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: initialMint.sub(premium).add(redeemed_amount)
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount.add(fee),
        totalAllocatedCredit: depositAmount.mul(leverage).div(defaultLeverage),
        leverage: depositAmount.mul(leverage).div(depositAmount.add(fee)),
        withdrawable: depositAmount.add(fee),
        rate: defaultRate.mul(depositAmount.add(fee)).div(depositAmount)
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: depositAmount.mul(leverage).div(defaultLeverage),
            availableBalance: depositAmount.mul(leverage).div(defaultLeverage)
          }
        ]
      })

      await verifyPoolsStatusForIndex_legacy({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: depositAmount.mul(leverage).div(defaultLeverage),
          }
        ]
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        rate: defaultRate
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: depositAmount,
        underlyingValue: depositAmount
      })

      await moveForwardPeriods(11)
      await market1.resume();

      let amount = depositAmount.sub(redeemed_amount).add(fee)
      //leverage = amount.mul(leverage).div(amount.add(fee))

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount,
        totalLiquidity: amount,
        totalAllocatedCredit: amount.mul(leverage).div(defaultLeverage),
        leverage: amount.mul(leverage).div(amount),
        withdrawable: amount,
        rate: defaultRate.mul(amount).div(depositAmount)
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: amount.mul(leverage).div(defaultLeverage),
            availableBalance: amount.mul(leverage).div(defaultLeverage)
          }
        ]
      })

      await verifyPoolsStatusForIndex_legacy({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: amount.mul(leverage).div(defaultLeverage),
          }
        ]
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount,
        rate: defaultRate
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: amount,
        underlyingValue: amount
      })

      await cds.connect(alice).withdraw(depositAmount);

      await verifyBalances({
        token: dai,
        userBalances: {
          [bob.address]: 104474
        }
      })
    });

    it("CDS compensate insolvent amount within Index", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 1000
      })
      await cds.connect(alice).requestWithdraw("990");

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: 990,
        totalLiquidity: 990,
        rate: "1000000000000000000"
      })

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 1000
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: 990,
        totalLiquidity: 1010,
        rate: "1020202020202020202"
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 970,
        totalLiquidity: 970,
        totalAllocatedCredit: 19400,
        leverage: 20000,
        withdrawable: 970,
        rate: "1000000000000000000"
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 19400,
            availableBalance: 19400
          }
        ]
      })

      await verifyPoolsStatusForIndex_legacy({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 19400,
          }
        ]
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: 990,
        totalLiquidity: 1010,
        rate: "1020202020202020202"
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: market1.address,
        attributions: 0,
        underlyingValue: 0
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 970,
        underlyingValue: 970
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: cds.address,
        attributions: 1010,
        underlyingValue: 1010
      })

      await dai.connect(bob).approve(vault.address, 10000);


      await market1
        .connect(bob)
        .insure(
          "9000",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );

      expect(await dai.balanceOf(bob.address)).to.closeTo("99974", "2");

      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      const tree = await new MerkleTree(long, keccak256, {
        hashLeaves: true,
        sortPairs: true,
      });
      const root = await tree.getHexRoot();
      const leaf = keccak256(long[0]);
      const proof = await tree.getHexProof(leaf);
      await market1.applyCover(
        "604800",
        10000,
        10000,
        incident,
        root,
        long,
        "metadata"
      );


      await market1.connect(bob).redeem("0", proof);
      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 108974
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 970,
        totalLiquidity: 0,
        totalAllocatedCredit: 0,
        leverage: 0,
        withdrawable: 0,
        rate: 0
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusForIndex_legacy({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })

      await verifyCDSStatus_legacy({
        cds: cds,
        totalSupply: 990,
        totalLiquidity: 0,
        rate: "0"
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 0,
        underlyingValue: 0
      })

      await moveForwardPeriods(11)
      await market1.resume();
      
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 98000,
        }
      })
    });
  });

});