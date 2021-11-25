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
  verifyPoolsStatusOf,
  verifyIndexStatus,
  verifyCDSStatus,
  verifyVaultStatus,
  verifyVaultStatusOf,
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

async function moveForwardPeriods (days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true
}

describe("CDS", function () {

  const approveDeposit = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);
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
    const FeeModel = await ethers.getContractFactory("FeeModel");
    const PremiumModel = await ethers.getContractFactory("PremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("ControllerMock");
    const Minter = await ethers.getContractFactory("MinterMock");
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

    await premium.setPremium("2000", "50000");
    await fee.setFee("10000");
    await parameters.setCDSPremium(ZERO_ADDRESS, "2000");
    await parameters.setDepositFee(ZERO_ADDRESS, "1000");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
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
  describe("iToken", function () {
    beforeEach(async () => {

      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })

      await approveDeposit({
        token: dai,
        target: cds,
        depositer: bob,
        amount: 10000
      })

      await approveDeposit({
        token: dai,
        target: cds,
        depositer: chad,
        amount: 10000
      })
    });

    describe("allowance", function () {
      it("returns no allowance", async function () {
        expect(await cds.allowance(alice.address, tom.address)).to.equal("0");
      });
      it("approve/ increases/ decrease change allowance", async function () {
        await cds.connect(alice).approve(tom.address, 5000);
        expect(await cds.allowance(alice.address, tom.address)).to.equal(
          "5000"
        );
        await cds.connect(alice).decreaseAllowance(tom.address, "5000");
        expect(await cds.allowance(alice.address, tom.address)).to.equal("0");
        await cds.connect(alice).increaseAllowance(tom.address, "10000");
        expect(await cds.allowance(alice.address, tom.address)).to.equal(
          "10000"
        );
      });
    });

    describe("total supply", function () {
      it("returns the total amount of tokens", async function () {
        expect(await cds.totalSupply()).to.equal("29700");
      });
    });

    describe("balanceOf", function () {
      context("when the requested account has no tokens", function () {
        it("returns zero", async function () {
          await verifyBalance({
            token: cds,
            address: tom.address,
            expectedBalance: 0
          })

        });
      });

      context("when the requested account has some tokens", function () {
        it("returns the total amount of tokens", async function () {
          //expect(await cds.balanceOf(alice.address)).to.equal("9900");
          await verifyBalance({
            token: cds,
            address: alice.address,
            expectedBalance: 9900
          })
        });
      });
    });

    describe("transfer", function () {
      context("when the recipient is not the zero address", function () {
        context("when the sender does not have enough balance", function () {
          it("reverts", async function () {
            await expect(
              cds.connect(alice).transfer(tom.address, "9901")
            ).to.reverted;
          });
        });

        context("when the sender has enough balance", function () {
          it("transfers the requested amount", async function () {
            await cds.connect(alice).transfer(tom.address, "9900");
            expect(await cds.balanceOf(alice.address)).to.equal("0");

            await verifyBalances({
              token: cds,
              userBalances: {
                [alice.address]: 0,
                [tom.address]: 9900
              }
            })
          });
        });
      });

      context("when the recipient is the zero address", function () {
        it("reverts", async function () {
          await expect(
            cds.connect(tom).transfer(ZERO_ADDRESS, 10000)
          ).to.revertedWith("ERC20: transfer to the zero address");
        });
      });
    });
  });

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })

      await cds.connect(alice).requestWithdraw("9900");

      expect(await cds.totalSupply()).to.equal("9900");
      expect(await cds.totalLiquidity()).to.equal("9900");

      await verifyVaultStatus({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: cds.address,
        attributions: 9900,
        underlyingValue: 9900
      })

      expect(await cds.rate()).to.equal(BigNumber.from("1000000000000000000"));

      await moveForwardPeriods(8)

      await cds.connect(alice).withdraw("9900");

      await verifyVaultStatus({
        vault: vault,
        valueAll: 100,
        totalAttributions: 100
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: cds.address,
        attributions: 0,
        underlyingValue: 0
      })
    });

    it("DISABLES withdraw more than balance", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })
      await cds.connect(alice).requestWithdraw("9900");

      await moveForwardPeriods(8)

      await expect(cds.connect(alice).withdraw("20000")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
    });

    it("DISABLES withdraw zero balance", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })
      await cds.connect(alice).requestWithdraw("9900");

      await moveForwardPeriods(8)
      await expect(cds.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("DISABLES withdraw until lockup period ends", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })
      await cds.connect(alice).requestWithdraw("9900");

      await expect(cds.connect(alice).withdraw("9900")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );
    });

    it("accrues premium after deposit", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })
      await cds.connect(alice).requestWithdraw("9900");

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 9900,
        totalLiquidity: 9900,
        rate: "1000000000000000000"
      })

      await approveDeposit({
        token: dai,
        target: index,
        depositer: bob,
        amount: 10000
      })

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 9900,
        totalLiquidity: 10100,
        rate: "1020202020202020202"
      })

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 90000
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: 20000,
        totalAttributions: 20000,
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: 200,
        underlyingValue: 200
      })

      //withdrawal also harvest accrued premium
      await moveForwardPeriods(10)

      await cds.connect(alice).withdraw("9900");

      //Harvested premium is reflected on their account balance
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100100
      })
    });

    it("DISABLE deposit when locked(withdrawal is possible)", async function () {

      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })

      await cds.connect(alice).requestWithdraw("9900");

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 9900,
        totalLiquidity: 9900,
        rate: "1000000000000000000"
      })

      await cds.setPaused(true);


      await dai.connect(alice).approve(vault.address, 10000);
      await expect(cds.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
    });

    it("devaluate underlying when cover claim is accepted", async function () {
      await approveDeposit({
        token: dai,
        target: cds,
        depositer: alice,
        amount: 10000
      })
      await cds.connect(alice).requestWithdraw("9900");

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 9900,
        totalLiquidity: 9900,
        rate: "1000000000000000000"
      })

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 1000
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

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 19400,
            availableBalance: 19400
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 19400,
          }
        ]
      })

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 9900,
        totalLiquidity: 9920,
        rate: "1002020202020202020"
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: market1.address,
        attributions: 0,
        underlyingValue: 0
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: 970,
        underlyingValue: 970
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: cds.address,
        attributions: 9920,
        underlyingValue: 9920
      })

      await dai.connect(bob).approve(vault.address, 10000);

      await insure({
        pool: market1,
        insurer: bob,
        amount: 9000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 99974
      })


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

      await market1.connect(bob).redeem("0", proof);
      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 104474
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 970,
        totalLiquidity: 0,
        totalAllocatedCredit: 0,
        leverage: 0,
        withdrawable: 0,
        rate: "0"
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 9900,
        totalLiquidity: 6413,
        rate: "647777777777777777"
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: 0,
        underlyingValue: 0
      })

      await moveForwardPeriods(11)

      await market1.resume();
      await cds.connect(alice).withdraw("9900");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95413,
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

      await verifyCDSStatus({
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

      await verifyCDSStatus({
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

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 19400,
            availableBalance: 19400
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 19400,
          }
        ]
      })

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 990,
        totalLiquidity: 1010,
        rate: "1020202020202020202"
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: market1.address,
        attributions: 0,
        underlyingValue: 0
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: 970,
        underlyingValue: 970
      })

      await verifyVaultStatusOf({
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

      await verifyPoolsStatus({
        pools: [
          {
            pool: market1,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })

      await verifyCDSStatus({
        cds: cds,
        totalSupply: 990,
        totalLiquidity: 0,
        rate: "0"
      })

      await verifyVaultStatusOf({
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

  describe("Admin functions", function () {
    it("allows changing metadata", async function () {
      expect(await cds.metadata()).to.equal("Here is metadata.");
      await cds.changeMetadata("new metadata");
      expect(await cds.metadata()).to.equal("new metadata");
    });
  });
});
