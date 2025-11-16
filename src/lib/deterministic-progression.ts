/**
 * Logique déterministe de progression - Double progression en rep range
 * Utilisé comme fallback si l'IA n'est pas disponible ou en erreur
 */

import { Database } from "@/integrations/supabase/types";

type SessionSet = Database["public"]["Tables"]["session_sets"]["Row"];
type TemplateExercise = Database["public"]["Tables"]["workout_template_exercises"]["Row"];

/**
 * Échelle de difficulté perçue :
 * 6/10 : assez facile, 3-4 reps en réserve
 * 7/10 : difficile mais contrôlé, ~2 reps en réserve
 * 8/10 : très difficile, 1 rep en réserve
 * 9/10 : quasi échec, 0 rep en réserve
 * 10/10 : échec complet
 */

interface ProgressionResult {
  next_target_sets: number;
  next_target_reps_min: number;
  next_target_reps_max: number;
  next_target_weight_kg: number;
  next_target_difficulty_note: string;
  reason: string;
}

/**
 * Calcule la progression déterministe pour un exercice
 * @param sets - Tous les sets de travail (is_warmup = 0) de la dernière séance pour cet exercice
 * @param templateExercise - Configuration actuelle de l'exercice dans le plan
 * @returns Recommandations de progression
 */
export function calculateDeterministicProgression(
  sets: SessionSet[],
  templateExercise: TemplateExercise
): ProgressionResult {
  // Filtrer uniquement les séries de travail (pas d'échauffement)
  const workSets = sets.filter(set => set.is_warmup === 0);

  if (workSets.length === 0) {
    // Pas de séries de travail, conserver les cibles actuelles
    return {
      next_target_sets: templateExercise.target_sets || 3,
      next_target_reps_min: templateExercise.target_reps_min || 6,
      next_target_reps_max: templateExercise.target_reps_max || 12,
      next_target_weight_kg: Number(templateExercise.target_weight_kg) || 0,
      next_target_difficulty_note: "Cibles maintenues",
      reason: "Aucune série de travail détectée"
    };
  }

  // Trouver le meilleur set (maximise reps × poids)
  const bestSet = workSets.reduce((best, current) => {
    const bestScore = best.reps * Number(best.weight_kg);
    const currentScore = current.reps * Number(current.weight_kg);
    return currentScore > bestScore ? current : best;
  });

  const reps_best = bestSet.reps;
  const weight_best = Number(bestSet.weight_kg);
  
  const target_reps_min = templateExercise.target_reps_min || 6;
  const target_reps_max = templateExercise.target_reps_max || 12;
  const current_sets = templateExercise.target_sets || 3;

  // Calculer la difficulté moyenne et vérifier les douleurs
  const avgDifficulty = workSets.reduce((sum, set) => sum + (set.perceived_difficulty || 7), 0) / workSets.length;
  const hasPain = workSets.some(set => set.pain === 1);
  const highDifficulty = workSets.filter(set => (set.perceived_difficulty || 0) >= 9).length >= 2;

  // Initialiser les nouvelles cibles
  let new_weight = weight_best;
  let new_sets = current_sets;
  let reason = "";
  let difficulty_note = "Vise 7-8/10, difficile mais contrôlé";

  // Règle 1 : Si douleur ou difficulté excessive → réduire
  if (hasPain || highDifficulty) {
    new_weight = weight_best * 0.95; // -5%
    if (highDifficulty) {
      new_sets = Math.max(2, current_sets - 1);
    }
    reason = hasPain 
      ? "Réduction de charge et/ou volume en raison de douleur signalée"
      : "Réduction de charge et volume en raison de difficulté excessive (plusieurs sets ≥9/10)";
    difficulty_note = "Vise 6-7/10, focus sur la technique";
  }
  // Règle 2 : Reps atteint ou dépassé le maximum → augmenter la charge
  else if (reps_best >= target_reps_max) {
    new_weight = weight_best * 1.025; // +2.5%
    // Limiter à +5% max
    const maxIncrease = weight_best * 1.05;
    new_weight = Math.min(new_weight, maxIncrease);
    reason = `Reps maximum atteint (${reps_best}/${target_reps_max}), augmentation de charge de +2.5%`;
    difficulty_note = "Vise 7-8/10 avec la nouvelle charge, 1-2 reps en réserve";
  }
  // Règle 3 : Reps dans le rep range → maintenir
  else if (reps_best >= target_reps_min && reps_best < target_reps_max) {
    new_weight = weight_best;
    reason = `Reps dans le rep range cible (${reps_best} entre ${target_reps_min} et ${target_reps_max}), charge maintenue`;
    difficulty_note = "Vise 7-8/10, pousse vers le haut du rep range";
  }
  // Règle 4 : Reps en dessous du minimum → réduire la charge
  else {
    new_weight = weight_best * 0.95; // -5%
    reason = `Reps insuffisantes (${reps_best} < ${target_reps_min}), réduction de charge de -5%`;
    difficulty_note = "Vise 7/10, focus sur l'atteinte du rep range";
  }

  // Arrondir la charge à 0.5 kg près
  new_weight = Math.round(new_weight * 2) / 2;

  return {
    next_target_sets: new_sets,
    next_target_reps_min: target_reps_min,
    next_target_reps_max: target_reps_max,
    next_target_weight_kg: new_weight,
    next_target_difficulty_note: difficulty_note,
    reason
  };
}

/**
 * Calcule les statistiques globales d'une session
 */
export function calculateSessionStats(sets: SessionSet[]) {
  const workSets = sets.filter(set => set.is_warmup === 0);
  
  if (workSets.length === 0) {
    return {
      total_tonnage: 0,
      avg_difficulty: 0,
      sets_with_pain: 0
    };
  }

  const total_tonnage = workSets.reduce((sum, set) => {
    return sum + (set.reps * Number(set.weight_kg));
  }, 0);

  const avg_difficulty = workSets.reduce((sum, set) => {
    return sum + (set.perceived_difficulty || 7);
  }, 0) / workSets.length;

  const sets_with_pain = workSets.filter(set => set.pain === 1).length;

  return {
    total_tonnage: Math.round(total_tonnage * 10) / 10,
    avg_difficulty: Math.round(avg_difficulty * 10) / 10,
    sets_with_pain
  };
}
