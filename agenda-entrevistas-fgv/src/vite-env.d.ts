/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPS_SCRIPT_URL?: string;
  readonly VITE_COORD_PASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
