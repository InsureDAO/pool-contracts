const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalances,
  verifyPoolsStatus,
  verifyPoolsStatusForIndex,
  verifyIndexStatus,
  verifyIndexStatusOf,
  verifyIndexStatusOfPool,
  verifyCDSStatus,
  verifyVaultStatus,
  verifyVaultStatusOf,
} = require("../test-utils");

const {
  ZERO_ADDRESS,
  TEST_ADDRESS,
  NULL_ADDRESS,
  long,
  wrong,
  short,
  YEAR,
  WEEK,
  DAY,
  ZERO,
} = require("../constant-utils");

async function snapshot() {
  return network.provider.send("evm_snapshot", []);
}

async function restore(snapshotId) {
  return network.provider.send("evm_revert", [snapshotId]);
}

async function now() {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

async function moveForwardPeriods(days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true;
}

async function setNextBlock(time) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [time.toNumber()]);
}

describe("Index", function () {
  const initialMint = BigNumber.from("100000");

  const depositAmount = BigNumber.from("10000");
  const depositAmountLarge = BigNumber.from("40000");
  const defaultRate = BigNumber.from("1000000");

  const defaultLeverage = BigNumber.from("1000000");
  let targetLeverage = defaultLeverage.mul(2);

  const governanceFeeRate = BigNumber.from("100000"); //10%
  const RATE_DIVIDER = BigNumber.from("1000000");
  const UTILIZATION_RATE_LENGTH_1E6 = BigNumber.from("1000000");
  const target = ethers.utils.hexZeroPad("0x1", 32);

  const applyCover = async ({
    pool,
    pending,
    targetAddress,
    payoutNumerator,
    payoutDenominator,
    incidentTimestamp,
  }) => {
    const padded1 = ethers.utils.hexZeroPad("0x1", 32);
    const padded2 = ethers.utils.hexZeroPad("0x2", 32);

    const getLeaves = (target) => {
      return [
        { id: padded1, account: target },
        { id: padded1, account: TEST_ADDRESS },
        { id: padded2, account: TEST_ADDRESS },
        { id: padded2, account: NULL_ADDRESS },
        { id: padded1, account: NULL_ADDRESS },
      ];
    };

    //test for pools
    const encoded = (target) => {
      const list = getLeaves(target);

      return list.map(({ id, account }) => {
        return ethers.utils.solidityKeccak256(
          ["bytes32", "address"],
          [id, account]
        );
      });
    };

    const leaves = encoded(targetAddress);
    const tree = await new MerkleTree(leaves, keccak256, { sort: true });
    const root = await tree.getHexRoot();
    const leaf = leaves[0];
    const proof = await tree.getHexProof(leaf);

    await pool.applyCover(
      pending,
      payoutNumerator,
      payoutDenominator,
      incidentTimestamp,
      root,
      "raw data",
      "metadata"
    );

    return proof;
  };

  before(async () => {
    //import
    [gov, alice, bob, chad, tom, minter] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");

    //deploy
    ownership = await Ownership.deploy();
    usdc = await USDC.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    premium = await PremiumModel.deploy();
    vault = await Vault.deploy(
      usdc.address,
      registry.address,
      ZERO_ADDRESS,
      ownership.address
    );

    poolTemplate = await PoolTemplate.deploy();
    cdsTemplate = await CDSTemplate.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    //setup
    await usdc.mint(alice.address, initialMint);
    await usdc.mint(bob.address, initialMint);
    await usdc.mint(chad.address, initialMint);

    await usdc.connect(alice).approve(vault.address, initialMint);
    await usdc.connect(bob).approve(vault.address, initialMint);
    await usdc.connect(chad).approve(vault.address, initialMint);

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
    await factory.approveTemplate(indexTemplate.address, true, false, true);
    await factory.approveTemplate(cdsTemplate.address, true, false, true);

    await factory.approveReference(poolTemplate.address, 0, usdc.address, true);
    await factory.approveReference(poolTemplate.address, 1, usdc.address, true);
    await factory.approveReference(
      poolTemplate.address,
      2,
      registry.address,
      true
    );
    await factory.approveReference(
      poolTemplate.address,
      3,
      parameters.address,
      true
    );

    //initial depositor
    await factory.approveReference(poolTemplate.address, 4, ZERO_ADDRESS, true);

    await factory.approveReference(
      indexTemplate.address,
      0,
      usdc.address,
      true
    );
    await factory.approveReference(
      indexTemplate.address,
      1,
      registry.address,
      true
    );
    await factory.approveReference(
      indexTemplate.address,
      2,
      parameters.address,
      true
    );

    await factory.approveReference(cdsTemplate.address, 0, usdc.address, true);
    await factory.approveReference(
      cdsTemplate.address,
      1,
      registry.address,
      true
    );
    await factory.approveReference(
      cdsTemplate.address,
      2,
      parameters.address,
      true
    );

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    await parameters.setGrace(ZERO_ADDRESS, DAY.mul("3"));
    await parameters.setLockup(ZERO_ADDRESS, WEEK);
    await parameters.setWithdrawable(ZERO_ADDRESS, WEEK.mul(2));
    await parameters.setMinDate(ZERO_ADDRESS, WEEK);
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setVault(usdc.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");

    //create Single Pools
    let tx = await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0, 0],
      [
        usdc.address,
        usdc.address,
        registry.address,
        parameters.address,
      ]
    );
    let receipt = await tx.wait();
    const marketAddress1 = receipt.events[2].args[0];
    tx = await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0, 0],
      [
        usdc.address,
        usdc.address,
        registry.address,
        parameters.address,
      ]
    );
    receipt = await tx.wait();
    const marketAddress2 = receipt.events[1].args[0];

    market1 = await PoolTemplate.attach(marketAddress1);
    market2 = await PoolTemplate.attach(marketAddress2);

    //create CDS
    tx = await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      [],
      [usdc.address, registry.address, parameters.address]
    );
    receipt = await tx.wait();
    const marketAddress3 = receipt.events[2].args[0];

    //create Index
    tx = await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      [],
      [usdc.address, registry.address, parameters.address]
    );
    receipt = await tx.wait();
    const marketAddress4 = receipt.events[2].args[0];

    cds = await CDSTemplate.attach(marketAddress3);
    index = await IndexTemplate.attach(marketAddress4);

    await registry.setCDS(ZERO_ADDRESS, cds.address); //default CDS

    await index.set("0", "0",market1.address, defaultLeverage); //set market1 to the Index
    await index.set("1", "0",market2.address, defaultLeverage); //set market2 to the Index

    await index.setLeverage(targetLeverage); //2x

    await parameters.setUpperSlack(index.address, "500000"); //leverage+50% (+0.5)
    await parameters.setLowerSlack(index.address, "500000"); //leverage-50% (-0.5)
  });

  beforeEach(async () => {
    snapshotId = await snapshot();
  });

  afterEach(async () => {
    await restore(snapshotId);
  });

  describe("initialize", function () {
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          totalAllocatedCredit: ZERO,
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO,
          withdrawable: ZERO,
          rate: ZERO,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint,
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should set configs after initialization ", async function () {
      expect(await index.name()).to.equal("InsureDAO-Index");
      expect(await index.symbol()).to.equal("iIndex");
      expect(await index.decimals()).to.equal(18);

      expect(await index.parameters()).to.equal(parameters.address);
      expect(await index.vault()).to.equal(vault.address);
      expect(await index.registry()).to.equal(registry.address);
      expect(await index.metadata()).to.equal("Here is metadata.");
    });

    it("reverts when already initialized", async function () {
      expect(await index.initialized()).to.equal(true);

      await expect(
        index.initialize(
          ZERO_ADDRESS,
          "Here is metadata.",
          [0, 0],
          [usdc.address, registry.address, parameters.address]
        )
      ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
    });

    it("reverts when address is zero and/or metadata is empty", async function () {
      await factory.approveReference(
        indexTemplate.address,
        0,
        ZERO_ADDRESS,
        true
      );
      await factory.approveReference(
        indexTemplate.address,
        1,
        ZERO_ADDRESS,
        true
      );
      await factory.approveReference(
        indexTemplate.address,
        2,
        ZERO_ADDRESS,
        true
      );

      await expect(
        factory.createMarket(
          indexTemplate.address,
          "",
          [],
          [usdc.address, registry.address, parameters.address]
        )
      ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");

      await expect(
        factory.createMarket(
          indexTemplate.address,
          "Here is metadata.",
          [],
          [ZERO_ADDRESS, registry.address, parameters.address]
        )
      ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");

      await expect(
        factory.createMarket(
          indexTemplate.address,
          "Here is metadata.",
          [],
          [usdc.address, ZERO_ADDRESS, parameters.address]
        )
      ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");

      await expect(
        factory.createMarket(
          indexTemplate.address,
          "Here is metadata.",
          [],
          [usdc.address, registry.address, ZERO_ADDRESS]
        )
      ).to.revertedWith("INITIALIZATION_BAD_CONDITIONS");
    });
  });

  describe("deposit", function () {
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          totalAllocatedCredit: ZERO,
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO,
          withdrawable: ZERO,
          rate: ZERO,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint,
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should increase the crowd pool size and attribution.", async function () {
      let tx = await index.connect(alice).deposit(depositAmount);

      {
        //sanity check
        let mintedAmount = (await tx.wait()).events[3].args["value"];

        //should return same amount of iToken(usual case)
        expect(mintedAmount).to.equal(depositAmount);

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (targetLeverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (targetLeverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: mintedAmount, //lp minted
          totalLiquidity: depositAmount, //deposited
          totalAllocatedCredit: depositAmount
            .mul(targetLeverage)
            .div(defaultLeverage), //
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage, //actual leverage
          withdrawable: depositAmount,
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint.sub(depositAmount), //transfer from here
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount, //transfer to here
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should return same amount of iToken(usual case) ", async function () {
      let tx = await index.connect(alice).deposit(depositAmount); //LP mintAmount should be depositAmount*2
      let mintedAmount = (await tx.wait()).events[3].args["value"];

      //should return same amount of iToken(usual case)
      expect(mintedAmount).to.equal(depositAmount);
    });

    it("should return larger amount of iToken when the rate is low(when compensated)", async function () {
      //setup
      await index.connect(bob).deposit(depositAmount); //LP:USDC = 1:1

      let insureAmount = depositAmount.div(2)

      let compensate = depositAmount;

      //Chad buys insurance and redeem
      let tx = await market1.connect(chad).insure(
        insureAmount, //insured amount
        insureAmount, //max-cost
        YEAR, //span
        target, //targetID
        chad.address,
        chad.address
      );
      let premiumAmount = (await tx.wait()).events[2].args["premium"];
      let govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER);
      let income = premiumAmount.sub(govFee);

      let incident = await now();
      let proof = await applyCover({
        pool: market1,
        pending: DAY,
        targetAddress: ZERO_ADDRESS, //everyone
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident,
      });

      await market1.connect(chad).redeem(0, proof); //market1 has debt now

      await moveForwardPeriods(1);
      
      await market1.resume(); //clean up the debt
      //index lose depositedAmount to compensate for Market1

      await index.resume();

      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: depositAmount.sub(insureAmount).add(income),
        underlyingValue: depositAmount.sub(insureAmount).add(income),
        debt: ZERO,
      });

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount, //lp minted
        totalLiquidity: depositAmount.sub(insureAmount).add(income),
        totalAllocatedCredit: depositAmount.sub(insureAmount).add(income).mul(targetLeverage).div(defaultLeverage), //
        totalAllocPoint: targetLeverage,
        targetLev: targetLeverage,
        leverage: targetLeverage, //actual leverage
        withdrawable: depositAmount.sub(insureAmount).add(income),
        rate: defaultRate.mul(depositAmount.sub(insureAmount).add(income)).div(depositAmount),
      });

      //now deposit again
      tx = await index.connect(bob).deposit(depositAmount); //LP:USDC = 1:?

      let mintedAmount = (await tx.wait()).events[3].args["value"];

      expect(mintedAmount).to.equal(
        depositAmount.mul(depositAmount).div(depositAmount.sub(insureAmount).add(income))
      ); //mintAmount = amount * totalSupply / totalLiquidity
    });

    it("should incur adjust alloc when deposit amount is large enough", async function () {
      //after adjust alloc test
    });

    it("revert when the market is paused", async function () {
      await index.setPaused(true);
      await expect(index.connect(alice).deposit(depositAmount)).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
    });

    it("revert when the deposit amount is zero", async function () {
      await expect(index.connect(alice).deposit(ZERO)).to.revertedWith(
        "ERROR: DEPOSIT_ZERO"
      );
    });
  });

  describe("requestWithdraw", function () {
    beforeEach(async () => {
      await index.connect(alice).deposit(depositAmount);

      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount, //lp minted
          totalLiquidity: depositAmount, //deposited
          totalAllocatedCredit: depositAmount
            .mul(targetLeverage)
            .div(defaultLeverage), //
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage, //actual leverage
          withdrawable: depositAmount,
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint.sub(depositAmount), //transfer from here
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount, //transfer to here
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should update timestamp and amount", async function () {
      {
        //target scope
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: depositAmount,
          withdrawTimestamp: ZERO,
          withdrawAmount: ZERO,
        });
      }

      //setup
      let next = (await now()).add(10);
      await setNextBlock(next);

      await index.connect(alice).requestWithdraw(depositAmount);

      {
        //update check
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: depositAmount,
          withdrawTimestamp: next.add(WEEK), //updated
          withdrawAmount: depositAmount, //updated
        });
      }

      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount,
              availableBalance: depositAmount,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount,
              availableBalance: depositAmount,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount,
          totalLiquidity: depositAmount,
          totalAllocatedCredit: depositAmount
            .mul(targetLeverage)
            .div(defaultLeverage),
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: depositAmount,
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: next.add(WEEK), //updated
            withdrawAmount: depositAmount, //updated
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2),
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2),
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage),
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage),
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint.sub(depositAmount),
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("revert when _amount exceed balance", async function () {
      await expect(
        index.connect(alice).requestWithdraw(depositAmount.add(1))
      ).to.revertedWith("ERROR: REQUEST_EXCEED_BALANCE");
    });

    it("revert when zero amount", async function () {
      await expect(index.connect(alice).requestWithdraw(ZERO)).to.revertedWith(
        "ERROR: REQUEST_ZERO"
      );
    });
  });

  describe("_beforeTokenTransfer", function () {
    beforeEach(async () => {
      await index.connect(alice).deposit(depositAmount);

      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount, //lp minted
          totalLiquidity: depositAmount, //deposited
          totalAllocatedCredit: depositAmount
            .mul(targetLeverage)
            .div(defaultLeverage), //
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage, //actual leverage
          withdrawable: depositAmount,
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint.sub(depositAmount), //transfer from here
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount, //transfer to here
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should decrease the request amount", async function () {
      //setup
      let next = (await now()).add(10);
      await setNextBlock(next);

      await index.connect(alice).requestWithdraw(depositAmount);

      {
        //target scope check
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: depositAmount,
          withdrawTimestamp: next.add(WEEK),
          withdrawAmount: depositAmount,
        });
        await verifyIndexStatusOf({
          index: index,
          targetAddress: bob.address,
          valueOfUnderlying: ZERO,
          withdrawTimestamp: ZERO,
          withdrawAmount: ZERO,
        });
      }

      //execute
      await index.connect(alice).transfer(bob.address, depositAmount.div(2));

      {
        //target scope check
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: depositAmount.div(2), //lp decrease
          withdrawTimestamp: next.add(WEEK),
          withdrawAmount: depositAmount.div(2), //updated
        });

        await verifyIndexStatusOf({
          index: index,
          targetAddress: bob.address,
          valueOfUnderlying: depositAmount.div(2), //lp decrease
          withdrawTimestamp: ZERO,
          withdrawAmount: ZERO,
        });
      }

      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount, //lp minted
          totalLiquidity: depositAmount, //deposited
          totalAllocatedCredit: depositAmount
            .mul(targetLeverage)
            .div(defaultLeverage), //
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage, //actual leverage
          withdrawable: depositAmount,
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount.div(2),
            withdrawTimestamp: next.add(WEEK),
            withdrawAmount: depositAmount.div(2),
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: depositAmount.div(2),
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint.sub(depositAmount), //transfer from here
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount, //transfer to here
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount.div(2), //transfer from here
              [bob.address]: depositAmount.div(2), //transfer to here
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });
  });

  describe("withdrawable", function () {
    it("should retrun index's not locked amount", async function () {
      await market1.connect(alice).deposit(depositAmount);
      //await market2.connect(alice).deposit(depositAmount)
      await index.connect(alice).deposit(depositAmount);

      let insureAmount = depositAmount.div(2); //5000

      //income: 450. market1 earns 225 and index earns 225, because they have 50% share in market1
      await market1.connect(bob).insure(
        insureAmount, //insured amount
        depositAmount, //max-cost
        YEAR, //span
        target, //targetID
        bob.address,
        bob.address
      );

      //income: 450. index earns 450. index has 100% share in market2
      await market2
        .connect(bob)
        .insure(insureAmount, depositAmount, YEAR, target, bob.address, bob.address);

      await index.adjustAlloc(); //index's earned premium get in effect on the markets.

      //market1
      let liquidity = await market1.totalLiquidity();
      let credit = await market1.totalCredit();
      let lockedAmount = await market1.lockedAmount();
      let utilRate = await market1.utilizationRate();

      //market2
      liquidity = await market2.totalLiquidity();
      credit = await market2.totalCredit();
      lockedAmount = await market2.lockedAmount();
      let available = await market2.availableBalance();
      let utilization = available.mul(1e6).div(credit);

      //index
      let leverage = await index.leverage();
      let indexLiquidity = await index.totalLiquidity();
      let expectedWithdrawable = indexLiquidity.sub(lockedAmount);
      let withdrawable = await index.withdrawable();

      expect(withdrawable).to.equal(expectedWithdrawable);
    });

    it("should return zero when more than the leveraged amount is locked", async function () {

      await index.connect(alice).deposit(depositAmount);

      let insureAmount = depositAmount.div(2);

      let tx = await market1.connect(bob).insure(
        insureAmount, //insured amount
        depositAmount, //max-cost
        YEAR, //span
        target, //targetID
        bob.address,
        bob.address
      );

      let premiumAmount_1 = (await tx.wait()).events[2].args["premium"];
      let govFee_1 = premiumAmount_1.mul(governanceFeeRate).div(RATE_DIVIDER);
      let income_1 = premiumAmount_1.sub(govFee_1);

      tx = await market2.connect(bob).insure(
        insureAmount,
        depositAmount,
        YEAR, 
        target, 
        bob.address, 
        bob.address
      );

      let premiumAmount_2 = (await tx.wait()).events[2].args["premium"];
      let govFee_2 = premiumAmount_2.mul(governanceFeeRate).div(RATE_DIVIDER);
      let income_2 = premiumAmount_2.sub(govFee_2);

      let income = income_1.add(income_2)
      let insureAmountTotal = insureAmount.mul(2)


      //Change the leverage rate to 1.5x. 
      await index.setLeverage(1500000);
      expect(await index.leverage()).to.equal(1500000);

      
      let _targetLeverage = defaultLeverage.mul(3).div(2) //x1.5

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount,
        totalLiquidity: depositAmount.add(income),
        totalAllocatedCredit: depositAmount.add(income).mul(_targetLeverage).div(defaultLeverage), //
        totalAllocPoint: defaultLeverage.mul(2),
        targetLev: _targetLeverage,
        leverage: _targetLeverage, //actual leverage
        withdrawable: depositAmount.add(income).sub(insureAmount.mul("2").mul("2").div("3")),
        rate: defaultRate.mul(depositAmount.add(income)).div(depositAmount),
      });


      //this won't change when only one side of pool liquidity is added
      await market1.connect(alice).deposit(depositAmount);
      withdrawable = await index.withdrawable();
      expect(withdrawable).to.equal(depositAmount.add(income).sub(insureAmount.mul("2").mul("2").div("3")));

      //but this situation changes when the other side of liquidity is added
      await market2.connect(alice).deposit(depositAmount);

      //this causes index can withdraw all.
      withdrawable = await index.withdrawable();
      expect(withdrawable).to.equal(depositAmount.add(income));
    });

    it("should return full amount when the locked amount is fully available", async function () {

      await index.connect(alice).deposit(depositAmount);
      await market2.connect(alice).deposit(depositAmount);

      let insureAmount = depositAmount.mul(1); //10000

      //income: 900. 
      await market2
        .connect(bob)
        .insure(insureAmount, depositAmount, YEAR, target, bob.address, bob.address);

      //should return zero since over leveraged
      let withdrawable = await index.withdrawable();
      expect(withdrawable).to.equal(10450);
    });
  });

  describe("withdraw", function () {
    beforeEach(async () => {
      await index.connect(alice).deposit(depositAmount);

      next = (await now()).add(10);
      await setNextBlock(next);

      await index.connect(alice).requestWithdraw(depositAmount);
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount,
              availableBalance: depositAmount,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount,
              availableBalance: depositAmount,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount,
          totalLiquidity: depositAmount,
          totalAllocatedCredit: depositAmount
            .mul(targetLeverage)
            .div(defaultLeverage),
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: depositAmount,
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: next.add(WEEK), //updated
            withdrawAmount: depositAmount, //updated
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2),
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2),
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage),
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage),
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint.sub(depositAmount),
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should decrease attribution", async function () {
      await moveForwardPeriods(7);

      await index.connect(alice).withdraw(depositAmount.div(2));
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount.div(2), //decrease
              availableBalance: depositAmount.div(2), //decrease
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount.div(2),
              availableBalance: depositAmount.div(2),
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount.div(2),
          totalLiquidity: depositAmount.div(2),
          totalAllocatedCredit: depositAmount
            .div(2)
            .mul(targetLeverage)
            .div(defaultLeverage),
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: depositAmount.div(2),
          rate: defaultRate,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount.div(2),
            withdrawTimestamp: next.add(WEEK),
            withdrawAmount: depositAmount.div(2), //decrease
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2),
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2),
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .div(2)
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //decrease
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount
                .div(2)
                .mul(targetLeverage)
                .div(2)
                .div(defaultLeverage), //decrease
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount.div(2),
          valueAll: depositAmount.div(2),
          totalAttributions: depositAmount.div(2),
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount.div(2),
            underlyingValue: depositAmount.div(2),
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint
                .sub(depositAmount)
                .add(depositAmount.div(2)),
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: depositAmount.div(2),
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount.div(2), //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should return same amount ", async function () {
      await moveForwardPeriods(7);
      let tx = await index.connect(alice).withdraw(depositAmount.div(2));
      let returnValue = (await tx.wait()).events[4].args["retVal"];
      expect(returnValue).to.equal(depositAmount.div(2));
    });

    it("should return smaller amount of underlying token when the rate is low(when compensated)", async function () {
      let next = (await now()).add(10);
      await setNextBlock(next);

      //re-do
      await index.connect(alice).requestWithdraw(depositAmount.div(2));

      let compensate = depositAmount;

      //Bob buys insurance and redeem
      let tx = await market1.connect(chad).insure(
        depositAmount, //insured amount
        depositAmount, //max-cost
        YEAR, //span
        target, //targetID
        chad.address,
        chad.address
      );
      let premiumAmount = (await tx.wait()).events[2].args["premium"];
      let govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER);
      let income = premiumAmount.sub(govFee);

      let incident = await now();
      let proof = await applyCover({
        pool: market1,
        pending: DAY,
        targetAddress: ZERO_ADDRESS, //everyone
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident,
      });

      await market1.connect(chad).redeem(0, proof); //market1 has debt now

      await moveForwardPeriods(1);

      await market1.resume(); //clean up the debt
      //index lose depositedAmount to compensate for Market1

      await index.resume();

      await moveForwardPeriods(6);

      {
        //check
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: income,
          withdrawTimestamp: next.add(WEEK),
          withdrawAmount: depositAmount.div(2), //decrease
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount,
          totalLiquidity: income,
          totalAllocatedCredit: income.mul(targetLeverage).div(defaultLeverage),
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: income,
          rate: defaultRate.mul(income).div(depositAmount),
        });
      }

      //now withdraw
      tx = await index.connect(alice).withdraw(depositAmount.div(2)); //amount of lp token to burn to withdraw USDC

      let withdrawedAmount = (await tx.wait()).events[4].args["retVal"];

      expect(withdrawedAmount).to.equal(income.div(2)); //burn 50% of totalSupply should withdraw 50% of totalLiquidity
    });

    it("should burn iToken", async function () {
      await moveForwardPeriods(7);

      await index.connect(alice).withdraw(depositAmount.div(2)); //withdraw

      {
        //check
        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount.div(2), //burnt
          totalLiquidity: depositAmount.div(2),
          totalAllocatedCredit: depositAmount
            .div(2)
            .mul(targetLeverage)
            .div(defaultLeverage),
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: depositAmount.div(2),
          rate: defaultRate,
        });

        await verifyBalances({
          token: index,
          userBalances: {
            [alice.address]: depositAmount.div(2), //burnt
            [bob.address]: ZERO,
            [chad.address]: ZERO,
          },
        });
      }
    });

    it("should reduce request amount", async function () {
      {
        //check
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: depositAmount,
          withdrawTimestamp: next.add(WEEK),
          withdrawAmount: depositAmount,
        });
      }

      await moveForwardPeriods(7);

      await index.connect(alice).withdraw(depositAmount.div(2)); //withdraw

      {
        //check
        await verifyIndexStatusOf({
          index: index,
          targetAddress: alice.address,
          valueOfUnderlying: depositAmount.div(2),
          withdrawTimestamp: next.add(WEEK), //no change
          withdrawAmount: depositAmount.div(2), //updated
        });
      }
    });

    it("should withdraw even when the market is paused", async function () {
      await moveForwardPeriods(7);

      await index.setPaused(true);

      await index.connect(alice).withdraw(depositAmount);
    });

    it("reverts when lockup is not ends", async function () {
      await moveForwardPeriods(6);

      await expect(
        index.connect(alice).withdraw(depositAmount)
      ).to.revertedWith("ERROR: WITHDRAWAL_QUEUE");
    });

    it("reverts when withdrawable priod ends", async function () {
      await moveForwardPeriods(7);
      await moveForwardPeriods(14);

      await expect(
        index.connect(alice).withdraw(depositAmount)
      ).to.revertedWith("WITHDRAWAL_NO_ACTIVE_REQUEST");
    });

    it("reverts when the withdraw amount exceeded the request", async function () {
      await moveForwardPeriods(7);
      await expect(
        index.connect(alice).withdraw(depositAmount.add(1))
      ).to.revertedWith("WITHDRAWAL_EXCEEDED_REQUEST");
    });

    it("reverts when zero requests", async function () {
      await moveForwardPeriods(7);
      await expect(index.connect(alice).withdraw(ZERO)).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("reverts exceed withdrawable", async function () {
      //-----after withdrawable-----

      await moveForwardPeriods(7);

      let insureAmount = depositAmount.div(2);

      await market1.connect(bob).insure(
        insureAmount, //insured amount
        depositAmount, //max-cost
        YEAR, //span
        target, //targetID
        bob.address,
        bob.address
      );

      let income = insureAmount.div(10).sub(insureAmount.div(10).div(10)); //10% of insureAmount is premium (for test). 10% of premium goes to governance.
      let leverage = defaultLeverage
        .mul(depositAmount.mul(targetLeverage).div(defaultLeverage))
        .div(depositAmount.add(income));

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount, //lp minted
        totalLiquidity: depositAmount.add(income),
        totalAllocatedCredit: depositAmount
          .mul(targetLeverage)
          .div(defaultLeverage), //too small, so didn't trigger _adjustAlloc()
        totalAllocPoint: targetLeverage,
        targetLev: targetLeverage,
        leverage: defaultLeverage
          .mul(depositAmount.mul(targetLeverage).div(defaultLeverage))
          .div(depositAmount.add(income)), //actual leverage
        withdrawable: depositAmount.add(income).sub(insureAmount),
        rate: defaultRate.mul(depositAmount.add(income)).div(depositAmount),
      });

      await expect(
        index.connect(alice).withdraw(depositAmount)
      ).to.revertedWith("WITHDRAW_INSUFFICIENT_LIQUIDITY");
    });

    it("should incur adjust alloc when withdrawal amount is large enough", async function () {
      //after adjust alloc
    });
  });

  describe("compensate", function () {
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          totalAllocatedCredit: ZERO,
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO,
          withdrawable: ZERO,
          rate: ZERO,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint,
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("should decrease the liquidity of the pool and return how much compensated", async function () {
      // write test here
    });
    it("should ask cds to compensate and return how much compensated when the liquidity in pool is not enough", async function () {
      // write test here
    });
    it("revert if it's called by non-registererd contract", async function () {
      // write test here
    });
    it("should adjust allocation after called.", async function () {
      // write test here
    });
    it("should emit the event", async function () {
      // write test here
    });
  });

  describe("adjustAlloc", function () {
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          totalAllocatedCredit: ZERO,
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO,
          withdrawable: ZERO,
          rate: ZERO,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint,
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("only sencond loop. increase credits", async function () {
      // write test here
    });

    it("only sencond loop. decrease credits", async function () {
      // write test here
    });

    it("only sencond loop. decrease credits, but insuffucient withdrawable", async function () {
      // leverage will be higher the targetLev
    });

    it("only first loop. only Payout", async function () {
      // write test here
    });

    it("only first loop. only paused", async function () {
      // write test here
    });

    it("only first loop. Payout and paused", async function () {
      // write test here
    });

    it("Both loops. Payout, paused, and normal pools", async function () {
      // write test here
    });

    it("Both loops. use all branch together", async function () {
      // write test here
    });

  });

  describe("edge cases", function () {
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {
        //sanity check

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          totalAllocatedCredit: ZERO,
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO,
          withdrawable: ZERO,
          rate: ZERO,
        });

        {
          //verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO,
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2), //alloc evenly
          });
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: ZERO,
              pendingPremium: ZERO,
            },
          ],
        });

        await verifyCDSStatus({
          cds: cds,
          surplusPool: ZERO,
          crowdPool: ZERO,
          totalSupply: ZERO,
          totalLiquidity: ZERO,
          rate: ZERO,
        });

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO,
        });

        {
          //Vault Status Of
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });

          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO,
          });
        }

        {
          //token, lp token
          await verifyBalances({
            token: usdc,
            userBalances: {
              //EOA
              [gov.address]: ZERO,
              [alice.address]: initialMint,
              [bob.address]: initialMint,
              [chad.address]: initialMint,
              //contracts
              [market1.address]: ZERO,
              [market2.address]: ZERO,
              [index.address]: ZERO,
              [cds.address]: ZERO,
              [vault.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });

          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            },
          });
        }
      }
    });

    it("compensate()=>adjustAlloc() when other pool is Paying status", async function () {
      /**
       * Testing scenario
       * 
       * market1: will do compensate()
       * market2: Payout status
       * market3: Trading status
       */

      //create one more market
      await factory.createMarket(
        poolTemplate.address,
        "Here is metadata.",
        [0, 0],
        [
          usdc.address,
          usdc.address,
          registry.address,
          parameters.address,
        ]
      );
      let markets = await registry.getAllMarkets()
      let market3_address = markets[markets.length - 1]
      let market3 = await PoolTemplate.attach(market3_address)

      //deposit
      let totalDeposit = depositAmount.mul(3) //30000
      await index.connect(alice).deposit(totalDeposit)

      //set market to index. adjustAlloc() is done in this function
      await index.set("2", "0", market3.address, defaultLeverage);

      //sanity check
      {
        await verifyIndexStatus({
          index: index,
          totalSupply: totalDeposit,
          totalLiquidity: totalDeposit,
          totalAllocatedCredit: totalDeposit.mul(2), //x2 leverage
          totalAllocPoint: defaultLeverage.mul(3), //3 markets
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: totalDeposit,
          rate: defaultRate,
        });

        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: totalDeposit.mul(2).div(3),
              availableBalance: totalDeposit.mul(2).div(3),
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: totalDeposit.mul(2).div(3),
              availableBalance: totalDeposit.mul(2).div(3),
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: totalDeposit.mul(2).div(3),
              availableBalance: totalDeposit.mul(2).div(3),
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO,
            },
          ],
        });
      }

      let insureAmount = depositAmount.div(2) //5000

      //market1: insure()
      let tx = await market1.connect(chad).insure(
        insureAmount,
        insureAmount,
        YEAR,
        target,
        chad.address,
        chad.address
      );
      let premiumAmount = (await tx.wait()).events[2].args["premium"];
      let govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER);
      let income = premiumAmount.sub(govFee);

      //market2: insure()
      tx = await market2.connect(chad).insure(
        insureAmount,
        insureAmount,
        YEAR,
        target,
        chad.address,
        chad.address
      );
      premiumAmount = (await tx.wait()).events[2].args["premium"];
      govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER);
      income = income.add(premiumAmount.sub(govFee));


      // market2 => Payout status WITHOUT claim
      let incident = await now();
      await applyCover({
        pool: market2,
        pending: DAY,
        targetAddress: ZERO_ADDRESS, //everyone
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident,
      });

      // market1 => Payout status WITH claim
      let proof = await applyCover({
        pool: market1,
        pending: DAY,
        targetAddress: ZERO_ADDRESS, //everyone
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident,
      });

      await market1.connect(chad).redeem(0, proof); //market1 has debt now

      await moveForwardPeriods(1); //1day pass (applyCover().pending ends)

      await market1.resume()

      
      /** sanity check
       * market1 had 5000 payout
       * index deposit was 30000 with leverage of x2
       * market2 is Paying status
       * 
       * before
       * market1: 20000
       * market2: 20000
       * market3: 20000
       * 
       * 
       * liquidity became 25900 (900 income) with leverage of x2 
       * credits of 51800
       * 
       * after
       * credits of 51800
       * market1: 15900
       * market2: 20000 (Payout)
       * market3: 15900
       * 
       * withdrawable
       * market2 5000 locked 1/3 alopPoint 2leverage
       * => 5000 * 3 / 2 = 7500
       * 25900 - 7500 = 18400
       */


      //@dev not finish yet
      {
        let indexLiquidity = totalDeposit.add(income).sub(insureAmount)

        await verifyPoolsStatus({
          pools: [
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: 20000, //Priority to keep current credits
              availableBalance: 15000,
              rate: ZERO,
              utilizationRate: 5000*1000000/20000,
              allInsuranceCount: 1,
            },
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: 15900, 
              availableBalance: 15900,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: 1,
            },
            {
              pool: market3,
              totalSupply: ZERO,
              totalLiquidity: 15900, 
              availableBalance: 15900,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: 0,
            }
          ],
        });

        await verifyIndexStatus({
          index: index,
          totalSupply: totalDeposit,
          totalLiquidity: "25900",
          totalAllocatedCredit: "51800", //x2 leverage
          totalAllocPoint: defaultLeverage.mul(3), //3 markets
          targetLev: targetLeverage,
          leverage: targetLeverage,
          withdrawable: "18400",
          rate: defaultRate.mul(25900).div(totalDeposit),
        });
      }








    });
  });
});
