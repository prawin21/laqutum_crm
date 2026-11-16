/**
 * supabase-config.js — Supabase connection for LaquTum
 * 
 * ⚠️ REPLACE the URL and KEY below with your actual Supabase project values.
 *    Find them at: https://supabase.com/dashboard -> Project Settings -> API
 */
const SUPABASE_URL = 'https://vsynumwowwpnacjmqqmu.supabase.co';   // ← Replace with your Project URL
const SUPABASE_ANON_KEY = 'sb_publishable_6KscqSmHnnlLxbAI1NApBg_UhdYu1-5';               // ← Replace with your anon/public key

// Optional: Paste your Supabase Secret / service_role key here to enable direct 1-click auth user sync
const SUPABASE_SERVICE_ROLE_KEY = '';

// The app will download content-bank.json from this URL.
// To update content without a new APK, just upload a new content-bank.json to your Supabase Storage bucket!
const CONTENT_BANK_URL = SUPABASE_URL + '/storage/v1/object/public/content/content-bank.json';

window.supabaseClient = undefined;
if (typeof window.supabase !== 'undefined') {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
