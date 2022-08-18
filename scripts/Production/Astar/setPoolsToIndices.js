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
  const indicesConnectingPromises = NEW_CONNECTIONS.map(async (connection) => {
    // connecting to indices
    const indexConnectingPromises = connection.indexAddresses.map(async (indexAddress, indexPosition) => {
      const index = IndexTemplate.attach(indexAddress);

      const pools = await index.getAllPools();

      // TODO: poolが持つindexのMaxLength取得して設定
      const newPoolPositionForIndex = pools.length;
      const newIndexPositionForPool = indexPosition;

      await index
        .connect(manager)
        .set(newPoolPositionForIndex, newIndexPositionForPool, connection.address, ALLOCATION_POINT);
    });
    // wait until all indices connected
    await Promise.all(indexConnectingPromises);

    console.log(`pool ${connection.poolAddress} successfully connected to ${connection.indexAddresses}`);
  });

  await Promise.all(indicesConnectingPromises);
}
