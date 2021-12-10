const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const{ 
  ZERO_ADDRESS,
  TEST_ADDRESS,
} = require('../constant-utils');
const { zeroPad } = require("@ethersproject/bytes");

async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
}

describe("Parameters", function () {

  before(async () => {
    //import
    [creator, alice, bob, chad, tom, test] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const Parameters = await ethers.getContractFactory("Parameters");

    ownership = await Ownership.deploy();
    parameters = await Parameters.deploy(ownership.address);
  });
  
  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)
  })
  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(parameters.address).to.exist;
    });
  });

  describe("parameters functions", function () {
    describe("general", function(){
      it("registers universal params", async () => {
        await parameters.setGrace(ZERO_ADDRESS, "1000");
        await parameters.setLockup(ZERO_ADDRESS, "1000");
        await parameters.setMindate(ZERO_ADDRESS, "1000");
  
        await parameters.setVault(ZERO_ADDRESS, test.address);
        await parameters.setWithdrawable(ZERO_ADDRESS, "1000");
  
        expect(await parameters.getGrace(creator.address)).to.equal("1000");
        expect(await parameters.getLockup(creator.address)).to.equal("1000");
        expect(await parameters.getMin(creator.address)).to.equal("1000");
        expect(await parameters.getWithdrawable(creator.address)).to.equal(
          "1000"
        );
        expect(await parameters.getVault(test.address)).to.equal(ZERO_ADDRESS);
      });
  
      it("registers specific params for the specifed address", async () => {
        await parameters.setGrace(test.address, "10000");
        await parameters.setLockup(test.address, "10000");
        await parameters.setMindate(test.address, "10000");
        await parameters.setVault(test.address, test.address);
        await parameters.setWithdrawable(test.address, "10000");

        expect(await parameters.connect(test).getGrace(test.address)).to.equal(
          "10000"
        );
        expect(await parameters.connect(test).getLockup(test.address)).to.equal(
          "10000"
        );
        expect(await parameters.connect(test).getMin(test.address)).to.equal(
          "10000"
        );
        expect(
          await parameters.connect(test).getWithdrawable(test.address)
        ).to.equal("10000");
        expect(await parameters.getVault(test.address)).to.equal(test.address);
      });
    })

    describe("setMinter", function(){
      it("success", async () => {
        await parameters.setMinter(TEST_ADDRESS);

        expect(await parameters.getMinter()).to.equal(TEST_ADDRESS);
      });

      it("modifier", async () => {

        await expect(parameters.connect(alice).setMinter(TEST_ADDRESS)).to.revertedWith("Restricted: caller is not allowed to operate");
      });
  
      it("revert", async () => {
        await parameters.setMinter(TEST_ADDRESS);

        await expect(parameters.setMinter(TEST_ADDRESS)).to.revertedWith("dev: already initialized");
      });

      it("event", async () => {
        await expect(parameters.setMinter(TEST_ADDRESS)).to.emit(parameters, 'MinterSet');
      });
    })

    describe("setVault", function(){
      it("success", async () => {
        await parameters.setVault(TEST_ADDRESS, TEST_ADDRESS);

        expect(await parameters.getVault(TEST_ADDRESS)).to.equal(TEST_ADDRESS);
      });

      it("modifier", async () => {

        await expect(parameters.connect(alice).setVault(TEST_ADDRESS ,TEST_ADDRESS)).to.revertedWith("Restricted: caller is not allowed to operate");
      });
  
      it("revert 1", async () => {
        await parameters.setVault(TEST_ADDRESS, TEST_ADDRESS);

        await expect(parameters.setVault(TEST_ADDRESS, TEST_ADDRESS)).to.revertedWith("dev: already initialized");
      });

      it("revert 2", async () => {
        await expect(parameters.setVault(TEST_ADDRESS, ZERO_ADDRESS)).to.revertedWith("dev: zero address");
      });

      it("event", async () => {
        await expect(parameters.setVault(TEST_ADDRESS, TEST_ADDRESS)).to.emit(parameters, 'VaultSet');
      });
    })

    describe("setLockup", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })

    describe("setGrace", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })

    describe("setMindate", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })

    describe("setWithdrawable", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })

    describe("setPremiumModel", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })

    describe("setMaxList", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })

    describe("setCondition", function(){
      it("", async () => {
      });
  
      it("", async () => {
      });
    })
    
  });
});
