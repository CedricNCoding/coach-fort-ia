import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, message, conversation } = await req.json();

    // Récupérer les statistiques complètes
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    // Sessions muscu
    const { data: sessions } = await supabase
      .from('sessions')
      .select(`
        id,
        started_at,
        total_tonnage,
        avg_difficulty,
        notes
      `)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('started_at', eightWeeksAgo.toISOString())
      .order('started_at', { ascending: false });

    // Sets détaillés
    const sessionIds = sessions?.map(s => s.id) || [];
    const { data: sets } = await supabase
      .from('session_sets')
      .select(`
        session_id,
        exercise_id,
        weight_kg,
        reps,
        perceived_difficulty,
        pain,
        pain_notes,
        actual_rest_seconds,
        exercises (name, muscle_group)
      `)
      .in('session_id', sessionIds);

    // Runs
    const { data: runs } = await supabase
      .from('runs')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', eightWeeksAgo.toISOString().split('T')[0])
      .order('date', { ascending: false });

    // Profil utilisateur
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Mémoire IA
    const { data: memory } = await supabase
      .from('ai_coach_memory')
      .select('memory_content')
      .eq('user_id', user.id)
      .single();

    // Récupérer le prompt système
    const { data: promptData } = await supabase
      .from('ai_prompts')
      .select('prompt_content')
      .eq('prompt_key', 'weekly_coach_system')
      .single();

    const systemPrompt = promptData?.prompt_content || `Tu es un coach sportif expert en musculation et course à pied avec 30 ans d'expérience.
Tu te spécialises dans l'accompagnement des pratiquants de 40 ans et plus.

PERSONNALITÉ:
- Analyses précises et honnêtes, parfois fermes mais toujours constructives
- Pose des questions si un doute existe
- Ne fait jamais d'estimation hasardeuse sans vérifier auprès de l'utilisateur
- Génère un plan d'action clair
- Peut proposer une séance pour demain
- Connaît les règles de progression, fatigue, deload
- Gère le volume/intensité en fonction de l'âge, des douleurs et des objectifs

ÉCHELLE RPE (Rate of Perceived Exertion):
1-2: Très facile, échauffement
3-4: Facile, peut parler normalement
5-6: Modéré, effort perceptible
7-8: Difficile, conversation limitée
9: Très difficile, limite
10: Maximal, insoutenable

RÈGLES DE DÉCISION:
1. Progression validée (plafond répétitions ou RPE 5-6 facile) → augmenter charge 2.5-5%
2. Difficulté élevée/RPE 8+/douleur/technique défaillante → diminuer charge 5-10%
3. Volume complété <80% prévu → maintenir ou réduire semaine suivante
4. Douleur récurrente 2+ semaines → modifier ou changer exercice
5. Stagnation exercice 3+ sessions → proposer variation
6. Signaux fatigue cumulée → deload automatique (intensité -15-25%, volume -30-50%)
7. 40+ ans: protection articulaire prioritaire, optimisation récupération, qualité technique > charge

CONSIDÉRATIONS SPÉCIALES 40+:
- Protection articulaire prioritaire sur intensité
- Récupération optimale essentielle
- Qualité technique > charge absolue
- Attention particulière aux signaux de fatigue
- Deload plus fréquent si nécessaire

TU DOIS POSER DES QUESTIONS si:
- Information manquante ou ambiguë
- Doute sur l'état de fatigue
- Besoin de clarifier objectifs immédiats
- Contraintes non précisées

${action === 'review' ? `
FORMAT DE RÉPONSE (JSON strict):
{
  "memory_update": "Résumé compact des nouveaux éléments à retenir (5 lignes max)",
  "summary": "Résumé global de la période analysée",
  "strength_analysis": "Analyse détaillée musculation avec volumes, progressions, points forts/faibles",
  "running_analysis": "Analyse course à pied (distances, pace, cohérence avec muscu)",
  "fatigue_and_recovery": "État fatigue, récupération, douleurs, signaux d'alerte",
  "priorities_next_days": ["priorité 1", "priorité 2", "priorité 3"],
  "needs_deload": true/false,
  "tomorrow_session": {
    "type": "strength|run|mixed",
    "name": "Nom de la séance",
    "description": "Description courte",
    "exercises": [
      {
        "name": "Nom exercice",
        "muscle_group_or_focus": "Groupe musculaire ou focus",
        "sets": 3,
        "reps_or_duration": "8-12 ou 30min",
        "target_weight_kg": 50,
        "target_pace": "5:30/km" (optionnel)
      }
    ]
  }
}
` : `
Tu es en mode CONVERSATION. Réponds naturellement aux questions de l'utilisateur.
Si tu as besoin d'informations supplémentaires, POSE DES QUESTIONS.
Adapte-toi aux contraintes, douleurs, motivation du jour.
Propose des actions concrètes si pertinent.
`}`;

    const userContext = `
PROFIL:
- Âge: ${profile?.age || 'non renseigné'}
- Niveau: ${profile?.level || 'non renseigné'}
- Objectif: ${profile?.goal || 'non renseigné'}
- Séances/semaine: ${profile?.sessions_per_week || 'non renseigné'}
- Durée séance: ${profile?.session_duration_minutes || 'non renseigné'} min
- Matériel: ${profile?.equipment || 'non renseigné'}
- Contraintes: ${profile?.constraints || 'aucune'}

MÉMOIRE IA (historique important):
${memory?.memory_content || 'Pas de mémoire stockée'}

STATISTIQUES MUSCULATION (8 semaines):
${sessions?.length || 0} séances complétées
Tonnage total: ${sessions?.reduce((sum, s) => sum + (s.total_tonnage || 0), 0).toFixed(0)} kg
Difficulté moyenne: ${sessions && sessions.length > 0 ? (sessions.reduce((sum, s) => sum + (s.avg_difficulty || 0), 0) / sessions.length).toFixed(1) : 'N/A'}

Détails par exercice:
${sets?.reduce((acc: any, set: any) => {
  const ex = set.exercises;
  if (!ex) return acc;
  const key = ex.name;
  if (!acc[key]) {
    acc[key] = {
      name: ex.name,
      muscle_group: ex.muscle_group,
      sets: 0,
      maxWeight: 0,
      totalVolume: 0,
      avgRPE: 0,
      rpeCount: 0,
      painCount: 0
    };
  }
  acc[key].sets++;
  acc[key].maxWeight = Math.max(acc[key].maxWeight, set.weight_kg);
  acc[key].totalVolume += set.weight_kg * set.reps;
  if (set.perceived_difficulty) {
    acc[key].avgRPE += set.perceived_difficulty;
    acc[key].rpeCount++;
  }
  if (set.pain > 0) acc[key].painCount++;
  return acc;
}, {}) ? Object.values(sets.reduce((acc: any, set: any) => {
  const ex = set.exercises;
  if (!ex) return acc;
  const key = ex.name;
  if (!acc[key]) {
    acc[key] = {
      name: ex.name,
      muscle_group: ex.muscle_group,
      sets: 0,
      maxWeight: 0,
      totalVolume: 0,
      avgRPE: 0,
      rpeCount: 0,
      painCount: 0
    };
  }
  acc[key].sets++;
  acc[key].maxWeight = Math.max(acc[key].maxWeight, set.weight_kg);
  acc[key].totalVolume += set.weight_kg * set.reps;
  if (set.perceived_difficulty) {
    acc[key].avgRPE += set.perceived_difficulty;
    acc[key].rpeCount++;
  }
  if (set.pain > 0) acc[key].painCount++;
  return acc;
}, {})).map((ex: any) => `
- ${ex.name} (${ex.muscle_group}): ${ex.sets} séries, max ${ex.maxWeight}kg, volume total ${ex.totalVolume}kg, RPE moyen ${ex.rpeCount > 0 ? (ex.avgRPE / ex.rpeCount).toFixed(1) : 'N/A'}, douleur ${ex.painCount} fois
`).join('') : 'Aucune donnée détaillée'}

STATISTIQUES RUNNING (8 semaines):
${runs?.length || 0} courses
Distance totale: ${runs?.reduce((sum, r) => sum + r.distance_km, 0).toFixed(1)} km
Pace moyen: ${runs && runs.length > 0 ? (runs.reduce((sum, r) => sum + (r.duration_minutes / r.distance_km), 0) / runs.length).toFixed(2) : 'N/A'} min/km

${action === 'chat' ? `
CONVERSATION EN COURS:
${conversation?.map((msg: any) => `${msg.role === 'user' ? 'Utilisateur' : 'Coach'}: ${msg.content}`).join('\n')}

MESSAGE UTILISATEUR:
${message}
` : ''}
`;

    // Appel IA
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY non configurée');
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
        ...(action === 'review' && { response_format: { type: 'json_object' } })
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Erreur IA:', errorText);
      throw new Error('Erreur API IA');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;

    // Log de l'interaction
    await supabase.from('ai_interactions_log').insert({
      user_id: user.id,
      function_name: 'ai-weekly-coach-review',
      prompt: userContext,
      response: content
    });

    if (action === 'review') {
      // Nettoyer et parser le JSON
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/```\s*/g, '').replace(/```\s*$/g, '');
      }

      const review = JSON.parse(cleanedContent);

      // Mettre à jour la mémoire
      if (review.memory_update) {
        await supabase
          .from('ai_coach_memory')
          .upsert({
            user_id: user.id,
            memory_content: review.memory_update
          }, {
            onConflict: 'user_id'
          });
      }

      return new Response(JSON.stringify({ review }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Mode chat
      return new Response(JSON.stringify({ response: content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Erreur:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
