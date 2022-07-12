const hre = require("hardhat");
const { expect } = require("chai");
const ethers = hre.ethers;
const fs = require("fs");
const { BigNumber } = require("ethers");

/**
 * - Deposit initial underwrite
 * - Change Premium
 */

async function main() {
  //----- IMPORT -----//
  [creator, signer] = await ethers.getSigners();

  const { USDC_ADDRESS, ZERO_ADDRESS } = require("./config");

  const { OwnershipAddress, VaultAddress, Pools, Premiums } = require("./deployments");

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const Vault = await ethers.getContractFactory("Vault");
  const FlatPremiumV1 = await ethers.getContractFactory("FlatPremium");
  const Ownership = await ethers.getContractFactory("Ownership");

  const ownership = await Ownership.attach(OwnershipAddress);
  const usdc = await USDC.attach(USDC_ADDRESS);
  const vault = await Vault.attach(VaultAddress);

  const market1 = await PoolTemplate.attach(Pools[0]);
  const premium1 = await FlatPremiumV1.attach(Premiums[0]);

  const market2 = await PoolTemplate.attach(Pools[1]);
  const premium2 = await FlatPremiumV1.attach(Premiums[1]);

  let tx;
  const newRate = "50000"; //5%
  const depositAmount = BigNumber.from("80000000000"); //80,000 * 10^6 USDC

  console.log(creator.address);
  console.log(signer.address);

  //approve
  tx = await usdc.connect(signer).approve(VaultAddress, depositAmount.mul(2));
  await tx.wait();

  //Sanity check
  expect(await ownership.owner()).to.equal(signer.address);
  expect(await premium1.rate()).to.equal("60000");
  expect(await premium2.rate()).to.equal("25000");
  expect(await usdc.allowance(signer.address, VaultAddress)).to.not.equal("0");

  //Update premium1
  tx = await premium1.connect(signer).setPremiumParameters(newRate, "0", "0", "0");
  await tx.wait();

  //deposit USDC
  tx = await market1.connect(signer).deposit(depositAmount);
  await tx.wait();
  tx = await market2.connect(signer).deposit(depositAmount);
  await tx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
