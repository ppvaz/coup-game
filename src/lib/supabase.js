import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

function isProjectUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith('.supabase.co') || hostname === 'localhost';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(publishableKey && isProjectUrl(url));
export const supabaseConfigError =
  url && !isProjectUrl(url)
    ? 'Use a Project URL do Supabase (https://SEU-PROJETO.supabase.co), não a URL do dashboard.'
    : null;

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      realtime: {
        heartbeatIntervalMs: 15000,
        reconnectAfterMs: (attempt) => Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
      },
    })
  : null;
