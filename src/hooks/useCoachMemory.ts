import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ParsedMemory {
  injuries: string[];
  preferences: string[];
  limitations: string[];
  history: string[];
  raw: string;
}

function parseMemoryContent(content: string): ParsedMemory {
  const memory: ParsedMemory = {
    injuries: [],
    preferences: [],
    limitations: [],
    history: [],
    raw: content
  };

  if (!content) return memory;

  const lines = content.split('\n');
  let currentSection = '';

  lines.forEach(line => {
    const trimmedLine = line.trim();
    
    // Detect section headers
    if (trimmedLine.toLowerCase().includes('blessure') || trimmedLine.toLowerCase().includes('douleur')) {
      currentSection = 'injuries';
    } else if (trimmedLine.toLowerCase().includes('préférence') || trimmedLine.toLowerCase().includes('aime') || trimmedLine.toLowerCase().includes('favori')) {
      currentSection = 'preferences';
    } else if (trimmedLine.toLowerCase().includes('limitation') || trimmedLine.toLowerCase().includes('contrainte') || trimmedLine.toLowerCase().includes('évite')) {
      currentSection = 'limitations';
    } else if (trimmedLine.toLowerCase().includes('historique') || trimmedLine.toLowerCase().includes('progression') || trimmedLine.toLowerCase().includes('objectif')) {
      currentSection = 'history';
    } else if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•') || trimmedLine.startsWith('*')) {
      const item = trimmedLine.replace(/^[-•*]\s*/, '').trim();
      if (item && currentSection) {
        memory[currentSection as keyof Omit<ParsedMemory, 'raw'>].push(item);
      }
    } else if (trimmedLine && currentSection) {
      // Add non-empty lines to current section
      if (!trimmedLine.includes(':') && trimmedLine.length > 5) {
        memory[currentSection as keyof Omit<ParsedMemory, 'raw'>].push(trimmedLine);
      }
    }
  });

  return memory;
}

export function useCoachMemory() {
  const queryClient = useQueryClient();

  const { data: memory, isLoading, error } = useQuery({
    queryKey: ["coach-memory"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("ai_coach_memory")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        return {
          id: null,
          memoryContent: "",
          parsed: parseMemoryContent(""),
          updatedAt: null
        };
      }

      return {
        id: data.id,
        memoryContent: data.memory_content,
        parsed: parseMemoryContent(data.memory_content),
        updatedAt: data.updated_at
      };
    }
  });

  const updateMemoryMutation = useMutation({
    mutationFn: async (newContent: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      if (memory?.id) {
        // Update existing
        const { error } = await supabase
          .from("ai_coach_memory")
          .update({ memory_content: newContent, updated_at: new Date().toISOString() })
          .eq("id", memory.id);
        
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("ai_coach_memory")
          .insert({ user_id: user.id, memory_content: newContent });
        
        if (error) throw error;
      }

      return newContent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-memory"] });
      toast.success("Mémoire du coach mise à jour");
    },
    onError: (error) => {
      toast.error("Erreur lors de la mise à jour de la mémoire");
      console.error(error);
    }
  });

  return {
    memory,
    isLoading,
    error,
    updateMemory: updateMemoryMutation.mutate,
    isUpdating: updateMemoryMutation.isPending
  };
}
