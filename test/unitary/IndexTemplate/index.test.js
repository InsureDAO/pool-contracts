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
  verifyIndexStatus,
  verifyVaultStatus,
  insure
} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
  long,
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

async function blockTime() {
  let now = (await ethers.provider.getBlock('latest')).timestamp;
  return now
}

async function moveForwardPeriods (days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true
}


describe("Index", function () {

  const approveDeposit = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);
  }

  before('deploy & setup contracts', async()=>{
    //import
    [creator, alice, bob, chad, tom, minter] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const DAI = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const FeeModel = await ethers.getContractFactory("FeeModel");
    const PremiumModel = await ethers.getContractFactory("PremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("Controller");

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
    cdsTemplate = await CDSTemplate.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

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

    await premium.setPremium("2000", "50000");
    await fee.setFee("10000");
    await parameters.setMaxList(ZERO_ADDRESS, "10");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "86400000");
    await parameters.setVault(dai.address, vault.address);

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
    await index.set("1", market2.address, "1000");
    await index.setLeverage("2000");
  })

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
      expect(await index.totalAllocPoint()).to.equal("2000");
      expect(await index.targetLev()).to.equal("2000");
    });
  });

  describe("iToken", function () {
    beforeEach(async () => {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      await dai.connect(chad).approve(vault.address, 10000);

      await index.connect(alice).deposit("10000");
      await index.connect(bob).deposit("10000");
      await index.connect(chad).deposit("10000");
    });

    describe("allowance", function () {
      it("returns no allowance", async function () {
        await verifyAllowance({
          token: index,
          owner: alice.address,
          spender: tom.address,
          expectedAllowance: 0
        })
      });
      it("approve/ increases/ decrease change allowance", async function () {
        await index.connect(alice).approve(tom.address, 5000);

        await verifyAllowance({
          token: index,
          owner: alice.address,
          spender: tom.address,
          expectedAllowance: 5000
        })

        await index.connect(alice).decreaseAllowance(tom.address, "5000");

        await verifyAllowance({
          token: index,
          owner: alice.address,
          spender: tom.address,
          expectedAllowance: 0
        })

        await index.connect(alice).increaseAllowance(tom.address, "10000");

        await verifyAllowance({
          token: index,
          owner: alice.address,
          spender: tom.address,
          expectedAllowance: 10000
        })
      });
    });

    describe("total supply", function () {
      it("returns the total amount of tokens", async function () {
        expect(await index.totalSupply()).to.equal("30000");
      });
    });

    describe("balanceOf", function () {
      context("when the requested account has no tokens", function () {
        it("returns zero", async function () {
          await verifyBalance({
            token: index,
            address: tom.address,
            expectedBalance: 0
          })
        });
      });

      context("when the requested account has some tokens", function () {
        it("returns the total amount of tokens", async function () {
          await verifyBalance({
            token: index,
            address: alice.address,
            expectedBalance: 10000
          })
        });
      });
    });

    describe("transfer", function () {

      //when the recipient is not the zero address
      //when the sender does not have enough balance
      it("reverts", async function () {
        await expect(
          index.connect(alice).transfer(tom.address, "10001")
        ).to.reverted;
      });

      //when the sender has enough balance
      it("transfers the requested amount", async function () {
        await index.connect(alice).transfer(tom.address, "10000");

        await verifyBalances({
          token: index,
          userBalances: {
            [alice.address]: 0,
            [tom.address]: 10000
          }
        })
      });

      it("reverts when the recipient is the zero address", async function () {
        await expect(
          index.connect(tom).transfer(ZERO_ADDRESS, 10000)
        ).to.revertedWith("ERC20: transfer to the zero address");
      });
    });
  });

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {

      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          }
        ]
      })
      

      expect(await index.rate()).to.equal("1000000000000000000");

      await moveForwardPeriods(8);

      await index.connect(alice).withdraw("10000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 0,
        totalLiquidity: 0,
        totalAllocatedCredit: 0,
        leverage: 0,
        withdrawable: 0
      })

    });

    it("DISABLES withdraw more than balance", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await moveForwardPeriods(8);

      await expect(index.connect(alice).withdraw("10001")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
    });

    it("DISABLES withdraw zero balance", async function () {

      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await moveForwardPeriods(8);
      await expect(index.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("DISABLES withdraw until lockup period ends", async function () {

      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );
    });

    it("DISABLES withdraw when liquidity is locked for insurance", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await dai.connect(bob).approve(vault.address, 20000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 365);
      
      await insure({
        pool: market1,
        insurer: bob,
        amount: 9999,
        maxCost: 10000,
        span: YEAR,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      expect(await market1.utilizationRate()).to.equal("99990000");
      expect(await market2.utilizationRate()).to.equal("0");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 12429,
        totalAllocatedCredit: 20000,
        leverage: 1609,
        withdrawable: 2429
      })

      await moveForwardPeriods(8);

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAW_INSUFFICIENT_LIQUIDITY"
      );
    });

    it("accrues premium after deposit", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await dai.connect(bob).approve(vault.address, 20000);

      expect(await index.rate()).to.equal("1000000000000000000");

      await insure({
        pool: market1,
        insurer: bob,
        amount: 9999,
        maxCost: 10000,
        span: YEAR,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 97302
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 12429,
        totalAllocatedCredit: 20000,
        leverage: 1609,
        withdrawable: 2429
      })

      expect(await market1.pendingPremium(index.address)).to.closeTo(
        "2428",
        "5"
      ); //verify

      expect(await index.rate()).to.equal("1242900000000000000");
      //withdrawal also harvest accrued premium
      await moveForwardPeriods(369);

      await market1.unlock("0");
      await index.connect(alice).withdraw("10000");

      //Harvested premium is reflected on their account balance
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 102429
      })
    });

    it("also transfers lockup period when iToken is transferred", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      //Transferring iToken, which also distribute premium
      await index.connect(alice).transfer(tom.address, "10000");
      await index.connect(tom).requestWithdraw("10000");

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );
      await expect(index.connect(tom).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );

      await moveForwardPeriods(8);

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
      await index.connect(tom).withdraw("10000");

      await verifyBalance({
        token: dai,
        address: tom.address,
        expectedBalance: 10000
      })
    });

    it("DISABLE deposit when paused(withdrawal is possible)", async function () {
      
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await index.setPaused(true);

      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await moveForwardPeriods(8);

      await index.connect(alice).withdraw("10000");
      
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100000
      })
      
    });

    it("DISABLE deposit and withdrawal when reporting or payingout", async function () {
      //Can deposit and withdraw in normal time
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await moveForwardPeriods(8);

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
        5000,
        10000,
        incident,
        root,
        long,
        "metadata"
      );

      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_PENDING"
      );

      await moveForwardPeriods(11);

      await market1.resume();
      await index.resume();

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })
      
      await index.connect(alice).withdraw("10000");
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100000
      })
    });

    it("devaluate underlying when cover claim is accepted", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          }
        ]
      })

      await dai.connect(bob).approve(vault.address, 1000);
      await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      
      expect(await dai.balanceOf(bob.address)).to.equal("99941");

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
        5000,
        10000,
        incident,
        root,
        long,
        "metadata"
      );

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10059,
        totalAttributions: 10059,
        underlyingValue: 10000
      })
      
      await verifyVaultStatus({
        vault: vault,
        target: creator.address,
        attributions: 5,
        valueAll: 10059,
        totalAttributions: 10059,
        underlyingValue: 5
      })

      await verifyVaultStatus({
        vault: vault,
        target: market1.address,
        attributions: 54,
        valueAll: 10059,
        totalAttributions: 10059,
        underlyingValue: 54
      })


      expect(await market1.totalLiquidity()).to.closeTo("10000", "1");

      await market1.connect(bob).redeem("0", proof);

      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 5054,
        totalAllocatedCredit: 10108,
        leverage: 2000,
        withdrawable: 5054
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 5054,
        valueAll: 5059,
        totalAttributions: 5059,
        underlyingValue: 5054
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 5054,
            allocatedCreditOf: index.address,
            allocatedCredit: 5054,
            availableBalance: 5054
          },
          {
            pool: market2,
            totalLiquidity: 5054,
            allocatedCreditOf: index.address,
            allocatedCredit: 5054,
            availableBalance: 5054
          }
        ]
      })

      await moveForwardPeriods(11);
      await market1.resume();
      await index.resume();

      await index.connect(alice).withdraw("10000");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95054,
          [bob.address]: 104941
        }
      })

      //Simulation: full payout
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );

      await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      
      incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market1.applyCover(
        "604800",
        10000,
        10000,
        incident,
        root,
        long,
        "metadata"
      );

      await market1.connect(bob).redeem("1", proof);

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 54,
        totalAllocatedCredit: 108,
        leverage: 2000,
        withdrawable: 54
      })
      expect(await index.valueOfUnderlying(alice.address)).to.equal("54");

      await moveForwardPeriods(11);

      await market1.resume();
      await index.resume();

      await index.connect(alice).withdraw("10000");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 85108,
          [bob.address]: 114882
        }
      })
    });
  });

  describe("Index parameter configurations (case un-equal allocation)", function () {
    beforeEach(async () => {
      //Deploy a new pool
      const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
      await factory.createMarket(
        poolTemplate.address,
        "Here is metadata.",
        [1, 0],
        [dai.address, dai.address, registry.address, parameters.address]
      );
      const marketAddress5 = await factory.markets(4);
      market3 = await PoolTemplate.attach(marketAddress5);
    });

    it("allows new pool addition", async function () {
      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //Case1: Add when no liquidity is locked
      //Expected results: Reallocaet liquidity market1: 5000, market2: 5000, market3: 10000
      await index.set("2", market3.address, "2000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 5000,
            allocatedCreditOf: index.address,
            allocatedCredit: 5000,
            availableBalance: 5000
          },
          {
            pool: market2,
            totalLiquidity: 5000,
            allocatedCreditOf: index.address,
            allocatedCredit: 5000,
            availableBalance: 5000
          },
          {
            pool: market3,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          }
        ]
      })


      await index.set("2", market3.address, "0");

      //Case2: Add when liquidity is locked(market1 has locked 50% of index liquidity ) d
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })
      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 0,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
            availableBalance: 0
          }
        ]
      })

      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market1,
        insurer: bob,
        amount: 9999,
        maxCost: 10000,
        span: 86400 * 10,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      expect(await market1.totalLiquidity()).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("1");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10066,
        totalAllocatedCredit: 20000,
        leverage: 1986,
        withdrawable: 66
      })

      await index.set("2", market3.address, "2000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10066,
        totalAllocatedCredit: 20131,
        leverage: 1999,
        withdrawable: 0
      })
      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 9999,
            allocatedCreditOf: index.address,
            allocatedCredit: 9999,
            availableBalance: 0
          },
          {
            pool: market2,
            totalLiquidity: 3377,
            allocatedCreditOf: index.address,
            allocatedCredit: 3377,
            availableBalance: 3377
          },
          {
            pool: market3,
            totalLiquidity: 6755,
            allocatedCreditOf: index.address,
            allocatedCredit: 6755,
            availableBalance: 6755
          }
        ]
      })
    });

    it("allows pool removal", async function () {
      await index.set("2", market3.address, "1000");

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //before remomval
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 19998,
        leverage: 1999,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          },
          {
            pool: market2,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          },
          {
            pool: market3,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          }
        ]
      })


      //after remomval
      await index.set("2", market3.address, "0");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 0,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
            availableBalance: 0
          }
        ]
      })
    });

    it("mimics pool removal if the pool is paused", async function () {
      await index.set("2", market3.address, "1000");

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //before remomval

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 19998,
        leverage: 1999,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          },
          {
            pool: market2,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          },
          {
            pool: market3,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          }
        ]
      })

      //after remomval
      await market3.setPaused(true);
      await index.adjustAlloc();

      expect(await market1.allocatedCredit(index.address)).to.equal("10000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 0,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
            availableBalance: 0
          }
        ]
      })
    });

    it("allows leverage rate increment", async function () {
      await index.set("2", market3.address, "1000");

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //lev 2.0
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 19998,
        leverage: 1999,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          },
          {
            pool: market2,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          },
          {
            pool: market3,
            totalLiquidity: 6666,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
            availableBalance: 6666
          }
        ]
      })


      //Lev3.0
      await index.setLeverage("3000");
      await index.adjustAlloc();

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 30000,
        leverage: 3000,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          }
        ]
      })
    });

    it("allows leverage rate decrement", async function () {
      await index.set("2", market3.address, "1000");

      await index.setLeverage("3000");
      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //Lev3.0
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 30000,
        leverage: 3000,
        withdrawable: 10000
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10000,
        valueAll: 10000,
        totalAttributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 10000
          }
        ]
      })

      //Lev2.0 when liquidity is locked
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 10);
      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market1,
        insurer: bob,
        amount: 9999,
        maxCost: 10000,
        span: 86400 * 10,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10066,
        totalAllocatedCredit: 30000,
        leverage: 2980,
        withdrawable: 66
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
            availableBalance: 1
          }
        ]
      })


      await index.setLeverage("2000"); //deleverage
      await index.adjustAlloc();

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10066,
        totalAllocatedCredit: 20131,
        leverage: 1999,
        withdrawable: 0
      })

      await verifyVaultStatus({
        vault: vault,
        target: index.address,
        attributions: 10066,
        valueAll: 10073,
        totalAttributions: 10073,
        underlyingValue: 10066
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 9999,
            allocatedCreditOf: index.address,
            allocatedCredit: 9999,
            availableBalance: 0
          },
          {
            pool: market2,
            totalLiquidity: 5066,
            allocatedCreditOf: index.address,
            allocatedCredit: 5066,
            availableBalance: 5066
          },
          {
            pool: market3,
            totalLiquidity: 5066,
            allocatedCreditOf: index.address,
            allocatedCredit: 5066,
            availableBalance: 5066
          }
        ]
      })

    });
  });

  describe("Admin functions", function () {
    it("allows changing metadata", async function () {
      expect(await index.metadata()).to.equal("Here is metadata.");
      await index.changeMetadata("new metadata");
      expect(await index.metadata()).to.equal("new metadata");
    });
  });
});
