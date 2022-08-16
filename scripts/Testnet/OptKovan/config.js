const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0x0000000000000000000000000000000000000000";

const GOV_TOKENS = ["0x1000000000000000000000000000000000000000", "0x2000000000000000000000000000000000000000"];

const ALLOCATION_POINT = BigNumber.from("1000000");

//parameters
const DAY = 86400;
const GovFeeRatio = 100000; //10%
const GracePeriod = DAY * 14;
const LockUpPeriod = DAY * 14;
const MaxDate = DAY * 30;
const MinDate = DAY * 7;
const WithdrawablePeriod = DAY * 30;

const defaultRate = 100000; //10%

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
});
