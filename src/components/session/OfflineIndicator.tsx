import { WifiOff, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  onSync?: () => void;
}

export function OfflineIndicator({ isOnline, pendingSyncCount, isSyncing, onSync }: OfflineIndicatorProps) {
  if (isOnline && pendingSyncCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div className={cn(
      "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-auto z-50",
      "p-3 rounded-lg shadow-lg",
      isOnline ? "bg-green-500/10 border border-green-500/30" : "bg-orange-500/10 border border-orange-500/30"
    )}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isOnline ? (
            isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin text-green-500" />
            ) : (
              <Cloud className="h-4 w-4 text-green-500" />
            )
          ) : (
            <WifiOff className="h-4 w-4 text-orange-500" />
          )}
          <div>
            <p className="text-sm font-medium">
              {isOnline ? (
                isSyncing ? "Synchronisation en cours..." : "En ligne"
              ) : (
                "Mode hors connexion"
              )}
            </p>
            {pendingSyncCount > 0 && !isSyncing && (
              <p className="text-xs text-muted-foreground">
                {pendingSyncCount} séance(s) en attente
              </p>
            )}
          </div>
        </div>
        {isOnline && pendingSyncCount > 0 && !isSyncing && onSync && (
          <Button size="sm" variant="outline" onClick={onSync}>
            Synchroniser
          </Button>
        )}
        {!isOnline && (
          <Badge variant="outline" className="text-orange-500 border-orange-500/50">
            Hors ligne
          </Badge>
        )}
      </div>
    </div>
  );
}
