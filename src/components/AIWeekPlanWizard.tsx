import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTrainingStats } from "@/hooks/useTrainingStats";
import { Loader2, Sparkles, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface AIWeekPlanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" },
];

export default function AIWeekPlanWizard({ open, onOpenChange }: AIWeekPlanWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: stats } = useTrainingStats();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);

  // Étape 1 : Profil
  const [age, setAge] = useState<number>(40);
  const [level, setLevel] = useState<string>("intermédiaire");
  const [goal, setGoal] = useState<string>("hypertrophie");

  // Étape 2 : Disponibilités
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3);
  const [availableDays, setAvailableDays] = useState<number[]>([1, 3, 5]); // Lun, Mer, Ven par défaut

  // Étape 3 : Matériel & contraintes
  const [equipment, setEquipment] = useState<string>("Haltères, barres, machines, poulies");
  const [constraints, setConstraints] = useState<string>("");
  const [sessionDuration, setSessionDuration] = useState<number>(75);

  const toggleDay = (day: number) => {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter(d => d !== day));
    } else {
      setAvailableDays([...availableDays, day].sort());
    }
  };

  const handleNext = () => {
    if (step === 1 && !age) {
      toast({ title: "Veuillez renseigner votre âge", variant: "destructive" });
      return;
    }
    if (step === 2 && availableDays.length === 0) {
      toast({ title: "Veuillez sélectionner au moins un jour disponible", variant: "destructive" });
      return;
    }
    if (step === 2 && sessionsPerWeek > availableDays.length) {
      toast({ 
        title: "Nombre de séances trop élevé", 
        description: "Vous devez sélectionner au moins autant de jours que de séances souhaitées",
        variant: "destructive" 
      });
      return;
    }
    setStep(step + 1);
  };

  const handlePrevious = () => {
    if (generatedPlan) {
      setGeneratedPlan(null);
    } else {
      setStep(step - 1);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Sauvegarder le profil
      await supabase
        .from("user_profiles")
        .upsert({
          user_id: user.id,
          age,
          level,
          goal,
          sessions_per_week: sessionsPerWeek,
          available_days: availableDays,
          equipment,
          constraints,
          session_duration_minutes: sessionDuration,
          updated_at: new Date().toISOString()
        });

      // Récupérer tous les exercices disponibles
      const { data: exercises } = await supabase
        .from("exercises")
        .select("id, name, muscle_group, measurement_type")
        .or(`user_id.eq.${user.id},is_builtin.eq.1`);

      // Préparer les données pour l'IA
      const profile = {
        age,
        level,
        goal,
        sessions_per_week: sessionsPerWeek,
        available_days: DAYS_OF_WEEK.filter(d => availableDays.includes(d.value)).map(d => d.label),
        equipment,
        constraints,
        session_duration_minutes: sessionDuration
      };

      // Appeler l'edge function
      const { data, error } = await supabase.functions.invoke('ai-generate-week-plan', {
        body: { profile, stats, exercises }
      });

      if (error) throw error;

      setGeneratedPlan(data.plan);
      toast({ title: "Plan généré avec succès !" });

    } catch (error: any) {
      console.error('Erreur génération plan:', error);
      toast({
        title: "Erreur lors de la génération",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Pour chaque session du plan généré
      for (const session of generatedPlan.sessions) {
        // Créer le plan (template)
        const { data: template, error: templateError } = await supabase
          .from("workout_templates")
          .insert({
            user_id: user.id,
            name: session.name,
            goal: session.goal,
            notes: session.notes,
            recurring_days: [session.day_of_week]
          })
          .select()
          .single();

        if (templateError) throw templateError;

        // Pour chaque exercice de la session
        for (let i = 0; i < session.exercises.length; i++) {
          const ex = session.exercises[i];

          // Vérifier si l'exercice existe déjà (recherche exacte insensible à la casse)
          const { data: existingExercises, error: searchError } = await supabase
            .from("exercises")
            .select("id")
            .ilike("name", ex.name)
            .or(`user_id.eq.${user.id},is_builtin.eq.1`);

          if (searchError) {
            console.error('Erreur recherche exercice:', searchError);
            throw searchError;
          }

          let exerciseId = existingExercises && existingExercises.length > 0 
            ? existingExercises[0].id 
            : null;

          // Si l'exercice n'existe pas, le créer
          if (!exerciseId) {
            try {
              const { data: newExercise, error: exerciseError } = await supabase
                .from("exercises")
                .insert({
                  user_id: user.id,
                  name: ex.name,
                  muscle_group: ex.muscle_group,
                  measurement_type: ex.measurement_type || 'reps',
                  default_rest_seconds: ex.rest_seconds || 90,
                  is_builtin: 0
                })
                .select()
                .single();

              if (exerciseError) {
                // Si l'exercice existe déjà (erreur de contrainte), le rechercher à nouveau
                if (exerciseError.code === '23505') { // Contrainte unique violée
                  console.log('Exercice déjà créé, recherche...');
                  const { data: retryExercise } = await supabase
                    .from("exercises")
                    .select("id")
                    .eq("user_id", user.id)
                    .ilike("name", ex.name)
                    .single();
                  
                  if (retryExercise) {
                    exerciseId = retryExercise.id;
                  } else {
                    throw exerciseError;
                  }
                } else {
                  throw exerciseError;
                }
              } else {
                exerciseId = newExercise!.id;
              }
            } catch (err) {
              console.error('Erreur création exercice:', err);
              throw err;
            }
          }

          // Créer l'exercice du template
          await supabase
            .from("workout_template_exercises")
            .insert({
              workout_template_id: template.id,
              exercise_id: exerciseId,
              order_index: i,
              superset_group: ex.superset_group,
              target_sets: ex.sets,
              target_reps_min: ex.reps_min,
              target_reps_max: ex.reps_max,
              target_rest_seconds: ex.rest_seconds,
              target_weight_kg: ex.weight_kg,
              is_active: 1
            });
        }
      }

      // Rafraîchir les données
      queryClient.invalidateQueries({ queryKey: ["workout-templates"] });

      toast({
        title: "Semaine d'entraînement créée !",
        description: `${generatedPlan.sessions.length} plans ont été ajoutés et planifiés dans votre calendrier.`
      });

      onOpenChange(false);
      setStep(1);
      setGeneratedPlan(null);

    } catch (error: any) {
      console.error('Erreur création plans:', error);
      toast({
        title: "Erreur lors de la création",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {generatedPlan ? "Votre semaine d'entraînement" : "Générer ma semaine avec l'IA"}
          </DialogTitle>
        </DialogHeader>

        {!generatedPlan ? (
          <div className="space-y-6">
            {/* Étape 1 : Profil */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Votre profil</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="age">Âge *</Label>
                  <Input
                    id="age"
                    type="number"
                    value={age}
                    onChange={(e) => setAge(parseInt(e.target.value))}
                    min={18}
                    max={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="level">Niveau *</Label>
                  <Select value={level} onValueChange={setLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="débutant">Débutant</SelectItem>
                      <SelectItem value="intermédiaire">Intermédiaire</SelectItem>
                      <SelectItem value="avancé">Avancé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="goal">Objectif principal *</Label>
                  <Select value={goal} onValueChange={setGoal}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hypertrophie">Hypertrophie</SelectItem>
                      <SelectItem value="force">Force</SelectItem>
                      <SelectItem value="remise en forme">Remise en forme</SelectItem>
                      <SelectItem value="perte de gras">Perte de gras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Étape 2 : Disponibilités */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Vos disponibilités</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="sessions">Nombre de séances par semaine *</Label>
                  <Select value={sessionsPerWeek.toString()} onValueChange={(v) => setSessionsPerWeek(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={n.toString()}>{n} séance{n > 1 ? 's' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Jours disponibles * (sélectionnez au moins {sessionsPerWeek})</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <div key={day.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`day-${day.value}`}
                          checked={availableDays.includes(day.value)}
                          onCheckedChange={() => toggleDay(day.value)}
                        />
                        <label htmlFor={`day-${day.value}`} className="text-sm cursor-pointer">
                          {day.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Étape 3 : Matériel & contraintes */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="font-semibold">Matériel & contraintes</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="equipment">Matériel disponible</Label>
                  <Textarea
                    id="equipment"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    placeholder="Ex: Haltères, barres, machines, poulies, élastiques..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="constraints">Contraintes / zones sensibles</Label>
                  <Textarea
                    id="constraints"
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="Ex: Coude droit sensible, dos, genou..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Durée cible par séance (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={sessionDuration}
                    onChange={(e) => setSessionDuration(parseInt(e.target.value))}
                    min={30}
                    max={180}
                  />
                </div>

                {stats && stats.has_data && (
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-medium mb-2">📊 Statistiques détectées</p>
                    <p className="text-xs text-muted-foreground">
                      L'IA va se baser sur vos {stats.exercises_used.length} exercices récents 
                      et vos statistiques des 8 dernières semaines pour personnaliser votre programme.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={step === 1 || loading}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Précédent
              </Button>

              {step < 3 ? (
                <Button onClick={handleNext}>
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleGenerate} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Générer ma semaine
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : (
          // Résumé du plan généré
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium">
                {generatedPlan.sessions.length} séances ont été générées pour vous
              </p>
            </div>

            {generatedPlan.sessions.map((session: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{session.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {DAYS_OF_WEEK.find(d => d.value === session.day_of_week)?.label}
                    </p>
                  </div>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    {session.exercises.length} exercices
                  </span>
                </div>
                
                <p className="text-sm">{session.goal}</p>
                
                {session.notes && (
                  <p className="text-xs text-muted-foreground italic">{session.notes}</p>
                )}

                <div className="text-xs space-y-1 pt-2 border-t">
                  {session.exercises.slice(0, 3).map((ex: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span>• {ex.name}</span>
                      <span className="text-muted-foreground">
                        {ex.sets}×{ex.reps_min}-{ex.reps_max} @ {ex.weight_kg}kg
                      </span>
                    </div>
                  ))}
                  {session.exercises.length > 3 && (
                    <p className="text-muted-foreground">
                      ... et {session.exercises.length - 3} autres exercices
                    </p>
                  )}
                </div>
              </div>
            ))}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePrevious} disabled={loading}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Modifier
              </Button>

              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Confirmer et créer
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}