const { ethers } = require("hardhat");

const { USDC_ADDRESS } = require("./config");
const { RegistryAddress, FactoryAddress, ParametersAddress, IndexTemplateAddress } = require("./deployments");

async function main() {
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("Parameters");

  const registry = Registry.attach(RegistryAddress);
  const factory = Factory.attach(FactoryAddress);
  const parameters = Parameters.attach(ParametersAddress);

  const marketAddress = await (async () => {
    try {
      tx = await factory
        .connect(manager)
        .createMarket(IndexTemplateAddress, "0x", [0], [USDC_ADDRESS, registry.address, parameters.address]);

      const receipt = await tx.wait();

      const marketCreated = receipt.events.find((event) => "event" in event && event.event === "MarketCreated");
      const address = marketCreated.args[0];

      return address;
    } catch (err) {
      console.error(err);
      return null;
    }
  })();

  if (!marketAddress) throw new Error(`An error occurred while deploying the new index pool`);

  console.log(`new index pool deployed \n\n\u001b[32m address: ${marketAddress} \u001b[0m \n\n`);

  const end = process.hrtime(start);

  console.log("✨ finished (%ds %dms)", end[0], end[1] / 10000);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
