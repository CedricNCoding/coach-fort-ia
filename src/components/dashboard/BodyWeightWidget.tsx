import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scale, TrendingUp, TrendingDown, Minus, Plus, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useHealthKit } from "@/hooks/useHealthKit";

/**
 * Widget compact pour saisir le poids corporel sur le dashboard
 */
export function BodyWeightWidget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const { isNative, isAuthorized, exportBodyWeight } = useHealthKit();

  // Charger les derniers poids
  const { data: weightData, isLoading } = useQuery({
    queryKey: ["body_weights_recent"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("body_weights")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: false })
        .limit(7);
      
      if (error) throw error;
      return data;
    }
  });

  // Mutation pour ajouter un poids
  const addWeightMutation = useMutation({
    mutationFn: async (weight: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const measuredAt = new Date().toISOString();

      const { error } = await supabase
        .from("body_weights")
        .insert([{
          user_id: user.id,
          weight_kg: weight,
          measured_at: measuredAt
        }]);
      
      if (error) throw error;

      // Auto-export to Health if enabled
      const autoSyncEnabled = localStorage.getItem('healthkit_auto_sync_weight') === 'true';
      if (isNative && isAuthorized && autoSyncEnabled) {
        await exportBodyWeight({ date: measuredAt, weight });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body_weights_recent"] });
      setIsEditing(false);
      setNewWeight("");
      toast({ title: "Poids enregistré !" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur lors de l'enregistrement" });
    }
  });

  const handleSubmit = () => {
    const weight = parseFloat(newWeight);
    if (isNaN(weight) || weight < 20 || weight > 300) {
      toast({ variant: "destructive", title: "Poids invalide (20-300 kg)" });
      return;
    }
    addWeightMutation.mutate(weight);
  };

  const latestWeight = weightData?.[0];
  const previousWeight = weightData?.[1];
  
  // Calculer la tendance
  let trend: "up" | "down" | "stable" | null = null;
  let diff = 0;
  if (latestWeight && previousWeight) {
    diff = Number(latestWeight.weight_kg) - Number(previousWeight.weight_kg);
    if (diff > 0.2) trend = "up";
    else if (diff < -0.2) trend = "down";
    else trend = "stable";
  }

  // Vérifier si le dernier poids date d'aujourd'hui
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const latestDateStr = latestWeight ? format(new Date(latestWeight.measured_at), "yyyy-MM-dd") : null;
  const hasRecordedToday = latestDateStr === todayStr;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Poids corporel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-12 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Poids corporel
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              placeholder="Ex: 75.5"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              className="h-9 w-24"
              autoFocus
            />
            <span className="text-sm text-muted-foreground">kg</span>
            <Button size="sm" variant="ghost" onClick={handleSubmit} disabled={addWeightMutation.isPending}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setNewWeight(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : latestWeight ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{Number(latestWeight.weight_kg).toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">kg</span>
                {trend && (
                  <span className={`flex items-center text-xs ${
                    trend === "up" ? "text-warning" : 
                    trend === "down" ? "text-success" : 
                    "text-muted-foreground"
                  }`}>
                    {trend === "up" && <TrendingUp className="h-3 w-3 mr-0.5" />}
                    {trend === "down" && <TrendingDown className="h-3 w-3 mr-0.5" />}
                    {trend === "stable" && <Minus className="h-3 w-3 mr-0.5" />}
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)} kg
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="h-8"
              >
                <Plus className="h-3 w-3 mr-1" />
                {hasRecordedToday ? "Corriger" : "Ajouter"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Dernière mesure : {format(new Date(latestWeight.measured_at), "d MMM à HH:mm", { locale: fr })}
            </p>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground mb-2">Aucune mesure enregistrée</p>
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Ajouter mon poids
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
