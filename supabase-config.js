/* ============================================
   SUPABASE CONFIG
   1. supabase.com → New Project banao
   2. Project Settings → API
   3. URL + anon public key yaha paste karo
============================================ */

const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

if (SUPABASE_URL.includes("YOUR-PROJECT-ID")) {
    console.warn("⚠️ LearnLoop: supabase-config.js me apna URL aur anon key daalo!");
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
