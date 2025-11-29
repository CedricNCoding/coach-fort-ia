import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface RunPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | null;
}

export function RunPlanDialog({ open, onOpenChange, selectedDate }: RunPlanDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState<1 | 2 | 3>(1);
  const [targetDistance, setTargetDistance] = useState("");
  const [targetDuration, setTargetDuration] = useState("");
  const [notes, setNotes] = useState("");

  const addPlannedRunMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDate) throw new Error("Pas de date sélectionnée");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Vérifier si le slot est déjà occupé
      const { data: existing } = await supabase
        .from("planned_runs")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", format(selectedDate, "yyyy-MM-dd"))
        .eq("slot", slot)
        .maybeSingle();

      if (existing) {
        // Remplacer le run existant
        const { error } = await supabase
          .from("planned_runs")
          .update({
            target_distance_km: targetDistance ? parseFloat(targetDistance) : null,
            target_duration_minutes: targetDuration ? parseInt(targetDuration) : null,
            notes,
            status: "planned"
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Créer un nouveau run
        const { error } = await supabase
          .from("planned_runs")
          .insert({
            user_id: user.id,
            date: format(selectedDate, "yyyy-MM-dd"),
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
            Planifier un run - {selectedDate && format(selectedDate, "d MMMM yyyy", { locale: fr })}
          </DialogTitle>
          <DialogDescription>
            Définissez vos objectifs pour ce run
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slot">Créneau</Label>
            <Select value={slot.toString()} onValueChange={(val) => setSlot(parseInt(val) as 1 | 2 | 3)}>
              <SelectTrigger id="slot">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Créneau 1 (matin)</SelectItem>
                <SelectItem value="2">Créneau 2 (après-midi)</SelectItem>
                <SelectItem value="3">Créneau 3 (soir)</SelectItem>
              </SelectContent>
            </Select>
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