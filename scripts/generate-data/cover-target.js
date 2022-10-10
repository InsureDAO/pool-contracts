const hre = require("hardhat");
const ethers = hre.ethers;
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { BigNumber } = require("bignumber.js");

/*
DON"T FORGET TO MODIFY DATA
*/

const list = [
  {
    id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    account: "0x0000000000000000000000000000000000000000",
    loss: 10000000000,
  },
];

async function hashed(list) {
  return list.map(({ id, account, loss }) => {
    return ethers.utils.solidityKeccak256(["bytes32", "address", "uint256"], [id, account, loss]);
  });
}

async function distribution() {
  //merkle data
  const leaves = await hashed(list);
  const tree = await new MerkleTree(leaves, keccak256, { sort: true });
  const root = await tree.getHexRoot();
  console.log("Merkle data", list);
  console.log("Merkle leaves", leaves);
  console.log("Merkle root", root);
  /*
  //constract deployment
  const INSURE_ADDRESS = "0x94a6e144117CC658C459dFeF4eF52Ed73b672c86"
  const TREASURY_ADDRESS = "0xffffffffffffffffffffffffffffffffffffffff"
  const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
  md = await MerkleDistributor.deploy(INSURE_ADDRESS, root, TREASURY_ADDRESS, 0);
  await md.deployed();
  console.log("distributor deployed to:", md.address);

  const total = await aggregate(list);
  console.log("Total INSURE distribution",total.toFixed(0))
  */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
distribution()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
