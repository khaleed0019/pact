import 'server-only'
import { activeBackend, askForJson } from '../ai/providers.ts'
import { nearConfig } from '../near/config.ts'
import { providerFromEnv } from './provider.ts'
import { MemoryMissionStore, type MissionStore } from './store.ts'
import type { MissionDeps } from './service.ts'

declare global {
  // eslint-disable-next-line no-var
  var __pactMissions: MissionStore | undefined
}

/**
 * Mission storage is in-process for now, even when Supabase is configured: the
 * `pact.missions` tables are not migrated yet, and a mission must not appear to persist
 * when it does not. `missionsArePersistent()` lets the UI say so plainly.
 */
export function getMissionStore(): MissionStore {
  globalThis.__pactMissions ??= new MemoryMissionStore()
  return globalThis.__pactMissions
}

export function missionsArePersistent(): boolean {
  return false
}

export function missionDeps(): MissionDeps {
  const backend = activeBackend()
  return {
    store: getMissionStore(),
    now: () => new Date(),
    fetch: globalThis.fetch.bind(globalThis),
    ask: backend === 'none' ? null : askForJson,
    aiBackend: backend,
    provider: providerFromEnv(),
    near: nearConfig(),
  }
}
