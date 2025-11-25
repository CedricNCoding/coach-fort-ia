import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Vérifier l'authentification
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupérer les logs d'interactions IA
    const { data: aiLogs, error: logsError } = await supabaseClient
      .from("ai_interactions_log")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (logsError) throw logsError;

    // Récupérer la mémoire du coach IA
    const { data: coachMemory, error: memoryError } = await supabaseClient
      .from("ai_coach_memory")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memoryError) throw memoryError;

    // Récupérer les feedbacks IA des sessions
    const { data: sessions, error: sessionsError } = await supabaseClient
      .from("sessions")
      .select("id, started_at, finished_at, ai_feedback")
      .eq("user_id", user.id)
      .not("ai_feedback", "is", null)
      .order("started_at", { ascending: false });

    if (sessionsError) throw sessionsError;

    const exportData = {
      export_date: new Date().toISOString(),
      user_id: user.id,
      ai_interactions_log: aiLogs || [],
      ai_coach_memory: coachMemory,
      session_ai_feedbacks: sessions || [],
    };

    return new Response(JSON.stringify(exportData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erreur export AI data:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
