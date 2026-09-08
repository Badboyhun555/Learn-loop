/* ============================================
   LEARNLOOP — SUPABASE CONFIG
============================================ */

const SUPABASE_URL =
    "https://rroeyftpdctupzxkvljb.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_tmWjRJ-EJU8afr30BVFKCQ_p8PXBbr2";


let supabaseClient;


if (
    window.supabase &&
    window.supabase.createClient
) {

    supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

    console.log(
        "✅ LearnLoop: Supabase connected"
    );

} else {

    console.error(
        "❌ LearnLoop: Supabase library not loaded"
    );
}
