import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { History, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface LastSetReminderProps {
  exerciseId: number;
  currentSessionId: number;
}

/**
 * Affiche un rappel visuel du dernier set réalisé pour cet exercice
 * lors de la précédente séance
 */
export function LastSetReminder({ exerciseId, currentSessionId }: LastSetReminderProps) {
  const { data: lastExerciseData } = useQuery({
    queryKey: ["last_exercise_sets", exerciseId, currentSessionId],
    queryFn: async () => {
      // Trouver la dernière séance complétée (autre que la session actuelle)
      const { data: lastSession, error: sessionError } = await supabase
        .from("sessions")
        .select("id, started_at")
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
        .limit(10);
      
      if (sessionError || !lastSession?.length) return null;
      
      // Trouver les sets de cet exercice dans les dernières séances
      for (const session of lastSession) {
        if (session.id === currentSessionId) continue;
        
        const { data: sets, error: setsError } = await supabase
          .from("session_sets")
          .select("*")
          .eq("session_id", session.id)
          .eq("exercise_id", exerciseId)
          .eq("is_warmup", 0)
          .order("set_index");
        
        if (!setsError && sets && sets.length > 0) {
          // Calculer le tonnage de cette séance pour cet exercice
          const tonnage = sets.reduce((sum, s) => sum + (s.reps * Number(s.weight_kg)), 0);
          const avgRpe = sets.reduce((sum, s) => sum + (s.perceived_difficulty || 7), 0) / sets.length;
          
          // Meilleur set (reps × poids max)
          const bestSet = sets.reduce((best, current) => {
            const bestScore = best.reps * Number(best.weight_kg);
            const currentScore = current.reps * Number(current.weight_kg);
            return currentScore > bestScore ? current : best;
          }, sets[0]);
          
          return {
            sessionDate: session.started_at,
            sets,
            tonnage,
            avgRpe,
            bestSet,
            totalSets: sets.length
          };
        }
      }
      
      return null;
    },
    staleTime: 60000, // Cache pendant 1 minute
  });

  if (!lastExerciseData) return null;

  const sessionDate = new Date(lastExerciseData.sessionDate);
  const formattedDate = format(sessionDate, "EEEE d MMMM", { locale: fr });

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30">
      <CardContent className="py-2 px-3">
        <div className="flex items-start gap-2">
          <History className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">
              Dernière séance • {formattedDate}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs">
              <span className="font-semibold">
                {lastExerciseData.totalSets} sets
              </span>
              <span>
                Meilleur : {lastExerciseData.bestSet.reps} × {Number(lastExerciseData.bestSet.weight_kg).toFixed(1)}kg
              </span>
              <span className="text-muted-foreground">
                RPE moy. {lastExerciseData.avgRpe.toFixed(1)}
              </span>
            </div>
            {/* Afficher un résumé de chaque set */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {lastExerciseData.sets.map((set, idx) => (
                <span
                  key={set.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900/50"
                >
                  #{idx + 1}: {set.reps}×{Number(set.weight_kg).toFixed(0)}kg
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
