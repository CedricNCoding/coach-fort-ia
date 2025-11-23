import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Dumbbell, Brain, TrendingUp } from "lucide-react";
import { AICoach } from "@/components/AICoach";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

const Index = () => {
  const navigate = useNavigate();
  
  const { data: todayWorkout } = useQuery({
    queryKey: ["today-workout"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("planned_workouts")
        .select(`
          *,
          workout_templates (
            name
          )
        `)
        .eq("date", today)
        .eq("status", "planned")
        .single();
      return data;
    }
  });

  const { data: weekStats } = useQuery({
    queryKey: ["week-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const weekStart = startOfWeek(new Date(), { locale: fr });
      const weekEnd = endOfWeek(new Date(), { locale: fr });

      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, total_tonnage, started_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gte("started_at", weekStart.toISOString())
        .lte("started_at", weekEnd.toISOString());

      const totalTonnage = sessions?.reduce((sum, s) => sum + (s.total_tonnage || 0), 0) || 0;
      
      return {
        sessionsCount: sessions?.length || 0,
        totalTonnage: Math.round(totalTonnage)
      };
    }
  });

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Bienvenue dans votre espace d'entraînement</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Séance du jour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayWorkout ? (
              <div className="space-y-3">
                <p className="font-semibold">{todayWorkout.workout_templates?.name || "Séance planifiée"}</p>
                <Button 
                  onClick={() => navigate(`/calendar`)}
                  className="w-full"
                >
                  <Dumbbell className="mr-2 h-4 w-4" />
                  Lancer la séance
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Aucune séance planifiée aujourd'hui</p>
                <Button 
                  variant="outline"
                  onClick={() => navigate("/calendar")}
                  className="w-full"
                >
                  Voir le calendrier
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Cette semaine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Séances réalisées</span>
                <span className="font-semibold text-lg">{weekStats?.sessionsCount || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tonnage total</span>
                <span className="font-semibold text-lg">{weekStats?.totalTonnage || 0} kg</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>Coach IA</CardTitle>
          </div>
          <CardDescription>Votre coach personnel intelligent</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="w-full">
                Consulter mon Coach IA
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Coach IA
                </DialogTitle>
                <DialogDescription>
                  Analyse de votre entraînement et recommandations personnalisées
                </DialogDescription>
              </DialogHeader>
              <AICoach />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Button 
          variant="outline"
          onClick={() => navigate("/calendar")}
          className="h-20 flex flex-col gap-2"
        >
          <Calendar className="h-6 w-6" />
          <span className="text-sm">Calendrier</span>
        </Button>
        <Button 
          variant="outline"
          onClick={() => navigate("/plans")}
          className="h-20 flex flex-col gap-2"
        >
          <Dumbbell className="h-6 w-6" />
          <span className="text-sm">Mes Plans</span>
        </Button>
        <Button 
          variant="outline"
          onClick={() => navigate("/history")}
          className="h-20 flex flex-col gap-2"
        >
          <TrendingUp className="h-6 w-6" />
          <span className="text-sm">Historique</span>
        </Button>
      </div>
    </div>
  );
};

export default Index;
