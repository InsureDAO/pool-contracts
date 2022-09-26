const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0x8921bCD73e1465593942a1473d4Ae83898a6B8DA";

const GOV_TOKENS = ["0x3000000000000000000000000000000000000000", "0x4000000000000000000000000000000000000000"];

const ALLOCATION_POINT = BigNumber.from("1000000");

//parameters
const DAY = 86400;
const GovFeeRatio = 100000; //10%
const GracePeriod = DAY * 14;
const LockUpPeriod = DAY * 14;
const MaxDate = DAY * 30;
const MinDate = DAY * 7;
const WithdrawablePeriod = DAY * 30;

const defaultRate = 60000; //6%
const PremiumRate1 = 60000; //Starlay 6%
const PremiumRate2 = 25000; //Arthswap 2.5%

Object.assign(exports, {
  ZERO_ADDRESS,
  USDC_ADDRESS,
  GOV_TOKENS,
  ALLOCATION_POINT,

  GovFeeRatio,
  GracePeriod,
  LockUpPeriod,
  WithdrawablePeriod,
  MaxDate,
  MinDate,
  defaultRate,
  PremiumRate1,
  PremiumRate2,
});
