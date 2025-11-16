import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Weight, Repeat } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface ExercisesViewProps {
  sessions: any[];
}

export function ExercisesView({ sessions }: ExercisesViewProps) {
  const [selectedExercise, setSelectedExercise] = useState<string>("all");

  // Récupérer tous les sets des séances filtrées
  const { data: allSets } = useQuery({
    queryKey: ["session_sets", sessions.map(s => s.id)],
    queryFn: async () => {
      if (sessions.length === 0) return [];
      
      const { data, error } = await supabase
        .from("session_sets")
        .select(`
          *,
          exercise:exercises(id, name, muscle_group),
          session:sessions!inner(id, finished_at)
        `)
        .in("session_id", sessions.map(s => s.id))
        .eq("is_warmup", 0)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: sessions.length > 0,
  });

  // Extraire la liste des exercices uniques
  const exercises = Array.from(
    new Set(allSets?.map(set => JSON.stringify({ id: set.exercise.id, name: set.exercise.name })))
  ).map(str => JSON.parse(str));

  // Filtrer les sets par exercice
  const filteredSets = selectedExercise === "all" 
    ? allSets || []
    : (allSets || []).filter(set => set.exercise.id === parseInt(selectedExercise));

  // Grouper par date et calculer les stats
  const getExerciseStats = () => {
    const statsByDate: { [key: string]: { weight: number[], reps: number[], volume: number } } = {};

    filteredSets.forEach(set => {
      const date = set.session.finished_at 
        ? format(parseISO(set.session.finished_at), "dd/MM", { locale: fr })
        : "Unknown";
      
      if (!statsByDate[date]) {
        statsByDate[date] = { weight: [], reps: [], volume: 0 };
      }
      
      statsByDate[date].weight.push(Number(set.weight_kg));
      statsByDate[date].reps.push(set.reps);
      statsByDate[date].volume += Number(set.weight_kg) * set.reps;
    });

    return Object.entries(statsByDate)
      .map(([date, stats]) => ({
        date,
        poidsMax: Math.max(...stats.weight),
        poidsMoyen: stats.weight.reduce((a, b) => a + b, 0) / stats.weight.length,
        repsMoyen: Math.round(stats.reps.reduce((a, b) => a + b, 0) / stats.reps.length),
        volume: Math.round(stats.volume),
      }))
      .sort((a, b) => {
        // Trier par date (approximatif basé sur le format dd/MM)
        const [dayA, monthA] = a.date.split('/').map(Number);
        const [dayB, monthB] = b.date.split('/').map(Number);
        return (monthA * 100 + dayA) - (monthB * 100 + dayB);
      });
  };

  // Calculer les PRs (Personal Records)
  const getPRs = () => {
    if (filteredSets.length === 0) return null;

    const weights = filteredSets.map(set => Number(set.weight_kg));
    const volumes = filteredSets.map(set => Number(set.weight_kg) * set.reps);
    
    return {
      maxWeight: Math.max(...weights),
      maxVolume: Math.max(...volumes),
      totalSets: filteredSets.length,
    };
  };

  const chartData = getExerciseStats();
  const prs = getPRs();

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Aucune séance terminée
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Sélecteur d'exercice */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Progression par exercice</h2>
        <Select value={selectedExercise} onValueChange={setSelectedExercise}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Sélectionner un exercice" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les exercices</SelectItem>
            {exercises.map(ex => (
              <SelectItem key={ex.id} value={ex.id.toString()}>
                {ex.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedExercise !== "all" && prs && (
        <>
          {/* Statistiques de l'exercice */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Poids maximal</CardTitle>
                <Weight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{prs.maxWeight} kg</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Volume max</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{prs.maxVolume} kg</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total séries</CardTitle>
                <Repeat className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{prs.totalSets}</div>
              </CardContent>
            </Card>
          </div>

          {/* Graphique de progression */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Évolution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="poidsMax" 
                        stroke="hsl(var(--primary))" 
                        name="Poids max (kg)" 
                        strokeWidth={2} 
                      />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="poidsMoyen" 
                        stroke="hsl(var(--primary))" 
                        strokeDasharray="5 5"
                        name="Poids moyen (kg)" 
                        strokeWidth={1} 
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="repsMoyen" 
                        stroke="hsl(var(--accent))" 
                        name="Reps moyen" 
                        strokeWidth={2} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historique détaillé */}
          <Card>
            <CardHeader>
              <CardTitle>Historique détaillé</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {chartData.length === 0 ? (
                  <p className="text-center text-muted-foreground">Aucune donnée</p>
                ) : (
                  <div className="grid gap-2">
                    {chartData.slice().reverse().map((stat, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="font-medium">{stat.date}</div>
                        <div className="flex gap-4 text-sm">
                          <div>Max: {stat.poidsMax} kg</div>
                          <div>Moy: {stat.poidsMoyen.toFixed(1)} kg</div>
                          <div>Reps: {stat.repsMoyen}</div>
                          <div>Vol: {stat.volume} kg</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedExercise === "all" && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Sélectionnez un exercice pour voir sa progression
          </CardContent>
        </Card>
      )}
    </>
  );
}
