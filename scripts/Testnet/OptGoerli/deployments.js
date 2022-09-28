// TODO: change these addresses(local use only)
const OwnershipAddress = "0xf8eE0b195BBb984F72840770fa05A22cCF0784f7";
const RegistryAddress = "0x2238b12025Efb28d01d6Fec2bC979B795a4f1610";
const FactoryAddress = "0x53bc6a02e8FF61341A029dCCB4cEf5871a6dF10c";
const PremiumV2Address = "0x0A4d3aEE7eE3628bC96d57715ccD034De312e884";
const ParametersV2Address = "0xD1a3693266e96B051C3fe8D884faa32A970B3445";
const VaultAddress = "0x2A3BE9CD73c75dAcbEe96F8f1e52385eAFBC1124";

const PoolTemplateAddress = "0xc7BD5c16D5F1A368B8A591CEDD00f7141c807592";
const IndexTemplateAddress = "0xC1B2CDBfA44Cac348d6eB3aBA50302A590b0c549";
const CDSTemplateAddress = "0xb68325A017C3731ef5213d68Dfb0Ec24b7D85c0e";
const ExchangeLogicUniV3Address = "0x19FaA6FeD7be58bC888A97B8b13556f75E5B432E";
const AaveV3StrategyAddress = "0xABCCf30dFCA8E2c1095b3e49703600b713379C66";

// NOTE: Using optimism mainnet gov token addresses
const Pools = {
  synthetix: "0xE36f4b710da8fc1ef5b3E51b6D07Ce1FACA475bC", //0: Synthetix
  lyra: "0x7ff15A110Cce6363F537f99280DcF990Ed480066", //1: Lyra
  perpetualProtocol: "0x0d582cE27F184948C4c54177C1B2824C36d7a48b", //2: Perpetual Protocol
  kwenta: "0x2daaCfF4B2cAE4e4DB066B0ad35b832c8dc049ce", //3: Kwenta
  pika: "0x644a2Bf4b29E92A6e64C9C27c852a7b907744801", //4: Pika
  thales: "0x940c3002285b1A8a4f871410cb39f53b009dFB7A", //5: Thales
  polynomial: "0x284748359185C61D5F8AA30a33d6eAAeD069D04D", //6: Polynomial
  beefy: "0xB92C969c96dc2c78404ecf23a797c7ADe5673CD8", //7: Beefy
  dForce: "0x681CD4ec974490f87A395E2e60c5918c9ed2B040", //8: dForce
  tarot: "0xd096f54A522D2e13d7df34b0510c0eDd827Ab1E3", //9: Tarot
  arrakis: "0xe3210dF37Fd0AC62C06C6a42aBA040725b90FD2D", //10: Arrakis
  hop: "0x6784cb5A4FD28514534855983f890C78f907dc2d", //11: Hop
  velodrome: "0xB7DC8775CA7d89a9d3826f4E7C99D63CAFB4083f", //12: Velodrome
  beethovenX: "0x2b1ee6479bE27c3c1289A48b0b13aa9B0AFaD2F2", //13: BeethovenX
  rubicon: "0x2C8eF8baf39C5774A4291BB12F6cd712CdF4A3aa", //14: Rubicon
  poolTogether: "0xC073764DA170c5dE74E256e2F4084d8B92F72494", //15: PoolTogether
  dHedgeV2: "0xf566679c3b1f69D84435356F20846F55f18097a2", //16: dHEDGE V2
};

const Indices = {
  group1: "0xa5C5BD7f7C6E7ec913E12972781E61f4E80D24F0",
  group2: "0x6C410823740df1c13A4b104bFe768B01C2164DA1",
  group3: "0xB688FCE3B5fe27373a0AabDc882EcB34e2Bc4243",
};

const CDS = [];

Object.assign(exports, {
  OwnershipAddress,
  RegistryAddress,
  FactoryAddress,
  ParametersV2Address,
  PremiumV2Address,
  VaultAddress,
  PoolTemplateAddress,
  IndexTemplateAddress,
  CDSTemplateAddress,
  Pools,
  Indices,
  CDS,
});
