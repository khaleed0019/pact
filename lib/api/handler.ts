import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError, type ZodTypeAny, type output } from 'zod'
import { RepoError } from '../db/index.ts'
import { readSession, type Session } from '../auth/session.ts'
import { describe, type ErrorCode } from '../errors.ts'

/**
 * Shared plumbing for every route handler.
 *
 * The point is that no individual route gets to invent its own error shape or forget its
 * auth check. `authed()` will not call your handler without a verified session, and every
 * throw — validation, repository, or unexpected — comes back as the same JSON envelope
 * the client's error component already knows how to render.
 */

export interface ApiErrorBody {
  error: { code: ErrorCode; title: string; body: string; retry: boolean; benign?: boolean; detail?: string }
}

const STATUS_FOR: Record<RepoError['kind'], number> = {
  NOT_FOUND: 404,
  NOT_ALLOWED: 403,
  CONFLICT: 409,
  INVALID: 422,
}

const CODE_FOR: Record<RepoError['kind'], ErrorCode> = {
  NOT_FOUND: 'INVITE_INVALID',
  NOT_ALLOWED: 'NOT_ALLOWED',
  CONFLICT: 'STALE_STATE',
  INVALID: 'VALIDATION',
}

export function fail(code: ErrorCode, status: number, detail?: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { ...describe(code), detail } }, { status })
}

function toResponse(cause: unknown): NextResponse<ApiErrorBody> {
  if (cause instanceof ZodError) {
    // Surface the first problem in language a person can act on, not a Zod dump.
    const first = cause.issues[0]
    return fail('VALIDATION', 422, first ? `${first.path.join('.') || 'field'}: ${first.message}` : undefined)
  }
  if (cause instanceof RepoError) {
    return fail(CODE_FOR[cause.kind], STATUS_FOR[cause.kind], cause.message)
  }

  // Unexpected: log the real thing server-side, tell the user something useful.
  console.error('[pact] unhandled route error', cause)
  return fail('SERVER', 500)
}

type Handler<T> = (context: T) => Promise<NextResponse> | NextResponse

/** Wrap a public route so it cannot leak a stack trace. */
export function route(handler: () => Promise<NextResponse> | NextResponse) {
  return async (): Promise<NextResponse> => {
    try {
      return await handler()
    } catch (cause) {
      return toResponse(cause)
    }
  }
}

/** Run `handler` only for a verified session; everything else gets a clean 401. */
export async function authed(handler: Handler<{ session: Session }>): Promise<NextResponse> {
  try {
    const session = await readSession()
    if (!session) return fail('NOT_ALLOWED', 401, 'Sign in with your Nimiq wallet to continue.')
    return await handler({ session })
  } catch (cause) {
    return toResponse(cause)
  }
}

export async function guard(handler: () => Promise<NextResponse> | NextResponse): Promise<NextResponse> {
  try {
    return await handler()
  } catch (cause) {
    return toResponse(cause)
  }
}

/**
 * Parse a JSON body against a schema, turning a malformed body into a 422 not a 500.
 *
 * Generic over the *schema* rather than over a result type, so the return is Zod's
 * output type. Writing this as `schema: ZodType<T>` looks equivalent but infers `T` from
 * the input side, which quietly hands every caller `string | undefined` for fields that
 * have a `.default()` — the defaults are applied at runtime but invisible to the types.
 */
export async function body<S extends ZodTypeAny>(request: Request, schema: S): Promise<output<S>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ZodError([{ code: 'custom', path: [], message: 'Expected a JSON body.' }])
  }
  return schema.parse(raw)
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}
