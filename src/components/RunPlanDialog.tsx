import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { TIME_SLOTS } from "@/lib/calendar-constants";

interface RunPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | null;
  selectedSlot?: number;
}

export function RunPlanDialog({ open, onOpenChange, selectedDate, selectedSlot = 1 }: RunPlanDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState<number>(selectedSlot);
  const [targetDistance, setTargetDistance] = useState("");
  const [targetDuration, setTargetDuration] = useState("");
  const [notes, setNotes] = useState("");

  // Mettre à jour le slot quand selectedSlot change
  useEffect(() => {
    setSlot(selectedSlot);
  }, [selectedSlot]);

  // Charger les activités existantes pour cette date
  const { data: existingActivities } = useQuery({
    queryKey: ["day_activities", selectedDate ? format(selectedDate, "yyyy-MM-dd") : null],
    queryFn: async () => {
      if (!selectedDate) return { workouts: [], runs: [] };
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      const [workoutsRes, runsRes] = await Promise.all([
        supabase.from("planned_workouts").select("slot").eq("date", dateStr),
        supabase.from("planned_runs").select("slot").eq("date", dateStr)
      ]);
      
      return {
        workouts: workoutsRes.data || [],
        runs: runsRes.data || []
      };
    },
    enabled: open && !!selectedDate
  });

  const isSlotOccupied = (slotId: number) => {
    if (!existingActivities) return false;
    return existingActivities.workouts.some(w => w.slot === slotId) || 
           existingActivities.runs.some(r => r.slot === slotId);
  };

  const addPlannedRunMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDate) throw new Error("Pas de date sélectionnée");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // Vérifier si le slot est déjà occupé par un workout
      const { data: existingWorkout } = await supabase
        .from("planned_workouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .eq("slot", slot)
        .maybeSingle();

      if (existingWorkout) {
        throw new Error("Ce créneau est déjà occupé par une séance de musculation");
      }

      // Vérifier si le slot est déjà occupé par un run
      const { data: existingRun } = await supabase
        .from("planned_runs")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .eq("slot", slot)
        .maybeSingle();

      if (existingRun) {
        // Mettre à jour le run existant
        const { error } = await supabase
          .from("planned_runs")
          .update({
            target_distance_km: targetDistance ? parseFloat(targetDistance) : null,
            target_duration_minutes: targetDuration ? parseInt(targetDuration) : null,
            notes,
            status: "planned"
          })
          .eq("id", existingRun.id);
        if (error) throw error;
      } else {
        // Créer un nouveau run
        const { error } = await supabase
          .from("planned_runs")
          .insert({
            user_id: user.id,
            date: dateStr,
            slot,
            target_distance_km: targetDistance ? parseFloat(targetDistance) : null,
            target_duration_minutes: targetDuration ? parseInt(targetDuration) : null,
            notes,
            status: "planned"
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planned_runs"] });
      queryClient.invalidateQueries({ queryKey: ["day_activities"] });
      toast({ title: "Run planifié" });
      onOpenChange(false);
      setTargetDistance("");
      setTargetDuration("");
      setNotes("");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addPlannedRunMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Planifier un run - {selectedDate && format(selectedDate, "EEEE d MMMM", { locale: fr })}
          </DialogTitle>
          <DialogDescription>
            Définissez vos objectifs pour ce run
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slot">Créneau horaire</Label>
            <Select value={slot.toString()} onValueChange={(val) => setSlot(parseInt(val))}>
              <SelectTrigger id="slot">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map(s => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.icon} {s.label} ({s.time})
                    {isSlotOccupied(s.id) && " - Occupé"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSlotOccupied(slot) && (
              <p className="text-xs text-warning">⚠️ Ce créneau est déjà occupé</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="distance">Distance cible (km)</Label>
            <Input
              id="distance"
              type="number"
              step="0.1"
              min="0"
              placeholder="Ex: 5.0"
              value={targetDistance}
              onChange={(e) => setTargetDistance(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Durée cible (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min="0"
              placeholder="Ex: 30"
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              placeholder="Objectifs, parcours prévu..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={addPlannedRunMutation.isPending}>
            {addPlannedRunMutation.isPending ? "Planification..." : "Planifier le run"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
