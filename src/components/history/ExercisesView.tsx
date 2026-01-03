import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Minus, Weight, Repeat, BarChart3, Trophy, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, ComposedChart, Bar } from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ExercisesViewProps {
  sessions: any[];
}

export function ExercisesView({ sessions }: ExercisesViewProps) {
  const [selectedExercise, setSelectedExercise] = useState<string>("all");
  const [chartType, setChartType] = useState<"weight" | "volume" | "combined">("combined");

  // Récupérer tous les sets des séances filtrées
  const { data: allSets, isLoading } = useQuery({
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

  // Extraire la liste des exercices uniques avec leur fréquence
  const exercises = useMemo(() => {
    if (!allSets) return [];
    
    const exerciseMap = new Map<number, { id: number; name: string; muscleGroup: string; count: number }>();
    
    allSets.forEach(set => {
      const existing = exerciseMap.get(set.exercise.id);
      if (existing) {
        existing.count++;
      } else {
        exerciseMap.set(set.exercise.id, {
          id: set.exercise.id,
          name: set.exercise.name,
          muscleGroup: set.exercise.muscle_group || "Autre",
          count: 1
        });
      }
    });

    return Array.from(exerciseMap.values()).sort((a, b) => b.count - a.count);
  }, [allSets]);

  // Filtrer les sets par exercice
  const filteredSets = selectedExercise === "all" 
    ? allSets || []
    : (allSets || []).filter(set => set.exercise.id === parseInt(selectedExercise));

  // Grouper par date et calculer les stats avancées
  const chartData = useMemo(() => {
    const statsByDate: { [key: string]: { 
      weight: number[], 
      reps: number[], 
      volume: number,
      sets: number,
      date: Date 
    } } = {};

    filteredSets.forEach(set => {
      const date = set.session.finished_at;
      if (!date) return;
      
      const dateKey = format(parseISO(date), "yyyy-MM-dd");
      
      if (!statsByDate[dateKey]) {
        statsByDate[dateKey] = { 
          weight: [], 
          reps: [], 
          volume: 0, 
          sets: 0,
          date: parseISO(date) 
        };
      }
      
      statsByDate[dateKey].weight.push(Number(set.weight_kg));
      statsByDate[dateKey].reps.push(set.reps);
      statsByDate[dateKey].volume += Number(set.weight_kg) * set.reps;
      statsByDate[dateKey].sets++;
    });

    return Object.entries(statsByDate)
      .map(([dateKey, stats]) => ({
        dateKey,
        date: format(stats.date, "dd/MM", { locale: fr }),
        fullDate: format(stats.date, "dd MMM yyyy", { locale: fr }),
        poidsMax: Math.max(...stats.weight),
        poidsMoyen: Math.round(stats.weight.reduce((a, b) => a + b, 0) / stats.weight.length * 10) / 10,
        repsMoyen: Math.round(stats.reps.reduce((a, b) => a + b, 0) / stats.reps.length * 10) / 10,
        volume: Math.round(stats.volume),
        sets: stats.sets,
      }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [filteredSets]);

  // Calculer les PRs (Personal Records) et tendances
  const stats = useMemo(() => {
    if (filteredSets.length === 0) return null;

    const weights = filteredSets.map(set => Number(set.weight_kg));
    const volumes = filteredSets.map(set => Number(set.weight_kg) * set.reps);
    const reps = filteredSets.map(set => set.reps);
    
    const maxWeight = Math.max(...weights);
    const maxVolume = Math.max(...volumes);
    const maxReps = Math.max(...reps);
    const totalSets = filteredSets.length;
    const avgWeight = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length * 10) / 10;

    // Calculate trend (compare first half vs second half)
    let trend: "up" | "down" | "stable" = "stable";
    if (chartData.length >= 4) {
      const midPoint = Math.floor(chartData.length / 2);
      const firstHalfAvg = chartData.slice(0, midPoint).reduce((sum, d) => sum + d.poidsMax, 0) / midPoint;
      const secondHalfAvg = chartData.slice(midPoint).reduce((sum, d) => sum + d.poidsMax, 0) / (chartData.length - midPoint);
      
      const percentChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
      
      if (percentChange > 3) trend = "up";
      else if (percentChange < -3) trend = "down";
    }
    
    return {
      maxWeight,
      maxVolume,
      maxReps,
      totalSets,
      avgWeight,
      trend
    };
  }, [filteredSets, chartData]);

  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendLabel = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up": return "En progression";
      case "down": return "En régression";
      default: return "Stable";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

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
    <div className="space-y-6">
      {/* Sélecteur d'exercice */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Progression par exercice
              </CardTitle>
              <CardDescription>Visualisez vos progrès au fil du temps</CardDescription>
            </div>
            <Select value={selectedExercise} onValueChange={setSelectedExercise}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue placeholder="Sélectionner un exercice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">-- Sélectionner un exercice --</SelectItem>
                {exercises.map(ex => (
                  <SelectItem key={ex.id} value={ex.id.toString()}>
                    {ex.name} ({ex.count} séries)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {selectedExercise !== "all" && stats && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Poids max</CardTitle>
                <Trophy className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.maxWeight} kg</div>
                <p className="text-xs text-muted-foreground">Record personnel</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Volume max</CardTitle>
                <Weight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.maxVolume} kg</div>
                <p className="text-xs text-muted-foreground">En une série</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total séries</CardTitle>
                <Repeat className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSets}</div>
                <p className="text-xs text-muted-foreground">Sur la période</p>
              </CardContent>
            </Card>

            <Card className={cn(
              stats.trend === "up" && "border-green-500/30 bg-green-500/5",
              stats.trend === "down" && "border-red-500/30 bg-red-500/5"
            )}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tendance</CardTitle>
                {getTrendIcon(stats.trend)}
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{getTrendLabel(stats.trend)}</div>
                <p className="text-xs text-muted-foreground">Moy: {stats.avgWeight} kg</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart type selector */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>Évolution</CardTitle>
                  <div className="flex gap-2">
                    <Badge 
                      variant={chartType === "weight" ? "default" : "outline"} 
                      className="cursor-pointer"
                      onClick={() => setChartType("weight")}
                    >
                      Poids
                    </Badge>
                    <Badge 
                      variant={chartType === "volume" ? "default" : "outline"} 
                      className="cursor-pointer"
                      onClick={() => setChartType("volume")}
                    >
                      Volume
                    </Badge>
                    <Badge 
                      variant={chartType === "combined" ? "default" : "outline"} 
                      className="cursor-pointer"
                      onClick={() => setChartType("combined")}
                    >
                      Combiné
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === "combined" ? (
                      <ComposedChart data={chartData}>
                        <defs>
                          <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis yAxisId="left" className="text-xs" />
                        <YAxis yAxisId="right" orientation="right" className="text-xs" />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                                <p className="font-medium">{data.fullDate}</p>
                                <p>Poids max: <span className="font-bold">{data.poidsMax} kg</span></p>
                                <p>Volume: <span className="font-bold">{data.volume} kg</span></p>
                                <p>Reps moy: <span className="font-bold">{data.repsMoyen}</span></p>
                                <p className="text-muted-foreground">{data.sets} séries</p>
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        <Area 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="volume" 
                          fill="url(#volumeGradient)"
                          stroke="hsl(var(--primary))"
                          strokeOpacity={0.5}
                          name="Volume (kg)"
                        />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="poidsMax" 
                          stroke="hsl(var(--primary))" 
                          name="Poids max (kg)" 
                          strokeWidth={3}
                          dot={{ r: 4, fill: "hsl(var(--primary))" }}
                          activeDot={{ r: 6 }}
                        />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="poidsMoyen" 
                          stroke="hsl(var(--muted-foreground))" 
                          strokeDasharray="5 5"
                          name="Poids moyen (kg)" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    ) : chartType === "weight" ? (
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                                <p className="font-medium">{data.fullDate}</p>
                                <p>Poids max: <span className="font-bold">{data.poidsMax} kg</span></p>
                                <p>Poids moy: <span className="font-bold">{data.poidsMoyen} kg</span></p>
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="poidsMax" 
                          stroke="hsl(var(--primary))" 
                          name="Poids max (kg)" 
                          strokeWidth={3}
                          dot={{ r: 4, fill: "hsl(var(--primary))" }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="poidsMoyen" 
                          stroke="hsl(var(--muted-foreground))" 
                          strokeDasharray="5 5"
                          name="Poids moyen (kg)" 
                          strokeWidth={2}
                        />
                      </LineChart>
                    ) : (
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="volumeAreaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                                <p className="font-medium">{data.fullDate}</p>
                                <p>Volume: <span className="font-bold">{data.volume} kg</span></p>
                                <p>{data.sets} séries</p>
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="volume" 
                          fill="url(#volumeAreaGradient)"
                          stroke="hsl(var(--primary))"
                          name="Volume total (kg)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    )}
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
                  <p className="text-center text-muted-foreground py-4">Aucune donnée</p>
                ) : (
                  <div className="grid gap-2">
                    {chartData.slice().reverse().slice(0, 10).map((stat, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div>
                          <p className="font-medium">{stat.fullDate}</p>
                          <p className="text-xs text-muted-foreground">{stat.sets} séries</p>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="text-right">
                            <p className="font-bold">{stat.poidsMax} kg</p>
                            <p className="text-xs text-muted-foreground">max</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{stat.volume} kg</p>
                            <p className="text-xs text-muted-foreground">volume</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{stat.repsMoyen}</p>
                            <p className="text-xs text-muted-foreground">reps</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {chartData.length > 10 && (
                      <p className="text-center text-xs text-muted-foreground py-2">
                        +{chartData.length - 10} autres séances
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {selectedExercise === "all" && (
        <Card>
          <CardContent className="pt-6 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Sélectionnez un exercice pour voir sa progression détaillée
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {exercises.length} exercice(s) disponible(s)
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
