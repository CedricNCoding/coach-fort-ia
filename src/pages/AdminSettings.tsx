import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Save, Download, Trash2 } from "lucide-react";

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPrompt, setEditingPrompt] = useState<any>(null);

  // Charger les prompts système
  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ["ai_prompts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_prompts")
        .select("*")
        .order("prompt_key");
      if (error) throw error;
      return data;
    }
  });

  // Mutation pour mettre à jour un prompt
  const updatePromptMutation = useMutation({
    mutationFn: async ({ id, prompt_content }: { id: number; prompt_content: string }) => {
      const { error } = await supabase
        .from("ai_prompts")
        .update({ prompt_content, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_prompts"] });
      toast({ title: "Prompt mis à jour avec succès" });
      setEditingPrompt(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message
      });
    }
  });

  // Export des données IA
  const exportAIMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("export-ai-data");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Télécharger le fichier JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-data-export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Données IA exportées" });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erreur d'export",
        description: error.message
      });
    }
  });

  // Purge des exercices par paquet
  const purgeExercisesMutation = useMutation({
    mutationFn: async (type: "user" | "builtin" | "all") => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      let query = supabase.from("exercises").delete();

      if (type === "user") {
        query = query.eq("user_id", user.id).eq("is_builtin", 0);
      } else if (type === "builtin") {
        query = query.eq("is_builtin", 1);
      }
      // Pour "all", pas de filtre

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      const typeLabels = {
        user: "Exercices utilisateur",
        builtin: "Exercices intégrés",
        all: "Tous les exercices"
      };
      toast({ title: `${typeLabels[type]} supprimés` });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erreur de suppression",
        description: error.message
      });
    }
  });

  const handleSavePrompt = () => {
    if (editingPrompt) {
      updatePromptMutation.mutate({
        id: editingPrompt.id,
        prompt_content: editingPrompt.prompt_content
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto p-6">Chargement...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Administration</h1>
          <p className="text-muted-foreground">
            Gérer les prompts système et les données de l'application
          </p>
        </div>

        {/* Gestion des prompts système */}
        <Card>
          <CardHeader>
            <CardTitle>Prompts Système IA</CardTitle>
            <CardDescription>
              Modifier les prompts système utilisés par les différentes fonctionnalités IA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {prompts.map((prompt) => (
              <div key={prompt.id} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{prompt.prompt_key}</h3>
                    <p className="text-sm text-muted-foreground">{prompt.description}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingPrompt(prompt)}
                  >
                    Modifier
                  </Button>
                </div>
                {editingPrompt?.id === prompt.id && (
                  <div className="space-y-3">
                    <Textarea
                      value={editingPrompt.prompt_content}
                      onChange={(e) =>
                        setEditingPrompt({
                          ...editingPrompt,
                          prompt_content: e.target.value
                        })
                      }
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSavePrompt}
                        disabled={updatePromptMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Enregistrer
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingPrompt(null)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Export des données IA */}
        <Card>
          <CardHeader>
            <CardTitle>Export des Données IA</CardTitle>
            <CardDescription>
              Télécharger toutes les interactions IA (prompts et réponses) au format JSON
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => exportAIMutation.mutate()}
              disabled={exportAIMutation.isPending}
            >
              <Download className="w-4 h-4 mr-2" />
              Exporter les données IA
            </Button>
          </CardContent>
        </Card>

        {/* Purge des exercices */}
        <Card>
          <CardHeader>
            <CardTitle>Gestion des Exercices</CardTitle>
            <CardDescription>
              Supprimer des exercices de la base de données (attention: irréversible)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Mes exercices
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer vos exercices ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action supprimera tous vos exercices personnalisés. Les exercices intégrés ne seront pas affectés.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => purgeExercisesMutation.mutate("user")}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Exercices intégrés
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer les exercices intégrés ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action supprimera tous les exercices intégrés par défaut de l'application.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => purgeExercisesMutation.mutate("builtin")}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Tous les exercices
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer TOUS les exercices ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      ⚠️ ATTENTION : Cette action est irréversible et supprimera TOUS les exercices (personnalisés ET intégrés) de la base de données.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => purgeExercisesMutation.mutate("all")}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer tout
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
