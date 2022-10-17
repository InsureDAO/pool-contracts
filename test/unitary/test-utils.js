const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const chai = require("chai");
const { assert } = chai;
const { expect } = require("chai");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

async function snapshot() {
  return network.provider.send("evm_snapshot", []);
}

async function restore(snapshotId) {
  return network.provider.send("evm_revert", [snapshotId]);
}

async function moveForwardPeriods(days) {
  await ethers.provider.send("evm_increaseTime", [DAY.mul(days).toNumber()]);
  await ethers.provider.send("evm_mine");

  return true;
}

async function now() {
  return BigNumber.from((await ethers.provider.getBlock("latest")).timestamp);
}

//======== TOKEN ========//
const verifyBalance = async ({ token, address, expectedBalance }) => {
  const balance = await token.balanceOf(address);
  assert.equal(
    balance.toString(),
    expectedBalance.toString(),
    `token balance incorrect for ${token.address} with ${address}`
  );
};

const verifyBalances = async ({ token, userBalances }) => {
  const users = Object.keys(userBalances);
  for (i = 0; i < users.length; i++) {
    await verifyBalance({
      token: token,
      address: users[i],
      expectedBalance: userBalances[users[i]],
    });
  }
};
const verifyAllowance = async ({ token, owner, spender, expectedAllowance }) => {
  const allowance = await token.allowance(owner, spender);
  assert.equal(
    +allowance,
    expectedAllowance,
    `allowance incorrect for ${token.address} owner ${owner} spender ${spender}`
  );
};

//======== UNIVARSAL POOLs========//
const verifyValueOfUnderlying = async ({ template, valueOfUnderlyingOf, valueOfUnderlying }) => {
  expect(await template.valueOfUnderlying(valueOfUnderlyingOf)).to.closeTo(valueOfUnderlying, 1); //rounding error
};

const verifyRate = async ({ template, rate }) => {
  expect(await template.rate()).to.equal(rate);
};

//======== POOLs ========//
const _verifyPoolStatus = async ({
  pool,
  totalSupply,
  totalLiquidity,
  availableBalance,
  rate,
  utilizationRate,
  allInsuranceCount,
}) => {
  expect(await pool.totalSupply()).to.equal(totalSupply);
  expect(await pool.totalLiquidity()).to.equal(totalLiquidity);
  expect(await pool.availableBalance()).to.equal(availableBalance);
  expect(await pool.rate()).to.equal(rate);
  expect(await pool.utilizationRate()).to.equal(utilizationRate);
  expect(await pool.allInsuranceCount()).to.equal(allInsuranceCount);
};

const verifyPoolsStatus = async ({ pools }) => {
  for (i = 0; i < pools.length; i++) {
    await _verifyPoolStatus({
      pool: pools[i].pool,
      totalSupply: pools[i].totalSupply,
      totalLiquidity: pools[i].totalLiquidity,
      availableBalance: pools[i].availableBalance,
      rate: pools[i].rate,
      utilizationRate: pools[i].utilizationRate,
      allInsuranceCount: pools[i].allInsuranceCount,
    });
  }
};

const _verifyPoolStatusForIndex = async ({ pool, indexAddress, allocatedCredit, pendingPremium }) => {
  let _allocatedCredit;
  [_allocatedCredit] = await pool.pairValues(indexAddress);
  expect(_allocatedCredit).to.equal(allocatedCredit);
  expect(await pool.pendingPremium(indexAddress)).to.equal(pendingPremium);
};

const verifyPoolsStatusForIndex = async ({ pools }) => {
  for (i = 0; i < pools.length; i++) {
    await _verifyPoolStatusForIndex({
      pool: pools[i].pool,
      indexAddress: pools[i].indexAddress,
      allocatedCredit: pools[i].allocatedCredit,
      pendingPremium: pools[i].pendingPremium,
    });
  }
};

const verifyIndexInfo = async ({ pool, index, credit, rewardDebt, slot }) => {
  let _slot = (await pool.indices(index)).slot;

  expect((await pool.indices(index)).credit).to.equal(credit);
  expect((await pool.indices(index)).rewardDebt).to.equal(rewardDebt);
  expect(_slot).to.equal(slot);
  if (!_slot.eq("0")) {
    expect(await pool.indexList(_slot.sub("1"))).to.equal(index);
  }
};

//those legacy functions are used for tests that are not refactored yet.
const _verifyPoolStatus_legacy = async ({ pool, totalLiquidity, availableBalance }) => {
  expect(await pool.totalLiquidity()).to.equal(totalLiquidity);
  expect(await pool.availableBalance()).to.equal(availableBalance);
};

const verifyPoolsStatus_legacy = async ({ pools }) => {
  for (i = 0; i < pools.length; i++) {
    await _verifyPoolStatus_legacy({
      pool: pools[i].pool,
      totalLiquidity: pools[i].totalLiquidity,
      availableBalance: pools[i].availableBalance,
    });
  }
};

const _verifyPoolStatusForIndex_legacy = async ({ pool, allocatedCreditOf, allocatedCredit }) => {
  let _allocatedCredit;
  [_allocatedCredit] = await pool.pairValues(allocatedCreditOf);
  expect(_allocatedCredit).to.equal(allocatedCredit);
};

const verifyPoolsStatusForIndex_legacy = async ({ pools }) => {
  for (i = 0; i < pools.length; i++) {
    await _verifyPoolStatusForIndex_legacy({
      pool: pools[i].pool,
      allocatedCreditOf: pools[i].allocatedCreditOf,
      allocatedCredit: pools[i].allocatedCredit,
    });
  }
};

