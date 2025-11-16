/**
 * Utilitaire d'import/export CSV pour les plans d'entraînement
 */

export interface PlanCSVRow {
  plan_name: string;
  exercise_name: string;
  order_index: number;
  superset_group?: string;
  target_sets?: number;
  target_reps_min?: number;
  target_reps_max?: number;
  target_weight_kg?: number;
  target_rest_seconds?: number;
  superset_rest_seconds?: number;
  target_difficulty_note?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse un fichier CSV de plan d'entraînement
 * Format : plan_name,exercise_name,order_index,superset_group,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rest_seconds,superset_rest_seconds,target_difficulty_note
 */
export function parsePlanCSV(csvContent: string): { rows: PlanCSVRow[], errors: string[] } {
  const lines = csvContent.trim().split('\n');
  const errors: string[] = [];
  const rows: PlanCSVRow[] = [];

  if (lines.length < 2) {
    errors.push("Le fichier CSV doit contenir au moins une ligne d'entête et une ligne de données");
    return { rows: [], errors };
  }

  // Vérifier l'entête
  const header = lines[0].toLowerCase().replace(/\r/g, '');
  if (!header.includes('plan_name') || !header.includes('exercise_name')) {
    errors.push("L'entête doit contenir au minimum 'plan_name' et 'exercise_name'");
    return { rows: [], errors };
  }

  // Parser les lignes de données
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim().replace(/\r/g, ''));
    
    if (values.length < 2 || !values[0] || !values[1]) {
      errors.push(`Ligne ${i + 1} : nom du plan ou exercice manquant`);
      continue;
    }

    const row: PlanCSVRow = {
      plan_name: values[0],
      exercise_name: values[1],
      order_index: parseInt(values[2]) || 0,
      superset_group: values[3] || undefined,
      target_sets: values[4] ? parseInt(values[4]) : 3,
      target_reps_min: values[5] ? parseInt(values[5]) : 6,
      target_reps_max: values[6] ? parseInt(values[6]) : 12,
      target_weight_kg: values[7] ? parseFloat(values[7]) : undefined,
      target_rest_seconds: values[8] ? parseInt(values[8]) : 90,
      superset_rest_seconds: values[9] ? parseInt(values[9]) : undefined,
      target_difficulty_note: values[10] || undefined
    };

    rows.push(row);
  }

  return { rows, errors };
}

/**
 * Génère un template CSV pour l'import de plans
 */
export function generatePlanCSVTemplate(): string {
  return `plan_name,exercise_name,order_index,superset_group,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rest_seconds,superset_rest_seconds,target_difficulty_note
Push A,Développé couché,1,A,3,6,12,60,120,180,Explosion concentrique
Push A,Développé incliné,2,A,3,8,12,40,120,180,
Push A,Développé épaules,3,B,3,8,12,30,90,150,
Push A,Élévations latérales,4,B,3,10,15,8,60,150,
Pull A,Tractions,1,,4,6,10,0,120,,RIR 2-3
Pull A,Rowing barre,2,,3,8,12,50,120,,Garder le dos droit`;
}

/**
 * Exporte les exercices d'un plan en CSV
 */
export function exportPlanToCSV(planName: string, exercises: any[]): string {
  const header = 'plan_name,exercise_name,order_index,superset_group,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rest_seconds,superset_rest_seconds,target_difficulty_note\n';
  
  const rows = exercises.map(ex => {
    return [
      planName,
      ex.exercise?.name || 'Unknown',
      ex.order_index,
      ex.superset_group || '',
      ex.target_sets || 3,
      ex.target_reps_min || 6,
      ex.target_reps_max || 12,
      ex.target_weight_kg || '',
      ex.target_rest_seconds || 90,
      ex.superset_rest_seconds || '',
      ex.target_difficulty_note || ''
    ].join(',');
  }).join('\n');

  return header + rows;
}

/**
 * Télécharge un fichier CSV
 */
export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
