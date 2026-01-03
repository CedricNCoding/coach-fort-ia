import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { useMuscleGroupVolume } from "@/hooks/usePersonalRecords";
import { cn } from "@/lib/utils";

export function MuscleVolumeComparisonCard() {
  const { data: muscleVolumes, isLoading } = useMuscleGroupVolume();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!muscleVolumes || muscleVolumes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Volume par groupe musculaire
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Pas de données cette semaine
          </p>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = (changePercent: number) => {
    if (changePercent > 5) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (changePercent < -5) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = (changePercent: number) => {
    if (changePercent > 5) return "text-green-500";
    if (changePercent < -5) return "text-red-500";
    return "text-muted-foreground";
  };

  // Filter to only show muscle groups with activity
  const activeVolumes = muscleVolumes.filter(
    v => v.currentWeekVolume > 0 || v.previousWeekVolume > 0
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Volume vs semaine dernière
        </CardTitle>
        <CardDescription>Comparaison par groupe musculaire</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {activeVolumes.slice(0, 6).map((volume) => (
            <div
              key={volume.muscleGroup}
              className="flex items-center justify-between text-sm"
            >
              <span className="font-medium truncate flex-1">
                {volume.muscleGroup}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {(volume.currentWeekVolume / 1000).toFixed(1)}t
                </span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(volume.changePercent)}
                  <span className={cn("text-xs font-medium", getTrendColor(volume.changePercent))}>
                    {volume.changePercent > 0 ? "+" : ""}{volume.changePercent}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {activeVolumes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Entraînez-vous cette semaine pour voir les comparaisons
          </p>
        )}
      </CardContent>
    </Card>
  );
}
