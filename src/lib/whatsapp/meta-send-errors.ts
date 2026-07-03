/** Turn Meta API error payloads into actionable inbox toasts. */
export function formatMetaApiError(raw: string): string {
  const parts = [raw]

  if (raw.includes('131049') || raw.includes('131048')) {
    parts.push(
      'Marketing templates need customer opt-in. Use a Utility template for general replies, or only message people who opted in.',
    )
  } else if (raw.includes('132001')) {
    parts.push(
      'Template name or language mismatch. Run Sync from Meta and confirm language matches exactly (e.g. en_US).',
    )
  } else if (raw.includes('131008')) {
    parts.push('Fill every template variable in the picker before sending.')
  } else if (raw.includes('131026') || /not in allowed/i.test(raw)) {
    parts.push(
      'This number may be blocked in Meta dev mode — add it as a test recipient in Meta API Setup.',
    )
  } else if (/payment button/i.test(raw)) {
    parts.push('Use a template with URL or Quick Reply buttons instead.')
  }

  return parts.join(' ')
}

interface MetaErrorBody {
  error?: {
    message?: string
    code?: number
    error_user_msg?: string
    error_data?: { details?: string }
  }
}

/** Extract the richest error string from a Meta Graph API JSON body. */
export function metaErrorFromBody(data: MetaErrorBody, fallback: string): string {
  const err = data.error
  if (!err) return fallback

  const chunks: string[] = []
  if (err.message) chunks.push(err.message)
  if (err.error_data?.details && !err.message?.includes(err.error_data.details)) {
    chunks.push(err.error_data.details)
  }
  if (
    err.error_user_msg &&
    err.error_user_msg !== err.message &&
    !chunks.some((c) => c.includes(err.error_user_msg!))
  ) {
    chunks.push(err.error_user_msg)
  }

  return chunks.length > 0 ? chunks.join(' — ') : fallback
}
