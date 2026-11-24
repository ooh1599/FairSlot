/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 5042 (Arc Mainnet, default) or 5042002 (Arc Testnet) */
  readonly VITE_CHAIN_ID?: string
  /** Deployed FairSlot contract on VITE_CHAIN_ID */
  readonly VITE_FAIRSLOT_ADDRESS?: string
  /** 'direct' reads the public Arc RPC from the browser; default in production is the app's own /api/rpc relay */
  readonly VITE_RPC_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
