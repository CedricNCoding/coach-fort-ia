import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge function pour analyser un plan d'entraînement avec l'IA
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

    const { template_id } = await req.json();

    // Récupérer l'utilisateur
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Non authentifié');
    }

    // Récupérer le plan
    const { data: template, error: templateError } = await supabaseClient
      .from('workout_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError) throw templateError;

    // Récupérer les exercices du plan
    const { data: exercises, error: exercisesError } = await supabaseClient
      .from('workout_template_exercises')
      .select(`
        *,
        exercises(*)
      `)
      .eq('workout_template_id', template_id)
      .order('order_index');

    if (exercisesError) throw exercisesError;

    // Récupérer les dernières séances de ce plan pour avoir l'historique
    const { data: recentSessions, error: sessionsError } = await supabaseClient
      .from('sessions')
      .select(`
        *,
        planned_workouts!inner(workout_template_id)
      `)
      .eq('planned_workouts.workout_template_id', template_id)
      .order('finished_at', { ascending: false })
      .limit(5);

    if (sessionsError) throw sessionsError;

    // Récupérer les paramètres IA
    const { data: aiData, error: aiError } = await supabaseClient.rpc('get_user_api_key', {
      _user_id: user.id
    });

    if (aiError || !aiData || aiData.length === 0) {
      console.log('Pas de paramètres IA configurés');
      return new Response(
        JSON.stringify({
          analysis: "Configuration IA manquante. Veuillez configurer vos paramètres IA dans les réglages pour obtenir une analyse détaillée de votre plan.",
          recommendations: [
            "Ajoutez une variété d'exercices ciblant différents groupes musculaires",
            "Assurez-vous d'avoir un équilibre entre les exercices de poussée et de tirage",
            "Prévoyez des temps de repos adaptés (90-180 secondes pour les exercices composés)",
            "Progressez graduellement en augmentant le volume ou l'intensité"
          ],
          score: null,
          source: "fallback"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiSettings = aiData[0];

    // Construire le contexte pour l'IA
    const exercisesContext = exercises.map((ex: any) => {
      const muscleGroup = ex.exercises.muscle_group || 'non défini';
      const equipment = ex.exercises.equipment || 'non défini';
      
      return {
        name: ex.exercises.name,
        muscle_group: muscleGroup,
        equipment: equipment,
        target_sets: ex.target_sets,
        target_reps: `${ex.target_reps_min}-${ex.target_reps_max}`,
        target_weight_kg: Number(ex.target_weight_kg || 0),
        target_rest_seconds: ex.target_rest_seconds,
        superset_group: ex.superset_group,
        target_difficulty_note: ex.target_difficulty_note
      };
    });

    const sessionHistory = recentSessions?.map((s: any) => ({
      date: s.finished_at,
      duration_minutes: s.finished_at && s.started_at 
        ? Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : 0,
      total_tonnage: s.total_tonnage,
      avg_difficulty: s.avg_difficulty
    })) || [];

    const systemPrompt = `Tu es un coach de musculation expérimenté, spécialisé pour des pratiquants de plus de 40 ans.
Tu dois analyser un plan d'entraînement complet et fournir une évaluation détaillée avec des recommandations.

${aiSettings.user_role ? `Profil de l'utilisateur : ${aiSettings.user_role}` : ''}
${aiSettings.user_needs ? `Besoins spécifiques : ${aiSettings.user_needs}` : ''}

Critères d'évaluation :
1. ÉQUILIBRE MUSCULAIRE : Répartition entre groupes musculaires (poussée/tirage, haut/bas du corps)
2. VOLUME ET INTENSITÉ : Nombre de sets par groupe musculaire, charges et rep ranges appropriés
3. RÉCUPÉRATION : Temps de repos adaptés, gestion de la fatigue
4. PROGRESSION : Potentiel de progression, cohérence avec l'objectif
5. SÉCURITÉ : Risques de blessure, adaptation à l'âge et aux besoins spécifiques

Tu dois répondre STRICTEMENT en JSON avec cette structure exacte :
{
  "score": 85,
  "analysis": "Analyse détaillée du plan en 2-3 paragraphes couvrant les forces et faiblesses",
  "recommendations": [
    "Recommandation spécifique 1",
    "Recommandation spécifique 2",
    "Recommandation spécifique 3"
  ],
  "strengths": [
    "Point fort 1",
    "Point fort 2"
  ],
  "weaknesses": [
    "Point faible 1",
    "Point faible 2"
  ],
  "source": "ai"
}

Le score doit être entre 0 et 100.`;

    const userPrompt = `Analyse ce plan d'entraînement :

Informations générales :
- Nom du plan : ${template.name}
- Objectif : ${template.goal || 'non défini'}
- Jours récurrents : ${template.recurring_days ? JSON.stringify(template.recurring_days) : 'non définis'}
- Notes : ${template.notes || 'aucune'}

Exercices du plan (${exercises.length} exercices) :
${JSON.stringify(exercisesContext, null, 2)}

Historique récent (${sessionHistory.length} dernières séances) :
${sessionHistory.length > 0 ? JSON.stringify(sessionHistory, null, 2) : 'Aucune séance effectuée'}

RÉPONDS UNIQUEMENT avec le JSON demandé, sans texte avant ou après.`;

    try {
      const response = await fetch(aiSettings.base_url || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiSettings.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiSettings.model_name || 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_completion_tokens: 3000
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur API IA:', errorText);
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
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (parseError) {
        console.error('Erreur parsing JSON IA:', parseError, 'Content:', content);
        throw new Error('Erreur parsing JSON IA');
      }

      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('Erreur lors de l\'appel IA:', error);
      
      // Fallback basique
      return new Response(
        JSON.stringify({
          analysis: "Une erreur est survenue lors de l'analyse IA. Veuillez vérifier votre configuration.",
          recommendations: [
            "Vérifiez votre clé API dans les paramètres",
            "Assurez-vous d'avoir des crédits disponibles",
            "Consultez les logs pour plus de détails"
          ],
          score: null,
          source: "error"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Erreur générale:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
