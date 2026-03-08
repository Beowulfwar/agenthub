import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

import { SecretStoreError } from '../errors.js';

const execFileAsync = promisify(execFile);

export const KEYCHAIN_SERVICE = 'agent-hub';

export function githubTokenAccountKey(accountId: string): string {
  return `github:${accountId}`;
}

async function execWithInput(
  command: string,
  args: string[],
  input?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function normalizeMissingSecretError(err: unknown, platform: NodeJS.Platform): null | SecretStoreError {
  if (!(err instanceof Error)) {
    return new SecretStoreError(`Unexpected ${platform} keychain error.`);
  }

  const message = err.message.toLowerCase();
  if (
    message.includes('could not be found') ||
    message.includes('item not found') ||
    message.includes('element not found') ||
    message.includes('cannot find') ||
    message.includes('the system cannot find') ||
    message.includes('secret not found') ||
    message.includes('exit code: 1')
  ) {
    return null;
  }

  if (message.includes('enoent')) {
    return new SecretStoreError(`Secure credential store is not available on ${platform}.`);
  }

  return new SecretStoreError(err.message);
}

async function getSecretMac(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
    ]);
    return stdout.trim();
  } catch (err) {
    const normalized = normalizeMissingSecretError(err, 'darwin');
    if (normalized === null) return null;
    throw normalized;
  }
}

async function setSecretMac(service: string, account: string, secret: string): Promise<void> {
  try {
    await execFileAsync('security', [
      'add-generic-password',
      '-U',
      '-s',
      service,
      '-a',
      account,
      '-w',
      secret,
    ]);
  } catch (err) {
    throw normalizeMissingSecretError(err, 'darwin') ?? new SecretStoreError('Failed to save secret.');
  }
}

async function deleteSecretMac(service: string, account: string): Promise<void> {
  try {
    await execFileAsync('security', [
      'delete-generic-password',
      '-s',
      service,
      '-a',
      account,
    ]);
  } catch (err) {
    const normalized = normalizeMissingSecretError(err, 'darwin');
    if (normalized === null) return;
    throw normalized;
  }
}

function windowsCommand(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', script];
}

async function getSecretWindows(service: string, account: string): Promise<string | null> {
  const script = [
    '[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null',
    '$vault = New-Object Windows.Security.Credentials.PasswordVault',
    `try { $cred = $vault.Retrieve('${service.replace(/'/g, "''")}', '${account.replace(/'/g, "''")}'); $cred.RetrievePassword(); Write-Output $cred.Password } catch { exit 1 }`,
  ].join('; ');

  try {
    const { stdout } = await execFileAsync('powershell.exe', windowsCommand(script));
    return stdout.trim() || null;
  } catch (err) {
    const normalized = normalizeMissingSecretError(err, 'win32');
    if (normalized === null) return null;
    throw normalized;
  }
}

async function setSecretWindows(service: string, account: string, secret: string): Promise<void> {
  const escService = service.replace(/'/g, "''");
  const escAccount = account.replace(/'/g, "''");
  const escSecret = secret.replace(/'/g, "''");
  const script = [
    '[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null',
    '$vault = New-Object Windows.Security.Credentials.PasswordVault',
    `try { $existing = $vault.Retrieve('${escService}', '${escAccount}'); $vault.Remove($existing) } catch { }`,
    `$cred = New-Object Windows.Security.Credentials.PasswordCredential('${escService}', '${escAccount}', '${escSecret}')`,
    '$vault.Add($cred)',
  ].join('; ');

  try {
    await execFileAsync('powershell.exe', windowsCommand(script));
  } catch (err) {
    throw normalizeMissingSecretError(err, 'win32') ?? new SecretStoreError('Failed to save secret.');
  }
}

async function deleteSecretWindows(service: string, account: string): Promise<void> {
  const escService = service.replace(/'/g, "''");
  const escAccount = account.replace(/'/g, "''");
  const script = [
    '[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null',
    '$vault = New-Object Windows.Security.Credentials.PasswordVault',
    `try { $cred = $vault.Retrieve('${escService}', '${escAccount}'); $vault.Remove($cred) } catch { exit 0 }`,
  ].join('; ');

  try {
    await execFileAsync('powershell.exe', windowsCommand(script));
  } catch (err) {
    const normalized = normalizeMissingSecretError(err, 'win32');
    if (normalized === null) return;
    throw normalized;
  }
}

async function getSecretLinux(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('secret-tool', [
      'lookup',
      'service',
      service,
      'account',
      account,
    ]);
    return stdout.trim() || null;
  } catch (err) {
    const normalized = normalizeMissingSecretError(err, 'linux');
    if (normalized === null) return null;
    throw normalized;
  }
}

async function setSecretLinux(service: string, account: string, secret: string): Promise<void> {
  const result = await execWithInput(
    'secret-tool',
    ['store', '--label=agent-hub GitHub token', 'service', service, 'account', account],
    `${secret}\n`,
  ).catch((err: unknown) => {
    throw normalizeMissingSecretError(err, 'linux') ?? new SecretStoreError('Failed to save secret.');
  });

  if (result.code !== 0) {
    throw new SecretStoreError(result.stderr.trim() || 'Failed to save secret in Linux keychain.');
  }
}

async function deleteSecretLinux(service: string, account: string): Promise<void> {
  const result = await execWithInput('secret-tool', [
    'clear',
    'service',
    service,
    'account',
    account,
  ]).catch((err: unknown) => {
    throw normalizeMissingSecretError(err, 'linux') ?? new SecretStoreError('Failed to delete secret.');
  });

  if (result.code !== 0) {
    throw new SecretStoreError(result.stderr.trim() || 'Failed to delete secret from Linux keychain.');
  }
}

export async function getSecret(service: string, account: string): Promise<string | null> {
  switch (os.platform()) {
    case 'darwin':
      return getSecretMac(service, account);
    case 'win32':
      return getSecretWindows(service, account);
    case 'linux':
      return getSecretLinux(service, account);
    default:
      throw new SecretStoreError(`Unsupported platform for secure token storage: ${os.platform()}`);
  }
}

export async function setSecret(service: string, account: string, secret: string): Promise<void> {
  switch (os.platform()) {
    case 'darwin':
      return setSecretMac(service, account, secret);
    case 'win32':
      return setSecretWindows(service, account, secret);
    case 'linux':
      return setSecretLinux(service, account, secret);
    default:
      throw new SecretStoreError(`Unsupported platform for secure token storage: ${os.platform()}`);
  }
}

export async function deleteSecret(service: string, account: string): Promise<void> {
  switch (os.platform()) {
    case 'darwin':
      return deleteSecretMac(service, account);
    case 'win32':
      return deleteSecretWindows(service, account);
    case 'linux':
      return deleteSecretLinux(service, account);
    default:
      throw new SecretStoreError(`Unsupported platform for secure token storage: ${os.platform()}`);
  }
}
