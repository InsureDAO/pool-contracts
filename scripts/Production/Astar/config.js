const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0x6a2d262D56735DbA19Dd70682B39F6bE9a931D98";

const GOV_TOKENS = ["0xfddcf720BD33cB282048d7373C72940D59E1b174", "0xDe2578Edec4669BA7F41c5d5D2386300bcEA4678"];

const ALLOCATION_POINT = BigNumber.from("1000000");

const PREMIUM_RATE_BASE = BigNumber.from("1000000");

//parameters
const DAY = 86400;
const GovFeeRatio = 100000; //10%
const GracePeriod = DAY * 14;
const LockUpPeriod = DAY * 14;
const MaxDate = DAY * 30;
const MinDate = DAY * 7;
const WithdrawablePeriod = DAY * 30;

const PremiumRate1 = 60000; //Starlay 6%
const PremiumRate2 = 25000; //Arthswap 2.5%

Object.assign(exports, {
  ZERO_ADDRESS,
  USDC_ADDRESS,
  GOV_TOKENS,
  ALLOCATION_POINT,
  PREMIUM_RATE_BASE,

  GovFeeRatio,
  GracePeriod,
  LockUpPeriod,
  WithdrawablePeriod,
  MaxDate,
  MinDate,

  PremiumRate1,
  PremiumRate2,
});
