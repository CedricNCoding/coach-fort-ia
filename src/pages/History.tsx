import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Trash2, TrendingUp, Weight, Clock } from "lucide-react";
import { format, parseISO, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function History() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<"1m" | "3m" | "6m" | "all">("3m");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("all");

  // Récupérer les plans d'entraînement
  const { data: plans } = useQuery({
    queryKey: ["workout_templates"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  // Récupérer les séances terminées de l'utilisateur
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions", "history"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data, error } = await supabase
        .from("sessions")
        .select(`
          *,
          planned_workouts (
            workout_templates (id, name)
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("finished_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Mutation pour supprimer une séance
  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      // Supprimer d'abord les sets
      const { error: setsError } = await supabase
        .from("session_sets")
        .delete()
        .eq("session_id", sessionId);

      if (setsError) throw setsError;

      // Puis la séance
      const { error: sessionError } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId);

      if (sessionError) throw sessionError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Séance supprimée");
      setDeleteSessionId(null);
    },
    onError: (error) => {
      console.error("Erreur suppression:", error);
      toast.error("Erreur lors de la suppression");
    },
  });

  // Filtrer les sessions selon la période et le plan
  const getFilteredSessions = () => {
    if (!sessions) return [];
    
    let filtered = sessions;
    
    // Filtre par plan
    if (selectedPlanId !== "all") {
      filtered = filtered.filter(s => 
        s.planned_workouts?.workout_templates?.id === parseInt(selectedPlanId)
      );
    }
    
    // Filtre par période
    if (selectedPeriod !== "all") {
      const now = new Date();
      let cutoffDate: Date;

      switch (selectedPeriod) {
        case "1m":
          cutoffDate = subMonths(now, 1);
          break;
        case "3m":
          cutoffDate = subMonths(now, 3);
          break;
        case "6m":
          cutoffDate = subMonths(now, 6);
          break;
        default:
          return filtered;
      }

      filtered = filtered.filter(s => s.finished_at && new Date(s.finished_at) >= cutoffDate);
    }
    
    return filtered;
  };

  // Préparer les données pour les graphiques
  const getChartData = () => {
    const filtered = getFilteredSessions();
    
    return filtered
      .filter(s => s.finished_at)
      .sort((a, b) => new Date(a.finished_at!).getTime() - new Date(b.finished_at!).getTime())
      .map(s => ({
        date: format(parseISO(s.finished_at!), "dd/MM", { locale: fr }),
        volume: parseFloat(s.total_tonnage?.toString() || "0"),
        difficulté: parseFloat(s.avg_difficulty?.toString() || "0"),
        durée: s.started_at && s.finished_at 
          ? Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000)
          : 0,
      }));
  };

  const formatDuration = (startedAt: string, finishedAt: string | null) => {
    if (!finishedAt) return "—";
    const start = new Date(startedAt);
    const end = new Date(finishedAt);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </Layout>
    );
  }

  const filteredSessions = getFilteredSessions();
  const chartData = getChartData();

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">Historique</h1>
          
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue placeholder="Tous les plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les plans</SelectItem>
                {plans?.map(plan => (
                  <SelectItem key={plan.id} value={plan.id.toString()}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              {(["1m", "3m", "6m", "all"] as const).map(period => (
                <Button
                  key={period}
                  variant={selectedPeriod === period ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedPeriod(period)}
                >
                  {period === "all" ? "Tout" : period.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Statistiques globales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total séances</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredSessions.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Volume total</CardTitle>
              <Weight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredSessions.reduce((sum, s) => sum + parseFloat(s.total_tonnage?.toString() || "0"), 0).toFixed(0)} kg
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Temps total</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(
                  filteredSessions.reduce((sum, s) => {
                    if (!s.finished_at) return sum;
                    return sum + (new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000;
                  }, 0)
                )} min
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Graphiques de progression */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Progression
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="volume" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="volume">Volume</TabsTrigger>
                  <TabsTrigger value="difficulty">Difficulté</TabsTrigger>
                  <TabsTrigger value="duration">Durée</TabsTrigger>
                </TabsList>

                <TabsContent value="volume" className="h-[300px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="volume" stroke="hsl(var(--primary))" name="Volume (kg)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="difficulty" className="h-[300px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 10]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="difficulté" stroke="hsl(var(--destructive))" name="Difficulté" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="duration" className="h-[300px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="durée" stroke="hsl(var(--accent))" name="Durée (min)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Liste des séances */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Séances</h2>
          {filteredSessions.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                Aucune séance terminée
              </CardContent>
            </Card>
          ) : (
            filteredSessions.map((session) => (
              <Card key={session.id} className="hover:bg-accent/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => navigate(`/session-summary/${session.id}`)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {session.finished_at && format(parseISO(session.finished_at), "EEEE d MMMM yyyy", { locale: fr })}
                        </span>
                      </div>
                      
                      {session.planned_workouts?.workout_templates?.name && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {session.planned_workouts.workout_templates.name}
                        </p>
                      )}

                      <div className="flex gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(session.started_at, session.finished_at)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Weight className="h-3 w-3" />
                          <span>{parseFloat(session.total_tonnage?.toString() || "0").toFixed(0)} kg</span>
                        </div>
                        {session.avg_difficulty && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>Diff. {parseFloat(session.avg_difficulty.toString()).toFixed(1)}/10</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteSessionId(session.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteSessionId !== null} onOpenChange={() => setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Tous les sets et données de cette séance seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSessionId && deleteSessionMutation.mutate(deleteSessionId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
