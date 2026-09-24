/** BullMQ queue names, one per kind of background work. */
export const QUEUES = {
  /** Housekeeping: trash purge, cleanup of unsent uploads. */
  maintenance: 'maintenance',
} as const;
