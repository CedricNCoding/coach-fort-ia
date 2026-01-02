import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Brain, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProposedActionCard } from "./ProposedActionCard";
import { ProposedAction } from "@/hooks/useCoachActions";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  proposed_actions?: ProposedAction[];
  timestamp: string;
}

export function ChatInterface() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Charger la conversation existante
  const { data: conversation, isLoading: loadingConversation } = useQuery({
    queryKey: ["coach_conversation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_conversations")
        .select("*")
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    }
  });

  // Parse messages from JSON string if needed
  const messages: ChatMessage[] = (() => {
    if (!conversation?.messages) return [];
    if (typeof conversation.messages === "string") {
      try {
        return JSON.parse(conversation.messages) as ChatMessage[];
      } catch {
        return [];
      }
    }
    if (Array.isArray(conversation.messages)) {
      return conversation.messages as unknown as ChatMessage[];
    }
    return [];
  })();

  // Scroll automatique vers le bas
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mutation pour envoyer un message
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      // Ajouter le message utilisateur localement d'abord
      const userMessage: ChatMessage = {
        role: "user",
        content: message,
        timestamp: new Date().toISOString()
      };

      const updatedMessages = [...messages, userMessage];

      // Sauvegarder immédiatement pour montrer le message
      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      // Check if conversation exists
      const { data: existingConv } = await supabase
        .from("coach_conversations")
        .select("id")
        .eq("user_id", userId!)
        .maybeSingle();

      if (existingConv) {
        await supabase
          .from("coach_conversations")
          .update({ 
            messages: JSON.stringify(updatedMessages), 
            updated_at: new Date().toISOString() 
          })
          .eq("user_id", userId!);
      } else {
        await supabase
          .from("coach_conversations")
          .insert([{ 
            user_id: userId!, 
            messages: JSON.stringify(updatedMessages), 
            updated_at: new Date().toISOString() 
          }]);
      }

      // Appeler l'edge function
      const { data, error } = await supabase.functions.invoke("ai-coach-chat", {
        body: { message }
      });

      if (error) throw error;

      // Ajouter la réponse du coach
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.text || data.response || "Je n'ai pas pu générer de réponse.",
        proposed_actions: data.proposed_actions,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, assistantMessage];

      // Sauvegarder avec la réponse
      await supabase
        .from("coach_conversations")
        .update({ 
          messages: JSON.stringify(finalMessages), 
          updated_at: new Date().toISOString() 
        })
        .eq("user_id", userId!);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach_conversation"] });
      setInput("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors de l'envoi"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(input.trim());
  };

  // Callback quand une action est exécutée
  const onActionComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["planned_workouts"] });
    queryClient.invalidateQueries({ queryKey: ["workout_templates"] });
    queryClient.invalidateQueries({ queryKey: ["planned_workouts_week"] });
  };

  if (loadingConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Zone de messages */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Bonjour ! Je suis ton coach IA.</p>
              <p className="text-sm mt-2">
                Demande-moi de créer ton programme de la semaine, de modifier un exercice, 
                ou simplement des conseils sur ton entraînement.
              </p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className="space-y-2">
              <div
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                  msg.role === "user" ? "bg-primary" : "bg-muted"
                )}>
                  {msg.role === "user" ? (
                    <User className="h-4 w-4 text-primary-foreground" />
                  ) : (
                    <Brain className="h-4 w-4 text-foreground" />
                  )}
                </div>

                {/* Message */}
                <Card className={cn(
                  "max-w-[80%] p-3",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted"
                )}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </Card>
              </div>

              {/* Actions proposées */}
              {msg.role === "assistant" && msg.proposed_actions && msg.proposed_actions.length > 0 && (
                <div className="ml-11 space-y-2">
                  {msg.proposed_actions.map((action, actionIndex) => (
                    <ProposedActionCard 
                      key={actionIndex} 
                      action={action} 
                      onComplete={onActionComplete}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Indicateur de chargement */}
          {sendMessageMutation.isPending && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                <Brain className="h-4 w-4 text-foreground animate-pulse" />
              </div>
              <Card className="bg-muted p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Le coach réfléchit...</span>
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Zone d'input */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Demande au coach..."
            disabled={sendMessageMutation.isPending}
            className="flex-1"
          />
          <Button 
            type="submit" 
            size="icon"
            disabled={!input.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
