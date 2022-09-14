const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";

const ALLOCATION_POINT = BigNumber.from("1000000");

const PREMIUM_RATE_BASE = BigNumber.from("1000000");

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
  ALLOCATION_POINT,
  PREMIUM_RATE_BASE,

  GovFeeRatio,
  GracePeriod,
  LockUpPeriod,
  WithdrawablePeriod,
  MaxDate,
  MinDate,

  PremiumRateDefault,
});
