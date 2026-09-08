import { ImageResponse } from 'next/og'
import { sealIconResponseTree } from '@/lib/brand/sealIcon'

/**
 * The browser-tab / bookmark favicon — see lib/brand/sealIcon.ts for what this is and
 * why it's built from the same definition as every other size of the mark.
 */
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(sealIconResponseTree({ size: 32, ticks: 0 }), { ...size })
}
