/**
 * Utilitaires pour gérer les semaines de décharge (deload weeks)
 * 
 * Une semaine de décharge réduit le volume et l'intensité pour favoriser la récupération
 * sans casser la progression normale du programme
 */

import { Database } from "@/integrations/supabase/types";

type TemplateExercise = Database["public"]["Tables"]["workout_template_exercises"]["Row"];

/**
 * Calculer les cibles effectives pour un exercice pendant une semaine de décharge
 * 
 * @param templateExercise - L'exercice du template (cibles normales)
 * @param deloadFactor - Facteur de réduction (0.7-0.8 typiquement)
 * @returns Les cibles ajustées pour la décharge
 */
export function calculateDeloadTargets(
  templateExercise: TemplateExercise,
  deloadFactor: number = 0.75
) {
  // Réduire le nombre de sets (minimum 1)
  const deloadSets = Math.max(1, Math.floor((templateExercise.target_sets || 3) * deloadFactor));
  
  // Réduire la charge cible (arrondir à 0.5 kg près)
  const deloadWeight = templateExercise.target_weight_kg 
    ? Math.round((Number(templateExercise.target_weight_kg) * deloadFactor) * 2) / 2
    : null;

  // Réduire légèrement le rep range max
  const deloadRepsMax = templateExercise.target_reps_max
    ? Math.max(templateExercise.target_reps_min || 6, Math.floor(templateExercise.target_reps_max * deloadFactor))
    : null;

  return {
    sets: deloadSets,
    weight_kg: deloadWeight,
    reps_min: templateExercise.target_reps_min,
    reps_max: deloadRepsMax,
    // Le temps et le repos ne sont pas réduits
    time_seconds: templateExercise.target_time_seconds,
    rest_seconds: templateExercise.target_rest_seconds,
    // Cibles normales pour référence
    normalSets: templateExercise.target_sets,
    normalWeight: templateExercise.target_weight_kg,
    normalRepsMax: templateExercise.target_reps_max
  };
}

/**
 * Vérifier si une progression proposée est acceptable en semaine de décharge
 * 
 * En décharge, on ne doit JAMAIS augmenter la charge ou le volume
 * On peut maintenir ou diminuer si nécessaire
 * 
 * @param currentTargets - Cibles actuelles
 * @param proposedTargets - Cibles proposées
 * @returns true si la progression est acceptable en décharge
 */
export function isValidDeloadProgression(
  currentTargets: { sets?: number; weight_kg?: number | null; reps_max?: number | null },
  proposedTargets: { sets?: number; weight_kg?: number | null; reps_max?: number | null }
): boolean {
  // Vérifier que les sets n'augmentent pas
  if (proposedTargets.sets && currentTargets.sets && proposedTargets.sets > currentTargets.sets) {
    return false;
  }

  // Vérifier que le poids n'augmente pas
  if (proposedTargets.weight_kg && currentTargets.weight_kg) {
    if (Number(proposedTargets.weight_kg) > Number(currentTargets.weight_kg)) {
      return false;
    }
  }

  // Vérifier que les reps max n'augmentent pas
  if (proposedTargets.reps_max && currentTargets.reps_max) {
    if (proposedTargets.reps_max > currentTargets.reps_max) {
      return false;
    }
  }

  return true;
}

/**
 * Adapter une proposition de progression pour la décharge
 * Force le maintien ou la réduction des cibles
 * 
 * @param currentTargets - Cibles actuelles
 * @param proposedTargets - Cibles proposées (potentiellement augmentées)
 * @returns Cibles adaptées pour la décharge
 */
export function adaptProgressionForDeload(
  currentTargets: { sets?: number; weight_kg?: number | null; reps_max?: number | null },
  proposedTargets: { sets?: number; weight_kg?: number | null; reps_max?: number | null }
) {
  return {
    sets: Math.min(proposedTargets.sets || 3, currentTargets.sets || 3),
    weight_kg: proposedTargets.weight_kg && currentTargets.weight_kg
      ? Math.min(Number(proposedTargets.weight_kg), Number(currentTargets.weight_kg))
      : proposedTargets.weight_kg || currentTargets.weight_kg,
    reps_max: proposedTargets.reps_max && currentTargets.reps_max
      ? Math.min(proposedTargets.reps_max, currentTargets.reps_max)
      : proposedTargets.reps_max || currentTargets.reps_max
  };
}
