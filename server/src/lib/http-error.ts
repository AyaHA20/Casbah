/**
 * An error carrying the HTTP status it should produce, so services can fail
 * with intent and the error handler stays a dumb translator.
 *
 * `message` is customer-facing and therefore French. `code` is for the
 * frontend to branch on; `details` carries machine-readable specifics such as
 * which SKUs ran out.
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details: unknown = undefined) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details)

export const notFound = (message: string) => new HttpError(404, 'NOT_FOUND', message)

export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details)
