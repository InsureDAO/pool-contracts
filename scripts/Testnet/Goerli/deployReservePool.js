const { ethers } = require("hardhat");

const { USDC_ADDRESS, ZERO_ADDRESS } = require("./config");
const { RegistryAddress, FactoryAddress, ParametersAddress, IndexTemplateAddress } = require("./deployments");

async function main() {
  const [testDeployer] = await ethers.getSigners();
  console.log("deploying with:", testDeployer.address);

  //import
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate");
  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("ParametersV2");

  const registry = Registry.attach(RegistryAddress);
  const factory = Factory.attach(FactoryAddress);
  const parameters = Parameters.attach(ParametersAddress);

  //Deploy CDSTemplate
  const cdsTemplate = CDSTemplate.attach("0xc7010cabc2eff23324d18d511b1f1d86b0afb460");
  //await cdsTemplate.deployed();

  console.log("cdsTemplate is deployed to:", cdsTemplate.address);

  //Setup
  /**
  tx = await factory.approveTemplate(cdsTemplate.address, true, false, false);
  await tx.wait();

  tx = await factory.approveReference(cdsTemplate.address, 0, USDC_ADDRESS, true);
  await tx.wait();
  tx = await factory.approveReference(cdsTemplate.address, 1, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(cdsTemplate.address, 2, parameters.address, true);
  await tx.wait();

  console.log("Setup Done");

  //Deploy CDS
  tx = await factory.createMarket(cdsTemplate.address, "0x", [0], [USDC_ADDRESS, registry.address, parameters.address]);
  await tx.wait();
   */

  let markets = await registry.getAllMarkets();
  let cdsAddress = markets[markets.length - 1];

  console.log("cds is:", cdsAddress);

  tx = await registry.setCDS(ZERO_ADDRESS, cdsAddress);
  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
