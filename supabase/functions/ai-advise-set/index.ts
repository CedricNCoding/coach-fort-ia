import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge function pour générer un conseil IA avant un set
 * Utilise les paramètres IA de l'utilisateur ou retourne un conseil par défaut
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { session_id, template_exercise_id } = await req.json();

    // Récupérer l'utilisateur
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Non authentifié');
    }

    // Récupérer les paramètres IA
    const { data: aiSettings } = await supabaseClient
      .from('ai_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Si pas de settings IA, retourner un conseil par défaut
    if (!aiSettings || !aiSettings.api_key) {
      return new Response(
        JSON.stringify({ 
          advice: "Vise un ressenti 7-8/10, difficile mais contrôlé, environ 1-2 reps en réserve." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer le template exercise
    const { data: templateExercise, error: templateError } = await supabaseClient
      .from('workout_template_exercises')
      .select('*, exercises(*), workout_templates(*)')
      .eq('id', template_exercise_id)
      .single();

    if (templateError) throw templateError;

    // Récupérer la dernière séance pour cet exercice
    const { data: lastSets } = await supabaseClient
      .from('session_sets')
      .select('*, sessions!inner(user_id, status, finished_at)')
      .eq('exercise_id', templateExercise.exercise_id)
      .eq('sessions.user_id', user.id)
      .eq('sessions.status', 'completed')
      .eq('is_warmup', 0)
      .order('sessions.finished_at', { ascending: false })
      .limit(10);

    let lastPerformance = null;
    if (lastSets && lastSets.length > 0) {
      const bestSet = lastSets.reduce((best, current) => {
        const bestScore = best.reps * Number(best.weight_kg);
        const currentScore = current.reps * Number(current.weight_kg);
        return currentScore > bestScore ? current : best;
      });
      const avgDifficulty = lastSets.reduce((sum, s) => sum + (s.perceived_difficulty || 7), 0) / lastSets.length;
      lastPerformance = {
        reps: bestSet.reps,
        weight_kg: Number(bestSet.weight_kg),
        avg_difficulty: avgDifficulty
      };
    }

    // Construire le prompt
    const systemPrompt = `Tu es un coach de musculation expérimenté, spécialisé pour des pratiquants de plus de 40 ans. 
Tu réponds avec UNE SEULE phrase très courte en français expliquant le ressenti à viser sur ce set.

Échelle de difficulté :
- 6/10 : assez facile, 3-4 reps en réserve
- 7/10 : difficile mais contrôlé, ~2 reps en réserve
- 8/10 : très difficile, 1 rep en réserve
- 9/10 : quasi échec, 0 rep en réserve
- 10/10 : échec complet`;

    const userPrompt = `Exercice : ${templateExercise.exercises.name} (${templateExercise.exercises.muscle_group})
Objectif du plan : ${templateExercise.workout_templates?.goal || 'non défini'}
Rep range cible : ${templateExercise.target_reps_min}-${templateExercise.target_reps_max} reps
Poids cible : ${Number(templateExercise.next_target_weight_kg || templateExercise.target_weight_kg)} kg
${lastPerformance ? `Dernière perf : ${lastPerformance.reps} × ${lastPerformance.weight_kg} kg (difficulté ${lastPerformance.avg_difficulty.toFixed(1)}/10)` : 'Pas de données de la dernière séance'}

Donne un conseil en UNE phrase sur le ressenti à viser.`;

    // Appel à l'IA
    const response = await fetch(aiSettings.base_url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiSettings.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiSettings.model_name,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 100
      }),
    });

    if (!response.ok) {
      console.error('Erreur API IA:', await response.text());
      // Fallback
      return new Response(
        JSON.stringify({ 
          advice: "Vise un ressenti 7-8/10, difficile mais contrôlé, environ 1-2 reps en réserve." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const advice = data.choices?.[0]?.message?.content || "Vise un ressenti 7-8/10.";

    return new Response(
      JSON.stringify({ advice }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur ai-advise-set:', error);
    return new Response(
      JSON.stringify({ 
        advice: "Vise un ressenti 7-8/10, difficile mais contrôlé, environ 1-2 reps en réserve." 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
