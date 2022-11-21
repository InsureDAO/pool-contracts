const hre = require("hardhat");

module.exports = {
  async verify({ address, constructorArguments }) {
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments,
      });
    } catch (err) {
      console.log(`verification for ${address} was skipped. Reason:\u001b[33m ${err} \u001b[0m`);
    }
  },
};
