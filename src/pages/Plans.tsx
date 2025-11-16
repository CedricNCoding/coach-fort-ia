import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GripVertical, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Plans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", goal: "", notes: "" });

  // Charger les plans
  const { data: plans = [] } = useQuery({
    queryKey: ["workout_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Mutation création plan
  const createPlanMutation = useMutation({
    mutationFn: async (plan: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("workout_templates")
        .insert([{ ...plan, user_id: user?.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workout_templates"] });
      toast({ title: "Plan créé" });
      setShowAddDialog(false);
      setFormData({ name: "", goal: "", notes: "" });
      // Rediriger vers la page d'édition du plan
      navigate(`/plans/${data.id}`);
    }
  });

  // Mutation suppression
  const deletePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("workout_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_templates"] });
      toast({ title: "Plan supprimé" });
    }
  });

  const handleCreatePlan = () => {
    if (!formData.name.trim()) {
      toast({ variant: "destructive", title: "Le nom est requis" });
      return;
    }
    createPlanMutation.mutate(formData);
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Mes Plans d'Entraînement</h1>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Créer un Plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau Plan</DialogTitle>
                <DialogDescription>
                  Créez un nouveau plan d'entraînement
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du plan *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Push, Legs, Full Body..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Objectif</Label>
                  <Select value={formData.goal} onValueChange={(val) => setFormData({ ...formData, goal: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un objectif" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hypertrophie">Hypertrophie</SelectItem>
                      <SelectItem value="force">Force</SelectItem>
                      <SelectItem value="endurance">Endurance</SelectItem>
                      <SelectItem value="mixte">Mixte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Description, conseils..."
                  />
                </div>
                <Button onClick={handleCreatePlan} className="w-full" disabled={createPlanMutation.isPending}>
                  {createPlanMutation.isPending ? "Création..." : "Créer le plan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {plans.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">Aucun plan créé</p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer votre premier plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map(plan => (
              <Card key={plan.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/plans/${plan.id}`)}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle>{plan.name}</CardTitle>
                      {plan.goal && (
                        <CardDescription className="capitalize">{plan.goal}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlanMutation.mutate(plan.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                {plan.notes && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{plan.notes}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
