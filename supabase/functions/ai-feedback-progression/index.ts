import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Calcule la progression déterministe (fallback)
 */
function calculateDeterministicProgression(sets: any[], templateExercise: any) {
  const workSets = sets.filter(s => s.is_warmup === 0);
  
  if (workSets.length === 0) {
    return {
      next_target_sets: templateExercise.target_sets || 3,
      next_target_reps_min: templateExercise.target_reps_min || 6,
      next_target_reps_max: templateExercise.target_reps_max || 12,
      next_target_weight_kg: Number(templateExercise.target_weight_kg) || 0,
      next_target_difficulty_note: "Cibles maintenues",
      reason: "Aucune série de travail détectée",
      source: "deterministic"
    };
  }

  const bestSet = workSets.reduce((best, current) => {
    const bestScore = best.reps * Number(best.weight_kg);
    const currentScore = current.reps * Number(current.weight_kg);
    return currentScore > bestScore ? current : best;
  });

  const reps_best = bestSet.reps;
  const weight_best = Number(bestSet.weight_kg);
  const target_reps_min = templateExercise.target_reps_min || 6;
  const target_reps_max = templateExercise.target_reps_max || 12;
  const current_sets = templateExercise.target_sets || 3;

  const avgDifficulty = workSets.reduce((sum, set) => sum + (set.perceived_difficulty || 7), 0) / workSets.length;
  const hasPain = workSets.some(set => set.pain === 1);
  const highDifficulty = workSets.filter(set => (set.perceived_difficulty || 0) >= 9).length >= 2;

  let new_weight = weight_best;
  let new_sets = current_sets;
  let reason = "";
  let difficulty_note = "Vise 7-8/10, difficile mais contrôlé";

  if (hasPain || highDifficulty) {
    new_weight = weight_best * 0.95;
    if (highDifficulty) {
      new_sets = Math.max(2, current_sets - 1);
    }
    reason = hasPain 
      ? "Réduction de charge et/ou volume en raison de douleur signalée"
      : "Réduction de charge et volume en raison de difficulté excessive (plusieurs sets ≥9/10)";
    difficulty_note = "Vise 6-7/10, focus sur la technique";
  } else if (reps_best >= target_reps_max) {
    new_weight = weight_best * 1.025;
    const maxIncrease = weight_best * 1.05;
    new_weight = Math.min(new_weight, maxIncrease);
    reason = `Reps maximum atteint (${reps_best}/${target_reps_max}), augmentation de charge de +2.5%`;
    difficulty_note = "Vise 7-8/10 avec la nouvelle charge, 1-2 reps en réserve";
  } else if (reps_best >= target_reps_min && reps_best < target_reps_max) {
    new_weight = weight_best;
    reason = `Reps dans le rep range cible (${reps_best} entre ${target_reps_min} et ${target_reps_max}), charge maintenue`;
    difficulty_note = "Vise 7-8/10, pousse vers le haut du rep range";
  } else {
    new_weight = weight_best * 0.95;
    reason = `Reps insuffisantes (${reps_best} < ${target_reps_min}), réduction de charge de -5%`;
    difficulty_note = "Vise 7/10, focus sur l'atteinte du rep range";
  }

  new_weight = Math.round(new_weight * 2) / 2;

  return {
    next_target_sets: new_sets,
    next_target_reps_min: target_reps_min,
    next_target_reps_max: target_reps_max,
    next_target_weight_kg: new_weight,
    next_target_difficulty_note: difficulty_note,
    reason,
    source: "deterministic"
  };
}

