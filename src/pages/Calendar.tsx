import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function Calendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<1 | 2>(1);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<number | null>(null);

  // Charger les séances planifiées de la semaine
  const weekStart = startOfWeek(currentWeek, { locale: fr });
  const weekEnd = endOfWeek(currentWeek, { locale: fr });

  const { data: plannedWorkouts = [] } = useQuery({
    queryKey: ["planned_workouts", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planned_workouts")
        .select(`
          *,
          workout_template:workout_templates(name, goal)
        `)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      
      if (error) throw error;
      return data;
    }
  });

  // Charger les plans disponibles
  const { data: plans = [] } = useQuery({
    queryKey: ["workout_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    }
  });

  // Mutation ajout séance planifiée
  const addPlannedWorkoutMutation = useMutation({
    mutationFn: async (data: { date: string; slot: number; template_id: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("planned_workouts")
        .insert([{
          user_id: user?.id,
          date: data.date,
          slot: data.slot,
          workout_template_id: data.template_id,
          status: "planned"
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Séance planifiée" });
      setShowPlanDialog(false);
      setSelectedPlanId("");
    }
  });

  // Mutation suppression séance planifiée
  const deletePlannedWorkoutMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("planned_workouts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ title: "Séance supprimée" });
      setDeleteWorkoutId(null);
    }
  });

  const handlePlanWorkout = () => {
    if (!selectedDate || !selectedPlanId) {
      toast({ variant: "destructive", title: "Veuillez sélectionner un plan" });
      return;
    }

    addPlannedWorkoutMutation.mutate({
      date: format(selectedDate, "yyyy-MM-dd"),
      slot: selectedSlot,
      template_id: parseInt(selectedPlanId)
    });
  };

  // Générer les jours de la semaine
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done": return "bg-success text-success-foreground";
      case "skipped": return "bg-destructive text-destructive-foreground";
      case "adjusted": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getWorkoutsForDay = (date: Date) => {
    return plannedWorkouts.filter(w => isSameDay(new Date(w.date), date));
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Calendrier</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-medium min-w-[280px] text-center">
              Semaine du {format(weekStart, "d", { locale: fr })} au {format(weekEnd, "d MMMM yyyy", { locale: fr })}
            </div>
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendrier */}
        <Card>
          <CardContent className="p-4">
            {/* En-têtes jours avec dates */}
            <div className="grid grid-cols-7 gap-3 mb-3">
              {days.map((day, idx) => (
                <div key={idx} className="text-center space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {format(day, "EEE", { locale: fr })}
                  </div>
                  <div className={cn(
                    "text-lg font-semibold",
                    isSameDay(day, new Date()) && "text-primary"
                  )}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>

            {/* Jours de la semaine */}
            <div className="grid grid-cols-7 gap-3">
              {days.map((day, idx) => {
                const workouts = getWorkoutsForDay(day);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={idx}
                    className={cn(
                      "min-h-[160px] p-3 rounded-lg border cursor-pointer hover:border-primary hover:shadow-md transition-all",
                      isToday && "border-primary border-2 bg-accent/20"
                    )}
                    onClick={() => {
                      setSelectedDate(day);
                      setShowPlanDialog(true);
                    }}
                  >
                    <div className="space-y-2">
                      {workouts.length === 0 && (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                          <Plus className="h-4 w-4" />
                        </div>
                      )}
                      {workouts.map(workout => (
                        <div
                          key={workout.id}
                          className={cn(
                            "text-xs p-2 rounded-md flex flex-col gap-1 group relative",
                            getStatusColor(workout.status)
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-medium text-[10px]">Slot {workout.slot}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteWorkoutId(workout.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-xs line-clamp-2">{workout.workout_template?.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Légende */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-muted" />
            <span>Planifié</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-success" />
            <span>Réalisé</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-warning" />
            <span>Ajusté par IA</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-destructive" />
            <span>Manqué</span>
          </div>
        </div>

        {/* Dialog planification */}
        <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Planifier une séance - {selectedDate && format(selectedDate, "d MMMM yyyy", { locale: fr })}
              </DialogTitle>
              <DialogDescription>
                Choisissez un créneau et un plan d'entraînement
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Créneau</label>
                <Select value={selectedSlot.toString()} onValueChange={(val) => setSelectedSlot(parseInt(val) as 1 | 2)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Créneau 1 (matin)</SelectItem>
                    <SelectItem value="2">Créneau 2 (après-midi/soir)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan d'entraînement</label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id.toString()}>
                        {plan.name} {plan.goal && `(${plan.goal})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handlePlanWorkout} className="w-full" disabled={addPlannedWorkoutMutation.isPending}>
                {addPlannedWorkoutMutation.isPending ? "Planification..." : "Planifier la séance"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmation de suppression */}
        <AlertDialog open={!!deleteWorkoutId} onOpenChange={(open) => !open && setDeleteWorkoutId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette séance ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. La séance planifiée sera définitivement supprimée.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteWorkoutId && deletePlannedWorkoutMutation.mutate(deleteWorkoutId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
