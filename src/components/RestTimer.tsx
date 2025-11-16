import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, X } from "lucide-react";

interface RestTimerProps {
  targetSeconds: number;
  onComplete: () => void;
  autoStart?: boolean;
  onCancel?: () => void;
}

export default function RestTimer({ targetSeconds, onComplete, autoStart = false, onCancel }: RestTimerProps) {
  const [timeLeft, setTimeLeft] = useState(targetSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(autoStart);

useEffect(() => {
  // Reset quand la durée change et auto-démarrer si demandé
  setTimeLeft(targetSeconds);
  setIsPaused(false);
  setIsVisible(autoStart);
}, [targetSeconds, autoStart]);

useEffect(() => {
  if (isPaused || !isVisible) return;
  if (timeLeft <= 0) {
    onComplete();
    return;
  }

  const interval = setInterval(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        onComplete();
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(interval);
}, [isPaused, isVisible, onComplete]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = ((targetSeconds - timeLeft) / targetSeconds) * 100;

  if (!isVisible) {
    return (
      <Button onClick={() => setIsVisible(true)} variant="outline" className="w-full">
        <Clock className="h-4 w-4 mr-2" />
        Démarrer le repos ({targetSeconds}s)
      </Button>
    );
  }

  if (timeLeft === 0) {
    return null;
  }

  return (
    <Card className="bg-accent/20 border-accent">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent-foreground" />
            <span className="font-semibold">Repos en cours</span>
          </div>
          <Button onClick={() => { onCancel ? onCancel() : setIsVisible(false); }} variant="ghost" size="icon">
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
