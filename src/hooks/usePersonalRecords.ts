import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subWeeks } from "date-fns";

interface PersonalRecord {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string | null;
  maxWeight: number;
  maxVolume: number;
  maxReps: number;
  date: string;
}

interface ExerciseStagnation {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string | null;
  weeksStagnant: number;
  lastWeight: number;
  lastMaxWeight: number;
}

interface MuscleGroupVolume {
  muscleGroup: string;
  currentWeekVolume: number;
  previousWeekVolume: number;
  change: number;
  changePercent: number;
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: ["personal-records"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { records: [], topRecords: [] };

      // Fetch all completed session sets
      const { data: sets, error } = await supabase
        .from("session_sets")
        .select(`
          *,
          exercise:exercises(id, name, muscle_group),
          session:sessions!inner(id, finished_at, user_id, status)
        `)
        .eq("session.user_id", user.id)
        .eq("session.status", "completed")
        .eq("is_warmup", 0)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!sets || sets.length === 0) return { records: [], topRecords: [] };

      // Group by exercise and find PRs
      const exercisePRs: { [key: number]: PersonalRecord } = {};

      sets.forEach(set => {
        const exerciseId = set.exercise.id;
        const weight = Number(set.weight_kg);
        const volume = weight * set.reps;
        const date = set.session.finished_at;

        if (!exercisePRs[exerciseId]) {
          exercisePRs[exerciseId] = {
            exerciseId,
            exerciseName: set.exercise.name,
            muscleGroup: set.exercise.muscle_group,
            maxWeight: weight,
            maxVolume: volume,
            maxReps: set.reps,
            date
          };
        } else {
          if (weight > exercisePRs[exerciseId].maxWeight) {
            exercisePRs[exerciseId].maxWeight = weight;
            exercisePRs[exerciseId].date = date;
          }
          if (volume > exercisePRs[exerciseId].maxVolume) {
            exercisePRs[exerciseId].maxVolume = volume;
          }
          if (set.reps > exercisePRs[exerciseId].maxReps) {
            exercisePRs[exerciseId].maxReps = set.reps;
          }
        }
      });

      const records = Object.values(exercisePRs);
      const topRecords = records
        .sort((a, b) => b.maxWeight - a.maxWeight)
        .slice(0, 5);

      return { records, topRecords };
    }
  });
}

export function useExerciseStagnation() {
  return useQuery({
    queryKey: ["exercise-stagnation"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const threeWeeksAgo = subWeeks(new Date(), 3);
      const sixWeeksAgo = subWeeks(new Date(), 6);

      // Fetch sets from last 6 weeks
      const { data: sets, error } = await supabase
        .from("session_sets")
        .select(`
          *,
          exercise:exercises(id, name, muscle_group),
          session:sessions!inner(id, finished_at, user_id, status)
        `)
        .eq("session.user_id", user.id)
        .eq("session.status", "completed")
        .eq("is_warmup", 0)
        .gte("session.finished_at", sixWeeksAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!sets || sets.length === 0) return [];

      // Group by exercise and analyze progression
      const exerciseData: { [key: number]: { 
        exerciseId: number;
        exerciseName: string;
        muscleGroup: string | null;
        recentMaxWeight: number;
        olderMaxWeight: number;
        lastWeight: number;
        weeksSeen: Set<string>;
      }} = {};

      sets.forEach(set => {
        const exerciseId = set.exercise.id;
        const weight = Number(set.weight_kg);
        const sessionDate = new Date(set.session.finished_at);
        const weekKey = `${sessionDate.getFullYear()}-${Math.floor((sessionDate.getTime() - new Date(sessionDate.getFullYear(), 0, 1).getTime()) / 604800000)}`;
        const isRecent = sessionDate >= threeWeeksAgo;

        if (!exerciseData[exerciseId]) {
          exerciseData[exerciseId] = {
            exerciseId,
            exerciseName: set.exercise.name,
            muscleGroup: set.exercise.muscle_group,
            recentMaxWeight: 0,
            olderMaxWeight: 0,
            lastWeight: weight,
            weeksSeen: new Set()
          };
        }

        exerciseData[exerciseId].weeksSeen.add(weekKey);

        if (isRecent) {
          if (weight > exerciseData[exerciseId].recentMaxWeight) {
            exerciseData[exerciseId].recentMaxWeight = weight;
          }
        } else {
          if (weight > exerciseData[exerciseId].olderMaxWeight) {
            exerciseData[exerciseId].olderMaxWeight = weight;
          }
        }
      });

      // Find stagnating exercises (no progression in 3+ weeks)
      const stagnatingExercises: ExerciseStagnation[] = [];

      Object.values(exerciseData).forEach(ex => {
        const weeksCount = ex.weeksSeen.size;
        // Stagnation: practiced for 3+ weeks but recent max <= older max
        if (weeksCount >= 3 && ex.olderMaxWeight > 0 && ex.recentMaxWeight <= ex.olderMaxWeight) {
          stagnatingExercises.push({
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseName,
            muscleGroup: ex.muscleGroup,
            weeksStagnant: weeksCount,
            lastWeight: ex.lastWeight,
            lastMaxWeight: Math.max(ex.recentMaxWeight, ex.olderMaxWeight)
          });
        }
      });

      return stagnatingExercises.sort((a, b) => b.weeksStagnant - a.weeksStagnant);
    }
  });
}

