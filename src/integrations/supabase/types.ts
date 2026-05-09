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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_sends: {
        Row: {
          body: string
          error: string | null
          gmail_message_id: string | null
          id: string
          lead_id: string | null
          recipient: string
          sent_at: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          lead_id?: string | null
          recipient: string
          sent_at?: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          lead_id?: string | null
          recipient?: string
          sent_at?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          error: string | null
          gmail_message_id: string | null
          id: string
          lead_id: string | null
          recipient: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["follow_up_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          lead_id?: string | null
          recipient: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          lead_id?: string | null
          recipient?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["follow_up_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_emails: {
        Row: {
          body: string
          created_at: string
          id: string
          lead_id: string | null
          subject: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lead_id?: string | null
          subject: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          subject?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_posters: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          prompt: string
          storage_path: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          prompt: string
          storage_path: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          prompt?: string
          storage_path?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_posters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "poster_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          branding: Json | null
          business_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          notes: string | null
          poster_url: string | null
          raw_extraction: Json | null
          services: string[] | null
          social_links: Json | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          branding?: Json | null
          business_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          poster_url?: string | null
          raw_extraction?: Json | null
          services?: string[] | null
          social_links?: Json | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          branding?: Json | null
          business_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          poster_url?: string | null
          raw_extraction?: Json | null
          services?: string[] | null
          social_links?: Json | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      poster_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          prompt_template: string
          source_path: string | null
          style_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          prompt_template: string
          source_path?: string | null
          style_json?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          prompt_template?: string
          source_path?: string | null
          style_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agency_email: string | null
          agency_name: string | null
          agency_phone: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_email?: string | null
          agency_name?: string | null
          agency_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_email?: string | null
          agency_name?: string | null
          agency_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      follow_up_status: "pending" | "sent" | "failed" | "cancelled"
      lead_status:
        | "new"
        | "sent"
        | "replied"
        | "interested"
        | "follow_up"
        | "closed"
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
    Enums: {
      follow_up_status: ["pending", "sent", "failed", "cancelled"],
      lead_status: [
        "new",
        "sent",
        "replied",
        "interested",
        "follow_up",
        "closed",
      ],
    },
  },
} as const
