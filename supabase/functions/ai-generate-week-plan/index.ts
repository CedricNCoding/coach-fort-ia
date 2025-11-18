import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

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

    // Vérifier l'authentification
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Non autorisé');
    }

    const { profile, stats, exercises } = await req.json();

    console.log('Génération de plan IA pour utilisateur:', user.id);
    console.log('Profil:', profile);
    console.log('Stats disponibles:', !!stats);

    // Récupérer les réglages IA de l'utilisateur
    const { data: aiSettingsArray } = await supabase
      .rpc('get_user_api_key', { _user_id: user.id });

    if (!aiSettingsArray || aiSettingsArray.length === 0 || !aiSettingsArray[0].api_key) {
      throw new Error('Clé API non configurée. Veuillez configurer vos paramètres IA.');
    }

    const aiSettings = aiSettingsArray[0];

    // Construire le prompt système
    const systemPrompt = `Tu es un coach de musculation avec 30 ans d'expérience. Tu construis des programmes hypertrophie durables pour un pratiquant d'environ 40–45 ans. 

Tu respectes strictement :
- Le profil de la personne (âge, niveau, objectif)
- Ses contraintes et zones sensibles
- Sa disponibilité hebdomadaire et ses jours préférés
- Son matériel disponible
- Ses statistiques d'entraînement réelles si fournies (exercices utilisés, volumes, charges)

Tu crées des séances cohérentes entre elles avec une bonne répartition des groupes musculaires :
- Push/Pull/Legs ou Full Body selon le nombre de séances
- Éviter de travailler lourdement le même groupe à moins de 48h d'intervalle
- Éviter de sur-solliciter le dos avec trop de rowings lourds dans la même semaine
- Pas plus de 2 exercices de core par séance

Volume hebdomadaire raisonnable pour un pratiquant 40+ :
- Pectoraux: 10-18 séries, Dos: 12-20, Épaules: 10-16
- Quadriceps: 8-14, Ischio-jambiers: 8-12, Fessiers: 8-14
- Biceps: 8-12, Triceps: 10-14, Core: 8-16, Mollets: 8-12

Organisation en supersets :
- Privilégier les pairings antagonistes ou complémentaires
- Ex: Pecs ↔ haut du dos, Quads ↔ Ischios, épaules ↔ core doux

Repos et intensité :
- RPE autour de 7-8 sur la dernière série des exercices principaux
- Temps de repos réalistes (60-180s selon l'exercice)

Exercices :
- Utiliser en priorité les exercices existants fournis
- Si besoin d'un exercice non listé, le proposer clairement (nom, groupe musculaire, type)
- Éviter les doublons inutiles

Poids cibles :
- Basés sur l'historique si disponible (pourcentage réaliste des meilleures charges)
- Sinon, estimation réaliste selon profil (âge, niveau) et type d'exercice

Réponds STRICTEMENT en JSON valide avec cette structure :
{
  "sessions": [
    {
      "name": "Nom de la séance",
      "day_of_week": 1,
      "goal": "objectif de la séance",
      "notes": "indications générales",
      "exercises": [
        {
          "name": "Nom exact de l'exercice",
          "muscle_group": "groupe principal",
          "sets": 3,
          "reps_min": 6,
          "reps_max": 10,
          "rest_seconds": 90,
          "superset_group": "A1",
          "measurement_type": "reps",
          "weight_kg": 60
        }
      ]
    }
  ]
}`;

    // Construire le prompt utilisateur avec toutes les données
    let userPrompt = `Génère un programme d'entraînement hebdomadaire personnalisé.

PROFIL :
- Âge : ${profile.age} ans
- Niveau : ${profile.level}
- Objectif : ${profile.goal}
- Séances par semaine : ${profile.sessions_per_week}
- Jours disponibles : ${profile.available_days.join(', ')}
- Matériel disponible : ${profile.equipment || 'Non spécifié'}
- Contraintes/zones sensibles : ${profile.constraints || 'Aucune'}
- Durée cible par séance : ${profile.session_duration_minutes || 60} minutes

`;

    // Ajouter les statistiques si disponibles
    if (stats && stats.has_data) {
      userPrompt += `STATISTIQUES DES 8 DERNIÈRES SEMAINES :
- Nombre moyen de séances/semaine : ${stats.avg_sessions_per_week}
- Volume total moyen/semaine : ${stats.avg_weekly_volume} kg

Exercices utilisés (avec meilleur poids) :
${stats.exercises_used.map((ex: any) => 
  `- ${ex.name} (${ex.muscle_group}) : ${ex.best_weight}kg, ${ex.frequency} séances`
).join('\n')}

Volume par groupe musculaire (séries/semaine) :
${stats.muscle_group_volumes.map((mg: any) => 
  `- ${mg.muscle_group} : ${mg.avg_weekly_sets} séries`
).join('\n')}

`;
    } else {
      userPrompt += `AUCUNE STATISTIQUE DISPONIBLE - Estime des poids de départ réalistes selon le profil.

`;
    }

    // Ajouter la liste des exercices disponibles
    userPrompt += `EXERCICES DISPONIBLES DANS LA BIBLIOTHÈQUE :
${exercises.map((ex: any) => 
  `- ${ex.name} (${ex.muscle_group}, ${ex.measurement_type})`
).join('\n')}

Génère maintenant ${profile.sessions_per_week} séances cohérentes entre elles, en respectant les jours disponibles (${profile.available_days.join(', ')}).`;

    console.log('Appel à l\'API OpenAI...');

    // Appeler l'API OpenAI
    const response = await fetch(aiSettings.base_url, {
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
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erreur API OpenAI:', response.status, errorText);
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json();
    const generatedPlan = JSON.parse(data.choices[0].message.content);

    console.log('Plan généré avec succès:', generatedPlan.sessions.length, 'séances');

    return new Response(JSON.stringify({ plan: generatedPlan }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erreur dans ai-generate-week-plan:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erreur inconnue' 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});