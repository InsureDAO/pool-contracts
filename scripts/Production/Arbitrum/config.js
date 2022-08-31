const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// localhost
const USDC_ADDRESS = "0x2f3A40A3db8a7e3D09B0adfEfbCe4f6F81927557";
// TODO: change address(arbitrum goerli use only)
// const USDC_ADDRESS = "0xb0Ad46bD50b44cBE47E2d83143E0E415d6A842F6";

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
