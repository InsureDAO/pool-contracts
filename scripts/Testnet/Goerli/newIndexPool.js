const { ethers } = require("hardhat");

const { USDC_ADDRESS, ZERO_ADDRESS } = require("./config");
const { RegistryAddress, FactoryAddress, ParametersAddress, IndexTemplateAddress } = require("./deployments");

async function main() {
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
        // .createMarket(IndexTemplateAddress, "0x", [0], [USDC_ADDRESS, registry.address, parameters.address]);
        // FIXME: use actual address
        .createMarket(ZERO_ADDRESS, "0x", [0], [USDC_ADDRESS, registry.address, parameters.address]);

      const receipt = await tx.wait();
      console.log(receipt);

      return receipt.events[1].args[0];
    } catch (err) {
      console.error(err);
      return null;
    }
  })();

  if (!marketAddress) throw new Error(`An error occurred while deploying the new index pool`);

  console.log(`new index pool deployed to the address: ${marketAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
