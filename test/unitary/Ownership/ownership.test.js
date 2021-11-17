const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require('ethers');

describe('Ownership', function() {

    beforeEach(async () => {
    });

    describe("Constructor", function(){
        it("set owner successfully", async()=> {
        });

        it("emit event successfully", async()=> {
        });
    });

    describe("owner()", function(){
        it("return owner successfully", async()=> {
        });
    });

    describe("future_owner()", function(){
        it("return future_owner successfully", async()=> {
        });
    });

    describe("transfer_ownership()", function(){
        it("commit_transfer_ownership successfully", async()=> {
        });

        it("commit_transfer_ownership emit event successfully", async()=> {
        });

        it("commit_transfer_ownership revert: onlyOwner", async()=> {
        });

        it("commit_transfer_ownership revert: zero address", async()=> {
        });


        it("accept_transfer_ownership successfully", async()=> {
        });

        it("accept_transfer_ownership emit event successfully", async()=> {
        });

        it("accept_transfer_ownership revert: onlyFutureOwner", async()=> {
        });
    });
});