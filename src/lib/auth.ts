// Admin authentication — shared-token model.
//
// Two ways to authenticate as admin:
//   1. Browser: POST /api/admin-login with the token → an opaque session id is
//      stored in the SESSION KV namespace and set as an HttpOnly cookie. The
//      token itself never persists in the browser.
//   2. Programmatic (curl, the MCP ingest trigger, scripts): send
//      `Authorization: Bearer <ADMIN_TOKEN>` directly.
//
// Fails closed: if ADMIN_TOKEN is not configured on the server, nobody is admin.

import { env as cfEnv } from 'cloudflare:workers';

const COOKIE = 'got_admin';
const SESSION_TTL = 60 * 60 * 12; // 12 hours
const KV_PREFIX = 'admin:';

function getEnv(): Record<string, any> {
  return cfEnv as unknown as Record<string, any>;
}

function getAdminToken(): string | null {
  const env = getEnv();
  return (
    (env.ADMIN_TOKEN as string | undefined)?.trim() ||
    process.env.ADMIN_TOKEN?.trim() ||
    null
  );
}

export function adminTokenConfigured(): boolean {
  return getAdminToken() !== null;
}

// Length-independent constant-time-ish compare.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// Validate a raw token string against the configured admin token.
export function validateToken(provided: string): boolean {
  const token = getAdminToken();
  if (!token) return false;
  return timingSafeEqual(provided.trim(), token);
}

function bearerIsValid(request: Request): boolean {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  return validateToken(auth.slice(7));
}

// Is this request authenticated as admin? Bearer token OR a valid session cookie.
export async function isAdmin(request: Request): Promise<boolean> {
  if (!adminTokenConfigured()) return false; // fail closed
  if (bearerIsValid(request)) return true;

  const sid = readCookie(request, COOKIE);
  if (!sid) return false;
  const env = getEnv();
  if (!env.SESSION) return false;
  const hit = await env.SESSION.get(`${KV_PREFIX}${sid}`);
  return !!hit;
}

// Route guard. Returns a 401 Response when not admin, otherwise null.
export async function requireAdmin(request: Request): Promise<Response | null> {
  if (await isAdmin(request)) return null;
  return new Response(JSON.stringify({ error: 'Admin authentication required.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Mint a session and store it in KV. Returns the session id.
export async function createSession(): Promise<string> {
  const env = getEnv();
  const sid =
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  if (env.SESSION) {
    await env.SESSION.put(`${KV_PREFIX}${sid}`, '1', { expirationTtl: SESSION_TTL });
  }
  return sid;
}

export async function destroySession(request: Request): Promise<void> {
  const env = getEnv();
  const sid = readCookie(request, COOKIE);
  if (sid && env.SESSION) await env.SESSION.delete(`${KV_PREFIX}${sid}`);
}

export function sessionCookie(sid: string): string {
  return `${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
