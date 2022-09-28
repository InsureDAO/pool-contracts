const { ethers } = require("hardhat");

const { RegistryAddress, Pools, Indices } = require("./deployments");

const { ALLOCATION_POINT } = require("./config");

/**
 * @typedef IndexConnection
 * @type {Object}
 * @property {string} indexAddress - deployed index address
 * @property {number[]} pools - pools should be added to indices
 */

/**
 * @type {IndexConnection[]}
 */
const NEW_CONNECTIONS = [
  {
    indexAddress: Indices.group1,
    pools: [Pools.synthetix, Pools.velodrome, Pools.beefy, Pools.poolTogether, Pools.perpetualProtocol, Pools.rubicon],
  },
  {
    indexAddress: Indices.group2,
    pools: [Pools.lyra, Pools.thales, Pools.pika, Pools.beethovenX, Pools.arrakis, Pools.dHedgeV2],
  },
  {
    indexAddress: Indices.group3,
    pools: [Pools.kwenta, Pools.hop, Pools.tarot, Pools.dForce, Pools.polynomial],
  },
];

async function main() {
  console.log(NEW_CONNECTIONS);
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const Registry = await ethers.getContractFactory("Registry");

  const registry = Registry.attach(RegistryAddress);

  for (const { indexAddress, pools } of NEW_CONNECTIONS) {
    // confirms the index has not exist yet
    const indexExist = await registry.isListed(indexAddress);
    if (!indexExist) throw new Error(`Index is not listed: ${indexAddress}`);

    const index = IndexTemplate.attach(indexAddress);
    const poolsInIndex = await index.getAllPools();

    for (const poolAddress of pools) {
      // confirms the pool has not exist yet
      const poolExist = await registry.isListed(poolAddress);
      if (!poolExist) throw new Error(`Pool is not listed: ${poolAddress}`);

      const poolAlreadyConnected = poolsInIndex.some((_pool) => _pool === poolAddress);

      if (poolAlreadyConnected) {
        console.log(
          `\n\u001b[33m ${indexAddress} already connected to pool ${poolAddress}. skip to connect. \u001b[0m\n`
        );

        continue;
      }

      const position = await index.poolLength();

      // FIXME: set() is recognized as undefined
      const setConnection = await index
        .connect(manager)
        ["set(uint256,address,uint256)"](position, poolAddress, ALLOCATION_POINT);

      await setConnection.wait();

      console.log(
        `pool successfully connected to index: \n\n\u001b[32m pool: ${poolAddress} \nindex: ${indexAddress}\n\n\u001b[0m`
      );
    }
  }

  const end = process.hrtime(start);

  console.log("✨ finished (%ds %dms)", end[0], end[1] / 10000);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
