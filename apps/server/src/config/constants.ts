/** Shown in the UIs and the health check. */
export const APP_VERSION = '0.1.0';

/** Version of the Terms of Service users accept at sign-up. Bump when /terms changes. */
export const TOS_VERSION = '2026-09-25';

/** The worker touches this file regularly; its Docker healthcheck reads the age. */
export const WORKER_HEARTBEAT_FILE = '/tmp/phonemail-worker-heartbeat';
