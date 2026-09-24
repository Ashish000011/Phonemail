export * from './languages.js';
export * from './config.js';
export * from './errors.js';
export * from './auth.js';
export * from './demo.js';
export * from './address.js';
export * from './mail.js';

/** Header every state-changing request must carry (simple CSRF defence). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'phonemail';
