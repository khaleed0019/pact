import 'server-only'

/**
 * Model backends.
 *
 * PACT needs exactly one thing from a model: a single JSON object matching a schema.
 * Rather than couple the app to one vendor, both backends implement `askForJson` and the
 * caller validates the result with Zod either way — so a provider that returns something
 * unexpected degrades to the deterministic reader instead of corrupting an agreement.
 *
 * Selection is by whichever key is present, Gemini first (it is the one with a free
 * tier). Neither key is ever sent to the browser: this module is `server-only`.
 */

export type Backend = 'gemini' | 'anthropic' | 'none'

/** Google publishes this under several env names depending on the SDK people came from. */
function geminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    undefined
  )
}

export function activeBackend(): Backend {
  if (geminiKey()) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'none'
}

export interface JsonRequest {
  system: string
  prompt: string
  /** JSON Schema describing the single object we want back. */
  schema: Record<string, unknown>
  /** Names the tool for Anthropic; ignored by Gemini. */
  toolName: string
  toolDescription: string
}

const TIMEOUT_MS = 20_000

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  signal?.addEventListener('abort', () => controller.abort())
  // Node keeps the process alive for a pending timer; unref where available.
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return controller.signal
}

// --- Gemini --------------------------------------------------------------------------

/**
 * Translate our JSON Schema into the subset Gemini's `responseSchema` accepts.
 *
 * Two incompatibilities that silently break structured output if you miss them:
 *  - types are UPPERCASE (`STRING`, not `string`)
 *  - a nullable field is `{ type: 'STRING', nullable: true }`, not `type: ['string','null']`
 */
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const rawType = schema.type
  let nullable = schema.nullable === true
  let type: string | undefined

  if (Array.isArray(rawType)) {
    const types = rawType as string[]
    nullable = nullable || types.includes('null')
    type = types.find((t) => t !== 'null')
  } else if (typeof rawType === 'string') {
    type = rawType
  }

  const out: Record<string, unknown> = {}
  if (type) out.type = type.toUpperCase()
  if (nullable) out.nullable = true
  if (typeof schema.description === 'string') out.description = schema.description
  if (Array.isArray(schema.enum)) out.enum = schema.enum

  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(([key, value]) => [
        key,
        toGeminiSchema(value),
      ]),
    )
    // Gemini honours declaration order; keeping it stable keeps outputs comparable.
    out.propertyOrdering = Object.keys(schema.properties as object)
  }
  if (schema.items && typeof schema.items === 'object') {
    out.items = toGeminiSchema(schema.items as Record<string, unknown>)
  }
  if (Array.isArray(schema.required)) out.required = schema.required

  return out
}

async function askGemini(request: JsonRequest): Promise<unknown | null> {
  const key = geminiKey()
  if (!key) return null

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    // The key goes in a header rather than the query string so it cannot end up in a
    // proxy or server access log.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: withTimeout(),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(request.schema),
        temperature: 0.2, // extraction, not creative writing
        maxOutputTokens: 2048,
      },
    }),
  })

  if (!response.ok) {
    console.warn(`[pact] gemini responded ${response.status}; using built-in reader`)
    return null
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  if (!text.trim()) return null

  try {
    return JSON.parse(text)
  } catch {
    console.warn('[pact] gemini returned unparseable JSON; using built-in reader')
    return null
  }
}

// --- Anthropic -----------------------------------------------------------------------

async function askAnthropic(request: JsonRequest): Promise<unknown | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    signal: withTimeout(),
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 2048,
      system: request.system,
      // A forced tool call is how we get JSON rather than prose.
      tools: [{ name: request.toolName, description: request.toolDescription, input_schema: request.schema }],
      tool_choice: { type: 'tool', name: request.toolName },
      messages: [{ role: 'user', content: request.prompt }],
    }),
  })

  if (!response.ok) {
    console.warn(`[pact] anthropic responded ${response.status}; using built-in reader`)
    return null
  }

  const payload = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> }
  return payload.content?.find((block) => block.type === 'tool_use')?.input ?? null
}

/**
 * Ask the configured model for one JSON object.
 *
 * Returns `null` for every failure mode — no key, a timeout, a rate limit, a non-200, an
 * unparseable body. The caller treats `null` as "use the deterministic reader", so the
 * Pact Builder always produces something and never shows the user an AI outage.
 */
export async function askForJson(request: JsonRequest): Promise<unknown | null> {
  const backend = activeBackend()
  if (backend === 'none') return null

  try {
    return backend === 'gemini' ? await askGemini(request) : await askAnthropic(request)
  } catch (cause) {
    console.warn('[pact] model call failed; using built-in reader', cause)
    return null
  }
}
