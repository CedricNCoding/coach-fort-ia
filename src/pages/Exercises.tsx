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
import { Plus, Download, Upload, Pencil, Trash2, Search, FileText, Heart, X } from "lucide-react";
import { parseExercisesCSV, generateCSVTemplate, downloadCSV } from "@/lib/csv-import";
import { cn } from "@/lib/utils";

export default function Exercises() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterMuscle, setFilterMuscle] = useState<string>("all");
  const [filterPreference, setFilterPreference] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExercise, setEditingExercise] = useState<any>(null);

  // Formulaire
  const [formData, setFormData] = useState({
    name: "",
    muscle_group: "",
    equipment: "",
    default_rest_seconds: 90,
    notes: "",
    measurement_type: "reps" as "reps" | "time",
    video_url: ""
  });

  // Charger les exercices
  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("is_builtin", { ascending: false })
        .order("name");
      
      if (error) throw error;
      return data;
    }
  });

  // Charger les préférences utilisateur
  const { data: preferences = [] } = useQuery({
    queryKey: ["exercise_preferences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_exercise_preferences")
        .select("exercise_id, preference");
      
      if (error && error.code !== "PGRST116") throw error;
      return data || [];
    }
  });

  // Map des préférences pour accès rapide
  const preferencesMap = new Map(preferences.map(p => [p.exercise_id, p.preference]));

  // Mutation pour les préférences
  const setPreferenceMutation = useMutation({
    mutationFn: async ({ exerciseId, preference }: { exerciseId: number; preference: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      if (preference === null) {
        // Supprimer la préférence (neutre)
        await supabase
          .from("user_exercise_preferences")
          .delete()
          .eq("user_id", user.id)
          .eq("exercise_id", exerciseId);
      } else {
        // Check if exists
        const { data: existing } = await supabase
          .from("user_exercise_preferences")
          .select("id")
          .eq("user_id", user.id)
          .eq("exercise_id", exerciseId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("user_exercise_preferences")
            .update({ preference })
            .eq("user_id", user.id)
            .eq("exercise_id", exerciseId);
        } else {
          await supabase
            .from("user_exercise_preferences")
            .insert([{ user_id: user.id, exercise_id: exerciseId, preference }]);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercise_preferences"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur"
      });
    }
  });

  // Mutation création/modification
  const saveMutation = useMutation({
    mutationFn: async (exercise: any) => {
      if (editingExercise) {
        const { error } = await supabase
          .from("exercises")
          .update(exercise)
          .eq("id", editingExercise.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("exercises")
          .insert([{ ...exercise, user_id: user?.id }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast({ title: editingExercise ? "Exercice modifié" : "Exercice créé" });
      setShowAddDialog(false);
      setEditingExercise(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message
      });
    }
  });

  // Mutation suppression
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("exercises")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast({ title: "Exercice supprimé" });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      muscle_group: "",
      equipment: "",
      default_rest_seconds: 90,
      notes: "",
      measurement_type: "reps",
      video_url: ""
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ variant: "destructive", title: "Le nom est requis" });
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleEdit = (exercise: any) => {
    setEditingExercise(exercise);
    setFormData({
      name: exercise.name,
      muscle_group: exercise.muscle_group || "",
      equipment: exercise.equipment || "",
      default_rest_seconds: exercise.default_rest_seconds || 90,
      notes: exercise.notes || "",
      measurement_type: exercise.measurement_type || "reps",
      video_url: exercise.video_url || ""
    });
    setShowAddDialog(true);
  };

  // Import CSV
  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvContent = event.target?.result as string;
      const { rows, errors } = parseExercisesCSV(csvContent);

      if (errors.length > 0) {
        toast({
          variant: "destructive",
          title: "Erreurs de parsing",
          description: errors.join(", ")
        });
      }

      if (rows.length === 0) return;

      const { data: { user } } = await supabase.auth.getUser();
      let created = 0, updated = 0, skipped = 0;

      for (const row of rows) {
        try {
          // Vérifier si l'exercice existe déjà
          const { data: existing } = await supabase
            .from("exercises")
            .select("id")
            .eq("user_id", user?.id)
            .eq("name", row.name)
            .eq("is_builtin", 0)
            .single();

          if (existing) {
            // Mise à jour
            await supabase
              .from("exercises")
              .update({
                muscle_group: row.muscle_group,
                equipment: row.equipment,
                measurement_type: row.measurement_type,
                default_rest_seconds: row.default_rest_seconds || 90,
                notes: row.notes
              })
              .eq("id", existing.id);
            updated++;
          } else {
            // Création
            await supabase
              .from("exercises")
              .insert([{
                user_id: user?.id,
                name: row.name,
                muscle_group: row.muscle_group,
                equipment: row.equipment,
                measurement_type: row.measurement_type,
                default_rest_seconds: row.default_rest_seconds || 90,
                notes: row.notes,
                is_builtin: 0
              }]);
            created++;
          }
        } catch (error) {
          skipped++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast({
        title: "Import terminé",
        description: `${created} créés, ${updated} mis à jour, ${skipped} ignorés`
      });
    };

    reader.readAsText(file);
  };

  // Import XML GymBook
  const handleXMLImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const xmlContent = event.target?.result as string;
      
      try {
        const { parseGymBookXML, mapGymBookRegionToMuscleGroup } = await import("@/lib/gymbook-xml-import");
        const exercises = parseGymBookXML(xmlContent);
        
        if (exercises.length === 0) {
          toast({
            variant: "destructive",
            title: "Aucun exercice trouvé dans le fichier"
          });
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        let created = 0, skipped = 0;

        for (const ex of exercises) {
          try {
            // Vérifier si l'exercice existe déjà
            const { data: existing } = await supabase
              .from("exercises")
              .select("id")
              .eq("user_id", user?.id)
              .eq("name", ex.name)
              .eq("is_builtin", 0)
              .single();

            if (!existing) {
              // Création
              await supabase
                .from("exercises")
                .insert([{
                  user_id: user?.id,
                  name: ex.name,
                  muscle_group: ex.targetRegion ? mapGymBookRegionToMuscleGroup(ex.targetRegion) : "Autre",
                  equipment: ex.targetMusclesPrimary || "",
                  measurement_type: "reps",
                  default_rest_seconds: 90,
                  notes: ex.notes || "",
                  is_builtin: 0
                }]);
              created++;
            } else {
              skipped++;
            }
          } catch (error) {
            console.error("Error importing exercise:", ex.name, error);
            skipped++;
          }
        }

        queryClient.invalidateQueries({ queryKey: ["exercises"] });
        toast({
          title: "Import GymBook terminé",
          description: `${created} créés, ${skipped} ignorés (déjà existants)`
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erreur d'import",
          description: error instanceof Error ? error.message : "Erreur inconnue"
        });
      }
    };

    reader.readAsText(file);
  };

  // Filtrage
  const filteredExercises = exercises.filter(ex => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase()) ||
                       (ex.muscle_group || "").toLowerCase().includes(search.toLowerCase());
    const matchMuscle = filterMuscle === "all" || ex.muscle_group === filterMuscle;
    
    // Filtre par préférence
    const pref = preferencesMap.get(ex.id);
    const matchPreference = filterPreference === "all" ||
                           (filterPreference === "loved" && pref === "loved") ||
                           (filterPreference === "disliked" && pref === "disliked") ||
                           (filterPreference === "neutral" && !pref);
    
    return matchSearch && matchMuscle && matchPreference;
  });

  const muscleGroups = Array.from(new Set(exercises.map(e => e.muscle_group).filter(Boolean))) as string[];

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Exercices</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { exportExercisesToCSV, downloadCSV } = await import("@/lib/csv-import");
                const csv = exportExercisesToCSV(exercises);
                downloadCSV(csv, "mes-exercices.csv");
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(generateCSVTemplate(), "modele-exercices.csv")}
            >
              <Download className="h-4 w-4 mr-2" />
              Modèle CSV
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer flex items-center">
                <Upload className="h-4 w-4 mr-2" />
                Importer CSV
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVImport}
                />
              </label>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Import GymBook
                <input
                  type="file"
                  accept=".xml"
                  className="hidden"
                  onChange={handleXMLImport}
                />
              </label>
            </Button>
            <Dialog open={showAddDialog} onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) {
                setEditingExercise(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvel exercice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingExercise ? "Modifier" : "Nouvel"} exercice</DialogTitle>
                  <DialogDescription>
                    Créez ou modifiez un exercice personnalisé
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Squat bulgare"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Groupe musculaire</Label>
                      <Input
                        value={formData.muscle_group}
                        onChange={(e) => setFormData({ ...formData, muscle_group: e.target.value })}
                        placeholder="Ex: Jambes"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Équipement</Label>
                      <Input
                        value={formData.equipment}
                        onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                        placeholder="Ex: Haltères"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Repos par défaut (secondes)</Label>
                    <Input
                      type="number"
                      value={formData.default_rest_seconds}
                      onChange={(e) => setFormData({ ...formData, default_rest_seconds: parseInt(e.target.value) || 90 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type de mesure</Label>
                    <Select
                      value={formData.measurement_type}
                      onValueChange={(value: "reps" | "time") => setFormData({ ...formData, measurement_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reps">Répétitions</SelectItem>
                        <SelectItem value="time">Temps (secondes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Lien vidéo YouTube</Label>
                    <Input
                      value={formData.video_url}
                      onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Conseils d'exécution..."
                    />
                  </div>
                  <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un exercice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterMuscle} onValueChange={setFilterMuscle}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les groupes</SelectItem>
              {muscleGroups.map(group => (
                <SelectItem key={group} value={group}>{group}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPreference} onValueChange={setFilterPreference}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes préf.</SelectItem>
              <SelectItem value="loved">❤️ Adorés</SelectItem>
              <SelectItem value="disliked">❌ Détestés</SelectItem>
              <SelectItem value="neutral">😐 Neutres</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Chargement...</div>
        ) : filteredExercises.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun exercice trouvé
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredExercises.map(exercise => (
              <Card key={exercise.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{exercise.name}</CardTitle>
                      {exercise.muscle_group && (
                        <CardDescription>{exercise.muscle_group}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {/* Boutons de préférence */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8",
                          preferencesMap.get(exercise.id) === "loved" 
                            ? "text-red-500 bg-red-500/10" 
                            : "text-muted-foreground hover:text-red-500"
                        )}
                        onClick={() => {
                          const current = preferencesMap.get(exercise.id);
                          setPreferenceMutation.mutate({
                            exerciseId: exercise.id,
                            preference: current === "loved" ? null : "loved"
                          });
                        }}
                        title="J'adore cet exercice"
                      >
                        <Heart className={cn("h-4 w-4", preferencesMap.get(exercise.id) === "loved" && "fill-current")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8",
                          preferencesMap.get(exercise.id) === "disliked" 
                            ? "text-orange-500 bg-orange-500/10" 
                            : "text-muted-foreground hover:text-orange-500"
                        )}
                        onClick={() => {
                          const current = preferencesMap.get(exercise.id);
                          setPreferenceMutation.mutate({
                            exerciseId: exercise.id,
                            preference: current === "disliked" ? null : "disliked"
                          });
                        }}
                        title="Je déteste cet exercice"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      
                      {/* Boutons d'édition (seulement pour les exercices custom) */}
                      {exercise.is_builtin === 0 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(exercise)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteMutation.mutate(exercise.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {exercise.equipment && (
                    <div className="text-muted-foreground">
                      Équipement : {exercise.equipment}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    Type : {exercise.measurement_type === 'time' ? 'Temps' : 'Répétitions'}
                  </div>
                  <div className="text-muted-foreground">
                    Repos : {exercise.default_rest_seconds}s
                  </div>
                  {exercise.video_url && (
                    <a 
                      href={exercise.video_url} 
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(exercise.video_url, '_blank', 'noopener,noreferrer');
                      }}
                      className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer text-sm font-medium"
                    >
                      🎥 Voir la démonstration
                    </a>
                  )}
                  {exercise.is_builtin === 1 && (
                    <div className="inline-block px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
                      Exercice builtin
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
