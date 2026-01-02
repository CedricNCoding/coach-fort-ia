import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dumbbell, Edit2, Save, X, Trash2, Play, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface PlannedWorkoutDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plannedWorkoutId: number | null;
  onDelete?: () => void;
}

interface TemplateExercise {
  id: number;
  order_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight_kg: number | null;
  target_rest_seconds: number | null;
  exercise: {
    id: number;
    name: string;
    muscle_group: string | null;
  } | null;
}

export function PlannedWorkoutDetailDialog({ 
  open, 
  onOpenChange, 
  plannedWorkoutId,
  onDelete 
}: PlannedWorkoutDetailDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editingExerciseId, setEditingExerciseId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{
    target_sets?: number;
    target_reps_min?: number;
    target_reps_max?: number;
    target_weight_kg?: number;
  }>({});

  // Charger les détails du planned workout
  const { data: plannedWorkout, isLoading } = useQuery({
    queryKey: ["planned_workout_detail", plannedWorkoutId],
    queryFn: async () => {
      if (!plannedWorkoutId) return null;
      
      const { data, error } = await supabase
        .from("planned_workouts")
        .select(`
          *,
          workout_template:workout_templates(
            id,
            name,
            goal,
            notes
          )
        `)
        .eq("id", plannedWorkoutId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!plannedWorkoutId && open
  });

  // Charger les exercices du template
  const { data: templateExercises = [] } = useQuery({
    queryKey: ["template_exercises", plannedWorkout?.workout_template?.id],
    queryFn: async () => {
      if (!plannedWorkout?.workout_template?.id) return [];
      
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select(`
          id,
          order_index,
          target_sets,
          target_reps_min,
          target_reps_max,
          target_weight_kg,
          target_rest_seconds,
          exercise:exercises(id, name, muscle_group)
        `)
        .eq("workout_template_id", plannedWorkout.workout_template.id)
        .eq("is_active", 1)
        .order("order_index");
      
      if (error) throw error;
      return data as TemplateExercise[];
    },
    enabled: !!plannedWorkout?.workout_template?.id
  });

  // Mutation pour modifier un exercice
  const updateExerciseMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: typeof editValues }) => {
      const { error } = await supabase
        .from("workout_template_exercises")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template_exercises"] });
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Exercice modifié" });
      setEditingExerciseId(null);
      setEditValues({});
    },
    onError: (error) => {
      toast({ 
        variant: "destructive", 
        title: "Erreur", 
        description: error instanceof Error ? error.message : "Erreur de modification" 
      });
    }
  });

  // Mutation pour supprimer un exercice du template
  const removeExerciseMutation = useMutation({
    mutationFn: async (templateExerciseId: number) => {
      const { error } = await supabase
        .from("workout_template_exercises")
        .update({ is_active: 0 })
        .eq("id", templateExerciseId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template_exercises"] });
      toast({ title: "Exercice retiré" });
    }
  });

  const handleStartEdit = (exercise: TemplateExercise) => {
    setEditingExerciseId(exercise.id);
    setEditValues({
      target_sets: exercise.target_sets || 3,
      target_reps_min: exercise.target_reps_min || 8,
      target_reps_max: exercise.target_reps_max || 12,
      target_weight_kg: exercise.target_weight_kg || undefined
    });
  };

  const handleSaveEdit = () => {
    if (editingExerciseId) {
      updateExerciseMutation.mutate({ id: editingExerciseId, updates: editValues });
    }
  };

  const handleStartWorkout = () => {
    if (plannedWorkoutId) {
      navigate(`/session?planned=${plannedWorkoutId}`);
      onOpenChange(false);
    }
  };

  if (!plannedWorkoutId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5" />
            {isLoading ? "Chargement..." : plannedWorkout?.workout_template?.name || "Séance"}
          </DialogTitle>
        </DialogHeader>

        {plannedWorkout && (
          <div className="space-y-4">
            {/* Infos générales */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{format(new Date(plannedWorkout.date), "EEEE d MMMM", { locale: fr })}</span>
              {plannedWorkout.workout_template?.goal && (
                <Badge variant="secondary">{plannedWorkout.workout_template.goal}</Badge>
              )}
              {plannedWorkout.is_deload && (
                <Badge variant="outline" className="text-warning">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  Décharge (-25%)
                </Badge>
              )}
            </div>

            {/* Liste des exercices */}
            <div className="space-y-2">
              <h3 className="font-medium text-sm">Exercices ({templateExercises.length})</h3>
              
              {templateExercises.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun exercice dans cette séance</p>
              ) : (
                <div className="space-y-2">
                  {templateExercises.map((exercise, index) => (
                    <div 
                      key={exercise.id}
                      className="p-3 rounded-lg border bg-card"
                    >
                      {editingExerciseId === exercise.id ? (
                        // Mode édition
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{exercise.exercise?.name}</span>
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7"
                                onClick={handleSaveEdit}
                                disabled={updateExerciseMutation.isPending}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingExerciseId(null);
                                  setEditValues({});
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            <div>
                              <label className="text-xs text-muted-foreground">Séries</label>
                              <Input
                                type="number"
                                value={editValues.target_sets || ""}
                                onChange={(e) => setEditValues({ ...editValues, target_sets: parseInt(e.target.value) || undefined })}
                                className="h-8"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Reps min</label>
                              <Input
                                type="number"
                                value={editValues.target_reps_min || ""}
                                onChange={(e) => setEditValues({ ...editValues, target_reps_min: parseInt(e.target.value) || undefined })}
                                className="h-8"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Reps max</label>
                              <Input
                                type="number"
                                value={editValues.target_reps_max || ""}
                                onChange={(e) => setEditValues({ ...editValues, target_reps_max: parseInt(e.target.value) || undefined })}
                                className="h-8"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Poids (kg)</label>
                              <Input
                                type="number"
                                step="0.5"
                                value={editValues.target_weight_kg || ""}
                                onChange={(e) => setEditValues({ ...editValues, target_weight_kg: parseFloat(e.target.value) || undefined })}
                                className="h-8"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Mode affichage
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{index + 1}.</span>
                              <span className="font-medium">{exercise.exercise?.name}</span>
                              {exercise.exercise?.muscle_group && (
                                <Badge variant="outline" className="text-xs">
                                  {exercise.exercise.muscle_group}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {exercise.target_sets}×{exercise.target_reps_min}-{exercise.target_reps_max} reps
                              {exercise.target_weight_kg && ` @ ${exercise.target_weight_kg}kg`}
                              {plannedWorkout.is_deload && exercise.target_weight_kg && (
                                <span className="text-warning ml-1">
                                  → {Math.round(exercise.target_weight_kg * 0.75)}kg
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7"
                              onClick={() => handleStartEdit(exercise)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeExerciseMutation.mutate(exercise.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handleStartWorkout} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                Démarrer la séance
              </Button>
              {onDelete && (
                <Button 
                  variant="destructive" 
                  size="icon"
                  onClick={() => {
                    onDelete();
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
