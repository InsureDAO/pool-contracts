const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
//const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const decimals = BigNumber.from("1000000"); //6

const GOV_TOKENS = [
  "0x5364Dc963c402aAF150700f38a8ef52C1D7D7F14", //DAI
  "0x191f0Db87d3136541354F89F43a034E11287788D", //TUSDC
  "0x615fBe6372676474d9e6933d310469c9b68e9726", //LINK
  "0x9d2F94DFeFfb5e5a7323492302C44d95a2F2189B", //DUSD
  "0x2583713e5373BeF68754544EeF97b550ffe716C5", //arbiUNION
  "0xCa003B920F1CEcb4fe0Fe91B657E58a8E1EED04a", //aWETH
];

const INDEX_LIST = [
  [0, 1, 2, 3, 4, 5],
  [0, 1, 2],
  [3, 4, 5],
];

const slotB = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1],
  [1, 1, 1],
];

const ALLOCATION_POINT = BigNumber.from("1000000");

//parameters
const DAY = 60; //FOR TEST!!!!
const GovFeeRatio = 100000; //10% of total premium goes to InsureDAO
const GracePeriod = DAY * 14; //period between invalidate and unlock insurance.
const LockUpPeriod = DAY * 14; //period after requestWithdraw() and withdrawable timing
const ReserveLockUpPeriod = DAY * 7; //during private farming, we go for a week.
const MinDate = DAY * 7; //minimum date of policy
const WithdrawablePeriod = DAY * 7;
const MAX_LIST = 10;

//minimum deposit to create new pool
const MinDeposit = BigNumber.from("1000").mul(decimals); //1000USDC

const LeverageRate = BigNumber.from("2000000");

Object.assign(exports, {
  ZERO_ADDRESS,
  //USDC_ADDRESS,
  GOV_TOKENS,
  INDEX_LIST,
  slotB,
  ALLOCATION_POINT,
  LeverageRate,

  GovFeeRatio,
  GracePeriod,
  LockUpPeriod,
  ReserveLockUpPeriod,
  WithdrawablePeriod,
  MinDate,
  MAX_LIST,
  MinDeposit,
});
