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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          created_at: string
          description_en: string | null
          description_es: string | null
          icon: string
          id: string
          key: string
          points: number
          title_en: string
          title_es: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          icon?: string
          id?: string
          key: string
          points?: number
          title_en: string
          title_es?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description_en?: string | null
          description_es?: string | null
          icon?: string
          id?: string
          key?: string
          points?: number
          title_en?: string
          title_es?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          category: Database["public"]["Enums"]["asset_category"]
          created_at: string
          current_property_id: string | null
          description: string | null
          id: string
          last_serviced_at: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          photo_url: string | null
          purchase_date: string | null
          purchase_value: number | null
          qr_code_id: string | null
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["asset_category"]
          created_at?: string
          current_property_id?: string | null
          description?: string | null
          id?: string
          last_serviced_at?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          qr_code_id?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["asset_category"]
          created_at?: string
          current_property_id?: string | null
          description?: string | null
          id?: string
          last_serviced_at?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          qr_code_id?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_current_property_id_fkey"
            columns: ["current_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assigned_staff_ids: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          event_type: string
          id: string
          is_private: boolean
          keywords: string[] | null
          location: string | null
          notes: string | null
          property_id: string | null
          start_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_staff_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          id?: string
          is_private?: boolean
          keywords?: string[] | null
          location?: string | null
          notes?: string | null
          property_id?: string | null
          start_date: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_staff_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          id?: string
          is_private?: boolean
          keywords?: string[] | null
          location?: string | null
          notes?: string | null
          property_id?: string | null
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          participant_ids: string[] | null
          property_id: string | null
          title: string | null
          type: Database["public"]["Enums"]["thread_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          participant_ids?: string[] | null
          property_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["thread_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          participant_ids?: string[] | null
          property_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["thread_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          property_id: string | null
          session_date: string
          template_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          property_id?: string | null
          session_date?: string
          template_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          property_id?: string | null
          session_date?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_comments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_comments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          color: string
          container: string | null
          created_at: string
          icon: string
          id: string
          is_required: boolean
          notes: string | null
          photo_url: string | null
          sort_order: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          color?: string
          container?: string | null
          created_at?: string
          icon?: string
          id?: string
          is_required?: boolean
          notes?: string | null
          photo_url?: string | null
          sort_order?: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          color?: string
          container?: string | null
          created_at?: string
          icon?: string
          id?: string
          is_required?: boolean
          notes?: string | null
          photo_url?: string | null
          sort_order?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_sessions: {
        Row: {
          completed_at: string
          completed_by: string
          id: string
          item_id: string
          property_id: string | null
          session_date: string
          template_id: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          id?: string
          item_id: string
          property_id?: string | null
          session_date?: string
          template_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          id?: string
          item_id?: string
          property_id?: string | null
          session_date?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_sessions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_sessions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          assigned_department: string | null
          assigned_role: string | null
          category: string
          color: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          icon: string
          id: string
          is_published: boolean
          is_universal: boolean
          location: string | null
          manual_link_label: string | null
          manual_link_url: string | null
          notify_on_day: boolean | null
          only_when_occupied: boolean
          products: Json | null
          property_id: string | null
          recurrence: string | null
          recurrence_day: number | null
          sort_order: number
          subcategory: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_department?: string | null
          assigned_role?: string | null
          category?: string
          color?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string
          id?: string
          is_published?: boolean
          is_universal?: boolean
          location?: string | null
          manual_link_label?: string | null
          manual_link_url?: string | null
          notify_on_day?: boolean | null
          only_when_occupied?: boolean
          products?: Json | null
          property_id?: string | null
          recurrence?: string | null
          recurrence_day?: number | null
          sort_order?: number
          subcategory?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_department?: string | null
          assigned_role?: string | null
          category?: string
          color?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          icon?: string
          id?: string
          is_published?: boolean
          is_universal?: boolean
          location?: string | null
          manual_link_label?: string | null
          manual_link_url?: string | null
          notify_on_day?: boolean | null
          only_when_occupied?: boolean
          products?: Json | null
          property_id?: string | null
          recurrence?: string | null
          recurrence_day?: number | null
          sort_order?: number
          subcategory?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      job_title_suggestions: {
        Row: {
          created_at: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      manuals: {
        Row: {
          category: string
          content_en: string | null
          content_es: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          is_universal: boolean
          property_id: string | null
          title_en: string
          title_es: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          content_en?: string | null
          content_es?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          is_universal?: boolean
          property_id?: string | null
          title_en: string
          title_es?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          content_en?: string | null
          content_es?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          is_universal?: boolean
          property_id?: string | null
          title_en?: string
          title_es?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content_media_url: string | null
          content_text: string | null
          created_at: string
          delivery_status: string
          id: string
          is_ai_generated: boolean
          media_type: string | null
          reactions: Json | null
          reply_to_id: string | null
          seen_by: string[] | null
          sender_id: string | null
          thread_id: string
        }
        Insert: {
          content_media_url?: string | null
          content_text?: string | null
          created_at?: string
          delivery_status?: string
          id?: string
          is_ai_generated?: boolean
          media_type?: string | null
          reactions?: Json | null
          reply_to_id?: string | null
          seen_by?: string[] | null
          sender_id?: string | null
          thread_id: string
        }
        Update: {
          content_media_url?: string | null
          content_text?: string | null
          created_at?: string
          delivery_status?: string
          id?: string
          is_ai_generated?: boolean
          media_type?: string | null
          reactions?: Json | null
          reply_to_id?: string | null
          seen_by?: string[] | null
          sender_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          acknowledged_by: string[]
          action_url: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          property_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          acknowledged_by?: string[]
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          property_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          acknowledged_by?: string[]
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          property_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assigned_property_ids: string[] | null
          avatar_url: string | null
          birthday: string | null
          created_at: string
          department: string | null
          full_name: string | null
          id: string
          job_title: string | null
          language_pref: Database["public"]["Enums"]["language_pref"]
          level: string | null
          notes: string | null
          phone: string | null
          section_permissions: Json | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          assigned_property_ids?: string[] | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          department?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          language_pref?: Database["public"]["Enums"]["language_pref"]
          level?: string | null
          notes?: string | null
          phone?: string | null
          section_permissions?: Json | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          assigned_property_ids?: string[] | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          department?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          language_pref?: Database["public"]["Enums"]["language_pref"]
          level?: string | null
          notes?: string | null
          phone?: string | null
          section_permissions?: Json | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          city: string | null
          country: string | null
          created_at: string
          id: string
          image_url: string | null
          is_primary: boolean
          name: string
          occupied_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["property_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_primary?: boolean
          name: string
          occupied_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["property_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_primary?: boolean
          name?: string
          occupied_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["property_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_rules: {
        Row: {
          applies_to_roles: string[]
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          enacted_event_types: string[]
          enacted_keywords: string[]
          icon: string
          id: string
          is_active: boolean
          is_universal: boolean
          only_when_occupied: boolean
          property_id: string | null
          rejection_reason: string | null
          status: string
          submitted_by: string | null
          submitted_source: string
          title: string
          updated_at: string
          visible_to_user_ids: string[]
        }
        Insert: {
          applies_to_roles?: string[]
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enacted_event_types?: string[]
          enacted_keywords?: string[]
          icon?: string
          id?: string
          is_active?: boolean
          is_universal?: boolean
          only_when_occupied?: boolean
          property_id?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_by?: string | null
          submitted_source?: string
          title: string
          updated_at?: string
          visible_to_user_ids?: string[]
        }
        Update: {
          applies_to_roles?: string[]
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enacted_event_types?: string[]
          enacted_keywords?: string[]
          icon?: string
          id?: string
          is_active?: boolean
          is_universal?: boolean
          only_when_occupied?: boolean
          property_id?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_by?: string | null
          submitted_source?: string
          title?: string
          updated_at?: string
          visible_to_user_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "property_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ronin_memories: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          importance: number
          last_referenced_at: string | null
          property_id: string | null
          reference_count: number
          source: string
          subject_user_id: string | null
          summary: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          importance?: number
          last_referenced_at?: string | null
          property_id?: string | null
          reference_count?: number
          source?: string
          subject_user_id?: string | null
          summary: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          importance?: number
          last_referenced_at?: string | null
          property_id?: string | null
          reference_count?: number
          source?: string
          subject_user_id?: string | null
          summary?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ronin_memories_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          ai_response: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          payload: Json | null
          processed_by_ai: boolean
          property_id: string | null
          triggered_by: string | null
        }
        Insert: {
          ai_response?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed_by_ai?: boolean
          property_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          ai_response?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed_by_ai?: boolean
          property_id?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          ai_suggested: boolean
          assigned_department: string | null
          assigned_role: string | null
          assigned_to: string | null
          attachments: Json
          category: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description_en: string | null
          description_es: string | null
          due_date: string | null
          id: string
          is_draft: boolean
          linked_checklist_id: string | null
          linked_inventory_ids: string[]
          photo_url: string | null
          priority: number
          property_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title_en: string
          title_es: string | null
          updated_at: string
          voice_note_url: string | null
        }
        Insert: {
          ai_suggested?: boolean
          assigned_department?: string | null
          assigned_role?: string | null
          assigned_to?: string | null
          attachments?: Json
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description_en?: string | null
          description_es?: string | null
          due_date?: string | null
          id?: string
          is_draft?: boolean
          linked_checklist_id?: string | null
          linked_inventory_ids?: string[]
          photo_url?: string | null
          priority?: number
          property_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title_en: string
          title_es?: string | null
          updated_at?: string
          voice_note_url?: string | null
        }
        Update: {
          ai_suggested?: boolean
          assigned_department?: string | null
          assigned_role?: string | null
          assigned_to?: string | null
          attachments?: Json
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description_en?: string | null
          description_es?: string | null
          due_date?: string | null
          id?: string
          is_draft?: boolean
          linked_checklist_id?: string | null
          linked_inventory_ids?: string[]
          photo_url?: string | null
          priority?: number
          property_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title_en?: string
          title_es?: string | null
          updated_at?: string
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_linked_checklist_id_fkey"
            columns: ["linked_checklist_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          is_online: boolean
          last_seen_at: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          last_seen_at?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          badges_earned: string[] | null
          created_at: string
          current_streak: number
          id: string
          last_activity_date: string | null
          longest_streak: number
          points_total: number
          tasks_completed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          badges_earned?: string[] | null
          created_at?: string
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          points_total?: number
          tasks_completed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          badges_earned?: string[] | null
          created_at?: string
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          points_total?: number
          tasks_completed?: number
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
      acknowledge_notification: {
        Args: { _notif_id: string }
        Returns: undefined
      }
      can_user_see_checklist: {
        Args: {
          _template_assigned_dept: string
          _template_assigned_role: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_ronin_overdue_tasks: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "master_admin" | "admin" | "manager" | "staff" | "principal"
      asset_category:
        | "vehicle"
        | "appliance"
        | "art"
        | "tech"
        | "furniture"
        | "other"
      language_pref: "en" | "es"
      property_status:
        | "occupied"
        | "vacant"
        | "maintenance"
        | "under_construction"
      task_status: "pending" | "in_progress" | "completed" | "urgent"
      thread_type: "private" | "group" | "system_ai" | "property"
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
      app_role: ["master_admin", "admin", "manager", "staff", "principal"],
      asset_category: [
        "vehicle",
        "appliance",
        "art",
        "tech",
        "furniture",
        "other",
      ],
      language_pref: ["en", "es"],
      property_status: [
        "occupied",
        "vacant",
        "maintenance",
        "under_construction",
      ],
      task_status: ["pending", "in_progress", "completed", "urgent"],
      thread_type: ["private", "group", "system_ai", "property"],
    },
  },
} as const
