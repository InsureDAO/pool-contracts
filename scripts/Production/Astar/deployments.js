const OwnershipAddress = "0x4810fa5942A322c7bD30519eD3Ebe732066c3db3";
const RegistryAddress = "0xd0Df5A352D74A746754C592a6277c9060A7c9c87";
const FactoryAddress = "0x7Fcd5370be47cEC0FC0a7Fe91230432dd34DdeA1";
const ParametersAddress = "0xCa1FeE73b00c221966E5f25226402146BdffE259";
const VaultAddress = "0x190dA1B9fA124BD872e9166bA3c7Dd656A11E8F8";

const marketTemplateAddress = "0x0074976043140a371aeaD31189C2BE459950c816";
const IndexTemplateAddress = "0x734afd33dFB5100Ee91EFE690526DfFdEdBE0cF4";
const CDSTemplateAddress = "0xf4dB9926aE02469D730A25AD7422764BBD45d36F";

const Pools = {
  starlay: {
    pool: "0x9789dc4B4bb39566592B3761be42A9eB23EA5d34",
    premium: "0xDB9b9797319e9458D4d3B6eaa86c4f15EdDb989C",
  },
  arthswap: {
    pool: "0x4C1800E02532ed0fC60183454B9bffdf96B134F0",
    premium: "0xf29571145B421f660775fa3dEb16D9FF6085D0e6",
  },
  algem: {
    pool: "0x37d65a2f66d022b3f1739dedca1dfa076526d53e",
    premium: "0xfb1EcC7Eb61C2439528BACa22F1428Fe79A908Bf",
  },
  astridDAO: {
    pool: "0xd7bd4ccba0e500e1506b4b5783339b62e4d44f7f",
    premium: "0x2c98E9df71ce705E242016869F216aba0BCc84A1",
  },
  avault: {
    pool: "0xd2b848a364Df5410CE2161F9FD033Da42BaF7b78",
    premium: "0x8fa65bAF8423f8580822288C5129343587e21512",
  },
  siriusFinance: {
    pool: "0x36ce8db174e14a673fd31cd46cf8dc1ce430afff",
    premium: "0xAce8a2fCADe5aD906b22Ae58457e9375498bD282",
  },
  sio2Finance: {
    pool: "0xF89A343Eeb7F5c82b5B1C8469899F8b8018c2956",
    premium: "0x206D4cb039ADbd315590edfA4A382A5ADd065a5e",
  },
  zenlink: {
    pool: "0xE3F491c575e02902342ef8488Bb3D6C392869FdA",
    premium: "0x38722Ea55A1f15a7Ca325AF7da4986a5aC39f7a5",
  },
  astarFarm: {
    pool: "0xb4Bcb8a8E8C4760Dd26A95C9cdA302afCa9063a8",
    premium: "0x0C79cCE3A16761Bc9eE5584086a84C17fcD32eB3",
  },
  muuu: {
    pool: "0x4C83C55cDAecd197CB2Ef04AFb2964e4403819a0",
    premium: "0xBeA32ec888c8956f3cBa03AdD505FD5c6b05a9d8",
  },
  kagla: {
    pool: "0xB6D53534CABF9cD65F51A9E1FC0d0bE1d9Bfd303",
    premium: "0x9051fbf088AbC8C0C8070D36E330a2F0D6982A8a",
  },
};

const Premiums = ["0xDB9b9797319e9458D4d3B6eaa86c4f15EdDb989C", "0xf29571145B421f660775fa3dEb16D9FF6085D0e6"];

const Indices = {
  focus: "0x96f88002c1b1342DA65D3D19c214cA398D3ECd7f",
  highRisk: "0x9d5AD4016BB6b70fd2b2228471664a8cB5b97125",
};

const CDS = [];

Object.assign(exports, {
  OwnershipAddress,
  RegistryAddress,
  FactoryAddress,
  ParametersAddress,
  VaultAddress,
  marketTemplateAddress,
  IndexTemplateAddress,
  CDSTemplateAddress,
  Pools,
  Premiums,
  Indices,
  CDS,
});
