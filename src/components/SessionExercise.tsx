import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, AlertCircle } from "lucide-react";
import RestTimer from "./RestTimer";
import { Checkbox } from "@/components/ui/checkbox";
import { Database } from "@/integrations/supabase/types";

type TemplateExercise = Database["public"]["Tables"]["workout_template_exercises"]["Row"] & {
  exercises: Database["public"]["Tables"]["exercises"]["Row"];
};

type SessionSet = Database["public"]["Tables"]["session_sets"]["Row"];

interface SessionExerciseProps {
  templateExercise: TemplateExercise;
  sessionId: number;
  sessionSets: SessionSet[];
}

/**
 * Composant pour afficher un exercice dans une séance
 * Permet de saisir les sets avec reps, poids, difficulté, douleur
 */
export default function SessionExercise({ templateExercise, sessionId, sessionSets }: SessionExerciseProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddSet, setShowAddSet] = useState(false);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>("");

  // Formulaire de set
  const [setForm, setSetForm] = useState({
    reps: templateExercise.target_reps_max || 12,
    weight_kg: Number(templateExercise.next_target_weight_kg || templateExercise.target_weight_kg || 0),
    perceived_difficulty: 7,
    pain: false,
    pain_notes: "",
    is_warmup: false
  });

  // Charger la dernière séance pour cet exercice
  const { data: lastSession } = useQuery({
    queryKey: ["last_session_exercise", templateExercise.exercise_id],
    queryFn: async () => {
      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("id")
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
        .limit(5);
      
      if (sessionsError || !sessions?.length) return null;

      const { data: sets, error: setsError } = await supabase
        .from("session_sets")
        .select("*")
        .eq("exercise_id", templateExercise.exercise_id)
        .in("session_id", sessions.map(s => s.id))
        .eq("is_warmup", 0)
        .order("created_at", { ascending: false });
      
      if (setsError || !sets?.length) return null;

      // Meilleur set = reps × poids max
      const bestSet = sets.reduce((best, current) => {
        const bestScore = best.reps * Number(best.weight_kg);
        const currentScore = current.reps * Number(current.weight_kg);
        return currentScore > bestScore ? current : best;
      });

      const tonnage = sets.reduce((sum, s) => sum + (s.reps * Number(s.weight_kg)), 0);
      const avgDifficulty = sets.reduce((sum, s) => sum + (s.perceived_difficulty || 7), 0) / sets.length;

      return { bestSet, tonnage, avgDifficulty };
    }
  });

  // Charger le conseil IA
  const loadAiAdviceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-advise-set", {
        body: {
          session_id: sessionId,
          template_exercise_id: templateExercise.id
        }
      });
      
      if (error) throw error;
      return data.advice as string;
    },
    onSuccess: (advice) => {
      setAiAdvice(advice);
    },
    onError: () => {
      setAiAdvice("Vise un ressenti 7-8/10, difficile mais contrôlé, environ 1-2 reps en réserve.");
    }
  });

  // Mutation pour ajouter un set
  const addSetMutation = useMutation({
    mutationFn: async () => {
      const setIndex = sessionSets.length;
      
      const { error } = await supabase
        .from("session_sets")
        .insert([{
          session_id: sessionId,
          exercise_id: templateExercise.exercise_id,
          template_exercise_id: templateExercise.id,
          set_index: setIndex,
          reps: setForm.reps,
          weight_kg: setForm.weight_kg,
          perceived_difficulty: setForm.perceived_difficulty,
          pain: setForm.pain ? 1 : 0,
          pain_notes: setForm.pain ? setForm.pain_notes : null,
          is_warmup: setForm.is_warmup ? 1 : 0
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session_sets"] });
      toast({ title: "Set enregistré" });
      setShowAddSet(false);
      
      // Démarrer le minuteur de repos si ce n'est pas un échauffement
      if (!setForm.is_warmup) {
        setShowRestTimer(true);
      }
    }
  });

  // Dupliquer le dernier set
  const duplicateLastSet = () => {
    if (sessionSets.length === 0) return;
    const lastSet = sessionSets[sessionSets.length - 1];
    setSetForm({
      reps: lastSet.reps,
      weight_kg: Number(lastSet.weight_kg),
      perceived_difficulty: lastSet.perceived_difficulty || 7,
      pain: lastSet.pain === 1,
      pain_notes: lastSet.pain_notes || "",
      is_warmup: lastSet.is_warmup === 1
    });
  };

  const targetWeight = Number(templateExercise.next_target_weight_kg || templateExercise.target_weight_kg || 0);
  const targetRestSeconds = templateExercise.target_rest_seconds || templateExercise.exercises.default_rest_seconds || 90;

  return (
    <div className="space-y-4">
      {/* En-tête de l'exercice */}
      <div>
        <h3 className="text-xl font-bold">{templateExercise.exercises.name}</h3>
        <p className="text-sm text-muted-foreground">
          {templateExercise.exercises.muscle_group} • {templateExercise.exercises.equipment}
        </p>
      </div>

      {/* Cibles actuelles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div className="p-2 bg-muted rounded">
          <p className="text-muted-foreground">Sets</p>
          <p className="font-bold">{templateExercise.target_sets}</p>
        </div>
        <div className="p-2 bg-muted rounded">
          <p className="text-muted-foreground">Reps</p>
          <p className="font-bold">{templateExercise.target_reps_min}-{templateExercise.target_reps_max}</p>
        </div>
        <div className="p-2 bg-muted rounded">
          <p className="text-muted-foreground">Charge</p>
          <p className="font-bold">{targetWeight.toFixed(1)} kg</p>
        </div>
        <div className="p-2 bg-muted rounded">
          <p className="text-muted-foreground">Repos</p>
          <p className="font-bold">{targetRestSeconds}s</p>
        </div>
      </div>

      {/* Dernière séance */}
      {lastSession && (
        <Card className="bg-muted/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Dernière séance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Meilleur set : {lastSession.bestSet.reps} × {Number(lastSession.bestSet.weight_kg).toFixed(1)} kg</p>
            <p>Tonnage : {lastSession.tonnage.toFixed(1)} kg</p>
            <p>Difficulté moyenne : {lastSession.avgDifficulty.toFixed(1)}/10</p>
          </CardContent>
        </Card>
      )}

      {/* Conseil IA */}
      {aiAdvice && (
        <div className="p-3 bg-accent/20 rounded-lg border border-accent">
          <p className="text-sm"><strong>Coach IA :</strong> {aiAdvice}</p>
        </div>
      )}

      {/* Sets réalisés */}
      {sessionSets.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Sets réalisés</h4>
          {sessionSets.map((set, idx) => (
            <div key={set.id} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
              <span className="font-bold w-8">#{idx + 1}</span>
              <span>{set.reps} × {Number(set.weight_kg).toFixed(1)} kg</span>
              <span className="text-muted-foreground">• Difficulté {set.perceived_difficulty}/10</span>
              {set.pain === 1 && <AlertCircle className="h-4 w-4 text-destructive" />}
              {set.is_warmup === 1 && <span className="text-xs text-muted-foreground">(Échauffement)</span>}
            </div>
          ))}
        </div>
      )}

      {/* Minuteur de repos */}
      {showRestTimer && (
        <RestTimer
          targetSeconds={targetRestSeconds}
          onComplete={() => setShowRestTimer(false)}
        />
      )}

      {/* Boutons d'action */}
      <div className="flex gap-2">
        {!showAddSet ? (
          <>
            <Button onClick={() => {
              setShowAddSet(true);
              if (!aiAdvice) {
                loadAiAdviceMutation.mutate();
              }
            }} className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un set
            </Button>
            {sessionSets.length > 0 && (
              <Button onClick={duplicateLastSet} variant="outline" size="icon">
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg">Nouveau set</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Reps</Label>
                  <Input
                    type="number"
                    value={setForm.reps}
                    onChange={(e) => setSetForm({ ...setForm, reps: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Poids (kg)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={setForm.weight_kg}
                    onChange={(e) => setSetForm({ ...setForm, weight_kg: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Difficulté perçue (1-10)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={setForm.perceived_difficulty}
                  onChange={(e) => setSetForm({ ...setForm, perceived_difficulty: parseInt(e.target.value) || 7 })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={setForm.pain}
                  onCheckedChange={(checked) => setSetForm({ ...setForm, pain: checked as boolean })}
                />
                <Label>Douleur ressentie</Label>
              </div>

              {setForm.pain && (
                <div className="space-y-2">
                  <Label>Notes sur la douleur</Label>
                  <Textarea
                    value={setForm.pain_notes}
                    onChange={(e) => setSetForm({ ...setForm, pain_notes: e.target.value })}
                    placeholder="Où ? Quel type de douleur ?"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={setForm.is_warmup}
                  onCheckedChange={(checked) => setSetForm({ ...setForm, is_warmup: checked as boolean })}
                />
                <Label>Série d'échauffement</Label>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={() => addSetMutation.mutate()} 
                  disabled={addSetMutation.isPending}
                  className="flex-1"
                >
                  Enregistrer le set
                </Button>
                <Button 
                  onClick={() => setShowAddSet(false)} 
                  variant="outline"
                >
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />
    </div>
  );
}
