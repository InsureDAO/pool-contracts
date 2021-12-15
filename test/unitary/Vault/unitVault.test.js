const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");


const {
  verifyBalances,
  verifyAllowance,

  verifyVaultStatus,
  verifyVaultStatusOf,
} = require('../test-utils')

const{ 
  NULL_ADDRESS,
  ZERO_ADDRESS,
  ZERO
} = require('../constant-utils');
const { zeroPad } = require("ethers/lib/utils");

async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
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
    vault = await Vault.deploy(
      usdc.address,
      registry.address,
      ZERO_ADDRESS,
      ownership.address
    );


    //set up
    await usdc.mint(alice.address, initialMint);
    await usdc.connect(alice).approve(vault.address, initialMint);

    await usdc.mint(bob.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);


    await otherToken.mint(alice.address, initialMint);
    await usdc.connect(alice).approve(vault.address, initialMint);


    await registry.supportMarket(alice.address); //now alice can do the same as markets
  });

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)
  })

  describe("addValue", function () {
    beforeEach(async () => {
    });

    it("success when totalAttributions == 0", async () => {
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
        totalAttributions: ZERO
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO
      })


      //EXECUTE
      await vault.addValue(depositAmount, alice.address, alice.address);


      //sanity check after
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO
      })

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount),
          [vault.address]: depositAmount
        }
      })

    });

    it("success when totalAttributions != 0", async () => {
      //setup
      await vault.addValue(depositAmount, alice.address, alice.address);


      //EXECUTE
      await vault.addValue(depositAmount, alice.address, alice.address);


      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount.mul(2),
        valueAll: depositAmount.mul(2),
        totalAttributions: depositAmount.mul(2)
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount.mul(2),
        underlyingValue: depositAmount.mul(2),
        debt: ZERO
      })

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount.mul(2)),
          [vault.address]: depositAmount.mul(2)
        }
      })
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
        totalAttributions: depositAmount
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO
      })
    });
    
    it("success", async () => {
      await vault.connect(alice).withdrawValue(depositAmount, alice.address)

      //status
      await verifyVaultStatus({
        vault: vault,
        balance: ZERO,
        valueAll: ZERO,
        totalAttributions: ZERO
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO
      })
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
        totalAttributions: depositAmount
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO
      })
    });
    
    it("success", async () => {
      await vault.connect(alice).transferValue(depositAmount, bob.address)

      //status
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: bob.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO
      })
    });

    it("revert when he has no attribution", async () => {
      await expect(vault.connect(bob).transferValue(depositAmount, alice.address)).to.revertedWith("ERROR_TRANSFER-VALUE_BADCONDITOONS")
    });

    it("revert when he try to transfer more than he has", async () => {
      await expect(vault.connect(alice).transferValue(depositAmount.add(1), bob.address)).to.revertedWith("ERROR_TRANSFER-VALUE_BADCONDITOONS")
    });
  });

  describe.skip("borrowValue", function () {
    beforeEach(async () => {
      await vault.addValue(depositAmount, alice.address, alice.address);

      //status
      await verifyVaultStatus({
        vault: vault,
        balance: depositAmount,
        valueAll: depositAmount,
        totalAttributions: depositAmount
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO
      })
    });
    
    it("success", async () => {
      await vault.connect(alice).borrowValue(depositAmount, alice.address)

      //status
      await verifyVaultStatus({
        vault: vault,
        balance: ZERO,
        valueAll: ZERO,
        totalAttributions: ZERO //change
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount, //change
        underlyingValue: ZERO,
        debt: depositAmount
      })
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
        totalAttributions: depositAmount
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: depositAmount,
        underlyingValue: depositAmount,
        debt: ZERO
      })
    });
    
    it("success", async () => {
      await vault.connect(alice).withdrawAllAttribution(alice.address)

      //sanity check
      await verifyVaultStatus({
        vault: vault,
        balance: ZERO,
        valueAll: ZERO,
        totalAttributions: ZERO
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: alice.address,
        attributions: ZERO,
        underlyingValue: ZERO,
        debt: ZERO
      })

      //transfer has done successfully
      await verifyBalances({
        token: usdc,
        userBalances: {
          [alice.address]: initialMint,
          [vault.address]: ZERO
        }
      })
    });
  });

  describe("Controller", function () {
    beforeEach(async () => {
      const Contorller = await ethers.getContractFactory("ControllerMock");
      controller = await Contorller.deploy(usdc.address, ownership.address);

      await controller.setVault(vault.address);
      await vault.setController(controller.address);
    });

    
  });
});
