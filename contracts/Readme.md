## Contracts

- [`interfaces`](interfaces): Subdirectories for interfaces
- [`mocks`](mocks): Subdirectories for mock contracts (for testing purposes)
- [`PremiumModels`](PremiumModels): Subdirectories for contracts that store logic of premium calculation
- [`Parameters`](Parameters.sol): Store market parameters to each pools. the DAO control address can operate upgrades

- [`Factory`](Factory.sol): Factory contract to deploy new pools/indices/reserve at lowest gas cost and control delpoying addresses
- [`Ownership`](Ownership.sol): Ownership manager
- [`Registry`](Registry.sol): Registeres InsureDAO's official pools.
- [`Vault`](Vault.sol): Manages deposited collateral and accrued premium to yield additional earnings
