/**
 * Utilitaire d'import de plans GymBook (format JSON)
 */

export interface GymBookExercise {
  exercise: {
    name: string;
    identifier?: string;
    targetMusclesPrimary?: string[];
    targetMusclesSecondary?: string[];
    equipment?: string[];
  };
  workoutExerciseSets: Array<{
    frequencyUnit: string; // "x" pour reps, "m" pour minutes
    frequencyValueMax: number;
    quantityUnit: string; // "kg"
    quantityValue?: number;
    type: string;
  }>;
  workoutExerciseGroup?: {
    name: string;
  };
  timerDuration?: number; // Repos après l'exercice (secondes)
  timerDurationSecondary?: number; // Durée de l'exercice pour temps
}

export interface GymBookPlan {
  name: string;
  days?: string[];
  archived?: boolean;
  workoutExercises: GymBookExercise[];
}

export interface GymBookImportResult {
  planName: string;
  exercises: Array<{
    name: string;
    order_index: number;
    superset_group?: string;
    target_sets: number;
    target_reps_min?: number;
    target_reps_max?: number;
    target_time_seconds?: number;
    target_weight_kg?: number;
    target_rest_seconds?: number;
    superset_rest_seconds?: number;
    measurement_type: 'reps' | 'time';
  }>;
}

/**
 * Parse un fichier JSON GymBook
 */
export function parseGymBookJSON(jsonContent: string): GymBookImportResult | null {
  try {
    const plan: GymBookPlan = JSON.parse(jsonContent);
    
    if (!plan.name || !plan.workoutExercises || plan.workoutExercises.length === 0) {
      throw new Error("Format invalide: nom ou exercices manquants");
    }

    const exercises = plan.workoutExercises.map((ex, index) => {
      const sets = ex.workoutExerciseSets || [];
      const numSets = sets.length;
      const firstSet = sets[0];
      
      // Déterminer si c'est du temps ou des répétitions
      const isTime = firstSet?.frequencyUnit === 'm' || ex.timerDurationSecondary;
      const measurement_type: 'reps' | 'time' = isTime ? 'time' : 'reps';
      
      // Calculer la moyenne des poids si disponibles
      const weights = sets
        .map(s => s.quantityValue)
        .filter((w): w is number => w !== undefined && w > 0);
      const avgWeight = weights.length > 0 
        ? weights.reduce((a, b) => a + b, 0) / weights.length 
        : undefined;

      // Calculer les reps min/max ou le temps
      let target_reps_min: number | undefined;
      let target_reps_max: number | undefined;
      let target_time_seconds: number | undefined;
      
      if (isTime) {
        // Pour les exercices en temps
        target_time_seconds = ex.timerDurationSecondary || (firstSet?.frequencyValueMax * 60) || 60;
      } else {
        // Pour les exercices en répétitions
        const repsValues = sets.map(s => s.frequencyValueMax).filter(r => r > 0);
        if (repsValues.length > 0) {
          target_reps_min = Math.min(...repsValues);
          target_reps_max = Math.max(...repsValues);
        }
      }

      // Groupe de superset
      const superset_group = ex.workoutExerciseGroup?.name;

      // Temps de repos
      const target_rest_seconds = ex.timerDuration || 90;

      // Si c'est dans un superset, le repos inter-superset est plus long
      const superset_rest_seconds = superset_group ? (ex.timerDuration || 90) : undefined;

      return {
        name: ex.exercise.name,
        order_index: index,
        superset_group,
        target_sets: numSets || 3,
        target_reps_min,
        target_reps_max,
        target_time_seconds,
        target_weight_kg: avgWeight,
        target_rest_seconds,
        superset_rest_seconds,
        measurement_type
      };
    });

    return {
      planName: plan.name,
      exercises
    };
  } catch (error) {
    console.error("Erreur parsing GymBook JSON:", error);
    return null;
  }
}
