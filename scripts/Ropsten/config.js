const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const decimals = BigNumber.from("1000000"); //6

const GOV_TOKENS = [
  "0x26FC224B37952Bd12C792425F242E0B0a55453a6",
  "0xb391CB9C0f844a60fE7DE98beFf97B03ee66C18B",
  "0x88D1dfde2Cf0daAd0bbCE633126135AFE26C1Ca9",
  "0xc778417E063141139Fce010982780140Aa0cD5Ab",
  "0xF6958Cf3127e62d3EB26c79F4f45d3F3b2CcdeD4",
  "0x425f9dE327265348A637348E1FfcfaA8568c1fF2",
  "0x909FF9ba392b0Bf13638E2BA42691E76D5FC75C1",
  "0x38F6270aFE5De9931Ed7F5eF819E41d28793026A",
  "0x7821c3B5d08B745972438112b5B8E03bB288F12b",
  "0xd73ce105814e2f6cE4e5a41A179787D4959aBe76",
  "0xb0885d50bd1dCb65b162ab8F10eb3D00eF40d1B8",
  "0xa10F8a530431caAE24A11Ff0b028ce1EAbEC8de4",
  "0xf28223aC364bfB9493B6830e57d82804B3B0DE58",
  "0xa4222f78d23593e82Aa74742d25D06720DCa4ab7",
  "0x6c48CB973eD7ff3247181a0D1D3571C99F3A65af",
  "0x9F6C12F055E3D50d29AA6C587eDC2f7f02DB9082",
  "0xe24a720Ac142Dfc7625F231960e9CEB7aD3206cc",
  "0xF1B732302Bac54b8354e02AAED5D43B3A344d399",
  "0xDc335304979D378255015c33AbFf09B60c31EBAb",
  "0x1730aDA73ADCCC1cBB33Bc89d626e97B90408f55"
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

const DAY = 60;//TEST
const GovFeeRatio = 100000; //10%
const GracePeriod = DAY * 14;
const LockUpPeriod = DAY * 14;
const CDSLockUpPeriod = DAY * 21;
const MinDate = DAY * 7;
const WithdrawablePeriod = DAY * 7;
const MAX_LIST = 10;

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