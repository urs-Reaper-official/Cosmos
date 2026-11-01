export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      conversations: Table<
        { id: string; user_id: string; title: string; created_at: string; updated_at: string },
        { id?: string; user_id: string; title: string; created_at?: string; updated_at?: string },
        { title?: string; updated_at?: string }
      >;
      messages: Table<
        {
          id: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "assistant";
          content: string;
          created_at: string;
        },
        {
          id?: string;
          conversation_id: string;
          user_id: string;
          role: "user" | "assistant";
          content: string;
          created_at?: string;
        },
        { content?: string }
      >;
      cosmos_memories: Table<
        { id: string; user_id: string; content: string; created_at: string },
        { id?: string; user_id: string; content: string; created_at?: string },
        { content?: string }
      >;
      cosmos_preferences: Table<
        {
          user_id: string;
          memory_enabled: boolean;
          preferred_model: string | null;
          calculator_enabled: boolean;
          provider_id: string;
          fallback_provider: string | null;
          fallback_model: string | null;
          temperature: number;
          max_output_tokens: number;
          system_instructions: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          memory_enabled?: boolean;
          preferred_model?: string | null;
          calculator_enabled?: boolean;
          provider_id?: string;
          fallback_provider?: string | null;
          fallback_model?: string | null;
          temperature?: number;
          max_output_tokens?: number;
          system_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          memory_enabled?: boolean;
          preferred_model?: string | null;
          calculator_enabled?: boolean;
          provider_id?: string;
          fallback_provider?: string | null;
          fallback_model?: string | null;
          temperature?: number;
          max_output_tokens?: number;
          system_instructions?: string | null;
          updated_at?: string;
        }
      >;
      cosmos_usage: Table<
        {
          id: string;
          user_id: string;
          conversation_id: string;
          provider_id: string;
          model_id: string;
          fallback_used: boolean;
          usage_estimated: boolean;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          conversation_id: string;
          provider_id: string;
          model_id: string;
          fallback_used?: boolean;
          usage_estimated?: boolean;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          created_at?: string;
        },
        Record<string, never>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
