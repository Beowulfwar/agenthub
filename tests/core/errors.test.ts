import { describe, it, expect } from 'vitest';
import {
  AhubError,
  ProviderNotConfiguredError,
  SkillNotFoundError,
  SkillValidationError,
  AuthenticationError,
  SecretStoreError,
  ConflictError,
  MigrationError,
} from '../../src/core/errors.js';

describe('Error hierarchy', () => {
  describe('AhubError', () => {
    it('is an instance of Error', () => {
      const err = new AhubError('base error');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name "AhubError"', () => {
      const err = new AhubError('something went wrong');
      expect(err.name).toBe('AhubError');
    });

    it('stores the message correctly', () => {
      const err = new AhubError('test message');
      expect(err.message).toBe('test message');
    });

    it('supports an optional cause via ErrorOptions', () => {
      const cause = new Error('root cause');
      const err = new AhubError('wrapper', { cause });
      expect(err.cause).toBe(cause);
    });
  });

  describe('SkillNotFoundError', () => {
    it('is an instance of AhubError', () => {
      const err = new SkillNotFoundError('my-skill');
      expect(err).toBeInstanceOf(AhubError);
    });

    it('is an instance of Error', () => {
      const err = new SkillNotFoundError('my-skill');
      expect(err).toBeInstanceOf(Error);
    });

    it('stores skillName property', () => {
      const err = new SkillNotFoundError('deploy-helper');
      expect(err.skillName).toBe('deploy-helper');
    });

    it('includes skill name in message', () => {
      const err = new SkillNotFoundError('missing-skill');
      expect(err.message).toContain('missing-skill');
    });

    it('has name "SkillNotFoundError"', () => {
      const err = new SkillNotFoundError('x');
      expect(err.name).toBe('SkillNotFoundError');
    });
  });

  describe('SkillValidationError', () => {
    it('is an instance of AhubError', () => {
      const err = new SkillValidationError(['violation 1']);
      expect(err).toBeInstanceOf(AhubError);
    });

    it('stores violations array', () => {
      const violations = ['name is required', 'description is required'];
      const err = new SkillValidationError(violations);
      expect(err.violations).toEqual(violations);
    });

    it('includes violations in the message', () => {
      const err = new SkillValidationError(['field missing']);
      expect(err.message).toContain('field missing');
    });

    it('has name "SkillValidationError"', () => {
      const err = new SkillValidationError([]);
      expect(err.name).toBe('SkillValidationError');
    });
  });

  describe('ProviderNotConfiguredError', () => {
    it('is an instance of AhubError', () => {
      const err = new ProviderNotConfiguredError('git');
      expect(err).toBeInstanceOf(AhubError);
    });

    it('stores provider property', () => {
      const err = new ProviderNotConfiguredError('drive');
      expect(err.provider).toBe('drive');
    });

    it('includes provider name in message', () => {
      const err = new ProviderNotConfiguredError('git');
      expect(err.message).toContain('git');
    });

    it('has name "ProviderNotConfiguredError"', () => {
      const err = new ProviderNotConfiguredError('git');
      expect(err.name).toBe('ProviderNotConfiguredError');
    });
  });

  describe('AuthenticationError', () => {
    it('is an instance of AhubError', () => {
      const err = new AuthenticationError('bad token');
      expect(err).toBeInstanceOf(AhubError);
    });

    it('has name "AuthenticationError"', () => {
      const err = new AuthenticationError('expired');
      expect(err.name).toBe('AuthenticationError');
    });

    it('stores the message', () => {
      const err = new AuthenticationError('credentials expired');
      expect(err.message).toBe('credentials expired');
    });
  });

  describe('SecretStoreError', () => {
    it('is an instance of AhubError', () => {
      const err = new SecretStoreError('keychain unavailable');
      expect(err).toBeInstanceOf(AhubError);
    });

    it('has name "SecretStoreError"', () => {
      const err = new SecretStoreError('boom');
      expect(err.name).toBe('SecretStoreError');
    });
  });

  describe('ConflictError', () => {
    it('is an instance of AhubError', () => {
      const err = new ConflictError('remote file changed');
      expect(err).toBeInstanceOf(AhubError);
    });

    it('has name "ConflictError"', () => {
      const err = new ConflictError('remote file changed');
      expect(err.name).toBe('ConflictError');
    });
  });

  describe('MigrationError', () => {
    it('is an instance of AhubError', () => {
      const err = new MigrationError('v2-config', 'schema mismatch');
      expect(err).toBeInstanceOf(AhubError);
    });

    it('stores migrationName property', () => {
      const err = new MigrationError('v3-upgrade', 'failed');
      expect(err.migrationName).toBe('v3-upgrade');
    });

    it('includes migration name in message', () => {
      const err = new MigrationError('cache-v2', 'index corrupt');
      expect(err.message).toContain('cache-v2');
    });

    it('includes failure reason in message', () => {
      const err = new MigrationError('cache-v2', 'index corrupt');
      expect(err.message).toContain('index corrupt');
    });

    it('has name "MigrationError"', () => {
      const err = new MigrationError('x', 'y');
      expect(err.name).toBe('MigrationError');
    });
  });
});
