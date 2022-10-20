const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

/***
 * Deploy Base Contracts
 */

async function main() {
  const start = process.hrtime();

  [creator] = await ethers.getSigners();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const USDC_ADDRESS = "{{USDC_ADDRESS}}";
  const TokenList = ["{{TokenList}}"];

  const Params = {
    FeeRate: "{{Params.FeeRate}}",
    RequestDuration: "{{Params.RequestDuration}}",
    WithdrawableDuration: "{{Params.WithdrawableDuration}}",
    MaxList: "{{Params.MaxList}}",

    UnlockGracePeriod: "{{Params.UnlockGracePeriod}}",
    MaxInsureSpan: "{{Params.MaxInsureSpan}}",
    MinInsureSpan: "{{Params.MinInsureSpan}}",

    UpperSlack: "{{Params.UpperSlack}}",
    LowerSlack: "{{Params.LowerSlack}}",
  };

  const PMV3 = {
    DefaultRate: "{{PMV3.DefaultRate}}",
    DefaultRateSlope1: "{{PMV3.DefaultRateSlope1}}",
    DefaultRateSlope2: "{{PMV3.DefaultRateSlope2}}",
    OptimalUtilizeRatio: "{{PMV3.OptimalUtilizeRatio}}",
  };

  const USDC = await ethers.getContractFactory("ERC20Mock");
  const Ownership = await ethers.getContractFactory("Ownership");
  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const ReserveTemplate = await ethers.getContractFactory("ReserveTemplate");
  const Factory = await ethers.getContractFactory("Factory");
  const Vault = await ethers.getContractFactory("Vault");
  const Registry = await ethers.getContractFactory("Registry");
  const PremiumModelV3 = await ethers.getContractFactory("PremiumModelV3");
  const Parameters = await ethers.getContractFactory("Parameters");

  const usdc = await USDC.attach(USDC_ADDRESS);
  console.log("usdc attached to:", usdc.address);

  //----- DEPLOY -----//
  const ownership = await Ownership.deploy();
  await ownership.deployed();
  console.log("ownership deployed to:", ownership.address);

  const registry = await Registry.deploy(ownership.address);
  await registry.deployed();
  console.log("registry deployed to:", registry.address);

  const factory = await Factory.deploy(registry.address, ownership.address);
  await factory.deployed();
  console.log("factory deployed to:", factory.address);

  const parameters = await Parameters.deploy(ownership.address);
  await parameters.deployed();
  console.log("parameters deployed to:", parameters.address);

  const vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);
  await vault.deployed();
  console.log("vault deployed to:", vault.address);

  //premiumV3
  const premium = await PremiumModelV3.deploy(
    ownership.address,
    PMV3.DefaultRate,
    PMV3.DefaultRateSlope1,
    PMV3.DefaultRateSlope2,
    PMV3.OptimalUtilizeRatio
  );
  await premium.deployed();

  console.log("PremiumModel deployed to:", premium.address);

  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);
  await tx.wait();

  //MarketTemplates
  const marketTemplate = await MarketTemplate.deploy();
  await marketTemplate.deployed();
  console.log("marketTemplate deployed to:", marketTemplate.address);

  tx = await factory.approveTemplate(marketTemplate.address, true, true, false); //approval, isOpen, allowDuplicate
  await tx.wait();

  tx = await factory.approveReference(marketTemplate.address, 0, ZERO_ADDRESS, true);
  await tx.wait();

  tx = await factory.approveReference(marketTemplate.address, 1, usdc.address, true);
  await tx.wait();

  tx = await factory.approveReference(marketTemplate.address, 2, registry.address, true);
  await tx.wait();

  tx = await factory.approveReference(marketTemplate.address, 3, parameters.address, true);
  await tx.wait();

  //IndexTemplate
  const indexTemplate = await IndexTemplate.deploy();
  await indexTemplate.deployed();
  console.log("indexTemplate deployed to:", indexTemplate.address);

  tx = await factory.approveTemplate(indexTemplate.address, true, false, true); //approval, isOpen, allowDuplicate
  await tx.wait();

  tx = await factory.approveReference(indexTemplate.address, 0, usdc.address, true);
  await tx.wait();

  tx = await factory.approveReference(indexTemplate.address, 1, registry.address, true);
  await tx.wait();

  tx = await factory.approveReference(indexTemplate.address, 2, parameters.address, true);
  await tx.wait();

  //ReserveTemplate
  const reserveTemplate = await ReserveTemplate.deploy();
  await reserveTemplate.deployed();

  console.log("reserveTemplate deployed to:", reserveTemplate.address);

  tx = await factory.approveTemplate(reserveTemplate.address, true, false, true); //approval, isOpen, allowDuplicate
  await tx.wait();

  tx = await factory.approveReference(reserveTemplate.address, 0, usdc.address, true);
  await tx.wait();

  tx = await factory.approveReference(reserveTemplate.address, 1, registry.address, true);
  await tx.wait();

  tx = await factory.approveReference(reserveTemplate.address, 2, parameters.address, true);
  await tx.wait();

  //Set Parameters
  console.log("Parameters Setting");

  tx = await parameters.setVault(usdc.address, vault.address);
  await tx.wait();

  tx = await parameters.setFeeRate(ZERO_ADDRESS, Params.FeeRate);
  await tx.wait();

  tx = await parameters.setRequestDuration(ZERO_ADDRESS, Params.RequestDuration);
  await tx.wait();

  tx = await parameters.setWithdrawableDuration(ZERO_ADDRESS, Params.WithdrawableDuration);
  await tx.wait();

  tx = await parameters.setMaxList(ZERO_ADDRESS, Params.MaxList);
  await tx.wait();

  tx = await parameters.setPremiumModel(ZERO_ADDRESS, premium.address);
  await tx.wait();

  tx = await parameters.setUnlockGracePeriod(ZERO_ADDRESS, Params.UnlockGracePeriod);
  await tx.wait();

  tx = await parameters.setMaxInsureSpan(ZERO_ADDRESS, Params.MaxInsureSpan);
  await tx.wait();

  tx = await parameters.setMinInsureSpan(ZERO_ADDRESS, Params.MinInsureSpan);
  await tx.wait();

  tx = await parameters.setUpperSlack(ZERO_ADDRESS, Params.UpperSlack);
  await tx.wait();

  tx = await parameters.setLowerSlack(ZERO_ADDRESS, Params.LowerSlack);
  await tx.wait();

  //Verification
  {
    await hre.run("verify:verify", {
      address: ownership.address,
      constructorArguments: [],
    });

    await hre.run("verify:verify", {
      address: registry.address,
      constructorArguments: [ownership.address],
    });

    await hre.run("verify:verify", {
      address: factory.address,
      constructorArguments: [registry.address, ownership.address],
    });

    await hre.run("verify:verify", {
      address: parameters.address,
      constructorArguments: [ownership.address],
    });

    await hre.run("verify:verify", {
      address: vault.address,
      constructorArguments: [usdc.address, registry.address, ZERO_ADDRESS, ownership.address],
    });

    await hre.run("verify:verify", {
      address: premium.address,
      constructorArguments: [
        ownership.address,
        PMV3.DefaultRate,
        PMV3.DefaultRateSlope1,
        PMV3.DefaultRateSlope2,
        PMV3.OptimalUtilizeRatio,
      ],
    });

    await hre.run("verify:verify", {
      address: marketTemplate.address,
      constructorArguments: [],
    });

    await hre.run("verify:verify", {
      address: indexTemplate.address,
      constructorArguments: [],
    });

    await hre.run("verify:verify", {
      address: reserveTemplate.address,
      constructorArguments: [],
    });
  }

  const end = process.hrtime(start);
  console.log("✨ finished (%ds %dms)", end[0], end[1] / 100000);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
