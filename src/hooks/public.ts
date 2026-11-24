import { useMemo } from 'react'
import type { Hex } from 'viem'
import { deriveOnchainEventId, useManifest, useOnchainEvent, usePublicEvent } from './data'

/** Everything a public page needs, read from the database (rules, manifest location) and from the chain (state, result). */
export function usePublicBundle(publicId: string | undefined) {
  const event = usePublicEvent(publicId)
  const onchainId = useMemo<Hex | null>(
    () => (event.data ? deriveOnchainEventId(event.data.public_id, event.data.organizer_wallet) : null),
    [event.data],
  )
  const chain = useOnchainEvent(onchainId)
  // The onchain URI and hash win over the database copy: they are what the organizer committed to.
  const uri = chain.data?.manifestURI ?? event.data?.manifest_uri ?? undefined
  const hash = chain.data?.manifestHash ?? event.data?.manifest_hash ?? undefined
  const manifest = useManifest(uri, hash)
  return { event, onchainId, chain, manifest, manifestUri: uri, manifestHash: hash }
}
