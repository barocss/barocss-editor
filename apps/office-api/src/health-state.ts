/** Liveness and readiness are intentionally distinct until service setup is complete. */
export const healthState = {
  live: { httpStatus: 200, status: 'alive' },
  ready: { httpStatus: 503, status: 'service_not_configured' },
} as const;
