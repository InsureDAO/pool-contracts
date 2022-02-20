const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const decimals = BigNumber.from("1000000"); //6

const GOV_TOKENS = [
  "0xF9bA5210F91D0474bd1e1DcDAeC4C58E359AaD85", //MKR
  "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", //UNI
  "0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735", //DAI
  "0xc778417E063141139Fce010982780140Aa0cD5Ab", //WETH
  "0x01BE23585060835E02B77ef475b0Cc51aA1e0709", //LINK
  "0xccba6b4a571b1487d5036b0b70cd8b4f119ff381", //CALM
  "0xD50931bb32fCa14ACBC0CaDe5850bA597F3eE1A6", //cMDL
  "0x93dE232E43d688d2D1c2b53fBE167B8Fc77f390f", //IRSD
  "0x7E79f4Af3b66FA5C8dEf4F5e465B2cDDE67E35FE", //IPV
  "0x77c24f0Af71257C0ee26e0E0a108F940D1698d53", //USDT
  "0xa4b7B52A5b71b46609aAA981751F2dC1E84fe2F7", //RND
  "0xA9A689d9A0C7a018FAacd90662acE690Fb09a623", //EYWA
  "0xaF9c34Bbf1B2179c4963FcFbF023Cf75e34ee480", //BMT
  "0xcB99A4e60dB8D0083179a89EC33d3fB15Be442BD", //SC
  "0xF1f70d79d49b84273Bb6188a0118C02A22e104B8", //ZKL
  "0x75b4902Af3671F3518B3421C73F7Dc7AE6E4Cc51", //BOMB
  "0x4dCf5ac4509888714dd43A5cCc46d7ab389D9c23", //HMT
  "0x81D99ab8cDd9f1f4Fe72F03DE7eA812773b9424c" //LFT
]


const INDEX_LIST = [
  [0, 1, 2, 4, 5, 6, 7, 8, 3, 9],
  [10, 11, 16, 3, 17],
  [12, 13, 15, 14, 8]
]

const slotB = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], //Genesis Index
  [0, 0, 0, 1, 0], //Curve wars Index
  [0, 0, 0, 0, 1] //Quantstamp Index
]
const ALLOCATION_POINT = BigNumber.from("1000000")

//parameters
const GovFeeRatio = 100000; //10%
const GracePeriod = 60 * 14;
const MinDate = 60 * 7;
const LockUpPeriod = 60 * 14;
const CDSLockUpPeriod = 60 * 7;
const WithdrawablePeriod = 60 * 7;
const MAX_LIST = 10;

//minimum deposit to create new pool
const MinDeposit = (BigNumber.from("1000")).mul(decimals); //1000USDC




Object.assign(exports, {
  ZERO_ADDRESS,
  GOV_TOKENS,
  INDEX_LIST,
  slotB,
  ALLOCATION_POINT,

  GovFeeRatio,
  GracePeriod,
  LockUpPeriod,
  CDSLockUpPeriod,
  WithdrawablePeriod,
  MinDate,
  MAX_LIST,
  MinDeposit
})