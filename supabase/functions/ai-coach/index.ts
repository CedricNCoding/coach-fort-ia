import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, message } = await req.json();

    // Récupérer ou créer la mémoire de l'utilisateur
    let { data: memoryData, error: memoryError } = await supabase
      .from('ai_coach_memory')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (memoryError && memoryError.code !== 'PGRST116') {
      console.error('Error fetching memory:', memoryError);
    }

    if (!memoryData) {
      const { data: newMemory, error: createError } = await supabase
        .from('ai_coach_memory')
        .insert({ user_id: user.id, memory_content: '' })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating memory:', createError);
      }
      memoryData = newMemory;
    }

    const memory = memoryData?.memory_content || '';

    // Récupérer le profil utilisateur
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Récupérer les séances de la semaine écoulée (7 derniers jours)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { data: recentSessions } = await supabase
      .from('sessions')
      .select(`
        id,
        started_at,
        finished_at,
        status,
        total_tonnage,
        avg_difficulty,
        notes,
        planned_workouts (
          workout_templates (
            name
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('started_at', oneWeekAgo.toISOString())
      .order('started_at', { ascending: false });

    // Récupérer les sets de ces séances
    let sessionsDetail: any[] = [];
    if (recentSessions && recentSessions.length > 0) {
      const sessionIds = recentSessions.map(s => s.id);
      
      const { data: sets } = await supabase
        .from('session_sets')
        .select(`
          *,
          exercises (
            id,
            name,
            muscle_group,
            equipment
          )
        `)
        .in('session_id', sessionIds)
        .eq('is_warmup', 0)
        .order('session_id')
        .order('set_index');

      // Organiser les sets par session
      const sessionMap = new Map();
      sets?.forEach(set => {
        if (!sessionMap.has(set.session_id)) {
          sessionMap.set(set.session_id, []);
        }
        sessionMap.get(set.session_id).push(set);
      });

      sessionsDetail = recentSessions.map(session => {
        const sessionSets = sessionMap.get(session.id) || [];
        const exercisesMap = new Map();

        sessionSets.forEach((set: any) => {
          const exId = set.exercise_id;
          if (!exercisesMap.has(exId)) {
            exercisesMap.set(exId, {
              exercise: set.exercises,
              sets: []
            });
          }
          exercisesMap.get(exId).sets.push({
            weight_kg: set.weight_kg,
            reps: set.reps,
            rpe: set.perceived_difficulty,
            pain: set.pain,
            time_seconds: set.time_seconds,
            actual_rest_seconds: set.actual_rest_seconds
          });
        });

        const plannedWorkout = session.planned_workouts as any;
        return {
          date: session.started_at,
          template_name: plannedWorkout?.workout_templates?.name || 'Séance libre',
          tonnage: session.total_tonnage,
          avg_difficulty: session.avg_difficulty,
          notes: session.notes,
          exercises: Array.from(exercisesMap.values())
        };
      });
    }

    // Récupérer tous les exercices disponibles
    const { data: allExercises } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, equipment, measurement_type')
      .or(`user_id.eq.${user.id},is_builtin.eq.1`);

    // Récupérer les programmes existants
    const { data: templates } = await supabase
      .from('workout_templates')
      .select(`
        id,
        name,
        goal,
        recurring_days,
        workout_template_exercises (
          order_index,
          target_sets,
          target_reps_min,
          target_reps_max,
          target_weight_kg,
          target_time_seconds,
          target_rest_seconds,
          superset_group,
          exercises (
            id,
            name,
            muscle_group,
            measurement_type
          )
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    // Construction du prompt système
    const systemPrompt = `Tu es un coach sportif expert avec une mémoire. Tu suis tes élèves sur le long terme.

**MÉMOIRE ACTUELLE DU COACH :**
${memory || 'Aucune mémoire encore.'}

**RÈGLES DE COACHING :**
- Progression validée (haut de rep range ou RPE faible ≤6) → +2.5% à +5%
- RPE élevé (≥9), douleurs → -5% à -10%
- Volume réalisé < 80% du prévu → maintenir ou réduire 1 set
- Douleur récurrente ≥ 2 semaines → changer exercice ou variation
- Stagnation ≥ 3 séances → variation exercice (machine/haltères/barre, unilatéral/bilatéral, poulie)
- Fatigue cumulée (reps baisse, RPE haut, douleurs, volume faible, récup faible) → deload (-15/25% intensité, -30/50% volume)
- Pratiquant 40+ : prudence articulations, technique prioritaire, récupération optimisée
- Temps de repos (actual_rest_seconds) : analyse si les repos pris sont adéquats (trop courts = fatigue excessive, trop longs = manque d'intensité)

**ÉCHELLE RPE :**
1-3 : Très facile 😊
4-6 : Modéré 😐
7-8 : Difficile mais contrôlé 😓
9-10 : Échec ou quasi-échec 🔥

**FORMAT DE RÉPONSE (JSON STRICT) :**
{
  "memory_update": "Résumé compact (5 lignes max) à retenir pour la prochaine fois : douleurs, préférences, évolutions, points d'attention.",
  "summary": "Résumé de la semaine",
  "fatigue_score": 0-10,
  "injury_risk": "faible | moyen | élevé",
  "needs_deload": true/false,
  "key_observations": ["Observation 1", "Observation 2"],
  "per_exercise_recommendations": [
    {
      "exercise_name": "Nom exact",
      "change_type": "increase_load | decrease_load | maintain | swap_variation",
      "new_weight_kg": 0,
      "new_reps_min": 0,
      "new_reps_max": 0,
      "reason": "Explication"
    }
  ],
  "suggested_program_for_next_week": {
    "type": "standard | deload | updated_program",
    "sessions": [
      {
        "name": "Nom séance",
        "day_of_week": 1,
        "exercises": [
          {
            "name": "Nom exact",
            "sets": 3,
            "reps_min": 6,
            "reps_max": 10,
            "weight_kg": 60,
            "rest_seconds": 90,
            "superset_group": "A1"
          }
        ]
      }
    ]
  },
  "conversational_response": "Réponse naturelle au message de l'utilisateur"
}`;

    // Construction du prompt utilisateur
    const userContext = `
**PROFIL UTILISATEUR :**
${profile ? `
- Âge : ${profile.age || 'non spécifié'}
- Niveau : ${profile.level || 'non spécifié'}
- Objectif : ${profile.goal || 'non spécifié'}
- Séances/semaine : ${profile.sessions_per_week || 'non spécifié'}
- Durée séance : ${profile.session_duration_minutes || 'non spécifié'} min
- Équipement : ${profile.equipment || 'non spécifié'}
- Contraintes : ${profile.constraints || 'aucune'}
` : 'Profil non renseigné'}

**SÉANCES DE LA SEMAINE ÉCOULÉE (${sessionsDetail.length} séances) :**
${sessionsDetail.length > 0 ? JSON.stringify(sessionsDetail, null, 2) : 'Aucune séance cette semaine.'}

**PROGRAMMES EXISTANTS :**
${templates && templates.length > 0 ? JSON.stringify(templates, null, 2) : 'Aucun programme existant.'}

**EXERCICES DISPONIBLES (${allExercises?.length || 0} exercices) :**
${allExercises ? JSON.stringify(allExercises.slice(0, 50), null, 2) : '[]'}

**ACTION DEMANDÉE :** ${action || 'analyse'}
**MESSAGE UTILISATEUR :** ${message || 'Analyse ma semaine et propose-moi un programme pour la semaine prochaine.'}
`;

    // Appel à Lovable AI
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY non configurée' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContext }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'Erreur API IA', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    let coachResponse = aiData.choices[0].message.content;

    // Nettoyer le JSON si besoin
    if (coachResponse.includes('```json')) {
      coachResponse = coachResponse.split('```json')[1].split('```')[0].trim();
    } else if (coachResponse.includes('```')) {
      coachResponse = coachResponse.split('```')[1].split('```')[0].trim();
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(coachResponse);
    } catch (e) {
      console.error('JSON parse error:', e, 'Response:', coachResponse);
      return new Response(JSON.stringify({ error: 'Erreur parsing JSON', raw: coachResponse }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mettre à jour la mémoire
    if (parsedResponse.memory_update) {
      await supabase
        .from('ai_coach_memory')
        .update({ memory_content: parsedResponse.memory_update })
        .eq('user_id', user.id);
    }

    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-coach function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
