import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useWeeklyStats } from "@/hooks/useWeeklyStats";
import { Brain, TrendingUp, Activity, Calendar, MessageSquare, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";

interface CoachReview {
  memory_update: string;
  summary: string;
  strength_analysis: string;
  running_analysis: string;
  fatigue_and_recovery: string;
  priorities_next_days: string[];
  needs_deload: boolean;
  tomorrow_session?: {
    type: 'strength' | 'run' | 'mixed';
    name: string;
    description: string;
    exercises: Array<{
      name: string;
      muscle_group_or_focus: string;
      sets: number;
      reps_or_duration: string;
      target_weight_kg: number;
      target_pace?: string;
    }>;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function WeeklyCoach() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useWeeklyStats();
  const [coachReview, setCoachReview] = useState<CoachReview | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userMessage, setUserMessage] = useState("");

  // Obtenir l'avis du coach
  const getReviewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-weekly-coach-review', {
        body: { action: 'review' }
      });
      if (error) throw error;
      return data.review as CoachReview;
    },
    onSuccess: (data) => {
      setCoachReview(data);
      toast.success("Analyse du coach reçue");
    },
    onError: (error: any) => {
      toast.error("Erreur lors de l'analyse: " + error.message);
    }
  });

  // Chat avec le coach
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke('ai-weekly-coach-review', {
        body: { 
          action: 'chat',
          message,
          conversation: chatMessages
        }
      });
      if (error) throw error;
      return data.response as string;
    },
    onSuccess: (response, message) => {
      setChatMessages(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: response }
      ]);
      setUserMessage("");
    },
    onError: (error: any) => {
      toast.error("Erreur de communication: " + error.message);
    }
  });

  // Créer la séance de demain
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (!coachReview?.tomorrow_session) return;

      const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
      const session = coachReview.tomorrow_session;

      // Créer le plan
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: plan, error: planError } = await supabase
        .from("workout_templates")
        .insert({
          user_id: user.id,
          name: session.name,
          notes: session.description
        })
        .select()
        .single();

      if (planError) throw planError;

      // Trouver les exercices
      const exerciseNames = session.exercises.map(e => e.name);
      const { data: existingExercises } = await supabase
        .from("exercises")
        .select("*")
        .in("name", exerciseNames);

      // Créer les exercices du plan
      const templateExercises = session.exercises.map((ex, index) => {
        const existingEx = existingExercises?.find(e => e.name === ex.name);
        return {
          workout_template_id: plan.id,
          exercise_id: existingEx?.id || 0, // Besoin de créer l'exercice si non trouvé
          order_index: index,
          target_sets: ex.sets,
          target_reps_min: parseInt(ex.reps_or_duration) || 8,
          target_reps_max: parseInt(ex.reps_or_duration) || 12,
          target_weight_kg: ex.target_weight_kg
        };
      });

      const { error: exError } = await supabase
        .from("workout_template_exercises")
        .insert(templateExercises);

      if (exError) throw exError;

      // Planifier pour demain
      const { error: plannedError } = await supabase
        .from("planned_workouts")
        .insert({
          user_id: user.id,
          date: tomorrow,
          slot: 1,
          workout_template_id: plan.id
        });

      if (plannedError) throw plannedError;

      return plan;
    },
    onSuccess: () => {
      toast.success("Séance de demain créée avec succès");
      queryClient.invalidateQueries({ queryKey: ["planned-workouts"] });
    },
    onError: (error: any) => {
      toast.error("Erreur lors de la création: " + error.message);
    }
  });

  const handleSendMessage = () => {
    if (!userMessage.trim()) return;
    chatMutation.mutate(userMessage);
  };

  if (statsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Coach de la semaine</h1>
            <p className="text-muted-foreground">Analyse complète et recommandations personnalisées</p>
          </div>
        </div>

        {/* Statistiques semaine en cours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Semaine en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total séances</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.totalSessions || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Musculation</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.strengthSessions || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Courses</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.runs || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tonnage</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.totalTonnage || 0} kg</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Distance totale</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.totalDistance.toFixed(1) || 0} km</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pace moyen</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.avgPace ? `${stats.currentWeek.avgPace.toFixed(1)} min/km` : '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Difficulté moyenne</p>
                <p className="text-2xl font-bold">{stats?.currentWeek.avgDifficulty ? stats.currentWeek.avgDifficulty.toFixed(1) : '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Douleurs</p>
                <Badge variant={stats?.currentWeek.hasPain ? "destructive" : "secondary"}>
                  {stats?.currentWeek.hasPain ? "Présente" : "Aucune"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Historique 8 semaines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Tendances sur 8 semaines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Tendance générale</p>
              <Badge variant={
                stats?.history.trend === 'hausse' ? 'default' :
                stats?.history.trend === 'baisse' ? 'destructive' : 'secondary'
              }>
                {stats?.history.trend === 'hausse' ? '📈 En hausse' :
                 stats?.history.trend === 'baisse' ? '📉 En baisse' : '➡️ Stable'}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Volume par groupe musculaire (total)</p>
              <div className="space-y-1">
                {stats?.history.muscleGroupVolumes.slice(0, 5).map(mg => (
                  <div key={mg.group} className="flex justify-between items-center">
                    <span className="text-sm capitalize">{mg.group}</span>
                    <span className="text-sm font-semibold">{mg.volume} kg</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bouton obtenir avis coach */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle>Obtenir l'analyse du coach IA</CardTitle>
            <CardDescription>
              Le coach analysera vos 8 dernières semaines d'entraînement (musculation + course)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => getReviewMutation.mutate()}
              disabled={getReviewMutation.isPending}
              className="w-full"
              size="lg"
            >
              {getReviewMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-5 w-5" />
                  Obtenir l'avis du coach
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Affichage de l'avis du coach */}
        {coachReview && (
          <Card>
            <CardHeader>
              <CardTitle>Analyse du coach</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Résumé</h3>
                <p className="text-sm">{coachReview.summary}</p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Analyse musculation</h3>
                <p className="text-sm whitespace-pre-wrap">{coachReview.strength_analysis}</p>
              </div>

              {coachReview.running_analysis && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Analyse course à pied</h3>
                    <p className="text-sm whitespace-pre-wrap">{coachReview.running_analysis}</p>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Fatigue et récupération</h3>
                <p className="text-sm">{coachReview.fatigue_and_recovery}</p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Priorités pour les prochains jours</h3>
                <ul className="list-disc list-inside space-y-1">
                  {coachReview.priorities_next_days.map((priority, idx) => (
                    <li key={idx} className="text-sm">{priority}</li>
                  ))}
                </ul>
              </div>

              {coachReview.needs_deload && (
                <>
                  <Separator />
                  <Badge variant="destructive" className="text-base p-2">
                    ⚠️ Deload recommandé
                  </Badge>
                </>
              )}

              {coachReview.tomorrow_session && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Séance proposée pour demain
                    </h3>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                      <p className="font-medium">{coachReview.tomorrow_session.name}</p>
                      <p className="text-sm text-muted-foreground">{coachReview.tomorrow_session.description}</p>
                      
                      <div className="space-y-2 mt-4">
                        {coachReview.tomorrow_session.exercises.map((ex, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium">{ex.name}</span>
                            {' - '}
                            <span className="text-muted-foreground">
                              {ex.sets}×{ex.reps_or_duration}
                              {ex.target_weight_kg > 0 && ` @ ${ex.target_weight_kg}kg`}
                              {ex.target_pace && ` @ ${ex.target_pace}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={() => createSessionMutation.mutate()}
                        disabled={createSessionMutation.isPending}
                        className="w-full mt-4"
                      >
                        {createSessionMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Création...
                          </>
                        ) : (
                          <>
                            <Calendar className="mr-2 h-4 w-4" />
                            Créer la séance de demain
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Chat avec le coach */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Parler avec le coach
            </CardTitle>
            <CardDescription>
              Posez vos questions, le coach s'adapte à votre situation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4 mb-4">
              {chatMessages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p>Aucune conversation pour le moment.</p>
                  <p className="text-sm mt-2">Posez une question au coach pour commencer !</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                placeholder="Posez votre question au coach..."
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={chatMutation.isPending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={chatMutation.isPending || !userMessage.trim()}
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
