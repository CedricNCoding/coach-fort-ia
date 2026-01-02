import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, Trash2, TrendingDown, Play, Dumbbell, PersonStanding, Eye } from "lucide-react";
import { format, isSameDay, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from "date-fns";
import { RunPlanDialog } from "@/components/RunPlanDialog";
import { RunRecordDialog } from "@/components/RunRecordDialog";
import { PlannedWorkoutDetailDialog } from "@/components/PlannedWorkoutDetailDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TIME_SLOTS, getSlotShortLabel } from "@/lib/calendar-constants";

type SlotActivity = {
  type: "workout" | "run" | "completed_run";
  id: number;
  slot: number;
  status: string | null;
  name?: string;
  goal?: string | null;
  is_deload?: boolean | null;
  target_distance_km?: number | null;
  target_duration_minutes?: number | null;
  distance_km?: number | null;
  duration_minutes?: number | null;
};

export default function Calendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number>(1);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [deleteWorkoutId, setDeleteWorkoutId] = useState<number | null>(null);
  const [showRunPlanDialog, setShowRunPlanDialog] = useState(false);
  const [showRunRecordDialog, setShowRunRecordDialog] = useState(false);
  const [selectedRunForRecord, setSelectedRunForRecord] = useState<{
    id: number;
    targetDistance: number | null;
    targetDuration: number | null;
  } | null>(null);
  const [deleteRunId, setDeleteRunId] = useState<number | null>(null);
  const [deleteCompletedRunId, setDeleteCompletedRunId] = useState<number | null>(null);
  const [activityType, setActivityType] = useState<"workout" | "run" | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingActivity, setPendingActivity] = useState<{ date: string; slot: number; template_id?: number } | null>(null);
  const [existingActivityToOverwrite, setExistingActivityToOverwrite] = useState<SlotActivity | null>(null);
  const [viewWorkoutId, setViewWorkoutId] = useState<number | null>(null);

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

  // Charger les runs planifiés
  const { data: plannedRuns = [] } = useQuery({
    queryKey: ["planned_runs", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planned_runs")
        .select("*")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      
      if (error) throw error;
      return data;
    }
  });

  // Charger les runs effectués (pour les afficher aussi dans le calendrier)
  const { data: completedRuns = [] } = useQuery({
    queryKey: ["runs", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("*")
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      
      if (error) throw error;
      return data;
    }
  });

  // Vérifier si la semaine est en décharge (au moins une séance en décharge)
  const isWeekDeload = plannedWorkouts.some(w => w.is_deload);

  // Mutation pour basculer le mode décharge pour toute la semaine
  const toggleWeekDeloadMutation = useMutation({
    mutationFn: async (enableDeload: boolean) => {
      const workoutIds = plannedWorkouts.map(w => w.id);
      if (workoutIds.length === 0) return;

      const { error } = await supabase
        .from("planned_workouts")
        .update({ 
          is_deload: enableDeload,
          deload_factor: enableDeload ? 0.75 : null
        })
        .in("id", workoutIds);
      
      if (error) throw error;
    },
    onSuccess: (_, enableDeload) => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      toast({ 
        title: enableDeload ? "Semaine de décharge activée" : "Semaine de décharge désactivée",
        description: enableDeload 
          ? "Le volume et les charges seront réduits de 25% pour cette semaine"
          : "La progression normale reprendra"
      });
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

  // Vérifier si un créneau est occupé
  const getSlotActivity = (date: Date, slot: number): SlotActivity | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    const workout = plannedWorkouts.find(w => w.date === dateStr && w.slot === slot);
    if (workout) {
      return {
        type: "workout",
        id: workout.id,
        slot: workout.slot,
        status: workout.status,
        name: workout.workout_template?.name,
        goal: workout.workout_template?.goal,
        is_deload: workout.is_deload
      };
    }
    
    const run = plannedRuns.find(r => r.date === dateStr && r.slot === slot);
    if (run) {
      return {
        type: "run",
        id: run.id,
        slot: run.slot,
        status: run.status,
        target_distance_km: run.target_distance_km,
        target_duration_minutes: run.target_duration_minutes
      };
    }
    
    return null;
  };

  // Trouver le premier créneau libre pour une date
  const getFirstFreeSlot = (date: Date): number | null => {
    for (const slot of TIME_SLOTS) {
      if (!getSlotActivity(date, slot.id)) {
        return slot.id;
      }
    }
    return null;
  };

  // Mutation ajout séance planifiée
  const addPlannedWorkoutMutation = useMutation({
    mutationFn: async (data: { date: string; slot: number; template_id: number; overwrite?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      
      // Vérifier si le slot est déjà occupé par un workout
      const { data: existingWorkout } = await supabase
        .from("planned_workouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", data.date)
        .eq("slot", data.slot)
        .single();

      // Vérifier si le slot est déjà occupé par un run
      const { data: existingRun } = await supabase
        .from("planned_runs")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", data.date)
        .eq("slot", data.slot)
        .single();

      if (existingRun && data.overwrite) {
        // Supprimer le run existant si on veut écraser
        await supabase.from("planned_runs").delete().eq("id", existingRun.id);
      }

      if (existingWorkout) {
        // Mettre à jour la séance existante
        const { error } = await supabase
          .from("planned_workouts")
          .update({
            workout_template_id: data.template_id,
            status: "planned"
          })
          .eq("id", existingWorkout.id);
        if (error) throw error;
      } else {
        // Créer une nouvelle séance
        const { error } = await supabase
          .from("planned_workouts")
          .insert([{
            user_id: user.id,
            date: data.date,
            slot: data.slot,
            workout_template_id: data.template_id,
            status: "planned"
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
      queryClient.invalidateQueries({ queryKey: ["planned_runs"] });
      toast({ title: "Séance planifiée" });
      setShowPlanDialog(false);
      setSelectedPlanId("");
      setShowOverwriteConfirm(false);
      setPendingActivity(null);
      setExistingActivityToOverwrite(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Impossible de planifier la séance"
      });
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

  // Mutation suppression run planifié
  const deletePlannedRunMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("planned_runs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_runs"] });
      toast({ title: "Run supprimé" });
      setDeleteRunId(null);
    }
  });

  // Mutation suppression run effectué
  const deleteCompletedRunMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("runs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast({ title: "Run effectué supprimé" });
      setDeleteCompletedRunId(null);
    }
  });

  const handlePlanWorkout = () => {
    if (!selectedDate || !selectedPlanId) {
      toast({ variant: "destructive", title: "Veuillez sélectionner un plan" });
      return;
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const existingActivity = getSlotActivity(selectedDate, selectedSlot);

    if (existingActivity) {
      // Demander confirmation avant d'écraser
      setPendingActivity({ date: dateStr, slot: selectedSlot, template_id: parseInt(selectedPlanId) });
      setExistingActivityToOverwrite(existingActivity);
      setShowOverwriteConfirm(true);
    } else {
      // Pas de conflit, planifier directement
      addPlannedWorkoutMutation.mutate({
        date: dateStr,
        slot: selectedSlot,
        template_id: parseInt(selectedPlanId)
      });
    }
  };

  const handleConfirmOverwrite = () => {
    if (pendingActivity) {
      addPlannedWorkoutMutation.mutate({
        ...pendingActivity,
        template_id: pendingActivity.template_id!,
        overwrite: true
      });
    }
  };

  // Générer les jours de la semaine
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "done": return "bg-success text-success-foreground";
      case "skipped": return "bg-destructive text-destructive-foreground";
      case "adjusted": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getActivitiesForDay = (date: Date): SlotActivity[] => {
    const activities: SlotActivity[] = [];
    
    plannedWorkouts.filter(w => isSameDay(new Date(w.date), date)).forEach(workout => {
      activities.push({
        type: "workout",
        id: workout.id,
        slot: workout.slot,
        status: workout.status,
        name: workout.workout_template?.name,
        goal: workout.workout_template?.goal,
        is_deload: workout.is_deload
      });
    });

    plannedRuns.filter(r => isSameDay(new Date(r.date), date)).forEach(run => {
      activities.push({
        type: "run",
        id: run.id,
        slot: run.slot,
        status: run.status,
        target_distance_km: run.target_distance_km,
        target_duration_minutes: run.target_duration_minutes
      });
    });

    // Ajouter les runs effectués (sans slot, on les met sur le premier créneau libre)
    completedRuns.filter(r => isSameDay(new Date(r.date), date)).forEach(run => {
      // Trouver le premier slot libre pour ce run effectué
      const usedSlots = activities.map(a => a.slot);
      let freeSlot = 1;
      for (const slot of TIME_SLOTS) {
        if (!usedSlots.includes(slot.id)) {
          freeSlot = slot.id;
          break;
        }
      }
      activities.push({
        type: "completed_run",
        id: run.id,
        slot: freeSlot,
        status: "done",
        distance_km: run.distance_km,
        duration_minutes: run.duration_minutes
      });
    });

    // Trier par slot
    return activities.sort((a, b) => a.slot - b.slot);
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setActivityType(null);
    // Trouver le premier créneau libre
    const freeSlot = getFirstFreeSlot(date);
    setSelectedSlot(freeSlot || 1);
    setShowPlanDialog(true);
  };

  const handleSlotClick = (date: Date, slot: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(date);
    setSelectedSlot(slot);
    setActivityType(null);
    setShowPlanDialog(true);
  };

  return (
    <Layout>
      <div className="container mx-auto p-2 sm:p-4 space-y-3 sm:space-y-4">
        {/* Header mobile-friendly */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm sm:text-xl font-semibold text-center flex-1 sm:flex-none">
              {format(weekStart, "d", { locale: fr })} - {format(weekEnd, "d MMM", { locale: fr })}
            </h2>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {isWeekDeload && (
              <Badge variant="secondary" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
                <TrendingDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                Décharge
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Switch
                id="deload-toggle"
                checked={isWeekDeload}
                onCheckedChange={(checked) => toggleWeekDeloadMutation.mutate(checked)}
                disabled={plannedWorkouts.length === 0}
              />
              <label htmlFor="deload-toggle" className="text-xs sm:text-sm font-medium cursor-pointer">
                Décharge
              </label>
            </div>
            <Button 
              onClick={() => setCurrentWeek(new Date())}
              size="sm"
              className="text-xs sm:text-sm"
            >
              Aujourd'hui
            </Button>
          </div>
        </div>

        {/* Calendrier - Vue desktop (grille) et mobile (liste verticale) */}
        <Card>
          <CardContent className="p-2 sm:p-4">
            {/* Desktop: grille 7 colonnes */}
            <div className="hidden sm:block">
              {/* En-têtes jours avec dates */}
              <div className="grid grid-cols-7 gap-2 mb-3">
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

              {/* Jours de la semaine avec créneaux */}
              <div className="grid grid-cols-7 gap-2">
                {days.map((day, idx) => {
                  const activities = getActivitiesForDay(day);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "min-h-[200px] rounded-lg border transition-all",
                        isToday && "border-primary border-2 bg-accent/10"
                      )}
                    >
                      <div className="p-1 space-y-1">
                        {TIME_SLOTS.map(slot => {
                          const activity = activities.find(a => a.slot === slot.id);
                          
                          return (
                            <div
                              key={slot.id}
                              className={cn(
                                "p-1.5 rounded text-xs cursor-pointer transition-all group relative",
                                activity 
                                  ? getStatusColor(activity.status)
                                  : "bg-background/50 hover:bg-accent/50 border border-dashed border-muted-foreground/20"
                              )}
                              onClick={(e) => handleSlotClick(day, slot.id, e)}
                            >
                              {activity ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] opacity-70">{slot.icon} {slot.time}</span>
                                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                      {activity.type === "workout" && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-4 w-4"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setViewWorkoutId(activity.id);
                                          }}
                                        >
                                          <Eye className="h-3 w-3" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (activity.type === "workout") {
                                            setDeleteWorkoutId(activity.id);
                                          } else if (activity.type === "run") {
                                            setDeleteRunId(activity.id);
                                          } else if (activity.type === "completed_run") {
                                            setDeleteCompletedRunId(activity.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div 
                                    className="flex items-center gap-1 cursor-pointer"
                                    onClick={(e) => {
                                      if (activity.type === "workout") {
                                        e.stopPropagation();
                                        setViewWorkoutId(activity.id);
                                      }
                                    }}
                                  >
                                    {activity.type === "workout" ? (
                                      <>
                                        <Dumbbell className="h-3 w-3 flex-shrink-0" />
                                        <span className="font-medium line-clamp-1">{activity.name}</span>
                                      </>
                                    ) : (
                                      <>
                                        <PersonStanding className="h-3 w-3 flex-shrink-0" />
                                        <span className="font-medium">
                                          {activity.distance_km || activity.target_distance_km 
                                            ? `${activity.distance_km || activity.target_distance_km}km` 
                                            : "Run"}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {activity.is_deload && (
                                    <Badge variant="outline" className="text-[8px] px-1 py-0">
                                      <TrendingDown className="h-2 w-2 mr-0.5" />
                                      Décharge
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 py-1 text-muted-foreground/50">
                                  <span className="text-[10px]">{slot.icon}</span>
                                  <Plus className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile: liste verticale par jour */}
            <div className="sm:hidden space-y-2">
              {days.map((day, idx) => {
                const activities = getActivitiesForDay(day);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={idx}
                    className={cn(
                      "rounded-lg border p-2",
                      isToday && "border-primary border-2 bg-accent/10"
                    )}
                  >
                    {/* En-tête du jour */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-lg font-bold",
                          isToday && "text-primary"
                        )}>
                          {format(day, "d")}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {format(day, "EEEE", { locale: fr })}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleDayClick(day)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Ajouter
                      </Button>
                    </div>

                    {/* Créneaux avec activités */}
                    <div className="space-y-1">
                      {activities.length > 0 ? (
                        activities.map((activity) => {
                          const slotInfo = TIME_SLOTS.find(s => s.id === activity.slot);
                          return (
                            <div
                              key={`${activity.type}-${activity.id}`}
                              className={cn(
                                "flex items-center justify-between p-2 rounded",
                                getStatusColor(activity.status)
                              )}
                              onClick={() => {
                                if (activity.type === "workout") {
                                  setViewWorkoutId(activity.id);
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs opacity-70">{slotInfo?.icon}</span>
                                {activity.type === "workout" ? (
                                  <>
                                    <Dumbbell className="h-4 w-4" />
                                    <span className="font-medium text-sm">{activity.name}</span>
                                  </>
                                ) : (
                                  <>
                                    <PersonStanding className="h-4 w-4" />
                                    <span className="font-medium text-sm">
                                      {activity.distance_km || activity.target_distance_km 
                                        ? `${activity.distance_km || activity.target_distance_km}km` 
                                        : "Run"}
                                      {(activity.duration_minutes || activity.target_duration_minutes) && 
                                        ` - ${activity.duration_minutes || activity.target_duration_minutes}min`}
                                    </span>
                                  </>
                                )}
                                {activity.is_deload && (
                                  <Badge variant="outline" className="text-[10px] px-1">
                                    Décharge
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-1">
                                {activity.type === "workout" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewWorkoutId(activity.id);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activity.type === "workout") {
                                      setDeleteWorkoutId(activity.id);
                                    } else if (activity.type === "run") {
                                      setDeleteRunId(activity.id);
                                    } else if (activity.type === "completed_run") {
                                      setDeleteCompletedRunId(activity.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center text-xs text-muted-foreground py-2">
                          Aucune activité
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Légende - compacte sur mobile */}
        <div className="flex flex-wrap gap-2 sm:gap-4 text-[10px] sm:text-sm">
          <div className="flex items-center gap-1 sm:gap-2">
            <Dumbbell className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Muscu</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <PersonStanding className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Run</span>
          </div>
          <div className="w-px h-3 sm:h-4 bg-border" />
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-muted" />
            <span>Planifié</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-success" />
            <span>Réalisé</span>
          </div>
        </div>

        {/* Dialog planification */}
        <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Planifier une activité - {selectedDate && format(selectedDate, "EEEE d MMMM", { locale: fr })}
              </DialogTitle>
            <DialogDescription>
                {selectedDate && (
                  <>
                    <span className="font-medium">{getSlotShortLabel(selectedSlot)}</span>
                    {getSlotActivity(selectedDate, selectedSlot) && (
                      <span className="text-warning ml-2">
                        ⚠️ Ce créneau est déjà occupé
                      </span>
                    )}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {activityType === null && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Créneau horaire</label>
                  <Select value={selectedSlot.toString()} onValueChange={(val) => setSelectedSlot(parseInt(val))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map(slot => {
                        const activity = selectedDate ? getSlotActivity(selectedDate, slot.id) : null;
                        return (
                          <SelectItem key={slot.id} value={slot.id.toString()}>
                            {slot.icon} {slot.label} ({slot.time})
                            {activity && (
                              <span className="text-muted-foreground ml-2">
                                - {activity.type === "workout" ? activity.name : "Run"}
                              </span>
                            )}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => setActivityType("workout")}
                    variant="outline"
                    className="h-20 flex flex-col gap-2"
                  >
                    <Dumbbell className="h-6 w-6" />
                    <span>Musculation</span>
                  </Button>
                  <Button
                    onClick={() => setActivityType("run")}
                    variant="outline"
                    className="h-20 flex flex-col gap-2"
                  >
                    <PersonStanding className="h-6 w-6" />
                    <span>Run</span>
                  </Button>
                </div>
              </div>
            )}
            {activityType === "workout" && (
              <div className="space-y-4">
                <Button variant="ghost" onClick={() => setActivityType(null)} className="mb-2">
                  ← Retour
                </Button>
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
            )}
            {activityType === "run" && (
              <div className="space-y-4">
                <Button variant="ghost" onClick={() => setActivityType(null)} className="mb-2">
                  ← Retour
                </Button>
                <Button
                  onClick={() => {
                    setShowPlanDialog(false);
                    setShowRunPlanDialog(true);
                  }}
                  className="w-full"
                >
                  Planifier un run
                </Button>
                <Button
                  onClick={() => {
                    setShowPlanDialog(false);
                    setShowRunRecordDialog(true);
                  }}
                  className="w-full"
                  variant="secondary"
                >
                  Enregistrer un run effectué
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog confirmation écrasement */}
        <AlertDialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remplacer l'activité existante ?</AlertDialogTitle>
              <AlertDialogDescription>
                Ce créneau contient déjà {existingActivityToOverwrite?.type === "workout" 
                  ? `la séance "${existingActivityToOverwrite.name}"` 
                  : "un run planifié"}.
                <br />
                Voulez-vous le remplacer par la nouvelle séance ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowOverwriteConfirm(false);
                setPendingActivity(null);
                setExistingActivityToOverwrite(null);
              }}>
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmOverwrite}>
                Remplacer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialogs pour les runs */}
        <RunPlanDialog
          open={showRunPlanDialog}
          onOpenChange={setShowRunPlanDialog}
          selectedDate={selectedDate}
          selectedSlot={selectedSlot}
        />
        
        <RunRecordDialog
          open={showRunRecordDialog}
          onOpenChange={setShowRunRecordDialog}
          selectedDate={selectedDate}
          plannedRunId={selectedRunForRecord?.id}
          targetDistance={selectedRunForRecord?.targetDistance}
          targetDuration={selectedRunForRecord?.targetDuration}
        />

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

        {/* Dialog de confirmation de suppression run */}
        <AlertDialog open={!!deleteRunId} onOpenChange={(open) => !open && setDeleteRunId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce run ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Le run planifié sera définitivement supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteRunId && deletePlannedRunMutation.mutate(deleteRunId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de confirmation de suppression run effectué */}
        <AlertDialog open={!!deleteCompletedRunId} onOpenChange={(open) => !open && setDeleteCompletedRunId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce run effectué ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Le run enregistré et ses données seront définitivement supprimés de votre historique.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteCompletedRunId && deleteCompletedRunMutation.mutate(deleteCompletedRunId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog détails séance */}
        <PlannedWorkoutDetailDialog
          open={!!viewWorkoutId}
          onOpenChange={(open) => !open && setViewWorkoutId(null)}
          plannedWorkoutId={viewWorkoutId}
          onDelete={() => viewWorkoutId && setDeleteWorkoutId(viewWorkoutId)}
        />
      </div>
    </Layout>
  );
}
