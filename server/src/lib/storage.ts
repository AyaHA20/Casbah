import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env.js'
import { HttpError } from './http-error.js'

const BUCKET = 'products'

let client: SupabaseClient | null = null
let bucketChecked = false

export function isStorageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
}

function storage(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(
      503,
      'STORAGE_NOT_CONFIGURED',
      "Le stockage d'images n'est pas configuré sur le serveur.",
    )
  }
  // The service-role key bypasses row-level security, so this client is
  // constructed here and never handed to a request handler directly.
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

/**
 * Idempotent: makes sure the bucket exists AND is public, so there is no manual
 * dashboard step.
 *
 * The public flag has to be checked on an existing bucket, not just set at
 * creation — a pre-existing private bucket serves product photos as
 * "Bucket not found" to customers, which looks like a broken image rather than
 * a permissions problem.
 */
async function ensureBucket(): Promise<void> {
  if (bucketChecked) return
  const s = storage()
  const { data } = await s.storage.getBucket(BUCKET)

  if (!data) {
    const { error } = await s.storage.createBucket(BUCKET, { public: true })
    // Ignore "already exists" — two requests can race here on a cold start.
    if (error && !/exists/i.test(error.message)) {
      throw new HttpError(502, 'STORAGE_BUCKET_FAILED', `Bucket « ${BUCKET} » indisponible : ${error.message}`)
    }
  } else if (!data.public) {
    const { error } = await s.storage.updateBucket(BUCKET, { public: true })
    if (error) {
      throw new HttpError(
        502,
        'STORAGE_BUCKET_PRIVATE',
        `Bucket « ${BUCKET} » est privé et n'a pas pu être rendu public : ${error.message}`,
      )
    }
    console.warn(`Storage: bucket "${BUCKET}" was private — switched to public so product photos can load.`)
  }

  bucketChecked = true
}

function safeName(filename: string): string {
  const ext = (filename.match(/\.[a-zA-Z0-9]{1,5}$/)?.[0] ?? '').toLowerCase()
  return `${randomUUID()}${ext}`
}

/**
 * Mints a short-lived upload URL. The browser PUTs the file straight to
 * Supabase with it, so image bytes never pass through this API and the
 * service-role key never leaves the server.
 */
export async function createSignedUpload(scope: number | string, filename: string) {
  await ensureBucket()
  // A number scopes to a product folder; a string (e.g. 'storefront') scopes to
  // a named folder, so hero images do not have to belong to a product.
  const folder = typeof scope === 'number' ? String(scope) : scope.replace(/[^a-z0-9-]/gi, '')
  const path = `${folder}/${safeName(filename)}`
  const { data, error } = await storage().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    throw new HttpError(502, 'STORAGE_SIGN_FAILED', `Impossible de préparer l'envoi : ${error?.message ?? 'inconnu'}`)
  }
  return { path, signedUrl: data.signedUrl, token: data.token }
}

export function publicUrl(path: string): string {
  return storage().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function removeObject(path: string): Promise<void> {
  const { error } = await storage().storage.from(BUCKET).remove([path])
  if (error) {
    throw new HttpError(502, 'STORAGE_DELETE_FAILED', `Suppression impossible : ${error.message}`)
  }
}

/** Public URL -> storage path, so a stored URL can be deleted from the bucket. */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}
