import 'server-only'
import { MemoryRepository } from './memory.ts'
import { demoPacts } from './seed.ts'
import type { Repository } from './repo.ts'

/**
 * Repository selection.
 *
 * The store is a module-level singleton because Next.js re-evaluates route modules on
 * every hot reload in development; without this, every edit would wipe the pact you were
 * halfway through creating.
 *
 * PACT currently runs on the zero-configuration in-process store, seeded with the demo
 * scenarios. That is a deliberate product decision, not a shortcut: the competition
 * requires the Mini App to work on the first try, and an app that demands a database URL
 * before it will render anything fails that test for every judge who just wants to look.
 *
 * ## Persistence status — read this before deploying
 *
 * This store is **per process and does not survive a restart**. It is correct for local
 * development, for the demo, and for a single long-lived server; it is not correct for a
 * serverless deployment where instances come and go.
 *
 * The Postgres schema this app is designed against is complete and reviewable in
 * `supabase/migrations/0001_init.sql` — including the constraint that a payment cannot be
 * marked sent or confirmed without a transaction reference. The adapter that implements
 * `Repository` against it is **not written yet**, so `SUPABASE_URL` is currently only used
 * to warn that persistence is not what the operator may be expecting. Wiring it up is
 * mechanical, but it should be verified against a live database rather than assumed, so
 * it is not claimed here until it is.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pactRepository: Repository | undefined
}

function create(): Repository {
  const memory = new MemoryRepository()
  memory.installSeed(demoPacts())
  return memory
}

export function getRepository(): Repository {
  if (!globalThis.__pactRepository) {
    if (process.env.SUPABASE_URL) {
      console.warn(
        '[pact] SUPABASE_URL is set, but the Postgres adapter is not implemented yet — ' +
          'falling back to the in-process store. Data will not survive a restart.',
      )
    }
    globalThis.__pactRepository = create()
  }
  return globalThis.__pactRepository
}

/**
 * True while the app is running on the ephemeral store, so the UI can say so plainly
 * rather than letting someone create a real agreement on storage that will vanish.
 * Hard-coded to true today because the in-process store is the only implementation.
 */
export function isEphemeralStore(): boolean {
  return true
}

export { RepoError } from './repo.ts'
export type { Repository } from './repo.ts'
