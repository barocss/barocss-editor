/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OFFICE_AUTH_MODE?: string;
  readonly VITE_OFFICE_OIDC_ISSUER?: string;
  readonly VITE_OFFICE_OIDC_CLIENT_ID?: string;
}
