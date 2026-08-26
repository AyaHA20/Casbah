/// <reference types="vite/client" />

/**
 * Typed env, so a typo in a VITE_ name is a compile error rather than an
 * `undefined` that silently falls back at runtime.
 */
interface ImportMetaEnv {
  /** API origin. With or without the trailing /api — both are handled. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