//======== INDEXs ========//
const verifyIndexStatus = async ({
  index,
  totalSupply,
  totalLiquidity,
  totalAllocatedCredit,
  totalAllocPoint,
  targetLev,
  leverage,
  withdrawable,
  rate,
}) => {
  expect(await index.totalSupply()).to.equal(totalSupply); //LP
  expect(await index.totalLiquidity()).to.equal(totalLiquidity); //USDC
  expect(await index.totalAllocatedCredit()).to.equal(totalAllocatedCredit); //leveraged
  expect(await index.totalAllocPoint()).to.equal(totalAllocPoint);
  expect(await index.targetLev()).to.equal(targetLev);
  expect(await index.leverage()).to.equal(leverage);
  expect(await index.withdrawable()).to.closeTo(withdrawable, 1);
  expect(await index.rate()).to.equal(rate);
};

const verifyIndexStatusOf = async ({ index, targetAddress, valueOfUnderlying, withdrawTimestamp, withdrawAmount }) => {
  expect(await index.valueOfUnderlying(targetAddress)).to.equal(valueOfUnderlying);
  expect((await index.withdrawalReq(targetAddress)).timestamp).to.equal(withdrawTimestamp);
  expect((await index.withdrawalReq(targetAddress)).amount).to.equal(withdrawAmount);
};

const verifyIndexStatusOfPool = async ({ index, poolAddress, allocPoints }) => {
  expect(await index.allocPoints(poolAddress)).to.equal(allocPoints);
};

//======== Reserve ========//
const verifyReserveStatus = async ({ reserve, surplusPool, crowdPool, totalSupply, totalLiquidity, rate }) => {
  expect(await reserve.surplusPool()).to.equal(surplusPool);
  expect(await reserve.crowdPool()).to.equal(crowdPool);
  expect(await reserve.totalSupply()).to.equal(totalSupply);
  expect(await reserve.totalLiquidity()).to.equal(totalLiquidity);
  expect(await reserve.rate()).to.equal(rate);
};

const verifyReserveStatusOf = async ({
  reserve,
  targetAddress,
  valueOfUnderlying,
  withdrawTimestamp,
  withdrawAmount,
}) => {
  expect(await reserve.valueOfUnderlying(targetAddress)).to.equal(valueOfUnderlying);
  expect((await reserve.withdrawalReq(targetAddress)).timestamp).to.equal(withdrawTimestamp);
  expect((await reserve.withdrawalReq(targetAddress)).amount).to.equal(withdrawAmount);
};

const verifyReserveStatus_legacy = async ({ reserve, totalSupply, totalLiquidity, rate }) => {
  expect(await reserve.totalSupply()).to.equal(totalSupply);
  expect(await reserve.totalLiquidity()).to.equal(totalLiquidity);
  expect(await reserve.rate()).to.equal(rate);
};

//======== VAULT ========//
const verifyVaultStatus = async ({ vault, balance, valueAll, totalAttributions, totalDebt }) => {
  expect(await vault.balance()).to.equal(balance);
  expect(await vault.valueAll()).to.equal(valueAll);
  expect(await vault.totalAttributions()).to.equal(totalAttributions);
  expect(await vault.totalDebt()).to.equal(totalDebt);
};

const verifyVaultStatusOf = async ({ vault, target, attributions, underlyingValue, debt }) => {
  expect(await vault.attributions(target)).to.equal(attributions);
  expect(await vault["underlyingValue(address)"](target)).to.equal(underlyingValue);
  expect(await vault.debts(target)).to.equal(debt);
};

const verifyVaultStatus_legacy = async ({ vault, valueAll, totalAttributions }) => {
  expect(await vault.valueAll()).to.equal(valueAll);
  expect(await vault.totalAttributions()).to.equal(totalAttributions);
};

const verifyVaultStatusOf_legacy = async ({ vault, target, attributions, underlyingValue }) => {
  expect(await vault.attributions(target)).to.equal(attributions);
  expect(await vault["underlyingValue(address)"](target)).to.equal(underlyingValue);
};

const verifyDebtOf = async ({ vault, target, debt }) => {
  expect(await vault.debts(target)).to.equal(debt);
};

//function
const insure = async ({ pool, insurer, amount, maxCost, span, target, insured, agent }) => {
  let tx = await pool.connect(insurer).insure(amount, maxCost, span, target, insured, agent);

  let receipt = await tx.wait();
  let premium = receipt.events[4].args[8];

  return premium;
};

Object.assign(exports, {
  snapshot,
  restore,

  verifyBalance,
  verifyBalances,
  verifyAllowance,

  //univarsal
  verifyValueOfUnderlying,
  verifyRate,

  //pool
  verifyPoolsStatus,
  verifyPoolsStatus_legacy,
  verifyPoolsStatusForIndex,
  verifyIndexInfo,
  verifyPoolsStatusForIndex_legacy,

  //index
  verifyIndexStatus,
  verifyIndexStatusOf,
  verifyIndexStatusOfPool,

  //reserve
  verifyReserveStatus,
  verifyReserveStatusOf,
  verifyReserveStatus_legacy,

  //vault
  verifyDebtOf,
  verifyVaultStatus_legacy,
  verifyVaultStatusOf_legacy,
  verifyVaultStatus,
  verifyVaultStatusOf,

  //function
  insure,
});
