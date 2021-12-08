# InsureDAO pool contracts

Smart contracts used in [InsureDAO](https://insuredao.fi/) pools.

## Overview

InsureDAO is the composable and open insurance protocol in the Ethereum ecosystem which enables any protocol/anyone to create, provide, get insured from potential risks in crypto.

This repository contains pool related contracts. For goveranance related contracts, please refer to ["dao-contracts"](https://github.com/insureDAO/dao-contracts) pools.

## Contracts

- [`interfaces`](contracts/interfaces): Subdirectories for interfaces
- [`libraries`](contracts/libraries): Subdirectories for useful libraries
- [`mocks`](contracts/mocks): Subdirectories for mocks (for testing purposes)
- [`CDSTemplate`](contracts/CDSTemplate.sol): CDS template contracts, which compensate index in case of an index's insolvency
- [`IndexTemplate`](contracts/IndexTemplate.sol): Index template contracts, which leverage and deploy credit(internal token) to underlying individual pools
- [`PoolTemplate`](contracts/PoolTemplate.sol): Pool template contracts, where people trade risk and premium
- [`Vault`](contracts/Vault.sol): Manages deposited collateral and accrued premium to yield additional earnings
- [`Factory`](contracts/Factory.sol): Factory contract to deploy new pools/indicies/cds at lowest gas cost and control delpoying addresses
- [`Parameters`](contracts/Parameters.sol): Store market parameters to each markets. the DAO control address can operate upgrades
- [`PremiumModel`](contracts/PremiumModel.sol): Stores logic of premium calculation
- [`Registry`](contracts/Registry.sol): Registeres InsureDAO's official pools.

## Testing and Development

### Workflow

- New InsureDAO pools are built from the Factory contract template at [`Factory`](contracts/Factory.sol)
- Once deployed, the contracts for a pool are added to [`Registry`](contracts/Registry.sol)

### Running the Tests

The [test suite](test) contains common tests for all types of pools. To run the entire suite:

```bash
yarn & yarn test
```

## Audits and Security

InsureDAO smart contracts have been audited by oo. These audit reports are made available on the [`audits`](audits).

## License

(c) InsureDAO, 2021 - [All rights reserved](LICENSE).
