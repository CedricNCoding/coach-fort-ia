import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Battery, BatteryLow, BatteryWarning, AlertTriangle, CheckCircle, Calendar } from "lucide-react";
import { format, subDays, differenceInDays, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";

interface DeloadAnalysis {
  shouldDeload: boolean;
  urgency: "none" | "low" | "medium" | "high";
  reasons: string[];
  daysSinceLastDeload: number | null;
  averageRpe: number | null;
  rpeWorsening: boolean;
  consecutiveHighRpeSessions: number;
  weeksSinceDeload: number | null;
}

/**
 * Analyse les indicateurs de fatigue et recommande une semaine de décharge
 * Combine: temps depuis dernière décharge + indicateurs de fatigue (RPE, performance)
 */
export function DeloadRecommendationCard() {
  const navigate = useNavigate();

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["deload_recommendation"],
    queryFn: async (): Promise<DeloadAnalysis> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          shouldDeload: false,
          urgency: "none",
          reasons: [],
          daysSinceLastDeload: null,
          averageRpe: null,
          rpeWorsening: false,
          consecutiveHighRpeSessions: 0,
          weeksSinceDeload: null
        };
      }

      const reasons: string[] = [];
      let urgencyScore = 0;

      // 1. Trouver la dernière séance de décharge
      const { data: lastDeloadSession } = await supabase
        .from("planned_workouts")
        .select("date")
        .eq("user_id", user.id)
        .eq("is_deload", true)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const daysSinceLastDeload = lastDeloadSession 
        ? differenceInDays(new Date(), new Date(lastDeloadSession.date))
        : null;

      const weeksSinceDeload = daysSinceLastDeload !== null 
        ? Math.floor(daysSinceLastDeload / 7)
        : null;

      // Analyse temporelle : recommander décharge toutes les 4-6 semaines
      if (daysSinceLastDeload === null) {
        // Jamais de décharge - vérifier depuis combien de temps l'utilisateur s'entraîne
        const { data: firstSession } = await supabase
          .from("sessions")
          .select("started_at")
          .eq("user_id", user.id)
          .order("started_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstSession) {
          const daysSinceStart = differenceInDays(new Date(), new Date(firstSession.started_at));
          if (daysSinceStart >= 42) { // 6 semaines
            reasons.push("Aucune décharge depuis le début de l'entraînement (6+ semaines)");
            urgencyScore += 3;
          } else if (daysSinceStart >= 28) { // 4 semaines
            reasons.push("Pas de décharge depuis 4+ semaines");
            urgencyScore += 2;
          }
        }
      } else if (daysSinceLastDeload >= 42) { // 6 semaines
        reasons.push(`${weeksSinceDeload} semaines depuis la dernière décharge`);
        urgencyScore += 3;
      } else if (daysSinceLastDeload >= 28) { // 4 semaines
        reasons.push(`${weeksSinceDeload} semaines depuis la dernière décharge`);
        urgencyScore += 1;
      }

      // 2. Analyser les RPE des 2 dernières semaines
      const twoWeeksAgo = subDays(new Date(), 14);
      const { data: recentSessions } = await supabase
        .from("sessions")
        .select("id, started_at, avg_difficulty")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gte("started_at", twoWeeksAgo.toISOString())
        .order("started_at", { ascending: false });

      let averageRpe: number | null = null;
      let rpeWorsening = false;
      let consecutiveHighRpeSessions = 0;

      if (recentSessions && recentSessions.length >= 3) {
        // Calculer le RPE moyen
        const validRpes = recentSessions.filter(s => s.avg_difficulty !== null);
        if (validRpes.length > 0) {
          averageRpe = validRpes.reduce((sum, s) => sum + (s.avg_difficulty || 0), 0) / validRpes.length;
          
          // Vérifier les séances consécutives avec RPE élevé (>= 8.5)
          for (const session of recentSessions) {
            if (session.avg_difficulty && session.avg_difficulty >= 8.5) {
              consecutiveHighRpeSessions++;
            } else {
              break;
            }
          }

          if (consecutiveHighRpeSessions >= 3) {
            reasons.push(`${consecutiveHighRpeSessions} séances consécutives avec RPE ≥ 8.5`);
            urgencyScore += 2;
          }

          // Vérifier si le RPE augmente (comparer première et deuxième moitié de la période)
          if (validRpes.length >= 4) {
            const midpoint = Math.floor(validRpes.length / 2);
            const recentAvg = validRpes.slice(0, midpoint).reduce((sum, s) => sum + (s.avg_difficulty || 0), 0) / midpoint;
            const olderAvg = validRpes.slice(midpoint).reduce((sum, s) => sum + (s.avg_difficulty || 0), 0) / (validRpes.length - midpoint);
            
            if (recentAvg > olderAvg + 0.5) {
              rpeWorsening = true;
              reasons.push("Tendance RPE en augmentation (+0.5 sur 2 semaines)");
              urgencyScore += 2;
            }
          }

          // RPE moyen très élevé
          if (averageRpe >= 9) {
            reasons.push(`RPE moyen très élevé (${averageRpe.toFixed(1)}/10)`);
            urgencyScore += 2;
          } else if (averageRpe >= 8.5) {
            reasons.push(`RPE moyen élevé (${averageRpe.toFixed(1)}/10)`);
            urgencyScore += 1;
          }
        }
      }

      // Déterminer l'urgence finale
      let urgency: "none" | "low" | "medium" | "high" = "none";
      if (urgencyScore >= 5) {
        urgency = "high";
      } else if (urgencyScore >= 3) {
        urgency = "medium";
      } else if (urgencyScore >= 1) {
        urgency = "low";
      }

      return {
        shouldDeload: urgencyScore >= 3,
        urgency,
        reasons,
        daysSinceLastDeload,
        averageRpe,
        rpeWorsening,
        consecutiveHighRpeSessions,
        weeksSinceDeload
      };
    },
    staleTime: 300000, // Cache 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Battery className="h-4 w-4" />
            Récupération
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis || analysis.urgency === "none") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Battery className="h-4 w-4 text-green-500" />
            Récupération
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Niveau de fatigue optimal</span>
          </div>
          {analysis?.weeksSinceDeload !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              Dernière décharge il y a {analysis.weeksSinceDeload} semaine{analysis.weeksSinceDeload > 1 ? "s" : ""}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const urgencyConfig = {
    low: {
      icon: Battery,
      color: "text-yellow-500",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
      borderColor: "border-yellow-200 dark:border-yellow-900",
      label: "À surveiller"
    },
    medium: {
      icon: BatteryWarning,
      color: "text-orange-500",
      bgColor: "bg-orange-50 dark:bg-orange-950/30",
      borderColor: "border-orange-200 dark:border-orange-900",
      label: "Décharge recommandée"
    },
    high: {
      icon: BatteryLow,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/30",
      borderColor: "border-red-200 dark:border-red-900",
      label: "Décharge urgente"
    }
  };

  const config = urgencyConfig[analysis.urgency];
  const Icon = config.icon;

  return (
    <Card className={`${config.borderColor} ${config.bgColor}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm font-medium flex items-center gap-2 ${config.color}`}>
          <Icon className="h-4 w-4" />
          {config.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="text-xs space-y-1">
          {analysis.reasons.map((reason, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <AlertTriangle className={`h-3 w-3 mt-0.5 flex-shrink-0 ${config.color}`} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
        
        {analysis.shouldDeload && (
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full mt-2"
            onClick={() => navigate("/calendrier")}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Planifier une décharge
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
