import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Timer } from "lucide-react";

interface EstimatedTimeCardProps {
  templateExercises: any[];
  sessionSets: any[];
  elapsedSeconds: number;
}

export function EstimatedTimeCard({ templateExercises, sessionSets, elapsedSeconds }: EstimatedTimeCardProps) {
  const { remainingMinutes, progress, totalSets, completedSets } = useMemo(() => {
    // Count total target sets
    const total = templateExercises.reduce((sum, ex) => sum + (ex.target_sets || 3), 0);
    
    // Count completed work sets (excluding warmups)
    const completed = sessionSets.filter(s => s.is_warmup === 0).length;

    // Estimate average time per set (including rest)
    // Default: 45s for set + 90s rest = ~2.25 min per set
    const avgSecondsPerSet = 135;
    
    // If we have some history, calculate actual average
    let actualAvgSecondsPerSet = avgSecondsPerSet;
    if (completed > 0 && elapsedSeconds > 60) {
      actualAvgSecondsPerSet = Math.round(elapsedSeconds / completed);
      // Clamp to reasonable range
      actualAvgSecondsPerSet = Math.max(60, Math.min(300, actualAvgSecondsPerSet));
    }

    const remainingSets = Math.max(0, total - completed);
    const remainingSeconds = remainingSets * actualAvgSecondsPerSet;
    const remainingMins = Math.round(remainingSeconds / 60);

    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      remainingMinutes: remainingMins,
      progress: progressPercent,
      totalSets: total,
      completedSets: completed
    };
  }, [templateExercises, sessionSets, elapsedSeconds]);

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Timer className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Temps restant estimé</p>
              <p className="text-xs text-muted-foreground">
                {completedSets}/{totalSets} séries • {progress}%
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary">
              {remainingMinutes > 0 ? `~${formatTime(remainingMinutes)}` : "Terminé !"}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
