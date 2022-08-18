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
  {
    poolAddress: "",
    indexAddresses: [],
  },
];

async function main() {
  const PoolTemplate = await ethers.getContractFactory("PoolTemplate");
  const IndexTemplate = await ethers.getContractFactory("IndexTemplate");

  const indicesConnectingPromises = NEW_CONNECTIONS.map(async ({ poolAddress, indexAddresses }) => {
    // connecting to indices
    const indexConnectingPromises = indexAddresses.map(async (indexAddress) => {
      const index = IndexTemplate.attach(indexAddress);
      const pool = PoolTemplate.attach(poolAddress);

      const pools = await index.getAllPools();
      const indices = await pool.indexList();

      const newPoolPositionForIndex = pools.length;
      const newIndexPositionForPool = indices.length;

      await index
        .connect(manager)
        .set(newPoolPositionForIndex, newIndexPositionForPool, connection.address, ALLOCATION_POINT);
    });
    // wait until all indices connected
    await Promise.all(indexConnectingPromises);

    console.log(`pool successfully connected to index: \npool: ${pool} \nindices: ${indexAddresses}`);
  });

  await Promise.all(indicesConnectingPromises);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
