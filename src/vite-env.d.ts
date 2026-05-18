/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMS_BASE_URL: string;
  readonly VITE_IMS_CLIENT_ID: string;
  readonly VITE_IMS_SCOPES: string;
  readonly VITE_EVO_DISCOVERY_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
