import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SortableExerciseItem } from './SortableExerciseItem';
import { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface SortableSupersetGroupProps {
  supersetGroup: string;
  exercises: any[];
  updateExerciseMutation: any;
  deleteExerciseMutation: any;
  onReorderExercises: (exercises: any[]) => void;
}

export function SortableSupersetGroup({ 
  supersetGroup, 
  exercises,
  updateExerciseMutation,
  deleteExerciseMutation,
  onReorderExercises
}: SortableSupersetGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const isSuperset = exercises.length > 1;
  const isSingleExercise = supersetGroup.startsWith('single_');
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: supersetGroup });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = exercises.findIndex(ex => ex.id === active.id);
      const newIndex = exercises.findIndex(ex => ex.id === over.id);
      
      const reorderedExercises = arrayMove(exercises, oldIndex, newIndex);
      onReorderExercises(reorderedExercises);
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={isSuperset ? "border-l-4 border-l-accent" : ""}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center gap-2 p-4 bg-muted/30 border-b">
            <div 
              {...attributes} 
              {...listeners}
              className="cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground shrink-0" />
            </div>
            
            <CollapsibleTrigger className="flex items-center gap-2 flex-1 hover:opacity-80">
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
              <div className="flex items-center gap-2 flex-1">
                {isSuperset ? (
                  <>
                    <h3 className="font-semibold">Superset {exercises[0].superset_group}</h3>
                    <Badge variant="secondary">{exercises.length} exercices</Badge>
                  </>
                ) : (
                  <h3 className="font-semibold">{exercises[0].exercise?.name}</h3>
                )}
              </div>
            </CollapsibleTrigger>
            
            {isSuperset && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Repos superset (s)</Label>
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
                  className="h-8 w-20"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          <CollapsibleContent>
            <div className="p-4">
              {isSuperset ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={exercises.map(ex => ex.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {exercises.map((ex) => (
                        <SortableExerciseItem
                          key={ex.id}
                          ex={ex}
                          updateExerciseMutation={updateExerciseMutation}
                          deleteExerciseMutation={deleteExerciseMutation}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <SortableExerciseItem
                  ex={exercises[0]}
                  updateExerciseMutation={updateExerciseMutation}
                  deleteExerciseMutation={deleteExerciseMutation}
                />
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
