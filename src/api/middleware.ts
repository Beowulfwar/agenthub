/**
 * API middleware — error handler mapping AhubError hierarchy to HTTP status codes.
 */

import type { ErrorHandler } from 'hono';
import {
  AhubError,
  SkillNotFoundError,
  SkillValidationError,
  ProviderNotConfiguredError,
  AuthenticationError,
  WorkspaceNotFoundError,
  WorkspaceSkillReferenceError,
} from '../core/errors.js';

export interface ApiError {
  code: string;
  message: string;
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof SkillNotFoundError) {
    return c.json({ error: { code: 'SKILL_NOT_FOUND', message: err.message } }, 404);
  }
  if (err instanceof WorkspaceNotFoundError) {
    return c.json({ error: { code: 'WORKSPACE_NOT_FOUND', message: err.message } }, 404);
  }
  if (err instanceof WorkspaceSkillReferenceError) {
    return c.json(
      { error: { code: 'WORKSPACE_SKILLS_NOT_FOUND', message: err.message } },
      400,
    );
  }
  if (err instanceof SkillValidationError) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
  }
  if (err instanceof ProviderNotConfiguredError) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: err.message } }, 503);
  }
  if (err instanceof AuthenticationError) {
    return c.json({ error: { code: 'AUTH_ERROR', message: err.message } }, 401);
  }
  if (err instanceof AhubError) {
    return c.json({ error: { code: 'AHUB_ERROR', message: err.message } }, 500);
  }

  // Unknown errors.
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
};
