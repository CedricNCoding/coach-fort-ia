import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Settings2 } from "lucide-react";

export interface SessionParams {
  daysToSchedule: number;
  sessionDuration: number;
  exercisesPerSession: number;
  forceSupersets: boolean;
  isDeload: boolean;
}

interface SessionParametersProps {
  params: SessionParams;
  onChange: (params: SessionParams) => void;
}

export function SessionParameters({ params, onChange }: SessionParametersProps) {
  const updateParam = <K extends keyof SessionParams>(key: K, value: SessionParams[K]) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <Card className="mb-4">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Paramètres de séance
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-4">
        {/* Nombre de jours */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs">Jours à planifier</Label>
            <span className="text-xs text-muted-foreground font-medium">{params.daysToSchedule}</span>
          </div>
          <Slider
            value={[params.daysToSchedule]}
            onValueChange={([v]) => updateParam("daysToSchedule", v)}
            min={1}
            max={7}
            step={1}
            className="w-full"
          />
        </div>

        {/* Durée par séance */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs">Durée par séance</Label>
            <span className="text-xs text-muted-foreground font-medium">{params.sessionDuration} min</span>
          </div>
          <Slider
            value={[params.sessionDuration]}
            onValueChange={([v]) => updateParam("sessionDuration", v)}
            min={30}
            max={120}
            step={5}
            className="w-full"
          />
        </div>

        {/* Exercices par séance */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs">Exercices par séance</Label>
            <span className="text-xs text-muted-foreground font-medium">{params.exercisesPerSession}</span>
          </div>
          <Slider
            value={[params.exercisesPerSession]}
            onValueChange={([v]) => updateParam("exercisesPerSession", v)}
            min={4}
            max={18}
            step={1}
            className="w-full"
          />
        </div>

        {/* Supersets */}
        <div className="flex items-center justify-between">
          <Label htmlFor="force-supersets" className="text-xs cursor-pointer">
            Forcer les supersets
          </Label>
          <Switch
            id="force-supersets"
            checked={params.forceSupersets}
            onCheckedChange={(v) => updateParam("forceSupersets", v)}
          />
        </div>

        {/* Mode Deload */}
        <div className="flex items-center justify-between">
          <Label htmlFor="deload-mode" className="text-xs cursor-pointer">
            Mode deload
          </Label>
          <Switch
            id="deload-mode"
            checked={params.isDeload}
            onCheckedChange={(v) => updateParam("isDeload", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
