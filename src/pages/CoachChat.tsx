import { useState } from "react";
import Layout from "@/components/Layout";
import { WeekProgramView } from "@/components/coach/WeekProgramView";
import { ChatInterface } from "@/components/coach/ChatInterface";
import { SessionParameters, SessionParams } from "@/components/coach/SessionParameters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Calendar, Settings2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function CoachChat() {
  const isMobile = useIsMobile();
  
  const [sessionParams, setSessionParams] = useState<SessionParams>({
    daysToSchedule: 4,
    sessionDuration: 60,
    exercisesPerSession: 8,
    forceSupersets: false,
    isDeload: false
  });

  if (isMobile) {
    // Vue mobile avec tabs
    return (
      <Layout>
        <div className="h-[calc(100vh-4rem)] flex flex-col">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="params" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Paramètres
              </TabsTrigger>
              <TabsTrigger value="program" className="gap-2">
                <Calendar className="h-4 w-4" />
                Programme
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-2">
                <Brain className="h-4 w-4" />
                Coach
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="params" className="flex-1 p-4 overflow-auto">
              <SessionParameters params={sessionParams} onChange={setSessionParams} />
            </TabsContent>
            
            <TabsContent value="program" className="flex-1 p-4 overflow-auto">
              <WeekProgramView />
            </TabsContent>
            
            <TabsContent value="chat" className="flex-1 flex flex-col min-h-0">
              <ChatInterface sessionParams={sessionParams} />
            </TabsContent>
          </Tabs>
        </div>
      </Layout>
    );
  }

  // Vue desktop avec 2 colonnes
  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex">
        {/* Colonne gauche : Paramètres + Programme */}
        <div className="w-[350px] border-r p-4 overflow-auto">
          <SessionParameters params={sessionParams} onChange={setSessionParams} />
          
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Cette semaine
          </h2>
          <WeekProgramView />
        </div>

        {/* Colonne droite : Chat */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Coach IA
            </h2>
            <p className="text-sm text-muted-foreground">
              Discute avec ton coach pour créer ou modifier ton programme
            </p>
          </div>
          <ChatInterface sessionParams={sessionParams} />
        </div>
      </div>
    </Layout>
  );
}
