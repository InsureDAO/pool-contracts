const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalances,
  verifyAllowance,
  verifyPoolsStatus,
  verifyPoolsStatusOf,
  verifyValueOfUnderlying,
  verifyIndexStatus,
  verifyVaultStatus,
  verifyVaultStatusOf,
  verifyRate,
  insure
} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
  long,
  wrong,
  short,
  YEAR,
  WEEK,
  DAY
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

describe("Pool", function () {
  const approveDeposit = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);
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
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const FeeModel = await ethers.getContractFactory("FeeModel");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("ControllerMock");

    //deploy
    ownership = await Ownership.deploy();
    dai = await DAI.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    fee = await FeeModel.deploy(ownership.address);
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(dai.address, ownership.address);
    vault = await Vault.deploy(
      dai.address,
      registry.address,
      controller.address,
      ownership.address
    );
    poolTemplate = await PoolTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    //set up
    await dai.mint(chad.address, (100000).toString());
    await dai.mint(bob.address, (100000).toString());
    await dai.mint(alice.address, (100000).toString());

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
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

    //set default parameters
    await fee.setFee("10000"); //10%
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "2592000");
    await parameters.setVault(dai.address, vault.address);

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [1, 0],
      [dai.address, dai.address, registry.address, parameters.address]
    );
    const marketAddress = await factory.markets(0);
    market = await PoolTemplate.attach(marketAddress);
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
      expect(poolTemplate.address).to.exist;
      expect(parameters.address).to.exist;
      expect(vault.address).to.exist;
      expect(market.address).to.exist;
    });
  });

  describe("Initialize", function () {
    it("", async () => {
    });
  });

  describe("Initialize", function () {
    it("", async () => {
    });
  });

  describe("deposit", function () {
    it("", async () => {
    });
  });

  describe("withdraw", function () {
    it("", async () => {
    });
  });

  describe("unlockBatch", function () {
    it("", async () => {
    });
  });

  describe("unlock", function () {
    it("", async () => {
    });
  });

  /***  Only testable with index
  describe("allocateCredit", function () {
    it("", async () => {
    });
  });
  describe("withdrawCredit", function () {
    it("", async () => {
    });
  });
  */

  describe("insure", function () {
    it("", async () => {
    });
  });

  describe("redeem", function () {
    it("", async () => {
    });
  });

  describe("transferInsurance", function () {
    it("", async () => {
    });
  });

  describe("applyCover", function () {
    it("", async () => {
    });
  });

  describe("resume", function () {
    it("", async () => {
    });
  });

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market,
            allocatedCreditOf: alice.address,
            allocatedCredit: 0,
          }
        ]
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: market.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      expect(await market.rate()).to.equal(BigNumber.from(10).pow(18));

      await moveForwardPeriods(8)
      await market.connect(alice).withdraw("10000");

      expect(await market.totalSupply()).to.equal("0");
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })
    });

    it("DISABLES withdraw when not requested", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await moveForwardPeriods(8)
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
      );
    });

    it("DISABLES withdraw more than requested", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      expect(await market.totalSupply()).to.equal("10000");
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await moveForwardPeriods(8)
      await expect(market.connect(alice).withdraw("100000")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
      await market.connect(alice).withdraw("5000");

      expect(await market.totalSupply()).to.equal("5000");
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 5000,
            availableBalance: 5000
          }
        ]
      })
    });

    it("DISABLES withdraw if withdrawable span ended", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await moveForwardPeriods(40)
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
      );
    });

    it("DISABLES withdraw request more than balance", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })
      
      await expect(
        market.connect(alice).requestWithdraw("100000")
      ).to.revertedWith("ERROR: REQUEST_EXCEED_BALANCE");
    });

    it("DISABLES withdraw zero balance", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await moveForwardPeriods(8)
      await expect(market.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("DISABLES withdraw when liquidity is locked for insurance", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 10,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await moveForwardPeriods(8)

      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAW_INSUFFICIENT_LIQUIDITY"
      );
    });

    it("allows unlock liquidity only after an insurance period over", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await moveForwardPeriods(8)

      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await moveForwardPeriods(12)
      await market.unlock("0");

      await verifyVaultStatusOf({
        vault: vault,
        target: market.address,
        attributions: 10900,
        underlyingValue: 10900
      })
      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: 100,
        underlyingValue: 100
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: 11000,
        totalAttributions: 11000,
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 10900,
            availableBalance: 10900
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market,
            allocatedCreditOf: alice.address,
            allocatedCredit: 0,
          }
        ]
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 90000,
        }
      })
      

      await market.connect(alice).withdraw("10000");

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market,
            allocatedCreditOf: alice.address,
            allocatedCredit: 0,
          }
        ]
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 100900,
        }
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: 100,
        totalAttributions: 100,
      })
    });

    it("also decrease withdrawal request when transefered", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await moveForwardPeriods(8)

      await market.connect(alice).transfer(tom.address, 5000);
      await expect(market.connect(alice).withdraw("5001")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
      await market.connect(alice).withdraw("5000");
    });

    it("accrues premium after deposit", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      expect(await market.rate()).to.equal(BigNumber.from(10).pow(18));

      //apply protection by Bob
      await dai.connect(bob).approve(vault.address, 20000);
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 365,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      //Alice should have accrued premium paid by Bob
      await verifyBalances({
        token: dai,
        userBalances: {
          [bob.address]: 99000,
        }
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: alice.address,
        valueOfUnderlying: 10900
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 10900,
            availableBalance: 900
          }
        ]
      })

      await verifyRate({
        template: market,
        rate: "1090000000000000000"
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: 100,
        underlyingValue: 100
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: 11000,
        totalAttributions: 11000,
      })


      //additional deposit by Chad, which does not grant any right to withdraw premium before deposit
      await approveDeposit({
        token: dai,
        target: market,
        depositer: chad,
        amount: 10000
      })

      await verifyBalances({
        token: market,
        userBalances: {
          [chad.address]: 9174,
        }
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: chad.address,
        valueOfUnderlying: 9999
      })


      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 20900,
            availableBalance: 10900
          }
        ]
      })

      //the premium paid second time should be allocated to both Alice and Chad
      //but the premium paid first time should be directly go to Alice
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 365,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [bob.address]: 98000,
        }
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: alice.address,
        valueOfUnderlying: 11369
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: chad.address,
        valueOfUnderlying: 10430
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 21800,
            availableBalance: 1800
          }
        ]
      })

      //withdrawal also harvest accrued premium
      await moveForwardPeriods(369)

      await market.connect(alice).requestWithdraw("10000");
      await market.unlockBatch(["0", "1"]);

      await moveForwardPeriods(8)

      await market.connect(alice).withdraw("10000");
      //Harvested premium is reflected on their account balance

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 101368,
          [chad.address]: 90000,
        }
      })
    });

    it("DISABLE deposit when paused(withdrawal is possible)", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      expect(await market.totalSupply()).to.equal("10000");
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await market.setPaused(true);

      await dai.connect(alice).approve(vault.address, 20000);
      await expect(market.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await moveForwardPeriods(8)

      await verifyRate({
        template: market,
        rate: "1000000000000000000"
      })

      await market.connect(alice).withdraw("10000");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 100000
        }
      })
    });

    it("DISABLE deposit and withdrawal when payingout", async function () {
      //Can deposit and withdraw in normal time
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await moveForwardPeriods(8)
      await market.connect(alice).withdraw("10000");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 100000
        }
      })
      //Cannot deposit and withdraw when payingout

      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })
      await market.connect(alice).requestWithdraw("10000");

      let incident = (await now()).sub(DAY.mul(2));  

      await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await expect(market.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_PENDING"
      );

      await moveForwardPeriods(11)
      await market.resume();

      await verifyRate({
        template: market,
        rate: "1000000000000000000"
      })

      await market.connect(alice).withdraw("10000");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 100000
        }
      })
    });

    it("devaluate underlying but premium is not affected when cover claim is accepted", async function () {
      //Simulation: partial payout
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await dai.connect(bob).approve(vault.address, 10000);

      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [bob.address]: 99000
        }
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: 100,
        underlyingValue: 100
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: market.address,
        attributions: 10900,
        underlyingValue: 10900
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await market.connect(bob).redeem("0", proof);
      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: alice.address,
        valueOfUnderlying: 5900
      })
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 5900,
            availableBalance: 5900
          }
        ]
      })
      await moveForwardPeriods(11)
      await market.resume();

      await market.connect(alice).withdraw("10000");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95900,
          [bob.address]: 104000
        }
      })

      //Simulation: full payout
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })
      expect(await market.totalSupply()).to.equal("10000");
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: 1000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      incident = await now()
      proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await market.connect(bob).redeem("1", proof);

      expect(await market.totalSupply()).to.equal("10000");
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLiquidity: 9090,
            availableBalance: 9090
          }
        ]
      })

      expect(await market.valueOfUnderlying(alice.address)).to.equal("9090");
      await moveForwardPeriods(11)
      await market.resume();
      await market.connect(alice).withdraw("10000");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 94990,
          [bob.address]: 104900
        }
      })
    });
  });

  describe("Getting insured", function () {
    it("allows protection", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      let tx = await market.connect(bob).redeem("0", proof);
      let receipt = await tx.wait()

      expect(receipt.events[1].args.amount).to.equal("10000"); //amount that bob has bought
      expect(receipt.events[1].args.payout).to.equal("5000"); //payout to bob
      

      await moveForwardPeriods(12)
      await market.resume();

      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await market.connect(alice).withdraw("10000");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95900,
          [bob.address]: 104000
        }
      })
    });

    it("allows insurance transfer", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await market.connect(bob).transferInsurance("0", tom.address);
      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await market.connect(tom).redeem("0", proof);
      await moveForwardPeriods(11)
      await market.resume();
      await market.connect(alice).withdraw("10000");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95900,
          [tom.address]: 5000
        }
      })
    });
    it("DISALLOWS redemption when insurance is not a target", async function () {
      await dai.connect(bob).approve(vault.address, 10000);
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })


      await insure({
        pool: market,
        insurer: bob,
        amount: 9999,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await moveForwardPeriods(12)

      await market.resume();
      await expect(market.connect(bob).redeem("0", proof)).to.revertedWith(
        "ERROR: NO_APPLICABLE_INCIDENT"
      );
      await market.unlock("0");
      await market.connect(alice).withdraw("10000");
      
      await verifyBalances({
        token: dai,
        userBalances: {

          [alice.address]: 100900
        }
      })
    });
    it("DISALLOWS getting insured when there is not enough liquidity", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 100
      })

      await expect(
        market
          .connect(bob)
          .insure(
            "10000",
            "10000",
            86400 * 8,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_EXCEEDED_AVAILABLE_BALANCE");


      await moveForwardPeriods(8)
      await market.connect(alice).withdraw("100");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 100000
        }
      })
    });

    it("DISALLOWS redemption when redemption period is over", async function () {
      await dai.connect(bob).approve(vault.address, 10000);
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: 10000
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await moveForwardPeriods(12)

      await market.resume();

      await expect(market.connect(bob).redeem("0", proof)).to.revertedWith(
        "ERROR: NO_APPLICABLE_INCIDENT"
      );
      await market.unlock("0");
      await market.connect(alice).withdraw("10000");
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 100900
        }
      })
    });

    it("DISALLOWS getting insured when paused, reporting, or payingout", async function () {
      //Can get insured in normal time
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 40000
      })
      await market.connect(alice).requestWithdraw("10000");

      await dai.connect(bob).approve(vault.address, 20000);
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      //Cannot get insured when payingout
      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await expect(
        market
          .connect(bob)
          .insure(
            "10000",
            "10000",
            86400 * 5,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_SPAN_BELOW_MIN");

      await moveForwardPeriods(11)

      await market.resume();

      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      //Cannot get insured when paused
      await market.setPaused(true);
      await expect(
        market
          .connect(bob)
          .insure(
            "10000",
            "10000",
            86400 * 8,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_MARKET_PAUSED");
      await market.setPaused(false);

      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
    });

    it("DISALLOWS more than 365 days insurance", async function () {
      //Can get insured in normal time
      await dai.connect(bob).approve(vault.address, 20000);
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 40000
      })
      await market.connect(alice).requestWithdraw("10000");

      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 365,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      //Cannot get insured for more than 365 days
      await expect(
        market
          .connect(bob)
          .insure(
            "10000",
            "10000",
            86400 * 400,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_EXCEEDED_MAX_SPAN");
    });

    it("DISALLOWS insurance transfer if its expired or non existent", async function () {
      await dai.connect(bob).approve(vault.address, 10000);

      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 40000
      })
      await market.connect(alice).requestWithdraw("10000");

      //when expired
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      await moveForwardPeriods(9)
      await expect(
        market.connect(bob).transferInsurance("0", tom.address)
      ).to.revertedWith("ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS");

      //when already redeemed
      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await market.connect(bob).redeem("1", proof);
      await expect(
        market.connect(bob).transferInsurance("1", tom.address)
      ).to.revertedWith("ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS");
    });
  });

  describe("Utilities", function () {
    it("retunrs accurate data", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: 40000
      })

      await dai.connect(bob).approve(vault.address, 10000);
      await dai.connect(chad).approve(vault.address, 10000);

      await market.connect(alice).requestWithdraw("10000");
      expect(await market.utilizationRate()).to.equal("0");

      await insure({
        pool: market,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 365,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await insure({
        pool: market,
        insurer: chad,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 365,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      
      expect(await market.allInsuranceCount()).to.equal("2");
      expect(await market.getInsuranceCount(bob.address)).to.equal("1");
      expect(await market.getInsuranceCount(chad.address)).to.equal("1");
      expect(await market.utilizationRate()).to.equal("47846889");
    });
  });
});
