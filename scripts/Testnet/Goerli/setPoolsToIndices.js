const { ethers } = require("hardhat");

const { RegistryAddress } = require("./deployments");

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
const NEW_CONNECTIONS = [];

async function main() {
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const MarketTemplate = await ethers.getContractFactory("MarketTemplate");
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
      const pool = MarketTemplate.attach(poolAddress);

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

      await index.connect(manager).set(newPoolPositionForIndex, newIndexPositionForPool, poolAddress, ALLOCATION_POINT);

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
