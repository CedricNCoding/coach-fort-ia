import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, Calendar, Dumbbell, RefreshCw, Trash2, TrendingDown } from "lucide-react";
import { useCoachActions, ProposedAction, ProposedSession } from "@/hooks/useCoachActions";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ProposedActionCardProps {
  action: ProposedAction;
  onComplete?: () => void;
}

export function ProposedActionCard({ action, onComplete }: ProposedActionCardProps) {
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">("pending");
  const [isLoading, setIsLoading] = useState(false);
  const { 
    applyCreateWeekPlan, 
    applyMoveSession, 
    applyModifyExercise, 
    applyReplaceExercise, 
    applyRemoveSession,
    applyDeload 
  } = useCoachActions();

  const handleAccept = async () => {
    setIsLoading(true);
    try {
      switch (action.type) {
        case "create_week_plan":
          await applyCreateWeekPlan.mutateAsync(action.data.sessions as ProposedSession[]);
          break;
        case "create_session":
          await applyCreateWeekPlan.mutateAsync([action.data as ProposedSession]);
          break;
        case "move_session":
          await applyMoveSession.mutateAsync(action.data);
          break;
        case "modify_exercise":
          await applyModifyExercise.mutateAsync(action.data);
          break;
        case "replace_exercise":
          await applyReplaceExercise.mutateAsync(action.data);
          break;
        case "remove_session":
          await applyRemoveSession.mutateAsync(action.data.plannedWorkoutId);
          break;
        case "create_deload":
          await applyDeload.mutateAsync(action.data);
          break;
      }
      setStatus("accepted");
      onComplete?.();
    } catch (error) {
      console.error("Error applying action:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = () => {
    setStatus("rejected");
  };

  const getActionIcon = () => {
    switch (action.type) {
      case "create_week_plan":
        return <Calendar className="h-4 w-4" />;
      case "create_session":
        return <Dumbbell className="h-4 w-4" />;
      case "move_session":
        return <RefreshCw className="h-4 w-4" />;
      case "modify_exercise":
      case "replace_exercise":
        return <Dumbbell className="h-4 w-4" />;
      case "remove_session":
        return <Trash2 className="h-4 w-4" />;
      case "create_deload":
        return <TrendingDown className="h-4 w-4" />;
      default:
        return <Dumbbell className="h-4 w-4" />;
    }
  };

  const getActionLabel = () => {
    switch (action.type) {
      case "create_week_plan":
        return "Programme de la semaine";
      case "create_session":
        return "Nouvelle séance";
      case "move_session":
        return "Déplacer séance";
      case "modify_exercise":
        return "Modifier exercice";
      case "replace_exercise":
        return "Remplacer exercice";
      case "remove_session":
        return "Supprimer séance";
      case "create_deload":
        return "Semaine de décharge";
      default:
        return "Action";
    }
  };

  if (status === "accepted") {
    return (
      <Card className="bg-green-500/10 border-green-500/30">
        <CardContent className="py-3 flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700 dark:text-green-400">
            Action appliquée avec succès
          </span>
        </CardContent>
      </Card>
    );
  }

  if (status === "rejected") {
    return (
      <Card className="bg-muted/50 border-muted">
        <CardContent className="py-3 flex items-center gap-2">
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Action refusée
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              {getActionIcon()}
              {getActionLabel()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 space-y-3">
        {/* Résumé */}
        <p className="text-sm">{action.summary}</p>

        {/* Détails pour create_week_plan */}
        {action.type === "create_week_plan" && action.data.sessions && (
          <div className="space-y-2">
            {action.data.sessions.map((session: ProposedSession, idx: number) => (
              <div key={idx} className="text-xs bg-background/50 rounded p-2">
                <div className="font-medium">
                  {format(new Date(session.date), "EEEE d MMMM", { locale: fr })} - {session.name}
                </div>
                <div className="text-muted-foreground mt-1">
                  {session.exercises?.length || 0} exercices
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Détails pour create_session */}
        {action.type === "create_session" && action.data && (
          <div className="text-xs bg-background/50 rounded p-2">
            <div className="font-medium">{action.data.name}</div>
            <div className="text-muted-foreground mt-1">
              {action.data.exercises?.length || 0} exercices
            </div>
          </div>
        )}

        {/* Boutons */}
        <div className="flex gap-2">
          <Button 
            size="sm" 
            onClick={handleAccept} 
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Accepter
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleReject}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
