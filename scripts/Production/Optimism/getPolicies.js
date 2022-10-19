const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const { BigNumber } = require("ethers");

async function main() {
  //----- IMPORT -----//
  [creator] = await ethers.getSigners();
  const { RegistryAddress, ParametersV2Address } = require("./deployments");

  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const Registry = await ethers.getContractFactory("Registry");
  const Parameters = await ethers.getContractFactory("Parameters");

  const registry = await Registry.attach(RegistryAddress);
  const parameters = await Parameters.attach(ParametersV2Address);

  const now = new BigNumber.from(Math.floor(Date.now() / 1000));
  console.log("now:", now);

  //unlock-able pools
  let markets = await registry.getAllMarkets();

  for (let i = 2; i < markets.length; i++) {
    let market = await MarketTemplate.attach(markets[i]);
    let count = await market.allInsuranceCount();
    console.log("==================================================================");
    console.log("market:", market.address, ", totalPolicyCount:", count.toString());

    for (let id = 0; id < count; id++) {
      //check if unlockable
      let policy = await market.insurances(id);
      let gracePeriod = new BigNumber.from(await parameters.getUnlockGracePeriod(market.address));
      let endtime = new BigNumber.from(policy.endTime);

      console.log("id:", id);
      console.log("$" + policy.amount.div("1000000"));
      console.log("period:", (policy.endTime - policy.startTime) / 86400, "days");
      console.log("bought by " + policy.insured);

      //insurances[_id].status && insurances[_id].endTime + parameters.getUnlockGracePeriod(address(this)) < block.timestamp,
      if (policy.status == true && endtime.add(gracePeriod).lt(now)) {
        console.log("unlockable");
      } else {
        console.log("NOT unlockable");
      }
      console.log("---------------");
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
