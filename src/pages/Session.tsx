import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Clock, Play } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import SessionExercise from "@/components/SessionExercise";

/**
 * Page "Séance du jour"
 * Affiche la session en cours ou propose d'en démarrer une
 */
export default function Session() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [elapsedTime, setElapsedTime] = useState(0);

  // Charger la session en cours
  const { data: currentSession, isLoading } = useQuery({
    queryKey: ["current_session"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, planned_workouts(*, workout_templates(*))")
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  // Charger les planned_workouts d'aujourd'hui
  const { data: todayWorkouts = [] } = useQuery({
    queryKey: ["today_workouts"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("planned_workouts")
        .select("*, workout_templates(*)")
        .eq("date", today)
        .eq("status", "planned")
        .order("slot");
      if (error) throw error;
      return data;
    },
    enabled: !currentSession
  });

  // Charger les exercices du template de la session en cours
  const { data: templateExercises = [] } = useQuery({
    queryKey: ["session_template_exercises", currentSession?.planned_workouts?.workout_template_id],
    queryFn: async () => {
      if (!currentSession?.planned_workouts?.workout_template_id) return [];
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select("*, exercises(*)")
        .eq("workout_template_id", currentSession.planned_workouts.workout_template_id)
        .eq("is_active", 1)
        .order("order_index");
      if (error) throw error;
      return data;
    },
    enabled: !!currentSession?.planned_workouts?.workout_template_id
  });

  // Charger les sets de la session en cours
  const { data: sessionSets = [] } = useQuery({
    queryKey: ["session_sets", currentSession?.id],
    queryFn: async () => {
      if (!currentSession?.id) return [];
      const { data, error } = await supabase
        .from("session_sets")
        .select("*")
        .eq("session_id", currentSession.id)
        .order("set_index");
      if (error) throw error;
      return data;
    },
    enabled: !!currentSession?.id,
    refetchInterval: 2000 // Rafraîchir toutes les 2 secondes
  });

  // Chronomètre global
  useEffect(() => {
    if (!currentSession?.started_at) return;
    
    const interval = setInterval(() => {
      const start = new Date(currentSession.started_at).getTime();
      const now = Date.now();
      setElapsedTime(Math.floor((now - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSession?.started_at]);

  // Mutation pour démarrer une séance
  const startSessionMutation = useMutation({
    mutationFn: async (plannedWorkoutId: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("sessions")
        .insert([{
          user_id: user?.id,
          planned_workout_id: plannedWorkoutId,
          started_at: new Date().toISOString(),
          status: "in_progress"
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current_session"] });
      queryClient.invalidateQueries({ queryKey: ["today_workouts"] });
      toast({ title: "Séance démarrée !" });
    }
  });

  // Mutation pour terminer la séance
  const finishSessionMutation = useMutation({
    mutationFn: async () => {
      if (!currentSession?.id) throw new Error("Pas de session en cours");

      // Calculer les stats
      const workSets = sessionSets.filter(s => s.is_warmup === 0);
      const totalTonnage = workSets.reduce((sum, s) => sum + (s.reps * Number(s.weight_kg)), 0);
      const avgDifficulty = workSets.length > 0
        ? workSets.reduce((sum, s) => sum + (s.perceived_difficulty || 7), 0) / workSets.length
        : 0;

      const { error } = await supabase
        .from("sessions")
        .update({
          finished_at: new Date().toISOString(),
          status: "completed",
          total_tonnage: totalTonnage,
          avg_difficulty: avgDifficulty
        })
        .eq("id", currentSession.id);
      
      if (error) throw error;

      // Mettre à jour le planned_workout en "done"
      if (currentSession.planned_workout_id) {
        await supabase
          .from("planned_workouts")
          .update({ status: "done" })
          .eq("id", currentSession.planned_workout_id);
      }

      return currentSession.id;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["current_session"] });
      queryClient.invalidateQueries({ queryKey: ["today_workouts"] });
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Séance terminée !" });
      navigate(`/session-summary/${sessionId}`);
    }
  });

  // Formater le temps écoulé
  const formatElapsedTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Grouper les exercices par superset
  const groupedExercises = templateExercises.reduce((acc, ex) => {
    const group = ex.superset_group || `solo_${ex.id}`;
    if (!acc[group]) acc[group] = [];
    acc[group].push(ex);
    return acc;
  }, {} as Record<string, typeof templateExercises>);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </Layout>
    );
  }

  // Si pas de session en cours
  if (!currentSession) {
    return (
      <Layout>
        <div className="container mx-auto p-4 space-y-4">
          <h1 className="text-3xl font-bold">Séance du jour</h1>
          
          {todayWorkouts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">Aucune séance planifiée aujourd'hui</p>
                <Button onClick={() => navigate("/calendrier")}>
                  Planifier une séance
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground">Séances planifiées aujourd'hui :</p>
              {todayWorkouts.map(pw => (
                <Card key={pw.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{pw.workout_templates?.name}</span>
                      <Button 
                        onClick={() => startSessionMutation.mutate(pw.id)}
                        disabled={startSessionMutation.isPending}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Démarrer
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  {pw.workout_templates?.goal && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground capitalize">
                        Objectif : {pw.workout_templates.goal}
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // Session en cours
  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        {/* En-tête avec chrono */}
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">
                  {currentSession.planned_workouts?.workout_templates?.name || "Séance libre"}
                </h1>
                <p className="text-sm opacity-90">
                  Démarrée {formatDistanceToNow(new Date(currentSession.started_at), { 
                    addSuffix: true, 
                    locale: fr 
                  })}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2 text-3xl font-mono">
                  <Clock className="h-6 w-6" />
                  {formatElapsedTime(elapsedTime)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liste des exercices groupés */}
        <div className="space-y-6">
          {Object.entries(groupedExercises).map(([group, exercises]) => {
            const isSuperset = exercises.length > 1;
            
            return (
              <Card key={group} className={isSuperset ? "border-accent" : ""}>
                {isSuperset && (
                  <CardHeader className="bg-accent/10">
                    <CardTitle className="text-lg">Superset {group}</CardTitle>
                  </CardHeader>
                )}
                <CardContent className="pt-6 space-y-6">
                  {exercises.map(ex => (
                    <SessionExercise
                      key={ex.id}
                      templateExercise={ex}
                      sessionId={currentSession.id}
                      sessionSets={sessionSets.filter(s => s.template_exercise_id === ex.id)}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Bouton terminer */}
        <Button 
          onClick={() => finishSessionMutation.mutate()}
          disabled={finishSessionMutation.isPending}
          className="w-full"
          size="lg"
          variant="default"
        >
          Terminer la séance
        </Button>
      </div>
    </Layout>
  );
}
