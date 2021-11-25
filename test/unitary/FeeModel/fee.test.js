const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const{ 
  ZERO_ADDRESS,
} = require('../constant-utils');

async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
}

describe("test BondingPremium", () => {

  before(async () => {
    [creator, alice] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const Fee = await ethers.getContractFactory("FeeModel");

    ownership = await Ownership.deploy();
    fee = await Fee.deploy(ownership.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)
  })

  describe("Condition", function () {
    it("contract should be deployed", async () => {
      await expect(fee.address).to.exist;
    });
  });
});
