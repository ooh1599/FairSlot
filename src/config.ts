/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Browsers read Arc through the app's own origin in production: public *.arc.io hosts are blocked by common ad-block lists.
function arcTransport(chainId: number, direct: string) {
  const useRelay = import.meta.env.PROD && import.meta.env.VITE_RPC_MODE !== 'direct'
  return http(useRelay ? `/api/rpc?chain=${chainId}` : direct)
}

registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arc, arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arc.id]: arcTransport(arc.id, arc.rpcUrls.default.http[0]),
    [arcTestnet.id]: arcTransport(arcTestnet.id, arcTestnet.rpcUrls.default.http[0]),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
