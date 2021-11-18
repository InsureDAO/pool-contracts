const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const chai = require('chai')
const { assert } = chai
const { expect } = require("chai");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const verifyBalance = async ({ token, address, expectedBalance }) => {
    const balance = await token.balanceOf(address)
    assert.equal(balance.toString(), expectedBalance.toString(), `token balance incorrect for ${token.address} with ${address}`)
}

const verifyBalances = async ({ token, userBalances }) => {
    const users = Object.keys(userBalances)
    for (i = 0; i < users.length; i++) {
      await verifyBalance({ token: token, address: users[i], expectedBalance: userBalances[users[i]]})
    }
}
const verifyAllowance = async ({ token, owner, spender, expectedAllowance }) => {
    const allowance = await token.allowance(owner, spender)
    assert.equal(+allowance, expectedAllowance, `allowance incorrect for ${token.address} owner ${owner} spender ${spender}`)
}

const verifyPoolStatus = async({pool, totalLiquidity, allocatedCreditOf, allocatedCredit, availableBalance}) => {
    expect(await pool.totalLiquidity()).to.equal(totalLiquidity);
    expect(await pool.allocatedCredit(allocatedCreditOf)).to.equal(allocatedCredit);
    expect(await pool.availableBalance()).to.equal(availableBalance);
}

const verifyPoolsStatus = async({pools}) => {
    for (i = 0; i < pools.length; i++) {
        await verifyPoolStatus({ 
            pool: pools[i].pool,
            totalLiquidity: pools[i].totalLiquidity,
            allocatedCreditOf: pools[i].allocatedCreditOf, 
            allocatedCredit: pools[i].allocatedCredit, 
            availableBalance: pools[i].availableBalance
        })
    }
}

const verifyIndexStatus = async ({index, totalSupply, totalLiquidity, totalAllocatedCredit, leverage, withdrawable}) => {
    expect(await index.totalSupply()).to.equal(totalSupply);
    expect(await index.totalLiquidity()).to.equal(totalLiquidity);
    expect(await index.totalAllocatedCredit()).to.equal(totalAllocatedCredit);
    expect(await index.leverage()).to.equal(leverage);
    expect(await index.withdrawable()).to.equal(withdrawable);
}

const verifyVaultStatus = async({vault, target, attributions, valueAll, totalAttributions, underlyingValue}) => {
    expect(await vault.attributions(target)).to.equal(attributions);
    expect(await vault.valueAll()).to.equal(valueAll);
    expect(await vault.totalAttributions()).to.equal(totalAttributions);
    expect(await vault.underlyingValue(target)).to.equal(underlyingValue);
}

const insure = async({pool, insurer, amount, maxCost, span, target}) => {
    await pool.connect(insurer).insure(amount, maxCost, span, target);
}



Object.assign(exports, {
    verifyBalance,
    verifyBalances,
    verifyAllowance,
    verifyPoolStatus,
    verifyPoolsStatus,
    verifyIndexStatus,
    verifyVaultStatus,
    insure
})