// TODO: change these addresses(local use only)
const OwnershipAddress = "0x2d2AA870F6781aB757346b90Ad7CFc48a56ea37a";
const RegistryAddress = "0xaF555C79445650415eD3b26e6F590189196C5e6D";
const FactoryAddress = "0xAD50b856c6d3B594B11436e1e99454d5BA528224";
const PremiumV2Address = "0x44a015F023158bac70C973E375B5461841B0F217";
const ParametersV2Address = "0xD68B6Fc463b28F6fE9a316ee8705f7EbDc2223e1";
const VaultAddress = "0xc1a86989d38A3B94743Deeaf616395D10AE1FdB0";

const PoolTemplateAddress = "0x0B0D90c79130D96873686af45Fe5Be8e65E33e18";
const IndexTemplateAddress = "0x9F4Af41416a40a874E53f6b244EfC6cD6099b34E";
const CDSTemplateAddress = "0xBDDCdf29842BE2247F4b84372f0b71CA474455A2";

const Pools = {
  gmx: "0x8d70D0A86299c57356359E131AeD7AB08DCb0228",
  radiant: "0x6f6ac013705eCede43C8552521fc6d08C2ef93ED",
  dopex: "0x5915d7958B36505D691c4773C56Af5F5cfA43E65",
  vesta: "0xab370D4c2867A43655472ACF1D8bbf39815eaa6C",
  mycelium: "0x2b3F90DF59b2207188590d680EdB55b2Bd6283bf",
  mux: "0x69B964b2d04F796824014139ED3061736aEbe7C0",
  dForce: "0x2A0f339cbefbbb4585Fea15804736126d5862A1F",
  abracadabra: "0xB022a3aeC6C1280450205ed499B3dE0171DeF6d5",
  premia: "0x162B46cBf5f111e630d1D2DE5A9024Ca43232D49",
  hop: "0xBa69eB4440B8cC64faD999878e244737D7016bb3",
};

const Indices = {
  group1: "0xd6B1170fc5a784F751965061fDf3EfF1Ba4B9890",
  group2: "0x12cdfAff3D7d6027Fb19A0087fafBf2cBA5c0AE9",
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
