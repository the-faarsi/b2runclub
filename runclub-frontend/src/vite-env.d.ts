/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to point the app at a backend on another origin. Empty in dev (proxied). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
