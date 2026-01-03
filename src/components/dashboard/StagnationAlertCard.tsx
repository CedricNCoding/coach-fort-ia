import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Loader2, Info } from "lucide-react";
import { useExerciseStagnation } from "@/hooks/usePersonalRecords";
import { Badge } from "@/components/ui/badge";

export function StagnationAlertCard() {
  const { data: stagnatingExercises, isLoading } = useExerciseStagnation();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const exercises = stagnatingExercises || [];

  if (exercises.length === 0) {
    return (
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Info className="h-4 w-4 text-green-500" />
            Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tous vos exercices progressent bien ! 💪
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Stagnation détectée
        </CardTitle>
        <CardDescription>Exercices sans progression depuis 3+ semaines</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {exercises.slice(0, 5).map((exercise) => (
            <div
              key={exercise.exerciseId}
              className="flex items-center justify-between p-2 rounded-lg bg-background"
            >
              <div>
                <p className="font-medium text-sm">{exercise.exerciseName}</p>
                <p className="text-xs text-muted-foreground">
                  {exercise.muscleGroup || "Non catégorisé"}
                </p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                  {exercise.weeksStagnant} sem.
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Max: {exercise.lastMaxWeight} kg
                </p>
              </div>
            </div>
          ))}
        </div>
        {exercises.length > 5 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            +{exercises.length - 5} autre(s) exercice(s)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
