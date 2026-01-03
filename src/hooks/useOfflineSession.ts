import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OfflineSet {
  id: string;
  exerciseId: number;
  exerciseName: string;
  templateExerciseId: number | null;
  setIndex: number;
  reps: number;
  weightKg: number;
  perceivedDifficulty: number | null;
  pain: number;
  isWarmup: number;
  createdAt: string;
}

interface OfflineSession {
  id: string;
  plannedWorkoutId: number | null;
  startedAt: string;
  sets: OfflineSet[];
  templateName: string;
}

const OFFLINE_SESSION_KEY = "offline_session";
const OFFLINE_QUEUE_KEY = "offline_sync_queue";

export function useOfflineSession() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineSession, setOfflineSession] = useState<OfflineSession | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Connexion rétablie - synchronisation en cours...");
      syncOfflineData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Mode hors connexion activé");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load any existing offline session
    const saved = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (saved) {
      try {
        setOfflineSession(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse offline session", e);
      }
    }

    // Count pending syncs
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (queue) {
      try {
        const items = JSON.parse(queue);
        setPendingSyncCount(items.length);
      } catch (e) {
        console.error("Failed to parse sync queue", e);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Save offline session to localStorage
  const saveOfflineSession = useCallback((session: OfflineSession) => {
    localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
    setOfflineSession(session);
  }, []);

  // Add a set to offline session
  const addOfflineSet = useCallback((set: Omit<OfflineSet, "id" | "createdAt">) => {
    setOfflineSession(prev => {
      if (!prev) return null;
      
      const newSet: OfflineSet = {
        ...set,
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString()
      };

      const updated = {
        ...prev,
        sets: [...prev.sets, newSet]
      };

      localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Start an offline session
  const startOfflineSession = useCallback((plannedWorkoutId: number | null, templateName: string) => {
    const session: OfflineSession = {
      id: `offline_session_${Date.now()}`,
      plannedWorkoutId,
      startedAt: new Date().toISOString(),
      sets: [],
      templateName
    };
    saveOfflineSession(session);
    return session;
  }, [saveOfflineSession]);

  // End offline session and queue for sync
  const endOfflineSession = useCallback(() => {
    if (!offlineSession) return;

    // Add to sync queue
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    queue.push({
      type: "session",
      data: offlineSession,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    setPendingSyncCount(queue.length);

    // Clear current offline session
    localStorage.removeItem(OFFLINE_SESSION_KEY);
    setOfflineSession(null);

    // Try to sync if online
    if (navigator.onLine) {
      syncOfflineData();
    } else {
      toast.info("Séance sauvegardée localement. Elle sera synchronisée dès que vous serez en ligne.");
    }
  }, [offlineSession]);

  // Sync offline data to server
  const syncOfflineData = useCallback(async () => {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    if (queue.length === 0) return;

    setIsSyncing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Authentification requise pour synchroniser");
        setIsSyncing(false);
        return;
      }

      const successfulSyncs: number[] = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        
        if (item.type === "session") {
          const sessionData = item.data as OfflineSession;
          
          try {
            // Create the session
            const { data: newSession, error: sessionError } = await supabase
              .from("sessions")
              .insert({
                user_id: user.id,
                planned_workout_id: sessionData.plannedWorkoutId,
                started_at: sessionData.startedAt,
                finished_at: new Date().toISOString(),
                status: "completed"
              })
              .select()
              .single();

            if (sessionError) throw sessionError;

            // Create the sets
            if (sessionData.sets.length > 0) {
              const setsToInsert = sessionData.sets.map(set => ({
                session_id: newSession.id,
                exercise_id: set.exerciseId,
                template_exercise_id: set.templateExerciseId,
                set_index: set.setIndex,
                reps: set.reps,
                weight_kg: set.weightKg,
                perceived_difficulty: set.perceivedDifficulty,
                pain: set.pain,
                is_warmup: set.isWarmup
              }));

              const { error: setsError } = await supabase
                .from("session_sets")
                .insert(setsToInsert);

              if (setsError) throw setsError;
            }

            // Calculate and update tonnage
            const totalTonnage = sessionData.sets
              .filter(s => s.isWarmup === 0)
              .reduce((sum, set) => sum + (set.weightKg * set.reps), 0);

            await supabase
              .from("sessions")
              .update({ total_tonnage: totalTonnage })
              .eq("id", newSession.id);

            successfulSyncs.push(i);
          } catch (e) {
            console.error("Failed to sync session:", e);
          }
        }
      }

      // Remove successfully synced items
      const remainingQueue = queue.filter((_: any, i: number) => !successfulSyncs.includes(i));
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
      setPendingSyncCount(remainingQueue.length);

      if (successfulSyncs.length > 0) {
        toast.success(`${successfulSyncs.length} séance(s) synchronisée(s)`);
      }

      if (remainingQueue.length > 0) {
        toast.warning(`${remainingQueue.length} élément(s) en attente de synchronisation`);
      }
    } catch (e) {
      console.error("Sync error:", e);
      toast.error("Erreur lors de la synchronisation");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    isOnline,
    offlineSession,
    isSyncing,
    pendingSyncCount,
    startOfflineSession,
    addOfflineSet,
    endOfflineSession,
    syncOfflineData
  };
}
