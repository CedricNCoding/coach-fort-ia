import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Vérifier l'authentification
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Non autorisé");
    }

    const { profile, exercises } = await req.json();

    console.log("Génération de plan IA pour utilisateur:", user.id);
    console.log("Profil:", profile);

    // Récupérer l'historique des 4 dernières semaines
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const { data: recentSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select(`
        id,
        started_at,
        finished_at,
        total_tonnage,
        avg_difficulty,
        notes,
        status
      `)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("started_at", fourWeeksAgo.toISOString())
      .order("started_at", { ascending: false });

    if (sessionsError) {
      console.error("Erreur récupération sessions:", sessionsError);
    }

    // Récupérer les sets des sessions récentes
    let sessionSets: any[] = [];
    if (recentSessions && recentSessions.length > 0) {
      const sessionIds = recentSessions.map((s) => s.id);
      const { data: sets, error: setsError } = await supabase
        .from("session_sets")
        .select(`
          session_id,
          exercise_id,
          weight_kg,
          reps,
          time_seconds,
          perceived_difficulty,
          pain,
          actual_rest_seconds,
          is_warmup,
          exercises (
            name,
            muscle_group
          )
        `)
        .in("session_id", sessionIds)
        .eq("is_warmup", 0);

      if (setsError) {
        console.error("Erreur récupération sets:", setsError);
      } else {
        sessionSets = sets || [];
      }
    }

    console.log(`Historique récupéré: ${recentSessions?.length || 0} sessions, ${sessionSets.length} séries`);

    // Récupérer les réglages IA de l'utilisateur
    const { data: aiSettingsArray } = await supabase.rpc("get_user_api_key", { _user_id: user.id });

    if (!aiSettingsArray || aiSettingsArray.length === 0 || !aiSettingsArray[0].api_key) {
      throw new Error("Clé API non configurée. Veuillez configurer vos paramètres IA.");
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

Chaque séance doit obligatoirement contenir 6 supersets numérotés A, B, C, D, E, F, chacun composé de 2 exercices :
	•	A1 & A2
	•	B1 & B2
	•	C1 & C2
	•	D1 & D2
	•	E1 & E2
	•	F1 & F2

Soit 12 exercices par séance, organisés comme suit :
	•	un seul “A1/A2”, puis “B1/B2”, etc.
	•	jamais plus de 2 exercices dans le même superset,
	•	pas de blocs vides,
	•	pas de superset répété,
	•	respecter les pairings intelligents (antagonistes ou complémentaires).

Les 6 supersets doivent rester cohérents avec le volume hebdomadaire, l’objectif, le matériel disponible et la récupération (48h sur les groupes lourds).

Les séances doivent toujours tenir en 90–110 minutes maximum et respecter les intensités et repos indiqués.

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
          "weight_kg": 60,
          "video_url": "URL YouTube complète d'une vidéo démonstration de l'exercice (obligatoire)"
        }
      ]
    }
  ]
}

