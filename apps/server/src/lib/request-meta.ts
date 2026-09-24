import type { FastifyRequest } from 'fastify';

/** Who made a request, for sessions and the audit trail. */
export interface RequestMeta {
  ip: string;
  userAgent?: string;
}

export function requestMeta(request: FastifyRequest): RequestMeta {
  return { ip: request.ip, userAgent: request.headers['user-agent']?.slice(0, 300) };
}
