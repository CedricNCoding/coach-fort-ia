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
  difficulty_note: string;
}

/**
 * Calculer la progression déterministe pour un exercice
 * 
 * Règles basées sur :
 * - Rep range cible (target_reps_min, target_reps_max)
 * - Performance du meilleur set (reps, poids)
 * - Difficulté perçue moyenne
 * - Présence de douleur
 * - Semaine de décharge (pas d'augmentation)
 * 
 * @param sets - Les sets réalisés pendant la séance
 * @param templateExercise - L'exercice template avec les cibles actuelles
 * @param isDeload - Si true, empêche toute augmentation de charge/volume
 * @returns Recommandations de progression pour la prochaine séance
 */
export function calculateDeterministicProgression(
  sets: SessionSet[],
  templateExercise: TemplateExercise,
  isDeload: boolean = false
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
      difficulty_note: "Cibles maintenues"
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

  // Calcul des statistiques et nombres basés sur la performance
  const avgDifficulty = workSets.reduce((sum, set) => sum + (set.perceived_difficulty || 7), 0) / workSets.length;
  const painCount = workSets.filter(set => set.pain === 1).length;

  // Recommandations par défaut
  let nextTargetSets = templateExercise.target_sets || 3;
  let nextTargetRepsMin = templateExercise.target_reps_min || 6;
  let nextTargetRepsMax = templateExercise.target_reps_max || 12;
  let nextTargetWeight = Number(templateExercise.target_weight_kg || 0);
  let difficultyNote = "";

  // *** SEMAINE DE DÉCHARGE : Pas d'augmentation ***
  if (isDeload) {
    difficultyNote = "Semaine de décharge - Aucune progression appliquée pour favoriser la récupération.";
    
    // En décharge, on peut seulement maintenir ou réduire si trop difficile/douleur
    if (avgDifficulty > 8.5 || painCount > 0) {
      // Réduire légèrement si encore trop difficile
      nextTargetWeight = Math.max(0, nextTargetWeight * 0.95);
      nextTargetWeight = Math.round(nextTargetWeight * 2) / 2; // Arrondir à 0.5
      difficultyNote = "Semaine de décharge - Légère réduction de charge car la séance était encore difficile.";
    }
    
    return {
      next_target_sets: nextTargetSets,
      next_target_reps_min: nextTargetRepsMin,
      next_target_reps_max: nextTargetRepsMax,
      next_target_weight_kg: nextTargetWeight,
      difficulty_note: difficultyNote
    };
  }

  // *** PROGRESSION NORMALE (pas en décharge) ***
  const hasPain = workSets.some(set => set.pain === 1);
  const highDifficulty = workSets.filter(set => (set.perceived_difficulty || 0) >= 9).length >= 2;

  // Initialiser les nouvelles cibles
  let new_weight = weight_best;
  let new_sets = current_sets;
  difficultyNote = "Vise 7-8/10, difficile mais contrôlé";

  // Règle 1 : Si douleur ou difficulté excessive → réduire
  if (hasPain || highDifficulty) {
    new_weight = weight_best * 0.95; // -5%
    if (highDifficulty) {
      new_sets = Math.max(2, current_sets - 1);
    }
    difficultyNote = "Vise 6-7/10, focus sur la technique";
  }
  // Règle 2 : Reps atteint ou dépassé le maximum → augmenter la charge
  else if (reps_best >= target_reps_max) {
    new_weight = weight_best * 1.025; // +2.5%
    // Limiter à +5% max
    const maxIncrease = weight_best * 1.05;
    new_weight = Math.min(new_weight, maxIncrease);
    difficultyNote = "Vise 7-8/10 avec la nouvelle charge, 1-2 reps en réserve";
  }
  // Règle 3 : Reps dans le rep range → maintenir
  else if (reps_best >= target_reps_min && reps_best < target_reps_max) {
    new_weight = weight_best;
    difficultyNote = "Vise 7-8/10, pousse vers le haut du rep range";
  }
  // Règle 4 : Reps en dessous du minimum → réduire la charge
  else {
    new_weight = weight_best * 0.95; // -5%
    difficultyNote = "Vise 7/10, focus sur l'atteinte du rep range";
  }

  // Arrondir la charge à 0.5 kg près
  new_weight = Math.round(new_weight * 2) / 2;

  return {
    next_target_sets: new_sets,
    next_target_reps_min: target_reps_min,
    next_target_reps_max: target_reps_max,
    next_target_weight_kg: new_weight,
    difficulty_note: difficultyNote
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
