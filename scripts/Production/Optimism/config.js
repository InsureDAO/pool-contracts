const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607";

const GOV_TOKENS = [
  "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4",
  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"
];

const ALLOCATION_POINT = BigNumber.from("1000000");

//parameters
const DAY = 86400;
const GovFeeRatio = 100000; //10%
const GracePeriod = DAY * 14;
const LockUpPeriod = DAY * 14;
const MaxDate = DAY * 30;
const MinDate = DAY * 7;
const WithdrawablePeriod = DAY * 30;

const defaultRate = 50000; //5%

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
