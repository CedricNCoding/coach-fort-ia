import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingUp, Loader2 } from "lucide-react";
import { usePersonalRecords } from "@/hooks/usePersonalRecords";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function PersonalRecordsCard() {
  const { data, isLoading } = usePersonalRecords();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const topRecords = data?.topRecords || [];

  if (topRecords.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Records Personnels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucun record enregistré. Commencez à vous entraîner !
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Records Personnels
        </CardTitle>
        <CardDescription>Vos meilleures performances</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topRecords.map((record, index) => (
            <div
              key={record.exerciseId}
              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-muted-foreground">
                  #{index + 1}
                </span>
                <div>
                  <p className="font-medium text-sm">{record.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">
                    {record.muscleGroup || "Non catégorisé"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{record.maxWeight} kg</p>
                <p className="text-xs text-muted-foreground">
                  {record.date && format(parseISO(record.date), "dd MMM", { locale: fr })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
