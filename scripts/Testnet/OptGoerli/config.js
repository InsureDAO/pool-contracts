const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0xC108c33731a62781579A28F33b0Ce6AF28a090D2";
const AAVE_USDC = "0xa0c014681515cB33176A885a0fCE0c458aC5de2d";
const AAVE_REWARD_TOKEN = "0x4200000000000000000000000000000000000042";
const UNI_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNI_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const AAVE_V3_POOL = "0x4b529A5d8268d74B687aC3dbb00e1b85bF4BF0d4";
const AAVE_V3_REWARD = "0x0C501fB73808e1BD73cBDdd0c99237bbc481Bb58";
const GELATO_OPS = "0x255F82563b5973264e89526345EcEa766DB3baB2";

const ALLOCATION_POINT = BigNumber.from("1000000");
const PREMIUM_RATE_BASE = BigNumber.from("1000000");
const UNI_FEE_TIER = BigNumber.from("3000");
const UNI_SLIPPAGE_TOLERANCE = BigNumber.from("970000");

// parameters
const DAY = 86400;
const GovFeeRatio = 100000; //10%
const GracePeriod = DAY * 14;
const LockUpPeriod = DAY * 14;
const MaxDate = DAY * 30;
const MinDate = DAY * 7;
const WithdrawablePeriod = DAY * 30;

// premium
const PremiumRateDefault = 50000; //5%

Object.assign(exports, {
  ZERO_ADDRESS,
  USDC_ADDRESS,
  AAVE_USDC,
  AAVE_REWARD_TOKEN,
  UNI_ROUTER,
  UNI_QUOTER,
  AAVE_V3_POOL,
  AAVE_V3_REWARD,
  GELATO_OPS,

  ALLOCATION_POINT,
  PREMIUM_RATE_BASE,
  UNI_FEE_TIER,
  UNI_SLIPPAGE_TOLERANCE,

  GovFeeRatio,
  GracePeriod,
  LockUpPeriod,
  WithdrawablePeriod,
  MaxDate,
  MinDate,

  PremiumRateDefault,
});
