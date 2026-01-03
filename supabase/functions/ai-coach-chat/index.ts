import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authentification
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, sessionParams } = await req.json();
    console.log("Message reçu:", message, "Params:", sessionParams);

    // 1. Récupérer le profil utilisateur avec training_environment
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // 2. Récupérer les préférences d'exercices
    const { data: exercisePreferences } = await supabase
      .from("user_exercise_preferences")
      .select("exercise_id, preference")
      .eq("user_id", user.id);

    // 3. Récupérer tous les exercices disponibles
    const { data: allExercises } = await supabase
      .from("exercises")
      .select("id, name, muscle_group, equipment")
      .or(`user_id.eq.${user.id},is_builtin.eq.1`);

    // 4. Filtrer les exercices selon l'environnement
    const trainingEnv = profile?.training_environment || "gym";
    const filteredExercises = (allExercises || []).filter((ex) => {
      const equip = (ex.equipment || "").toLowerCase();
      
      if (trainingEnv === "gym") {
        return true; // Tout est disponible
      } else if (trainingEnv === "home_equipped") {
        // Exclure machines et poulies
        return !equip.includes("machine") && 
               !equip.includes("poulie") && 
               !equip.includes("cable") &&
               !equip.includes("smith");
      } else {
        // home_minimal : uniquement poids du corps
        return equip === "" || 
               equip.includes("poids du corps") || 
               equip.includes("bodyweight") ||
               equip.includes("aucun");
      }
    });

    // 5. Construire la liste des exercices avec préférences ET IDs
    const prefsMap = new Map((exercisePreferences || []).map(p => [p.exercise_id, p.preference]));
    const exercisesWithPrefs = filteredExercises.map((ex) => {
      const pref = prefsMap.get(ex.id);
      let prefLabel = "";
      if (pref === "loved") prefLabel = " [ADORE]";
      else if (pref === "disliked") prefLabel = " [DETESTE]";
      return `- ID:${ex.id} - ${ex.name} (${ex.muscle_group || "Autre"}, ${ex.equipment || "Aucun"})${prefLabel}`;
    });

    // 6. Récupérer le programme de la semaine en cours
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const { data: plannedWorkouts } = await supabase
      .from("planned_workouts")
      .select(`
        id,
        date,
        status,
        is_deload,
        workout_template:workout_template_id (
          id,
          name,
          goal,
          workout_template_exercises (
            id,
            order_index,
            target_sets,
            target_reps_min,
            target_reps_max,
            target_weight_kg,
            exercise:exercise_id (
              id,
              name,
              muscle_group
            )
          )
        )
      `)
      .eq("user_id", user.id)
      .gte("date", weekStart.toISOString().split("T")[0])
      .lte("date", weekEnd.toISOString().split("T")[0])
      .order("date");

    // 7. Récupérer l'historique des 8 dernières semaines
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const { data: recentSessions } = await supabase
      .from("sessions")
      .select(`
        id,
        started_at,
        finished_at,
        total_tonnage,
        avg_difficulty,
        status,
        notes
      `)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("started_at", eightWeeksAgo.toISOString())
      .order("started_at", { ascending: false });

    // 8. Récupérer les sets des sessions récentes avec dates
    const sessionIds = (recentSessions || []).map(s => s.id);
    const sessionDatesMap = new Map((recentSessions || []).map(s => [s.id, s.started_at]));
    
    const { data: sessionSets } = sessionIds.length > 0 
      ? await supabase
          .from("session_sets")
          .select(`
            id,
            session_id,
            exercise_id,
            template_exercise_id,
            set_index,
            reps,
            weight_kg,
            perceived_difficulty,
            pain,
            is_warmup,
            exercise:exercise_id (name, muscle_group)
          `)
          .in("session_id", sessionIds)
          .eq("is_warmup", 0)
      : { data: [] };

    // 9. Calculer les progressions par exercice
    interface ExerciseProgression {
      exerciseId: number;
      exerciseName: string;
      muscleGroup: string;
      sessions: {
        date: string;
        sets: number;
        bestReps: number;
        bestWeight: number;
        avgDifficulty: number;
        hadPain: boolean;
      }[];
      trend: "PROGRESSION" | "STAGNATION" | "REGRESSION" | "NOUVEAU";
      recommendedWeight: number;
      recommendedNote: string;
    }

    const exerciseProgressions: Map<number, ExerciseProgression> = new Map();
    
    // Grouper les sets par exercice et session
    for (const set of (sessionSets || [])) {
      const exerciseId = set.exercise_id;
      const sessionDate = sessionDatesMap.get(set.session_id) || "";
      const exerciseData = set.exercise as any;
      
      if (!exerciseProgressions.has(exerciseId)) {
        exerciseProgressions.set(exerciseId, {
          exerciseId,
          exerciseName: exerciseData?.name || "Inconnu",
          muscleGroup: exerciseData?.muscle_group || "",
          sessions: [],
          trend: "NOUVEAU",
          recommendedWeight: 0,
          recommendedNote: ""
        });
      }
      
      const prog = exerciseProgressions.get(exerciseId)!;
      const dateStr = sessionDate.split("T")[0];
      
      // Trouver ou créer la session pour cette date
      let sessionEntry = prog.sessions.find(s => s.date === dateStr);
      if (!sessionEntry) {
        sessionEntry = {
          date: dateStr,
          sets: 0,
          bestReps: 0,
          bestWeight: 0,
          avgDifficulty: 0,
          hadPain: false
        };
        prog.sessions.push(sessionEntry);
      }
      
      sessionEntry.sets++;
      sessionEntry.bestReps = Math.max(sessionEntry.bestReps, set.reps);
      sessionEntry.bestWeight = Math.max(sessionEntry.bestWeight, Number(set.weight_kg));
      sessionEntry.avgDifficulty = (sessionEntry.avgDifficulty * (sessionEntry.sets - 1) + (set.perceived_difficulty || 7)) / sessionEntry.sets;
      if (set.pain === 1) sessionEntry.hadPain = true;
    }

    // Calculer les tendances et recommandations
    for (const [exerciseId, prog] of exerciseProgressions) {
      // Trier par date décroissante
      prog.sessions.sort((a, b) => b.date.localeCompare(a.date));
      
      if (prog.sessions.length === 0) {
        prog.trend = "NOUVEAU";
        prog.recommendedNote = "Nouvel exercice - commencer léger";
        continue;
      }
      
      const latest = prog.sessions[0];
      const previous = prog.sessions[1];
      
      // Calculer tendance
      if (!previous) {
        prog.trend = "NOUVEAU";
        prog.recommendedWeight = latest.bestWeight;
        prog.recommendedNote = "Première séance enregistrée";
      } else {
        const weightChange = ((latest.bestWeight - previous.bestWeight) / previous.bestWeight) * 100;
        
        if (weightChange > 2) {
          prog.trend = "PROGRESSION";
        } else if (weightChange < -2) {
          prog.trend = "REGRESSION";
        } else {
          prog.trend = "STAGNATION";
        }
      }
      
      // Calculer recommandation basée sur les règles déterministes
      const lastWeight = latest.bestWeight;
      const lastReps = latest.bestReps;
      const lastDiff = latest.avgDifficulty;
      const hadPain = latest.hadPain;
      
      // Fourchette standard 6-12 reps
      const repsMin = 6;
      const repsMax = 12;
      
      if (hadPain || lastDiff >= 9) {
        // Douleur ou trop difficile: réduire
        prog.recommendedWeight = Math.round(lastWeight * 0.95 * 2) / 2;
        prog.recommendedNote = hadPain 
          ? `Réduire à ${prog.recommendedWeight}kg (douleur signalée)` 
          : `Réduire à ${prog.recommendedWeight}kg (difficulté ${lastDiff.toFixed(1)}/10)`;
      } else if (lastReps >= repsMax) {
        // Atteint le haut du rep range: augmenter
        prog.recommendedWeight = Math.round(lastWeight * 1.025 * 2) / 2;
        prog.recommendedNote = `Augmenter à ${prog.recommendedWeight}kg (${lastReps} reps atteintes)`;
      } else if (lastReps >= repsMin) {
        // Dans le rep range: maintenir
        prog.recommendedWeight = lastWeight;
        prog.recommendedNote = `Maintenir ${lastWeight}kg, pousser vers ${repsMax} reps`;
      } else {
        // Sous le rep range: réduire
        prog.recommendedWeight = Math.round(lastWeight * 0.95 * 2) / 2;
        prog.recommendedNote = `Réduire à ${prog.recommendedWeight}kg (seulement ${lastReps} reps)`;
      }
    }

    // Formater la section progression
    const progressionEntries = Array.from(exerciseProgressions.values())
      .filter(p => p.sessions.length > 0)
      .sort((a, b) => b.sessions.length - a.sessions.length)
      .slice(0, 20); // Top 20 exercices les plus pratiqués

    const progressionContext = progressionEntries.length > 0
      ? `\nPROGRESSION PAR EXERCICE (${progressionEntries.length} exercices récents):\n` + 
        progressionEntries.map(p => {
          const latest = p.sessions[0];
          const history = p.sessions.slice(0, 3).map(s => 
            `  ${s.date}: ${s.sets}x${s.bestReps} @ ${s.bestWeight}kg, diff ${s.avgDifficulty.toFixed(1)}/10${s.hadPain ? " ⚠️DOULEUR" : ""}`
          ).join("\n");
          return `\n${p.exerciseName} (${p.muscleGroup}) - ${p.trend}:
${history}
  → Recommandation: ${p.recommendedNote}`;
        }).join("\n")
      : "";

    // 10. Récupérer la mémoire du coach
    const { data: memory } = await supabase
      .from("ai_coach_memory")
      .select("memory_content")
      .eq("user_id", user.id)
      .maybeSingle();

    // 11. Récupérer les templates existants
    const { data: existingTemplates } = await supabase
      .from("workout_templates")
      .select("id, name, goal")
      .eq("user_id", user.id);

    // Construire le contexte pour le prompt
    const envLabels: Record<string, string> = {
      gym: "Salle de sport (accès complet)",
      home_equipped: "Domicile équipé (haltères, barre, banc)",
      home_minimal: "Domicile minimal (poids du corps uniquement)"
    };

    const profileContext = profile ? `
PROFIL UTILISATEUR:
- Âge: ${profile.age || "Non renseigné"}
- Niveau: ${profile.level || "Non renseigné"}
- Objectif: ${profile.goal || "Non renseigné"}
- Séances/semaine: ${profile.sessions_per_week || "Non renseigné"}
- Durée séance: ${profile.session_duration_minutes || 60} min
- Jours disponibles: ${JSON.stringify(profile.available_days || [])}
- Environnement: ${envLabels[trainingEnv] || trainingEnv}
- Équipement: ${profile.equipment || "Non renseigné"}
- Contraintes: ${profile.constraints || "Aucune"}
` : "Profil non renseigné.";

    const weekProgramContext = (plannedWorkouts || []).length > 0 
      ? `\nPROGRAMME DE LA SEMAINE EN COURS:\n${(plannedWorkouts || []).map(pw => {
          const tpl = pw.workout_template as any;
          const exList = tpl?.workout_template_exercises?.map((e: any) => 
            `  - ${e.exercise?.name}: ${e.target_sets}x${e.target_reps_min}-${e.target_reps_max} @ ${e.target_weight_kg || "?"}kg`
          ).join("\n") || "  (pas d'exercices)";
          return `${pw.date} - ${tpl?.name || "Séance"}${pw.is_deload ? " [DELOAD]" : ""}\n${exList}`;
        }).join("\n\n")}`
      : "\nAucun programme planifié cette semaine.";

    // Statistiques historique
    const sessions = recentSessions || [];
    const historyStats = sessions.length > 0 
      ? `\nHISTORIQUE GLOBAL (8 semaines):
- Séances complétées: ${sessions.length}
- Volume moyen/séance: ${Math.round((sessions.reduce((sum, s) => sum + (s.total_tonnage || 0), 0) / sessions.length))} kg
- Difficulté moyenne: ${(sessions.reduce((sum, s) => sum + (s.avg_difficulty || 0), 0) / sessions.length).toFixed(1)}/10`
      : "\nPas d'historique disponible.";

    const memoryContext = memory?.memory_content 
      ? `\nMÉMOIRE DU COACH:\n${memory.memory_content}` 
      : "";

    const templates = existingTemplates || [];
    const templatesContext = templates.length > 0
      ? `\nTEMPLATES EXISTANTS:\n${templates.map(t => `- ${t.name} (${t.goal || "pas d'objectif"})`).join("\n")}`
      : "";

    // Contexte des paramètres de session demandés par l'utilisateur
    const daysToSchedule = sessionParams?.daysToSchedule || profile?.sessions_per_week || 4;
    const sessionDuration = sessionParams?.sessionDuration || profile?.session_duration_minutes || 60;
    const exercisesPerSession = sessionParams?.exercisesPerSession || 8;
    const forceSupersets = sessionParams?.forceSupersets || false;
    const isDeloadMode = sessionParams?.isDeload || false;

    const sessionParamsContext = `
PARAMÈTRES DE SÉANCE DEMANDÉS:
- Jours à planifier: ${daysToSchedule}
- Durée par séance: ${sessionDuration} min
- Exercices par séance: ${exercisesPerSession}
- Supersets: ${forceSupersets ? "OBLIGATOIRES" : "Optionnels"}
- Mode deload: ${isDeloadMode ? "ACTIVÉ (réduire charges de 25%)" : "Non"}`;

    const supersetRules = `
RÈGLES DE SUPERSETS:
- Organiser les exercices en paires (A1/A2, B1/B2, C1/C2, etc.)
- Privilégier les pairings antagonistes : Pecs ↔ Dos, Biceps ↔ Triceps, Quads ↔ Ischios, Épaules avant ↔ Épaules arrière
- Maximum 2 exercices par superset
- Ajouter "superset_group": "A", "B", "C"... pour chaque exercice dans create_week_plan
- Si supersets ${forceSupersets ? "OBLIGATOIRES" : "optionnels"}: ${forceSupersets ? "TOUS les exercices doivent être en superset" : "utiliser si approprié pour optimiser le temps"}
- Exemple: A1=Développé couché, A2=Rowing barre, B1=Incliné haltères, B2=Tirage vertical`;

    // Construire le prompt système
    const systemPrompt = `Tu es un coach de musculation expert et bienveillant. Tu connais très bien l'utilisateur grâce à son historique et son profil.

RÈGLES CRITIQUES:
1. Tu dois UNIQUEMENT utiliser les exercise_id de la liste "EXERCICES DISPONIBLES" ci-dessous
2. IMPORTANT: Chaque exercice a un ID (format "ID:123"). Tu DOIS utiliser cet ID exact dans exercise_id
3. NE JAMAIS inventer d'ID - utilise SEULEMENT les IDs listés
4. Privilégie les exercices marqués [ADORE]
5. Évite les exercices marqués [DETESTE] sauf nécessité absolue
6. Respecte l'environnement d'entraînement de l'utilisateur
7. Adapte tes propositions au niveau et aux contraintes
8. RESPECTE LES PARAMÈTRES DE SÉANCE demandés par l'utilisateur

${supersetRules}

RÈGLES DE PROGRESSION:
- UTILISE les données de "PROGRESSION PAR EXERCICE" pour proposer des charges adaptées
- Si un exercice a des données historiques, reprends la charge recommandée
- Augmenter de 2.5% si l'utilisateur atteint le haut de sa fourchette de reps (≥12 reps)
- Maintenir si dans la fourchette (6-11 reps)
- Réduire de 5% si sous la fourchette (<6 reps) ou difficulté > 8/10
- Réduire de 5% si DOULEUR signalée
- Ne jamais proposer plus de +5% par séance
- Proposer un deload après 4-6 semaines intensives ou si fatigue accumulée
- Pour les nouveaux exercices sans historique, estimer basé sur des exercices similaires

FORMAT DE RÉPONSE:
Tu dois répondre en JSON avec cette structure exacte:
{
  "text": "Ta réponse conversationnelle ici",
  "memory_update": "Points importants à retenir (optionnel, string ou null)",
  "proposed_actions": [
    {
      "type": "create_week_plan|create_session|move_session|modify_exercise|replace_exercise|remove_session|create_deload",
      "summary": "Description courte de l'action",
      "data": { ... données spécifiques à l'action ... }
    }
  ]
}

TYPES D'ACTIONS:
- create_week_plan: { "sessions": [{ "name": "...", "date": "YYYY-MM-DD", "goal": "...", "exercises": [{ "exercise_id": N, "exercise_name": "...", "superset_group": "A"|"B"|"C"|null, "target_sets": N, "target_reps_min": N, "target_reps_max": N, "target_weight_kg": N }] }] }
  IMPORTANT: Le nom des sessions DOIT inclure le numéro de semaine et l'année. Format: "Nom de séance - S{semaine} {année}" (ex: "Push - S02 2026", "Upper Body - S52 2025")
- create_session: { "name": "...", "date": "YYYY-MM-DD", "exercises": [...] }
  IMPORTANT: Le nom DOIT inclure "S{semaine} {année}" (ex: "Full Body - S02 2026")
- move_session: { "plannedWorkoutId": N, "newDate": "YYYY-MM-DD" }
- modify_exercise: { "templateExerciseId": N, "updates": { "target_sets": N, "target_weight_kg": N } }
- replace_exercise: { "templateExerciseId": N, "newExerciseId": N }
- remove_session: { "plannedWorkoutId": N }
- create_deload: { "sessions": [{ "date": "YYYY-MM-DD", "workoutTemplateId": N }], "deloadFactor": 0.75 }

Si tu n'as pas d'action à proposer, mets un tableau vide pour proposed_actions.
${sessionParamsContext}

EXERCICES DISPONIBLES (${exercisesWithPrefs.length}):
${exercisesWithPrefs.slice(0, 100).join("\n")}
${exercisesWithPrefs.length > 100 ? `\n... et ${exercisesWithPrefs.length - 100} autres` : ""}
${profileContext}
${weekProgramContext}
${historyStats}
${progressionContext}
${templatesContext}
${memoryContext}

Date actuelle: ${new Date().toISOString().split("T")[0]}`;

    const userPrompt = message;

    // Appeler Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Limite de requêtes atteinte. Réessaie dans quelques instants." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";
    
    console.log("Réponse brute de l'IA:", rawContent);

    // Parser la réponse JSON
    let parsedResponse;
    try {
      // Nettoyer le contenu (enlever les backticks markdown si présents)
      let cleanContent = rawContent.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();
      
      parsedResponse = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Erreur de parsing JSON:", parseError);
      // Fallback: retourner le texte brut
      parsedResponse = {
        text: rawContent,
        proposed_actions: []
      };
    }

    // Mettre à jour la mémoire si nécessaire
    if (parsedResponse.memory_update) {
      const newMemory = memory?.memory_content 
        ? `${memory.memory_content}\n\n[${new Date().toLocaleDateString()}] ${parsedResponse.memory_update}`
        : `[${new Date().toLocaleDateString()}] ${parsedResponse.memory_update}`;
      
      await supabase
        .from("ai_coach_memory")
        .upsert({
          user_id: user.id,
          memory_content: newMemory,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
    }

    // Logger l'interaction
    await supabase
      .from("ai_interactions_log")
      .insert({
        user_id: user.id,
        function_name: "ai-coach-chat",
        prompt: message,
        response: JSON.stringify(parsedResponse)
      });

    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erreur dans ai-coach-chat:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erreur inconnue",
      text: "Désolé, une erreur s'est produite. Réessaie dans un instant.",
      proposed_actions: []
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
