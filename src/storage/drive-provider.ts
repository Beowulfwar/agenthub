/**
 * DriveProvider — StorageProvider backed by Google Drive.
 *
 * Skills are stored as folders inside a designated Google Drive parent
 * folder.  Each skill folder mirrors the local skill directory layout.
 *
 * The `googleapis` package is imported **lazily** (dynamic import) so
 * that users who only use the Git provider never pay the load cost.
 *
 * OAuth2 token is persisted at `~/.ahub/drive-token.json`.
 */

import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { Readable } from 'node:stream';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { URL } from 'node:url';

import type {
  DriveConfig,
  HealthCheckResult,
  SkillFile,
  SkillPackage,
} from '../core/types.js';
import {
  AhubError,
  AuthenticationError,
  SkillNotFoundError,
} from '../core/errors.js';
import { parseSkill } from '../core/skill.js';
import type { StorageProvider } from './provider.js';

// ---------------------------------------------------------------------------
// Types for the googleapis SDK (kept narrow to avoid top-level import)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type DriveV3 = any;
type OAuth2Client = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_PATH = path.join(os.homedir(), '.ahub', 'drive-token.json');

// TODO: Replace with real OAuth2 credentials registered in GCP Console.
const DEFAULT_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const DEFAULT_CLIENT_SECRET = 'YOUR_CLIENT_SECRET';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ---------------------------------------------------------------------------
// DriveProvider
// ---------------------------------------------------------------------------

export class DriveProvider implements StorageProvider {
  readonly name = 'drive' as const;

  /** May be a real Drive folder ID or a folder name (auto-resolved). */
  private resolvedFolderId: string | null = null;
  private readonly configFolderId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private drive: DriveV3 | null = null;
  private auth: OAuth2Client | null = null;

  constructor(config: DriveConfig) {
    this.configFolderId = config.folderId;
    this.clientId = DEFAULT_CLIENT_ID;
    this.clientSecret = DEFAULT_CLIENT_SECRET;
  }

