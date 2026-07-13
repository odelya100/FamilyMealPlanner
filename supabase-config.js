// supabase-config.js
//
// Connect this site to your Supabase project:
//   1. Create a free project at https://supabase.com
//   2. Open the SQL Editor and run supabase-schema.sql (creates the
//      shopping_items table, indexes, RLS policies, and realtime publication)
//   3. Settings -> API -> copy the "Project URL" and the "anon public" key
//      (never the service_role key — that one must stay server-side only
//      and must never be committed to this repo)
//   4. Paste both values below, replacing the placeholder strings.

// >>> PASTE YOUR SUPABASE PROJECT URL HERE <<<
const SUPABASE_URL = 'https://bzrthzqowgtgfzomweje.supabase.co';

// >>> PASTE YOUR SUPABASE ANON PUBLIC KEY HERE <<<
const SUPABASE_ANON_KEY = 'sb_publishable_i7NOuwHrKPLpRzt6T3bwqw_Fi5NbUpR';

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
