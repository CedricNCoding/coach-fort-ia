import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Non authentifié');

    // Get decrypted API key using secure function
    const { data: aiSettings, error: settingsError } = await supabaseClient
      .rpc('get_user_api_key', { _user_id: user.id })
      .maybeSingle() as { 
        data: { 
          api_key: string | null, 
          model_name: string | null, 
          base_url: string | null,
          user_role: string | null,
          user_needs: string | null
        } | null, 
        error: any 
      };

    if (settingsError || !aiSettings || !aiSettings.api_key) {
      return new Response(
        JSON.stringify({ 
          advice: "Contrôle la descente, pause courte en bas, remonte avec puissance. Vise 7-8/10, difficile mais maîtrisé." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: templateExercise, error: templateError } = await supabaseClient
      .from('workout_template_exercises')
      .select('*, exercises(*), workout_templates(*)')
      .eq('id', template_exercise_id)
      .single();

    if (templateError) throw templateError;

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

    const systemPrompt = `Tu es un coach de musculation expérimenté pour pratiquants de plus de 40 ans. 
Tu donnes UN SEUL conseil COURT (15-20 mots max) sur l'exécution technique et le ressenti à viser.

${aiSettings.user_role ? `Profil : ${aiSettings.user_role}` : ''}
${aiSettings.user_needs ? `Besoins : ${aiSettings.user_needs}` : ''}

Format: "[Point technique] + [Ressenti cible]"
Exemple: "Contrôle la descente 2-3 sec, remonte explosif. Vise 7-8/10, difficile mais maîtrisé."

Échelle de ressenti:
- 6/10: Assez facile, 3-4 reps en réserve
- 7/10: Difficile contrôlé, ~2 reps en réserve
- 8/10: Très difficile, 1 rep en réserve
- 9/10: Quasi échec
- 10/10: Échec complet`;

    const userPrompt = `Exercice: ${templateExercise.exercises.name} (${templateExercise.exercises.muscle_group})
Objectif: ${templateExercise.workout_templates?.goal || 'non défini'}
Rep range: ${templateExercise.target_reps_min}-${templateExercise.target_reps_max} reps
Poids cible: ${Number(templateExercise.next_target_weight_kg || templateExercise.target_weight_kg)} kg
${lastPerformance ? `Dernière perf: ${lastPerformance.reps} reps × ${lastPerformance.weight_kg} kg (ressenti ${lastPerformance.avg_difficulty.toFixed(1)}/10)` : 'Première fois'}

Donne UN conseil court sur la technique d'exécution + le ressenti à viser.`;

    const response = await fetch(aiSettings.base_url || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiSettings.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiSettings.model_name || 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 100
      })
    });

    if (!response.ok) {
      console.error('AI API error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ 
          advice: "Contrôle la descente, pause courte, remonte avec puissance. Vise 7-8/10, difficile mais maîtrisé." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const advice = data.choices?.[0]?.message?.content || "Contrôle la descente, remonte explosif. Vise 7-8/10.";

    return new Response(
      JSON.stringify({ advice }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-advise-set:', error);
    return new Response(
      JSON.stringify({ 
        advice: "Contrôle la descente, pause courte, remonte avec puissance. Vise 7-8/10, difficile mais maîtrisé." 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
