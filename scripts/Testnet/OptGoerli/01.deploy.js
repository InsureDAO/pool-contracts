const { ethers } = require("hardhat");

/**
 * two pools, no index/cds, FlatPremiumV2, ParameterV2, openDeposit=false
 */

async function main() {
  //----- IMPORT -----//
  const [creator, manager] = await ethers.getSigners();
  console.log("creator address: ", creator.address);
  console.log("manager address: ", manager.address);

  const {
    ZERO_ADDRESS,
    USDC_ADDRESS,
    AAVE_USDC,
    AAVE_REWARD_TOKEN,
    UNI_ROUTER,
    UNI_QUOTER,
    AAVE_V3_POOL,
    AAVE_V3_REWARD,
    GELATO_OPS,

    UNI_FEE_TIER,
    UNI_SLIPPAGE_TOLERANCE,

    GovFeeRatio,
    GracePeriod,

    LockUpPeriod,

    WithdrawablePeriod,
    MaxDate,
    MinDate,

    PremiumRateDefault,
  } = require("./config.js");

  const USDC = await ethers.getContractFactory("ERC20Mock", creator);
  const Ownership = await ethers.getContractFactory("Ownership", creator);
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate", creator);
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate", creator);
  const CDSTemplate = await ethers.getContractFactory("CDSTemplate", creator);
  const Factory = await ethers.getContractFactory("Factory", creator);
  const Vault = await ethers.getContractFactory("Vault", creator);
  const Registry = await ethers.getContractFactory("Registry", creator);
  const FlatPremiumV2 = await ethers.getContractFactory("FlatPremiumV2", creator);
  const ParametersV2 = await ethers.getContractFactory("ParametersV2", creator);
  const ExchangeLogicUniswapV3 = await ethers.getContractFactory("ExchangeLogicUniswapV3", creator);
  const AaveV3Strategy = await ethers.getContractFactory("AaveV3Strategy", creator);

  const usdc = USDC.attach(USDC_ADDRESS);
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

  const premiumV2 = await FlatPremiumV2.deploy(ownership.address, PremiumRateDefault);
  await premiumV2.deployed();
  console.log("premiumV2 deployed to:", premiumV2.address);

  const parametersV2 = await ParametersV2.deploy(ownership.address);
  await parametersV2.deployed();
  console.log("parametersV2 deployed to:", parametersV2.address);

  const vault = await Vault.deploy(usdc.address, registry.address, ZERO_ADDRESS, ownership.address);
  await vault.deployed();
  console.log("vault deployed to:", vault.address);

  //Pools Template
  const poolTemplate = await PoolTemplate.deploy();
  await poolTemplate.deployed();
  console.log("poolTemplate deployed to:", poolTemplate.address);

  const indexTemplate = await IndexTemplate.deploy();
  await indexTemplate.deployed();
  console.log("indexTemplate deployed to:", indexTemplate.address);

  const cdsTemplate = await CDSTemplate.deploy();
  await cdsTemplate.deployed();
  console.log("cdsTemplate deployed to:", cdsTemplate.address);

  // Investment
  const exchangeLogic = await ExchangeLogicUniswapV3.deploy(
    UNI_ROUTER,
    UNI_QUOTER,
    UNI_FEE_TIER,
    UNI_SLIPPAGE_TOLERANCE
  );
  await exchangeLogic.deployed();
  console.log("ExchangeLogicUniswapV3 deployed to:", exchangeLogic.address);

  const aaveV3Strategy = await AaveV3Strategy.deploy(
    ownership.address,
    vault.address,
    exchangeLogic.address,
    AAVE_V3_POOL,
    AAVE_V3_REWARD,
    usdc.address,
    AAVE_USDC,
    AAVE_REWARD_TOKEN,
    GELATO_OPS
  );
  await aaveV3Strategy.deployed();
  console.log("AaveV3Strategy deployed to:", aaveV3Strategy.address);

  //----- SETUP -----//
  let tx = await registry.setFactory(factory.address);
  await tx.wait();

  tx = await factory.approveTemplate(poolTemplate.address, true, false, false); //creation not public
  await tx.wait();
  tx = await factory.approveTemplate(indexTemplate.address, true, false, true); //creation not public
  await tx.wait();
  tx = await factory.approveTemplate(cdsTemplate.address, true, false, false); //creation not public
  await tx.wait();

  //pool setup
  tx = await factory.approveReference(poolTemplate.address, 0, ZERO_ADDRESS, true);
  await tx.wait();
  tx = await factory.approveReference(poolTemplate.address, 1, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(poolTemplate.address, 2, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(poolTemplate.address, 3, parametersV2.address, true);
  await tx.wait();

  //index setup
  tx = await factory.approveReference(indexTemplate.address, 0, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(indexTemplate.address, 1, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(indexTemplate.address, 2, parametersV2.address, true);
  await tx.wait();

  //cds setup
  tx = await factory.approveReference(cdsTemplate.address, 0, usdc.address, true);
  await tx.wait();
  tx = await factory.approveReference(cdsTemplate.address, 1, registry.address, true);
  await tx.wait();
  tx = await factory.approveReference(cdsTemplate.address, 2, parametersV2.address, true);
  await tx.wait();

  //set parametersV2
  tx = await parametersV2.setFeeRate(ZERO_ADDRESS, GovFeeRatio);
  await tx.wait();

  tx = await parametersV2.setGrace(ZERO_ADDRESS, GracePeriod);
  await tx.wait();

  tx = await parametersV2.setLockup(ZERO_ADDRESS, LockUpPeriod);
  await tx.wait();

  tx = await parametersV2.setMaxDate(ZERO_ADDRESS, MaxDate);
  await tx.wait();

  tx = await parametersV2.setMinDate(ZERO_ADDRESS, MinDate);
  await tx.wait();

  tx = await parametersV2.setWithdrawable(ZERO_ADDRESS, WithdrawablePeriod);
  await tx.wait();

  tx = await parametersV2.setVault(usdc.address, vault.address);
  await tx.wait();

  tx = await parametersV2.setPremiumModel(ZERO_ADDRESS, premiumV2.address);
  await tx.wait();

  tx = await parametersV2.setMaxList(ZERO_ADDRESS, 10);
  await tx.wait();

  // transfer ownership to manager
  tx = await ownership.commitTransferOwnership(manager.address);
  await tx.wait();
  tx = await ownership.connect(manager).acceptTransferOwnership();
  await tx.wait();
  console.log("owner address:", manager.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
