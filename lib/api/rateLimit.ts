/**
 * A small fixed-window rate limiter for sensitive routes (running an agent, checking a
 * payment against the chain). In-process, so it limits per server instance — enough to
 * stop a stuck client or a script from hammering the HN API or a NEAR RPC node through
 * PACT, not a substitute for an edge rate limit in front of a real deployment.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pactRateWindows: Map<string, { start: number; count: number }> | undefined
}

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  globalThis.__pactRateWindows ??= new Map()
  const windows = globalThis.__pactRateWindows
  const current = windows.get(key)
  if (!current || now - current.start >= windowMs) {
    windows.set(key, { start: now, count: 1 })
    return true
  }
  if (current.count >= limit) return false
  current.count++
  return true
}
