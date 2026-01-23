import Layout from "@/components/Layout";
import { HealthKitSettings } from "@/components/settings/HealthKitSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <Layout>
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Paramètres</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Health Integration */}
          <HealthKitSettings />

          {/* Placeholder pour d'autres paramètres */}
          <Card>
            <CardHeader>
              <CardTitle>Préférences d'entraînement</CardTitle>
              <CardDescription>
                Personnalisez votre expérience d'entraînement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                D'autres paramètres seront disponibles prochainement.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
