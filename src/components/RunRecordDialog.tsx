import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface RunRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | null;
  plannedRunId?: number | null;
  targetDistance?: number | null;
  targetDuration?: number | null;
}

export function RunRecordDialog({ 
  open, 
  onOpenChange, 
  selectedDate, 
  plannedRunId,
  targetDistance,
  targetDuration
}: RunRecordDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [avgHR, setAvgHR] = useState("");
  const [maxHR, setMaxHR] = useState("");
  const [notes, setNotes] = useState("");

  // Pré-remplir avec les cibles si disponibles
  useEffect(() => {
    if (open) {
      if (targetDistance) setDistance(targetDistance.toString());
      if (targetDuration) setDuration(targetDuration.toString());
    }
  }, [open, targetDistance, targetDuration]);

  const recordRunMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !distance || !duration) {
        throw new Error("Distance et durée sont obligatoires");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Enregistrer le run
      const { error } = await supabase
        .from("runs")
        .insert({
          user_id: user.id,
          date: format(selectedDate, "yyyy-MM-dd"),
          distance_km: parseFloat(distance),
          duration_minutes: parseInt(duration),
          avg_heart_rate: avgHR ? parseInt(avgHR) : null,
          max_heart_rate: maxHR ? parseInt(maxHR) : null,
          notes
        });
      
      if (error) throw error;

      // Marquer le run planifié comme complété si existant
      if (plannedRunId) {
        await supabase
          .from("planned_runs")
          .update({ status: "completed" })
          .eq("id", plannedRunId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["planned_runs"] });
      toast({ 
        title: "Run enregistré",
        description: `${distance} km en ${duration} min`
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message
      });
    }
  });

  const resetForm = () => {
    setDistance("");
    setDuration("");
    setAvgHR("");
    setMaxHR("");
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    recordRunMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Enregistrer un run - {selectedDate && format(selectedDate, "d MMMM yyyy", { locale: fr })}
          </DialogTitle>
          <DialogDescription>
            Saisissez les détails de votre course
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="distance">Distance (km) *</Label>
            <Input
              id="distance"
              type="number"
              step="0.1"
              min="0.1"
              required
              placeholder="Ex: 5.0"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Durée (minutes) *</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              required
              placeholder="Ex: 30"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
            {distance && duration && (
              <p className="text-xs text-muted-foreground">
                Allure: {(parseInt(duration) / parseFloat(distance)).toFixed(2)} min/km
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="avgHR">FC moyenne (bpm)</Label>
              <Input
                id="avgHR"
                type="number"
                min="30"
                max="250"
                placeholder="Ex: 140"
                value={avgHR}
                onChange={(e) => setAvgHR(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxHR">FC max (bpm)</Label>
              <Input
                id="maxHR"
                type="number"
                min="30"
                max="250"
                placeholder="Ex: 175"
                value={maxHR}
                onChange={(e) => setMaxHR(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              placeholder="Sensations, parcours..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={recordRunMutation.isPending}>
            {recordRunMutation.isPending ? "Enregistrement..." : "Enregistrer le run"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}