  /**
   * Resolve the folder ID.  If the config value looks like a name
   * (no uppercase hex chars), search My Drive root for a matching folder
   * and create one if it doesn't exist yet.
   */
  private async ensureFolderId(): Promise<string> {
    if (this.resolvedFolderId) return this.resolvedFolderId;

    const id = this.configFolderId;

    // Real Drive IDs are long alphanumeric strings.  Simple names like
    // "ahub-skills" are clearly not IDs.
    const looksLikeId = /^[A-Za-z0-9_-]{20,}$/.test(id);

    if (looksLikeId) {
      this.resolvedFolderId = id;
      return id;
    }

    // It's a folder name — find or create it in My Drive root.
    const drive = await this.ensureClient();
    const q = `name='${id}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`;

    const res = await drive.files.list({
      q,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const files = res.data.files ?? [];
    if (files.length > 0) {
      this.resolvedFolderId = files[0].id as string;
      console.log(`  Using existing Drive folder "${id}" (${this.resolvedFolderId})`);
      return this.resolvedFolderId;
    }

    // Create the folder.
    const created = await drive.files.create({
      requestBody: {
        name: id,
        mimeType: FOLDER_MIME,
      },
      fields: 'id',
    });

    this.resolvedFolderId = created.data.id as string;
    console.log(`  Created Drive folder "${id}" (${this.resolvedFolderId})`);
    return this.resolvedFolderId;
  }

  // ── lazy SDK initialisation ────────────────────────────────────────────

  /**
   * Lazily import `googleapis` and build an authenticated Drive client.
   */
  private async ensureClient(): Promise<DriveV3> {
    if (this.drive) return this.drive;

    const { google } = await import('googleapis');

    const oauth2 = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      REDIRECT_URI,
    );

    this.auth = oauth2;

    // Try loading a persisted token first.
    const tokenLoaded = await this.loadToken(oauth2);
    if (!tokenLoaded) {
      await this.authenticate(oauth2);
    }

    this.drive = google.drive({ version: 'v3', auth: oauth2 });
    return this.drive;
  }

  // ── OAuth2 flow ────────────────────────────────────────────────────────

  /**
   * Attempt to read a saved token from disk and set credentials.
   */
  private async loadToken(oauth2: OAuth2Client): Promise<boolean> {
    try {
      const raw = await readFile(TOKEN_PATH, 'utf-8');
      const tokens = JSON.parse(raw);
      oauth2.setCredentials(tokens);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a full OAuth2 authorization-code flow:
   *
   *   1. Generate the consent URL and print it to stdout.
   *   2. Start a tiny HTTP server on port 3000.
   *   3. Wait for Google to redirect back with the `code` param.
   *   4. Exchange the code for tokens and persist them.
   */
  private async authenticate(oauth2: OAuth2Client): Promise<void> {
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('\n  Authorize agent-hub by visiting this URL:\n');
    console.log(`  ${authUrl}\n`);

    const code = await this.waitForOAuthCode();

    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    await mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  }

  /**
   * Start a one-shot HTTP server and return the authorization code
   * that Google redirects to `http://localhost:3000/oauth2callback?code=...`.
   */
  private waitForOAuthCode(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);

          if (url.pathname !== '/oauth2callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400);
            res.end(`Authorization error: ${error}`);
            server.close();
            reject(new AuthenticationError(`OAuth2 authorization denied: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400);
            res.end('Missing authorization code.');
            server.close();
            reject(new AuthenticationError('OAuth2 callback did not include a code.'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body><h2>Authorization successful!</h2>' +
              '<p>You can close this window and return to the terminal.</p></body></html>',
          );

          server.close();
          resolve(code);
        } catch (err) {
          server.close();
          reject(err);
        }
      });

      server.listen(REDIRECT_PORT, () => {
        console.log(`  Waiting for OAuth2 redirect on http://localhost:${REDIRECT_PORT} ...\n`);
      });

      // Timeout after 5 minutes.
      const timeout = setTimeout(() => {
        server.close();
        reject(new AuthenticationError('OAuth2 flow timed out after 5 minutes.'));
      }, 5 * 60 * 1000);

      server.on('close', () => clearTimeout(timeout));
    });
  }

  // ── Drive helper methods ───────────────────────────────────────────────

  /**
   * Find a folder by name under `parentId`. Returns the folder ID or `null`.
   */
  private async findFolder(
    name: string,
    parentId: string,
  ): Promise<string | null> {
    const drive = await this.ensureClient();
    const q = `'${parentId}' in parents and name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false`;

    const res = await drive.files.list({
      q,
      fields: 'files(id, name)',
      pageSize: 1,
    });

    const files = res.data.files ?? [];
    return files.length > 0 ? files[0].id : null;
  }

  /**
   * Create a folder inside `parentId` and return its ID.
   */
  private async createFolder(
    name: string,
    parentId: string,
  ): Promise<string> {
    const drive = await this.ensureClient();
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      },
      fields: 'id',
    });

    return res.data.id as string;
  }

  /**
   * Upload (or update) a file inside `parentId`.
   */
  private async uploadFile(
    name: string,
    content: string | Buffer,
    parentId: string,
    mimeType = 'text/plain',
  ): Promise<void> {
    const drive = await this.ensureClient();

    // Check if file already exists.
    const q = `'${parentId}' in parents and name='${name}' and trashed=false`;
    const existing = await drive.files.list({
      q,
      fields: 'files(id)',
      pageSize: 1,
    });

    const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const media = { mimeType, body: bufferToReadable(body) };

    const files = existing.data.files ?? [];
    if (files.length > 0) {
      // Update existing file.
      await drive.files.update({
        fileId: files[0].id,
        media,
      });
    } else {
      // Create new file.
      await drive.files.create({
        requestBody: {
          name,
          parents: [parentId],
        },
        media,
        fields: 'id',
      });
    }
  }

  /**
   * Download a file's UTF-8 content by ID.
   */
  private async downloadFile(fileId: string): Promise<string> {
    const drive = await this.ensureClient();

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' },
    );

    return res.data as string;
  }

  /**
   * Recursively list every file inside a Drive folder, building relative paths.
   */
  private async listFilesRecursive(
    folderId: string,
    basePath = '',
  ): Promise<SkillFile[]> {
    const drive = await this.ensureClient();
    const results: SkillFile[] = [];

    let pageToken: string | undefined;

    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 100,
        pageToken,
      });

      const files = res.data.files ?? [];
      pageToken = res.data.nextPageToken ?? undefined;

      for (const file of files) {
        const relativePath = basePath ? `${basePath}/${file.name}` : file.name;

        if (file.mimeType === FOLDER_MIME) {
          const nested = await this.listFilesRecursive(file.id, relativePath);
          results.push(...nested);
        } else {
          const content = await this.downloadFile(file.id);
          results.push({ relativePath, content });
        }
      }
    } while (pageToken);

    return results;
  }

  // ── StorageProvider implementation ─────────────────────────────────────

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const drive = await this.ensureClient();
      await drive.about.get({ fields: 'user' });
      return { ok: true, message: 'Google Drive connection successful.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Drive health check failed: ${msg}` };
    }
  }

  async list(query?: string): Promise<string[]> {
    const drive = await this.ensureClient();
    const parentId = await this.ensureFolderId();

    const q =
      `'${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;

    const names: string[] = [];
    let pageToken: string | undefined;

    do {
      const res = await drive.files.list({
        q,
        fields: 'nextPageToken, files(name)',
        pageSize: 200,
        pageToken,
      });

      for (const file of res.data.files ?? []) {
        names.push(file.name as string);
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    const sorted = names.sort();

    if (query) {
      const lower = query.toLowerCase();
      return sorted.filter((n) => n.toLowerCase().includes(lower));
    }

    return sorted;
  }

  async exists(name: string): Promise<boolean> {
    const parentId = await this.ensureFolderId();
    const id = await this.findFolder(name, parentId);
    return id !== null;
  }

  async get(name: string): Promise<SkillPackage> {
    const parentId = await this.ensureFolderId();
    const folderId = await this.findFolder(name, parentId);
    if (!folderId) {
      throw new SkillNotFoundError(name);
    }

    const files = await this.listFilesRecursive(folderId);

    // Find SKILL.md to extract metadata.
    const skillMdFile = files.find(
      (f) => f.relativePath === 'SKILL.md',
    );

    if (!skillMdFile) {
      throw new SkillNotFoundError(name);
    }

    const skill = parseSkill(skillMdFile.content as string);
    // Use folder name as skill name if frontmatter name is empty.
    if (!skill.name) {
      skill.name = name;
    }

    return { skill, files };
  }

  async put(pkg: SkillPackage): Promise<void> {
    const skillName = pkg.skill.name;
    const parentId = await this.ensureFolderId();

    // Find or create the skill folder.
    let skillFolderId = await this.findFolder(skillName, parentId);
    if (!skillFolderId) {
      skillFolderId = await this.createFolder(skillName, parentId);
    }

    // Upload every file, creating sub-folders as needed.
    for (const file of pkg.files) {
      const parts = file.relativePath.split('/');
      let currentParent = skillFolderId;

      // Create intermediate directories.
      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i];
        let existing = await this.findFolder(dirName, currentParent);
        if (!existing) {
          existing = await this.createFolder(dirName, currentParent);
        }
        currentParent = existing;
      }

      const fileName = parts.at(-1)!;
      const mimeType = fileName.endsWith('.yaml') || fileName.endsWith('.yml')
        ? 'text/yaml'
        : fileName.endsWith('.json')
          ? 'application/json'
          : fileName.endsWith('.md')
            ? 'text/markdown'
            : 'text/plain';

      await this.uploadFile(fileName, file.content, currentParent, mimeType);
    }
  }

  async delete(name: string): Promise<void> {
    const parentId = await this.ensureFolderId();
    const folderId = await this.findFolder(name, parentId);
    if (!folderId) {
      throw new SkillNotFoundError(name);
    }

    const drive = await this.ensureClient();
    // Soft-delete (trash) rather than permanent deletion.
    await drive.files.update({
      fileId: folderId,
      requestBody: { trashed: true },
    });
  }

  async *exportAll(): AsyncIterable<SkillPackage> {
    const names = await this.list();
    for (const name of names) {
      yield await this.get(name);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Convert a Buffer to a Readable stream that the googleapis media
 * upload accepts.
 */
function bufferToReadable(buf: Buffer): Readable {
  const stream = new Readable();
  stream.push(buf);
  stream.push(null);
  return stream;
}
