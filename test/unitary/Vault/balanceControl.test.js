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
    await usdc.mint(creator.address, initialMint);
    await usdc.connect(creator).approve(vault.address, initialMint);

    await usdc.mint(alice.address, initialMint);
    await usdc.connect(alice).approve(vault.address, initialMint);

    await usdc.mint(bob.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);

    await registry.supportMarket(alice.address); //now alice can do the same as markets
    await registry.supportMarket(creator.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("addValue", function () {
    beforeEach(async () => {});

    it("should succeed when totalAttributions == 0", async () => {
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

    it("should succeed when totalAttributions != 0", async () => {
      //setup
      await vault.addValue(depositAmount, alice.address, alice.address);

      //EXECUTE
      await vault.addValue(depositAmount, alice.address, alice.address);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.mul(2),
        valueAll: depositAmount.mul(2),
        totalAttributions: depositAmount.mul(2),
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount.mul(2),
        underlyingValue: depositAmount.mul(2),
        debt: ZERO,
      });

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount.mul(2)),
          [vault.address]: depositAmount.mul(2),
        },
      });
    });

    it("revert when market is not registered", async () => {
      //setup
      await expect(vault.connect(chad).addValue(depositAmount, alice.address, alice.address)).to.revertedWith(
        "ERROR_ONLY_MARKET"
      );
    });
  });

  describe("addValueBatch", function () {
    it("should succeed when totalAttributions == 0: all for alice", async () => {
      await vault.addValueBatch(depositAmount, alice.address, [alice.address, bob.address], [1000000, 0]);

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

      await verifyVaultStatusOf({
        vault: vault,
        target: bob.address,
        attributions: ZERO,
        underlyingValue: ZERO,
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

    it("should succeed  when totalAttributions == 0: half and half", async () => {
      await vault.addValueBatch(depositAmount, alice.address, [alice.address, bob.address], [500000, 500000]);

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
        attributions: depositAmount.div(2),
        underlyingValue: depositAmount.div(2),
        debt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: bob.address,
        attributions: depositAmount.div(2),
        underlyingValue: depositAmount.div(2),
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

    it("should succeed  when totalAttributions != 0", async () => {
      //setup
      await vault.addValue(depositAmount, alice.address, alice.address);

      //EXECUTE
      await vault.addValueBatch(depositAmount, alice.address, [alice.address, bob.address], [1000000, 0]);

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.mul(2),
        valueAll: depositAmount.mul(2),
        totalAttributions: depositAmount.mul(2),
        totalDebt: ZERO,
      });

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount.mul(2),
        underlyingValue: depositAmount.mul(2),
        debt: ZERO,
      });

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount.mul(2)),
          [vault.address]: depositAmount.mul(2),
        },
      });
    });

    it("revert when market is not registered", async () => {
      //setup
      await expect(
        vault.connect(chad).addValueBatch(depositAmount, alice.address, [alice.address, alice.address], [1000000, 0])
      ).to.revertedWith("ERROR_ONLY_MARKET");
    });
  });

  describe("withdrawValue", function () {
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

    it("should allow withdrawal", async () => {
      await vault.connect(alice).withdrawValue(depositAmount, alice.address);

      //status
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
    });

    it("revert when attributions[msg.sender] == 0", async () => {
      await vault.connect(alice).withdrawValue(depositAmount, alice.address);

      await expect(vault.connect(alice).withdrawValue(depositAmount, alice.address)).to.revertedWith(
        "WITHDRAW-VALUE_BADCONDITIONS"
      );
    });

    it("revert when underlyingValue(msg.sender) < _amount", async () => {
      await expect(vault.connect(alice).withdrawValue(depositAmount.add(1), alice.address)).to.revertedWith(
        "WITHDRAW-VALUE_BADCONDITIONS"
      );
    });
  });

  describe("transferValue", function () {
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

    it("should transfer balance", async () => {
      await vault.connect(alice).transferValue(depositAmount, bob.address);

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
    });

    it("revert when he has no attribution", async () => {
      await expect(vault.connect(bob).transferValue(depositAmount, alice.address)).to.revertedWith(
        "TRANSFER-VALUE_BADCONDITIONS"
      );
    });

    it("revert when he try to transfer more than he has", async () => {
      await expect(vault.connect(alice).transferValue(depositAmount.add(1), bob.address)).to.revertedWith(
        "TRANSFER-VALUE_BADCONDITIONS"
      );
    });
  });

  describe("borrowValue", function () {
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

    it("should allow borrowing all", async () => {
      await vault.connect(alice).borrowValue(depositAmount, alice.address);

      //status
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
  });

  describe("addBalance", function () {
    it("should increase balance", async () => {
      await vault.addValue(depositAmount, alice.address, alice.address);
      await vault.connect(creator).addBalance(depositAmount);

      //status
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
        attributions: depositAmount,
        underlyingValue: depositAmount.mul(2), //balance added without totalAttribution to be increased.
        debt: ZERO,
      });
    });
  });
});
