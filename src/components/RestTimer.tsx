import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";

interface RestTimerProps {
  seconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Composant minuteur de repos automatique
 * Démarre automatiquement et affiche un compte à rebours
 */
export default function RestTimer({ seconds, onComplete, onSkip }: RestTimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, isPaused, onComplete]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = ((seconds - timeLeft) / seconds) * 100;

  if (timeLeft === 0) {
    return (
      <Card className="bg-success/20 border-success">
        <CardContent className="py-4 text-center">
          <p className="font-bold text-success">Repos terminé ! Prêt pour le prochain set ?</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-accent/20 border-accent">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent-foreground" />
            <span className="font-semibold">Repos en cours</span>
          </div>
          <Button onClick={onSkip} variant="ghost" size="icon">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center justify-between mb-2">
          <span className="text-3xl font-mono font-bold">{formatTime(timeLeft)}</span>
          <Button 
            onClick={() => setIsPaused(!isPaused)} 
            variant="outline"
            size="sm"
          >
            {isPaused ? "Reprendre" : "Pause"}
          </Button>
        </div>

        {/* Barre de progression */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
