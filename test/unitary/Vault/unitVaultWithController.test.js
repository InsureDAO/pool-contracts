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

  
});
