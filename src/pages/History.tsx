import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { subMonths } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionsView } from "@/components/history/SessionsView";
import { ExercisesView } from "@/components/history/ExercisesView";
import { RunsView } from "@/components/history/RunsView";

export default function History() {
  const [selectedPeriod, setSelectedPeriod] = useState<"1m" | "3m" | "6m" | "all">("3m");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"sessions" | "exercises" | "runs">("sessions");

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
  const { data: allSessions, isLoading } = useQuery({
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

  // Filtrer les sessions selon la période et le plan
  const getFilteredSessions = () => {
    if (!allSessions) return [];
    
    let filtered = allSessions;
    
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

  // Dates pour le filtre runs
  const getDateRange = () => {
    if (selectedPeriod === "all") return { startDate: undefined, endDate: undefined };
    
    const now = new Date();
    let startDate: Date;
    
    switch (selectedPeriod) {
      case "1m":
        startDate = subMonths(now, 1);
        break;
      case "3m":
        startDate = subMonths(now, 3);
        break;
      case "6m":
        startDate = subMonths(now, 6);
        break;
      default:
        return { startDate: undefined, endDate: undefined };
    }
    
    return { startDate, endDate: now };
  };

  const { startDate, endDate } = getDateRange();

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">Historique</h1>
          
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="w-full sm:w-[250px]">
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

          {/* Toggle entre vues */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "sessions" | "exercises" | "runs")} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="sessions">Séances</TabsTrigger>
              <TabsTrigger value="exercises">Exercices</TabsTrigger>
              <TabsTrigger value="runs">Courses</TabsTrigger>
            </TabsList>

            <TabsContent value="sessions" className="space-y-6 mt-6">
              <SessionsView sessions={filteredSessions} />
            </TabsContent>

            <TabsContent value="exercises" className="space-y-6 mt-6">
              <ExercisesView sessions={filteredSessions} />
            </TabsContent>

            <TabsContent value="runs" className="space-y-6 mt-6">
              <RunsView startDate={startDate} endDate={endDate} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
