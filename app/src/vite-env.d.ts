/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_SYNC_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
