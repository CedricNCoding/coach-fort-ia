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

    const { message } = await req.json();
    console.log("Message reçu:", message);

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

    // 8. Récupérer les sets des sessions récentes
    const sessionIds = (recentSessions || []).map(s => s.id);
    const { data: sessionSets } = sessionIds.length > 0 
      ? await supabase
          .from("session_sets")
          .select(`
            id,
            session_id,
            exercise_id,
            set_index,
            reps,
            weight_kg,
            perceived_difficulty,
            pain,
            exercise:exercise_id (name, muscle_group)
          `)
          .in("session_id", sessionIds)
      : { data: [] };

    // 9. Récupérer la mémoire du coach
    const { data: memory } = await supabase
      .from("ai_coach_memory")
      .select("memory_content")
      .eq("user_id", user.id)
      .maybeSingle();

    // 10. Récupérer les templates existants
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
      ? `\nHISTORIQUE (8 semaines):
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

RÈGLES DE PROGRESSION:
- Augmenter de 2.5% si l'utilisateur atteint le haut de sa fourchette de reps
- Maintenir si dans la fourchette
- Réduire de 5% si sous la fourchette ou difficulté > 8
- Ne jamais proposer plus de +5% par séance
- Proposer un deload après 4-6 semaines intensives ou si fatigue accumulée

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
- create_week_plan: { "sessions": [{ "name": "...", "date": "YYYY-MM-DD", "goal": "...", "exercises": [{ "exercise_id": N, "exercise_name": "...", "target_sets": N, "target_reps_min": N, "target_reps_max": N, "target_weight_kg": N }] }] }
- create_session: { "name": "...", "date": "YYYY-MM-DD", "exercises": [...] }
- move_session: { "plannedWorkoutId": N, "newDate": "YYYY-MM-DD" }
- modify_exercise: { "templateExerciseId": N, "updates": { "target_sets": N, "target_weight_kg": N } }
- replace_exercise: { "templateExerciseId": N, "newExerciseId": N }
- remove_session: { "plannedWorkoutId": N }
- create_deload: { "sessions": [{ "date": "YYYY-MM-DD", "workoutTemplateId": N }], "deloadFactor": 0.75 }

Si tu n'as pas d'action à proposer, mets un tableau vide pour proposed_actions.

EXERCICES DISPONIBLES (${exercisesWithPrefs.length}):
${exercisesWithPrefs.slice(0, 100).join("\n")}
${exercisesWithPrefs.length > 100 ? `\n... et ${exercisesWithPrefs.length - 100} autres` : ""}
${profileContext}
${weekProgramContext}
${historyStats}
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
