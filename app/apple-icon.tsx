import { ImageResponse } from 'next/og'
import { sealIconResponseTree } from '@/lib/brand/sealIcon'

/**
 * The home-screen / share-sheet icon (iOS convention, but this is what shows if PACT is
 * ever pinned or bookmarked from inside Nimiq Pay too). Large enough to carry the
 * fingerprint ring, which the 32px favicon has to drop entirely.
 *
 * No rounded corners baked in here on purpose — iOS (and most consumers of this file)
 * apply their own mask, and a pre-rounded square looks wrong doubled up with an OS mask.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(sealIconResponseTree({ size: 180, ticks: 20 }), { ...size })
}
