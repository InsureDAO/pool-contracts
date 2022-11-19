const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  //deploy exchange logic
  const ExchangeParams = {
    uniswapV3Router: "{{ExchangeParams.uniswapV3Router}}",
    uniswapV3Quoter: "{{ExchangeParams.uniswapV3Quoter}}",
    fee: "{{ExchangeParams.fee}}",
    slippage_tolerance: "{{ExchangeParams.slippage_tolerance}}",
  };

  const ExchangeLogicUniswapV3 = await ethers.getContractFactory("ExchangeLogicUniswapV3");
  const exchangeLogic = await ExchangeLogicUniswapV3.deploy(
    ExchangeParams.uniswapV3Router,
    ExchangeParams.uniswapV3Quoter,
    ExchangeParams.fee,
    ExchangeParams.slippage_tolerance
  );
  await exchangeLogic.deployed();
  console.log(`ExchangeLogicUniswapV3 is deployed to: ${exchangeLogic.address}`);

  //deploy aave v3 strategy
  const StrategyParams = {
    ownership: "{{StrategyParams.ownership}}",
    vault: "{{StrategyParams.vault}}",
    aavePool: "{{StrategyParams.aavePool}}",
    aaveReward: "{{StrategyParams.aaveReward}}",
    usdc: "{{StrategyParams.usdc}}",
    ausdc: "{{StrategyParams.ausdc}}",
    gelatoOps: "{{StrategyParams.gelatoOps}}",
  };

  const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy");
  const strategy = await AaveV3Strategy.deploy(
    StrategyParams.ownership,
    StrategyParams.vault,
    exchangeLogic.address,
    StrategyParams.aavePool,
    StrategyParams.aaveReward,
    StrategyParams.usdc,
    StrategyParams.ausdc,
    StrategyParams.gelatoOps
  );

  await strategy.deployed();
  console.log(`AaveV3Strategy is deployed to: ${strategy.address}`);


  //attach
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.attach(StrategyParams.vault);
  let tx = await vault.setController(strategy.address);
  await tx.wait();
  console.log("setController() done");


  {{#verify}}
  await timeout(15000);
  try {
    await hre.run("verify:verify", {
      address: exchangeLogic.address,
      constructorArguments: [
        ExchangeParams.uniswapV3Router,
        ExchangeParams.uniswapV3Quoter,
        ExchangeParams.fee,
        ExchangeParams.slippage_tolerance,
      ],
    });
  } catch {
    console.log("verify for exchangeLogic skipped");
  }

  try {
    await hre.run("verify:verify", {
      address: strategy.address,
      constructorArguments: [
        StrategyParams.ownership,
        StrategyParams.vault,
        exchangeLogic.address,
        StrategyParams.aavePool,
        StrategyParams.aaveReward,
        StrategyParams.usdc,
        StrategyParams.ausdc,
        StrategyParams.gelatoOps,
      ],
    });
  } catch {
    console.log("verify for strategy skipped");
  }
  {{/verify}}
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
