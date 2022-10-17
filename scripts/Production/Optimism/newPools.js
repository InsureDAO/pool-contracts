const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const { BigNumber } = require("ethers");

async function main() {
  //----- IMPORT -----//
  [creator, manager] = await ethers.getSigners();
  console.log(manager.address);

  const {
    RegistryAddress,
    FactoryAddress,
    ParametersV2Address,
    PremiumV2Address,
    marketTemplateAddress,
    IndexTemplateAddress,
  } = require("./deployments");

  const { USDC_ADDRESS, ZERO_ADDRESS } = require("./config");

  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
  const Registry = await ethers.getContractFactory("Registry");
  const Factory = await ethers.getContractFactory("Factory");
  const Parameters = await ethers.getContractFactory("Parameters");
  const PremiumV2 = await ethers.getContractFactory("FlatPremiumV2");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");

  const registry = await Registry.attach(RegistryAddress);
  const factory = await Factory.attach(FactoryAddress);
  const parametersV2 = await Parameters.attach(ParametersV2Address);
  const premiumV2 = await PremiumV2.attach(PremiumV2Address);

  //configs

  //deploying list
  const GOV_TOKENS = [
    "0x9e1028F5F1D5eDE59748FFceE5532509976840E0", //2: Perpetual Protocol
    "0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe", //3: Kwenta
    "0x80898b704bAa55e7e37F1128Fc6ae5836661f54a", //4: Pika
    "0x217D47011b23BB961eB6D93cA9945B7501a5BB11", //5: Thales
    "0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37", //6: Polynomial
    "0x4E720DD3Ac5CFe1e1fbDE4935f386Bb1C66F4642", //7: Beefy
    "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75", //8: dForce
    "0x5b0390bccCa1F040d8993eB6e4ce8DeD93721765", //9: Tarot
    "0x88215a2794ddC031439C72922EC8983bDE831c78", //10: Arrakis
    "0xaa30D6bba6285d0585722e2440Ff89E23EF68864", //11: Hop
    "0x3c8B650257cFb5f272f799F5e2b4e65093a11a05", //12: Velodrome
    "0x97513e975a7fA9072c72C92d8000B0dB90b163c5", //13: BeethovenX
    "0x3204AC6F848e05557c6c7876E09059882e07962F", //14: Rubicon
    "0x8d352083F7094dc51Cd7dA8c5C0985AD6e149629", //15: PoolTogether
    "0x90b1a66957914EbbE7a8df254c0c1E455972379C", //16: dHEDGE V2
  ];

  const DEPLOYED_ADDRESS = [
    "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4", //0: Synthetix
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", //1: Lyra
    "0x9e1028F5F1D5eDE59748FFceE5532509976840E0", //2: Perpetual Protocol
    "0xDe910777C787903F78C89e7a0bf7F4C435cBB1Fe", //3: Kwenta
    "0x80898b704bAa55e7e37F1128Fc6ae5836661f54a", //4: Pika
    "0x217D47011b23BB961eB6D93cA9945B7501a5BB11", //5: Thales
    "0xE1CB04A0fA36DdD16a06ea828007E35e1a3cBC37", //6: Polynomial
    "0x4E720DD3Ac5CFe1e1fbDE4935f386Bb1C66F4642", //7: Beefy
    "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75", //8: dForce
    "0x5b0390bccCa1F040d8993eB6e4ce8DeD93721765", //9: Tarot
    "0x88215a2794ddC031439C72922EC8983bDE831c78", //10: Arrakis
    "0xaa30D6bba6285d0585722e2440Ff89E23EF68864", //11: Hop
    "0x3c8B650257cFb5f272f799F5e2b4e65093a11a05", //12: Velodrome
    "0x97513e975a7fA9072c72C92d8000B0dB90b163c5", //13: BeethovenX
    "0x3204AC6F848e05557c6c7876E09059882e07962F", //14: Rubicon
    "0x8d352083F7094dc51Cd7dA8c5C0985AD6e149629", //15: PoolTogether
    "0x90b1a66957914EbbE7a8df254c0c1E455972379C", //16: dHEDGE V2
  ];

  const RATES = [
    25000, //0:
    50000, //1:
    25000, //2:
    50000, //3:
    80000, //4:
    50000, //5:
    80000, //6:
    50000, //7:
    80000, //8:
    80000, //9:
    80000, //10:
    50000, //11:
    50000, //12:
    80000, //13:
    80000, //14:
    50000, //15:
    80000, //16:
  ];

  const INDEX_LIST = [
    [0, 1, 7, 9, 12, 13, 15], //Focus index
    [0, 1, 2, 11, 12, 15], //LowRisk Index
    [3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 16], //HighRisk Index
  ];

  const slotB = [
    [0, 0, 0, 0, 0, 0, 0], //Focus index
    [1, 1, 0, 0, 1, 1], //LowRisk Index
    [0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0], //HighRisk Index
  ];

  const leverages = [7000000, 7000000, 8000000];

  const ALLOCATION_POINT = BigNumber.from("1000000");

  //Deploy pools
  for (const addr of GOV_TOKENS) {
    console.log("creating pool for: ", addr);
    tx = await factory.connect(manager).createMarket(
      marketTemplateAddress,
      "0x",
      [0, 0], //initial deposit 0
      [addr, USDC_ADDRESS, registry.address, parametersV2.address]
    );
    await tx.wait();
  }

  let markets = await registry.getAllMarkets();
  for (let i = 0; i < markets.length; i++) {
    let market = await MarketTemplate.attach(markets[i]);

    await premiumV2.connect(manager).setRate(market.address, RATES[i]);
    console.log("market", i, "deployed to:", market.address);
  }

  //Deploy Indicies
  //INDEX
  await factory.connect(manager).approveTemplate(IndexTemplateAddress, true, false, true);
  await parametersV2.connect(manager).setMaxList(ZERO_ADDRESS, 10);

  for (let i = 0; i < INDEX_LIST.length; i++) {
    tx = await factory
      .connect(manager)
      .createMarket(IndexTemplateAddress, "0x", [0], [USDC_ADDRESS, registry.address, parametersV2.address]);
    await tx.wait();
  }

  //set Index
  markets = await registry.getAllMarkets();
  let pools = [];
  let indicies = [];
  let cds = [];
  for (let i = 0; i < markets.length; i++) {
    let addr = markets[i];

    if (i < DEPLOYED_ADDRESS.length) {
      pools.push(addr);
    } else if (i < INDEX_LIST.length + DEPLOYED_ADDRESS.length) {
      indicies.push(addr);
    } else {
      cds.push(addr);
    }
  }

  console.log("pools:", pools);
  console.log("indicies:", indicies);
  console.log("cds:", cds);

  for (let i = 0; i < INDEX_LIST.length; i++) {
    let index = await IndexTemplate.attach(indicies[i]);
    await index.connect(manager).setLeverage(leverages[i]);
    console.log(await index.targetLev());

    for (let t = 0; t < INDEX_LIST[i].length; t++) {
      tx = await index.connect(manager).set(t, slotB[i][t], pools[INDEX_LIST[i][t]], ALLOCATION_POINT);
      await tx.wait();
      console.log("set", t);
    }
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
