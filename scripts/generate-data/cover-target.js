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
    account: "0xa1e1822c5beab648c232b3e1f49959cfa80a22ec",
  },
  {
    id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    account: "0x751ff30ed064ba16fce4f87b3557dea6f4decba0",
  },
  {
    id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    account: "0x7a14d3272bfd4742f365fe87272af227e02c4b3d",
  },
  {
    id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    account: "0x93ffa47b14215692141832f37eae16eb02bb59a3",
  },
  {
    id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    account: "0xc914FB29D729F37b8de6e5b7ef129B8D69458622",
  },
];

async function hashed(list) {
  return list.map(({ id, account }) => {
    return ethers.utils.solidityKeccak256(["bytes32", "address"], [id, account]);
  });
}

async function distribution() {
  //merkle data
  const leaves = await hashed(list);
  const tree = await new MerkleTree(leaves, keccak256, { sort: true });
  const root = await tree.getHexRoot();
  console.log("Merkle data", list, leaves, root);
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
