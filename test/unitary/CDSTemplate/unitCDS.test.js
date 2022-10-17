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
  verifyReserveStatus,
  verifyReserveStatusOf,
  verifyVaultStatus,
  verifyVaultStatusOf,
} = require("../test-utils");

const { ZERO_ADDRESS, long, short, YEAR, WEEK, DAY, ZERO } = require("../constant-utils");

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

async function setNextBlock(time) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [time.toNumber()]);
}

describe("Reserve", function () {
  const initialMint = BigNumber.from("100000"); //initial token amount for users
  const depositAmount = BigNumber.from("10000"); //default deposit amount for test
  const defaultRate = BigNumber.from("1000000"); //initial rate between USDC and LP token

  const governanceFeeRate = BigNumber.from("100000"); //10% of the Premium

  before(async () => {
    //import
    [gov, alice, bob, chad, tom] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
    const ReserveTemplate = await ethers.getContractFactory("ReserveTemplate");
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

    marketTemplate = await MarketTemplate.deploy();
    reserveTemplate = await ReserveTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    //set up
    await usdc.mint(alice.address, initialMint);
    await usdc.mint(bob.address, initialMint);
    await usdc.mint(chad.address, initialMint);

    await usdc.connect(alice).approve(vault.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);
    await usdc.connect(chad).approve(vault.address, initialMint);

    await registry.setFactory(factory.address);

    await factory.approveTemplate(marketTemplate.address, true, false, true);
    await factory.approveTemplate(reserveTemplate.address, true, false, true);

    await factory.approveReference(marketTemplate.address, 0, usdc.address, true);
    await factory.approveReference(marketTemplate.address, 1, usdc.address, true);
    await factory.approveReference(marketTemplate.address, 2, registry.address, true);
    await factory.approveReference(marketTemplate.address, 3, parameters.address, true);
    await factory.approveReference(marketTemplate.address, 4, ZERO_ADDRESS, true);

    await factory.approveReference(reserveTemplate.address, 2, parameters.address, true);
    await factory.approveReference(reserveTemplate.address, 0, usdc.address, true);
    await factory.approveReference(reserveTemplate.address, 1, registry.address, true);

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);

    await parameters.setGrace(ZERO_ADDRESS, DAY.mul("3"));

    await parameters.setLockup(ZERO_ADDRESS, WEEK);
    await parameters.setWithdrawable(ZERO_ADDRESS, WEEK.mul(2));

    await parameters.setMaxDate(ZERO_ADDRESS, YEAR);
    await parameters.setMinDate(ZERO_ADDRESS, WEEK);

    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);

    await parameters.setVault(usdc.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");

    //market1
    let tx = await factory.createMarket(
      marketTemplate.address,
      "Here is metadata.",
      [0, 0],
      [usdc.address, usdc.address, registry.address, parameters.address]
    );
    let receipt = await tx.wait();
    const marketAddress1 = receipt.events[2].args[0];
    market1 = await MarketTemplate.attach(marketAddress1);

    tx = await factory.createMarket(
      reserveTemplate.address,
      "Here is metadata.",
      [0, 0],
      [usdc.address, registry.address, parameters.address]
    );
    receipt = await tx.wait();
    const marketAddress2 = receipt.events[2].args[0];
    reserve = await ReserveTemplate.attach(marketAddress2);

    await registry.setReserve(ZERO_ADDRESS, reserve.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();

    {
      //sanity check
      await verifyReserveStatus({
        reserve: reserve,
        surplusPool: ZERO,
        crowdPool: ZERO,
        totalSupply: ZERO,
        totalLiquidity: ZERO,
        rate: ZERO,
      });

      await verifyReserveStatusOf({
        reserve: reserve,
        targetAddress: alice.address,
        valueOfUnderlying: ZERO,
        withdrawTimestamp: ZERO,
        withdrawAmount: ZERO,
      });

      await verifyVaultStatus({
        vault: vault,
        balance: ZERO,
        valueAll: ZERO,
        totalAttributions: ZERO,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: reserve.address,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [reserve.address]: ZERO,
          [vault.address]: ZERO,
        },
      });

      await verifyBalances({
        token: reserve,
        userBalances: {
          [alice.address]: ZERO,
          [reserve.address]: ZERO,
          [vault.address]: ZERO,
        },
      });
    }
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("ReserveTemplate", function () {
    describe("initialize", function () {
      it("should set configs after initialization", async () => {
        expect(await reserve.initialized()).to.equal(true);
        expect(await reserve.registry()).to.equal(registry.address);
        expect(await reserve.parameters()).to.equal(parameters.address);
        expect(await reserve.vault()).to.equal(vault.address);
        expect(await reserve.name()).to.equal("InsureDAO-Reserve");
        expect(await reserve.symbol()).to.equal("iReserve");
        expect(await reserve.decimals()).to.equal(18); //MockERC20 decimals
      });

      it("reverts when already initialized", async () => {
        // 91
        // "INITIALIZATION_BAD_CONDITIONS"

        await expect(
          reserve.initialize(
            ZERO_ADDRESS,
            "Here is metadata.",
            [0, 0],
            [usdc.address, registry.address, parameters.address]
          )
        ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
      });

      it("reverts when address is zero and/or metadata is empty 1", async () => {
        await factory.approveReference(reserveTemplate.address, 0, ZERO_ADDRESS, true);

        await expect(
          factory.createMarket(
            reserveTemplate.address,
            "Here is metadata.",
            [0, 0],
            [ZERO_ADDRESS, registry.address, parameters.address]
          )
        ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
      });

      it("reverts when address is zero and/or metadata is empty 2", async () => {
        await factory.approveReference(reserveTemplate.address, 1, ZERO_ADDRESS, true);

        await expect(
          factory.createMarket(
            reserveTemplate.address,
            "Here is metadata.",
            [0, 0],
            [usdc.address, ZERO_ADDRESS, parameters.address]
          )
        ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
      });

      it("reverts when address is zero and/or metadata is empty 3", async () => {
        await factory.approveReference(reserveTemplate.address, 2, ZERO_ADDRESS, true);

        await expect(
          factory.createMarket(
            reserveTemplate.address,
            "Here is metadata.",
            [0, 0],
            [usdc.address, registry.address, ZERO_ADDRESS]
          )
        ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
      });

      it("reverts when address is zero and/or metadata is empty 4", async () => {
        await expect(
          factory.createMarket(
            reserveTemplate.address,
            "",
            [0, 0],
            [usdc.address, registry.address, parameters.address]
          )
        ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
      });
    });

    describe("deposit", function () {
      it("should increase the crowd pool size and attribution", async () => {
        let tx = await reserve.connect(alice).deposit(depositAmount);

        {
          //sanity check
          let mintAmount = (await tx.wait()).events[3].args["value"]; //new minted LP
          await expect(mintAmount).to.equal(depositAmount);

          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount, //deposit goes into crowdPool
            totalSupply: mintAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: mintAmount,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("should return larger amount of iToken when the rate is low(when compensated)", async () => {
        //setup
        await reserve.connect(bob).deposit(depositAmount); //LP:USDC = 1:1

        await registry.supportMarket(chad.address); //now bob can act like a market

        let compensate = depositAmount.div(2);
        await reserve.connect(chad).compensate(compensate); //LP:USDC = 1:0.5

        let tx = await reserve.connect(alice).deposit(depositAmount); //LP mintAmount should be depositAmount*2

        {
          //sanity check
          let mintAmount = (await tx.wait()).events[3].args["value"]; //new minted LP
          await expect(mintAmount).to.equal(depositAmount.mul(2));

          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount.sub(compensate).add(depositAmount),
            totalSupply: depositAmount.add(mintAmount),
            totalLiquidity: depositAmount.sub(compensate).add(depositAmount),
            rate: defaultRate.mul(depositAmount.sub(compensate).add(depositAmount)).div(depositAmount.add(mintAmount)),
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: bob.address,
            valueOfUnderlying: depositAmount.sub(compensate),
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount.mul(2),
            valueAll: depositAmount.mul(2),
            totalAttributions: depositAmount.mul(2),
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount.sub(compensate).add(depositAmount), //unless Controller contract earn interest from investment, ..
            underlyingValue: depositAmount.sub(compensate).add(depositAmount), //.. these two are always the same
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [bob.address]: initialMint.sub(depositAmount),
              [chad.address]: initialMint,
              [reserve.address]: ZERO,
              [vault.address]: depositAmount.mul(2),
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: mintAmount,
              [bob.address]: depositAmount,
              [chad.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("revert when the deposit amount is zero", async () => {
        await expect(reserve.deposit(0)).to.revertedWith("ERROR: DEPOSIT_ZERO");
      });

      it("revert when paused", async () => {
        await reserve.setPaused(true);
        await expect(reserve.deposit(0)).to.revertedWith("ERROR: PAUSED");
      });

      it("revert when paused", async () => {
        await reserve.setPaused(true);
        await expect(reserve.deposit(0)).to.revertedWith("ERROR: PAUSED");
      });

      it("dilute LP value when Reserve system is failed", async () => {
        await reserve.connect(alice).deposit(depositAmount);

        await registry.supportMarket(chad.address); //now chad can act like a market

        let compensate = depositAmount.add(1); //more than deposited
        await reserve.connect(chad).compensate(compensate);

        let totalSupply = await reserve.totalSupply();

        let tx = await reserve.connect(bob).deposit(depositAmount);

        let mintedAmount = (await tx.wait()).events[2].args["mint"];

        expect(mintedAmount).to.equal(totalSupply.mul(depositAmount));

        {
          //sanity check

          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount, //deposit goes into crowdPool
            totalSupply: depositAmount.add(mintedAmount),
            totalLiquidity: depositAmount,
            rate: defaultRate.mul(depositAmount).div(depositAmount.add(mintedAmount)),
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: bob.address,
            valueOfUnderlying: depositAmount.sub(1), //
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount.mul(2),
            valueAll: depositAmount.mul(2),
            totalAttributions: depositAmount.mul(2),
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [bob.address]: initialMint.sub(depositAmount),
              [chad.address]: initialMint,
              [reserve.address]: ZERO,
              [vault.address]: depositAmount.mul(2),
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [bob.address]: mintedAmount,
              [chad.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });
    });

    describe("fund", function () {
      it("should increase the surplus pool size", async () => {
        await reserve.connect(alice).fund(depositAmount);

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: depositAmount, //fund() goes to surplusPool
            crowdPool: ZERO,
            totalSupply: ZERO, //LP isn't minted
            totalLiquidity: depositAmount,
            rate: ZERO,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO, //doesn't count
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount, //attribution of Reserve exists
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("revert when paused", async () => {
        await reserve.setPaused(true);

        //EXECUTE
        await expect(reserve.connect(alice).fund(depositAmount)).to.revertedWith("ERROR: PAUSED");
      });
    });

    describe("defund", function () {
      beforeEach(async () => {
        await reserve.connect(alice).fund(depositAmount);

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: depositAmount, //fund() goes to surplusPool
            crowdPool: ZERO,
            totalSupply: ZERO, //LP isn't minted
            totalLiquidity: depositAmount,
            rate: ZERO,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO, //doesn't count
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount, //attribution of Reserve exists
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("success", async () => {
        await reserve.defund(gov.address, depositAmount);

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO, //decrease
            crowdPool: ZERO,
            totalSupply: ZERO,
            totalLiquidity: ZERO, //decrease
            rate: ZERO,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: ZERO, //decrease
            valueAll: ZERO, //decrease
            totalAttributions: ZERO, //decrease
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: ZERO, //decrease
            underlyingValue: ZERO, //decrease
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [gov.address]: depositAmount, //increase. defund() goes to msg.sender (with onlyOwner modifier)
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: ZERO, //decrease
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("revert onlyOwner", async () => {
        await expect(reserve.connect(alice).defund(alice.address, depositAmount)).to.revertedWith("ERROR: ONLY_OWNER");
      });
    });

    describe("requestWithdraw", function () {
      beforeEach(async () => {
        let tx = await reserve.connect(alice).deposit(depositAmount);

        {
          //sanity check
          let mintAmount = (await tx.wait()).events[3].args["value"]; //new minted LP
          await expect(mintAmount).to.equal(depositAmount);

          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount, //deposit goes into crowdPool
            totalSupply: mintAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: mintAmount,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("should update timestamp and amount", async () => {
        //setup
        let next = (await now()).add(10);
        await setNextBlock(next);

        //EXECUTE
        await expect(reserve.connect(alice).requestWithdraw(depositAmount));

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount,
            totalSupply: depositAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: next.add(WEEK), //set.  withdrawable time
            withdrawAmount: depositAmount, //set
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("revert when _amount exceed balance", async () => {
        await expect(reserve.connect(alice).requestWithdraw(depositAmount.add(1))).to.revertedWith(
          "ERROR: REQUEST_EXCEED_BALANCE"
        );
      });

      it("amount should not be zero", async () => {
        await expect(reserve.connect(alice).requestWithdraw(ZERO)).to.revertedWith("ERROR: REQUEST_ZERO");
      });
    });

    describe("_beforeTokenTransfer", function () {
      beforeEach(async () => {
        await reserve.connect(alice).deposit(depositAmount);

        next = (await now()).add(10);
        await setNextBlock(next);

        await expect(reserve.connect(alice).requestWithdraw(depositAmount));

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount,
            totalSupply: depositAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: next.add(WEEK), //set
            withdrawAmount: depositAmount, //set
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("should decrease the request amount", async () => {
        await reserve.connect(alice).transfer(bob.address, depositAmount.div(2)); //transfer half of LP token

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount,
            totalSupply: depositAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount.div(2), //changed
            withdrawTimestamp: next.add(WEEK), //set
            withdrawAmount: depositAmount.div(2), //changed
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount.div(2), //decrease
              [bob.address]: depositAmount.div(2), //new holder
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });
    });

    describe("withdraw", function () {
      //deposit and request withdraw
      beforeEach(async () => {
        await reserve.connect(alice).deposit(depositAmount);

        next = (await now()).add(10);
        await setNextBlock(next);

        await expect(reserve.connect(alice).requestWithdraw(depositAmount));

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount,
            totalSupply: depositAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: next.add(WEEK), //set
            withdrawAmount: depositAmount, //set
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("should decrease the crowd pool size and attributions", async () => {
        await moveForwardPeriods(7);

        let tx = await reserve.connect(alice).withdraw(depositAmount);
        returnValue = (await tx.wait()).events[2].args["retVal"];

        await expect(returnValue).to.equal(depositAmount);

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: ZERO, //decrease
            totalSupply: ZERO,
            totalLiquidity: ZERO,
            rate: ZERO,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: next.add(WEEK), //no change. user can withdraw half now, and half later.
            withdrawAmount: ZERO, //should reduce request amount
          });

          await verifyVaultStatus({
            vault: vault,
            balance: ZERO,
            valueAll: ZERO,
            totalAttributions: ZERO,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint, //withdrawed to here
              [reserve.address]: ZERO,
              [vault.address]: ZERO, //withdrawed from here
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: ZERO, //should burn iToken
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("reverts when the market is paused", async () => {
        await reserve.setPaused(true);

        await moveForwardPeriods(7);

        await expect(reserve.connect(alice).withdraw(depositAmount)).to.revertedWith("ERROR: PAUSED");
      });

      it("reverts when lockup is not ends", async () => {
        await moveForwardPeriods(6);

        await expect(reserve.connect(alice).withdraw(depositAmount)).to.revertedWith("ERROR: WITHDRAWAL_QUEUE");
      });

      it("reverts when withdrawable priod ends", async () => {
        await moveForwardPeriods(7);
        await moveForwardPeriods(14);

        await expect(reserve.connect(alice).withdraw(depositAmount)).to.revertedWith("WITHDRAWAL_NO_ACTIVE_REQUEST");
      });

      it("reverts when the withdraw amount exceeded the request", async () => {
        await moveForwardPeriods(7);

        await expect(reserve.connect(alice).withdraw(depositAmount.add(1))).to.revertedWith(
          "WITHDRAWAL_EXCEEDED_REQUEST"
        );
      });

      it("reverts when withdraw zero amount", async () => {
        await moveForwardPeriods(7);

        await expect(reserve.connect(alice).withdraw(ZERO)).to.revertedWith("ERROR: WITHDRAWAL_ZERO");
      });
    });

    describe("compensate", function () {
      beforeEach(async () => {
        await reserve.connect(alice).deposit(depositAmount);

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO,
            crowdPool: depositAmount, //deposit goes into crowdPool
            totalSupply: depositAmount,
            totalLiquidity: depositAmount,
            rate: defaultRate,
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount,
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("should decrease the surplus pool and crowd pool", async () => {
        await registry.supportMarket(chad.address); //now bob can act like a market

        await reserve.connect(bob).fund(depositAmount);

        let compensate = BigNumber.from("1000"); //since surplusPool and crowdPool have equal value, compensate evenly.
        await reserve.connect(chad).compensate(compensate);

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: depositAmount.sub(compensate.div(2)), //compensate evenly
            crowdPool: depositAmount.sub(compensate.div(2)), //compensate evenly
            totalSupply: depositAmount,
            totalLiquidity: depositAmount.mul(2).sub(compensate),
            rate: defaultRate.mul(depositAmount.sub(compensate.div(2))).div(depositAmount), //defaultRate * deposited balance / totalSupply
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount.sub(compensate.div(2)),
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount.mul(2), //no changes
            valueAll: depositAmount.mul(2),
            totalAttributions: depositAmount.mul(2),
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount.mul(2).sub(compensate),
            underlyingValue: depositAmount.mul(2).sub(compensate),
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: chad.address,
            attributions: compensate,
            underlyingValue: compensate,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [bob.address]: initialMint.sub(depositAmount),
              [chad.address]: initialMint,
              [reserve.address]: ZERO,
              [vault.address]: depositAmount.mul(2),
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });

      it("should decrease as much as deposited when Reserve has insufficient amount", async () => {
        await registry.supportMarket(chad.address); //now chad can act like a market

        let compensate = depositAmount.add(1); //more than deposited
        let tx = await reserve.connect(chad).compensate(compensate);

        //should conpensete "depositedAmount", and shortage should be 1.
        let compensated = (await tx.wait()).events[0].args["amount"];
        await expect(compensated).to.equal(depositAmount);

        let shortage = compensate - compensated;

        {
          //sanity check
          await verifyReserveStatus({
            reserve: reserve,
            surplusPool: ZERO, //totally used
            crowdPool: ZERO, //totally used
            totalSupply: depositAmount,
            totalLiquidity: ZERO,
            rate: ZERO, //defaultRate * deposited balance / totalSupply
          });

          await verifyReserveStatusOf({
            reserve: reserve,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyVaultStatus({
            vault: vault,
            balance: depositAmount, //no changes
            valueAll: depositAmount,
            totalAttributions: depositAmount,
            totalDebt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: reserve.address,
            attributions: depositAmount.sub(depositAmount), //transfer from here
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: chad.address,
            attributions: depositAmount, //transfer to here
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: chad.address,
            attributions: compensated,
            underlyingValue: compensated,
            debt: ZERO,
          });

          await verifyBalances({
            token: usdc,
            userBalances: {
              [alice.address]: initialMint.sub(depositAmount),
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              [reserve.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: reserve,
            userBalances: {
              [alice.address]: depositAmount,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
              [reserve.address]: ZERO,
              [vault.address]: ZERO,
            },
          });
        }
      });
    });

    describe("changeMetadata", function () {
      it("should change Metadata", async () => {
        expect(await reserve.metadata()).to.equal("Here is metadata.");

        await reserve.changeMetadata("New metadata");

        expect(await reserve.metadata()).to.equal("New metadata");
      });

      it("revert when not admin", async () => {
        await expect(reserve.connect(alice).changeMetadata("New metadata")).to.revertedWith("ERROR: ONLY_OWNER");
      });
    });
  });
});
