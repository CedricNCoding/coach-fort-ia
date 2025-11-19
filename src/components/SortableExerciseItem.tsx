import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2 } from "lucide-react";

interface SortableExerciseItemProps {
  ex: any;
  updateExerciseMutation: any;
  deleteExerciseMutation: any;
}

export function SortableExerciseItem({ ex, updateExerciseMutation, deleteExerciseMutation }: SortableExerciseItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ex.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
      </div>
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
              <Label className="text-xs text-muted-foreground">Durée (s)</Label>
              <Input
                type="number"
                value={ex.target_time_seconds || 0}
                onChange={(e) => updateExerciseMutation.mutate({
                  exerciseId: ex.id,
                  updates: { target_time_seconds: parseInt(e.target.value) }
                })}
                className="h-8"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Reps min</Label>
                <Input
                  type="number"
                  value={ex.target_reps_min || 6}
                  onChange={(e) => updateExerciseMutation.mutate({
                    exerciseId: ex.id,
                    updates: { target_reps_min: parseInt(e.target.value) }
                  })}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Reps max</Label>
                <Input
                  type="number"
                  value={ex.target_reps_max || 12}
                  onChange={(e) => updateExerciseMutation.mutate({
                    exerciseId: ex.id,
                    updates: { target_reps_max: parseInt(e.target.value) }
                  })}
                  className="h-8"
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Poids (kg)</Label>
            <Input
              type="number"
              step="0.5"
              value={ex.target_weight_kg || 0}
              onChange={(e) => updateExerciseMutation.mutate({
                exerciseId: ex.id,
                updates: { target_weight_kg: parseFloat(e.target.value) }
              })}
              className="h-8"
            />
          </div>
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
            className="h-8 w-32"
          />
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
  );
}
