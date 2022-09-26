const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const { BigNumber } = require("ethers");

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();

  const { ZERO_ADDRESS, USDC_ADDRESS } = require("./config");
  const { RegistryAddress, ParametersAddress } = require("./deployments");

  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const Registry = await ethers.getContractFactory("Registry");
  const Parameters = await ethers.getContractFactory("Parameters");

  const registry = await Registry.attach(RegistryAddress);
  const parameters = await Parameters.attach(ParametersAddress);

  const now = new BigNumber.from(Math.floor(Date.now() / 1000));
  console.log("now:", now);

  //unlock-able pools
  let markets = await registry.getAllMarkets();
  console.log("markets:", markets);
  for (let i = 0; i < markets.length; i++) {
    let market = await PoolTemplate.attach(markets[i]);

    markets[i].ids = [];
    let count = await market.allInsuranceCount();
    console.log("market:", market.address, ", totalPolicyCount:", count);

    for (let id = 0; id < count; id++) {
      //check if unlockable
      let policy = await market.insurances(id);
      let gracePeriod = new BigNumber.from(await parameters.getGrace(market.address));
      let endtime = new BigNumber.from(policy.endTime);

      //insurances[_id].status && insurances[_id].endTime + parameters.getGrace(address(this)) < block.timestamp,
      if (policy.status == true && endtime.add(gracePeriod).lt(now)) {
        console.log("id", id, "is unlockable");
        markets[i].ids.push(id);
      }
    }
  }

  console.log(markets);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
