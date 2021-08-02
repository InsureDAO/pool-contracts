const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("Pool", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    //import
    [creator, alice, bob, chad, tom] = await ethers.getSigners();
    const DAI = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
    const CDS = await ethers.getContractFactory("CDS");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const FeeModel = await ethers.getContractFactory("FeeModel");
    const PremiumModel = await ethers.getContractFactory("PremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("Controller");

    //deploy
    dai = await DAI.deploy();
    registry = await Registry.deploy();
    factory = await Factory.deploy(registry.address);
    fee = await FeeModel.deploy();
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(dai.address, creator.address);
    vault = await Vault.deploy(
      dai.address,
      registry.address,
      controller.address
    );
    poolTemplate = await PoolTemplate.deploy();
    parameters = await Parameters.deploy(creator.address);

    //set up
    await dai.mint(chad.address, (100000).toString());
    await dai.mint(bob.address, (100000).toString());
    await dai.mint(alice.address, (100000).toString());

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false);
    await factory.approveReference(
      poolTemplate.address,
      0,
      parameters.address,
      true
    );
    await factory.approveReference(
      poolTemplate.address,
      1,
      vault.address,
      true
    );
    await factory.approveReference(
      poolTemplate.address,
      2,
      registry.address,
      true
    );

    await premium.setPremium("2000", "50000");
    await fee.setFee("10000");
    await parameters.setPremium2(ZERO_ADDRESS, "2000");
    await parameters.setFee2(ZERO_ADDRESS, "1000");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "2592000");

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [0, 0],
      [parameters.address, vault.address, registry.address]
    );
    const marketAddress = await factory.markets(0);
    market = await PoolTemplate.attach(marketAddress);
  });

  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(dai.address).to.exist;
      expect(factory.address).to.exist;
      expect(poolTemplate.address).to.exist;
      expect(parameters.address).to.exist;
      expect(vault.address).to.exist;
      expect(market.address).to.exist;
    });
  });

  describe("iToken", function () {
    beforeEach(async () => {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      await dai.connect(chad).approve(vault.address, 10000);

      await market.connect(alice).deposit("10000");
      await market.connect(bob).deposit("10000");
      await market.connect(chad).deposit("10000");
    });

    describe("allowance", function () {
      it("returns no allowance", async function () {
        expect(await market.allowance(alice.address, tom.address)).to.equal(
          "0"
        );
      });
      it("approve/ increases/ decrease change allowance", async function () {
        await market.connect(alice).approve(tom.address, 5000);
        expect(await market.allowance(alice.address, tom.address)).to.equal(
          "5000"
        );
        await market.connect(alice).decreaseAllowance(tom.address, "5000");
        expect(await market.allowance(alice.address, tom.address)).to.equal(
          "0"
        );
        await market.connect(alice).increaseAllowance(tom.address, "10000");
        expect(await market.allowance(alice.address, tom.address)).to.equal(
          "10000"
        );
      });
    });

    describe("total supply", function () {
      it("returns the total amount of tokens", async function () {
        expect(await market.totalSupply()).to.equal("30000");
      });
    });

    describe("balanceOf", function () {
      context("when the requested account has no tokens", function () {
        it("returns zero", async function () {
          expect(await market.balanceOf(tom.address)).to.equal("0");
        });
      });

      context("when the requested account has some tokens", function () {
        it("returns the total amount of tokens", async function () {
          expect(await market.balanceOf(alice.address)).to.equal("10000");
        });
      });
    });

    describe("transfer", function () {
      context("when the recipient is not the zero address", function () {
        context("when the sender does not have enough balance", function () {
          it("reverts", async function () {
            await expect(
              market.connect(alice).transfer(tom.address, "10001")
            ).to.revertedWith("SafeMath: subtraction overflow");
          });
        });

        context("when the sender has enough balance", function () {
          it("transfers the requested amount", async function () {
            await market.connect(alice).transfer(tom.address, "10000");
            expect(await market.balanceOf(alice.address)).to.equal("0");
            expect(await market.balanceOf(tom.address)).to.equal("10000");
          });
        });
      });

      context("when the recipient is the zero address", function () {
        it("reverts", async function () {
          await expect(
            market.connect(tom).transfer(ZERO_ADDRESS, 10000)
          ).to.revertedWith("ERC20: TRANSFER_BAD_CONDITIONS");
        });
      });
    });
  });

  describe("Parameters", function () {
    describe("get premium", function () {
      context("365 days", function () {
        it("returns premium", async function () {
          expect(
            await parameters.getPremium(
              "100000",
              "31536000",
              "1000000",
              "500000",
              ZERO_ADDRESS
            )
          ).to.equal("29500");
        });
      });
      context("30 days", function () {
        it("returns premium", async function () {
          expect(
            await parameters.getPremium(
              "100000",
              "2592000",
              "1000000",
              "500000",
              ZERO_ADDRESS
            )
          ).to.equal("2424");
        });
      });
    });
    describe("get fee", function () {
      context("100000", function () {
        it("returns fee", async function () {
          expect(await parameters.getFee("100000", ZERO_ADDRESS)).to.equal(
            "10000"
          );
        });
      });
    });
    describe("get lockup", function () {
      it("returns lockup period", async function () {
        expect(await parameters.getLockup(ZERO_ADDRESS)).to.equal("604800");
      });
    });
    describe("get grace", function () {
      it("returns garace period", async function () {
        expect(await parameters.getGrace(ZERO_ADDRESS)).to.equal("259200");
      });
    });
  });

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      const bnresult = await BigNumber.from(10).pow(18);
      expect(await market.rate()).to.equal(bnresult);
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await market.connect(alice).withdraw("10000");
      expect(await market.totalSupply()).to.equal("0");
      expect(await market.totalLiquidity()).to.equal("0");
    });
    it("DISABLES withdraw when not requested", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("DISABLES withdraw more than requested", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(market.connect(alice).withdraw("100000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await market.connect(alice).withdraw("5000");
      expect(await market.totalSupply()).to.equal("5000");
      expect(await market.totalLiquidity()).to.equal("5000");
    });
    it("DISABLES withdraw if withdrawable span ended", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 40]);
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("DISABLES withdraw request more than balance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await expect(
        market.connect(alice).requestWithdraw("100000")
      ).to.revertedWith("ERROR: WITHDRAW_REQUEST_BAD_CONDITIONS");
    });
    it("DISABLES withdraw zero balance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(market.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("DISABLES withdraw when liquidity is locked for insurance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 10);
      await dai.connect(bob).approve(vault.address, 10000);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 10,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("allows unlock liquidity only after an insurance period over", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      expect(await vault.attributions(market.address)).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await dai.connect(bob).approve(vault.address, 10000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 12]);
      await market.unlock("0");
      expect(await vault.attributions(market.address)).to.equal("10054");
      expect(await vault.attributions(creator.address)).to.equal("5");
      expect(await vault.totalAttributions()).to.equal("10059");
      await market.connect(alice).withdraw("10000");
      expect(await market.totalLiquidity()).to.equal("0");
      expect(await vault.totalAttributions()).to.equal("5");
    });
    it("also decrease withdrawal request when transefered", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      expect(await vault.attributions(market.address)).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await market.connect(alice).transfer(tom.address, 5000);
      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await market.connect(alice).withdraw("5000");
      expect(await market.totalLiquidity()).to.equal("5000");
    });
    it("accrues premium after deposit", async function () {
      //deposit by Alice
      await dai.connect(alice).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      expect(await vault.attributions(market.address)).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      let bnresult = await BigNumber.from(10).pow(18);
      expect(await market.rate()).to.equal(bnresult);
      //apply protection by Bob
      await dai.connect(bob).approve(vault.address, 20000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 365);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );

      //Alice should have accrued premium paid by Bob
      expect(await dai.balanceOf(bob.address)).to.closeTo("97303", "3"); //verify
      expect(await market.valueOfUnderlying(alice.address)).to.closeTo(
        "12429",
        "0"
      ); //verify
      expect(await market.totalLiquidity()).to.closeTo("12428", "3");
      expect(await vault.attributions(creator.address)).to.closeTo("269", "3"); //verify
      bnresult = await BigNumber.from("1242900000000000000");
      expect(await market.rate()).to.equal(bnresult);
      //additional deposit by Chad, which does not grant any right to withdraw premium before deposit
      await dai.connect(chad).approve(vault.address, 10000);
      await market.connect(chad).deposit("10000");
      expect(await market.balanceOf(chad.address)).to.closeTo("8046", "3");
      expect(await market.valueOfUnderlying(chad.address)).to.closeTo(
        "10000",
        "1"
      );
      expect(await market.totalLiquidity()).to.closeTo("22428", "3");
      //the premium paid second time should be allocated to both Alice and Chad
      //but the premium paid first time should be directly go to Alice
      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 365);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        ); //premium = 3,543//verify
      expect(await dai.balanceOf(bob.address)).to.closeTo("93762", "5"); //verify
      expect(await market.valueOfUnderlying(alice.address)).to.closeTo(
        "14194",
        "5"
      ); //verify
      expect(await market.valueOfUnderlying(chad.address)).to.closeTo(
        "11420",
        "5"
      ); //verify
      expect(await market.totalLiquidity()).to.closeTo("25616", "3");
      //withdrawal also harvest accrued premium
      await ethers.provider.send("evm_increaseTime", [86400 * 369]);
      await market.connect(alice).requestWithdraw("10000");
      await market.unlockBatch(["0", "1"]);
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await market.connect(alice).withdraw("10000");
      //Harvested premium is reflected on their account balance
      expect(await dai.balanceOf(alice.address)).to.closeTo("104193", "5"); //verify
      expect(await dai.balanceOf(chad.address)).to.closeTo("90000", "5"); //verify
    });

    it("DISABLE deposit when paused(withdrawal is possible)", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");
      await market.setPaused(true);
      await expect(market.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("100000");
    });

    it("DISABLE deposit and withdrawal when payingout", async function () {
      //Can deposit and withdraw in normal time
      await dai.connect(alice).approve(vault.address, 40000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");

      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("100000");
      //Cannot deposit and withdraw when payingout
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      let incident = await currentTimestamp.sub(86400 * 2);
      await market.applyCover(
        "604800",
        incident,
        10000,
        10000,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await expect(market.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await expect(market.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 11]);
      await market.resume();
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("100000");
    });

    it("devaluate underlying but premium is not affected when cover claim is accepted", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      //Simulation: partial payout
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");

      await dai.connect(bob).approve(vault.address, 10000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await dai.balanceOf(bob.address)).to.closeTo("99941", "1"); //verify
      expect(await vault.attributions(creator.address)).to.closeTo("5", "0"); //verify
      expect(await vault.attributions(market.address)).to.closeTo("10054", "0"); //verify
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await market.connect(bob).redeem("0");
      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.closeTo("5055", "1");
      expect(await market.valueOfUnderlying(alice.address)).to.closeTo(
        "5055",
        "1"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 11]);
      await market.resume();

      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.closeTo("95055", "3"); //verify
      expect(await dai.balanceOf(bob.address)).to.closeTo("104940", "3"); //verify

      //Simulation: full payout
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");

      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 8);

      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        10000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await market.connect(bob).redeem("1");

      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("55");
      expect(await market.valueOfUnderlying(alice.address)).to.equal("55");
      await ethers.provider.send("evm_increaseTime", [86400 * 11]);
      await market.resume();
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.closeTo("85110", "3"); //verify
      expect(await dai.balanceOf(bob.address)).to.closeTo("114880", "3"); //verify
    });
  });

  describe("Getting insured", function () {
    it("allows protection", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      expect(await market.totalSupply()).to.equal("10000");
      expect(await market.totalLiquidity()).to.equal("10000");

      await dai.connect(bob).approve(vault.address, 10000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );

      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await market.connect(bob).redeem("0");
      await ethers.provider.send("evm_increaseTime", [86400 * 12]);
      await market.resume();
      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.closeTo("95055", "1");
      expect(await dai.balanceOf(bob.address)).to.closeTo("104940", "1");
    });

    it("calculate premium", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      let duration = 86400 * 365;
      expect(await market.getPremium("1000", duration)).to.equal("45");
    });

    it("allows insurance transfer", async function () {
      await dai.connect(alice).approve(vault.address, 40000);
      await dai.connect(bob).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );

      await market.connect(bob).transferInsurance("0", tom.address);
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );

      await market.connect(tom).redeem("0");
      await ethers.provider.send("evm_increaseTime", [86400 * 11]);
      await market.resume();
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("95055");
      expect(await dai.balanceOf(tom.address)).to.equal("4999");
    });

    it("DISALLOWS getting insured when there is not enough liquidity", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await market.connect(alice).deposit("100");
      await market.connect(alice).requestWithdraw("100");

      await dai.connect(alice).approve(vault.address, 10000);

      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await expect(
        market
          .connect(bob)
          .insure(
            "9999",
            "10000",
            86400 * 8,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_BAD_CONDITIONS");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await market.connect(alice).withdraw("100");
      expect(await dai.balanceOf(alice.address)).to.equal("100000");
    });

    it("DISALLOWS redemption when redemption period is over", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await dai.connect(bob).approve(vault.address, 10000);
      await market.connect(alice).deposit("10000");
      await market.connect(alice).requestWithdraw("10000");

      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 12]);

      await market.resume();
      await expect(market.connect(bob).redeem("0")).to.revertedWith(
        "ERROR: INSURANCE_NOT_APPLICABLE"
      );
      await market.unlock("0");
      await market.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("100054");
    });

    it("DISALLOWS getting insured when paused, reporting, or payingout", async function () {
      //Can get insured in normal time
      await dai.connect(alice).approve(vault.address, 40000);
      await dai.connect(bob).approve(vault.address, 20000);
      await market.connect(alice).deposit("40000");
      await market.connect(alice).requestWithdraw("10000");

      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );

      //Cannot get insured when payingout
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        10000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 5);

      await expect(
        market
          .connect(bob)
          .insure(
            "9999",
            "10000",
            86400 * 5,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_BAD_CONDITIONS");

      await ethers.provider.send("evm_increaseTime", [86400 * 11]);

      await market.resume();
      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 8);

      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      //Cannot get insured when paused
      await market.setPaused(true);
      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 8);
      await expect(
        market
          .connect(bob)
          .insure(
            "9999",
            "10000",
            86400 * 8,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_BAD_CONDITIONS");
      await market.setPaused(false);
      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 8);

      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
    });

    it("DISALLOWS more than 365 days insurance", async function () {
      //Can get insured in normal time
      await dai.connect(alice).approve(vault.address, 40000);
      await dai.connect(bob).approve(vault.address, 20000);
      await market.connect(alice).deposit("40000");
      await market.connect(alice).requestWithdraw("10000");

      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 365);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      //Cannot get insured for more than 365 days
      //endTime = await currentTimestamp.add(86400 * 400);
      await expect(
        market
          .connect(bob)
          .insure(
            "9999",
            "10000",
            86400 * 400,
            "0x4e69636b00000000000000000000000000000000000000000000000000000000"
          )
      ).to.revertedWith("ERROR: INSURE_BAD_CONDITIONS");
    });

    it("DISALLOWS insurance transfer if its expired or non existent", async function () {
      await dai.connect(alice).approve(vault.address, 40000);
      await dai.connect(bob).approve(vault.address, 10000);

      await market.connect(alice).deposit("40000");
      await market.connect(alice).requestWithdraw("10000");

      //when expired
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      await ethers.provider.send("evm_increaseTime", [86400 * 9]);
      await expect(
        market.connect(bob).transferInsurance("0", tom.address)
      ).to.revertedWith("ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS");

      //when already redeemed
      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 8);
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await market.connect(bob).redeem("1");
      await expect(
        market.connect(bob).transferInsurance("1", tom.address)
      ).to.revertedWith("ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS");
    });
  });

  describe("Utilities", function () {
    it("retunrs accurate data", async function () {
      await dai.connect(alice).approve(vault.address, 40000);
      await dai.connect(bob).approve(vault.address, 10000);
      await dai.connect(chad).approve(vault.address, 10000);
      await market.connect(alice).deposit("40000");
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 365);
      expect(await market.utilizationRate()).to.equal("0");
      await market
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      await market
        .connect(chad)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000001"
        );
      expect(await market.allInsuranceCount()).to.equal("2");
      expect(await market.getInsuranceCount(bob.address)).to.equal("1");
      expect(await market.getInsuranceCount(chad.address)).to.equal("1");
      expect(await market.utilizationRate()).to.equal("46969020");
    });
  });

  describe("Admin functions", function () {
    it("allows changing metadata", async function () {
      expect(await market.metadata()).to.equal("Here is metadata.");
      const latest = `{
            subject: "これは日本語だよ　这个是中文　TEST TEXTS",
            options: [“Yes”, “No”],
            description: "The website is compliant. This will release the funds to Alice."
          }`;

      await market.changeMetadata(latest);
      expect(await market.metadata()).to.equal(latest);
    });
  });
});
