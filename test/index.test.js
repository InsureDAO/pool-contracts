const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("Index", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async () => {
    //import
    [creator, alice, bob, chad, tom, minter] = await ethers.getSigners();
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
    cdsTemplate = await CDS.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(creator.address);

    //set up
    await dai.mint(chad.address, (100000).toString());
    await dai.mint(bob.address, (100000).toString());
    await dai.mint(alice.address, (100000).toString());

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false);
    await factory.approveTemplate(indexTemplate.address, true, false);
    await factory.approveTemplate(cdsTemplate.address, true, false);

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

    await factory.approveReference(
      indexTemplate.address,
      0,
      parameters.address,
      true
    );
    await factory.approveReference(
      indexTemplate.address,
      1,
      vault.address,
      true
    );
    await factory.approveReference(
      indexTemplate.address,
      2,
      registry.address,
      true
    );

    await factory.approveReference(
      cdsTemplate.address,
      0,
      parameters.address,
      true
    );
    await factory.approveReference(cdsTemplate.address, 1, vault.address, true);
    await factory.approveReference(
      cdsTemplate.address,
      2,
      registry.address,
      true
    );
    await factory.approveReference(
      cdsTemplate.address,
      3,
      minter.address,
      true
    );

    await premium.setPremium("2000", "50000");
    await fee.setFee("10000");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setFeeModel(ZERO_ADDRESS, fee.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "86400000");

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [0, 0],
      [parameters.address, vault.address, registry.address]
    );

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [0, 0],
      [parameters.address, vault.address, registry.address]
    );
    const marketAddress1 = await factory.markets(0);
    const marketAddress2 = await factory.markets(1);
    market1 = await PoolTemplate.attach(marketAddress1);
    market2 = await PoolTemplate.attach(marketAddress2);

    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [],
      [parameters.address, vault.address, registry.address, minter.address]
    );
    await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      "test-name",
      "test-symbol",
      18,
      [],
      [parameters.address, vault.address, registry.address]
    );
    const marketAddress3 = await factory.markets(2);
    const marketAddress4 = await factory.markets(3);
    cds = await CDS.attach(marketAddress3);
    index = await IndexTemplate.attach(marketAddress4);

    await registry.setCDS(ZERO_ADDRESS, cds.address);

    await index.set(market1.address, "1000");
    await index.set(market2.address, "1000");
    await index.setLeverage("2000");
  });

  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
      expect(dai.address).to.exist;
      expect(factory.address).to.exist;
      expect(parameters.address).to.exist;
      expect(vault.address).to.exist;
      expect(market1.address).to.exist;
      expect(market2.address).to.exist;
      expect(index.address).to.exist;
      expect(cds.address).to.exist;
      expect(await index.totalAllocPoint()).to.equal("2000");
      expect(await index.targetLev()).to.equal("2000");
    });
  });

  describe("iToken", function () {
    beforeEach(async () => {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      await dai.connect(chad).approve(vault.address, 10000);

      await index.connect(alice).deposit("10000");
      await index.connect(bob).deposit("10000");
      await index.connect(chad).deposit("10000");
    });

    describe("allowance", function () {
      it("returns no allowance", async function () {
        expect(await index.allowance(alice.address, tom.address)).to.equal("0");
      });
      it("approve/ increases/ decrease change allowance", async function () {
        await index.connect(alice).approve(tom.address, 5000);
        expect(await index.allowance(alice.address, tom.address)).to.equal(
          "5000"
        );
        await index.connect(alice).decreaseAllowance(tom.address, "5000");
        expect(await index.allowance(alice.address, tom.address)).to.equal("0");
        await index.connect(alice).increaseAllowance(tom.address, "10000");
        expect(await index.allowance(alice.address, tom.address)).to.equal(
          "10000"
        );
      });
    });

    describe("total supply", function () {
      it("returns the total amount of tokens", async function () {
        expect(await index.totalSupply()).to.equal("30000");
      });
    });

    describe("balanceOf", function () {
      context("when the requested account has no tokens", function () {
        it("returns zero", async function () {
          expect(await index.balanceOf(tom.address)).to.equal("0");
        });
      });

      context("when the requested account has some tokens", function () {
        it("returns the total amount of tokens", async function () {
          expect(await index.balanceOf(alice.address)).to.equal("10000");
        });
      });
    });

    describe("transfer", function () {
      context("when the recipient is not the zero address", function () {
        context("when the sender does not have enough balance", function () {
          it("reverts", async function () {
            await expect(
              index.connect(alice).transfer(tom.address, "10001")
            ).to.revertedWith("SafeMath: subtraction overflow");
          });
        });

        context("when the sender has enough balance", function () {
          it("transfers the requested amount", async function () {
            await index.connect(alice).transfer(tom.address, "10000");
            expect(await index.balanceOf(alice.address)).to.equal("0");
            expect(await index.balanceOf(tom.address)).to.equal("10000");
          });
        });
      });

      context("when the recipient is the zero address", function () {
        it("reverts", async function () {
          await expect(
            index.connect(tom).transfer(ZERO_ADDRESS, 10000)
          ).to.revertedWith("ERC20: TRANSFER_BAD_CONDITIONS");
        });
      });
    });
  });

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 20000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");

      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("10000");
      expect(await market2.allocatedCredit(index.address)).to.equal("10000");
      expect(await index.totalAllocatedCredit()).to.equal("20000");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("10000");
      expect(await market2.availableBalance()).to.equal("10000");
      expect(await index.leverage()).to.equal("2000");
      expect(await index.withdrawable()).to.equal("10000");
      let bnresult = await BigNumber.from("1000000000000000000");
      expect(await index.rate()).to.equal(bnresult);
      expect(await vault.attributions(index.address)).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await index.connect(alice).withdraw("10000");
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
    });

    it("DISABLES withdraw more than balance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.withdrawable()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(index.connect(alice).withdraw("100000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("DISABLES withdraw zero balance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");

      expect(await index.withdrawable()).to.equal("10000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(index.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("DISABLES withdraw until lockup period ends", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.withdrawable()).to.equal("10000");
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("DISABLES withdraw when liquidity is locked for insurance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.withdrawable()).to.equal("10000");
      await dai.connect(bob).approve(vault.address, 20000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 365);
      await market1
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await market1.utilizationRate()).to.equal("99990000");
      expect(await market2.utilizationRate()).to.equal("0");

      expect(await index.withdrawable()).to.equal("2429");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });
    it("accrues premium after deposit", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.withdrawable()).to.equal("10000");
      await dai.connect(bob).approve(vault.address, 20000);
      let bnresult = await BigNumber.from("1000000000000000000");
      expect(await index.rate()).to.equal(bnresult);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 365);
      await market1
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 365,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await dai.balanceOf(bob.address)).to.closeTo("97303", "5"); //verify
      expect(await index.totalLiquidity()).to.closeTo("12428", "5");
      expect(await market1.pendingPremium(index.address)).to.closeTo(
        "2428",
        "5"
      ); //verify
      bnresult = await BigNumber.from("1242900000000000000");
      expect(await index.rate()).to.equal(bnresult);
      //withdrawal also harvest accrued premium
      await ethers.provider.send("evm_increaseTime", [86400 * 369]);

      await market1.unlock("0");
      await index.connect(alice).withdraw("10000");

      //Harvested premium is reflected on their account balance
      expect(await dai.balanceOf(alice.address)).to.closeTo("102428", "3"); //verify
    });
    it("also transfers lockup period when iToken is transferred", async function () {
      //deposit by Alice
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.withdrawable()).to.equal("10000");

      //Transferring iToken, which also distribute premium
      await index.connect(alice).transfer(tom.address, "10000");
      await index.connect(tom).requestWithdraw("10000");
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await expect(index.connect(tom).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await index.connect(tom).withdraw("10000");
      expect(await dai.balanceOf(tom.address)).to.equal("10000");
    });
    it("DISABLE deposit when paused(withdrawal is possible)", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      await index.setPaused(true);
      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await index.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("100000");
    });
    it("DISABLE deposit and withdrawal when reporting or payingout", async function () {
      //Can deposit and withdraw in normal time
      await dai.connect(alice).approve(vault.address, 40000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.totalAllocatedCredit()).to.equal("20000");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market1.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 11]);

      await market1.resume();
      await index.resume();
      expect(await index.leverage()).to.equal("2000");
      await index.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.equal("100000");
    });

    it("devaluate underlying when cover claim is accepted", async function () {
      await dai.connect(alice).approve(vault.address, 20000);

      //Simulation: partial payout
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.totalLiquidity()).to.equal("10000");
      expect(await market2.totalLiquidity()).to.equal("10000");

      await dai.connect(bob).approve(vault.address, 10000);

      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market1
        .connect(bob)
        .insure(
          "10000",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await dai.balanceOf(bob.address)).to.closeTo("99941", "2");

      let incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market1.applyCover(
        "604800",
        5000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      expect(await vault.underlyingValue(index.address)).to.closeTo(
        "10000",
        "1"
      );
      expect(await vault.underlyingValue(creator.address)).to.closeTo("5", "1");
      expect(await vault.underlyingValue(market1.address)).to.closeTo(
        "54",
        "1"
      );
      expect(await market1.totalLiquidity()).to.closeTo("10000", "1");

      await market1.connect(bob).redeem("0");
      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      //expect(await dai.balanceOf(bob.address)).to.closeTo("104940", "1");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.closeTo("5054", "1");

      expect(await index.totalAllocatedCredit()).to.closeTo("10108", "2");
      expect(await market2.allocatedCredit(index.address)).to.closeTo(
        "5054",
        "1"
      );
      expect(await market2.totalLiquidity()).to.closeTo("5054", "1");
      expect(await market1.totalLiquidity()).to.closeTo("5054", "1");
      expect(await vault.underlyingValue(index.address)).to.closeTo(
        "5054",
        "1"
      );

      expect(await index.totalLiquidity()).to.closeTo("5054", "1");

      await ethers.provider.send("evm_increaseTime", [86400 * 11]);

      await market1.resume();
      await index.resume();
      await index.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.closeTo("95054", "3"); //verify
      expect(await dai.balanceOf(bob.address)).to.closeTo("104941", "3"); //verify

      //Simulation: full payout
      await index.connect(alice).deposit("10000");
      await index.connect(alice).requestWithdraw("10000");

      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");

      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //endTime = await currentTimestamp.add(86400 * 8);
      await market1
        .connect(bob)
        .insure(
          "10000",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      incident = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      await market1.applyCover(
        "604800",
        10000,
        10000,
        incident,
        ["0x4e69636b00000000000000000000000000000000000000000000000000000000"],
        "metadata"
      );
      await market1.connect(bob).redeem("1");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.closeTo("54", "1");
      expect(await index.valueOfUnderlying(alice.address)).to.closeTo(
        "54",
        "1"
      );
      await ethers.provider.send("evm_increaseTime", [86400 * 11]);
      await market1.resume();
      await index.resume();
      await index.connect(alice).withdraw("10000");
      expect(await dai.balanceOf(alice.address)).to.closeTo("85108", "3"); //verify
      expect(await dai.balanceOf(bob.address)).to.closeTo("114882", "3"); //verify
    });
  });

  describe("Index parameter configurations (case un-equal allocation)", function () {
    beforeEach(async () => {
      //Deploy a new pool
      const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
      await factory.createMarket(
        poolTemplate.address,
        "Here is metadata.",
        "test-name",
        "test-symbol",
        18,
        [0, 0],
        [parameters.address, vault.address, registry.address]
      );
      const marketAddress5 = await factory.markets(4);
      market3 = await PoolTemplate.attach(marketAddress5);
    });
    it("allows new pool addition", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");

      //Case1: Add when no liquidity is locked
      //Expected results: Reallocaet liquidity market1: 5000, market2: 5000, market3: 10000
      await index.set(market3.address, "2000");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("5000");
      expect(await market2.allocatedCredit(index.address)).to.equal("5000");
      expect(await market3.allocatedCredit(index.address)).to.equal("10000");
      expect(await index.totalAllocatedCredit()).to.equal("20000");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("5000");
      expect(await market2.availableBalance()).to.equal("5000");
      expect(await market3.availableBalance()).to.equal("10000");
      expect(await index.leverage()).to.equal("2000");
      expect(await index.withdrawable()).to.equal("10000");
      expect(await vault.attributions(index.address)).to.equal("10000");
      await index.set(market3.address, "0");

      //Case2: Add when liquidity is locked(market1 has locked 50% of index liquidity )
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.totalLiquidity()).to.equal("10000");
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 10);
      await market1
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 10,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await market1.totalLiquidity()).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("1");
      expect(await index.withdrawable()).to.equal("66");

      await index.set(market3.address, "2000");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10066");
      expect(await market1.totalLiquidity()).to.equal("9999");
      expect(await market2.totalLiquidity()).to.closeTo("3377", "1");
      expect(await market1.allocatedCredit(index.address)).to.equal("9999");
      expect(await market2.allocatedCredit(index.address)).to.closeTo(
        "3377",
        "1"
      );
      expect(await market3.allocatedCredit(index.address)).to.closeTo(
        "6755",
        "1"
      );
      expect(await market3.totalLiquidity()).to.closeTo("6755", "1");
    });
    it("allows pool removal", async function () {
      await index.set(market3.address, "1000");
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");

      //before remomval
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("6666");
      expect(await market2.allocatedCredit(index.address)).to.equal("6666");
      expect(await market3.allocatedCredit(index.address)).to.equal("6666");
      expect(await index.totalAllocatedCredit()).to.equal("19998");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("6666");
      expect(await market2.availableBalance()).to.equal("6666");
      expect(await market3.availableBalance()).to.equal("6666");
      expect(await index.leverage()).to.equal("1999");
      expect(await index.withdrawable()).to.equal("10000");
      expect(await vault.attributions(index.address)).to.equal("10000");

      //after remomval
      await index.set(market3.address, "0");
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("10000");
      expect(await market2.allocatedCredit(index.address)).to.equal("10000");
      expect(await market3.allocatedCredit(index.address)).to.equal("0");
      expect(await index.totalAllocatedCredit()).to.equal("20000");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("10000");
      expect(await market2.availableBalance()).to.equal("10000");
      expect(await market3.availableBalance()).to.equal("0");
      expect(await index.leverage()).to.equal("2000");
      expect(await index.withdrawable()).to.equal("10000");
      expect(await vault.attributions(index.address)).to.equal("10000");
    });
    it("allows leverage rate increment", async function () {
      await index.set(market3.address, "1000");
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.connect(alice).deposit("10000");

      //lev 2.0
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("6666");
      expect(await market2.allocatedCredit(index.address)).to.equal("6666");
      expect(await market3.allocatedCredit(index.address)).to.equal("6666");
      expect(await index.totalAllocatedCredit()).to.equal("19998");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("6666");
      expect(await market2.availableBalance()).to.equal("6666");
      expect(await market3.availableBalance()).to.equal("6666");
      expect(await index.leverage()).to.equal("1999");
      expect(await index.withdrawable()).to.equal("10000");
      expect(await vault.attributions(index.address)).to.equal("10000");

      //Lev3.0
      await index.setLeverage("3000");
      await index.adjustAlloc();
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("10000");
      expect(await market2.allocatedCredit(index.address)).to.equal("10000");
      expect(await market3.allocatedCredit(index.address)).to.equal("10000");
      expect(await index.totalAllocatedCredit()).to.equal("30000");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("10000");
      expect(await market2.availableBalance()).to.equal("10000");
      expect(await market3.availableBalance()).to.equal("10000");
      expect(await index.leverage()).to.equal("3000");
      expect(await index.withdrawable()).to.equal("10000");
      expect(await vault.attributions(index.address)).to.equal("10000");
    });
    it("allows leverage rate decrement", async function () {
      await index.set(market3.address, "1000");
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      expect(await index.totalSupply()).to.equal("0");
      expect(await index.totalLiquidity()).to.equal("0");
      await index.setLeverage("3000");
      await index.connect(alice).deposit("10000");

      //Lev3.0
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10000");
      expect(await market1.allocatedCredit(index.address)).to.equal("10000");
      expect(await market2.allocatedCredit(index.address)).to.equal("10000");
      expect(await market3.allocatedCredit(index.address)).to.equal("10000");
      expect(await index.totalAllocatedCredit()).to.equal("30000");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(index.address)).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("10000");
      expect(await market2.availableBalance()).to.equal("10000");
      expect(await market3.availableBalance()).to.equal("10000");
      expect(await index.leverage()).to.equal("3000");
      expect(await index.withdrawable()).to.equal("10000");
      expect(await vault.attributions(index.address)).to.equal("10000");

      //Lev2.0 when liquidity is locked
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 10);
      await market1
        .connect(bob)
        .insure(
          "9999",
          "10000",
          86400 * 10,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await market1.totalLiquidity()).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("1");
      expect(await index.withdrawable()).to.equal("66");
      await index.setLeverage("2000"); //deleverage
      await index.adjustAlloc();
      expect(await index.totalSupply()).to.equal("10000");
      expect(await index.totalLiquidity()).to.equal("10066");
      expect(await market1.allocatedCredit(index.address)).to.equal("9999");
      expect(await market2.allocatedCredit(index.address)).to.equal("5066");
      expect(await market3.allocatedCredit(index.address)).to.equal("5066");
      expect(await index.totalAllocatedCredit()).to.equal("20131");
      expect(await vault.valueAll()).to.equal("10073");
      expect(await vault.totalAttributions()).to.equal("10073");
      expect(await vault.underlyingValue(index.address)).to.equal("10066");
      expect(await market1.availableBalance()).to.equal("0");
      expect(await market2.availableBalance()).to.equal("5066");
      expect(await market3.availableBalance()).to.equal("5066");
      expect(await index.leverage()).to.equal("1999");
      expect(await index.withdrawable()).to.equal("0");
      expect(await vault.attributions(index.address)).to.equal("10066");
    });
  });

  describe("Admin functions", function () {
    it("allows changing metadata", async function () {
      expect(await index.metadata()).to.equal("Here is metadata.");
      await index.changeMetadata("new metadata");
      expect(await index.metadata()).to.equal("new metadata");
    });
  });
});
