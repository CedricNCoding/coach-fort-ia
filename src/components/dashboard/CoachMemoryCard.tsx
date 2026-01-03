import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Brain, Edit2, Save, X, Loader2, AlertCircle, Heart, ThumbsUp, Target } from "lucide-react";
import { useCoachMemory } from "@/hooks/useCoachMemory";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function CoachMemoryCard() {
  const { memory, isLoading, updateMemory, isUpdating } = useCoachMemory();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  const handleStartEdit = () => {
    setEditContent(memory?.memoryContent || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMemory(editContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent("");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const parsed = memory?.parsed || { injuries: [], preferences: [], limitations: [], history: [], raw: "" };
  const hasMemory = parsed.injuries.length > 0 || parsed.preferences.length > 0 || 
                   parsed.limitations.length > 0 || parsed.history.length > 0 || 
                   (memory?.memoryContent && memory.memoryContent.length > 0);

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Mémoire du Coach IA
          </CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Edit2 className="h-4 w-4 mr-1" />
                Modifier
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Mémoire du Coach IA
                </DialogTitle>
                <DialogDescription>
                  Ce que le coach sait de vous. Vous pouvez modifier ces informations pour améliorer ses recommandations.
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                {isEditing ? (
                  <div className="space-y-4">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={15}
                      placeholder={`Exemple de format:

BLESSURES / DOULEURS:
- Tendinite épaule droite (en cours de guérison)
- Ancienne blessure genou gauche

PRÉFÉRENCES:
- Aime les exercices polyarticulaires
- Préfère s'entraîner le matin

LIMITATIONS:
- Évite les exercices avec trop de pression sur le bas du dos
- Pas d'accès aux machines à câbles

OBJECTIFS / HISTORIQUE:
- Objectif: prise de masse
- 3 ans d'expérience en musculation`}
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={handleCancel} disabled={isUpdating}>
                        <X className="h-4 w-4 mr-1" />
                        Annuler
                      </Button>
                      <Button onClick={handleSave} disabled={isUpdating}>
                        {isUpdating ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-1" />
                        )}
                        Sauvegarder
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {parsed.injuries.length > 0 && (
                      <div>
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          Blessures / Douleurs
                        </h4>
                        <div className="space-y-1 pl-6">
                          {parsed.injuries.map((item, i) => (
                            <p key={i} className="text-sm text-muted-foreground">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsed.preferences.length > 0 && (
                      <div>
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <ThumbsUp className="h-4 w-4 text-green-500" />
                          Préférences
                        </h4>
                        <div className="space-y-1 pl-6">
                          {parsed.preferences.map((item, i) => (
                            <p key={i} className="text-sm text-muted-foreground">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsed.limitations.length > 0 && (
                      <div>
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <Heart className="h-4 w-4 text-orange-500" />
                          Limitations
                        </h4>
                        <div className="space-y-1 pl-6">
                          {parsed.limitations.map((item, i) => (
                            <p key={i} className="text-sm text-muted-foreground">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsed.history.length > 0 && (
                      <div>
                        <h4 className="font-medium flex items-center gap-2 mb-2">
                          <Target className="h-4 w-4 text-blue-500" />
                          Objectifs / Historique
                        </h4>
                        <div className="space-y-1 pl-6">
                          {parsed.history.map((item, i) => (
                            <p key={i} className="text-sm text-muted-foreground">• {item}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {!hasMemory && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucune information enregistrée. Le coach apprend de vos échanges et de vos séances.
                      </p>
                    )}

                    {memory?.memoryContent && parsed.injuries.length === 0 && parsed.preferences.length === 0 && 
                     parsed.limitations.length === 0 && parsed.history.length === 0 && (
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Contenu brut</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {memory.memoryContent}
                        </p>
                      </div>
                    )}

                    <div className="pt-4 flex justify-end">
                      <Button onClick={handleStartEdit}>
                        <Edit2 className="h-4 w-4 mr-1" />
                        Modifier
                      </Button>
                    </div>
                  </div>
                )}
              </ScrollArea>
              {memory?.updatedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Dernière mise à jour: {format(parseISO(memory.updatedAt), "dd MMM yyyy à HH:mm", { locale: fr })}
                </p>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>Ce que le coach sait de vous</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {parsed.injuries.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <AlertCircle className="h-3 w-3 text-red-500" />
              {parsed.injuries.slice(0, 2).map((item, i) => (
                <Badge key={i} variant="outline" className="text-xs border-red-500/30 text-red-500">
                  {item.slice(0, 30)}{item.length > 30 ? "..." : ""}
                </Badge>
              ))}
              {parsed.injuries.length > 2 && (
                <span className="text-xs text-muted-foreground">+{parsed.injuries.length - 2}</span>
              )}
            </div>
          )}

          {parsed.preferences.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <ThumbsUp className="h-3 w-3 text-green-500" />
              {parsed.preferences.slice(0, 2).map((item, i) => (
                <Badge key={i} variant="outline" className="text-xs border-green-500/30 text-green-500">
                  {item.slice(0, 30)}{item.length > 30 ? "..." : ""}
                </Badge>
              ))}
              {parsed.preferences.length > 2 && (
                <span className="text-xs text-muted-foreground">+{parsed.preferences.length - 2}</span>
              )}
            </div>
          )}

          {parsed.limitations.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Heart className="h-3 w-3 text-orange-500" />
              {parsed.limitations.slice(0, 2).map((item, i) => (
                <Badge key={i} variant="outline" className="text-xs border-orange-500/30 text-orange-500">
                  {item.slice(0, 30)}{item.length > 30 ? "..." : ""}
                </Badge>
              ))}
              {parsed.limitations.length > 2 && (
                <span className="text-xs text-muted-foreground">+{parsed.limitations.length - 2}</span>
              )}
            </div>
          )}

          {!hasMemory && (
            <p className="text-xs text-muted-foreground">
              Le coach apprendra vos préférences au fil du temps
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
