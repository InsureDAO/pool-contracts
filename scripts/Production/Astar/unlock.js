const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const { BigNumber } = require("ethers");

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const { ZERO_ADDRESS, USDC_ADDRESS } = require("./config");
  const { RegistryAddress, ParametersAddress } = require("./deployments");

  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const Registry = await ethers.getContractFactory("Registry");
  const Parameters = await ethers.getContractFactory("Parameters");

  const registry = await Registry.attach(RegistryAddress);
  const parameters = await Parameters.attach(ParametersAddress);

  const now = new BigNumber.from(Math.floor(Date.now() / 1000));
  console.log("now:", now);

  //unlock-able pools
  let pools = await registry.getAllPools();
  console.log("pools:", pools);
  for (let i = 0; i < pools.length; i++) {
    let market = await MarketTemplate.attach(pools[i]);

    pools[i].ids = [];
    let count = await market.allInsuranceCount();
    console.log("market:", market.address, ", totalPolicyCount:", count);

    for (let id = 0; id < count; id++) {
      //check if unlockable
      let policy = await market.insurances(id);
      let gracePeriod = new BigNumber.from(await parameters.getUnlockGracePeriod(market.address));
      let endtime = new BigNumber.from(policy.endTime);

      //insurances[_id].status && insurances[_id].endTime + parameters.getUnlockGracePeriod(address(this)) < block.timestamp,
      if (policy.status == true && endtime.add(gracePeriod).lt(now)) {
        console.log("id", id, "is unlockable");
        pools[i].ids.push(id);
      }
    }
  }

  console.log(pools);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
