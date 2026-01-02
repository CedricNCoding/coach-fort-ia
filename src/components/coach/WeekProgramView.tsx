import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, addDays, isSameDay, isToday, isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, Clock, Dumbbell, PersonStanding } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlannedWorkout {
  id: number;
  date: string;
  status: string;
  is_deload: boolean;
  workout_template: {
    id: number;
    name: string;
  } | null;
}

interface PlannedRun {
  id: number;
  date: string;
  status: string;
  target_distance_km: number | null;
}

interface Session {
  id: number;
  started_at: string;
  status: string;
  planned_workout_id: number | null;
}

export function WeekProgramView() {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });

  // Récupérer les séances planifiées de la semaine
  const { data: plannedWorkouts = [] } = useQuery({
    queryKey: ["planned_workouts_week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekEnd = addDays(weekStart, 6);
      const { data, error } = await supabase
        .from("planned_workouts")
        .select(`
          id,
          date,
          status,
          is_deload,
          workout_template:workout_template_id (
            id,
            name
          )
        `)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date");

      if (error) throw error;
      return data as unknown as PlannedWorkout[];
    }
  });

  // Récupérer les runs planifiés
  const { data: plannedRuns = [] } = useQuery({
    queryKey: ["planned_runs_week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekEnd = addDays(weekStart, 6);
      const { data, error } = await supabase
        .from("planned_runs")
        .select("*")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date");

      if (error) throw error;
      return data as PlannedRun[];
    }
  });

  // Récupérer les séances effectuées cette semaine
  const { data: completedSessions = [] } = useQuery({
    queryKey: ["sessions_week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekEnd = addDays(weekStart, 6);
      const { data, error } = await supabase
        .from("sessions")
        .select("id, started_at, status, planned_workout_id")
        .gte("started_at", weekStart.toISOString())
        .lte("started_at", addDays(weekEnd, 1).toISOString())
        .eq("status", "completed");

      if (error) throw error;
      return data as Session[];
    }
  });

  // Générer les 7 jours de la semaine
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, "yyyy-MM-dd");

    const workoutsForDay = plannedWorkouts.filter(pw => pw.date === dateStr);
    const runsForDay = plannedRuns.filter(pr => pr.date === dateStr);
    
    // Vérifier si une séance planifiée a été complétée
    const completedWorkoutIds = completedSessions
      .filter(s => s.planned_workout_id && workoutsForDay.some(pw => pw.id === s.planned_workout_id))
      .map(s => s.planned_workout_id);

    return {
      date,
      dateStr,
      dayName: format(date, "EEE", { locale: fr }),
      dayNumber: format(date, "d"),
      isToday: isToday(date),
      isPast: isPast(date) && !isToday(date),
      workouts: workoutsForDay.map(w => ({
        ...w,
        isCompleted: completedWorkoutIds.includes(w.id)
      })),
      runs: runsForDay
    };
  });

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-3">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Dumbbell className="h-4 w-4" />
          Programme de la semaine
        </h3>
        
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => (
            <div 
              key={day.dateStr}
              className={cn(
                "text-center p-2 rounded-lg transition-colors",
                day.isToday && "bg-primary/20 ring-2 ring-primary",
                !day.isToday && "bg-background/50"
              )}
            >
              {/* Nom du jour */}
              <div className="text-[10px] uppercase text-muted-foreground font-medium">
                {day.dayName}
              </div>
              
              {/* Numéro du jour */}
              <div className={cn(
                "text-lg font-bold mb-1",
                day.isToday && "text-primary"
              )}>
                {day.dayNumber}
              </div>

              {/* Séances */}
              <div className="space-y-1">
                {day.workouts.map((workout) => (
                  <div 
                    key={workout.id}
                    className={cn(
                      "text-[9px] px-1 py-0.5 rounded truncate",
                      workout.isCompleted && "bg-green-500/20 text-green-700 dark:text-green-400",
                      !workout.isCompleted && day.isPast && "bg-red-500/20 text-red-700 dark:text-red-400",
                      !workout.isCompleted && !day.isPast && "bg-primary/10 text-primary"
                    )}
                    title={workout.workout_template?.name || "Séance"}
                  >
                    {workout.isCompleted ? (
                      <CheckCircle2 className="h-3 w-3 mx-auto" />
                    ) : day.isPast ? (
                      <XCircle className="h-3 w-3 mx-auto" />
                    ) : (
                      <Dumbbell className="h-3 w-3 mx-auto" />
                    )}
                  </div>
                ))}

                {day.runs.map((run) => (
                  <div 
                    key={run.id}
                    className={cn(
                      "text-[9px] px-1 py-0.5 rounded",
                      run.status === "completed" && "bg-green-500/20 text-green-700 dark:text-green-400",
                      run.status !== "completed" && day.isPast && "bg-red-500/20 text-red-700 dark:text-red-400",
                      run.status !== "completed" && !day.isPast && "bg-blue-500/20 text-blue-700 dark:text-blue-400"
                    )}
                  >
                    <PersonStanding className="h-3 w-3 mx-auto" />
                  </div>
                ))}

                {/* Jour vide */}
                {day.workouts.length === 0 && day.runs.length === 0 && (
                  <div className="text-[9px] text-muted-foreground">
                    Repos
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
