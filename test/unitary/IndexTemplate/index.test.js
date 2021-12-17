const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");


const {
  verifyBalance,
  verifyBalances,
  verifyAllowance,
  verifyPoolsStatus_legacy,
  verifyPoolsStatusOf,
  verifyIndexStatus,
  verifyVaultStatus_legacy,
  verifyVaultStatusOf_legacy,
  insure
} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
  long,
  wrong,
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

async function now() {
  let now = (await ethers.provider.getBlock('latest')).timestamp;
  return now
}

async function moveForwardPeriods (days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true
}


describe.skip("Index", function () {
  const initialMint = BigNumber.from("100000");

  const depositAmount = BigNumber.from("10000");
  const depositAmountLarge = BigNumber.from("40000");
  const defaultRate = BigNumber.from("1000000000000000000");
  const insureAmount = BigNumber.from("10000");

  const governanceFeeRate = BigNumber.from("10000"); //10%
  const RATE_DIVIDER = BigNumber.from("100000"); //1e5
  const UTILIZATION_RATE_LENGTH_1E8 = BigNumber.from("100000000"); //1e8


  //market status tracker
  let m = {}

  /** will be like below in the "before(async..." execution
  * let m1 = {
  *   totalSupply: BigNumber.from("0"),
  *   depositAmount: BigNumber.from("0"),
  *   marketBalance: BigNumber.from("0"),
  *   insured: BigNumber.from("0"),
  *   rate: BigNumber.from("0"),
  *   utilizationRate: BigNumber.from("0"),
  *   allInsuranceCount: BigNumber.from("0")
  * }
  */

  //global status tracker
  let g = {
    totalBalance: BigNumber.from("0"),
    govBalance: BigNumber.from("0"),
  }

  //user balance tracker (this assumes there is only one market)
  let u = {}

  /** will be like below in the "before(async..." execution
   * 
   * u = {
   *    "balance": BigNumber,
   *    "deposited": BigNumber,
   *    "lp": BigNumber
   *  }
   */

  const approveDeposit = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    let tx = await target.connect(depositer).deposit(amount);
    let receipt = await tx.wait();


    if(m[target.address].type == "index"){
      console.log("type: index")
      let _mintAmount = receipt.events[6].args["mint"].toString();

      u[`${depositer.address}`].balance = u[`${depositer.address}`].balance.sub(amount)
      u[`${depositer.address}`].deposited[`${target.address}`] = u[`${depositer.address}`].deposited[`${target.address}`].add(amount)
      u[`${depositer.address}`].lp[`${target.address}`] = u[`${depositer.address}`].lp[`${target.address}`].add(_mintAmount)
      
      
    }else if(m[target.address].type == "type: pool"){
      //update user info => check
      let _mintAmount = (await tx.wait()).events[2].args["mint"].toString()

      u[`${depositer.address}`].balance = u[`${depositer.address}`].balance.sub(amount)
      u[`${depositer.address}`].deposited = u[`${depositer.address}`].deposited.add(amount)
      u[`${depositer.address}`].lp = u[`${depositer.address}`].lp.add(_mintAmount)

      expect(await token.balanceOf(depositer.address)).to.equal(u[`${depositer.address}`].balance)
      expect(await target.balanceOf(depositer.address)).to.equal(u[`${depositer.address}`].lp)

      
      //update global and market status => check
      g.totalBalance = g.totalBalance.add(amount)

      m1.totalSupply = m1.totalSupply.add(_mintAmount)
      m1.depositAmount = m1.depositAmount.add(amount)
      m1.marketBalance = m1.marketBalance.add(amount)

      if(!m1.depositAmount.isZero()){
        m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalSupply)
      }else{
        m1.rate = ZERO
      }

      if(!m1.utilizationRate.isZero()){
        m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
      }else{
        m1.utilizationRate = ZERO
      }

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: target,
            totalSupply: m1.totalSupply,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      await verifyValueOfUnderlying({
        template: target,
        valueOfUnderlyingOf: depositer.address,
        valueOfUnderlying: u[`${depositer.address}`].lp.mul(m1.rate).div(defaultRate)
      })

    }else if(m[target.address].type == "cds"){

    }
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {
    await token.connect(depositer).approve(vault.address, amount);
    await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);
  }

  const applyCover = async ({pool, pending, payoutNumerator, payoutDenominator, incidentTimestamp}) => {

    const tree = await new MerkleTree(short, keccak256, {
      hashLeaves: true,
      sortPairs: true,
    });

    const root = await tree.getHexRoot();
    const leaf = keccak256(short[0]);
    const proof = await tree.getHexProof(leaf);

    await pool.applyCover(
      pending,
      payoutNumerator,
      payoutDenominator,
      incidentTimestamp,
      root,
      short,
      "metadata"
    );

    return proof
  }

  before('deploy & setup contracts', async()=>{
    //import
    [creator, alice, bob, chad, tom, minter] = await ethers.getSigners();

    const Ownership = await ethers.getContractFactory("Ownership");
    const DAI = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
    const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
    const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
    const Factory = await ethers.getContractFactory("Factory");
    const Vault = await ethers.getContractFactory("Vault");
    const Registry = await ethers.getContractFactory("Registry");
    const PremiumModel = await ethers.getContractFactory("TestPremiumModel");
    const Parameters = await ethers.getContractFactory("Parameters");
    const Contorller = await ethers.getContractFactory("ControllerMock");

    //deploy
    ownership = await Ownership.deploy();
    dai = await DAI.deploy();
    registry = await Registry.deploy(ownership.address);
    factory = await Factory.deploy(registry.address, ownership.address);
    premium = await PremiumModel.deploy();
    controller = await Contorller.deploy(dai.address, ownership.address);
    vault = await Vault.deploy(
      dai.address,
      registry.address,
      controller.address,
      ownership.address
    );
    poolTemplate = await PoolTemplate.deploy();
    cdsTemplate = await CDSTemplate.deploy();
    indexTemplate = await IndexTemplate.deploy();
    parameters = await Parameters.deploy(ownership.address);

    await dai.mint(chad.address, (100000).toString());
    await dai.mint(bob.address, (100000).toString());
    await dai.mint(alice.address, (100000).toString());

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
    await factory.approveTemplate(indexTemplate.address, true, false, true);
    await factory.approveTemplate(cdsTemplate.address, true, false, true);

    await factory.approveReference(poolTemplate.address, 0, dai.address, true);
    await factory.approveReference(poolTemplate.address, 1, dai.address, true);
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
      indexTemplate.address,
      2,
      parameters.address,
      true
    );
    await factory.approveReference(indexTemplate.address, 0, dai.address, true);
    await factory.approveReference(
      indexTemplate.address,
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
    await factory.approveReference(cdsTemplate.address, 0, dai.address, true);
    await factory.approveReference(
      cdsTemplate.address,
      1,
      registry.address,
      true
    );


    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    await parameters.setMaxList(ZERO_ADDRESS, "10");
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMinDate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "86400000");
    await parameters.setVault(dai.address, vault.address);

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [1, 0],
      [dai.address, dai.address, registry.address, parameters.address]
    );
    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [1, 0],
      [dai.address, dai.address, registry.address, parameters.address]
    );
    const marketAddress1 = await factory.markets(0);
    const marketAddress2 = await factory.markets(1);
    market1 = await PoolTemplate.attach(marketAddress1);
    market2 = await PoolTemplate.attach(marketAddress2);

    await factory.createMarket(
      cdsTemplate.address,
      "Here is metadata.",
      [0],
      [dai.address, registry.address, parameters.address]
    );
    await factory.createMarket(
      indexTemplate.address,
      "Here is metadata.",
      [0],
      [dai.address, registry.address, parameters.address]
    );
    const marketAddress3 = await factory.markets(2);
    const marketAddress4 = await factory.markets(3);
    cds = await CDSTemplate.attach(marketAddress3);
    index = await IndexTemplate.attach(marketAddress4);

    markets = [market1, market2, cds, index]

    m[`${market1.address}`] = {
      type: "pool",
      totalSupply: BigNumber.from("0"),
      depositAmount: BigNumber.from("0"),
      marketBalance: BigNumber.from("0"),
      insured: BigNumber.from("0"),
      rate: BigNumber.from("0"),
      utilizationRate: BigNumber.from("0"),
      allInsuranceCount: BigNumber.from("0")
    }

    m[`${market2.address}`] = {
      type: "pool",
      totalSupply: BigNumber.from("0"),
      depositAmount: BigNumber.from("0"),
      marketBalance: BigNumber.from("0"),
      insured: BigNumber.from("0"),
      rate: BigNumber.from("0"),
      utilizationRate: BigNumber.from("0"),
      allInsuranceCount: BigNumber.from("0")
    }

    m[`${cds.address}`] = {
      type: "cds",
      totalSupply: BigNumber.from("0"),
      totalLiquidity: BigNumber.from("0"),
      rate: BigNumber.from("0")
    }

    m[`${index.address}`] = {
      type: "index",
      totalSupply: BigNumber.from("0"),
      totalLiquidity: BigNumber.from("0"),
      totalAllocatedCredit: BigNumber.from("0"),
      leverage: BigNumber.from("0"),
      withdrawable: BigNumber.from("0"),
      rate: BigNumber.from("0"),
      children: []
    }

    accounts = [alice, bob, chad, tom];

    

    for(i=0; i<accounts.length; i++){
      u[`${accounts[i].address}`] = {
        "balance": initialMint, 
        "deposited": {}, 
        "lp": {}
      }; //will mint for them later

      for(j=0; j< markets.length; j++){
        u[`${accounts[i].address}`].deposited[`${markets[j].address}`] = ZERO
        u[`${accounts[i].address}`].lp[`${markets[j].address}`] = ZERO
      }
    }
    console.log(u[`${alice.address}`])

    await registry.setCDS(ZERO_ADDRESS, cds.address);

    await index.set("0", market1.address, "1000");
    await index.set("1", market2.address, "1000");
    await index.setLeverage("2000");

    m[`${index.address}`].leverage = BigNumber.from("2000")
  })

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    await restore(snapshotId)

    for(i=0; i<accounts.length; i++){
      u[`${accounts[i].address}`] = {
        "balance": initialMint, 
        "deposited": {}, 
        "lp": {}
      }; //will mint for them later

      for(j=0; j< markets.length; j++){
        u[`${accounts[i].address}`].deposited[`${markets[j].address}`] = ZERO
        u[`${accounts[i].address}`].lp[`${markets[j].address}`] = ZERO
      }
    }

    for(i=0; i< markets.length; i++){
      switch(m[`${markets[i].address}`].type){
        case 'index':
          break;

        case 'pool':
          break;

        case 'cds':
          break;
      }
    }

  })

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

  describe.skip("deposit", function(){
    beforeEach(async () => {
    });

    it("deposit success", async function () {
      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: depositAmount
      })

      //CHECK ALL STATUS
      //index
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000, //LP token
        totalLiquidity: 10000, //underwriting asset
        totalAllocatedCredit: 20000, //totalLiquidity * (leverage/1000)
        leverage: 2000,
        withdrawable: 10000, //un-utilized underwriting asset
        rate: "1000000000000000000"
      })

      //pool
      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })

      //vault
      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })
    });


    it.skip("revert when paused", async function () {
      await index.setPaused(true);

      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
    });

    it.skip("revert when locked", async function () {
    });

    it.skip("revert when amount is 0", async function () {
    });
  })

  describe.skip("withdraw", function () {
    beforeEach(async () => {
      //deposit and withdraw request
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //CHECK ALL STATUS
      //index
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000, //LP token
        totalLiquidity: 10000, //underwriting asset
        totalAllocatedCredit: 20000, //totalLiquidity * (leverage/1000)
        leverage: 2000,
        withdrawable: 10000, //un-utilized underwriting asset
        rate: "1000000000000000000"
      })

      //pool
      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })

      //vault
      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })
    });

    it("success withdraw", async function () {
      await moveForwardPeriods(8);

      await index.connect(alice).withdraw("10000");

      //CHECK ALL STATUS
      //index
      await verifyIndexStatus({
        index: index,
        totalSupply: 0,
        totalLiquidity: 0,
        totalAllocatedCredit: 0,
        leverage: 0, //become 0 too
        withdrawable: 0,
        rate: "0"
      })

      //pool
      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 0,
            availableBalance: 0
          },
          {
            pool: market2,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })

      //vault
      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 0,
        totalAttributions: 0,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 0,
        underlyingValue: 0
      })
    });

    it("success when paused", async function () {

      await index.setPaused(true);

      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await moveForwardPeriods(8);

      await index.connect(alice).withdraw("10000");
      
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100000
      })
      
    });

    it("revert WITHDRAWAL_PENDING", async function () {
    });

    it("revert when until lockup period ends", async function () {

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );
    });

    it("revert WITHDRAWAL_NO_ACTIVE_REQUEST", async function () {
    });

    it("revert when amount is more than request", async function () {

      await moveForwardPeriods(8);

      await expect(index.connect(alice).withdraw("10001")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
    });

    it("revert withdraw zero balance", async function () {

      await moveForwardPeriods(8);
      await expect(index.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("revert withdraw when liquidity is locked for insurance", async function () {

      await dai.connect(bob).approve(vault.address, 20000);
      
      let receipt = await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: YEAR,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })


      let premium = receipt.events[4].args[6]
      let expectPremium = BigNumber.from("10000").div("10"); //amount * premium rate

      expect(premium).to.equal(expectPremium);

      expect(await market1.utilizationRate()).to.equal("100000000");
      expect(await market2.utilizationRate()).to.equal("0");

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 99000
      })

      await verifyBalance({
        token: dai,
        address: vault.address,
        expectedBalance: 11000
      })
      

      //after insure(), index gains premium, but aloc doesn't change. this leads to lower the leverage
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10950,
        totalAllocatedCredit: 20000,
        leverage: 1826,
        withdrawable: 950,
        rate: "1095000000000000000"
      })

      await moveForwardPeriods(8);

      await expect(index.connect(alice).withdraw("951")).to.revertedWith(
        "ERROR: WITHDRAW_INSUFFICIENT_LIQUIDITY"
      );
    });
  });

  describe.skip("else", function(){
    beforeEach(async () => {
    });

    it("accrues premium after deposit", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await dai.connect(bob).approve(vault.address, 20000);

      expect(await index.rate()).to.equal("1000000000000000000");

      await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: YEAR,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyBalance({
        token: dai,
        address: bob.address,
        expectedBalance: 99000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10950,
        totalAllocatedCredit: 20000,
        leverage: 1826,
        withdrawable: 950,
        rate: "1095000000000000000"
      })

      expect(await market1.pendingPremium(index.address)).to.equal("950"); //verify


      //withdrawal also harvest accrued premium
      await moveForwardPeriods(369);

      await market1.unlock("0");

      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 90000
      })

      await index.connect(alice).withdraw("10000");

      //Harvested premium is reflected on their account balance
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100950
      })
    });

    it("also transfers lockup period when iToken is transferred", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      //Transferring iToken, which also distribute premium
      await index.connect(alice).transfer(tom.address, "10000");
      await index.connect(tom).requestWithdraw("10000");

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );
      await expect(index.connect(tom).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_QUEUE"
      );

      await moveForwardPeriods(8);

      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
      await index.connect(tom).withdraw("10000");

      await verifyBalance({
        token: dai,
        address: tom.address,
        expectedBalance: 10000
      })
    });

    it("DISABLE deposit when paused(withdrawal is possible)", async function () {
      
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await index.setPaused(true);

      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await moveForwardPeriods(8);

      await index.connect(alice).withdraw("10000");
      
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100000
      })
      
    });

    it("DISABLE deposit and withdrawal when reporting or payingout", async function () {
      //Can deposit and withdraw in normal time
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await moveForwardPeriods(8);

      let incident = await now();  

      await applyCover({
        pool: market1,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await expect(index.connect(alice).deposit("10000")).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );
      await expect(index.connect(alice).withdraw("10000")).to.revertedWith(
        "ERROR: WITHDRAWAL_PENDING"
      );

      await moveForwardPeriods(11);

      await market1.resume();
      await index.resume();

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })
      
      await index.connect(alice).withdraw("10000");
      await verifyBalance({
        token: dai,
        address: alice.address,
        expectedBalance: 100000
      })
    });

    it("devaluate underlying when cover claim is accepted", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })

      await dai.connect(bob).approve(vault.address, 10000);
      let receipt = await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      let premiumRate = 100000 //10%
      let divider = 1000000

      let premium = receipt.events[4].args[6]
      let expectPremium = BigNumber.from("10000").mul(premiumRate).div(divider); //amount * premium rate
      expect(premium).to.equal(expectPremium);

      
      expect(await dai.balanceOf(bob.address)).to.equal("99000");

      let incident = await now()

      let proof = await applyCover({
        pool: market1,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 11000,
        totalAttributions: 11000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: creator.address,
        attributions: 50,
        underlyingValue: 50
      })


      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: market1.address,
        attributions: 950,
        underlyingValue: 950
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })
      


      expect(await market1.totalLiquidity()).to.closeTo("10000", "1");

      await market1.connect(bob).redeem("0", proof);

      await expect(market1.connect(alice).unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 5950,
        totalAllocatedCredit: 11900,
        leverage: 2000,
        withdrawable: 5950,
        rate: "595000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        target: index.address,
        attributions: 5054,
        valueAll: 6000,
        totalAttributions: 6000,
        underlyingValue: 5054
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 5950,
            availableBalance: 5950
          },
          {
            pool: market2,
            totalLiquidity: 5950,
            availableBalance: 5950
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 5950,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 5950,
          }
        ]
      })

      await moveForwardPeriods(11);
      await market1.resume();
      await index.resume();

      await index.connect(alice).withdraw("10000");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95950,
          [bob.address]: 104000
        }
      })

      //Simulation: full payout
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );

      await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 8,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })
      
      incident = await now();  

      proof = await applyCover({
        pool: market1,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await market1.connect(bob).redeem("1", proof);

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 950,
        totalAllocatedCredit: 1900,
        leverage: 2000,
        withdrawable: 950,
        rate: "95000000000000000"
      })
      expect(await index.valueOfUnderlying(alice.address)).to.equal("950");

      await moveForwardPeriods(11);

      await market1.resume();
      await index.resume();

      await index.connect(alice).withdraw("10000");

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 86900,
          [bob.address]: 113000
        }
      })
    });

  })

  describe.skip("Index parameter configurations (case un-equal allocation)", function () {
    beforeEach(async () => {
      //Deploy a new pool
      const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
      await factory.createMarket(
        poolTemplate.address,
        "Here is metadata.",
        [1, 0],
        [dai.address, dai.address, registry.address, parameters.address]
      );
      const marketAddress5 = await factory.markets(4);
      market3 = await PoolTemplate.attach(marketAddress5);
    });

    it("allows new pool addition", async function () {
      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //Case1: Add when no liquidity is locked
      //Expected results: Reallocaet liquidity market1: 5000, market2: 5000, market3: 10000
      await index.set("2", market3.address, "2000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })
      

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 5000,
            availableBalance: 5000
          },
          {
            pool: market2,
            totalLiquidity: 5000,
            availableBalance: 5000
          },
          {
            pool: market3,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 5000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 5000,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })


      await index.set("2", market3.address, "0");

      //Case2: Add when liquidity is locked(market1 has locked 50% of index liquidity ) d
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })
      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })

      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market1,
        insurer: bob,
        amount: 10000,
        maxCost: 10000,
        span: 86400 * 10,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      expect(await market1.totalLiquidity()).to.equal("10000");
      expect(await market1.availableBalance()).to.equal("0");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10950,
        totalAllocatedCredit: 20000,
        leverage: 1826,
        withdrawable: 950,
        rate: "1095000000000000000"
      })

      await index.set("2", market3.address, "2000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10950,
        totalAllocatedCredit: 21899,
        leverage: 1999,
        withdrawable: 0,
        rate: "1095000000000000000"
      })
      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 0
          },
          {
            pool: market2,
            totalLiquidity: 3966,
            availableBalance: 3966
          },
          {
            pool: market3,
            totalLiquidity: 7933,
            availableBalance: 7933
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 3966,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 7933,
          }
        ]
      })
    });

    it("allows pool removal", async function () {
      await index.set("2", market3.address, "1000");

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //before remomval
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 19998,
        leverage: 1999,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 6666,
            availableBalance: 6666
          },
          {
            pool: market2,
            totalLiquidity: 6666,
            availableBalance: 6666
          },
          {
            pool: market3,
            totalLiquidity: 6666,
            availableBalance: 6666
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          }
        ]
      })


      //after remomval
      await index.set("2", market3.address, "0");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })
    });


    it("mimics pool removal if the pool is paused", async function () {
      await index.set("2", market3.address, "1000");

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //before remomval

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 19998,
        leverage: 1999,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 6666,
            availableBalance: 6666
          },
          {
            pool: market2,
            totalLiquidity: 6666,
            availableBalance: 6666
          },
          {
            pool: market3,
            totalLiquidity: 6666,
            availableBalance: 6666
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          }
        ]
      })

      //after remomval
      await market3.setPaused(true);
      await index.adjustAlloc();

      expect(await market1.allocatedCredit(index.address)).to.equal("10000");

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 20000,
        leverage: 2000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 0,
            availableBalance: 0
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 0,
          }
        ]
      })
    });

    it("allows leverage rate increment", async function () {
      await index.set("2", market3.address, "1000");

      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //lev 2.0
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 19998,
        leverage: 1999,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 6666,
            availableBalance: 6666
          },
          {
            pool: market2,
            totalLiquidity: 6666,
            availableBalance: 6666
          },
          {
            pool: market3,
            totalLiquidity: 6666,
            availableBalance: 6666
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 6666,
          }
        ]
      })


      //Lev3.0
      await index.setLeverage("3000");
      await index.adjustAlloc();

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 30000,
        leverage: 3000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })
      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })
    });

    it("allows leverage rate decrement", async function () {
      await index.set("2", market3.address, "1000");

      await index.setLeverage("3000");
      await approveDeposit({
        token: dai,
        target: index,
        depositer: alice,
        amount: 10000
      })

      //Lev3.0
      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10000,
        totalAllocatedCredit: 30000,
        leverage: 3000,
        withdrawable: 10000,
        rate: "1000000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10000,
        totalAttributions: 10000,
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10000,
        underlyingValue: 10000
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market2,
            totalLiquidity: 10000,
            availableBalance: 10000
          },
          {
            pool: market3,
            totalLiquidity: 10000,
            availableBalance: 10000
          }
        ]
      })
      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })

      //Lev2.0 when liquidity is locked
      let currentTimestamp = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      //let endTime = await currentTimestamp.add(86400 * 10);
      await dai.connect(bob).approve(vault.address, 10000);
      await insure({
        pool: market1,
        insurer: bob,
        amount: 9999,
        maxCost: 10000,
        span: 86400 * 10,
        target: '0x4e69636b00000000000000000000000000000000000000000000000000000000'
      })

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10950,
        totalAllocatedCredit: 30000,
        leverage: 2739,
        withdrawable: 950,
        rate: "1095000000000000000"
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 10000,
            availableBalance: 1
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 10000,
          }
        ]
      })


      await index.setLeverage("2000"); //deleverage
      await index.adjustAlloc();

      await verifyIndexStatus({
        index: index,
        totalSupply: 10000,
        totalLiquidity: 10950,
        totalAllocatedCredit: 21899,
        leverage: 1999,
        withdrawable: 0,
        rate: "1095000000000000000"
      })

      await verifyVaultStatus_legacy({
        vault: vault,
        valueAll: 10999,
        totalAttributions: 10999
      })

      await verifyVaultStatusOf_legacy({
        vault: vault,
        target: index.address,
        attributions: 10950,
        underlyingValue: 10950
      })

      await verifyPoolsStatus_legacy({
        pools: [
          {
            pool: market1,
            totalLiquidity: 9999,
            availableBalance: 0
          },
          {
            pool: market2,
            totalLiquidity: 5950,
            availableBalance: 5950
          },
          {
            pool: market3,
            totalLiquidity: 5950,
            availableBalance: 5950
          }
        ]
      })

      await verifyPoolsStatusOf({
        pools: [
          {
            pool: market1,
            allocatedCreditOf: index.address,
            allocatedCredit: 9999,
          },
          {
            pool: market2,
            allocatedCreditOf: index.address,
            allocatedCredit: 5950,
          },
          {
            pool: market3,
            allocatedCreditOf: index.address,
            allocatedCredit: 5950,
          }
        ]
      })

    });
  });

  describe.skip("Admin functions", function () {
    it("allows changing metadata", async function () {
      expect(await index.metadata()).to.equal("Here is metadata.");
      await index.changeMetadata("new metadata");
      expect(await index.metadata()).to.equal("new metadata");
    });
  });
});
