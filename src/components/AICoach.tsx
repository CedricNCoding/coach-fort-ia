import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Brain, AlertTriangle, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface CoachResponse {
  memory_update?: string;
  summary: string;
  fatigue_score: number;
  injury_risk: "faible" | "moyen" | "élevé";
  needs_deload: boolean;
  key_observations: string[];
  per_exercise_recommendations?: Array<{
    exercise_name: string;
    change_type: string;
    new_weight_kg?: number;
    new_reps_min?: number;
    new_reps_max?: number;
    reason: string;
  }>;
  suggested_program_for_next_week?: {
    type: "standard" | "deload" | "updated_program";
    sessions: Array<{
      name: string;
      day_of_week: number;
      exercises: Array<{
        name: string;
        sets: number;
        reps_min?: number;
        reps_max?: number;
        weight_kg?: number;
        rest_seconds?: number;
        superset_group?: string;
      }>;
    }>;
  };
  conversational_response?: string;
}

export function AICoach() {
  const [userMessage, setUserMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: latestAnalysis, isLoading } = useQuery({
    queryKey: ["ai-coach-latest"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: { action: "analyze_week", message: "Analyse ma semaine et propose-moi un programme pour la semaine prochaine." }
      });
      if (error) throw error;
      return data as CoachResponse;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const askCoachMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: { action: "conversation", message }
      });
      if (error) throw error;
      return data as CoachResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-coach-latest"] });
      setUserMessage("");
      toast.success("Réponse du Coach reçue");
    },
    onError: (error) => {
      toast.error("Erreur lors de la communication avec le Coach");
      console.error(error);
    }
  });

  const applyProgramMutation = useMutation({
    mutationFn: async (program: CoachResponse["suggested_program_for_next_week"]) => {
      if (!program) throw new Error("Aucun programme à appliquer");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Créer le template de workout
      const { data: template, error: templateError } = await supabase
        .from("workout_templates")
        .insert({
          user_id: user.id,
          name: `Programme Coach IA - Semaine ${new Date().toLocaleDateString()}`,
          goal: program.type === "deload" ? "Décharge" : "Progression",
          recurring_days: program.sessions.map(s => s.day_of_week)
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Pour chaque session, créer les exercices
      for (const session of program.sessions) {
        let orderIndex = 0;
        for (const ex of session.exercises) {
          // Trouver l'exercice dans la base
          const { data: exercises } = await supabase
            .from("exercises")
            .select("id")
            .ilike("name", ex.name)
            .limit(1);

          if (exercises && exercises.length > 0) {
            await supabase.from("workout_template_exercises").insert({
              workout_template_id: template.id,
              exercise_id: exercises[0].id,
              order_index: orderIndex++,
              target_sets: ex.sets,
              target_reps_min: ex.reps_min,
              target_reps_max: ex.reps_max,
              target_weight_kg: ex.weight_kg,
              target_rest_seconds: ex.rest_seconds || 90,
              superset_group: ex.superset_group || null
            });
          }
        }
      }

      return template;
    },
    onSuccess: (template) => {
      toast.success("Programme appliqué avec succès !");
      navigate(`/plans/${template.id}`);
    },
    onError: (error) => {
      toast.error("Erreur lors de l'application du programme");
      console.error(error);
    }
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "faible": return "bg-green-500/20 text-green-700 dark:text-green-400";
      case "moyen": return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
      case "élevé": return "bg-red-500/20 text-red-700 dark:text-red-400";
      default: return "";
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {latestAnalysis && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle>Analyse de la semaine</CardTitle>
              </div>
              <CardDescription>{latestAnalysis.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Score de fatigue</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary"
                        style={{ width: `${(latestAnalysis.fatigue_score / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold">{latestAnalysis.fatigue_score}/10</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Risque blessure</p>
                  <Badge className={getRiskColor(latestAnalysis.injury_risk)}>
                    {latestAnalysis.injury_risk.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {latestAnalysis.needs_deload && (
                <div className="flex items-start gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Semaine de décharge recommandée</p>
                    <p className="text-sm text-muted-foreground">Il est temps de récupérer pour mieux progresser.</p>
                  </div>
                </div>
              )}

              {latestAnalysis.key_observations && latestAnalysis.key_observations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Observations clés
                  </p>
                  <ul className="space-y-1">
                    {latestAnalysis.key_observations.map((obs, i) => (
                      <li key={i} className="text-sm text-muted-foreground pl-4 before:content-['•'] before:mr-2">
                        {obs}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {latestAnalysis.suggested_program_for_next_week && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Programme suggéré ({latestAnalysis.suggested_program_for_next_week.sessions.length} séances)
                  </p>
                  <Button 
                    onClick={() => applyProgramMutation.mutate(latestAnalysis.suggested_program_for_next_week)}
                    disabled={applyProgramMutation.isPending}
                    className="w-full"
                  >
                    {applyProgramMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Appliquer ce programme
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {latestAnalysis.per_exercise_recommendations && latestAnalysis.per_exercise_recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recommandations par exercice</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {latestAnalysis.per_exercise_recommendations.map((rec, i) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-1">
                        <p className="font-semibold text-sm">{rec.exercise_name}</p>
                        <p className="text-xs text-muted-foreground">{rec.reason}</p>
                        {rec.new_weight_kg && (
                          <p className="text-xs">
                            Nouveau poids : <span className="font-semibold">{rec.new_weight_kg} kg</span>
                            {rec.new_reps_min && rec.new_reps_max && (
                              <span> • Reps : {rec.new_reps_min}-{rec.new_reps_max}</span>
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discuter avec le Coach</CardTitle>
          <CardDescription>Posez vos questions ou demandez des conseils personnalisés</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestAnalysis?.conversational_response && (
            <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg">
              <p className="text-sm">{latestAnalysis.conversational_response}</p>
            </div>
          )}
          <div className="space-y-2">
            <Textarea
              placeholder="Ex: Pourquoi recommandes-tu cette variation ? Comment gérer ma douleur à l'épaule ?"
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              rows={3}
            />
            <Button 
              onClick={() => askCoachMutation.mutate(userMessage)}
              disabled={!userMessage.trim() || askCoachMutation.isPending}
              className="w-full"
            >
              {askCoachMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer au Coach
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
