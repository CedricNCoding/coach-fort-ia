import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function Calendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<1 | 2>(1);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  // Charger les séances planifiées du mois
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: plannedWorkouts = [] } = useQuery({
    queryKey: ["planned_workouts", format(monthStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planned_workouts")
        .select(`
          *,
          workout_template:workout_templates(name, goal)
        `)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      
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

  // Générer le calendrier
  const calendarStart = startOfWeek(monthStart, { locale: fr });
  const calendarEnd = endOfWeek(monthEnd, { locale: fr });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

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
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-medium min-w-[200px] text-center">
              {format(currentMonth, "MMMM yyyy", { locale: fr })}
            </div>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendrier */}
        <Card>
          <CardContent className="p-4">
            {/* En-têtes jours */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Jours du mois */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, idx) => {
                const workouts = getWorkoutsForDay(day);
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={idx}
                    className={cn(
                      "min-h-[100px] p-2 rounded-lg border cursor-pointer hover:border-primary transition-colors",
                      !isCurrentMonth && "opacity-40",
                      isToday && "border-primary border-2"
                    )}
                    onClick={() => {
                      setSelectedDate(day);
                      setShowPlanDialog(true);
                    }}
                  >
                    <div className="text-sm font-medium mb-2">{format(day, "d")}</div>
                    <div className="space-y-1">
                      {workouts.map(workout => (
                        <div
                          key={workout.id}
                          className={cn(
                            "text-xs p-1 rounded truncate",
                            getStatusColor(workout.status)
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Afficher détail de la séance planifiée
                          }}
                        >
                          Slot {workout.slot}: {workout.workout_template?.name}
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
      </div>
    </Layout>
  );
}
