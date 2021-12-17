const { expect } = require("chai")
const { ethers } = require("hardhat")
const { BigNumber } = require("ethers")
const { MerkleTree } = require("merkletreejs")
const keccak256 = require("keccak256")


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

} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
  TEST_ADDRESS,
  NULL_ADDRESS,
  long,
  wrong,
  short,
  YEAR,
  WEEK,
  DAY,
  ZERO
} = require('../constant-utils')


async function snapshot () {
  return network.provider.send('evm_snapshot', [])
}

async function restore (snapshotId) {
  return network.provider.send('evm_revert', [snapshotId])
}

async function now() {
  let now = (await ethers.provider.getBlock('latest')).timestamp
  return now
}

async function moveForwardPeriods (days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()])
  await ethers.provider.send("evm_mine")

  return true
}


describe("Index", function () {
  const initialMint = BigNumber.from("100000")

  const depositAmount = BigNumber.from("10000")
  const depositAmountLarge = BigNumber.from("40000")
  const defaultRate = BigNumber.from("1000000")
  const insureAmount = BigNumber.from("10000")

  const defaultLeverage = BigNumber.from("1000000")
  let targetLeverage = defaultLeverage.mul(2)

  const governanceFeeRate = BigNumber.from("100000") //10%
  const RATE_DIVIDER = BigNumber.from("1000000")
  const UTILIZATION_RATE_LENGTH_1E6 = BigNumber.from("1000000")
  const target = ethers.utils.hexZeroPad("0x1", 32);

  const applyCover = async ({pool, pending, targetAddress, payoutNumerator, payoutDenominator, incidentTimestamp}) => {

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

  before(async()=>{
    //import
    [gov, alice, bob, chad, tom, minter] = await ethers.getSigners()

    const Ownership = await ethers.getContractFactory("Ownership")
    const USDC = await ethers.getContractFactory("TestERC20Mock")
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate")
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate")
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate")
    const Factory = await ethers.getContractFactory("Factory")
    const Vault = await ethers.getContractFactory("Vault")
    const Registry = await ethers.getContractFactory("Registry")
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel")
    const Parameters = await ethers.getContractFactory("Parameters")
    const Calculator = await ethers.getContractFactory("ABDKMath64x64")

    //deploy
    ownership = await Ownership.deploy()
    calc = await Calculator.deploy()
    usdc = await USDC.deploy()
    registry = await Registry.deploy(ownership.address)
    factory = await Factory.deploy(registry.address, ownership.address)
    premium = await PremiumModel.deploy()
    vault = await Vault.deploy(
      usdc.address,
      registry.address,
      ZERO_ADDRESS,
      ownership.address
    )

    poolTemplate = await PoolTemplate.deploy()
    cdsTemplate = await CDSTemplate.deploy()
    indexTemplate = await IndexTemplate.deploy()
    parameters = await Parameters.deploy(ownership.address)


    //setup
    await usdc.mint(alice.address, initialMint)
    await usdc.mint(bob.address, initialMint)
    await usdc.mint(chad.address, initialMint)

    await usdc.connect(alice).approve(vault.address, initialMint)
    await usdc.connect(bob).approve(vault.address, initialMint)
    await usdc.connect(chad).approve(vault.address, initialMint)


    await registry.setFactory(factory.address)

    await factory.approveTemplate(poolTemplate.address, true, false, true)
    await factory.approveTemplate(indexTemplate.address, true, false, true)
    await factory.approveTemplate(cdsTemplate.address, true, false, true)

    await factory.approveReference(poolTemplate.address, 0, usdc.address, true)
    await factory.approveReference(poolTemplate.address, 1, usdc.address, true)
    await factory.approveReference(
      poolTemplate.address,
      2,
      registry.address,
      true
    )
    await factory.approveReference(
      poolTemplate.address,
      3,
      parameters.address,
      true
    )

    //initial depositor
    await factory.approveReference(
      poolTemplate.address,
      4,
      ZERO_ADDRESS,
      true
    )

    
    await factory.approveReference(indexTemplate.address, 0, usdc.address, true)
    await factory.approveReference(
      indexTemplate.address,
      1,
      registry.address,
      true
    )
    await factory.approveReference(
      indexTemplate.address,
      2,
      parameters.address,
      true
    )

    
    await factory.approveReference(cdsTemplate.address, 0, usdc.address, true)
    await factory.approveReference(
      cdsTemplate.address,
      1,
      registry.address,
      true
    )
    await factory.approveReference(
      cdsTemplate.address,
      2,
      parameters.address,
      true
    )
    

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
    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0],
      [usdc.address, usdc.address, registry.address, parameters.address, gov.address]
    )
    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [0],
      [usdc.address, usdc.address, registry.address, parameters.address, gov.address]
    )

    const marketAddress1 = await factory.markets(0)
    const marketAddress2 = await factory.markets(1)

    market1 = await PoolTemplate.attach(marketAddress1)
    market2 = await PoolTemplate.attach(marketAddress2)

    //create CDS
    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      [],
      [usdc.address, registry.address, parameters.address]
    )

    //create Index
    await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      [],
      [usdc.address, registry.address, parameters.address]
    )
    
    const marketAddress3 = await factory.markets(2) //CDS
    const marketAddress4 = await factory.markets(3) //Index

    cds = await CDSTemplate.attach(marketAddress3)
    index = await IndexTemplate.attach(marketAddress4)

    await registry.setCDS(ZERO_ADDRESS, cds.address) //default CDS

    await index.set("0", market1.address, defaultLeverage) //set market1 to the Index
    await index.set("1", market2.address, defaultLeverage) //set market2 to the Index

    await index.setLeverage(targetLeverage)
  })

  beforeEach(async () => {
    snapshotId = await snapshot()
  })

  afterEach(async () => {
    await restore(snapshotId)
  })

  describe("initialize", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("should set configs after initialization ", async function () {

      expect(await index.name()).to.equal("InsureDAO-Index")
      expect(await index.symbol()).to.equal("iIndex")
      expect(await index.decimals()).to.equal(18)

      expect(await index.parameters()).to.equal(parameters.address)
      expect(await index.vault()).to.equal(vault.address)
      expect(await index.registry()).to.equal(registry.address)
      expect(await index.metadata()).to.equal("Here is metadata.")
    })

    it("reverts when already initialized", async function () {
      expect(await index.initialized()).to.equal(true)

      await expect(index.initialize(
        "Here is metadata.",
        [0],
        [usdc.address, registry.address, parameters.address]
        )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")
    })

    it("reverts when address is zero and/or metadata is empty", async function () {
      await factory.approveReference(
        indexTemplate.address,
        0,
        ZERO_ADDRESS,
        true
      )
      await factory.approveReference(
        indexTemplate.address,
        1,
        ZERO_ADDRESS,
        true
      )
      await factory.approveReference(
        indexTemplate.address,
        2,
        ZERO_ADDRESS,
        true
      )
      
      await expect(factory.createMarket(
        indexTemplate.address,
        "",
        [],
        [usdc.address, registry.address, parameters.address]
      )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")

      await expect(factory.createMarket(
        indexTemplate.address,
        "Here is metadata.",
        [],
        [ZERO_ADDRESS, registry.address, parameters.address]
      )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")

      await expect(factory.createMarket(
        indexTemplate.address,
        "Here is metadata.",
        [],
        [usdc.address, ZERO_ADDRESS, parameters.address]
      )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")

      await expect(factory.createMarket(
        indexTemplate.address,
        "Here is metadata.",
        [],
        [usdc.address, registry.address, ZERO_ADDRESS]
      )).to.revertedWith("ERROR: INITIALIZATION_BAD_CONDITIONS")
    })
  })

  describe("deposit", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("should increase the crowd pool size and attribution.", async function () {
      let tx = await index.connect(alice).deposit(depositAmount)

      {//sanity check
        let mintedAmount = (await tx.wait()).events[3].args['value']

        //should return same amount of iToken(usual case) 
        expect(mintedAmount).to.equal(depositAmount)
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (targetLeverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (targetLeverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: mintedAmount,  //lp minted
          totalLiquidity: depositAmount, //deposited
          totalAllocatedCredit: depositAmount.mul(targetLeverage).div(defaultLeverage),  //
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,  //actual leverage
          withdrawable: depositAmount,
          rate: defaultRate
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount.mul(targetLeverage).div(2).div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount.mul(targetLeverage).div(2).div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: depositAmount //transfer to here
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("should return same amount of iToken(usual case) ", async function () {
      let tx = await index.connect(alice).deposit(depositAmount) //LP mintAmount should be depositAmount*2
      let mintedAmount = (await tx.wait()).events[3].args['value']

      //should return same amount of iToken(usual case) 
      expect(mintedAmount).to.equal(depositAmount)
    })

    it("should return larger amount of iToken when the rate is low(when compensated)", async function () {
      //setup
      await index.connect(bob).deposit(depositAmount) //LP:USDC = 1:1

      let compensate = depositAmount

      //Bob buys insurance and redeem
      let tx = await market1.connect(chad).insure(
        depositAmount, //insured amount
        depositAmount, //max-cost
        YEAR, //span
        target //targetID
      )
      let premiumAmount = (await tx.wait()).events[2].args['premium']
      let govFee = premiumAmount.mul(governanceFeeRate).div(RATE_DIVIDER)
      let income = premiumAmount.sub(govFee)
      

      let incident = await now()
      let proof = await applyCover({
          pool: market1,
          pending: DAY,
          targetAddress: ZERO_ADDRESS, //everyone
          payoutNumerator: 10000,
          payoutDenominator: 10000,
          incidentTimestamp: incident
        })
      
      await market1.connect(chad).redeem(0, proof); //market1 has debt now

      await verifyVaultStatusOf({
        vault: vault,
        target: market1.address,
        attributions: income,
        underlyingValue: income,
        debt: depositAmount //debt exist
      })

      await verifyBalances({
        token: usdc,
        userBalances: {
          //EOA
          [gov.address]: ZERO,
          [alice.address]: initialMint,
          [bob.address]: initialMint.sub(depositAmount),
          [chad.address]: initialMint.sub(premiumAmount).add(depositAmount), //bought insurance, then got covered.
          //contracts
          [market1.address]: ZERO,
          [market2.address]: ZERO,
          [index.address]: ZERO,
          [cds.address]: ZERO,
          [vault.address]: premiumAmount 
        }
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount,  //lp minted
        totalLiquidity: depositAmount.add(income),
        totalAllocatedCredit: depositAmount.mul(targetLeverage).div(defaultLeverage),  //
        totalAllocPoint: targetLeverage,
        targetLev: targetLeverage,
        leverage: depositAmount.mul(targetLeverage).div(depositAmount.add(income)),  //actual leverage
        withdrawable: depositAmount.add(income),
        rate: defaultRate.mul(depositAmount.add(income)).div(depositAmount)
      })

      await moveForwardPeriods(1)

      await market1.resume() //clean up the debt
      //index lose depositedAmount to compensate for Market1

      await index.resume();

      await verifyVaultStatusOf({
        vault: vault,
        target: index.address,
        attributions: income,
        underlyingValue: income,
        debt: ZERO
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: depositAmount,  //lp minted
        totalLiquidity: income,
        totalAllocatedCredit: income.mul(targetLeverage).div(defaultLeverage),  //
        totalAllocPoint: targetLeverage,
        targetLev: targetLeverage,
        leverage: targetLeverage,  //actual leverage
        withdrawable: income,
        rate: defaultRate.mul(income).div(depositAmount)
      })

      //now deposit again
      tx = await index.connect(bob).deposit(depositAmount) //LP:USDC = 1:?

      let mintedAmount = (await tx.wait()).events[3].args['value']

      console.log(defaultRate.mul(income).div(depositAmount).toString())
      console.log(defaultRate.toString())

      expect(mintedAmount).to.equal(depositAmount.mul(depositAmount).div(income)) //mintAmount = amount * totalSupply / totalLiquidity
    })
  })

  describe("requestWithdraw", function(){
    beforeEach(async () => {
      await index.connect(alice).deposit(depositAmount)

      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: depositAmount, //+= depositAmount * (allocPoint / totalAllocPoint) * (leverage / defaultLeverage)
              availableBalance: depositAmount, //increase
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: depositAmount,  //lp minted
          totalLiquidity: depositAmount, //deposited
          totalAllocatedCredit: depositAmount.mul(targetLeverage).div(defaultLeverage),  //
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: targetLeverage,  //actual leverage
          withdrawable: depositAmount,
          rate: defaultRate
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: depositAmount,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
        }

        await verifyPoolsStatusForIndex({
          pools: [
            {
              pool: market1,
              indexAddress: index.address,
              allocatedCredit: depositAmount.mul(targetLeverage).div(2).div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            },
            {
              pool: market2,
              indexAddress: index.address,
              allocatedCredit: depositAmount.mul(targetLeverage).div(2).div(defaultLeverage), //div(2) because market1 and 2 have same allocPoint
              pendingPremium: ZERO,
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: depositAmount,
          valueAll: depositAmount,
          totalAttributions: depositAmount,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: depositAmount,
            underlyingValue: depositAmount,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: depositAmount //transfer to here
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: depositAmount, //lp minted
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

  describe("_beforeTokenTransfer", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

  describe("withdraw", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

  describe("withdrawable", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

  describe("adjustAlloc", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

  describe("compensate", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

  describe("", function(){
    beforeEach(async () => {
      //this is important to check all the variables every time to make sure we forget nothing
      {//sanity check
        
        await verifyPoolsStatus({
          pools: [
            {
              pool: market1,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            },
            {
              pool: market2,
              totalSupply: ZERO,
              totalLiquidity: ZERO,
              availableBalance: ZERO,
              rate: ZERO,
              utilizationRate: ZERO,
              allInsuranceCount: ZERO
            }
          ]
        })

        await verifyIndexStatus({
          index: index,
          totalSupply: ZERO, 
          totalLiquidity: ZERO, 
          totalAllocatedCredit: ZERO, 
          totalAllocPoint: targetLeverage,
          targetLev: targetLeverage,
          leverage: ZERO, 
          withdrawable: ZERO,
          rate: ZERO
        })

        {//verifyIndexStatusOf
          await verifyIndexStatusOf({
            index: index,
            targetAddress: alice.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: bob.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOf({
            index: index,
            targetAddress: chad.address,
            valueOfUnderlying: ZERO,
            withdrawTimestamp: ZERO,
            withdrawAmount: ZERO
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market1.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })

          await verifyIndexStatusOfPool({
            index: index,
            poolAddress: market2.address,
            allocPoints: targetLeverage.div(2) //alloc evenly
          })
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
            }
          ]
        })

        await verifyCDSStatus({
          cds: cds, 
          surplusPool: ZERO,
          crowdPool: ZERO, 
          totalSupply: ZERO,
          totalLiquidity: ZERO, 
          rate: ZERO
        })

        await verifyVaultStatus({
          vault: vault,
          balance: ZERO,
          valueAll: ZERO,
          totalAttributions: ZERO,
          totalDebt: ZERO
        })

        { //Vault Status Of 
          await verifyVaultStatusOf({
            vault: vault,
            target: market1.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: market2.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
  
          await verifyVaultStatusOf({
            vault: vault,
            target: index.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
    
          await verifyVaultStatusOf({
            vault: vault,
            target: cds.address,
            attributions: ZERO,
            underlyingValue: ZERO,
            debt: ZERO
          })
        }

        { //token, lp token
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
              [vault.address]: ZERO
            }
          })

          await verifyBalances({
            token: market1,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: market2,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

          await verifyBalances({
            token: index,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })
  
          await verifyBalances({
            token: cds,
            userBalances: {
              [alice.address]: ZERO,
              [bob.address]: ZERO,
              [chad.address]: ZERO,
            }
          })

        }
      }
    })

    it("", async function () {
    })
  })

})
