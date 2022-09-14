const { ethers } = require("hardhat");

const { RegistryAddress, Pools, Indices } = require("./deployments");

const { ALLOCATION_POINT } = require("./config");

/**
 * @typedef IndexConnection
 * @type {Object}
 * @property {string} poolAddress - deployed pool address
 * @property {number[]} indexAddresses - Index addresses pool should be added
 */

/**
 * @type {IndexConnection[]}
 */
const NEW_CONNECTIONS = [
  /* GMX */
  {
    poolAddress: Pools.gmx,
    indexAddresses: [Indices.group1],
  },
  /* Radiant */
  {
    poolAddress: Pools.radiant,
    indexAddresses: [Indices.group1],
  },
  /* Dopex */
  {
    poolAddress: Pools.dopex,
    indexAddresses: [Indices.group1],
  },
  {
    /* Vesta */
    poolAddress: Pools.vesta,
    indexAddresses: [Indices.group1],
  },
  /* Mycelium */
  {
    poolAddress: Pools.mycelium,
    indexAddresses: [Indices.group1],
  },
  /* MUX */
  {
    poolAddress: Pools.mux,
    indexAddresses: [Indices.group2],
  },
  /* dForce */
  {
    poolAddress: Pools.dForce,
    indexAddresses: [Indices.group2],
  },
  /* Abracadabra */
  {
    poolAddress: Pools.abracadabra,
    indexAddresses: [Indices.group2],
  },
  /* Premia */
  {
    poolAddress: Pools.premia,
    indexAddresses: [Indices.group2],
  },
  /* Hop */
  {
    poolAddress: Pools.hop,
    indexAddresses: [Indices.group2],
  },
];

async function main() {
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const Registry = await ethers.getContractFactory("Registry");

  const registry = Registry.attach(RegistryAddress);

  for (const { poolAddress, indexAddresses } of NEW_CONNECTIONS) {
    const poolExist = await registry.isListed(poolAddress);
    if (!poolExist) throw new Error(`Pool is not listed: ${poolAddress}`);

    // connecting to indices
    for (const indexAddress of indexAddresses) {
      const indexExist = await registry.isListed(indexAddress);
      if (!indexExist) throw new Error(`Index is not listed: ${indexAddress}`);

      const index = IndexTemplate.attach(indexAddress);
      const pool = PoolTemplate.attach(poolAddress);

      // check if connection already established
      const indexConnection = await pool.indices(indexAddress);
      if (indexConnection.exist) {
        console.log(
          `\n\u001b[33m ${indexAddress} already connected to pool ${poolAddress}. skip to connect. \u001b[0m\n`
        );

        continue;
      }

      const pools = await index.getAllPools();
      const newPoolPositionForIndex = pools.length;

      console.log("index position", newPoolPositionForIndex);

      // get target index number index should be set
      const newIndexPositionForPool = await (async () => {
        let i = 0;

        while (true) {
          try {
            await pool.indexList(i);
            // count up target index if index number already used
            i++;
          } catch (err) {
            break;
          }
        }

        return i;
      })();

      const setConnection = await index
        .connect(manager)
        .set(newPoolPositionForIndex, newIndexPositionForPool, poolAddress, ALLOCATION_POINT);

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
