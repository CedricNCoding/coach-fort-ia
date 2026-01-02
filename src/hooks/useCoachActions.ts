import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProposedSession {
  name: string;
  date: string;
  goal?: string;
  notes?: string;
  exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    target_weight_kg?: number;
    target_rest_seconds?: number;
    superset_group?: string;
  }>;
}

export interface ProposedAction {
  type: "create_week_plan" | "create_session" | "move_session" | "modify_exercise" | "replace_exercise" | "remove_session" | "create_deload";
  summary: string;
  data: any;
}

export function useCoachActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Créer un plan de semaine complet
  const applyCreateWeekPlan = useMutation({
    mutationFn: async (sessions: ProposedSession[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const createdTemplates: number[] = [];

      for (const session of sessions) {
        // 1. Créer le workout_template
        const { data: template, error: templateError } = await supabase
          .from("workout_templates")
          .insert({
            user_id: user.id,
            name: session.name,
            goal: session.goal || null,
            notes: session.notes || null
          })
          .select()
          .single();

        if (templateError) throw templateError;
        createdTemplates.push(template.id);

        // 2. Créer les exercices du template
        if (session.exercises && session.exercises.length > 0) {
          const templateExercises = session.exercises.map((ex, index) => ({
            workout_template_id: template.id,
            exercise_id: ex.exercise_id,
            order_index: index,
            target_sets: ex.target_sets,
            target_reps_min: ex.target_reps_min,
            target_reps_max: ex.target_reps_max,
            target_weight_kg: ex.target_weight_kg || null,
            target_rest_seconds: ex.target_rest_seconds || 90,
            superset_group: ex.superset_group || null
          }));

          const { error: exError } = await supabase
            .from("workout_template_exercises")
            .insert(templateExercises);

          if (exError) throw exError;
        }

        // 3. Créer le planned_workout
        const { error: plannedError } = await supabase
          .from("planned_workouts")
          .insert({
            user_id: user.id,
            date: session.date,
            slot: 1,
            workout_template_id: template.id,
            status: "planned"
          });

        if (plannedError) throw plannedError;
      }

      return createdTemplates;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      queryClient.invalidateQueries({ queryKey: ["workout_templates"] });
      toast({ title: "Programme créé avec succès !" });
    },
    onError: (error) => {
      toast({ 
        variant: "destructive", 
        title: "Erreur", 
        description: error instanceof Error ? error.message : "Erreur lors de la création" 
      });
    }
  });

  // Créer une seule séance
  const applyCreateSession = useMutation({
    mutationFn: async (session: ProposedSession) => {
      return applyCreateWeekPlan.mutateAsync([session]);
    }
  });

  // Déplacer une séance
  const applyMoveSession = useMutation({
    mutationFn: async ({ plannedWorkoutId, newDate }: { plannedWorkoutId: number; newDate: string }) => {
      const { error } = await supabase
        .from("planned_workouts")
        .update({ date: newDate })
        .eq("id", plannedWorkoutId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Séance déplacée" });
    }
  });

  // Modifier un exercice du template
  const applyModifyExercise = useMutation({
    mutationFn: async ({ 
      templateExerciseId, 
      updates 
    }: { 
      templateExerciseId: number; 
      updates: { target_sets?: number; target_reps_min?: number; target_reps_max?: number; target_weight_kg?: number } 
    }) => {
      const { error } = await supabase
        .from("workout_template_exercises")
        .update(updates)
        .eq("id", templateExerciseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_templates"] });
      toast({ title: "Exercice modifié" });
    }
  });

  // Remplacer un exercice
  const applyReplaceExercise = useMutation({
    mutationFn: async ({ templateExerciseId, newExerciseId }: { templateExerciseId: number; newExerciseId: number }) => {
      const { error } = await supabase
        .from("workout_template_exercises")
        .update({ exercise_id: newExerciseId })
        .eq("id", templateExerciseId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_templates"] });
      toast({ title: "Exercice remplacé" });
    }
  });

  // Supprimer une séance planifiée
  const applyRemoveSession = useMutation({
    mutationFn: async (plannedWorkoutId: number) => {
      const { error } = await supabase
        .from("planned_workouts")
        .delete()
        .eq("id", plannedWorkoutId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Séance supprimée" });
    }
  });

  // Créer une semaine de décharge
  const applyDeload = useMutation({
    mutationFn: async ({ 
      sessions, 
      deloadFactor = 0.75 
    }: { 
      sessions: Array<{ date: string; workoutTemplateId: number }>; 
      deloadFactor?: number 
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      for (const session of sessions) {
        const { error } = await supabase
          .from("planned_workouts")
          .insert({
            user_id: user.id,
            date: session.date,
            slot: 1,
            workout_template_id: session.workoutTemplateId,
            status: "planned",
            is_deload: true,
            deload_factor: deloadFactor
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Semaine de décharge créée" });
    }
  });

  return {
    applyCreateWeekPlan,
    applyCreateSession,
    applyMoveSession,
    applyModifyExercise,
    applyReplaceExercise,
    applyRemoveSession,
    applyDeload
  };
}
