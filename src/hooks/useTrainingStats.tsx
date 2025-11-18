import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subWeeks } from "date-fns";

/**
 * Hook pour récupérer les statistiques d'entraînement des 8 dernières semaines
 * Utilisé pour alimenter la génération IA de plans hebdomadaires
 */
export function useTrainingStats() {
  return useQuery({
    queryKey: ["training-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const eightWeeksAgo = subWeeks(new Date(), 8).toISOString();

      // Récupérer toutes les séances des 8 dernières semaines
      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select(`
          id,
          started_at,
          total_tonnage,
          avg_difficulty
        `)
        .eq("user_id", user.id)
        .gte("started_at", eightWeeksAgo)
        .eq("status", "completed")
        .order("started_at", { ascending: false });

      if (sessionsError) throw sessionsError;

      if (!sessions || sessions.length === 0) {
        return {
          has_data: false,
          avg_sessions_per_week: 0,
          avg_weekly_volume: 0,
          exercises_used: [],
          muscle_group_volumes: []
        };
      }

      // Récupérer tous les sets de ces séances avec infos exercices
      const sessionIds = sessions.map(s => s.id);
      const { data: sets, error: setsError } = await supabase
        .from("session_sets")
        .select(`
          exercise_id,
          weight_kg,
          reps,
          exercises (
            name,
            muscle_group
          )
        `)
        .in("session_id", sessionIds);

      if (setsError) throw setsError;

      // Calculer les stats par exercice
      const exerciseStats = new Map<number, {
        name: string;
        muscle_group: string;
        best_weight: number;
        total_volume: number;
        frequency: number;
      }>();

      sets?.forEach(set => {
        const ex = set.exercises as any;
        if (!ex) return;

        if (!exerciseStats.has(set.exercise_id)) {
          exerciseStats.set(set.exercise_id, {
            name: ex.name,
            muscle_group: ex.muscle_group || 'autre',
            best_weight: set.weight_kg,
            total_volume: 0,
            frequency: 0
          });
        }

        const stats = exerciseStats.get(set.exercise_id)!;
        stats.best_weight = Math.max(stats.best_weight, set.weight_kg);
        stats.total_volume += set.weight_kg * set.reps;
      });

      // Compter la fréquence (nombre de séances où l'exercice apparaît)
      const exerciseFrequency = new Map<number, Set<number>>();
      sets?.forEach(set => {
        if (!exerciseFrequency.has(set.exercise_id)) {
          exerciseFrequency.set(set.exercise_id, new Set());
        }
        // On ne sait pas quel session_id, mais on peut compter les occurrences uniques
        exerciseFrequency.get(set.exercise_id)!.add(set.exercise_id); // approximation
      });

      // Calculer les stats par groupe musculaire
      const muscleGroupStats = new Map<string, {
        total_sets: number;
        sessions_with_group: Set<number>;
      }>();

      sets?.forEach(set => {
        const ex = set.exercises as any;
        if (!ex) return;
        
        const muscleGroup = ex.muscle_group || 'autre';
        if (!muscleGroupStats.has(muscleGroup)) {
          muscleGroupStats.set(muscleGroup, {
            total_sets: 0,
            sessions_with_group: new Set()
          });
        }
        
        muscleGroupStats.get(muscleGroup)!.total_sets++;
      });

      // Calculer les moyennes
      const weekCount = 8;
      const avgSessionsPerWeek = sessions.length / weekCount;
      const avgWeeklyVolume = sessions.reduce((sum, s) => sum + (s.total_tonnage || 0), 0) / weekCount;

      const exercisesUsed = Array.from(exerciseStats.entries())
        .map(([id, stats]) => ({
          exercise_id: id,
          name: stats.name,
          muscle_group: stats.muscle_group,
          best_weight: Math.round(stats.best_weight * 10) / 10,
          total_volume: Math.round(stats.total_volume),
          frequency: Math.ceil(stats.total_volume / avgWeeklyVolume * sessions.length) // approximation
        }))
        .sort((a, b) => b.total_volume - a.total_volume)
        .slice(0, 20); // Top 20 exercices

      const muscleGroupVolumes = Array.from(muscleGroupStats.entries())
        .map(([muscle_group, stats]) => ({
          muscle_group,
          avg_weekly_sets: Math.round(stats.total_sets / weekCount)
        }))
        .sort((a, b) => b.avg_weekly_sets - a.avg_weekly_sets);

      return {
        has_data: true,
        avg_sessions_per_week: Math.round(avgSessionsPerWeek * 10) / 10,
        avg_weekly_volume: Math.round(avgWeeklyVolume),
        exercises_used: exercisesUsed,
        muscle_group_volumes: muscleGroupVolumes
      };
    }
  });
}