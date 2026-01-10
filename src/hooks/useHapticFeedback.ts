import { useCallback } from "react";

/**
 * Hook pour gérer les vibrations haptiques sur mobile
 * Utilise l'API Vibration standard du navigateur
 */
export function useHapticFeedback() {
  const isSupported = typeof navigator !== "undefined" && "vibrate" in navigator;

  /**
   * Vibration légère (tap)
   */
  const lightTap = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(10);
    }
  }, [isSupported]);

  /**
   * Vibration moyenne (feedback de succès)
   */
  const mediumTap = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(25);
    }
  }, [isSupported]);

  /**
   * Vibration forte (changement d'exercice, alerte)
   */
  const heavyTap = useCallback(() => {
    if (isSupported) {
      navigator.vibrate(50);
    }
  }, [isSupported]);

  /**
   * Double vibration (succès important, PR battu)
   */
  const successPattern = useCallback(() => {
    if (isSupported) {
      navigator.vibrate([30, 50, 30]);
    }
  }, [isSupported]);

  /**
   * Pattern d'erreur/avertissement
   */
  const errorPattern = useCallback(() => {
    if (isSupported) {
      navigator.vibrate([100, 30, 100]);
    }
  }, [isSupported]);

  /**
   * Notification (nouvelle série à faire)
   */
  const notificationPattern = useCallback(() => {
    if (isSupported) {
      navigator.vibrate([50, 100, 50]);
    }
  }, [isSupported]);

  return {
    isSupported,
    lightTap,
    mediumTap,
    heavyTap,
    successPattern,
    errorPattern,
    notificationPattern,
  };
}
