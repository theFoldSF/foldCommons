/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the fold-commons-backend Cloudflare Worker (see backend/).
  // Covers both the photo library and the community gallery. Unset in
  // dev/most deploys — the app falls back to the bundled
  // photos/manifest.json and localStorage-only gallery when this is absent.
  readonly VITE_FOLD_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