/**
 * Edge function pour générer le feedback et les propositions de progression
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

    const { session_id } = await req.json();

    // Récupérer l'utilisateur
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Non authentifié');
    }

    // Récupérer la session
    const { data: session, error: sessionError } = await supabaseClient
      .from('sessions')
      .select('*, planned_workouts(*, workout_templates(*))')
      .eq('id', session_id)
      .single();

    if (sessionError) throw sessionError;

    // Récupérer tous les sets
    const { data: sessionSets, error: setsError } = await supabaseClient
      .from('session_sets')
      .select('*')
      .eq('session_id', session_id)
      .order('set_index');

    if (setsError) throw setsError;

    // Récupérer les template exercises
    const { data: templateExercises, error: templateError } = await supabaseClient
      .from('workout_template_exercises')
      .select('*, exercises(*)')
      .eq('workout_template_id', session.planned_workouts?.workout_template_id)
      .eq('is_active', 1);

    if (templateError) throw templateError;

    // Récupérer les paramètres IA
    const { data: aiSettings } = await supabaseClient
      .from('ai_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Si pas d'IA configurée, utiliser uniquement le déterministe
    if (!aiSettings || !aiSettings.api_key) {
      console.log('Pas de paramètres IA, utilisation des règles déterministes');
      
      const exercises = templateExercises.map((te: any) => {
        const sets = sessionSets.filter((s: any) => s.template_exercise_id === te.id);
        const progression = calculateDeterministicProgression(sets, te);
        
        return {
          template_exercise_id: te.id,
          ...progression
        };
      });

      return new Response(
        JSON.stringify({
          feedback_bullets: [
            "Séance complétée avec succès !",
            "Les cibles ont été ajustées selon les règles de progression déterministe.",
            "Continue à progresser de façon régulière et sécurisée."
          ],
          exercises
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Préparer les données pour l'IA
    const workSets = sessionSets.filter((s: any) => s.is_warmup === 0);
    const totalTonnage = workSets.reduce((sum: number, s: any) => sum + (s.reps * Number(s.weight_kg)), 0);
    const avgDifficulty = workSets.length > 0
      ? workSets.reduce((sum: number, s: any) => sum + (s.perceived_difficulty || 7), 0) / workSets.length
      : 0;
    const setsWithPain = workSets.filter((s: any) => s.pain === 1).length;

    const duration = session.finished_at && session.started_at
      ? Math.round((new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 60000)
      : 0;

    // Construire le contexte par exercice
    const exercisesContext = templateExercises.map((te: any) => {
      const sets = sessionSets.filter((s: any) => s.template_exercise_id === te.id);
      return {
        template_exercise_id: te.id,
        exercise_name: te.exercises.name,
        muscle_group: te.exercises.muscle_group,
        equipment: te.exercises.equipment,
        current_target_sets: te.target_sets,
        current_target_reps_min: te.target_reps_min,
        current_target_reps_max: te.target_reps_max,
        current_target_weight_kg: Number(te.next_target_weight_kg || te.target_weight_kg),
        current_rest_seconds: te.target_rest_seconds || te.exercises.default_rest_seconds,
        sets: sets.map((s: any) => ({
          set_index: s.set_index,
          reps: s.reps,
          weight_kg: Number(s.weight_kg),
          perceived_difficulty: s.perceived_difficulty,
          pain: s.pain,
          is_warmup: s.is_warmup
        }))
      };
    });

    const systemPrompt = `Tu es un coach de musculation expérimenté, spécialisé pour des pratiquants de plus de 40 ans.
Tu dois analyser la séance et proposer des ajustements selon les règles suivantes :

${aiSettings.user_role ? `Profil de l'utilisateur : ${aiSettings.user_role}` : ''}
${aiSettings.user_needs ? `Besoins spécifiques : ${aiSettings.user_needs}` : ''}

Échelle de difficulté :
- 6/10 : assez facile, 3-4 reps en réserve
- 7/10 : difficile mais contrôlé, ~2 reps en réserve
- 8/10 : très difficile, 1 rep en réserve
- 9/10 : quasi échec, 0 rep en réserve
- 10/10 : échec complet

Règles de progression (OBLIGATOIRES) :
1. Si douleur (pain = 1) OU plusieurs sets avec difficulté ≥ 9 : RÉDUIRE de -5% la charge et possiblement -1 set
2. Si meilleur set >= rep max du rep range : AUGMENTER de +2.5% (max +5%)
3. Si meilleur set dans le rep range : MAINTENIR la charge
4. Si meilleur set < rep min : RÉDUIRE de -5%

Limites de sécurité ABSOLUES :
- Max +5% de charge par séance
- Max -5% de charge par séance
- Max +1 set par séance

Tu dois répondre STRICTEMENT en JSON avec cette structure exacte :
{
  "feedback_bullets": ["phrase 1", "phrase 2", "phrase 3"],
  "exercises": [
    {
      "template_exercise_id": 123,
      "reason": "explication courte",
      "next_target_sets": 3,
      "next_target_reps_min": 6,
      "next_target_reps_max": 8,
      "next_target_weight_kg": 82.5,
      "next_target_difficulty_note": "Vise 7-8/10",
      "source": "ai"
    }
  ]
}`;

    const userPrompt = `Analyse cette séance :

Contexte global :
- Objectif du plan : ${session.planned_workouts?.workout_templates?.goal || 'non défini'}
- Durée : ${duration} minutes
- Tonnage total : ${totalTonnage.toFixed(0)} kg
- Difficulté moyenne : ${avgDifficulty.toFixed(1)}/10
- Sets avec douleur : ${setsWithPain}
- Nombre total de sets : ${workSets.length}

Détail des exercices :
${JSON.stringify(exercisesContext, null, 2)}

RÉPONDS UNIQUEMENT avec le JSON demandé, sans texte avant ou après.`;

    try {
      const response = await fetch(aiSettings.base_url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiSettings.api_key}`,
          'Content-Type': 'application/json',
        },
      body: JSON.stringify({
        model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_completion_tokens: 2000
        }),
      });

      if (!response.ok) {
        console.error('Erreur API IA:', await response.text());
        throw new Error('Erreur API IA');
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('Pas de contenu dans la réponse IA');
      }

      // Parser le JSON
      let parsed;
      try {
        // Essayer de nettoyer les markdown code blocks si présents
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (parseError) {
        console.error('Erreur parsing JSON IA:', parseError, 'Content:', content);
        throw new Error('Erreur parsing JSON IA');
      }

      // Appliquer les limites de sécurité
      parsed.exercises = parsed.exercises.map((ex: any) => {
        const te = templateExercises.find((t: any) => t.id === ex.template_exercise_id);
        if (!te) return ex;

        // Trouver le poids réellement utilisé pendant la séance
        const sets = sessionSets.filter((s: any) => s.template_exercise_id === te.id && s.is_warmup === 0);
        const actualWeight = sets.length > 0 
          ? Math.max(...sets.map((s: any) => Number(s.weight_kg)))
          : Number(te.target_weight_kg || 0);
        
        // Si aucun poids de référence, on garde la suggestion de l'IA telle quelle
        if (actualWeight === 0) {
          return {
            ...ex,
            next_target_sets: Math.min(ex.next_target_sets, (te.target_sets || 3) + 1)
          };
        }

        const maxWeight = actualWeight * 1.05;
        const minWeight = actualWeight * 0.95;

        return {
          ...ex,
          next_target_weight_kg: Math.max(minWeight, Math.min(maxWeight, ex.next_target_weight_kg)),
          next_target_sets: Math.min(ex.next_target_sets, (te.target_sets || 3) + 1)
        };
      });

      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (aiError) {
      console.error('Erreur IA, fallback déterministe:', aiError);
      
      // Fallback déterministe
      const exercises = templateExercises.map((te: any) => {
        const sets = sessionSets.filter((s: any) => s.template_exercise_id === te.id);
        const progression = calculateDeterministicProgression(sets, te);
        
        return {
          template_exercise_id: te.id,
          ...progression
        };
      });

      return new Response(
        JSON.stringify({
          feedback_bullets: [
            "Séance complétée (IA indisponible, règles déterministes utilisées).",
            "Les cibles ont été ajustées selon les règles de progression automatique.",
            "Continue à progresser de façon régulière et sécurisée."
          ],
          exercises
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Erreur ai-feedback-progression:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
