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
import { Plus, ArrowLeft, Trash2, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddExerciseDialog, setShowAddExerciseDialog] = useState(false);
  
  // Formulaire ajout exercice
  const [exerciseForm, setExerciseForm] = useState({
    exercise_id: "",
    superset_group: "",
    target_sets: 3,
    target_reps_min: 6,
    target_reps_max: 12,
    target_weight_kg: 0,
    target_rest_seconds: 90
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
          target_rest_seconds: data.target_rest_seconds
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
        target_rest_seconds: 90
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

  const handleAddExercise = () => {
    if (!exerciseForm.exercise_id) {
      toast({ variant: "destructive", title: "Veuillez sélectionner un exercice" });
      return;
    }
    addExerciseMutation.mutate(exerciseForm);
  };

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
                      {availableExercises.map(ex => (
                        <SelectItem key={ex.id} value={ex.id.toString()}>
                          {ex.name} {ex.muscle_group && `(${ex.muscle_group})`}
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
                    <Badge variant="secondary" className="w-fit mb-2">
                      Superset {exercises[0].superset_group}
                    </Badge>
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
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Charge (kg)</Label>
                            <Input
                              type="number"
                              step="0.5"
                              value={ex.target_weight_kg || 0}
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
