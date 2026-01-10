export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_coach_memory: {
        Row: {
          created_at: string | null
          id: number
          memory_content: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          memory_content?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          memory_content?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_interactions_log: {
        Row: {
          created_at: string | null
          function_name: string
          id: number
          prompt: string
          response: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          function_name: string
          id?: never
          prompt: string
          response: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          function_name?: string
          id?: never
          prompt?: string
          response?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          prompt_content: string
          prompt_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: never
          prompt_content: string
          prompt_key: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: never
          prompt_content?: string
          prompt_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string | null
          id: number
          model_name: string | null
          updated_at: string | null
          user_id: string
          user_needs: string | null
          user_role: string | null
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: number
          model_name?: string | null
          updated_at?: string | null
          user_id: string
          user_needs?: string | null
          user_role?: string | null
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: number
          model_name?: string | null
          updated_at?: string | null
          user_id?: string
          user_needs?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      body_weights: {
        Row: {
          created_at: string
          id: number
          measured_at: string
          notes: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: number
          measured_at?: string
          notes?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: number
          measured_at?: string
          notes?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      coach_conversations: {
        Row: {
          created_at: string | null
          id: number
          messages: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          messages?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: never
          messages?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          created_at: string | null
          default_rest_seconds: number | null
          equipment: string | null
          id: number
          is_builtin: number | null
          measurement_type: string | null
          muscle_group: string | null
          name: string
          notes: string | null
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          default_rest_seconds?: number | null
          equipment?: string | null
          id?: number
          is_builtin?: number | null
          measurement_type?: string | null
          muscle_group?: string | null
          name: string
          notes?: string | null
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          default_rest_seconds?: number | null
          equipment?: string | null
          id?: number
          is_builtin?: number | null
          measurement_type?: string | null
          muscle_group?: string | null
          name?: string
          notes?: string | null
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      planned_runs: {
        Row: {
          created_at: string | null
          date: string
          id: number
          notes: string | null
          slot: number
          status: string | null
          target_distance_km: number | null
          target_duration_minutes: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: never
          notes?: string | null
          slot?: number
          status?: string | null
          target_distance_km?: number | null
          target_duration_minutes?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: never
          notes?: string | null
          slot?: number
          status?: string | null
          target_distance_km?: number | null
          target_duration_minutes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      planned_workouts: {
        Row: {
          created_at: string | null
          date: string
          deload_factor: number | null
          id: number
          is_deload: boolean | null
          notes: string | null
          slot: number
          status: string | null
          user_id: string
          workout_template_id: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          deload_factor?: number | null
          id?: number
          is_deload?: boolean | null
          notes?: string | null
          slot: number
          status?: string | null
          user_id: string
          workout_template_id?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          deload_factor?: number | null
          id?: number
          is_deload?: boolean | null
          notes?: string | null
          slot?: number
          status?: string | null
          user_id?: string
          workout_template_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_workouts_workout_template_id_fkey"
            columns: ["workout_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      progression_log: {
        Row: {
          changed_at: string | null
          exercise_id: number
          id: number
          new_reps_max: number | null
          new_reps_min: number | null
          new_sets: number | null
          new_weight_kg: number | null
          old_reps_max: number | null
          old_reps_min: number | null
          old_sets: number | null
          old_weight_kg: number | null
          reason: string | null
          source: string | null
          template_exercise_id: number | null
          user_id: string
        }
        Insert: {
          changed_at?: string | null
          exercise_id: number
          id?: number
          new_reps_max?: number | null
          new_reps_min?: number | null
          new_sets?: number | null
          new_weight_kg?: number | null
          old_reps_max?: number | null
          old_reps_min?: number | null
          old_sets?: number | null
          old_weight_kg?: number | null
          reason?: string | null
          source?: string | null
          template_exercise_id?: number | null
          user_id: string
        }
        Update: {
          changed_at?: string | null
          exercise_id?: number
          id?: number
          new_reps_max?: number | null
          new_reps_min?: number | null
          new_sets?: number | null
          new_weight_kg?: number | null
          old_reps_max?: number | null
          old_reps_min?: number | null
          old_sets?: number | null
          old_weight_kg?: number | null
          reason?: string | null
          source?: string | null
          template_exercise_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_log_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progression_log_template_exercise_id_fkey"
            columns: ["template_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_template_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          avg_heart_rate: number | null
          created_at: string | null
          date: string
          distance_km: number
          duration_minutes: number
          id: number
          max_heart_rate: number | null
          notes: string | null
          user_id: string
        }
        Insert: {
          avg_heart_rate?: number | null
          created_at?: string | null
          date: string
          distance_km: number
          duration_minutes: number
          id?: never
          max_heart_rate?: number | null
          notes?: string | null
          user_id: string
        }
        Update: {
          avg_heart_rate?: number | null
          created_at?: string | null
          date?: string
          distance_km?: number
          duration_minutes?: number
          id?: never
          max_heart_rate?: number | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      session_sets: {
        Row: {
          actual_rest_seconds: number | null
          created_at: string | null
          exercise_id: number
          id: number
          is_warmup: number | null
          pain: number | null
          pain_notes: string | null
          perceived_difficulty: number | null
          reps: number
          session_id: number
          set_index: number
          template_exercise_id: number | null
          time_seconds: number | null
          weight_kg: number
        }
        Insert: {
          actual_rest_seconds?: number | null
          created_at?: string | null
          exercise_id: number
          id?: number
          is_warmup?: number | null
          pain?: number | null
          pain_notes?: string | null
          perceived_difficulty?: number | null
          reps: number
          session_id: number
          set_index: number
          template_exercise_id?: number | null
          time_seconds?: number | null
          weight_kg: number
        }
        Update: {
          actual_rest_seconds?: number | null
          created_at?: string | null
          exercise_id?: number
          id?: number
          is_warmup?: number | null
          pain?: number | null
          pain_notes?: string | null
          perceived_difficulty?: number | null
          reps?: number
          session_id?: number
          set_index?: number
          template_exercise_id?: number | null
          time_seconds?: number | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_sets_template_exercise_id_fkey"
            columns: ["template_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_template_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          ai_feedback: string | null
          avg_difficulty: number | null
          created_at: string | null
          finished_at: string | null
          id: number
          notes: string | null
          planned_workout_id: number | null
          started_at: string
          status: string | null
          total_tonnage: number | null
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          avg_difficulty?: number | null
          created_at?: string | null
          finished_at?: string | null
          id?: number
          notes?: string | null
          planned_workout_id?: number | null
          started_at?: string
          status?: string | null
          total_tonnage?: number | null
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          avg_difficulty?: number | null
          created_at?: string | null
          finished_at?: string | null
          id?: number
          notes?: string | null
          planned_workout_id?: number | null
          started_at?: string
          status?: string | null
          total_tonnage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_planned_workout_id_fkey"
            columns: ["planned_workout_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_exercise_preferences: {
        Row: {
          created_at: string | null
          exercise_id: number
          id: number
          preference: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exercise_id: number
          id?: never
          preference: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          exercise_id?: number
          id?: never
          preference?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_exercise_preferences_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          age: number | null
          available_days: Json | null
          constraints: string | null
          created_at: string | null
          equipment: string | null
          goal: string | null
          id: string
          level: string | null
          session_duration_minutes: number | null
          sessions_per_week: number | null
          training_environment: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age?: number | null
          available_days?: Json | null
          constraints?: string | null
          created_at?: string | null
          equipment?: string | null
          goal?: string | null
          id?: string
          level?: string | null
          session_duration_minutes?: number | null
          sessions_per_week?: number | null
          training_environment?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age?: number | null
          available_days?: Json | null
          constraints?: string | null
          created_at?: string | null
          equipment?: string | null
          goal?: string | null
          id?: string
          level?: string | null
          session_duration_minutes?: number | null
          sessions_per_week?: number | null
          training_environment?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workout_template_exercises: {
        Row: {
          created_at: string | null
          exercise_id: number
          id: number
          is_active: number | null
          next_target_weight_kg: number | null
          order_index: number
          superset_group: string | null
          superset_rest_seconds: number | null
          target_difficulty_note: string | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_rest_seconds: number | null
          target_rpe: number | null
          target_sets: number | null
          target_time_seconds: number | null
          target_weight_kg: number | null
          workout_template_id: number
        }
        Insert: {
          created_at?: string | null
          exercise_id: number
          id?: number
          is_active?: number | null
          next_target_weight_kg?: number | null
          order_index?: number
          superset_group?: string | null
          superset_rest_seconds?: number | null
          target_difficulty_note?: string | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rest_seconds?: number | null
          target_rpe?: number | null
          target_sets?: number | null
          target_time_seconds?: number | null
          target_weight_kg?: number | null
          workout_template_id: number
        }
        Update: {
          created_at?: string | null
          exercise_id?: number
          id?: number
          is_active?: number | null
          next_target_weight_kg?: number | null
          order_index?: number
          superset_group?: string | null
          superset_rest_seconds?: number | null
          target_difficulty_note?: string | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rest_seconds?: number | null
          target_rpe?: number | null
          target_sets?: number | null
          target_time_seconds?: number | null
          target_weight_kg?: number | null
          workout_template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_template_exercises_workout_template_id_fkey"
            columns: ["workout_template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string | null
          goal: string | null
          id: number
          name: string
          notes: string | null
          recurring_days: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          goal?: string | null
          id?: number
          name: string
          notes?: string | null
          recurring_days?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          goal?: string | null
          id?: number
          name?: string
          notes?: string | null
          recurring_days?: Json | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_encryption_key: { Args: never; Returns: string }
      get_user_api_key: {
        Args: { _user_id: string }
        Returns: {
          api_key: string
          base_url: string
          model_name: string
          user_needs: string
          user_role: string
        }[]
      }
      set_user_api_key: {
        Args: {
          _api_key: string
          _base_url?: string
          _model_name?: string
          _user_id: string
          _user_needs?: string
          _user_role?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
