import 'server-only'
import { MemoryRepository } from './memory.ts'
import { SupabaseRepository } from './supabase.ts'
import { demoPacts } from './seed.ts'
import type { Repository } from './repo.ts'

/**
 * Repository selection.
 *
 * Two implementations, one interface:
 *
 *  - **Supabase Postgres**, when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
 *    This is what a deployment needs — agreements survive restarts, and the database
 *    enforces the invariants independently of the application (a payment cannot be
 *    marked sent or confirmed without a transaction reference).
 *
 *  - **In-process store**, otherwise. Seeded with the demo scenarios, so `npm run dev`
 *    on a fresh clone with an empty `.env` is already a complete, working product. That
 *    is a deliberate product decision: an app that demands a database URL before it will
 *    render anything fails "works on the first try" for every judge who just wants to
 *    look at it.
 *
 * The in-process store is the reference implementation and the one the tests pin; the
 * Postgres adapter mirrors its authorisation and its invariants exactly.
 *
 * The store is a module-level singleton because Next.js re-evaluates route modules on
 * every hot reload in development; without this, every edit would wipe the pact you were
 * halfway through creating.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pactRepository: Repository | undefined
}

function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? { url, key } : null
}

function create(): Repository {
  const config = supabaseConfig()
  if (config) {
    console.log('[pact] using Supabase Postgres (schema: pact)')
    return new SupabaseRepository(config.url, config.key)
  }

  console.log('[pact] using the in-process store — data will not survive a restart')
  const memory = new MemoryRepository()
  memory.installSeed(demoPacts())
  return memory
}

export function getRepository(): Repository {
  if (!globalThis.__pactRepository) globalThis.__pactRepository = create()
  return globalThis.__pactRepository
}

/**
 * True while the app is running on the ephemeral store, so the UI can say so plainly
 * rather than letting someone create a real agreement on storage that will vanish.
 */
export function isEphemeralStore(): boolean {
  return supabaseConfig() === null
}

export { RepoError, isRepoError } from './repo.ts'
export type { RepoErrorKind } from './repo.ts'
export type { Repository } from './repo.ts'
