const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("CDS", function () {
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

    console.log();

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
    await parameters.setPremium2(ZERO_ADDRESS, "2000");
    await parameters.setFee2(ZERO_ADDRESS, "1000");
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
    await index.setLeverage("20000");
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
      expect(await index.totalAllocPoint()).to.equal("1000");
      expect(await index.targetLev()).to.equal("20000");
    });
  });
  describe("iToken", function () {
    beforeEach(async () => {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 10000);
      await dai.connect(chad).approve(vault.address, 10000);

      await cds.connect(alice).deposit("10000");
      await cds.connect(bob).deposit("10000");
      await cds.connect(chad).deposit("10000");
    });

    describe("allowance", function () {
      it("returns no allowance", async function () {
        expect(await cds.allowance(alice.address, tom.address)).to.equal("0");
      });
      it("approve/ increases/ decrease change allowance", async function () {
        await cds.connect(alice).approve(tom.address, 5000);
        expect(await cds.allowance(alice.address, tom.address)).to.equal(
          "5000"
        );
        await cds.connect(alice).decreaseAllowance(tom.address, "5000");
        expect(await cds.allowance(alice.address, tom.address)).to.equal("0");
        await cds.connect(alice).increaseAllowance(tom.address, "10000");
        expect(await cds.allowance(alice.address, tom.address)).to.equal(
          "10000"
        );
      });
    });

    describe("total supply", function () {
      it("returns the total amount of tokens", async function () {
        expect(await cds.totalSupply()).to.equal("29700");
      });
    });

    describe("balanceOf", function () {
      context("when the requested account has no tokens", function () {
        it("returns zero", async function () {
          expect(await cds.balanceOf(tom.address)).to.equal("0");
        });
      });

      context("when the requested account has some tokens", function () {
        it("returns the total amount of tokens", async function () {
          expect(await cds.balanceOf(alice.address)).to.equal("9900");
        });
      });
    });

    describe("transfer", function () {
      context("when the recipient is not the zero address", function () {
        context("when the sender does not have enough balance", function () {
          it("reverts", async function () {
            await expect(
              cds.connect(alice).transfer(tom.address, "9901")
            ).to.revertedWith("SafeMath: subtraction overflow");
          });
        });

        context("when the sender has enough balance", function () {
          it("transfers the requested amount", async function () {
            await cds.connect(alice).transfer(tom.address, "9900");
            expect(await cds.balanceOf(alice.address)).to.equal("0");
            expect(await cds.balanceOf(tom.address)).to.equal("9900");
          });
        });
      });

      context("when the recipient is the zero address", function () {
        it("reverts", async function () {
          await expect(
            cds.connect(tom).transfer(ZERO_ADDRESS, 10000)
          ).to.revertedWith("ERC20: TRANSFER_BAD_CONDITIONS");
        });
      });
    });
  });
  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await cds.totalSupply()).to.equal("0");
      expect(await cds.totalLiquidity()).to.equal("0");
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");
      expect(await cds.totalSupply()).to.equal("9900");
      expect(await cds.totalLiquidity()).to.equal("9900");
      expect(await vault.valueAll()).to.equal("10000");
      expect(await vault.totalAttributions()).to.equal("10000");
      expect(await vault.underlyingValue(cds.address)).to.equal("9900");
      expect(await vault.attributions(cds.address)).to.equal("9900");
      let bnresult = await BigNumber.from("1000000000000000000");
      expect(await cds.rate()).to.equal(bnresult);
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await cds.connect(alice).withdraw("9900");
      expect(await cds.totalSupply()).to.equal("0");
      expect(await cds.totalLiquidity()).to.equal("0");
    });

    it("DISABLES withdraw more than balance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await cds.totalSupply()).to.equal("0");
      expect(await cds.totalLiquidity()).to.equal("0");
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");
      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(cds.connect(alice).withdraw("20000")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });

    it("DISABLES withdraw zero balance", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await cds.totalSupply()).to.equal("0");
      expect(await cds.totalLiquidity()).to.equal("0");
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");

      await ethers.provider.send("evm_increaseTime", [86400 * 8]);
      await expect(cds.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });

    it("DISABLES withdraw until lockup period ends", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      expect(await cds.totalSupply()).to.equal("0");
      expect(await cds.totalLiquidity()).to.equal("0");
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");
      await expect(cds.connect(alice).withdraw("9900")).to.revertedWith(
        "ERROR: WITHDRAWAL_BAD_CONDITIONS"
      );
    });

    it("accrues premium after deposit", async function () {
      await dai.connect(alice).approve(vault.address, 10000);
      await dai.connect(bob).approve(vault.address, 20000);
      expect(await cds.totalSupply()).to.equal("0");
      expect(await cds.totalLiquidity()).to.equal("0");
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");
      let bnresult = await BigNumber.from("1000000000000000000");
      expect(await cds.rate()).to.equal(bnresult);
      await index.connect(bob).deposit("10000");
      bnresult = await BigNumber.from("1020202020202020202");
      expect(await cds.rate()).to.equal(bnresult);
      expect(await dai.balanceOf(bob.address)).to.closeTo("90000", "5"); //verify
      expect(await cds.totalLiquidity()).to.closeTo("10100", "5");
      expect(await vault.underlyingValue(creator.address)).to.closeTo(
        "200",
        "5"
      );
      //withdrawal also harvest accrued premium
      await ethers.provider.send("evm_increaseTime", [86400 * 10]);
      await cds.connect(alice).withdraw("9900");
      //Harvested premium is reflected on their account balance
      expect(await dai.balanceOf(alice.address)).to.closeTo("100100", "3"); //verify
    });

    it("DISABLE deposit when locked(withdrawal is possible)", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");
      expect(await cds.totalSupply()).to.equal("9900");
      expect(await cds.totalLiquidity()).to.equal("9900");
      await cds.setPaused(true);
      await expect(cds.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
    });

    it("devaluate underlying when cover claim is accepted", async function () {
      await dai.connect(alice).approve(vault.address, 20000);
      await cds.connect(alice).deposit("10000");
      await cds.connect(alice).requestWithdraw("9900");
      expect(await cds.totalSupply()).to.equal("9900");
      expect(await cds.totalLiquidity()).to.equal("9900");
      await index.connect(alice).deposit("1000");
      expect(await index.totalSupply()).to.equal("970");
      expect(await index.totalLiquidity()).to.equal("970");
      expect(await market1.totalLiquidity()).to.equal("19400");
      expect(await cds.totalLiquidity()).to.equal("9920");
      expect(await vault.underlyingValue(market1.address)).to.equal("0");
      expect(await vault.underlyingValue(index.address)).to.equal("970");
      expect(await vault.underlyingValue(cds.address)).to.equal("9920");
      await dai.connect(bob).approve(vault.address, 10000);
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 8);
      await market1
        .connect(bob)
        .insure(
          "9000",
          "10000",
          86400 * 8,
          "0x4e69636b00000000000000000000000000000000000000000000000000000000"
        );
      expect(await dai.balanceOf(bob.address)).to.closeTo("99974", "2");
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

      await market1.connect(bob).redeem("0");
      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      expect(await dai.balanceOf(bob.address)).to.closeTo("104474", "2");
      expect(await index.totalSupply()).to.equal("970");
      expect(await market1.totalLiquidity()).to.closeTo("0", "1");
      expect(await index.totalLiquidity()).to.closeTo("0", "1");
      expect(await cds.totalLiquidity()).to.closeTo("6413", "1");
      expect(await vault.underlyingValue(index.address)).to.closeTo("0", "1");

      await ethers.provider.send("evm_increaseTime", [86400 * 11]);
      await market1.resume();
      await cds.connect(alice).withdraw("9900");
      expect(await dai.balanceOf(alice.address)).to.closeTo("95415", "5"); //verify
      expect(await dai.balanceOf(bob.address)).to.closeTo("104470", "5"); //verify
    });
  });
  describe("Admin functions", function () {
    it("allows changing metadata", async function () {
      expect(await cds.metadata()).to.equal("Here is metadata.");
      await cds.changeMetadata("new metadata");
      expect(await cds.metadata()).to.equal("new metadata");
    });
  });
});
