/**
 * Utilitaire d'import d'exercices GymBook (format XML)
 */

export interface GymBookXMLExercise {
  name: string;
  targetRegion?: string;
  targetMusclesPrimary?: string;
  targetMusclesSecondary?: string;
  notes?: string;
  logs?: number;
  workouts?: number;
}

/**
 * Parse un fichier XML GymBook contenant une liste d'exercices
 */
export function parseGymBookXML(xmlContent: string): GymBookXMLExercise[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  
  // Vérifier les erreurs de parsing
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Erreur de parsing XML: " + parserError.textContent);
  }
  
  const exercises: GymBookXMLExercise[] = [];
  const exerciseNodes = xmlDoc.querySelectorAll("exercise");
  
  exerciseNodes.forEach((node) => {
    const name = node.querySelector("name")?.textContent?.trim();
    if (!name) return;
    
    exercises.push({
      name,
      targetRegion: node.querySelector("targetRegion")?.textContent?.trim() || undefined,
      targetMusclesPrimary: node.querySelector("targetMusclesPrimary")?.textContent?.trim() || undefined,
      targetMusclesSecondary: node.querySelector("targetMusclesSecondary")?.textContent?.trim() || undefined,
      notes: node.querySelector("notes")?.textContent?.trim() || undefined,
      logs: parseInt(node.querySelector("logs")?.textContent || "0"),
      workouts: parseInt(node.querySelector("workouts")?.textContent || "0")
    });
  });
  
  return exercises;
}

/**
 * Mapper la région GymBook vers le muscle_group de l'app
 */
export function mapGymBookRegionToMuscleGroup(region: string): string {
  const mapping: { [key: string]: string } = {
    "épaules": "Épaules",
    "pectoraux": "Pectoraux",
    "dos": "Dos",
    "jambes": "Jambes",
    "bras": "Bras",
    "abdominaux": "Abdos",
    "quadriceps": "Jambes",
    "ischio-jambiers": "Jambes",
    "mollets": "Jambes",
    "fessiers": "Jambes",
    "biceps": "Bras",
    "triceps": "Bras",
    "avant-bras": "Bras"
  };
  
  const normalized = region.toLowerCase().trim();
  return mapping[normalized] || "Autre";
}
