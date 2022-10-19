const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const {
  verifyBalances,
  verifyAllowance,

  verifyVaultStatus,
  verifyVaultStatusOf,
} = require("../test-utils");

const { NULL_ADDRESS, ZERO_ADDRESS, ZERO } = require("../constant-utils");
const { zeroPad } = require("ethers/lib/utils");

async function snapshot() {
  return network.provider.send("evm_snapshot", []);
}

async function restore(snapshotId) {
  return network.provider.send("evm_revert", [snapshotId]);
}

describe("Vault", function () {
  const initialMint = BigNumber.from("100000"); //initial token amount for users

  const depositAmount = BigNumber.from("10000"); //default deposit amount for test

  before(async () => {
    //import
    [creator, alice, bob, chad] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");

    //deploy
    ownership = await Ownership.deploy();
    usdc = await USDC.deploy();
    otherToken = await USDC.deploy();
    registry = await Registry.deploy(ownership.address);
    vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);

    //set up
    await usdc.mint(alice.address, initialMint);
    await usdc.connect(alice).approve(vault.address, initialMint);

    await usdc.mint(bob.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);

    await otherToken.mint(alice.address, initialMint);
    await usdc.connect(alice).approve(vault.address, initialMint);

    await registry.addPool(alice.address); //now alice can do the same as pools
    await registry.addPool(creator.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("offsetDebt", function () {
    beforeEach(async () => {
      //alice have underlying assets
      await vault.addValue(depositAmount, alice.address, alice.address);

      //alice borrow money from Vault
      await vault.connect(alice).borrowValue(depositAmount, alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });
    });

    it("should allow offset debt", async () => {
      //alice pay for the debt
      await vault.connect(alice).offsetDebt(depositAmount, alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: ZERO,
        valueAll: ZERO,
        totalAttributions: ZERO,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });
    });

    it("revert when address is not registered", async () => {
      //transfer alice's debt to the system's debt.
      await expect(vault.connect(chad).transferDebt(depositAmount)).to.revertedWith("ERROR_ONLY_MARKET");
    });
  });

  describe("transferDebt", function () {
    beforeEach(async () => {
      //alice have underlying assets
      await vault.addValue(depositAmount, alice.address, alice.address);

      //alice borrow money from Vault
      await vault.connect(alice).borrowValue(depositAmount, alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });
    });

    it("success", async () => {
      //transfer alice's debt to the system's debt.
      await vault.connect(alice).transferDebt(depositAmount);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO, //alice's debt is transfered
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: depositAmount, //now it's system debt
      });
    });

    it("revert when address is not registered", async () => {
      //transfer alice's debt to the system's debt.
      await expect(vault.connect(chad).transferDebt(depositAmount)).to.revertedWith("ERROR_ONLY_MARKET");
    });
  });

  describe("repayDebt", function () {
    beforeEach(async () => {
      //alice have underlying assets
      await vault.addValue(depositAmount, alice.address, alice.address);

      //alice borrow money from Vault
      await vault.connect(alice).borrowValue(depositAmount, alice.address);
    });

    it("should succeed to repay for market's debt", async () => {
      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount, //alice has debt
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //EXECUTE
      await vault.connect(alice).repayDebt(depositAmount, alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO, //system debt is repayed
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount), //token is transfered to vault
          [vault.address]: depositAmount,
        },
      });
    });

    it("should succeed to repay for system debt", async () => {
      await vault.connect(alice).transferDebt(depositAmount);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO, //alice's debt is transfered
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: depositAmount, //now it's system debt
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //EXECUTE
      await vault.connect(alice).repayDebt(depositAmount, ZERO_ADDRESS);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO, //system debt is repayed
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount), //token is transfered to vault
          [vault.address]: depositAmount,
        },
      });
    });

    it("should succeed to repay for market's debt. (try to repay more than the debt)", async () => {
      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount, //alice has debt
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //EXECUTE
      await vault.connect(alice).repayDebt(depositAmount.mul(2), alice.address); //more than the debt

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount), //only the neccessary amount of token is transfered to the vault
          [vault.address]: depositAmount,
        },
      });
    });

    it("should succeed to repay for market's debt. (not for all the debt)", async () => {
      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount, //alice has debt
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //EXECUTE
      await vault.connect(alice).repayDebt(depositAmount.div(2), alice.address); //half of the debt

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount.div(2),
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount.div(2),
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount.div(2)), //only the neccessary amount of token is transfered to the vault
          [vault.address]: depositAmount.div(2),
        },
      });
    });
  });

  describe("DebtManipulation", function () {
    beforeEach(async () => {
      //alice have underlying assets
      await vault.addValue(depositAmount, alice.address, alice.address);
    });

    //Traing to test actual flow of the InsureDAO system.
    /***
     * Pool borrows USDC from Vault when payout for Insurance. => borrowValue()
     * When resume(), The Pool tries to make his debt clean.
     *
     *  1. Pool lets Index pay for Pool's debt => offsetDebt()
     *    1.2 If Index cannot afford, the Index let Reserve help the Index => transferValue()
     *    1.3 Index pay for Pool's debt => offsetDebt()
     *    1.4 When Reserve couldn't afford, Index pays insufficient.
     *
     *  2. Pool, hisself, pay for his debt = offsetDebt()
     *
     *  3. Pool does transferDebt(_shortage). Usually _shortage is zero.
     *    3.1 If 1.4 was true, _shortage is not zero. The debt turns in system's debt from Pool's debt.
     *
     *  4. Anyone can pay for the System's debt. => repay()
     *
     */
    it("borrow => offset => transfer => repay", async () => {
      //alice borrow money from Vault
      await vault.connect(alice).borrowValue(depositAmount, alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount,
        totalDebt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: depositAmount,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //use own attribution to pay for half the debt
      await vault.connect(alice).offsetDebt(depositAmount.div(2), alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.div(2), //clean up the half amount
        valueAll: depositAmount.div(2), //clean up the half amount
        totalAttributions: depositAmount.div(2), //clean up the half amount
        totalDebt: depositAmount.div(2), //half of the debt was clenuped
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount.div(2), //clean up the half amount
        underlyingValue: depositAmount.div(2), //clean up the half amount
        debt: depositAmount.div(2), //half of the debt was clenuped
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //Pool couldn't pay for all. now let it be system debt.
      await vault.connect(alice).transferDebt(depositAmount.div(2));

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.div(2),
        valueAll: depositAmount.div(2),
        totalAttributions: depositAmount.div(2),
        totalDebt: depositAmount.div(2),
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount.div(2),
        underlyingValue: depositAmount.div(2),
        debt: ZERO, //transfered to system
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: depositAmount.div(2), //transfered from alice's debt
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });

      //someone repay for the system debt
      await vault.connect(alice).repayDebt(depositAmount.div(2), ZERO_ADDRESS);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.div(2),
        valueAll: depositAmount.div(2),
        totalAttributions: depositAmount.div(2),
        totalDebt: ZERO, //repayed
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount.div(2),
        underlyingValue: depositAmount.div(2),
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: ZERO_ADDRESS,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO, //repayed
      });

      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount.div(2)), //transfer to Vault
          [vault.address]: depositAmount.div(2), //transfered from alice
        },
      });
    });
  });
});
