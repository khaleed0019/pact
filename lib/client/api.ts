'use client'

import { PactError, describe, type UserFacingError } from '../errors.ts'

/**
 * The client's single door to the API.
 *
 * Every response — success, validation failure, 500, or the network simply not being
 * there — comes back as either data or a `UserFacingError`. Components never see a raw
 * `Response`, never call `.json()` themselves, and therefore never invent their own
 * error copy.
 */

export class ApiError extends Error {
  constructor(
    readonly userFacing: UserFacingError,
    readonly status: number,
  ) {
    super(userFacing.title)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response

  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      // Session cookie is HttpOnly; it must ride along on every call.
      credentials: 'same-origin',
    })
  } catch (cause) {
    // A rejected fetch is almost always the network, not the server.
    if ((cause as Error)?.name === 'AbortError') throw cause
    throw new ApiError(describe(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'SERVER'), 0)
  }

  if (response.status === 204) return undefined as T

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    if (response.ok) return undefined as T
    throw new ApiError(describe('SERVER'), response.status)
  }

  if (!response.ok) {
    const envelope = payload as { error?: UserFacingError }
    throw new ApiError(envelope?.error ?? describe('SERVER'), response.status)
  }

  return payload as T
}

/** Normalise anything thrown in a click handler into something renderable. */
export function toUserFacing(cause: unknown): UserFacingError {
  if (cause instanceof ApiError) return cause.userFacing
  if (cause instanceof PactError) return cause.toUserFacing()
  if ((cause as Error)?.name === 'AbortError') return describe('UNKNOWN')
  return describe('UNKNOWN')
}
