import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Page de résumé de séance
 * Affiche les stats, le feedback IA et les propositions de progression
 */
export default function SessionSummary() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [applyToggles, setApplyToggles] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Charger la session
  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, planned_workouts(*, workout_templates(*))")
        .eq("id", parseInt(sessionId!))
        .single();
      if (error) throw error;
      return data;
    }
  });

  // Charger les sets
  const { data: sessionSets = [] } = useQuery({
    queryKey: ["session_sets", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_sets")
        .select("*, exercises(name)")
        .eq("session_id", parseInt(sessionId!))
        .order("set_index");
      if (error) throw error;
      return data;
    }
  });

  // Charger les exercices du template
  const { data: templateExercises = [] } = useQuery({
    queryKey: ["template_exercises", session?.planned_workouts?.workout_template_id],
    queryFn: async () => {
      if (!session?.planned_workouts?.workout_template_id) return [];
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select("*, exercises(name)")
        .eq("workout_template_id", session.planned_workouts.workout_template_id)
        .order("order_index");
      if (error) throw error;
      return data;
    },
    enabled: !!session?.planned_workouts?.workout_template_id
  });

  // Générer le feedback et les propositions
  const generateFeedbackMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const { data, error } = await supabase.functions.invoke("ai-feedback-progression", {
        body: { session_id: parseInt(sessionId!) }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setFeedback(data);
      setIsGenerating(false);
      
      // Initialiser tous les toggles à "appliqué" par défaut
      const toggles: Record<number, boolean> = {};
      data.exercises?.forEach((ex: any) => {
        toggles[ex.template_exercise_id] = true;
      });
      setApplyToggles(toggles);
      
      toast({ title: "Feedback généré !" });
    },
    onError: () => {
      setIsGenerating(false);
      toast({ 
        variant: "destructive",
        title: "Erreur lors de la génération du feedback"
      });
    }
  });

  // Appliquer les modifications
  const applyModificationsMutation = useMutation({
    mutationFn: async () => {
      if (!feedback?.exercises) return;

      const { data: { user } } = await supabase.auth.getUser();

      for (const ex of feedback.exercises) {
        if (!applyToggles[ex.template_exercise_id]) continue;

        // Récupérer les valeurs actuelles
        const { data: current } = await supabase
          .from("workout_template_exercises")
          .select("*")
          .eq("id", ex.template_exercise_id)
          .single();

        if (!current) continue;

        // Mettre à jour le template
        await supabase
          .from("workout_template_exercises")
          .update({
            target_sets: ex.next_target_sets,
            target_reps_min: ex.next_target_reps_min,
            target_reps_max: ex.next_target_reps_max,
            next_target_weight_kg: ex.next_target_weight_kg,
            target_difficulty_note: ex.next_target_difficulty_note
          })
          .eq("id", ex.template_exercise_id);

        // Logger dans progression_log
        await supabase
          .from("progression_log")
          .insert([{
            user_id: user?.id,
            exercise_id: current.exercise_id,
            template_exercise_id: ex.template_exercise_id,
            old_sets: current.target_sets,
            old_reps_min: current.target_reps_min,
            old_reps_max: current.target_reps_max,
            old_weight_kg: current.target_weight_kg,
            new_sets: ex.next_target_sets,
            new_reps_min: ex.next_target_reps_min,
            new_reps_max: ex.next_target_reps_max,
            new_weight_kg: ex.next_target_weight_kg,
            reason: ex.reason,
            source: ex.source
          }]);
      }

      // Mettre à jour le planned_workout en "adjusted"
      if (session?.planned_workout_id) {
        await supabase
          .from("planned_workouts")
          .update({ status: "adjusted" })
          .eq("id", session.planned_workout_id);
      }

      // Mettre à jour le feedback dans la session
      if (feedback.feedback_bullets) {
        await supabase
          .from("sessions")
          .update({ ai_feedback: feedback.feedback_bullets.join("\n") })
          .eq("id", parseInt(sessionId!));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template_exercises"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Modifications appliquées !" });
      navigate("/calendrier");
    }
  });

  if (!session) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  const duration = session.finished_at && session.started_at
    ? formatDistanceToNow(new Date(session.started_at), { locale: fr })
    : "N/A";

  // Grouper les sets par exercice
  const setsByExercise = sessionSets.reduce((acc, set) => {
    if (!acc[set.exercise_id]) acc[set.exercise_id] = [];
    acc[set.exercise_id].push(set);
    return acc;
  }, {} as Record<number, typeof sessionSets>);

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        <h1 className="text-3xl font-bold">Résumé de la séance</h1>

        {/* Stats globales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Durée</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{duration}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Volume total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{session.total_tonnage?.toFixed(0) || 0} kg</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Difficulté moyenne</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{session.avg_difficulty?.toFixed(1) || 0}/10</p>
            </CardContent>
          </Card>
        </div>

        {/* Exercices réalisés */}
        <Card>
          <CardHeader>
            <CardTitle>Exercices réalisés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(setsByExercise).map(([exerciseId, sets]) => {
              const workSets = sets.filter(s => s.is_warmup === 0);
              const bestSet = workSets.reduce((best, current) => {
                const bestScore = best.reps * Number(best.weight_kg);
                const currentScore = current.reps * Number(current.weight_kg);
                return currentScore > bestScore ? current : best;
              }, workSets[0]);
              const tonnage = workSets.reduce((sum, s) => sum + (s.reps * Number(s.weight_kg)), 0);

              return (
                <div key={exerciseId} className="p-3 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">{sets[0].exercises?.name}</h4>
                  <div className="text-sm space-y-1">
                    <p>Sets : {workSets.length}</p>
                    <p>Meilleur set : {bestSet.reps} × {Number(bestSet.weight_kg).toFixed(1)} kg</p>
                    <p>Tonnage : {tonnage.toFixed(0)} kg</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Générer le feedback */}
        {!feedback && (
          <Button 
            onClick={() => generateFeedbackMutation.mutate()}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Générer le feedback et adapter le programme
          </Button>
        )}

        {/* Feedback IA */}
        {feedback && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Feedback du coach IA</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2">
                  {feedback.feedback_bullets?.map((bullet: string, idx: number) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Propositions de progression */}
            <Card>
              <CardHeader>
                <CardTitle>Propositions de progression</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {feedback.exercises?.map((ex: any) => {
                  const current = templateExercises.find(t => t.id === ex.template_exercise_id);
                  if (!current) return null;

                  const weightChange = ex.next_target_weight_kg - Number(current.target_weight_kg || 0);
                  const setsChange = ex.next_target_sets - (current.target_sets || 0);

                  return (
                    <div key={ex.template_exercise_id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{current.exercises?.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{ex.reason}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Appliquer</span>
                          <Switch
                            checked={applyToggles[ex.template_exercise_id] ?? true}
                            onCheckedChange={(checked) => 
                              setApplyToggles(prev => ({ ...prev, [ex.template_exercise_id]: checked }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Sets</p>
                          <div className="flex items-center gap-2">
                            <span>{current.target_sets}</span>
                            <span>→</span>
                            <span className="font-bold">{ex.next_target_sets}</span>
                            {setsChange !== 0 && (
                              setsChange > 0 
                                ? <TrendingUp className="h-4 w-4 text-success" />
                                : <TrendingDown className="h-4 w-4 text-warning" />
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-muted-foreground">Reps</p>
                          <div className="flex items-center gap-2">
                            <span>{current.target_reps_min}-{current.target_reps_max}</span>
                            <span>→</span>
                            <span className="font-bold">{ex.next_target_reps_min}-{ex.next_target_reps_max}</span>
                          </div>
                        </div>

                        <div>
                          <p className="text-muted-foreground">Charge</p>
                          <div className="flex items-center gap-2">
                            <span>{Number(current.target_weight_kg || 0).toFixed(1)} kg</span>
                            <span>→</span>
                            <span className="font-bold">{ex.next_target_weight_kg.toFixed(1)} kg</span>
                            {weightChange !== 0 && (
                              weightChange > 0 
                                ? <TrendingUp className="h-4 w-4 text-success" />
                                : weightChange < 0 
                                  ? <TrendingDown className="h-4 w-4 text-warning" />
                                  : <Minus className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-muted-foreground">Source</p>
                          <span className="font-mono text-xs">{ex.source}</span>
                        </div>
                      </div>

                      {ex.next_target_difficulty_note && (
                        <p className="text-sm italic text-muted-foreground">
                          "{ex.next_target_difficulty_note}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button 
                onClick={() => applyModificationsMutation.mutate()}
                disabled={applyModificationsMutation.isPending}
                className="flex-1"
                size="lg"
              >
                {applyModificationsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Appliquer les modifications
              </Button>
              <Button 
                onClick={() => navigate("/calendrier")}
                variant="outline"
                size="lg"
              >
                Ignorer
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
