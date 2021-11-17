const zeroAddress = '0x0000000000000000000000000000000000000000'

const chai = require('chai')
const { assert } = chai

const verifyBalance = async ({ token, address, expectedBalance }) => {
    const balance = await token.balanceOf(address)
    assert.equal(balance.toString(), expectedBalance.toString(), `token balance incorrect for ${token.address} with ${address}`)
}

const verifyInternalBalance = async ({ vault, token, user, expectedBalance }) => {
    //const balance = await moloch.userTokenBalances.call(user, token.address)
    assert.equal(balance.toString(), expectedBalance.toString(), `internal token balance incorrect for user ${user} and token ${token.address}`)
}

Object.assign(exports, {
    verifyBalance,
})