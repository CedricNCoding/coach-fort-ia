import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Heart, Clock, Activity } from "lucide-react";

interface RunsViewProps {
  startDate?: Date;
  endDate?: Date;
}

export function RunsView({ startDate, endDate }: RunsViewProps) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      let query = supabase
        .from("runs")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false });

      if (startDate) {
        query = query.gte("date", format(startDate, "yyyy-MM-dd"));
      }
      if (endDate) {
        query = query.lte("date", format(endDate, "yyyy-MM-dd"));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Aucun run enregistré pour cette période
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculs statistiques
  const totalDistance = runs.reduce((sum, run) => sum + parseFloat(run.distance_km.toString()), 0);
  const totalDuration = runs.reduce((sum, run) => sum + run.duration_minutes, 0);
  const avgPace = totalDuration / totalDistance;

  return (
    <div className="space-y-6">
      {/* Statistiques globales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Distance totale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalDistance.toFixed(1)} km</p>
            <p className="text-xs text-muted-foreground">{runs.length} run{runs.length > 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Temps total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {Math.floor(totalDuration / 60)}h {totalDuration % 60}min
            </p>
            <p className="text-xs text-muted-foreground">
              Allure moy: {avgPace.toFixed(2)} min/km
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              FC moyenne
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const runsWithHR = runs.filter(r => r.avg_heart_rate);
              const avgHR = runsWithHR.length > 0
                ? runsWithHR.reduce((sum, r) => sum + (r.avg_heart_rate || 0), 0) / runsWithHR.length
                : 0;
              return (
                <>
                  <p className="text-2xl font-bold">
                    {avgHR > 0 ? `${avgHR.toFixed(0)} bpm` : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {runsWithHR.length} run{runsWithHR.length > 1 ? 's' : ''} avec FC
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Liste des runs */}
      <div className="space-y-3">
        {runs.map((run) => {
          const pace = run.duration_minutes / parseFloat(run.distance_km.toString());
          return (
            <Card key={run.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {format(new Date(run.date), "d MMMM yyyy", { locale: fr })}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <span>{run.distance_km} km</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{run.duration_minutes} min</span>
                        <span className="text-muted-foreground">({pace.toFixed(2)} min/km)</span>
                      </div>
                      {run.avg_heart_rate && (
                        <div className="flex items-center gap-1">
                          <Heart className="h-4 w-4 text-muted-foreground" />
                          <span>{run.avg_heart_rate} bpm</span>
                          {run.max_heart_rate && (
                            <span className="text-muted-foreground">(max: {run.max_heart_rate})</span>
                          )}
                        </div>
                      )}
                    </div>
                    {run.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{run.notes}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}