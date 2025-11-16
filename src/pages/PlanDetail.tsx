import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowLeft, Trash2, GripVertical, Download, Calendar, Brain, CheckCircle2, AlertCircle, Lightbulb, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddExerciseDialog, setShowAddExerciseDialog] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string>("");
  const [coachAnalysis, setCoachAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Formulaire ajout exercice
  const [exerciseForm, setExerciseForm] = useState({
    exercise_id: "",
    superset_group: "",
    target_sets: 3,
    target_reps_min: 6,
    target_reps_max: 12,
    target_weight_kg: 0,
    target_time_seconds: 0,
    target_rest_seconds: 90,
    superset_rest_seconds: 120
  });

  // Charger le plan
  const { data: plan } = useQuery({
    queryKey: ["workout_template", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("*")
        .eq("id", parseInt(id!))
        .single();
      if (error) throw error;
      
      // Charger les jours récurrents
      if (data?.recurring_days) {
        const days = Array.isArray(data.recurring_days) 
          ? data.recurring_days.filter((d): d is number => typeof d === 'number')
          : [];
        setRecurringDays(days);
      }
      
      return data;
    }
  });

  // Charger les exercices du plan
  const { data: planExercises = [] } = useQuery({
    queryKey: ["workout_template_exercises", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(`
          *,
          exercise:exercises(*)
        `)
        .eq("workout_template_id", parseInt(id!))
        .order("order_index");
      if (error) throw error;
      return data;
    }
  });

  // Charger tous les exercices disponibles
  const { data: availableExercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    }
  });

  // Mutation ajout exercice
  const addExerciseMutation = useMutation({
    mutationFn: async (data: any) => {
      // Trouver le prochain order_index
      const maxOrder = planExercises.length > 0
        ? Math.max(...planExercises.map(e => e.order_index))
        : 0;

      const { error } = await supabase
        .from("workout_template_exercises")
        .insert([{
          workout_template_id: parseInt(id!),
          exercise_id: parseInt(data.exercise_id),
          order_index: maxOrder + 1,
          superset_group: data.superset_group || null,
          target_sets: data.target_sets,
          target_reps_min: data.target_reps_min,
          target_reps_max: data.target_reps_max,
          target_weight_kg: data.target_weight_kg || null,
          target_time_seconds: data.target_time_seconds || null,
          target_rest_seconds: data.target_rest_seconds,
          superset_rest_seconds: data.superset_rest_seconds
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_template_exercises", id] });
      toast({ title: "Exercice ajouté au plan" });
      setShowAddExerciseDialog(false);
      setExerciseForm({
        exercise_id: "",
        superset_group: "",
        target_sets: 3,
        target_reps_min: 6,
        target_reps_max: 12,
        target_weight_kg: 0,
        target_time_seconds: 0,
        target_rest_seconds: 90,
        superset_rest_seconds: 120
      });
    }
  });

  // Mutation suppression
  const deleteExerciseMutation = useMutation({
    mutationFn: async (exerciseId: number) => {
      const { error } = await supabase
        .from("workout_template_exercises")
        .delete()
        .eq("id", exerciseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_template_exercises", id] });
      toast({ title: "Exercice retiré du plan" });
    }
  });

  // Mutation mise à jour exercice
  const updateExerciseMutation = useMutation({
    mutationFn: async ({ exerciseId, updates }: { exerciseId: number; updates: any }) => {
      const { error } = await supabase
        .from("workout_template_exercises")
        .update(updates)
        .eq("id", exerciseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_template_exercises", id] });
    }
  });

  // Mutation mise à jour jours récurrents
  const updateRecurringDaysMutation = useMutation({
    mutationFn: async (days: number[]) => {
      const { error } = await supabase
        .from("workout_templates")
        .update({ recurring_days: days })
        .eq("id", parseInt(id!));
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_template", id] });
      toast({ title: "Planification mise à jour" });
    }
  });

  const handleAddExercise = () => {
    if (!exerciseForm.exercise_id) {
      toast({ variant: "destructive", title: "Veuillez sélectionner un exercice" });
      return;
    }
    addExerciseMutation.mutate(exerciseForm);
  };

  // Obtenir la liste des groupes musculaires uniques
  const muscleGroups = Array.from(
    new Set(availableExercises.map(ex => ex.muscle_group).filter(Boolean))
  ).sort();

  // Filtrer les exercices par groupe musculaire sélectionné
  const filteredExercises = selectedMuscleGroup && selectedMuscleGroup !== "all"
    ? availableExercises.filter(ex => ex.muscle_group === selectedMuscleGroup)
    : availableExercises;

  const handleExportCSV = async () => {
    if (!plan || !planExercises) return;
    const { exportPlanToCSV, downloadCSV } = await import("@/lib/csv-plan-import");
    const csv = exportPlanToCSV(plan.name, planExercises);
    downloadCSV(csv, `${plan.name.replace(/\s+/g, '_')}.csv`);
  };

  const handleToggleDay = (day: number) => {
    const newDays = recurringDays.includes(day)
      ? recurringDays.filter(d => d !== day)
      : [...recurringDays, day].sort();
    
    setRecurringDays(newDays);
    updateRecurringDaysMutation.mutate(newDays);
  };

  const handleScheduleNow = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('auto-schedule-workouts');
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ 
        title: "Planification effectuée", 
        description: `${data.created} séance(s) créée(s)` 
      });
    } catch (error) {
      console.error("Schedule error:", error);
      toast({ 
        variant: "destructive", 
        title: "Erreur de planification" 
      });
    }
  };

  const handleAnalyzePlan = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-coach-plan', {
        body: { template_id: parseInt(id!) }
      });
      
      if (error) throw error;
      setCoachAnalysis(data);
      toast({ title: "Analyse complétée !" });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({ 
        variant: "destructive", 
        title: "Erreur lors de l'analyse"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const daysOfWeek = [
    { value: 1, label: "Lundi" },
    { value: 2, label: "Mardi" },
    { value: 3, label: "Mercredi" },
    { value: 4, label: "Jeudi" },
    { value: 5, label: "Vendredi" },
    { value: 6, label: "Samedi" },
    { value: 7, label: "Dimanche" },
  ];

  // Grouper les exercices par superset
  const groupedExercises = planExercises.reduce((acc, ex) => {
    const group = ex.superset_group || `single_${ex.id}`;
    if (!acc[group]) acc[group] = [];
    acc[group].push(ex);
    return acc;
  }, {} as Record<string, typeof planExercises>);

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/plans")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{plan?.name}</h1>
            {plan?.goal && (
              <p className="text-muted-foreground capitalize">{plan.goal}</p>
            )}
          </div>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exporter CSV
          </Button>
          <Button 
            variant="outline" 
            onClick={handleAnalyzePlan}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Brain className="h-4 w-4 mr-2" />
            )}
            Analyser avec l'IA
          </Button>
          <Dialog open={showAddExerciseDialog} onOpenChange={setShowAddExerciseDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un exercice
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Ajouter un exercice au plan</DialogTitle>
                <DialogDescription>
                  Configurez les paramètres de l'exercice
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Groupe musculaire</Label>
                  <Select
                    value={selectedMuscleGroup || "all"}
                    onValueChange={(val) => {
                      setSelectedMuscleGroup(val === "all" ? "" : val);
                      setExerciseForm({ ...exerciseForm, exercise_id: "" });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tous les groupes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les groupes</SelectItem>
                      {muscleGroups.map(group => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Exercice *</Label>
                  <Select
                    value={exerciseForm.exercise_id}
                    onValueChange={(val) => {
                      const ex = availableExercises.find(e => e.id === parseInt(val));
                      setExerciseForm({
                        ...exerciseForm,
                        exercise_id: val,
                        target_rest_seconds: ex?.default_rest_seconds || 90
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un exercice" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredExercises.map(ex => (
                        <SelectItem key={ex.id} value={ex.id.toString()}>
                          {ex.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Groupe Superset (optionnel)</Label>
                  <Input
                    value={exerciseForm.superset_group}
                    onChange={(e) => setExerciseForm({ ...exerciseForm, superset_group: e.target.value })}
                    placeholder="Ex: A1, A2 pour regrouper en superset"
                  />
                  <p className="text-xs text-muted-foreground">
                    Les exercices avec le même groupe seront affichés ensemble comme un superset
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Séries cibles</Label>
                    <Input
                      type="number"
                      value={exerciseForm.target_sets}
                      onChange={(e) => setExerciseForm({ ...exerciseForm, target_sets: parseInt(e.target.value) || 3 })}
                    />
                  </div>
                  {(() => {
                    const selectedExercise = availableExercises.find(ex => ex.id.toString() === exerciseForm.exercise_id);
                    return selectedExercise?.measurement_type === 'time' ? (
                      <div className="space-y-2">
                        <Label>Temps cible (secondes)</Label>
                        <Input
                          type="number"
                          value={exerciseForm.target_time_seconds}
                          onChange={(e) => setExerciseForm({ ...exerciseForm, target_time_seconds: parseInt(e.target.value) || 0 })}
                          placeholder="Ex: 60"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Rep range</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={exerciseForm.target_reps_min}
                            onChange={(e) => setExerciseForm({ ...exerciseForm, target_reps_min: parseInt(e.target.value) || 6 })}
                            placeholder="Min"
                          />
                          <span>-</span>
                          <Input
                            type="number"
                            value={exerciseForm.target_reps_max}
                            onChange={(e) => setExerciseForm({ ...exerciseForm, target_reps_max: parseInt(e.target.value) || 12 })}
                            placeholder="Max"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Poids cible (kg)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={exerciseForm.target_weight_kg}
                      onChange={(e) => setExerciseForm({ ...exerciseForm, target_weight_kg: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Repos (secondes)</Label>
                    <Input
                      type="number"
                      value={exerciseForm.target_rest_seconds}
                      onChange={(e) => setExerciseForm({ ...exerciseForm, target_rest_seconds: parseInt(e.target.value) || 90 })}
                    />
                  </div>
                </div>

                <Button onClick={handleAddExercise} className="w-full" disabled={addExerciseMutation.isPending}>
                  {addExerciseMutation.isPending ? "Ajout..." : "Ajouter l'exercice"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Section planification récurrente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Planification automatique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sélectionnez les jours où ce plan doit être automatiquement ajouté à votre calendrier chaque semaine.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {daysOfWeek.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={recurringDays.includes(day.value)}
                    onCheckedChange={() => handleToggleDay(day.value)}
                  />
                  <Label
                    htmlFor={`day-${day.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {day.label}
                  </Label>
                </div>
              ))}
            </div>
            {recurringDays.length > 0 && (
              <div className="flex items-center gap-2 pt-2">
                <Badge variant="secondary">
                  Planifié {recurringDays.length} jour{recurringDays.length > 1 ? "s" : ""} par semaine
                </Badge>
                <Button 
                  onClick={handleScheduleNow} 
                  variant="outline" 
                  size="sm"
                >
                  Planifier maintenant
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analyse IA du plan */}
        {coachAnalysis && (
          <Card className="border-primary/20 bg-gradient-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Analyse du Coach IA
                {coachAnalysis.score && (
                  <Badge variant={coachAnalysis.score >= 80 ? "default" : coachAnalysis.score >= 60 ? "secondary" : "destructive"}>
                    Score: {coachAnalysis.score}/100
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Analyse générale */}
              <div className="space-y-2">
                <p className="text-sm leading-relaxed">{coachAnalysis.analysis}</p>
              </div>

              {/* Points forts */}
              {coachAnalysis.strengths && coachAnalysis.strengths.length > 0 && (
                <Alert className="border-success/50 bg-success/5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Points forts</div>
                    <ul className="space-y-1">
                      {coachAnalysis.strengths.map((strength: string, idx: number) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0 text-success" />
                          <span>{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Points faibles */}
              {coachAnalysis.weaknesses && coachAnalysis.weaknesses.length > 0 && (
                <Alert className="border-warning/50 bg-warning/5">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Points d'amélioration</div>
                    <ul className="space-y-1">
                      {coachAnalysis.weaknesses.map((weakness: string, idx: number) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <span className="text-warning">•</span>
                          <span>{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Recommandations */}
              {coachAnalysis.recommendations && coachAnalysis.recommendations.length > 0 && (
                <Alert className="border-accent/50 bg-accent/5">
                  <Lightbulb className="h-4 w-4 text-accent" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Recommandations</div>
                    <ul className="space-y-1">
                      {coachAnalysis.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <span className="text-accent">→</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {planExercises.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">Aucun exercice dans ce plan</p>
              <Button onClick={() => setShowAddExerciseDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter votre premier exercice
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedExercises).map(([group, exercises]) => (
              <Card key={group} className={exercises.length > 1 ? "border-l-4 border-l-accent" : ""}>
                <CardHeader>
                  {exercises.length > 1 && (
                    <div className="space-y-3">
                      <Badge variant="secondary" className="w-fit">
                        Superset {exercises[0].superset_group}
                      </Badge>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Repos superset (s)</Label>
                        <Input
                          type="number"
                          value={exercises[0].superset_rest_seconds || 120}
                          onChange={(e) => {
                            const newValue = parseInt(e.target.value);
                            // Mettre à jour tous les exercices du superset
                            exercises.forEach(ex => {
                              updateExerciseMutation.mutate({
                                exerciseId: ex.id,
                                updates: { superset_rest_seconds: newValue }
                              });
                            });
                          }}
                          className="h-8 w-32"
                        />
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                   {exercises.map((ex, idx) => (
                    <div key={ex.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                      <GripVertical className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="font-medium">{ex.exercise?.name}</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Séries</Label>
                            <Input
                              type="number"
                              value={ex.target_sets || 3}
                              onChange={(e) => updateExerciseMutation.mutate({
                                exerciseId: ex.id,
                                updates: { target_sets: parseInt(e.target.value) }
                              })}
                              className="h-8"
                            />
                          </div>
                          {ex.exercise?.measurement_type === 'time' ? (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Temps (s)</Label>
                              <Input
                                type="number"
                                value={ex.target_time_seconds || ""}
                                placeholder="Ex: 60"
                                onChange={(e) => updateExerciseMutation.mutate({
                                  exerciseId: ex.id,
                                  updates: { target_time_seconds: parseInt(e.target.value) || null }
                                })}
                                className="h-8"
                              />
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Reps</Label>
                              <div className="flex gap-1 items-center">
                                <Input
                                  type="number"
                                  value={ex.target_reps_min || 6}
                                  onChange={(e) => updateExerciseMutation.mutate({
                                    exerciseId: ex.id,
                                    updates: { target_reps_min: parseInt(e.target.value) }
                                  })}
                                  className="h-8 w-14"
                                />
                                <span className="text-xs">-</span>
                                <Input
                                  type="number"
                                  value={ex.target_reps_max || 12}
                                  onChange={(e) => updateExerciseMutation.mutate({
                                    exerciseId: ex.id,
                                    updates: { target_reps_max: parseInt(e.target.value) }
                                  })}
                                  className="h-8 w-14"
                                />
                              </div>
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Charge (kg)</Label>
                            <Input
                              type="number"
                              step="0.5"
                              value={ex.target_weight_kg || ""}
                              placeholder="Ex: 20"
                              onChange={(e) => updateExerciseMutation.mutate({
                                exerciseId: ex.id,
                                updates: { target_weight_kg: parseFloat(e.target.value) || null }
                              })}
                              className="h-8"
                            />
                            {ex.next_target_weight_kg && (
                              <div className="text-xs text-primary font-medium">
                                → {ex.next_target_weight_kg} kg
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Repos (s)</Label>
                            <Input
                              type="number"
                              value={ex.target_rest_seconds || 90}
                              onChange={(e) => updateExerciseMutation.mutate({
                                exerciseId: ex.id,
                                updates: { target_rest_seconds: parseInt(e.target.value) }
                              })}
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() => deleteExerciseMutation.mutate(ex.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
