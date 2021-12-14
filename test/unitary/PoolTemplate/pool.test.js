const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  verifyBalances,
  verifyAllowance,

  verifyPoolsStatus,
  verifyPoolsStatusForIndex,

  verifyValueOfUnderlying,

  verifyIndexStatus,

  verifyVaultStatus,
  verifyVaultStatusOf,
  verifyDebtOf,

  verifyRate
} = require('../test-utils')


const{ 
  ZERO_ADDRESS,
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

describe("Pool", function () {
  const initialMint = BigNumber.from("100000"); //initial token amount for users

  const depositAmount = BigNumber.from("10000"); //default deposit amount for test
  const depositAmountLarge = BigNumber.from("40000"); //default deposit amount (large) for test
  const defaultRate = BigNumber.from("1000000000000000000"); //initial rate between USDC and LP token
  const insureAmount = BigNumber.from("10000"); //default insure amount for test

  const governanceFeeRate = BigNumber.from("10000"); //10% of the Premium
  const RATE_DIVIDER = BigNumber.from("100000"); //1e5
  const UTILIZATION_RATE_LENGTH_1E8 = BigNumber.from("100000000"); //1e8


  //market status tracker.
  let m1 = {
    totalLP: BigNumber.from("0"),
    depositAmount: BigNumber.from("0"),
    marketBalance: BigNumber.from("0"),
    insured: BigNumber.from("0"),
    rate: BigNumber.from("0"),
    utilizationRate: BigNumber.from("0"),
    allInsuranceCount: BigNumber.from("0"),
    debt: BigNumber.from("0")
  }

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


  //======== Function Wrappers ========//
  //execute function and update tracker.
  const approveDeposit = async ({token, target, depositer, amount}) => {

    //execute
    await token.connect(depositer).approve(vault.address, amount);
    let tx = await target.connect(depositer).deposit(amount);


    //1. update user info => check
    let _mintAmount = (await tx.wait()).events[2].args["mint"].toString();

    u[`${depositer.address}`].balance = u[`${depositer.address}`].balance.sub(amount) //track user wallet
    u[`${depositer.address}`].deposited = u[`${depositer.address}`].deposited.add(amount) //track amount of deposited USDC
    u[`${depositer.address}`].lp = u[`${depositer.address}`].lp.add(_mintAmount) //track amount of LP token

    expect(await token.balanceOf(depositer.address)).to.equal(u[`${depositer.address}`].balance) //sanity check
    expect(await target.balanceOf(depositer.address)).to.equal(u[`${depositer.address}`].lp) //sanity check

    
    //2. update global and market status => check
    g.totalBalance = g.totalBalance.add(amount) //global balance of USDC increase

    m1.totalLP = m1.totalLP.add(_mintAmount) //market1 (Pool) total LP balance increase as much as newly minted LP token.
    m1.depositAmount = m1.depositAmount.add(amount) //USDC deposited
    m1.marketBalance = m1.marketBalance.add(amount) //USDC deposited

    if(!m1.depositAmount.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP) //rate = (USDC balance in this contract) / (LP totalBalance)
    }else{
      m1.rate = ZERO
    }

    if(!m1.utilizationRate.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance) //how much ratio is locked (=bought as insurance) among the pool.
    }else{
      m1.utilizationRate = ZERO
    }

    //sanity check
    await verifyPoolsStatus({
      pools: [
        {
          pool: target,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance, //all deposited amount 
          availableBalance: m1.marketBalance.sub(m1.insured), //all amount - locked amount = available amount
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })

    await verifyDebtOf({
      vault: vault,
      target: target.address,
      debt: m1.debt
    })

    //sanity check
    await verifyValueOfUnderlying({
      template: target,
      valueOfUnderlyingOf: depositer.address,
      valueOfUnderlying: u[`${depositer.address}`].lp.mul(m1.rate).div(defaultRate)
    })
  }

  const approveDepositAndWithdrawRequest = async ({token, target, depositer, amount}) => {

    //execute
    await token.connect(depositer).approve(vault.address, amount);
    let tx = await target.connect(depositer).deposit(amount);
    await target.connect(depositer).requestWithdraw(amount);


    //update user info => check
    let _mintAmount = (await tx.wait()).events[2].args["mint"].toString()

    u[`${depositer.address}`].balance = u[`${depositer.address}`].balance.sub(amount)
    u[`${depositer.address}`].deposited = u[`${depositer.address}`].deposited.add(amount)
    u[`${depositer.address}`].lp = u[`${depositer.address}`].lp.add(_mintAmount)

    expect(await token.balanceOf(depositer.address)).to.equal(u[`${depositer.address}`].balance) //sanity check
    expect(await target.balanceOf(depositer.address)).to.equal(u[`${depositer.address}`].lp) //sanity check

    
    //update global and market status => check
    g.totalBalance = g.totalBalance.add(amount)

    m1.totalLP = m1.totalLP.add(_mintAmount)
    m1.depositAmount = m1.depositAmount.add(amount)
    m1.marketBalance = m1.marketBalance.add(amount)

    if(!m1.depositAmount.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP)
    }else{
      m1.rate = ZERO
    }

    if(!m1.utilizationRate.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
    }else{
      m1.utilizationRate = ZERO
    }

    //sanity check of m1
    await verifyPoolsStatus({
      pools: [
        {
          pool: target,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance,
          availableBalance: m1.marketBalance.sub(m1.insured),
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })

    await verifyDebtOf({
      vault: vault,
      target: target.address,
      debt: m1.debt
    })

    //sanity check
    await verifyValueOfUnderlying({
      template: target,
      valueOfUnderlyingOf: depositer.address,
      valueOfUnderlying: u[`${depositer.address}`].lp.mul(m1.rate).div(defaultRate)
    })
  }

  const withdraw = async ({target, withdrawer, amount}) => {
    //execute
    let tx = await target.connect(withdrawer).withdraw(amount);


    let withdrawAmount = (await tx.wait()).events[2].args["retVal"].toString()

    //update user info => check
    u[`${withdrawer.address}`].balance = u[`${withdrawer.address}`].balance.add(withdrawAmount)
    u[`${withdrawer.address}`].deposited = u[`${withdrawer.address}`].deposited.sub(withdrawAmount)
    u[`${withdrawer.address}`].lp = u[`${withdrawer.address}`].lp.sub(amount)

    expect(await dai.balanceOf(withdrawer.address)).to.equal(u[`${withdrawer.address}`].balance)
    expect(await target.balanceOf(withdrawer.address)).to.equal(u[`${withdrawer.address}`].lp)



    //update global and market status => check
    g.totalBalance = g.totalBalance.sub(withdrawAmount)

    m1.totalLP = m1.totalLP.sub(amount)
    m1.depositAmount = m1.depositAmount.sub(withdrawAmount)
    m1.marketBalance = m1.marketBalance.sub(withdrawAmount)

    if(!m1.totalLP.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP)
    }else{
      m1.rate = ZERO
    }

    if(!m1.utilizationRate.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
    }else{
      m1.utilizationRate = ZERO
    }

    await verifyPoolsStatus({
      pools: [
        {
          pool: target,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance,
          availableBalance: m1.marketBalance.sub(m1.insured),
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })

    await verifyDebtOf({
      vault: vault,
      target: target.address,
      debt: m1.debt
    })

    await verifyValueOfUnderlying({
      template: target,
      valueOfUnderlyingOf: withdrawer.address,
      valueOfUnderlying: u[`${withdrawer.address}`].lp.mul(m1.rate).div(defaultRate)
    })
  }

  const insure = async ({pool, insurer, amount, maxCost, span, target}) => {
    await dai.connect(insurer).approve(vault.address, maxCost)
    let tx = await pool.connect(insurer).insure(amount, maxCost, span, target);

    let receipt = await tx.wait()
    let premium = receipt.events[2].args['premium']

    let govFee = premium.mul(governanceFeeRate).div(RATE_DIVIDER)
    let fee = premium.sub(govFee)


    //update global and market status => check
    u[`${insurer.address}`].balance = u[`${insurer.address}`].balance.sub(premium)
    expect(await dai.balanceOf(insurer.address)).to.equal(u[`${insurer.address}`].balance)



    //update global and market status => check
    m1.insured = m1.insured.add(amount)
    m1.marketBalance = m1.marketBalance.add(fee)
    g.govBalance = g.govBalance.add(govFee)
    g.totalBalance = g.totalBalance.add(premium)

    if(!m1.marketBalance.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
    }else{
      m1.utilizationRate = ZERO
    }

    if(!m1.depositAmount.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP)
    }else{
      m1.rate = ZERO
    }

    m1.allInsuranceCount = m1.allInsuranceCount.add("1")

    await verifyPoolsStatus({
      pools: [
        {
          pool: pool,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance,
          availableBalance: m1.marketBalance.sub(m1.insured),
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })

    await verifyDebtOf({
      vault: vault,
      target: pool.address,
      debt: m1.debt
    })

    await verifyVaultStatus({
      vault: vault,
      valueAll: g.totalBalance,
      totalAttributions: g.totalBalance,
    })

    //return value
    return premium
  }

  const redeem = async ({pool, redeemer, id, proof}) => {
    let tx = await pool.connect(redeemer).redeem(id, proof);

    let receipt = await tx.wait()

    let insuredAmount = receipt.events[1].args['amount']
    let payoutAmount = receipt.events[1].args['payout']

    //update global and market status => check
    u[`${redeemer.address}`].balance = u[`${redeemer.address}`].balance.add(payoutAmount)
    expect(await dai.balanceOf(redeemer.address)).to.equal(u[`${redeemer.address}`].balance)


    //update global and market status => check
    m1.insured = m1.insured.sub(insuredAmount)
    m1.debt = m1.debt.add(payoutAmount)

    g.totalBalance = g.totalBalance.sub(payoutAmount)

    if(!m1.marketBalance.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
    }else{
      m1.utilizationRate = ZERO
    }

    if(!m1.depositAmount.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP)
    }else{
      m1.rate = ZERO
    }

    await verifyPoolsStatus({
      pools: [
        {
          pool: pool,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance,
          availableBalance: m1.marketBalance.sub(m1.insured),
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })

    await verifyDebtOf({
      vault: vault,
      target: pool.address,
      debt: m1.debt
    })

    await verifyVaultStatus({
      vault: vault,
      valueAll: g.totalBalance,
      totalAttributions: g.totalBalance,
    })


  }

  const resume = async({market}) => {
    await market.resume();

    //no update on user status
    //update global and market status => check
    let amount = (m1.marketBalance).gte(m1.debt) ? m1.debt : m1.marketBalance

    m1.debt = m1.debt.sub(amount)
    m1.marketBalance = m1.marketBalance.sub(amount)

    if(!m1.marketBalance.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
    }else{
      m1.utilizationRate = ZERO
    }

    if(!m1.depositAmount.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP)
    }else{
      m1.rate = ZERO
    }

    expect(m1.debt).to.equal(ZERO)
    await verifyDebtOf({
      vault: vault,
      target: market.address,
      debt: m1.debt
    })
  }


  const unlock = async ({target, id}) => {

    let amount = (await target.insurances(id)).amount

    await target.unlock(id);

    //update status
    m1.insured = m1.insured.sub(amount)

    if(!m1.depositAmount.isZero()){
      m1.rate = defaultRate.mul(m1.marketBalance).div(m1.totalLP)
    }else{
      m1.rate = ZERO
    }

    if(!m1.utilizationRate.isZero()){
      m1.utilizationRate = UTILIZATION_RATE_LENGTH_1E8.mul(m1.insured).div(m1.marketBalance)
    }else{
      m1.utilizationRate = ZERO
    }

    await verifyPoolsStatus({
      pools: [
        {
          pool: target,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance,
          availableBalance: m1.marketBalance.sub(m1.insured),
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })
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

  const transferLP = async ({market, from, to_address, amount}) => {

    await market.connect(from).transfer(to_address, amount);

    let balance = amount.mul(m1.rate).div(defaultRate)

    //update user info => check
    u[`${from.address}`].lp = u[`${from.address}`].lp.sub(amount)
    u[`${from.address}`].deposited = u[`${from.address}`].deposited.sub(balance)

    expect(await market.balanceOf(from.address)).to.equal(u[`${from.address}`].lp)
    await verifyValueOfUnderlying({
      template: market,
      valueOfUnderlyingOf: from.address,
      valueOfUnderlying: u[`${from.address}`].lp.mul(m1.rate).div(defaultRate)
    })



    u[`${to_address}`].lp = u[`${to_address}`].lp.add(amount)
    u[`${to_address}`].deposited = u[`${to_address}`].deposited.add(balance)

    expect(await market.balanceOf(to_address)).to.equal(u[`${to_address}`].lp)
    await verifyValueOfUnderlying({
      template: market,
      valueOfUnderlyingOf: to_address,
      valueOfUnderlying: u[`${to_address}`].lp.mul(m1.rate).div(defaultRate)
    })
  }

  const transferInsurance = async({market, from, to_address, id}) => {
    await market.connect(from).transferInsurance(id, to_address);
  }


  before(async () => {
    //import
    [gov, alice, bob, chad, tom] = await ethers.getSigners();
    accounts = [alice, bob, chad, tom];

    for(i=0; i<accounts.length; i++){
      u[`${accounts[i].address}`] = {"balance": initialMint, "deposited": ZERO, "lp":ZERO}; //will mint for them later
    }

    const Ownership = await ethers.getContractFactory("Ownership");
    const DAI = await ethers.getContractFactory("TestERC20Mock");
    const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
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
    parameters = await Parameters.deploy(ownership.address);

    //set up
    await dai.mint(chad.address, initialMint);
    await dai.mint(bob.address, initialMint);
    await dai.mint(alice.address, initialMint);
    await dai.mint(tom.address, initialMint);

    await registry.setFactory(factory.address);

    await factory.approveTemplate(poolTemplate.address, true, false, true);
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

    //set default parameters
    await parameters.setFeeRate(ZERO_ADDRESS, governanceFeeRate);
    await parameters.setGrace(ZERO_ADDRESS, "259200");
    await parameters.setLockup(ZERO_ADDRESS, "604800");
    await parameters.setMindate(ZERO_ADDRESS, "604800");
    await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
    await parameters.setWithdrawable(ZERO_ADDRESS, "2592000");
    await parameters.setVault(dai.address, vault.address);

    await factory.createMarket(
      poolTemplate.address,
      "Here is metadata.",
      [1, 0],
      [dai.address, dai.address, registry.address, parameters.address]
    );
    const marketAddress = await factory.markets(0);
    market = await PoolTemplate.attach(marketAddress);
  });

  beforeEach(async () => {
    snapshotId = await snapshot()
  });

  afterEach(async () => {
    //Check status
    await verifyVaultStatusOf({
      vault: vault,
      target: market.address,
      attributions: m1.marketBalance,
      underlyingValue: m1.marketBalance
    })

    await verifyVaultStatusOf({
      vault: vault,
      target: gov.address,
      attributions: g.govBalance,
      underlyingValue: g.govBalance
    })

    await verifyVaultStatus({
      vault: vault,
      valueAll: g.totalBalance,
      totalAttributions: g.totalBalance,
    })

    await verifyPoolsStatus({
      pools: [
        {
          pool: market,
          totalLP: m1.totalLP,
          totalLiquidity: m1.marketBalance,
          availableBalance: m1.marketBalance.sub(m1.insured),
          rate: m1.rate,
          utilizationRate: m1.utilizationRate,
          allInsuranceCount: m1.allInsuranceCount
        }
      ]
    })

    //reset status
    for(i=0; i<accounts.length; i++){
      u[`${accounts[i].address}`] = {"balance": initialMint, "deposited": ZERO, "lp":ZERO}; //will mint for them later
    }

    g.totalBalance = ZERO
    g.govBalance = ZERO

    m1.totalLP = ZERO
    m1.depositAmount = ZERO
    m1.marketBalance = ZERO
    m1.insured =   ZERO
    m1.rate = ZERO
    m1.utilizationRate = ZERO
    m1.allInsuranceCount = ZERO
    m1.debt = ZERO

    //go back to initial block
    await restore(snapshotId)
  })

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

  describe("Liquidity providing life cycles", function () {
    it("allows deposit and withdraw", async function () {
      //deposit
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      //CHECK STATUS
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: g.totalBalance,
        totalAttributions: g.totalBalance,
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: market.address,
        attributions: m1.marketBalance,
        underlyingValue: m1.marketBalance
      })

      //Forward 8days
      await moveForwardPeriods(8)

      //withdraw

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })


      //CHECK STATUS
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: g.totalBalance,
        totalAttributions: g.totalBalance,
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: market.address,
        attributions: m1.marketBalance,
        underlyingValue: m1.marketBalance
      })
    });

    it("revert withdraw when not requested", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await moveForwardPeriods(8)

      //withdraw without request
      await expect(market.connect(alice).withdraw(depositAmount)).to.revertedWith(
        "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
      );
    });

    it("revert withdraw when amount > requested", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await moveForwardPeriods(8)

      await expect(market.connect(alice).withdraw(depositAmount.add(1))).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );
    });

    it("revert withdraw when withdrawable span is over", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      //withdraw span is 30days(2592000)
      await moveForwardPeriods(40)

      await expect(market.connect(alice).withdraw(depositAmount)).to.revertedWith(
        "ERROR: WITHDRAWAL_NO_ACTIVE_REQUEST"
      );
    });

    it("revert withdraw request more than balance", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })
      
      await expect(
        market.connect(alice).requestWithdraw(depositAmount.add(1))
      ).to.revertedWith("ERROR: REQUEST_EXCEED_BALANCE");
    });

    it("revert withdraw with zero balance", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await moveForwardPeriods(8)
      await expect(market.connect(alice).withdraw("0")).to.revertedWith(
        "ERROR: WITHDRAWAL_ZERO"
      );
    });

    it("revert withdraw when liquidity is locked for insurance", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await dai.connect(bob).approve(vault.address, insureAmount);

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      await moveForwardPeriods(8)

      await expect(market.connect(alice).withdraw(depositAmount)).to.revertedWith(
        "ERROR: WITHDRAW_INSUFFICIENT_LIQUIDITY"
      );
    });

    it("allows unlock liquidity only after an insurance period over", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await moveForwardPeriods(8)
      
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await moveForwardPeriods(10)

      await unlock({
        target: market,
        id: 0
      })


      await verifyVaultStatusOf({
        vault: vault,
        target: market.address,
        attributions: m1.marketBalance,
        underlyingValue: m1.marketBalance
      })

      await verifyVaultStatusOf({
        vault: vault,
        target: gov.address,
        attributions: g.govBalance,
        underlyingValue: g.govBalance
      })

      await verifyVaultStatus({
        vault: vault,
        valueAll: g.totalBalance,
        totalAttributions: g.totalBalance,
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: initialMint.sub(depositAmount),
        }
      })
      
      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      //return asset = withdraw (LP amount) * rate
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
        }
      })

      //govFee will left
      await verifyVaultStatus({
        vault: vault,
        valueAll: g.totalBalance,
        totalAttributions: g.totalBalance,
      })
    });

    it("beforeTransfer works", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await moveForwardPeriods(8)

      await transferLP({
        market: market, 
        from: alice, 
        to_address: tom.address, 
        amount: depositAmount.div(2)
      })

      await expect(market.connect(alice).withdraw(depositAmount.div(2).add(1))).to.revertedWith(
        "ERROR: WITHDRAWAL_EXCEEDED_REQUEST"
      );

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount.div(2)
      })
    });

    it("accrues premium after deposit", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      //id = 0
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: YEAR,
        target: short[0]
      })

      //Alice should have accrued premium paid by Bob
      await verifyBalances({
        token: dai,
        userBalances: {
          [bob.address]: u[bob.address].balance,
        }
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: alice.address,
        valueOfUnderlying: m1.marketBalance //only alice underwrite, so
      })


      //the premium paid second time should be allocated to both Alice and Chad
      //but the premium paid first time should be directly go to Alice
      await approveDeposit({
        token: dai,
        target: market,
        depositer: chad,
        amount: depositAmount
      })

      //id = 1
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: YEAR,
        target: short[0]
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: alice.address,
        valueOfUnderlying: u[alice.address].lp.mul(m1.rate).div(defaultRate)
      })

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: chad.address,
        valueOfUnderlying: u[chad.address].lp.mul(m1.rate).div(defaultRate)
      })

      //sanity check
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      //withdrawal also harvest accrued premium
      await moveForwardPeriods(369)

      await market.connect(alice).requestWithdraw(depositAmount);

      await unlock({
        target: market,
        id: 0
      })
      await unlock({
        target: market,
        id: 1
      })

      await moveForwardPeriods(8)

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })


      //Harvested premium is reflected on their account balance
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
          [chad.address]: u[chad.address].balance,
        }
      })
    });

    it("revert deposit when paused (withdrawal is possible)", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await market.setPaused(true);

      await dai.connect(alice).approve(vault.address, depositAmount);
      await expect(market.connect(alice).deposit(depositAmount)).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await moveForwardPeriods(8)

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: initialMint
        }
      })
    });

    it("revert deposit and withdrawal when payingout", async function () {
      //Can deposit and withdraw in normal time
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await moveForwardPeriods(8)

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: initialMint
        }
      })
      //Cannot deposit and withdraw when payingout

      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await market.connect(alice).requestWithdraw(depositAmount);

      let incident = (await now()).sub(DAY.mul(2));  
      await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await expect(market.connect(alice).deposit(depositAmount)).to.revertedWith(
        "ERROR: DEPOSIT_DISABLED"
      );

      await expect(market.connect(alice).withdraw(depositAmount)).to.revertedWith(
        "ERROR: WITHDRAWAL_PENDING"
      );

      await moveForwardPeriods(11)
      
      await resume({
        market: market
      })

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: initialMint
        }
      })
    });

    it("devaluate underlying but premium is not affected when cover claim is accepted", async function () {
      //Simulation: partial payout
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      //id=0
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      let incident = await now()

      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await redeem ({
        pool: market,
        redeemer: bob, 
        id: "0", 
        proof: proof
      })

      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await verifyValueOfUnderlying({
        template: market,
        valueOfUnderlyingOf: alice.address,
        valueOfUnderlying: u[alice.address].lp.mul(m1.rate).div(defaultRate)
      })

      //sanity check
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      await moveForwardPeriods(11)
      await resume({
        market: market
      })

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
          [bob.address]: u[bob.address].balance
        }
      })

      //Simulation: full payout
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      //sanity check
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: defaultRate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })


      //id=1
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount.div(10), 
        maxCost: insureAmount.div(10),
        span: WEEK,
        target: short[0]
      })

      incident = await now()
      proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await redeem ({
        pool: market,
        redeemer: bob, 
        id: "1", 
        proof: proof
      })

     //sanity check
      await verifyPoolsStatus({
        pools: [
          {
            pool: market,
            totalLP: m1.totalLP,
            totalLiquidity: m1.marketBalance,
            availableBalance: m1.marketBalance.sub(m1.insured),
            rate: m1.rate,
            utilizationRate: m1.utilizationRate,
            allInsuranceCount: m1.allInsuranceCount
          }
        ]
      })

      expect(await market.valueOfUnderlying(alice.address)).to.equal(u[alice.address].lp.mul(m1.rate).div(defaultRate));

      await moveForwardPeriods(11)

      await resume({
        market: market
      })

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
          [bob.address]: u[bob.address].balance
        }
      })
    });
  });

  describe("Getting insured", function () {
    it("allows protection", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await redeem ({
        pool: market,
        redeemer: bob, 
        id: "0", 
        proof: proof
      })

      await moveForwardPeriods(12)
      await resume({
        market: market
      })

      await expect(market.unlock("0")).to.revertedWith(
        "ERROR: UNLOCK_BAD_COINDITIONS"
      );

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: 95900,
          [bob.address]: 104000
        }
      })
    });

    it("allows insurance transfer", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      await market.connect(bob).transferInsurance("0", tom.address);


      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await redeem ({
        pool: market,
        redeemer: tom, 
        id: "0", 
        proof: proof
      })

      await moveForwardPeriods(11)
      await resume({
        market: market
      })

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
          [tom.address]: u[tom.address].balance
        }
      })
    });
    it("revert redemption when insurance is not m1 target", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await moveForwardPeriods(12)

      await resume({
        market: market
      })

      await expect(market.connect(bob).redeem("0", proof)).to.revertedWith(
        "ERROR: NO_APPLICABLE_INCIDENT"
      );

      await unlock({
        target: market,
        id: 0
      })

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })
      
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
        }
      })
    });
    it("revert getting insured when there is not enough liquidity", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await expect(
        market
          .connect(bob)
          .insure(
            depositAmount.add(1),
            depositAmount,
            WEEK,
            short[0]
          )
      ).to.revertedWith("ERROR: INSURE_EXCEEDED_AVAILABLE_BALANCE");


      await moveForwardPeriods(8)

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })
      
      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: initialMint
        }
      })
    });

    it("revert redemption when redemption period is over", async function () {
      await approveDepositAndWithdrawRequest({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmount
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await moveForwardPeriods(12)

      await resume({
        market: market
      })

      await expect(market.connect(bob).redeem("0", proof)).to.revertedWith(
        "ERROR: NO_APPLICABLE_INCIDENT"
      );

      await unlock({
        target: market,
        id: 0
      })

      await withdraw({
        target: market,
        withdrawer: alice,
        amount: depositAmount
      })

      await verifyBalances({
        token: dai,
        userBalances: {
          [alice.address]: u[alice.address].balance,
        }
      })
    });

    it("revert getting insured when paused, reporting, or payingout", async function () {
      //Can get insured in normal time
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmountLarge
      })

      await market.connect(alice).requestWithdraw("10000");

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      //Cannot get insured when payingout
      let incident = await now()
      await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 10000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await expect(
        market
          .connect(bob)
          .insure(
            insureAmount,
            insureAmount,
            DAY.mul(6),
            short[0]
          )
      ).to.revertedWith("ERROR: INSURE_SPAN_BELOW_MIN");

      await moveForwardPeriods(11)

      await resume({
        market: market
      })

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      //Cannot get insured when paused
      await market.setPaused(true);
      await expect(
        market
          .connect(bob)
          .insure(
            insureAmount,
            insureAmount,
            WEEK,
            short[0]
          )
      ).to.revertedWith("ERROR: INSURE_MARKET_PAUSED");

      await market.setPaused(false);

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })
    });

    it("revert more than 365 days insurance", async function () {
      //Can get insured in normal time
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmountLarge
      })
      await market.connect(alice).requestWithdraw("10000");

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: YEAR,
        target: short[0]
      })
      //Cannot get insured for more than 365 days
      await expect(
        market
          .connect(bob)
          .insure(
            insureAmount,
            insureAmount,
            YEAR.add(DAY),
            short[0]
          )
      ).to.revertedWith("ERROR: INSURE_EXCEEDED_MAX_SPAN");
    });

    it("revert insurance transfer if its expired or non existent", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmountLarge
      })
      await market.connect(alice).requestWithdraw("10000");

      //when expired
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      await moveForwardPeriods(9)

      await expect(
        market.connect(bob).transferInsurance("0", tom.address)
      ).to.revertedWith("ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS");

      //when already redeemed
      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: WEEK,
        target: short[0]
      })

      let incident = await now()
      let proof = await applyCover({
        pool: market,
        pending: 604800,
        payoutNumerator: 5000,
        payoutDenominator: 10000,
        incidentTimestamp: incident
      })

      await redeem ({
        pool: market,
        redeemer: bob, 
        id: "1", 
        proof: proof
      })

      await expect(
        market.connect(bob).transferInsurance("1", tom.address)
      ).to.revertedWith("ERROR: INSURANCE_TRANSFER_BAD_CONDITIONS");
    });
  });

  describe("Utilities", function () {
    it("retunrs accurate data", async function () {
      await approveDeposit({
        token: dai,
        target: market,
        depositer: alice,
        amount: depositAmountLarge
      })

      await market.connect(alice).requestWithdraw("10000");

      await insure({
        pool: market,
        insurer: bob,
        amount: insureAmount,
        maxCost: insureAmount,
        span: YEAR,
        target: short[0]
      })

      await insure({
        pool: market,
        insurer: chad,
        amount: insureAmount,
        maxCost: insureAmount,
        span: YEAR,
        target: short[0]
      })
      
      expect(await market.allInsuranceCount()).to.equal("2");
      expect(await market.getInsuranceCount(bob.address)).to.equal("1");
      expect(await market.getInsuranceCount(chad.address)).to.equal("1");
    });
  });

  describe("functions", function() {
    describe("Initialize", function () {
      it("", async () => {
      });
    });
  
    describe("Initialize", function () {
      it("", async () => {
      });
    });
  
    describe("deposit", function () {
      it("deposit, insure, deposit", async () => {
        //deposit
        await approveDepositAndWithdrawRequest({
          token: dai,
          target: market,
          depositer: alice,
          amount: depositAmount
        })

        await insure({
          pool: market,
          insurer: bob,
          amount: insureAmount,
          maxCost: insureAmount,
          span: WEEK,
          target: short[0]
        })

        await moveForwardPeriods(11)

        await unlock({
          target: market,
          id: 0
        })
        
      });
    });
  
    describe("withdraw", function () {
      it("", async () => {
      });
    });
  
    describe("unlockBatch", function () {
      it("", async () => {
      });
    });
  
    describe("unlock", function () {
      it("", async () => {
      });
    });
  
    /***  Only testable with index
    describe("allocateCredit", function () {
      it("", async () => {
      });
    });
    describe("withdrawCredit", function () {
      it("", async () => {
      });
    });
    */
  
    describe("insure", function () {
      it("", async () => {
      });
    });
  
    describe("redeem", function () {
      it("", async () => {
      });
    });
  
    describe("transferInsurance", function () {
      it("", async () => {
      });
    });
  
    describe("applyCover", function () {
      it("", async () => {
      });
    });
  
    describe("resume", function () {
      it("", async () => {
      });
    });
  
  })
});
