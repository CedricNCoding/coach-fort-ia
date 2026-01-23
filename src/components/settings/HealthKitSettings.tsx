import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Heart, Smartphone, CheckCircle, XCircle, Loader2, Apple } from 'lucide-react';
import { useHealthKit } from '@/hooks/useHealthKit';
import { toast } from 'sonner';

export function HealthKitSettings() {
  const {
    isNative,
    isAvailable,
    isAuthorized,
    isLoading,
    error,
    checkAvailability,
    requestAuthorization
  } = useHealthKit();

  const [autoExportWorkouts, setAutoExportWorkouts] = useState(() => {
    return localStorage.getItem('healthkit_auto_export_workouts') === 'true';
  });
  const [autoSyncWeight, setAutoSyncWeight] = useState(() => {
    return localStorage.getItem('healthkit_auto_sync_weight') === 'true';
  });

  useEffect(() => {
    if (isNative) {
      checkAvailability();
    }
  }, [isNative, checkAvailability]);

  useEffect(() => {
    localStorage.setItem('healthkit_auto_export_workouts', String(autoExportWorkouts));
  }, [autoExportWorkouts]);

  useEffect(() => {
    localStorage.setItem('healthkit_auto_sync_weight', String(autoSyncWeight));
  }, [autoSyncWeight]);

  const handleConnect = async () => {
    const success = await requestAuthorization();
    if (success) {
      toast.success('Connexion à Apple Health réussie !');
    } else if (error) {
      toast.error(error);
    }
  };

  // Web version - show info about native app
  if (!isNative) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Apple className="h-5 w-5 text-destructive" />
            Apple Health / Google Fit
          </CardTitle>
          <CardDescription>
            Synchronisez vos séances avec les apps de santé
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
          <Smartphone className="h-8 w-8 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium">Application native requise</p>
            <p className="text-sm text-muted-foreground">
              L'intégration Apple Health nécessite l'app mobile native. 
              Téléchargez l'app sur votre iPhone pour activer cette fonctionnalité.
            </p>
          </div>
        </div>

          <div className="space-y-3 opacity-50">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-export" className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Export auto des séances
              </Label>
              <Switch id="auto-export" disabled />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-sync" className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Sync poids corporel
              </Label>
              <Switch id="auto-sync" disabled />
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              📱 Instructions pour l'app native :
            </p>
            <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
              <li>Exportez le projet vers GitHub</li>
              <li>Clonez et installez les dépendances</li>
              <li>Exécutez <code className="bg-muted px-1">npx cap add ios</code></li>
              <li>Ouvrez dans Xcode avec <code className="bg-muted px-1">npx cap open ios</code></li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Native version - full functionality
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Apple className="h-5 w-5 text-destructive" />
          Apple Health
        </CardTitle>
        <CardDescription>
          Synchronisez vos séances et votre poids avec Apple Health
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection status */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            {isAuthorized ? (
              <>
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="font-medium">Connecté</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Non connecté</span>
              </>
            )}
          </div>
          {!isAuthorized && (
            <Button onClick={handleConnect} disabled={isLoading || !isAvailable}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Connecter
            </Button>
          )}
        </div>

        {!isAvailable && (
          <Badge variant="outline" className="w-full justify-center py-2">
            Apple Health non disponible sur cet appareil
          </Badge>
        )}

        {/* Auto export settings */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-export-native" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Export auto des séances
            </Label>
            <Switch 
              id="auto-export-native" 
              checked={autoExportWorkouts}
              onCheckedChange={setAutoExportWorkouts}
              disabled={!isAuthorized}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Exporte automatiquement chaque séance terminée vers Apple Health
          </p>

          <div className="flex items-center justify-between">
            <Label htmlFor="auto-sync-native" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Sync poids corporel
            </Label>
            <Switch 
              id="auto-sync-native" 
              checked={autoSyncWeight}
              onCheckedChange={setAutoSyncWeight}
              disabled={!isAuthorized}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Synchronise votre poids corporel avec Apple Health
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
