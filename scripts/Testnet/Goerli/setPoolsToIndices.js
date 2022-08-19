const { ethers } = require("hardhat");

const { BigNumber } = require("ethers");

const { RegistryAddress } = require("./deployments");

/**
 * @note currently use fixed value, but may change in the future
 */
const ALLOCATION_POINT = BigNumber.from("1000000");

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
  // TODO: DELETE these params (just for test)
  /* AstridDAO */
  {
    poolAddress: "0x66737C9Dfe7ad301f3b4B173E2BFB85146c79Ed1",
    indexAddresses: ["0xF22C823a02424609c91869e176A0A8eFE2dC2400"],
  },
  {
    /* Avault */
    poolAddress: "0x39FD418d4E36066e7eE18CB83aBdA0F6E3892Dbc",
    indexAddresses: ["0xe0BE53C7D9bE11E99957bde717BeF89db9fF754f"],
  },
  /* Sirius-finance */
  {
    poolAddress: "0xb4b379D945736f4AFFD093411C6C482D9770AFD8",
    indexAddresses: ["0xe0BE53C7D9bE11E99957bde717BeF89db9fF754f"],
  },
  // /* SiO2 Finance */
  // {
  //   poolAddress: "",
  //   indexAddresses: [""],
  // },
  // /* Zenlink */
  // {
  //   poolAddress: "",
  //   indexAddresses: [""],
  // },
  // /* AstarFarm */
  // {
  //   poolAddress: "",
  //   indexAddresses: [""],
  // },
  // /* Muuu */
  // {
  //   poolAddress: "",
  //   indexAddresses: [""],
  // },
  // /* KAGLA Finance */
  // {
  //   poolAddress: "",
  //   indexAddresses: [""],
  // },
];

async function main() {
  const start = process.hrtime();

  const [, manager] = await ethers.getSigners();
  console.log("manager address: ", manager.address);

  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");
  const Registry = await ethers.getContractFactory("Registry");

  const registry = Registry.attach(RegistryAddress);

  const indicesConnectingPromises = NEW_CONNECTIONS.map(async ({ poolAddress, indexAddresses }) => {
    const poolExist = await registry.isListed(poolAddress);
    if (!poolExist) throw new Error(`Pool is not listed: ${poolAddress}`);

    // connecting to indices
    const indexConnectingPromises = indexAddresses.map(async (indexAddress) => {
      const indexExist = await registry.isListed(indexAddress);
      if (!indexExist) throw new Error(`Index is not listed: ${indexAddress}`);

      const index = IndexTemplate.attach(indexAddress);
      const pool = PoolTemplate.attach(poolAddress);

      // check if connection already established
      const indexConnection = await pool.indices(indexAddress);
      if (indexConnection.exist)
        return console.log(
          `\n\u001b[33m ${indexAddress} already connected to pool ${poolAddress}. skip to connect. \u001b[0m\n`
        );

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
    });
    // wait until all indices connected
    await Promise.all(indexConnectingPromises);
  });

  await Promise.all(indicesConnectingPromises);

  const end = process.hrtime(start);

  console.log("✨ finished (%ds %dms)", end[0], end[1] / 10000);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