export function useMuscleGroupVolume() {
  return useQuery({
    queryKey: ["muscle-group-volume-comparison"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
      thisWeekStart.setHours(0, 0, 0, 0);

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setMilliseconds(-1);

      // Fetch this week's sets
      const { data: thisWeekSets } = await supabase
        .from("session_sets")
        .select(`
          *,
          exercise:exercises(id, name, muscle_group),
          session:sessions!inner(id, finished_at, user_id, status)
        `)
        .eq("session.user_id", user.id)
        .eq("session.status", "completed")
        .eq("is_warmup", 0)
        .gte("session.finished_at", thisWeekStart.toISOString());

      // Fetch last week's sets
      const { data: lastWeekSets } = await supabase
        .from("session_sets")
        .select(`
          *,
          exercise:exercises(id, name, muscle_group),
          session:sessions!inner(id, finished_at, user_id, status)
        `)
        .eq("session.user_id", user.id)
        .eq("session.status", "completed")
        .eq("is_warmup", 0)
        .gte("session.finished_at", lastWeekStart.toISOString())
        .lt("session.finished_at", thisWeekStart.toISOString());

      // Calculate volume per muscle group
      const calculateVolume = (sets: any[]) => {
        const volumeByMuscle: { [key: string]: number } = {};
        (sets || []).forEach(set => {
          const muscleGroup = set.exercise?.muscle_group || "Autre";
          const volume = Number(set.weight_kg) * set.reps;
          volumeByMuscle[muscleGroup] = (volumeByMuscle[muscleGroup] || 0) + volume;
        });
        return volumeByMuscle;
      };

      const thisWeekVolume = calculateVolume(thisWeekSets || []);
      const lastWeekVolume = calculateVolume(lastWeekSets || []);

      // Combine and compare
      const allMuscleGroups = new Set([
        ...Object.keys(thisWeekVolume),
        ...Object.keys(lastWeekVolume)
      ]);

      const comparison: MuscleGroupVolume[] = [];

      allMuscleGroups.forEach(muscleGroup => {
        const current = thisWeekVolume[muscleGroup] || 0;
        const previous = lastWeekVolume[muscleGroup] || 0;
        const change = current - previous;
        const changePercent = previous > 0 ? ((change / previous) * 100) : (current > 0 ? 100 : 0);

        comparison.push({
          muscleGroup,
          currentWeekVolume: Math.round(current),
          previousWeekVolume: Math.round(previous),
          change: Math.round(change),
          changePercent: Math.round(changePercent)
        });
      });

      return comparison.sort((a, b) => b.currentWeekVolume - a.currentWeekVolume);
    }
  });
}
