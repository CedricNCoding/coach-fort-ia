import { useHealthKit } from '@/hooks/useHealthKit';
import { toast } from 'sonner';

/**
 * Hook pour exporter automatiquement les séances vers Apple Health/Google Fit
 */
export function useAutoExportSession() {
  const { isNative, isAuthorized, exportWorkout } = useHealthKit();

  const autoExportSession = async (session: {
    started_at: string;
    finished_at: string | null;
    total_tonnage: number | null;
  }) => {
    // Vérifier si l'export auto est activé
    const autoExportEnabled = localStorage.getItem('healthkit_auto_export_workouts') === 'true';
    
    if (!isNative || !isAuthorized || !autoExportEnabled) {
      return false;
    }

    if (!session.finished_at) {
      console.log('Session not finished, skipping export');
      return false;
    }

    try {
      // Estimer les calories brûlées (approximation basée sur le tonnage)
      // Formule simplifiée: environ 0.5 kcal par kg soulevé
      const estimatedCalories = session.total_tonnage 
        ? Math.round(session.total_tonnage * 0.5) 
        : 0;

      const success = await exportWorkout({
        startDate: session.started_at,
        endDate: session.finished_at,
        energyBurned: estimatedCalories,
        workoutType: 'traditionalStrengthTraining',
        sourceName: 'StrongCoach IA Pro'
      });

      if (success) {
        toast.success('Séance exportée vers Health');
      }

      return success;
    } catch (error) {
      console.error('Failed to auto-export session:', error);
      return false;
    }
  };

  return { autoExportSession, isNative, isAuthorized };
}
