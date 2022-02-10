const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

/***
 * deploy USDC for test
 */

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const {
    ZERO_ADDRESS
  } = require("./config.js");

  const USDC = await ethers.getContractFactory("ERC20Mock"); //6 decimals


  //----- DEPLOY -----//
  const usdc = await USDC.deploy(creator.address);
  console.log("usdc deployed to:", usdc.address);


  //----- WRITE -----//
  let text = 
    `
    const USDCAddress = "${usdc.address}" \n 

    Object.assign(exports, {
      USDCAddress,
    })
    `
  try {
    fs.writeFileSync("./scripts/Rinkarbitrum/deployments.js", text);
    console.log('write end');
  }catch(e){
    console.log(e);
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
