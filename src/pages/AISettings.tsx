import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Brain, Loader2 } from "lucide-react";

/**
 * Page Réglages IA
 * Permet de configurer l'API key, le modèle et l'URL de base
 */
export default function AISettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    api_key: "",
    model_name: "gpt-4.1-mini",
    base_url: "https://api.openai.com/v1/chat/completions"
  });

  // Charger les paramètres actuels
  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      
      if (error && error.code !== "PGRST116") throw error;
      
      if (data) {
        setFormData({
          api_key: "", // Ne pas afficher la clé pour la sécurité
          model_name: data.model_name || "gpt-4.1-mini",
          base_url: data.base_url || "https://api.openai.com/v1/chat/completions"
        });
      }
      
      return data;
    }
  });

  // Mutation pour sauvegarder
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("Non authentifié");

      const payload = {
        user_id: user.id,
        model_name: formData.model_name,
        base_url: formData.base_url,
        // Ne mettre à jour api_key que si elle est fournie
        ...(formData.api_key && { api_key: formData.api_key })
      };

      if (settings?.id) {
        // Mise à jour
        const { error } = await supabase
          .from("ai_settings")
          .update(payload)
          .eq("id", settings.id);
        
        if (error) throw error;
      } else {
        // Création
        const { error } = await supabase
          .from("ai_settings")
          .insert([payload]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_settings"] });
      toast({ title: "Paramètres sauvegardés" });
      setFormData(prev => ({ ...prev, api_key: "" })); // Effacer le champ api_key
    },
    onError: (error) => {
      toast({ 
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de la sauvegarde"
      });
    }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Réglages IA</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuration du modèle d'IA</CardTitle>
            <CardDescription>
              Configurez votre clé API et le modèle à utiliser pour les conseils et le feedback.
              Si la clé API n'est pas configurée ou en cas d'erreur, le système utilisera les règles déterministes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api_key">Clé API</Label>
              <Input
                id="api_key"
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="sk-..."
              />
              <p className="text-xs text-muted-foreground">
                Votre clé API OpenAI ou compatible. Elle ne sera jamais affichée après sauvegarde.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model_name">Nom du modèle</Label>
              <Input
                id="model_name"
                value={formData.model_name}
                onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                placeholder="gpt-4.1-mini"
              />
              <p className="text-xs text-muted-foreground">
                Ex : gpt-4.1-mini, gpt-5, gpt-4o, etc.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_url">URL de base</Label>
              <Input
                id="base_url"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="https://api.openai.com/v1/chat/completions"
              />
              <p className="text-xs text-muted-foreground">
                URL du endpoint de l'API. Modifiez-la uniquement si vous utilisez un provider alternatif.
              </p>
            </div>

            <Button 
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sauvegarder les paramètres
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">ℹ️ Fonctionnement du fallback</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              Si l'IA n'est pas disponible (clé manquante, erreur d'API, etc.), l'application utilisera 
              automatiquement les <strong>règles déterministes de progression</strong> :
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Si reps ≥ max du rep range → +2.5% de charge</li>
              <li>Si reps dans le rep range → maintien de la charge</li>
              <li>Si reps &lt; min du rep range → -5% de charge</li>
              <li>Sécurité : max ±5% par séance, max +1 set</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Ces règles garantissent une progression sûre et efficace même sans IA.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
