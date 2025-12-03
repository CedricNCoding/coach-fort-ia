import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Copy, AlertCircle, Flame } from "lucide-react";
import { calculateDeloadTargets } from "@/lib/deload-utils";
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
  isDeload?: boolean;
  deloadFactor?: number;
  onSkip?: () => void;
}

/**
 * Composant pour afficher un exercice dans une séance
 * Permet de saisir les sets avec reps, poids, difficulté, douleur
 */
export default function SessionExercise({ 
  templateExercise, 
  sessionId, 
  sessionSets,
  isDeload = false,
  deloadFactor = 0.75,
  onSkip
}: SessionExerciseProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [lastSetTimestamp, setLastSetTimestamp] = useState<number | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [editingSetId, setEditingSetId] = useState<number | null>(null);

  // Calculer les cibles effectives (normales ou décharge)
  const effectiveTargets = isDeload 
    ? calculateDeloadTargets(templateExercise, deloadFactor)
    : {
        sets: templateExercise.target_sets,
        weight_kg: templateExercise.target_weight_kg,
        reps_min: templateExercise.target_reps_min,
        reps_max: templateExercise.target_reps_max,
        time_seconds: templateExercise.target_time_seconds,
        rest_seconds: templateExercise.target_rest_seconds
      };

  // Formulaire de set - préremplir avec le dernier set réalisé ou cibles effectives
  const lastCompletedSet = sessionSets.length > 0 ? sessionSets[sessionSets.length - 1] : null;
  const [setForm, setSetForm] = useState({
    reps: lastCompletedSet?.reps || effectiveTargets.reps_max || 12,
    time_seconds: lastCompletedSet?.time_seconds || effectiveTargets.time_seconds || 0,
    weight_kg: lastCompletedSet 
      ? Number(lastCompletedSet.weight_kg) 
      : Number(effectiveTargets.weight_kg || templateExercise.next_target_weight_kg || templateExercise.target_weight_kg || 0),
    perceived_difficulty: lastCompletedSet?.perceived_difficulty || 7,
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
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
  const loadAiAdviceMutation = useMutation({
    mutationFn: async () => {
      setIsLoadingAdvice(true);
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
      setIsLoadingAdvice(false);
    },
    onError: () => {
      setAiAdvice("Contrôle la descente, pause courte, remonte avec puissance. Vise 7-8/10, difficile mais maîtrisé.");
      setIsLoadingAdvice(false);
    }
  });

  // Mutation pour ajouter ou mettre à jour un set
  const addSetMutation = useMutation({
    mutationFn: async () => {
      if (editingSetId) {
        // Mise à jour d'un set existant
        const { error } = await supabase
          .from("session_sets")
          .update({
            reps: templateExercise.exercises.measurement_type === 'time' ? 1 : setForm.reps,
            time_seconds: templateExercise.exercises.measurement_type === 'time' ? setForm.time_seconds : null,
            weight_kg: setForm.weight_kg,
            perceived_difficulty: setForm.perceived_difficulty,
            pain: setForm.pain ? 1 : 0,
            pain_notes: setForm.pain ? setForm.pain_notes : null,
            is_warmup: setForm.is_warmup ? 1 : 0
          })
          .eq("id", editingSetId);
        
        if (error) throw error;
      } else {
        // Calculer le temps de repos réel depuis le dernier set
        let actualRestSeconds: number | null = null;
        if (lastSetTimestamp && sessionSets.length > 0) {
          actualRestSeconds = Math.round((Date.now() - lastSetTimestamp) / 1000);
        }
        
        // Ajout d'un nouveau set
        const setIndex = sessionSets.length;
        
        const { error } = await supabase
          .from("session_sets")
          .insert([{
            session_id: sessionId,
            exercise_id: templateExercise.exercise_id,
            template_exercise_id: templateExercise.id,
            set_index: setIndex,
            reps: templateExercise.exercises.measurement_type === 'time' ? 1 : setForm.reps,
            time_seconds: templateExercise.exercises.measurement_type === 'time' ? setForm.time_seconds : null,
            weight_kg: setForm.weight_kg,
            perceived_difficulty: setForm.perceived_difficulty,
            pain: setForm.pain ? 1 : 0,
            pain_notes: setForm.pain ? setForm.pain_notes : null,
            is_warmup: setForm.is_warmup ? 1 : 0,
            actual_rest_seconds: actualRestSeconds
          }]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session_sets"] });
      toast({ title: editingSetId ? "Set modifié" : "Set enregistré" });
      
      if (!editingSetId) {
        // Enregistrer le timestamp pour calculer le temps de repos du prochain set
        setLastSetTimestamp(Date.now());
        
        // Préremplir avec les valeurs du set qui vient d'être enregistré
        setSetForm(prev => ({
          ...prev,
          reps: setForm.reps,
          time_seconds: setForm.time_seconds,
          weight_kg: setForm.weight_kg,
          perceived_difficulty: setForm.perceived_difficulty,
          pain: false,
          pain_notes: "",
          is_warmup: false
        }));
        
        // Démarrer le minuteur de repos si ce n'est pas un échauffement
        if (!setForm.is_warmup) {
          setShowRestTimer(true);
        }
      } else {
        setEditingSetId(null);
      }
    }
  });

  // Dupliquer le dernier set
  const duplicateLastSet = () => {
    if (sessionSets.length === 0) return;
    const lastSet = sessionSets[sessionSets.length - 1];
    setSetForm({
      reps: lastSet.reps,
      time_seconds: lastSet.time_seconds || 0,
      weight_kg: Number(lastSet.weight_kg),
      perceived_difficulty: lastSet.perceived_difficulty || 7,
      pain: lastSet.pain === 1,
      pain_notes: lastSet.pain_notes || "",
      is_warmup: lastSet.is_warmup === 1
    });
  };

  const targetWeight = Number(templateExercise.next_target_weight_kg || templateExercise.target_weight_kg || 0);
  const targetRestSeconds = templateExercise.target_rest_seconds || templateExercise.exercises.default_rest_seconds || 90;

  // Générer les options pour les dropdowns
  const repsOptions = Array.from({ length: 31 }, (_, i) => i);
  const weightOptions = Array.from({ length: 301 }, (_, i) => i * 0.5);

  return (
    <div className="space-y-3">
      {/* En-tête de l'exercice */}
      <div>
        <h3 className="text-xl font-bold">{templateExercise.exercises.name}</h3>
        <p className="text-sm text-muted-foreground">
          {templateExercise.exercises.muscle_group} • {templateExercise.exercises.equipment}
        </p>
        {templateExercise.exercises.video_url && (
          <div className="mt-3">
            <a 
              href={templateExercise.exercises.video_url} 
              onClick={(e) => {
                e.preventDefault();
                window.open(templateExercise.exercises.video_url, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer text-sm font-medium border border-primary/20"
            >
              🎥 Voir la démonstration vidéo
            </a>
          </div>
        )}
      </div>

      {/* Conseil IA */}
      {aiAdvice && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium">💡 {aiAdvice}</p>
          </CardContent>
        </Card>
      )}

      {/* Cibles et dernière séance - plus compact */}
      <div className="grid grid-cols-5 gap-1.5 text-xs">
        <div className="p-1.5 bg-muted rounded text-center">
          <p className="text-muted-foreground text-[10px]">Sets</p>
          <p className="font-bold">{templateExercise.target_sets}</p>
        </div>
        {templateExercise.exercises.measurement_type === 'time' ? (
          <div className="p-1.5 bg-muted rounded text-center">
            <p className="text-muted-foreground text-[10px]">Temps</p>
            <p className="font-bold">{templateExercise.target_time_seconds}s</p>
          </div>
        ) : (
          <div className="p-1.5 bg-muted rounded text-center">
            <p className="text-muted-foreground text-[10px]">Reps</p>
            <p className="font-bold">{templateExercise.target_reps_min}-{templateExercise.target_reps_max}</p>
          </div>
        )}
        <div className="p-1.5 bg-muted rounded text-center">
          <p className="text-muted-foreground text-[10px]">Charge</p>
          <p className="font-bold">{targetWeight > 0 ? `${targetWeight.toFixed(1)}kg` : "-"}</p>
        </div>
        <div className="p-1.5 bg-muted rounded text-center">
          <p className="text-muted-foreground text-[10px]">Repos</p>
          <p className="font-bold">{targetRestSeconds}s</p>
        </div>
        {templateExercise.target_rpe && (
          <div className="p-1.5 bg-primary/10 rounded text-center border border-primary/20">
            <p className="text-muted-foreground text-[10px]">RPE</p>
            <p className="font-bold text-primary">{templateExercise.target_rpe}</p>
          </div>
        )}
      </div>

      {lastSession && (
        <div className="p-2 bg-muted/50 rounded text-xs space-y-0.5">
          <p className="font-medium text-[10px] text-muted-foreground">Dernière séance</p>
          <p>Meilleur : {lastSession.bestSet.reps} × {Number(lastSession.bestSet.weight_kg).toFixed(1)} kg • RPE {lastSession.avgDifficulty.toFixed(1)}</p>
        </div>
      )}


      {/* Sets réalisés */}
      {sessionSets.length > 0 && (
        <div className="space-y-1">
          <h4 className="font-semibold text-xs text-muted-foreground">Sets réalisés</h4>
          {sessionSets.map((set, idx) => (
            <div key={set.id} className="flex items-center gap-2 text-xs p-1.5 bg-muted rounded">
              <span className="font-bold w-6">#{idx + 1}</span>
              {templateExercise.exercises.measurement_type === 'time' ? (
                <span>{set.time_seconds}s × {Number(set.weight_kg).toFixed(1)}kg</span>
              ) : (
                <span>{set.reps} × {Number(set.weight_kg).toFixed(1)}kg</span>
              )}
              <span className="text-muted-foreground">• RPE {set.perceived_difficulty || 7}</span>
              {set.pain === 1 && <AlertCircle className="h-3 w-3 text-destructive" />}
              {set.is_warmup === 1 && <Flame className="h-3 w-3 text-orange-500" />}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => {
                  setEditingSetId(set.id);
                  setSetForm({
                    reps: set.reps,
                    time_seconds: set.time_seconds || 0,
                    weight_kg: Number(set.weight_kg),
                    perceived_difficulty: set.perceived_difficulty || 7,
                    pain: set.pain === 1,
                    pain_notes: set.pain_notes || "",
                    is_warmup: set.is_warmup === 1
                  });
                }}
                className="ml-auto h-6 text-xs px-2"
              >
                Modifier
              </Button>
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

      {/* Bouton Sauter l'exercice */}
      {sessionSets.length === 0 && onSkip && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          className="w-full text-xs"
        >
          Sauter cet exercice
        </Button>
      )}

      {/* Formulaire d'enregistrement de set - toujours visible */}
      <Card className="w-full border-primary/20">
        <CardContent className="pt-3 pb-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold">{editingSetId ? "Modifier le set" : `Set #${sessionSets.length + 1}`}</h4>
            <div className="flex gap-1">
              {sessionSets.length > 0 && !editingSetId && (
                <Button onClick={duplicateLastSet} variant="ghost" size="sm" className="h-6 px-2">
                  <Copy className="h-3 w-3" />
                </Button>
              )}
              <Button 
                onClick={() => loadAiAdviceMutation.mutate()} 
                variant="ghost"
                size="sm"
                disabled={loadAiAdviceMutation.isPending}
                className="h-6 px-2 text-xs"
              >
                {loadAiAdviceMutation.isPending ? "..." : "💡"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {templateExercise.exercises.measurement_type === 'time' ? (
              <div className="space-y-1">
                <Label className="text-xs">Temps (s)</Label>
                <Select
                  value={setForm.time_seconds.toString()}
                  onValueChange={(value) => setSetForm({ ...setForm, time_seconds: parseInt(value) })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 61 }, (_, i) => i * 5).map((seconds) => (
                      <SelectItem key={seconds} value={seconds.toString()}>
                        {seconds}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Reps</Label>
                <Select
                  value={setForm.reps.toString()}
                  onValueChange={(value) => setSetForm({ ...setForm, reps: parseInt(value) })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {repsOptions.map((rep) => (
                      <SelectItem key={rep} value={rep.toString()}>
                        {rep}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Poids (kg)</Label>
              <Select
                value={setForm.weight_kg.toString()}
                onValueChange={(value) => setSetForm({ ...setForm, weight_kg: parseFloat(value) })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weightOptions.map((weight) => (
                    <SelectItem key={weight} value={weight.toString()}>
                      {weight.toFixed(1)} kg
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">RPE (Effort perçu 1-10)</Label>
            <Select
              value={setForm.perceived_difficulty?.toString() || "7"}
              onValueChange={(value) => setSetForm({ ...setForm, perceived_difficulty: parseInt(value) })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="RPE" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((rpe) => (
                  <SelectItem key={rpe} value={rpe.toString()}>
                    RPE {rpe} {rpe <= 3 ? '😊' : rpe <= 6 ? '😐' : rpe <= 8 ? '😓' : '🔥'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={setForm.is_warmup ? "default" : "outline"}
              onClick={() => setSetForm({ ...setForm, is_warmup: !setForm.is_warmup })}
              className="flex-1 h-9 text-xs"
            >
              <Flame className="h-3 w-3 mr-1" />
              Échauffement
            </Button>
            <Button
              type="button"
              variant={setForm.pain ? "destructive" : "outline"}
              onClick={() => setSetForm({ ...setForm, pain: !setForm.pain })}
              className="flex-1 h-9 text-xs"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Douleur
            </Button>
          </div>

          {setForm.pain && (
            <div className="space-y-1">
              <Label className="text-xs">Notes sur la douleur</Label>
              <Textarea
                value={setForm.pain_notes}
                onChange={(e) => setSetForm({ ...setForm, pain_notes: e.target.value })}
                placeholder="Où ? Quel type de douleur ?"
                className="text-xs min-h-[60px]"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button 
              onClick={() => addSetMutation.mutate()} 
              disabled={addSetMutation.isPending}
              className="flex-1 h-9"
            >
              {editingSetId ? "Enregistrer" : "Valider"}
            </Button>
            {editingSetId && (
              <Button 
                onClick={() => setEditingSetId(null)} 
                variant="outline"
                className="h-9"
              >
                Annuler
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />
    </div>
  );
}
