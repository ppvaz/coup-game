import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('SEU-PROJETO'));

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      realtime: {
        heartbeatIntervalMs: 15000,
        reconnectAfterMs: (attempt) => Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
      },
    })
  : null;
