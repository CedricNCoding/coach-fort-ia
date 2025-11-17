import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Clock, Play, CheckCircle, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fr } from "date-fns/locale";
import SessionExercise from "@/components/SessionExercise";
import RestTimer from "@/components/RestTimer";

export default function Session() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [currentSupersetIndex, setCurrentSupersetIndex] = useState(0);
  const [currentExerciseIndexInSuperset, setCurrentExerciseIndexInSuperset] = useState(0);
  const [currentSetNumber, setCurrentSetNumber] = useState(1);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [hasAutoStartedTimer, setHasAutoStartedTimer] = useState(false);

  // Charger la session en cours avec les infos de décharge
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

  // Vérifier si la session est en décharge
  const isDeloadSession = currentSession?.planned_workouts?.is_deload || false;
  const deloadFactor = currentSession?.planned_workouts?.deload_factor || 0.75;

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
    refetchInterval: 2000
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

  // Mutation pour démarrer une session
  const startSessionMutation = useMutation({
    mutationFn: async (plannedWorkoutId: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const { data: newSession, error } = await supabase
        .from("sessions")
        .insert([{
          user_id: user.id,
          planned_workout_id: plannedWorkoutId,
          started_at: new Date().toISOString(),
          status: "in_progress"
        }])
        .select()
        .single();
      if (error) throw error;
      return newSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current_session"] });
      queryClient.invalidateQueries({ queryKey: ["today_workouts"] });
      toast({ title: "Séance démarrée !" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur lors du démarrage de la séance"
      });
    }
  });

  // Mutation pour terminer une session (même si incomplète)
  const finishSessionMutation = useMutation({
    mutationFn: async (forceComplete: boolean = false) => {
      if (!currentSession?.id) throw new Error("No session");

      const avgDifficulty = sessionSets.length > 0 
        ? sessionSets.reduce((acc, s) => acc + (s.perceived_difficulty || 0), 0) / sessionSets.length 
        : null;

      // Calculer le tonnage total (poids × reps pour tous les sets hors échauffement)
      const totalTonnage = sessionSets
        .filter((s: any) => s.is_warmup === 0)
        .reduce((sum: number, set: any) => 
          sum + (parseFloat(set.weight_kg) * parseInt(set.reps)), 
          0
        );

      const { error: sessionError } = await supabase
        .from("sessions")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          avg_difficulty: avgDifficulty,
          total_tonnage: totalTonnage
        })
        .eq("id", currentSession.id);

      if (sessionError) throw sessionError;

      if (currentSession.planned_workout_id) {
        const { error: pwError } = await supabase
          .from("planned_workouts")
          .update({ status: "completed" })
          .eq("id", currentSession.planned_workout_id);
        if (pwError) {
          console.warn("Unable to update planned_workouts status:", pwError);
        }
      }

      return currentSession.id;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["current_session"] });
      queryClient.invalidateQueries({ queryKey: ["today_workouts"] });
      setShowCompleteDialog(false);
      navigate(`/session-summary/${sessionId}`);
    },
    onError: (error) => {
      console.error("Finish session error", error);
      toast({
        variant: "destructive",
        title: "Erreur lors de la fin de la séance",
        description: (error as any)?.message || "Une erreur est survenue."
      });
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
  const supersets: { [key: string]: typeof templateExercises } = {};
  templateExercises.forEach(ex => {
    const group = ex.superset_group || `ex-${ex.id}`;
    if (!supersets[group]) supersets[group] = [];
    supersets[group].push(ex);
  });
  const supersetKeys = Object.keys(supersets);
  const currentSuperset = supersetKeys[currentSupersetIndex];
  const currentSupersetExercises = supersets[currentSuperset] || [];
  
  // Déterminer l'exercice actuel
  const currentExercise = currentSupersetExercises[currentExerciseIndexInSuperset];
  
  // Calculer le nombre de sets complétés pour l'exercice actuel
  const completedSetsForCurrentExercise = currentExercise 
    ? sessionSets.filter(s => s.template_exercise_id === currentExercise.id).length 
    : 0;
  
  // Vérifier si tous les supersets sont terminés
  const areAllSupersetsComplete = supersetKeys.every(key => {
    return supersets[key].every(ex => {
      const completedSets = sessionSets.filter(s => s.template_exercise_id === ex.id).length;
      return completedSets >= (ex.target_sets || 3);
    });
  });
  
  // Gérer l'avancement automatique après ajout d'une série
  useEffect(() => {
    if (!currentExercise || showRestTimer || !hasAutoStartedTimer) return;
    
    const completedSets = sessionSets.filter(s => s.template_exercise_id === currentExercise.id).length;
    
    // Vérifier si on vient de compléter une série pour l'exercice actuel
    if (completedSets < currentSetNumber) return; // Pas encore de série complétée
    
    // Une série a été complétée pour cet exercice
    
    // Cas 1: Il reste des exercices dans le superset actuel
    if (currentExerciseIndexInSuperset < currentSupersetExercises.length - 1) {
      // Passer à l'exercice suivant du superset (sans repos)
      setCurrentExerciseIndexInSuperset(prev => prev + 1);
      return;
    }
    
    // Cas 2: On a terminé le dernier exercice du superset pour cette série
    // Vérifier si on a complété toutes les séries du superset
    const allExercisesCompletedForCurrentSet = currentSupersetExercises.every(ex => {
      const sets = sessionSets.filter(s => s.template_exercise_id === ex.id).length;
      return sets >= currentSetNumber;
    });
    
    if (!allExercisesCompletedForCurrentSet) {
      // Certains exercices du superset n'ont pas encore complété cette série
      // (ne devrait pas arriver avec la logique actuelle, mais au cas où)
      return;
    }
    
    // Tous les exercices du superset ont complété cette série
    // Vérifier s'il reste des séries à faire
    const targetSets = Math.max(...currentSupersetExercises.map(ex => ex.target_sets || 3));
    
    if (currentSetNumber < targetSets) {
      // Il reste des séries à faire : démarrer le timer inter-série
      setShowRestTimer(true);
      setHasAutoStartedTimer(true);
    } else {
      // Toutes les séries sont complétées : démarrer le timer inter-superset si pas le dernier
      if (currentSupersetIndex < supersetKeys.length - 1) {
        setShowRestTimer(true);
        setHasAutoStartedTimer(true);
      }
      // Sinon, areAllSupersetsComplete sera true et affichera le bouton de fin
    }
  }, [sessionSets, currentExercise, currentExerciseIndexInSuperset, currentSupersetExercises, showRestTimer, currentSetNumber, currentSupersetIndex, supersetKeys.length, hasAutoStartedTimer]);
  
  // Gérer la fin du timer de repos (inter-série ou inter-superset)
  const handleRestComplete = () => {
    setShowRestTimer(false);
    
    // Vérifier si c'est un repos inter-série ou inter-superset
    const targetSets = Math.max(...currentSupersetExercises.map(ex => ex.target_sets || 3));
    
    if (currentSetNumber < targetSets) {
      // Repos inter-série : on reste dans le même superset, prochaine série
      setCurrentExerciseIndexInSuperset(0);
      setCurrentSetNumber(prev => prev + 1);
    } else {
      // Repos inter-superset : on passe au superset suivant
      if (currentSupersetIndex < supersetKeys.length - 1) {
        setCurrentSupersetIndex(prev => prev + 1);
        setCurrentExerciseIndexInSuperset(0);
        setCurrentSetNumber(1);
      }
    }
  };

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
      <div className="container mx-auto p-4">
        <div className="space-y-4">
          {/* En-tête */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">
                  {currentSession.planned_workouts?.workout_templates?.name || "Séance"}
                </CardTitle>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-lg font-mono">{formatElapsedTime(elapsedTime)}</span>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Progression */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Superset {currentSupersetIndex + 1} / {supersetKeys.length}
                </span>
                {currentExercise && (
                  <span className="text-muted-foreground">
                    Série {currentSetNumber} / {currentExercise.target_sets || 3}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {areAllSupersetsComplete ? (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="text-center">🎉 Séance terminée !</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-center text-muted-foreground">
                  Félicitations ! Vous avez terminé tous les exercices.
                </p>
                <Button
                  onClick={() => finishSessionMutation.mutate(false)}
                  disabled={finishSessionMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  Terminer la séance
                </Button>
              </CardContent>
            </Card>
          ) : showRestTimer ? (
            <Card className="border-accent">
              <CardHeader>
                <CardTitle className="text-center">Repos inter-superset</CardTitle>
                <p className="text-center text-sm text-muted-foreground">
                  {currentSetNumber < (currentSupersetExercises[0]?.target_sets || 3)
                    ? `Série ${currentSetNumber} terminée • Préparez-vous pour la série ${currentSetNumber + 1}`
                    : `Superset terminé • Prochain superset dans`}
                </p>
              </CardHeader>
              <CardContent>
                <RestTimer
                  autoStart
                  targetSeconds={
                    currentSetNumber < (currentSupersetExercises[0]?.target_sets || 3)
                      ? currentSupersetExercises[0]?.superset_rest_seconds || 90
                      : currentSupersetIndex < supersetKeys.length - 1
                        ? supersets[supersetKeys[currentSupersetIndex + 1]][0]?.superset_rest_seconds || 90
                        : 90
                  }
                  onComplete={handleRestComplete}
                  onCancel={handleRestComplete}
                />
              </CardContent>
            </Card>
          ) : currentExercise ? (
            <div className="space-y-4">
              <SessionExercise
                key={`${currentExercise.id}-${currentSetNumber}`}
                templateExercise={currentExercise}
                sessionId={currentSession.id}
                sessionSets={sessionSets.filter(s => s.template_exercise_id === currentExercise.id)}
              />
            </div>
          ) : null}

          {!areAllSupersetsComplete && (
            <Button
              variant="outline"
              onClick={() => setShowCompleteDialog(true)}
              className="w-full"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Compléter la séance
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Compléter cette séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous n'avez pas terminé tous les exercices. Voulez-vous vraiment marquer cette séance comme complète ? 
              Les exercices non effectués seront enregistrés sans séries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer la séance</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finishSessionMutation.mutate(true)}
              disabled={finishSessionMutation.isPending}
            >
              Compléter la séance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
