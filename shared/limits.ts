/** Product limits shared by the web app, the API and tests. They mirror the FairSlot contract constants. */
export const LIMITS = {
  maxParticipants: 10_000,
  /** winners + reserves */
  maxPicks: 50,
  /** positions drawn per finalize transaction */
  finalizeBatch: 25,
  maxCsvBytes: 2 * 1024 * 1024,
  maxNameLength: 120,
  maxExternalIdLength: 120,
  maxEmailLength: 254,
  maxTitleLength: 120,
  maxDescriptionLength: 2000,
  maxRulesLength: 4000,
  maxPrizeNameLength: 120,
} as const

export const ALGORITHM_VERSION = 1
export const MANIFEST_SCHEMA_VERSION = 1

export const ARC_MAINNET_CHAIN_ID = 5042
export const ARC_TESTNET_CHAIN_ID = 5042002
