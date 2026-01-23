import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// Types for Health data
interface WorkoutData {
  startDate: string;
  endDate: string;
  energyBurned?: number; // kcal
  totalDistance?: number; // meters
  workoutType: string;
  sourceName: string;
}

interface BodyWeightData {
  date: string;
  weight: number; // kg
}

// Check if we're on a native platform
const isNative = Capacitor.isNativePlatform();

export function useHealthKit() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Health is available
  const checkAvailability = useCallback(async () => {
    if (!isNative) {
      setIsAvailable(false);
      return false;
    }

    try {
      // Dynamic import for native-only plugin
      const { Health } = await import('@capgo/capacitor-health');
      const result = await Health.isAvailable();
      setIsAvailable(result.available);
      return result.available;
    } catch (err) {
      console.log('Health not available:', err);
      setIsAvailable(false);
      return false;
    }
  }, []);

  // Request authorization for Health
  const requestAuthorization = useCallback(async () => {
    if (!isNative) {
      setError('Health integration is only available on mobile devices');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { Health } = await import('@capgo/capacitor-health');
      
      const result = await Health.requestAuthorization({
        read: ['weight', 'calories', 'distance'],
        write: ['weight', 'calories']
      });

      const hasWriteAccess = result.writeAuthorized.length > 0;
      setIsAuthorized(hasWriteAccess);
      setIsLoading(false);
      return hasWriteAccess;
    } catch (err: any) {
      setError(err.message || 'Failed to request Health authorization');
      setIsLoading(false);
      return false;
    }
  }, []);

  // Export a workout session to Health
  const exportWorkout = useCallback(async (workout: WorkoutData): Promise<boolean> => {
    if (!isNative || !isAuthorized) {
      console.log('Health not available or not authorized');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { Health } = await import('@capgo/capacitor-health');
      
      // Save calories burned as a sample
      if (workout.energyBurned && workout.energyBurned > 0) {
        await Health.saveSample({
          dataType: 'calories',
          value: workout.energyBurned,
          unit: 'kilocalorie',
          startDate: workout.startDate,
          endDate: workout.endDate,
          metadata: {
            workoutType: 'strengthTraining',
            source: 'StrongCoach IA Pro'
          }
        });
      }

      setIsLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to export workout to Health');
      setIsLoading(false);
      return false;
    }
  }, [isAuthorized]);

  // Export body weight to Health
  const exportBodyWeight = useCallback(async (data: BodyWeightData): Promise<boolean> => {
    if (!isNative || !isAuthorized) {
      console.log('Health not available or not authorized');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { Health } = await import('@capgo/capacitor-health');
      
      await Health.saveSample({
        dataType: 'weight',
        value: data.weight,
        unit: 'kilogram',
        startDate: data.date,
        endDate: data.date
      });

      setIsLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to export body weight to Health');
      setIsLoading(false);
      return false;
    }
  }, [isAuthorized]);

  // Read body weight from Health
  const readBodyWeight = useCallback(async (startDate: string, endDate: string): Promise<BodyWeightData[]> => {
    if (!isNative || !isAuthorized) {
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const { Health } = await import('@capgo/capacitor-health');
      
      const result = await Health.readSamples({
        dataType: 'weight',
        startDate: startDate,
        endDate: endDate,
        limit: 100
      });

      setIsLoading(false);
      
      return (result.samples || []).map((item) => ({
        date: item.startDate,
        weight: item.value
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to read body weight from Health');
      setIsLoading(false);
      return [];
    }
  }, [isAuthorized]);

  return {
    isNative,
    isAvailable,
    isAuthorized,
    isLoading,
    error,
    checkAvailability,
    requestAuthorization,
    exportWorkout,
    exportBodyWeight,
    readBodyWeight
  };
}
