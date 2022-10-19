const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const { ZERO_ADDRESS, TEST_ADDRESS, NULL_ADDRESS } = require("../constant-utils");
const { zeroPad } = require("@ethersproject/bytes");

async function snapshot() {
  return network.provider.send("evm_snapshot", []);
}

async function restore(snapshotId) {
  return network.provider.send("evm_revert", [snapshotId]);
}

describe("ParametersV2", function () {
  before(async () => {
    //import
    [creator, alice, bob, chad, tom, test] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const ParametersV2 = await ethers.getContractFactory("ParametersV2");
    const PremiumModelV2 = await ethers.getContractFactory("TestPremiumModelV2");

    ownership = await Ownership.deploy();
    parameters = await ParametersV2.deploy(ownership.address);
    premiumModel = await PremiumModelV2.deploy();
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(parameters.address).to.exist;
    });
    it("Should return Owner address", async () => {
      expect(await parameters.getOwner()).to.equal(creator.address);
    });
  });

  describe("parameters functions", function () {
    describe("setVault", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setVault(TEST_ADDRESS, TEST_ADDRESS);
        expect(await parameters.getVault(TEST_ADDRESS)).to.equal(TEST_ADDRESS);
      });
      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setVault(TEST_ADDRESS, TEST_ADDRESS)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should only allow registration once", async () => {
        await parameters.setVault(TEST_ADDRESS, TEST_ADDRESS);
        await expect(parameters.setVault(TEST_ADDRESS, TEST_ADDRESS)).to.revertedWith("dev: already initialized");
      });

      it("should not allow zero address", async () => {
        await expect(parameters.setVault(TEST_ADDRESS, ZERO_ADDRESS)).to.revertedWith("dev: zero address");
      });

      it("should emit the event", async () => {
        await expect(parameters.setVault(TEST_ADDRESS, TEST_ADDRESS)).to.emit(parameters, "VaultSet");
      });
    });

    describe("setPremiumModel", function () {
      //detailed tests for the premium model, please see ../PremiumModels
      it("should allow setting by the admin address", async () => {
        await parameters.setPremiumModel(TEST_ADDRESS, premiumModel.address);

        expect(await parameters.getPremiumModel(TEST_ADDRESS)).to.equal(premiumModel.address);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setPremiumModel(TEST_ADDRESS, premiumModel.address)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });
      it("should return the dafault value if the address not registered", async () => {
        await parameters.setPremiumModel(ZERO_ADDRESS, premiumModel.address);

        expect(await parameters.getPremiumModel(TEST_ADDRESS)).to.equal(premiumModel.address);
        expect(await parameters.getPremium(10000, 100, 100, 100, TEST_ADDRESS)).to.equal(1000);
      });

      it("should return the value if registered", async () => {
        await parameters.setPremiumModel(NULL_ADDRESS, premiumModel.address);
        expect(await parameters.getPremium(10000, 100, 100, 100, NULL_ADDRESS)).to.equal(1000);
      });

      it("should emit the event", async () => {
        await expect(parameters.setPremiumModel(TEST_ADDRESS, TEST_ADDRESS)).to.emit(parameters, "PremiumSet");
      });
    });

    describe("setRequestDuration", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setRequestDuration(TEST_ADDRESS, 86400);
        expect(await parameters.getRequestDuration(TEST_ADDRESS)).to.equal(86400);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setRequestDuration(TEST_ADDRESS, 86400)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setRequestDuration(ZERO_ADDRESS, 86400);
        expect(await parameters.getRequestDuration(TEST_ADDRESS)).to.equal(86400);
      });

      it("should return the value if registered", async () => {
        await parameters.setRequestDuration(NULL_ADDRESS, 86400);
        expect(await parameters.getRequestDuration(NULL_ADDRESS)).to.equal(86400);
      });

      it("should emit the event", async () => {
        await expect(parameters.setRequestDuration(TEST_ADDRESS, 86400)).to.emit(parameters, "LockupSet");
      });
    });

    describe("setUnlockGracePeriod", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setUnlockGracePeriod(TEST_ADDRESS, 86400);
        expect(await parameters.getUnlockGracePeriod(TEST_ADDRESS)).to.equal(86400);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setUnlockGracePeriod(TEST_ADDRESS, 86400)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setUnlockGracePeriod(ZERO_ADDRESS, 86400);
        expect(await parameters.getUnlockGracePeriod(TEST_ADDRESS)).to.equal(86400);
      });

      it("should return the value if registered", async () => {
        await parameters.setUnlockGracePeriod(NULL_ADDRESS, 86400);
        expect(await parameters.getUnlockGracePeriod(NULL_ADDRESS)).to.equal(86400);
      });

      it("should emit the event", async () => {
        await expect(parameters.setUnlockGracePeriod(TEST_ADDRESS, 86400)).to.emit(parameters, "GraceSet");
      });
    });

    describe("setMaxInsureSpan", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setMaxInsureSpan(ZERO_ADDRESS, 604800);
        expect(await parameters.getMaxInsureSpan(TEST_ADDRESS)).to.equal(604800);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setMaxInsureSpan(TEST_ADDRESS, 604800)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setMaxInsureSpan(ZERO_ADDRESS, 604800);
        expect(await parameters.getMaxInsureSpan(TEST_ADDRESS)).to.equal(604800);
      });

      it("should return the value if registered", async () => {
        await parameters.setMaxInsureSpan(NULL_ADDRESS, 604800);
        expect(await parameters.getMaxInsureSpan(NULL_ADDRESS)).to.equal(604800);
      });

      it("should emit the event", async () => {
        await expect(parameters.setMaxInsureSpan(TEST_ADDRESS, 604800)).to.emit(parameters, "MaxDateSet");
      });
    });
    describe("setMinInsureSpan", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setMaxInsureSpan(TEST_ADDRESS, 604801);
        await parameters.setMinInsureSpan(TEST_ADDRESS, 604800);
        expect(await parameters.getMinInsureSpan(TEST_ADDRESS)).to.equal(604800);
      });

      it("should only allow setting attempt by the admin", async () => {
        await parameters.setMaxInsureSpan(TEST_ADDRESS, 604801);
        await expect(parameters.connect(alice).setMinInsureSpan(TEST_ADDRESS, 604800)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setMaxInsureSpan(ZERO_ADDRESS, 604801);
        await parameters.setMinInsureSpan(ZERO_ADDRESS, 604800);
        expect(await parameters.getMinInsureSpan(TEST_ADDRESS)).to.equal(604800);
      });

      it("should return the value if registered", async () => {
        await parameters.setMaxInsureSpan(NULL_ADDRESS, 604801);
        await parameters.setMinInsureSpan(NULL_ADDRESS, 604800);
        expect(await parameters.getMinInsureSpan(NULL_ADDRESS)).to.equal(604800);
      });

      it("should emit the event", async () => {
        await parameters.setMaxInsureSpan(TEST_ADDRESS, 604801);
        await expect(parameters.setMinInsureSpan(TEST_ADDRESS, 604800)).to.emit(parameters, "MinDateSet");
      });
    });

    describe("setUpperSlack", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setUpperSlack(TEST_ADDRESS, 5000);
        expect(await parameters.getUpperSlack(TEST_ADDRESS)).to.equal(5000);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setUpperSlack(TEST_ADDRESS, 5000)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setUpperSlack(ZERO_ADDRESS, 5000);
        expect(await parameters.getUpperSlack(TEST_ADDRESS)).to.equal(5000);
      });

      it("should return the value if registered", async () => {
        await parameters.setUpperSlack(TEST_ADDRESS, 50000);
        expect(await parameters.getUpperSlack(TEST_ADDRESS)).to.equal(50000);
      });

      it("should emit the event", async () => {
        await expect(parameters.setUpperSlack(TEST_ADDRESS, 5000)).to.emit(parameters, "UpperSlack");
      });
    });

    describe("setLowerSlack", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setUpperSlack(TEST_ADDRESS, 6000);
        await parameters.setLowerSlack(TEST_ADDRESS, 5000);
        expect(await parameters.getLowerSlack(TEST_ADDRESS)).to.equal(5000);
      });

      it("should only allow setting attempt by the admin", async () => {
        await parameters.setUpperSlack(TEST_ADDRESS, 6000);
        await expect(parameters.connect(alice).setLowerSlack(TEST_ADDRESS, 5000)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setUpperSlack(ZERO_ADDRESS, 6000);
        await parameters.setLowerSlack(ZERO_ADDRESS, 5000);
        expect(await parameters.getLowerSlack(TEST_ADDRESS)).to.equal(5000);
      });

      it("should return the value if registered", async () => {
        await parameters.setUpperSlack(TEST_ADDRESS, 60000);
        await parameters.setLowerSlack(TEST_ADDRESS, 50000);
        expect(await parameters.getLowerSlack(TEST_ADDRESS)).to.equal(50000);
      });

      it("should emit the event", async () => {
        await parameters.setUpperSlack(TEST_ADDRESS, 6000);
        await expect(parameters.setLowerSlack(TEST_ADDRESS, 5000)).to.emit(parameters, "LowerSlack");
      });
    });
    describe("setWithdrawableTime", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setWithdrawableTime(TEST_ADDRESS, 604800);
        expect(await parameters.getWithdrawableTime(TEST_ADDRESS)).to.equal(604800);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setWithdrawableTime(TEST_ADDRESS, 604800)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setWithdrawableTime(ZERO_ADDRESS, 604800);
        expect(await parameters.getWithdrawableTime(TEST_ADDRESS)).to.equal(604800);
      });

      it("should return the value if registered", async () => {
        await parameters.setWithdrawableTime(TEST_ADDRESS, 1000);
        expect(await parameters.getWithdrawableTime(TEST_ADDRESS)).to.equal(1000);
      });

      it("should emit the event", async () => {
        await expect(parameters.setWithdrawableTime(TEST_ADDRESS, 604800)).to.emit(parameters, "WithdrawableSet");
      });
    });

    describe("setCondition", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setCondition(
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000001"
        );

        expect(
          await parameters.getCondition("0x0000000000000000000000000000000000000000000000000000000000000000")
        ).to.equal("0x0000000000000000000000000000000000000000000000000000000000000001");
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(
          parameters
            .connect(alice)
            .setCondition(
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000001"
            )
        ).to.revertedWith("Caller is not allowed to operate");
      });

      it("should return the value if registered", async () => {
        await parameters.setCondition(
          "0x0000000000000000000000000000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000000000000000000000000000002"
        );
        expect(
          await parameters.getCondition("0x0000000000000000000000000000000000000000000000000000000000000001")
        ).to.equal("0x0000000000000000000000000000000000000000000000000000000000000002");
      });

      it("should emit the event", async () => {
        await expect(
          parameters.setCondition(
            "0x0000000000000000000000000000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000000000000000000000000000002"
          )
        ).to.emit(parameters, "ConditionSet");
      });
    });

    describe("setMaxList", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setMaxList(TEST_ADDRESS, 10);
        expect(await parameters.getMaxList(TEST_ADDRESS)).to.equal(10);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setMaxList(TEST_ADDRESS, 10)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setMaxList(ZERO_ADDRESS, 10);
        expect(await parameters.getMaxList(TEST_ADDRESS)).to.equal(10);
      });

      it("should return the value if registered", async () => {
        await parameters.setMaxList(TEST_ADDRESS, 100);
        expect(await parameters.getMaxList(TEST_ADDRESS)).to.equal(100);
      });

      it("should emit the event", async () => {
        await expect(parameters.setMaxList(TEST_ADDRESS, 10)).to.emit(parameters, "MaxListSet");
      });
    });
    describe("setFeeRate", function () {
      it("should allow setting by the admin address", async () => {
        await parameters.setFeeRate(TEST_ADDRESS, 20000);
        expect(await parameters.getFeeRate(TEST_ADDRESS)).to.equal(20000);
      });

      it("should only allow setting attempt by the admin", async () => {
        await expect(parameters.connect(alice).setFeeRate(TEST_ADDRESS, 20000)).to.revertedWith(
          "Caller is not allowed to operate"
        );
      });

      it("should return the dafault value if the address not registered", async () => {
        await parameters.setFeeRate(ZERO_ADDRESS, 20000);
        expect(await parameters.getFeeRate(TEST_ADDRESS)).to.equal(20000);
      });

      it("should return the value if registered", async () => {
        await parameters.setFeeRate(NULL_ADDRESS, 10000);
        expect(await parameters.getFeeRate(NULL_ADDRESS)).to.equal(10000);
      });

      it("should emit the event", async () => {
        await expect(parameters.setFeeRate(TEST_ADDRESS, 20000)).to.emit(parameters, "FeeRateSet");
      });
    });
  });
});