IMPORTANT : Pour chaque exercice, tu DOIS trouver et fournir une URL YouTube de démonstration valide. Cherche des vidéos de qualité en français si possible, sinon en anglais. L'URL doit être complète (ex: https://www.youtube.com/watch?v=...).`;

    // Construire le prompt utilisateur avec toutes les données
    let userPrompt = `Génère un programme d'entraînement hebdomadaire personnalisé.

PROFIL :
- Âge : ${profile.age} ans
- Niveau : ${profile.level}
- Objectif : ${profile.goal}
- Séances par semaine : ${profile.sessions_per_week}
- Jours disponibles : ${profile.available_days.join(", ")}
- Matériel disponible : ${profile.equipment || "Non spécifié"}
- Contraintes/zones sensibles : ${profile.constraints || "Aucune"}
- Durée cible par séance : ${profile.session_duration_minutes || 60} minutes

`;

    // Ajouter l'historique des sessions si disponible
    if (recentSessions && recentSessions.length > 0 && sessionSets.length > 0) {
      // Calculer les statistiques à partir des sessions
      const totalWeeks = 4;
      const avgSessionsPerWeek = (recentSessions.length / totalWeeks).toFixed(1);
      const avgWeeklyVolume = (
        recentSessions.reduce((sum, s) => sum + (s.total_tonnage || 0), 0) / totalWeeks
      ).toFixed(0);

      // Grouper les sets par exercice
      const exerciseStats: Record<string, any> = {};
      sessionSets.forEach((set: any) => {
        const exName = set.exercises?.name || "Inconnu";
        if (!exerciseStats[exName]) {
          exerciseStats[exName] = {
            name: exName,
            muscle_group: set.exercises?.muscle_group || "Inconnu",
            best_weight: 0,
            total_sets: 0,
            sessions: new Set(),
          };
        }
        exerciseStats[exName].best_weight = Math.max(
          exerciseStats[exName].best_weight,
          set.weight_kg || 0
        );
        exerciseStats[exName].total_sets++;
        exerciseStats[exName].sessions.add(set.session_id);
      });

      const exercisesUsed = Object.values(exerciseStats)
        .map((ex: any) => ({
          name: ex.name,
          muscle_group: ex.muscle_group,
          best_weight: ex.best_weight,
          frequency: ex.sessions.size,
        }))
        .sort((a, b) => b.frequency - a.frequency);

      // Volume par groupe musculaire
      const muscleGroupVolumes: Record<string, number> = {};
      sessionSets.forEach((set: any) => {
        const mg = set.exercises?.muscle_group || "Inconnu";
        muscleGroupVolumes[mg] = (muscleGroupVolumes[mg] || 0) + 1;
      });

      const mgVolumes = Object.entries(muscleGroupVolumes)
        .map(([mg, sets]) => ({
          muscle_group: mg,
          avg_weekly_sets: (sets / totalWeeks).toFixed(1),
        }))
        .sort((a, b) => parseFloat(b.avg_weekly_sets) - parseFloat(a.avg_weekly_sets));

      userPrompt += `HISTORIQUE DES 4 DERNIÈRES SEMAINES :
- Nombre de séances réalisées : ${recentSessions.length} (moyenne ${avgSessionsPerWeek}/semaine)
- Volume total moyen/semaine : ${avgWeeklyVolume} kg

Exercices utilisés récemment (avec meilleur poids) :
${exercisesUsed
  .slice(0, 15)
  .map((ex) => `- ${ex.name} (${ex.muscle_group}) : ${ex.best_weight}kg, utilisé ${ex.frequency}x`)
  .join("\n")}

Volume par groupe musculaire (séries/semaine) :
${mgVolumes.map((mg) => `- ${mg.muscle_group} : ${mg.avg_weekly_sets} séries`).join("\n")}

IMPORTANT : Utilise cet historique pour proposer des poids réalistes et cohérents. Ne propose pas de poids trop élevés par rapport aux meilleures charges passées.

`;
    } else {
      userPrompt += `AUCUN HISTORIQUE DISPONIBLE - Estime des poids de départ réalistes selon le profil (âge, niveau).

`;
    }

    // Ajouter la liste des exercices disponibles
    userPrompt += `EXERCICES DISPONIBLES DANS LA BIBLIOTHÈQUE :
${exercises.map((ex: any) => `- ${ex.name} (${ex.muscle_group}, ${ex.measurement_type})`).join("\n")}

Génère maintenant ${profile.sessions_per_week} séances cohérentes entre elles, en respectant les jours disponibles (${profile.available_days.join(", ")}).`;

    console.log("Appel à l'API OpenAI...");

    // Appeler l'API OpenAI
    const response = await fetch(aiSettings.base_url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiSettings.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiSettings.model_name || "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erreur API OpenAI:", response.status, errorText);
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json();
    const generatedPlan = JSON.parse(data.choices[0].message.content);

    console.log("Plan généré avec succès:", generatedPlan.sessions.length, "séances");

    // Logger l'interaction AI dans la base de données
    try {
      await supabase.from("ai_interactions_log").insert({
        user_id: user.id,
        function_name: "ai-generate-week-plan",
        prompt: `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`,
        response: JSON.stringify(generatedPlan),
      });
    } catch (logError) {
      console.error("Erreur lors du logging AI:", logError);
      // Ne pas bloquer la réponse si le logging échoue
    }

    return new Response(JSON.stringify({ plan: generatedPlan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erreur dans ai-generate-week-plan:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur inconnue",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
