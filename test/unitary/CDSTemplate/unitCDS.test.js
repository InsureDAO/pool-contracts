const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalance,
  verifyBalances,
  verifyAllowance,
  verifyPoolsStatus,
  verifyPoolsStatus_legacy,
  verifyPoolsStatusForIndex,
  verifyPoolsStatusForIndex_legacy,
  verifyIndexStatus,
  verifyCDSStatus,
  verifyVaultStatus,
  verifyVaultStatusOf,
} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
  long,
  short,
  YEAR,
  WEEK,
  DAY,
  ZERO
} = require('../constant-utils');

async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
}

async function moveForwardPeriods (days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true
}

async function now () {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

describe("CDS", function () {
  const initialMint = BigNumber.from("100000"); //initial token amount for users
  const depositAmount = BigNumber.from("10000"); //default deposit amount for test
  const defaultRate = BigNumber.from("1000000"); //initial rate between USDC and LP token
  const insureAmount = BigNumber.from("10000"); //default insure amount for test

  const defaultLeverage = BigNumber.from("1000");
  let leverage = BigNumber.from("20000");

  const governanceFeeRate = BigNumber.from("100000"); //10% of the Premium
  const RATE_DIVIDER = BigNumber.from("1000000"); //1e6
  const UTILIZATION_RATE_LENGTH_1E6 = BigNumber.from("1000000"); //1e6

  const approveDeposit = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);
  }

  const insure = async ({pool, insurer, amount, maxCost, span, target}) => {
    await usdc.connect(insurer).approve(vault.address, maxCost)
    let tx = await pool.connect(insurer).insure(amount, maxCost, span, target);

    let receipt = await tx.wait()
    let premium = receipt.events[2].args['premium']

    //return value
    return premium
  }

  const applyCover = async ({pool, pending, payoutNumerator, payoutDenominator, incidentTimestamp}) => {

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
    //console.log("tree", tree.toString());
    //console.log("proof", leaves, proof, root, leaf);
    //console.log("verify", tree.verify(proof, leaf, root)); // true

    await pool.applyCover(
      pending,
      payoutNumerator,
      payoutDenominator,
      incidentTimestamp,
      root,
      "raw data",
      "metadata"
    );

    return proof
  }

  before(async () => {
    //import
    [gov, alice, bob, chad, tom] = await ethers.getSigners();
    const Ownership = await ethers.getContractFactory("Ownership");
    const USDC = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("ControllerMock");

    //deploy
    ownership = await Ownership.deploy();
    usdc = await USDC.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(usdc.address, ownership.address);
    vault = await Vault.deploy(
      usdc.address,
      registry.address,
      controller.address,
      ownership.address
    );

    poolTemplate = await PoolTemplate.deploy();
    cdsTemplate = await CDSTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    
    //set up
    await usdc.mint(chad.address, (100000).toString());
    await usdc.mint(bob.address, (100000).toString());
    await usdc.mint(alice.address, (100000).toString());

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
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
    await factory.approveReference(
      poolTemplate.address,
      4,
      ZERO_ADDRESS,
      true
    );

    await factory.approveReference(
      cdsTemplate.address,
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

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    
    await parameters.setGrace(ZERO_ADDRESS, DAY.mul("3"));
    
    await parameters.setLockup(ZERO_ADDRESS, WEEK);
    
    await parameters.setMindate(ZERO_ADDRESS, WEEK);
    
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
     
    await parameters.setVault(usdc.address, vault.address);
    await parameters.setMaxList(ZERO_ADDRESS, "10");

    

    //market1
    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0],
      [usdc.address, usdc.address, registry.address, parameters.address, gov.address]
    );
    const marketAddress1 = await factory.markets(0);
    market1 = await PoolTemplate.attach(marketAddress1);

    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      [0],
      [usdc.address, registry.address, parameters.address]
    );
    const marketAddress2 = await factory.markets(1);
    cds = await CDSTemplate.attach(marketAddress2);

    await registry.setCDS(ZERO_ADDRESS, cds.address);
  });

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)
  })

  describe("Condition", function () {
    it("Should contracts be deployed", async () => {
    });
  });

  describe('CDSTemplate', function(){
    describe('initialize', function() {
      it('success fully initialized', async () => {
        expect(await cds.initialized()).to.equal(true)
        expect(await cds.registry()).to.equal(registry.address)
        expect(await cds.parameters()).to.equal(parameters.address)
        expect(await cds.vault()).to.equal(vault.address)
        expect(await cds.name()).to.equal("InsureDAO-CDS")
        expect(await cds.symbol()).to.equal("iCDS")
        expect(await cds.decimals()).to.equal(18) //MockERC20 decimals

      });   

      it('revert when already initialized', async () => {
          // 91
          // "ERROR: INITIALIZATION_BAD_CONDITIONS"
          await expect(cds.initialize(
            "Here is metadata.",
            [0],
            [usdc.address, registry.address, parameters.address]
          )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")
      });    

      it('require check 1', async () => {

        await factory.approveReference(
          cdsTemplate.address,
          0,
          ZERO_ADDRESS,
          true
        );

        await expect(factory.createMarket(
          cdsTemplate.address,
          "Here is metadata.",
          [0],
          [ZERO_ADDRESS, registry.address, parameters.address]
        )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")
        
      });

      it('require check 2', async () => {

        await factory.approveReference(
          cdsTemplate.address,
          1,
          ZERO_ADDRESS,
          true
        );

        await expect(factory.createMarket(
          cdsTemplate.address,
          "Here is metadata.",
          [0],
          [usdc.address, ZERO_ADDRESS, parameters.address]
        )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")

      }); 


      it('require check 3', async () => {

        await factory.approveReference(
          cdsTemplate.address,
          2,
          ZERO_ADDRESS,
          true
        );

        await expect(factory.createMarket(
          cdsTemplate.address,
          "Here is metadata.",
          [0],
          [usdc.address, registry.address, ZERO_ADDRESS]
        )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")
      }); 

      it('require check 4', async () => {
        await expect(factory.createMarket(
          cdsTemplate.address,
          "",
          [0],
          [usdc.address, registry.address, parameters.address]
        )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")
      }); 
    });

    describe('deposit', function() {
        it('should not amount is zero', async ()=>{
            // 125
            // "ERROR: DEPOSIT_ZERO"
            expect(await cds.deposit(0)).to.revertedWith("ERROR: DEPOSIT_ZERO")
        });
        it('total liquidity is zero, supply is more than zero', async () => {
            // 139
        });
    });

    describe("requestWithdraw", function() {
        it("balance should be more than amount", async () => {
            // 156
            // "ERROR: REQUEST_EXCEED_BALANCE"
        });
        it("amount should not be zero", async () => {
            // 157
            // "ERROR: REQUEST_ZERO"
        });
    });

    describe("withdraw", function(){
        it("paused should be 'true'", async () => {
            // 171
            // "ERROR: WITHDRAWAL_PENDING"
        });
        it("time", async () => {
            // 176
            // "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
        });
    });

    describe("compensate", function () {
        it("msg.sender should be listed", async () => {
            // 208
            // no error code...
        });
    });

    describe("rate", function() {
        it("totalsupply should not zero", async () => {
            // 248
        });
    });

    describe("valueOfUnderlying", function() {
        it("", async () => {
            // 259

        });
        it("", async () => {
            // 262
        });
    });

    describe("setPaused", function () {
        it("", async () => {
            // 285
        });
    });

    describe("_beforeTokenTransfer", function(){
        it("", async () => {
            // 311
        });
    });
});

});