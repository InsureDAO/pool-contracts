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
    registry = await Registry.deploy(ownership.address);
    vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);

    //set up
    await usdc.mint(creator.address, initialMint);
    await usdc.connect(creator).approve(vault.address, initialMint);

    await usdc.mint(alice.address, initialMint);
    await usdc.connect(alice).approve(vault.address, initialMint);

    await usdc.mint(bob.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);

    await registry.addPool(alice.address); //now alice can perform as pools
    await registry.addPool(creator.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("test", function () {
    it("test", async () => {
      /***
       *@notice totalAttributions == 0 when{}
       *          - first time addValue
       *          - withdrawValue
       *          - borrowValue
       */
      //sanity check before
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

      //EXECUTE
      await vault.addValue(depositAmount, alice.address, alice.address);

      //sanity check after
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

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount),
          [vault.address]: depositAmount,
        },
      });
    });
  });

  describe("withdrawAllAttribution", function () {
    beforeEach(async () => {
      await vault.addValue(depositAmount, alice.address, alice.address);

      //status
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
    });

    it("should succeed withdraw all the attribution", async () => {
      await vault.connect(alice).withdrawAllAttribution(alice.address);

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

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });
    });
  });

  describe("withdrawAttribution", function () {
    beforeEach(async () => {
      await vault.addValue(depositAmount, alice.address, alice.address);

      //status
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
    });

    it("should succeed to withdraw attribution", async () => {
      await vault.connect(alice).withdrawAttribution(depositAmount, alice.address);

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

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO,
        },
      });
    });

    it("revert when he doesn't have enough attribution", async () => {
      await expect(vault.connect(alice).withdrawAttribution(depositAmount.add(1), alice.address)).to.revertedWith(
        "WITHDRAW-ATTRIBUTION_BADCONS"
      );
    });
  });

  describe("transferAttribution", function () {
    beforeEach(async () => {
      await vault.addValue(depositAmount, alice.address, alice.address);

      //status
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
    });

    it("should allow transfer attribution", async () => {
      await vault.connect(alice).transferAttribution(depositAmount, bob.address);

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
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: bob.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount),
          [bob.address]: initialMint,
          [vault.address]: depositAmount,
        },
      });
    });

    it("revert when transferring to zero address", async () => {
      await expect(vault.connect(alice).transferAttribution(depositAmount, ZERO_ADDRESS)).to.revertedWith(
        "ERROR_ZERO_ADDRESS"
      );
    });

    it("revert when transferring more than he has", async () => {
      await expect(vault.connect(alice).transferAttribution(depositAmount.add(1), bob.address)).to.revertedWith(
        "TRANSFER-ATTRIBUTION_BADCONS"
      );
    });
  });

  describe("renounceAllAttribution", function () {
    beforeEach(async () => {});

    it("test renounceAllAttribution", async () => {
      await vault.addValue(depositAmount, creator.address, creator.address);
      await vault.addValue(depositAmount, alice.address, alice.address);

      await vault.connect(alice).renounceAllAttribution();

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.mul(2),
        valueAll: depositAmount.mul(2),
        totalAttributions: depositAmount,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO, //renounced
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: depositAmount, //no change
        underlyingValue: depositAmount.mul(2), //increase due to the renounced attribution.
        debt: ZERO,
      });
    });

    it("should pass when no attribution, but no change on status", async () => {
      await vault.addValue(depositAmount, creator.address, creator.address);

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
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });

      //execute
      await vault.connect(alice).renounceAllAttribution();

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
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });
    });
  });

  describe("renounceAttribution", function () {
    it("test renounceAllAttribution", async () => {
      await vault.addValue(depositAmount, creator.address, creator.address);
      await vault.addValue(depositAmount, alice.address, alice.address);

      //Alice holds attribution at a 1:1 ratio of depositAmount.
      await vault.connect(alice).renounceAttribution(depositAmount); //now, 0 attribution on Alice

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.mul(2),
        valueAll: depositAmount.mul(2),
        totalAttributions: depositAmount,
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO, //renounced
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: depositAmount, //no change
        underlyingValue: depositAmount.mul(2), //increase due to the renounced attribution.
        debt: ZERO,
      });
    });

    it("should pass when no attribution, but no change on status", async () => {
      await vault.addValue(depositAmount, creator.address, creator.address);

      await vault.connect(alice).renounceAttribution(ZERO);

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
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: creator.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO,
      });
    });

    it("should revert when input exceed attribution", async () => {
      await vault.addValue(depositAmount, creator.address, creator.address);
      await vault.addValue(depositAmount, alice.address, alice.address);

      //Alice holds attribution at a 1:1 ratio of depositAmount.
      await expect(vault.connect(alice).renounceAttribution(depositAmount.add(1))).revertedWith(
        "_attribution exceed your holding"
      );
    });
  });
});
