import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError, ErrorCode } from '@phonemail/shared';

/**
 * An expected failure with a stable code the UIs can translate.
 * Throw it from any route or service: `throw new AppError(409, 'ALREADY_REGISTERED', '…')`.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode | (string & {}),
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Turns every thrown error into the one error shape: { error: { code, message, details? } }. */
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(errorBody(error.code, error.message, error.details));
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    return reply
      .status(400)
      .send(errorBody('VALIDATION_FAILED', 'Some fields are invalid.', fastifyError.validation));
  }
  if (fastifyError.statusCode === 429) {
    return reply.status(429).send(errorBody('RATE_LIMITED', 'Too many requests. Try again soon.'));
  }
  if (fastifyError.statusCode && fastifyError.statusCode < 500) {
    return reply
      .status(fastifyError.statusCode)
      .send(errorBody('BAD_REQUEST', fastifyError.message));
  }

  // Unexpected: log the details, tell the client as little as possible.
  request.log.error({ err: error }, 'unhandled error');
  return reply.status(500).send(errorBody('INTERNAL', 'Something went wrong on our side.'));
}
