import { NextResponse } from 'next/server'
import { extractPact } from '@/lib/ai/client'
import { authed, body, ok } from '@/lib/api/handler'
import { aiExtractSchema } from '@/lib/api/schema'

export const dynamic = 'force-dynamic'

/**
 * The Pact Builder's hero call: free text in, structured draft out.
 *
 * Nothing here is persisted. The response is a *proposal* the user reviews and edits on
 * the next screen; only their submission creates a pact. That is what keeps a confident
 * but wrong extraction from becoming a wrong agreement.
 *
 * `source` tells the client whether this came from the model or the built-in reader, so
 * the UI can label it accurately instead of implying an AI wrote it either way.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return authed(async () => {
    const input = await body(request, aiExtractSchema)
    const result = await extractPact({
      description: input.description,
      creatorName: input.creatorName,
      today: new Date().toISOString().slice(0, 10),
    })
    return ok({ extraction: result.data, source: result.source })
  })
}
