export * from './languages.js';
export * from './config.js';
export * from './errors.js';

/** Header every state-changing request must carry (simple CSRF defence). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'phonemail';
