/**
 * Utilitaire d'import CSV pour les exercices
 */

export interface ExerciseCSVRow {
  name: string;
  muscle_group?: string;
  equipment?: string;
  default_rest_seconds?: number;
  notes?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse un fichier CSV d'exercices
 * Format attendu : name,muscle_group,equipment,default_rest_seconds,notes
 */
export function parseExercisesCSV(csvContent: string): { rows: ExerciseCSVRow[], errors: string[] } {
  const lines = csvContent.trim().split('\n');
  const errors: string[] = [];
  const rows: ExerciseCSVRow[] = [];

  if (lines.length < 2) {
    errors.push("Le fichier CSV doit contenir au moins une ligne d'entête et une ligne de données");
    return { rows: [], errors };
  }

  // Vérifier l'entête
  const header = lines[0].toLowerCase().replace(/\r/g, '');
  if (!header.includes('name')) {
    errors.push("L'entête doit contenir au minimum la colonne 'name'");
    return { rows: [], errors };
  }

  // Parser les lignes de données
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Ignorer les lignes vides

    const values = line.split(',').map(v => v.trim().replace(/\r/g, ''));
    
    if (values.length === 0 || !values[0]) {
      errors.push(`Ligne ${i + 1} : nom manquant`);
      continue;
    }

    const row: ExerciseCSVRow = {
      name: values[0],
      muscle_group: values[1] || undefined,
      equipment: values[2] || undefined,
      default_rest_seconds: undefined,
      notes: values[4] || undefined
    };

    // Parser default_rest_seconds si présent
    if (values[3]) {
      const restSeconds = parseInt(values[3]);
      if (!isNaN(restSeconds) && restSeconds > 0) {
        row.default_rest_seconds = restSeconds;
      } else {
        row.default_rest_seconds = 90; // Valeur par défaut
      }
    }

    rows.push(row);
  }

  return { rows, errors };
}

/**
 * Génère un template CSV pour l'import d'exercices
 */
export function generateCSVTemplate(): string {
  return `name,muscle_group,equipment,default_rest_seconds,notes
Squat,Jambes,Barre,180,Roi des exercices de jambes
Développé couché,Pectoraux,Barre,120,Exercice de base pour les pectoraux
Soulevé de terre,Dos,Barre,180,Exercice complet du dos et jambes
Tractions,Dos,Poids du corps,120,Largeur du dos
Curl barre,Biceps,Barre,60,Isolation biceps`;
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
