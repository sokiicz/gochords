/**
 * Resolves Supabase credentials for build-time and one-shot scripts.
 *
 * Order of preference:
 *   1. process.env.SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (one-shot data writes)
 *   2. process.env.SUPABASE_URL + SUPABASE_ANON_KEY          (read-only build steps)
 *   3. process.env.VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (CI: same vars Vite uses)
 *   4. D:/ai/Apps/Secrets/gochords.txt                       (local dev)
 *
 * Returns `null` if no usable pair is found — callers should degrade gracefully
 * (homepage-only sitemap, etc.).
 */
import { existsSync, readFileSync } from 'node:fs';

const SECRETS_PATH = 'D:/ai/Apps/Secrets/gochords.txt';

export interface SupabaseCreds {
  url: string;
  key: string;
  /** True when `key` is a service-role key (allowed for writes). */
  serviceRole: boolean;
}

function readSecretsFile(): Record<string, string> {
  if (!existsSync(SECRETS_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(SECRETS_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function loadSupabaseCreds(opts: { requireServiceRole?: boolean } = {}): SupabaseCreds | null {
  const env = process.env;
  const file = readSecretsFile();

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || file.SUPABASE_URL;
  if (!url) return null;

  const service = env.SUPABASE_SERVICE_ROLE_KEY || file.SUPABASE_SERVICE_ROLE_KEY;
  if (service) return { url, key: service, serviceRole: true };

  if (opts.requireServiceRole) return null;

  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || file.SUPABASE_ANON_KEY;
  if (anon) return { url, key: anon, serviceRole: false };

  return null;
}
