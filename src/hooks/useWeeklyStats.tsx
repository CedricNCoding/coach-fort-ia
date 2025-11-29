import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subWeeks, startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Hook pour récupérer les statistiques hebdomadaires (musculation + running)
 * Utilisé pour la page Coach de la semaine
 */
export function useWeeklyStats() {
  return useQuery({
    queryKey: ["weekly-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const now = new Date();
      const currentWeekStart = startOfWeek(now, { locale: fr });
      const currentWeekEnd = endOfWeek(now, { locale: fr });
      const eightWeeksAgo = subWeeks(currentWeekStart, 8);

      // === SEMAINE EN COURS ===
      
      // Séances musculation
      const { data: currentWeekSessions } = await supabase
        .from("sessions")
        .select("id, total_tonnage, avg_difficulty")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gte("started_at", currentWeekStart.toISOString())
        .lte("started_at", currentWeekEnd.toISOString());

      // Runs
      const { data: currentWeekRuns } = await supabase
        .from("runs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", format(currentWeekStart, "yyyy-MM-dd"))
        .lte("date", format(currentWeekEnd, "yyyy-MM-dd"));

      // Douleurs
      const sessionIds = currentWeekSessions?.map(s => s.id) || [];
      const { data: painSets } = await supabase
        .from("session_sets")
        .select("pain, pain_notes")
        .in("session_id", sessionIds)
        .gt("pain", 0);

      const currentWeekStats = {
        totalSessions: (currentWeekSessions?.length || 0) + (currentWeekRuns?.length || 0),
        strengthSessions: currentWeekSessions?.length || 0,
        runs: currentWeekRuns?.length || 0,
        totalTonnage: Math.round(currentWeekSessions?.reduce((sum, s) => sum + (s.total_tonnage || 0), 0) || 0),
        totalDistance: currentWeekRuns?.reduce((sum, r) => sum + (r.distance_km || 0), 0) || 0,
        avgPace: currentWeekRuns && currentWeekRuns.length > 0
          ? currentWeekRuns.reduce((sum, r) => {
              const pace = r.duration_minutes / r.distance_km;
              return sum + pace;
            }, 0) / currentWeekRuns.length
          : 0,
        avgDifficulty: currentWeekSessions && currentWeekSessions.length > 0
          ? currentWeekSessions.reduce((sum, s) => sum + (s.avg_difficulty || 0), 0) / currentWeekSessions.length
          : 0,
        hasPain: (painSets?.length || 0) > 0
      };

      // === HISTORIQUE 8 SEMAINES ===

      // Séances muscu
      const { data: historySessions } = await supabase
        .from("sessions")
        .select(`
          id,
          started_at,
          total_tonnage,
          avg_difficulty
        `)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gte("started_at", eightWeeksAgo.toISOString())
        .order("started_at", { ascending: true });

      // Sets pour analyse détaillée
      const historySessionIds = historySessions?.map(s => s.id) || [];
      const { data: historySets } = await supabase
        .from("session_sets")
        .select(`
          session_id,
          exercise_id,
          weight_kg,
          reps,
          exercises (
            name,
            muscle_group
          )
        `)
        .in("session_id", historySessionIds);

      // Runs historique
      const { data: historyRuns } = await supabase
        .from("runs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", format(eightWeeksAgo, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      // Calculer volumes par semaine (muscu)
      const weeklyVolumes: { [week: string]: number } = {};
      historySessions?.forEach(session => {
        const weekKey = format(startOfWeek(new Date(session.started_at), { locale: fr }), "yyyy-MM-dd");
        weeklyVolumes[weekKey] = (weeklyVolumes[weekKey] || 0) + (session.total_tonnage || 0);
      });

      // Calculer volumes par groupe musculaire
      const muscleGroupVolumes: { [group: string]: number } = {};
      historySets?.forEach(set => {
        const ex = set.exercises as any;
        if (!ex) return;
        const muscleGroup = ex.muscle_group || 'autre';
        muscleGroupVolumes[muscleGroup] = (muscleGroupVolumes[muscleGroup] || 0) + (set.weight_kg * set.reps);
      });

      // Progression des charges (top 5 exercices)
      const exerciseProgression = new Map<number, {
        name: string;
        maxWeights: { date: string; weight: number }[];
      }>();

      historySets?.forEach(set => {
        const ex = set.exercises as any;
        if (!ex) return;

        if (!exerciseProgression.has(set.exercise_id)) {
          exerciseProgression.set(set.exercise_id, {
            name: ex.name,
            maxWeights: []
          });
        }

        const prog = exerciseProgression.get(set.exercise_id)!;
        const session = historySessions?.find(s => s.id === set.session_id);
        if (session) {
          prog.maxWeights.push({
            date: session.started_at,
            weight: set.weight_kg
          });
        }
      });

      // Garder top 5 exercices par volume total
      const topExercises = Array.from(exerciseProgression.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          totalVolume: data.maxWeights.reduce((sum, w) => sum + w.weight, 0),
          maxWeights: data.maxWeights
        }))
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .slice(0, 5);

      // Distance hebdo running
      const weeklyDistances: { [week: string]: number } = {};
      historyRuns?.forEach(run => {
        const weekKey = format(startOfWeek(new Date(run.date), { locale: fr }), "yyyy-MM-dd");
        weeklyDistances[weekKey] = (weeklyDistances[weekKey] || 0) + run.distance_km;
      });

      // Pace hebdo running
      const weeklyPaces: { [week: string]: { totalPace: number; count: number } } = {};
      historyRuns?.forEach(run => {
        const weekKey = format(startOfWeek(new Date(run.date), { locale: fr }), "yyyy-MM-dd");
        const pace = run.duration_minutes / run.distance_km;
        if (!weeklyPaces[weekKey]) {
          weeklyPaces[weekKey] = { totalPace: 0, count: 0 };
        }
        weeklyPaces[weekKey].totalPace += pace;
        weeklyPaces[weekKey].count += 1;
      });

      const avgWeeklyPaces = Object.entries(weeklyPaces).map(([week, data]) => ({
        week,
        avgPace: data.totalPace / data.count
      }));

      // Tendance générale
      const recentWeeks = Object.keys(weeklyVolumes).slice(-4);
      const olderWeeks = Object.keys(weeklyVolumes).slice(0, -4);
      const recentAvg = recentWeeks.reduce((sum, week) => sum + weeklyVolumes[week], 0) / recentWeeks.length || 0;
      const olderAvg = olderWeeks.reduce((sum, week) => sum + weeklyVolumes[week], 0) / olderWeeks.length || 0;
      
      let trend: 'hausse' | 'stable' | 'baisse' = 'stable';
      if (recentAvg > olderAvg * 1.1) trend = 'hausse';
      else if (recentAvg < olderAvg * 0.9) trend = 'baisse';

      return {
        currentWeek: currentWeekStats,
        history: {
          weeklyVolumes: Object.entries(weeklyVolumes).map(([week, volume]) => ({
            week,
            volume: Math.round(volume)
          })),
          muscleGroupVolumes: Object.entries(muscleGroupVolumes).map(([group, volume]) => ({
            group,
            volume: Math.round(volume)
          })).sort((a, b) => b.volume - a.volume),
          topExercises,
          weeklyDistances: Object.entries(weeklyDistances).map(([week, distance]) => ({
            week,
            distance: Math.round(distance * 10) / 10
          })),
          avgWeeklyPaces,
          trend
        }
      };
    }
  });
}
