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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ai_monthly_usage: {
        Row: {
          created_at: string
          id: number
          model: string | null
          month: string
          month_start: string | null
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          model?: string | null
          month: string
          month_start?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          model?: string | null
          month?: string
          month_start?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
          window_seconds: number
          window_start: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_seconds: number
          window_start: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_seconds?: number
          window_start?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          badge_type: string
          created_at: string
          description: string | null
          emoji: string
          id: string
          label: string
          level: number
          metadata: Json | null
        }
        Insert: {
          badge_type: string
          created_at?: string
          description?: string | null
          emoji: string
          id?: string
          label: string
          level: number
          metadata?: Json | null
        }
        Update: {
          badge_type?: string
          created_at?: string
          description?: string | null
          emoji?: string
          id?: string
          label?: string
          level?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      campaign_goals: {
        Row: {
          campaign_id: string
          created_at: string
          goal_id: string
          id: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          goal_id: string
          id?: string
          position: number
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_goals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_write"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "skill_goals"
            referencedColumns: ["goal_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          name: string
          position: number | null
          primary_circle_id: string | null
          primary_monument_id: string | null
          priority_code: string
          priority_order: number | null
          roadmap_id: string | null
          scheduling_state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          name: string
          position?: number | null
          primary_circle_id?: string | null
          primary_monument_id?: string | null
          priority_code?: string
          priority_order?: number | null
          roadmap_id?: string | null
          scheduling_state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          name?: string
          position?: number | null
          primary_circle_id?: string | null
          primary_monument_id?: string | null
          priority_code?: string
          priority_order?: number | null
          roadmap_id?: string | null
          scheduling_state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_primary_circle_id_fkey"
            columns: ["primary_circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_primary_monument_id_fkey"
            columns: ["primary_monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_primary_monument_id_fkey"
            columns: ["primary_monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
          {
            foreignKeyName: "campaigns_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      cats: {
        Row: {
          color_hex: string | null
          created_at: string
          icon: string | null
          id: string
          is_default: boolean
          is_locked: boolean
          name: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          is_locked?: boolean
          name: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          is_locked?: boolean
          name?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      circle_members: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          invited_by_user_id: string | null
          location_context_ids: string[]
          role: string
          skill_constraint_ids: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          invited_by_user_id?: string | null
          location_context_ids?: string[]
          role?: string
          skill_constraint_ids?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          invited_by_user_id?: string | null
          location_context_ids?: string[]
          role?: string
          skill_constraint_ids?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          circle_type: string
          created_at: string
          description: string | null
          icon_emoji: string | null
          id: string
          name: string
          owner_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          circle_type?: string
          created_at?: string
          description?: string | null
          icon_emoji?: string | null
          id?: string
          name: string
          owner_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          circle_type?: string
          created_at?: string
          description?: string | null
          icon_emoji?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      command_block_rules: {
        Row: {
          circle_id: string
          created_at: string
          days_of_week: string[]
          end_local: string | null
          ends_on: string | null
          id: string
          member_id: string | null
          mode: string
          offer_id: string | null
          required_minutes_per_day: number | null
          required_minutes_per_week: number | null
          start_local: string | null
          starts_on: string
          status: string
          terms: Json
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          days_of_week?: string[]
          end_local?: string | null
          ends_on?: string | null
          id?: string
          member_id?: string | null
          mode?: string
          offer_id?: string | null
          required_minutes_per_day?: number | null
          required_minutes_per_week?: number | null
          start_local?: string | null
          starts_on: string
          status?: string
          terms?: Json
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          days_of_week?: string[]
          end_local?: string | null
          ends_on?: string | null
          id?: string
          member_id?: string | null
          mode?: string
          offer_id?: string | null
          required_minutes_per_day?: number | null
          required_minutes_per_week?: number | null
          start_local?: string | null
          starts_on?: string
          status?: string
          terms?: Json
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_block_rules_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_block_rules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "circle_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_block_rules_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      command_blocks: {
        Row: {
          circle_id: string
          created_at: string
          ends_at: string
          id: string
          member_id: string | null
          offer_id: string | null
          starts_at: string
          status: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          ends_at: string
          id?: string
          member_id?: string | null
          offer_id?: string | null
          starts_at: string
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          member_id?: string | null
          offer_id?: string | null
          starts_at?: string
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_blocks_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_blocks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "circle_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_blocks_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      completion_events: {
        Row: {
          completed_at: string
          completion_key: string
          created_at: string
          duration_min: number | null
          id: string
          productivity_day_key: string | null
          revoked_at: string | null
          schedule_instance_id: string | null
          source_id: string
          source_type: string
          time_zone: string | null
          updated_at: string
          user_id: string
          was_scheduled: boolean
        }
        Insert: {
          completed_at: string
          completion_key: string
          created_at?: string
          duration_min?: number | null
          id?: string
          productivity_day_key?: string | null
          revoked_at?: string | null
          schedule_instance_id?: string | null
          source_id: string
          source_type: string
          time_zone?: string | null
          updated_at?: string
          user_id: string
          was_scheduled?: boolean
        }
        Update: {
          completed_at?: string
          completion_key?: string
          created_at?: string
          duration_min?: number | null
          id?: string
          productivity_day_key?: string | null
          revoked_at?: string | null
          schedule_instance_id?: string | null
          source_id?: string
          source_type?: string
          time_zone?: string | null
          updated_at?: string
          user_id?: string
          was_scheduled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "completion_events_schedule_instance_id_fkey"
            columns: ["schedule_instance_id"]
            isOneToOne: false
            referencedRelation: "schedule_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_pomo_runs: {
        Row: {
          active_item_key: string | null
          created_at: string
          current_index: number
          ends_at: string | null
          id: string
          last_action_at: string | null
          mode: "pomo" | "stopwatch"
          queue_items: Json
          session_id: string
          started_at: string | null
          status: "running" | "completed" | "canceled"
          updated_at: string
          used_action_ids: string[]
          user_id: string
        }
        Insert: {
          active_item_key?: string | null
          created_at?: string
          current_index?: number
          ends_at?: string | null
          id?: string
          last_action_at?: string | null
          mode: "pomo" | "stopwatch"
          queue_items?: Json
          session_id: string
          started_at?: string | null
          status?: "running" | "completed" | "canceled"
          updated_at?: string
          used_action_ids?: string[]
          user_id: string
        }
        Update: {
          active_item_key?: string | null
          created_at?: string
          current_index?: number
          ends_at?: string | null
          id?: string
          last_action_at?: string | null
          mode?: "pomo" | "stopwatch"
          queue_items?: Json
          session_id?: string
          started_at?: string | null
          status?: "running" | "completed" | "canceled"
          updated_at?: string
          used_action_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      content_cards: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          position: number
          size: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          position?: number
          size?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          position?: number
          size?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_schedule_analytics_observed_instances: {
        Row: {
          day_end_utc: string
          day_key: string
          day_start_utc: string
          day_type_time_block_id: string | null
          duration_min: number | null
          first_observed_at: string
          id: string
          last_observed_at: string
          observation_count: number
          observed_status: string | null
          schedule_instance_id: string
          scheduled_end_utc: string | null
          scheduled_start_utc: string | null
          source_id: string | null
          source_type: string
          time_block_id: string | null
          timezone: string
          user_id: string
          window_id: string | null
        }
        Insert: {
          day_end_utc: string
          day_key: string
          day_start_utc: string
          day_type_time_block_id?: string | null
          duration_min?: number | null
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          observation_count?: number
          observed_status?: string | null
          schedule_instance_id: string
          scheduled_end_utc?: string | null
          scheduled_start_utc?: string | null
          source_id?: string | null
          source_type: string
          time_block_id?: string | null
          timezone: string
          user_id: string
          window_id?: string | null
        }
        Update: {
          day_end_utc?: string
          day_key?: string
          day_start_utc?: string
          day_type_time_block_id?: string | null
          duration_min?: number | null
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          observation_count?: number
          observed_status?: string | null
          schedule_instance_id?: string
          scheduled_end_utc?: string | null
          scheduled_start_utc?: string | null
          source_id?: string | null
          source_type?: string
          time_block_id?: string | null
          timezone?: string
          user_id?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_schedule_analytics_observed_ins_schedule_instance_id_fkey"
            columns: ["schedule_instance_id"]
            isOneToOne: false
            referencedRelation: "schedule_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      dark_xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          new_skill_level: number
          skill_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          new_skill_level: number
          skill_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          new_skill_level?: number
          skill_id?: string
          user_id?: string
        }
        Relationships: []
      }
      day_type_assignments: {
        Row: {
          created_at: string
          date_key: string
          day_type_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_key: string
          day_type_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_key?: string
          day_type_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_type_assignments_day_type_id_fkey"
            columns: ["day_type_id"]
            isOneToOne: false
            referencedRelation: "day_types"
            referencedColumns: ["id"]
          },
        ]
      }
      day_type_time_block_allowed_habit_types: {
        Row: {
          created_at: string
          day_type_time_block_id: string
          habit_type: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_type_time_block_id: string
          habit_type: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_type_time_block_id?: string
          habit_type?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_type_time_block_allowed_habit_t_day_type_time_block_id_fkey"
            columns: ["day_type_time_block_id"]
            isOneToOne: false
            referencedRelation: "day_type_time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      day_type_time_block_allowed_monuments: {
        Row: {
          created_at: string
          day_type_time_block_id: string
          id: string
          monument_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_type_time_block_id: string
          id?: string
          monument_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_type_time_block_id?: string
          id?: string
          monument_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_type_time_block_allowed_monumen_day_type_time_block_id_fkey"
            columns: ["day_type_time_block_id"]
            isOneToOne: false
            referencedRelation: "day_type_time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      day_type_time_block_allowed_skills: {
        Row: {
          created_at: string
          day_type_time_block_id: string
          id: string
          skill_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_type_time_block_id: string
          id?: string
          skill_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_type_time_block_id?: string
          id?: string
          skill_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_type_time_block_allowed_skills_day_type_time_block_id_fkey"
            columns: ["day_type_time_block_id"]
            isOneToOne: false
            referencedRelation: "day_type_time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      day_type_time_blocks: {
        Row: {
          allow_all_habit_types: boolean
          allow_all_monuments: boolean
          allow_all_skills: boolean
          block_type: string
          created_at: string
          day_type_id: string
          energy: string
          id: string
          location_context_id: string | null
          position: number
          time_block_id: string
          time_block_label: string | null
          user_id: string
        }
        Insert: {
          allow_all_habit_types?: boolean
          allow_all_monuments?: boolean
          allow_all_skills?: boolean
          block_type?: string
          created_at?: string
          day_type_id: string
          energy?: string
          id?: string
          location_context_id?: string | null
          position?: number
          time_block_id: string
          time_block_label?: string | null
          user_id: string
        }
        Update: {
          allow_all_habit_types?: boolean
          allow_all_monuments?: boolean
          allow_all_skills?: boolean
          block_type?: string
          created_at?: string
          day_type_id?: string
          energy?: string
          id?: string
          location_context_id?: string | null
          position?: number
          time_block_id?: string
          time_block_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_type_time_blocks_day_type_id_fkey"
            columns: ["day_type_id"]
            isOneToOne: false
            referencedRelation: "day_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_type_time_blocks_location_context_id_fkey"
            columns: ["location_context_id"]
            isOneToOne: false
            referencedRelation: "location_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_type_time_blocks_time_block_id_fkey"
            columns: ["time_block_id"]
            isOneToOne: false
            referencedRelation: "time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      day_types: {
        Row: {
          created_at: string
          days: number[]
          id: string
          is_default: boolean
          is_temporary: boolean
          name: string
          scheduler_mode: string
          temporary_date_key: string | null
          temporary_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days?: number[]
          id?: string
          is_default?: boolean
          is_temporary?: boolean
          name: string
          scheduler_mode?: string
          temporary_date_key?: string | null
          temporary_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number[]
          id?: string
          is_default?: boolean
          is_temporary?: boolean
          name?: string
          scheduler_mode?: string
          temporary_date_key?: string | null
          temporary_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      energy: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      event_tags: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          blocks_time: string
          created_at: string
          end_at: string
          end_date: string | null
          id: string
          kind: string
          location_address: string | null
          location_name: string | null
          meeting_provider: string | null
          meeting_url: string | null
          notes: string | null
          notification_timing: string
          recurrence: string
          start_at: string
          start_date: string | null
          timezone: string | null
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          all_day?: boolean
          blocks_time?: string
          created_at?: string
          end_at: string
          end_date?: string | null
          id?: string
          kind?: string
          location_address?: string | null
          location_name?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          notes?: string | null
          notification_timing?: string
          recurrence?: string
          start_at: string
          start_date?: string | null
          timezone?: string | null
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          all_day?: boolean
          blocks_time?: string
          created_at?: string
          end_at?: string
          end_date?: string | null
          id?: string
          kind?: string
          location_address?: string | null
          location_name?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          notes?: string | null
          notification_timing?: string
          recurrence?: string
          start_at?: string
          start_date?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          barcode: string | null
          brand_name: string | null
          calories: number | null
          carbs_g: number | null
          created_at: string
          created_by_user_id: string | null
          dedupe_key: string | null
          external_id: string | null
          external_source: string | null
          fat_g: number | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          normalized_barcode: string | null
          normalized_brand_name: string | null
          normalized_name: string
          protein_g: number | null
          serving_grams: number | null
          serving_size: number | null
          serving_unit: string | null
          source: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_name?: string | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          created_by_user_id?: string | null
          dedupe_key?: string | null
          external_id?: string | null
          external_source?: string | null
          fat_g?: number | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          normalized_barcode?: string | null
          normalized_brand_name?: string | null
          normalized_name: string
          protein_g?: number | null
          serving_grams?: number | null
          serving_size?: number | null
          serving_unit?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_name?: string | null
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          created_by_user_id?: string | null
          dedupe_key?: string | null
          external_id?: string | null
          external_source?: string | null
          fat_g?: number | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          normalized_barcode?: string | null
          normalized_brand_name?: string | null
          normalized_name?: string
          protein_g?: number | null
          serving_grams?: number | null
          serving_size?: number | null
          serving_unit?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      friend_connections: {
        Row: {
          created_at: string
          friend_avatar_url: string | null
          friend_display_name: string | null
          friend_profile_url: string | null
          friend_user_id: string | null
          friend_username: string
          has_ring: boolean
          id: string
          is_online: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_avatar_url?: string | null
          friend_display_name?: string | null
          friend_profile_url?: string | null
          friend_user_id?: string | null
          friend_username: string
          has_ring?: boolean
          id?: string
          is_online?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_avatar_url?: string | null
          friend_display_name?: string | null
          friend_profile_url?: string | null
          friend_user_id?: string | null
          friend_username?: string
          has_ring?: boolean
          id?: string
          is_online?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friend_contact_imports: {
        Row: {
          id: string
          imported_at: string
          total_contacts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          imported_at?: string
          total_contacts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          imported_at?: string
          total_contacts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friend_discovery_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          highlight: string | null
          id: string
          mutual_friends: number
          reason: string | null
          role: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          highlight?: string | null
          id?: string
          mutual_friends?: number
          reason?: string | null
          role?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          highlight?: string | null
          id?: string
          mutual_friends?: number
          reason?: string | null
          role?: string | null
          username?: string
        }
        Relationships: []
      }
      friend_invites: {
        Row: {
          cancelled_at: string | null
          created_at: string
          email: string
          id: string
          last_sent_at: string
          responded_at: string | null
          sent_at: string
          sent_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          email: string
          id?: string
          last_sent_at?: string
          responded_at?: string | null
          sent_at?: string
          sent_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          email?: string
          id?: string
          last_sent_at?: string
          responded_at?: string | null
          sent_at?: string
          sent_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friend_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          mutual_friends: number
          note: string | null
          requester_avatar_url: string | null
          requester_display_name: string | null
          requester_id: string
          requester_username: string
          responded_at: string | null
          status: string
          target_avatar_url: string | null
          target_display_name: string | null
          target_id: string
          target_username: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mutual_friends?: number
          note?: string | null
          requester_avatar_url?: string | null
          requester_display_name?: string | null
          requester_id: string
          requester_username: string
          responded_at?: string | null
          status?: string
          target_avatar_url?: string | null
          target_display_name?: string | null
          target_id: string
          target_username: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mutual_friends?: number
          note?: string | null
          requester_avatar_url?: string | null
          requester_display_name?: string | null
          requester_id?: string
          requester_username?: string
          responded_at?: string | null
          status?: string
          target_avatar_url?: string | null
          target_display_name?: string | null
          target_id?: string
          target_username?: string
          updated_at?: string
        }
        Relationships: []
      }
      global_skill_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      global_skill_subcategories: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_skill_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "global_skill_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      global_skills: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          feature_key: string | null
          icon: string
          id: string
          is_active: boolean
          is_popular: boolean
          metadata: Json
          name: string
          popular_order: number | null
          slug: string
          sort_order: number
          subcategory_id: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          feature_key?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_popular?: boolean
          metadata?: Json
          name: string
          popular_order?: number | null
          slug: string
          sort_order?: number
          subcategory_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          feature_key?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_popular?: boolean
          metadata?: Json
          name?: string
          popular_order?: number | null
          slug?: string
          sort_order?: number
          subcategory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_skills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "global_skill_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_skills_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "global_skill_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_stage: {
        Row: {
          id: number
          name: string | null
          order_index: number | null
        }
        Insert: {
          id?: number
          name?: string | null
          order_index?: number | null
        }
        Update: {
          id?: number
          name?: string | null
          order_index?: number | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          active: boolean | null
          circle_id: string | null
          created_at: string | null
          due_date: string | null
          emoji: string | null
          energy: Database["public"]["Enums"]["energy_enum"]
          energy_code: string | null
          energy_enum: Database["public"]["Enums"]["energy_enum"]
          global_rank: number | null
          id: string
          monument_id: string | null
          name: string
          priority: Database["public"]["Enums"]["priority_enum"]
          priority_code: string | null
          priority_enum: Database["public"]["Enums"]["priority_enum"]
          priority_order: number | null
          priority_rank: number | null
          roadmap_id: string | null
          status: string | null
          updated_at: string
          user_id: string
          weight: number
          weight_boost: number
          why: string | null
        }
        Insert: {
          active?: boolean | null
          circle_id?: string | null
          created_at?: string | null
          due_date?: string | null
          emoji?: string | null
          energy: Database["public"]["Enums"]["energy_enum"]
          energy_code?: string | null
          energy_enum?: Database["public"]["Enums"]["energy_enum"]
          global_rank?: number | null
          id?: string
          monument_id?: string | null
          name: string
          priority: Database["public"]["Enums"]["priority_enum"]
          priority_code?: string | null
          priority_enum?: Database["public"]["Enums"]["priority_enum"]
          priority_order?: number | null
          priority_rank?: number | null
          roadmap_id?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          weight?: number
          weight_boost?: number
          why?: string | null
        }
        Update: {
          active?: boolean | null
          circle_id?: string | null
          created_at?: string | null
          due_date?: string | null
          emoji?: string | null
          energy?: Database["public"]["Enums"]["energy_enum"]
          energy_code?: string | null
          energy_enum?: Database["public"]["Enums"]["energy_enum"]
          global_rank?: number | null
          id?: string
          monument_id?: string | null
          name?: string
          priority?: Database["public"]["Enums"]["priority_enum"]
          priority_code?: string | null
          priority_enum?: Database["public"]["Enums"]["priority_enum"]
          priority_order?: number | null
          priority_rank?: number | null
          roadmap_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          weight?: number
          weight_boost?: number
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
          {
            foreignKeyName: "goals_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_completion_days: {
        Row: {
          completed_at: string
          completion_day: string
          habit_id: string
          id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          completion_day: string
          habit_id: string
          id?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          completion_day?: string
          habit_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_completion_days_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_routines: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_types: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: number
          name?: string | null
        }
        Update: {
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      habits: {
        Row: {
          anchor_start_date: string | null
          anchor_type:
            | Database["public"]["Enums"]["habit_anchor_type_enum"]
            | null
          anchor_value: string | null
          circle_id: string | null
          completion_target: number | null
          created_at: string | null
          current_streak_days: number
          daylight_preference: string | null
          description: string | null
          duration_minutes: number | null
          energy: Database["public"]["Enums"]["energy_enum"]
          fixed_end_local: string | null
          fixed_start_local: string | null
          fixed_timezone: string | null
          global_order: number | null
          goal_id: string | null
          habit_type: Database["public"]["Enums"]["habit_type_enum"]
          id: string
          last_completed_at: string | null
          location_context_id: string | null
          longest_streak_days: number
          memo_capture_config: Json | null
          name: string
          next_due_override: string | null
          recurrence: Database["public"]["Enums"]["recurrence_enum"]
          recurrence_days: number[] | null
          recurrence_mode: Database["public"]["Enums"]["habit_recurrence_mode_enum"]
          routine_id: string | null
          routine_position: number | null
          skill_id: string | null
          type: Database["public"]["Enums"]["habit_type_enum"]
          updated_at: string
          user_id: string
          window_edge_preference: string | null
          window_id: string | null
        }
        Insert: {
          anchor_start_date?: string | null
          anchor_type?:
            | Database["public"]["Enums"]["habit_anchor_type_enum"]
            | null
          anchor_value?: string | null
          circle_id?: string | null
          completion_target?: number | null
          created_at?: string | null
          current_streak_days?: number
          daylight_preference?: string | null
          description?: string | null
          duration_minutes?: number | null
          energy?: Database["public"]["Enums"]["energy_enum"]
          fixed_end_local?: string | null
          fixed_start_local?: string | null
          fixed_timezone?: string | null
          global_order?: number | null
          goal_id?: string | null
          habit_type?: Database["public"]["Enums"]["habit_type_enum"]
          id?: string
          last_completed_at?: string | null
          location_context_id?: string | null
          longest_streak_days?: number
          memo_capture_config?: Json | null
          name: string
          next_due_override?: string | null
          recurrence: Database["public"]["Enums"]["recurrence_enum"]
          recurrence_days?: number[] | null
          recurrence_mode?: Database["public"]["Enums"]["habit_recurrence_mode_enum"]
          routine_id?: string | null
          routine_position?: number | null
          skill_id?: string | null
          type: Database["public"]["Enums"]["habit_type_enum"]
          updated_at?: string
          user_id: string
          window_edge_preference?: string | null
          window_id?: string | null
        }
        Update: {
          anchor_start_date?: string | null
          anchor_type?:
            | Database["public"]["Enums"]["habit_anchor_type_enum"]
            | null
          anchor_value?: string | null
          circle_id?: string | null
          completion_target?: number | null
          created_at?: string | null
          current_streak_days?: number
          daylight_preference?: string | null
          description?: string | null
          duration_minutes?: number | null
          energy?: Database["public"]["Enums"]["energy_enum"]
          fixed_end_local?: string | null
          fixed_start_local?: string | null
          fixed_timezone?: string | null
          global_order?: number | null
          goal_id?: string | null
          habit_type?: Database["public"]["Enums"]["habit_type_enum"]
          id?: string
          last_completed_at?: string | null
          location_context_id?: string | null
          longest_streak_days?: number
          memo_capture_config?: Json | null
          name?: string
          next_due_override?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_enum"]
          recurrence_days?: number[] | null
          recurrence_mode?: Database["public"]["Enums"]["habit_recurrence_mode_enum"]
          routine_id?: string | null
          routine_position?: number | null
          skill_id?: string | null
          type?: Database["public"]["Enums"]["habit_type_enum"]
          updated_at?: string
          user_id?: string
          window_edge_preference?: string | null
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "habits_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_write"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "skill_goals"
            referencedColumns: ["goal_id"]
          },
          {
            foreignKeyName: "habits_location_context_id_fkey"
            columns: ["location_context_id"]
            isOneToOne: false
            referencedRelation: "location_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_routine_owner_fk"
            columns: ["routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habit_routines"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "habits_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills_progress_v"
            referencedColumns: ["skill_id"]
          },
          {
            foreignKeyName: "habits_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "windows"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_accounts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          platform: string
          updated_at: string
          url: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform: string
          updated_at?: string
          url: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform?: string
          updated_at?: string
          url?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      location_contexts: {
        Row: {
          created_at: string
          id: string
          label: string
          normalized_value: string | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          normalized_value?: string | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          normalized_value?: string | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      meal_items: {
        Row: {
          created_at: string
          custom_name: string | null
          food_id: string | null
          id: string
          item_type: string
          meal_id: string
          metadata: Json
          quantity: number
          recipe_id: string | null
          serving_grams: number | null
          serving_unit: string | null
          snapshot_brand_name: string | null
          snapshot_calories: number
          snapshot_carbs_g: number
          snapshot_fat_g: number
          snapshot_name: string
          snapshot_protein_g: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          item_type: string
          meal_id: string
          metadata?: Json
          quantity?: number
          recipe_id?: string | null
          serving_grams?: number | null
          serving_unit?: string | null
          snapshot_brand_name?: string | null
          snapshot_calories?: number
          snapshot_carbs_g?: number
          snapshot_fat_g?: number
          snapshot_name: string
          snapshot_protein_g?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          item_type?: string
          meal_id?: string
          metadata?: Json
          quantity?: number
          recipe_id?: string | null
          serving_grams?: number | null
          serving_unit?: string | null
          snapshot_brand_name?: string | null
          snapshot_calories?: number
          snapshot_carbs_g?: number
          snapshot_fat_g?: number
          snapshot_name?: string
          snapshot_protein_g?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          created_at: string
          deleted_at: string | null
          habit_id: string | null
          id: string
          metadata: Json
          name: string | null
          note: string | null
          occurred_at: string
          source_note_entry_id: string | null
          source_note_id: string | null
          timezone: string
          total_calories: number
          total_carbs_g: number
          total_fat_g: number
          total_protein_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          habit_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          note?: string | null
          occurred_at: string
          source_note_entry_id?: string | null
          source_note_id?: string | null
          timezone?: string
          total_calories?: number
          total_carbs_g?: number
          total_fat_g?: number
          total_protein_g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          habit_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          note?: string | null
          occurred_at?: string
          source_note_entry_id?: string | null
          source_note_id?: string | null
          timezone?: string
          total_calories?: number
          total_carbs_g?: number
          total_fat_g?: number
          total_protein_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meals_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meals_source_note_id_fkey"
            columns: ["source_note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      monument_activity: {
        Row: {
          created_at: string
          event_type: string
          id: string
          monument_id: string
          payload_json: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          monument_id: string
          payload_json?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          monument_id?: string
          payload_json?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monument_activity_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monument_activity_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
        ]
      }
      monument_milestones: {
        Row: {
          charge_gain: number
          created_at: string
          id: string
          is_done: boolean
          monument_id: string
          order_index: number
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charge_gain?: number
          created_at?: string
          id?: string
          is_done?: boolean
          monument_id: string
          order_index?: number
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charge_gain?: number
          created_at?: string
          id?: string
          is_done?: boolean
          monument_id?: string
          order_index?: number
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monument_milestones_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monument_milestones_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
        ]
      }
      monument_notes: {
        Row: {
          body: string | null
          created_at: string
          id: string
          monument_id: string
          pinned: boolean
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          monument_id: string
          pinned?: boolean
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          monument_id?: string
          pinned?: boolean
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monument_notes_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monument_notes_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
        ]
      }
      monument_skills: {
        Row: {
          monument_id: number | null
          skill_id: number | null
          user_id: string
        }
        Insert: {
          monument_id?: number | null
          skill_id?: number | null
          user_id?: string
        }
        Update: {
          monument_id?: number | null
          skill_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      monuments: {
        Row: {
          charge: number
          created_at: string
          emoji: string
          id: string
          priority_rank: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charge?: number
          created_at?: string
          emoji: string
          id?: string
          priority_rank?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charge?: number
          created_at?: string
          emoji?: string
          id?: string
          priority_rank?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string | null
          created_at: string
          id: string
          metadata: Json | null
          monument_id: string | null
          parent_note_id: string | null
          sibling_order: number | null
          skill_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          monument_id?: string | null
          parent_note_id?: string | null
          sibling_order?: number | null
          skill_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          monument_id?: string | null
          parent_note_id?: string | null
          sibling_order?: number | null
          skill_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_monument_fk"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_monument_fk"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
          {
            foreignKeyName: "notes_parent_fk"
            columns: ["parent_note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_skill_fk"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_skill_fk"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills_progress_v"
            referencedColumns: ["skill_id"]
          },
        ]
      }
      offers: {
        Row: {
          circle_id: string | null
          created_at: string
          ends_at: string | null
          id: string
          note: string | null
          offer_type: string
          offered_by_user_id: string
          recipient_member_id: string | null
          recipient_user_id: string
          responded_at: string | null
          starts_at: string | null
          status: string
          terms: Json
          timezone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          circle_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          note?: string | null
          offer_type: string
          offered_by_user_id: string
          recipient_member_id?: string | null
          recipient_user_id: string
          responded_at?: string | null
          starts_at?: string | null
          status?: string
          terms?: Json
          timezone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          circle_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          note?: string | null
          offer_type?: string
          offered_by_user_id?: string
          recipient_member_id?: string | null
          recipient_user_id?: string
          responded_at?: string | null
          starts_at?: string | null
          status?: string
          terms?: Json
          timezone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_recipient_member_id_fkey"
            columns: ["recipient_member_id"]
            isOneToOne: false
            referencedRelation: "circle_members"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_window_allowed_instance_types: {
        Row: {
          created_at: string
          id: string
          instance_type: string
          overlay_window_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_type: string
          overlay_window_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_type?: string
          overlay_window_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_window_allowed_instance_types_overlay_window_id_fkey"
            columns: ["overlay_window_id"]
            isOneToOne: false
            referencedRelation: "overlay_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_window_allowed_monuments: {
        Row: {
          created_at: string
          id: string
          monument_id: string
          overlay_window_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          monument_id: string
          overlay_window_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          monument_id?: string
          overlay_window_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_window_allowed_monuments_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_window_allowed_monuments_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
          {
            foreignKeyName: "overlay_window_allowed_monuments_overlay_window_id_fkey"
            columns: ["overlay_window_id"]
            isOneToOne: false
            referencedRelation: "overlay_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_window_allowed_skills: {
        Row: {
          created_at: string
          id: string
          overlay_window_id: string
          skill_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          overlay_window_id: string
          skill_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          overlay_window_id?: string
          skill_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_window_allowed_skills_overlay_window_id_fkey"
            columns: ["overlay_window_id"]
            isOneToOne: false
            referencedRelation: "overlay_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_window_allowed_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_window_allowed_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills_progress_v"
            referencedColumns: ["skill_id"]
          },
        ]
      }
      overlay_window_items: {
        Row: {
          created_at: string
          end_utc: string
          event_name: string | null
          id: string
          locked: boolean
          overlay_window_id: string
          schedule_instance_id: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["schedule_instance_source_type"]
          start_utc: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_utc: string
          event_name?: string | null
          id?: string
          locked?: boolean
          overlay_window_id: string
          schedule_instance_id?: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["schedule_instance_source_type"]
          start_utc: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_utc?: string
          event_name?: string | null
          id?: string
          locked?: boolean
          overlay_window_id?: string
          schedule_instance_id?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["schedule_instance_source_type"]
          start_utc?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_window_items_overlay_window_id_fkey"
            columns: ["overlay_window_id"]
            isOneToOne: false
            referencedRelation: "overlay_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_window_items_schedule_instance_id_fkey"
            columns: ["schedule_instance_id"]
            isOneToOne: false
            referencedRelation: "schedule_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      overlay_windows: {
        Row: {
          allow_all_instance_types: boolean
          allow_all_monuments: boolean
          allow_all_skills: boolean
          block_type: string | null
          created_at: string
          end_utc: string
          energy: string | null
          id: string
          label: string | null
          location_context_id: string | null
          mode: string
          schedule_date: string
          start_utc: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_all_instance_types?: boolean
          allow_all_monuments?: boolean
          allow_all_skills?: boolean
          block_type?: string | null
          created_at?: string
          end_utc: string
          energy?: string | null
          id?: string
          label?: string | null
          location_context_id?: string | null
          mode?: string
          schedule_date: string
          start_utc: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_all_instance_types?: boolean
          allow_all_monuments?: boolean
          allow_all_skills?: boolean
          block_type?: string | null
          created_at?: string
          end_utc?: string
          energy?: string | null
          id?: string
          label?: string | null
          location_context_id?: string | null
          mode?: string
          schedule_date?: string
          start_utc?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_windows_location_context_id_fkey"
            columns: ["location_context_id"]
            isOneToOne: false
            referencedRelation: "location_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      priority: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      product_checkouts: {
        Row: {
          buyer_user_id: string | null
          carrier: string | null
          checkout_id: string
          created_at: string
          currency: string
          fulfillment_status: string
          id: string
          items: Json
          seller_handle: string
          seller_user_id: string
          shipped_at: string | null
          status: string
          stripe_session_id: string
          total_amount: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          buyer_user_id?: string | null
          carrier?: string | null
          checkout_id: string
          created_at?: string
          currency: string
          fulfillment_status?: string
          id?: string
          items: Json
          seller_handle: string
          seller_user_id: string
          shipped_at?: string | null
          status?: string
          stripe_session_id: string
          total_amount: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          buyer_user_id?: string | null
          carrier?: string | null
          checkout_id?: string
          created_at?: string
          currency?: string
          fulfillment_status?: string
          id?: string
          items?: Json
          seller_handle?: string
          seller_user_id?: string
          shipped_at?: string | null
          status?: string
          stripe_session_id?: string
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          id: string
          inventory: number | null
          price: number
          status: string
          thumbnail: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory?: number | null
          price: number
          status?: string
          thumbnail?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory?: number | null
          price?: number
          status?: string
          thumbnail?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_themes: {
        Row: {
          accent_color: string
          background_gradient: string | null
          created_at: string
          font_family: string | null
          id: string
          is_premium: boolean | null
          name: string
          primary_color: string
          secondary_color: string
        }
        Insert: {
          accent_color: string
          background_gradient?: string | null
          created_at?: string
          font_family?: string | null
          id?: string
          is_premium?: boolean | null
          name: string
          primary_color: string
          secondary_color: string
        }
        Update: {
          accent_color?: string
          background_gradient?: string | null
          created_at?: string
          font_family?: string | null
          id?: string
          is_premium?: boolean | null
          name?: string
          primary_color?: string
          secondary_color?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accent_color: string | null
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          dob: string | null
          font_family: string | null
          id: string
          is_private: boolean
          name: string | null
          notifications_enabled: boolean
          onboarding_completed_at: string | null
          onboarding_step: string | null
          onboarding_version: number
          prefers_dark_mode: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          theme_color: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          username: string | null
          verified: boolean | null
        }
        Insert: {
          accent_color?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          dob?: string | null
          font_family?: string | null
          id?: string
          is_private?: boolean
          name?: string | null
          notifications_enabled?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          onboarding_version?: number
          prefers_dark_mode?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          theme_color?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          verified?: boolean | null
        }
        Update: {
          accent_color?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          dob?: string | null
          font_family?: string | null
          id?: string
          is_private?: boolean
          name?: string | null
          notifications_enabled?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          onboarding_version?: number
          prefers_dark_mode?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          theme_color?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      project_skills: {
        Row: {
          project_id: string
          skill_id: string
        }
        Insert: {
          project_id: string
          skill_id: string
        }
        Update: {
          project_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_skills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills_progress_v"
            referencedColumns: ["skill_id"]
          },
        ]
      }
      project_stage: {
        Row: {
          id: number
          name: string
          order_index: number
        }
        Insert: {
          id?: number
          name: string
          order_index: number
        }
        Update: {
          id?: number
          name?: string
          order_index?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          base_weight: number
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          duration_min: number | null
          effective_duration_min: number | null
          energy: Database["public"]["Enums"]["energy_enum"]
          energy_enum: Database["public"]["Enums"]["energy_enum"]
          global_rank: number | null
          goal_id: string
          id: string
          leverage_weight: number
          name: string
          neglect_weight: number
          priority: Database["public"]["Enums"]["priority_enum"]
          priority_enum: Database["public"]["Enums"]["priority_enum"]
          stage: Database["public"]["Enums"]["project_stage_enum"]
          total_weight: number
          updated_at: string
          urgency_weight: number
          user_id: string
          weight_breakdown: Json | null
          weight_updated_at: string | null
          weight_version: string | null
          why: string | null
        }
        Insert: {
          base_weight?: number
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          duration_min?: number | null
          effective_duration_min?: number | null
          energy: Database["public"]["Enums"]["energy_enum"]
          energy_enum?: Database["public"]["Enums"]["energy_enum"]
          global_rank?: number | null
          goal_id: string
          id?: string
          leverage_weight?: number
          name: string
          neglect_weight?: number
          priority: Database["public"]["Enums"]["priority_enum"]
          priority_enum?: Database["public"]["Enums"]["priority_enum"]
          stage?: Database["public"]["Enums"]["project_stage_enum"]
          total_weight?: number
          updated_at?: string
          urgency_weight?: number
          user_id: string
          weight_breakdown?: Json | null
          weight_updated_at?: string | null
          weight_version?: string | null
          why?: string | null
        }
        Update: {
          base_weight?: number
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          duration_min?: number | null
          effective_duration_min?: number | null
          energy?: Database["public"]["Enums"]["energy_enum"]
          energy_enum?: Database["public"]["Enums"]["energy_enum"]
          global_rank?: number | null
          goal_id?: string
          id?: string
          leverage_weight?: number
          name?: string
          neglect_weight?: number
          priority?: Database["public"]["Enums"]["priority_enum"]
          priority_enum?: Database["public"]["Enums"]["priority_enum"]
          stage?: Database["public"]["Enums"]["project_stage_enum"]
          total_weight?: number
          updated_at?: string
          urgency_weight?: number
          user_id?: string
          weight_breakdown?: Json | null
          weight_updated_at?: string | null
          weight_version?: string | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_write"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "skill_goals"
            referencedColumns: ["goal_id"]
          },
        ]
      }
      push_notification_deliveries: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          kind: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          kind: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          kind?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          app_version: string | null
          build_number: string | null
          created_at: string
          device_id: string | null
          enabled: boolean
          id: string
          last_seen_at: string
          platform: string
          token: string
          token_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          build_number?: string | null
          created_at?: string
          device_id?: string | null
          enabled?: boolean
          id?: string
          last_seen_at?: string
          platform?: string
          token: string
          token_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          build_number?: string | null
          created_at?: string
          device_id?: string | null
          enabled?: boolean
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          token_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_items: {
        Row: {
          created_at: string
          custom_name: string | null
          food_id: string | null
          id: string
          item_type: string
          metadata: Json
          quantity: number
          recipe_id: string
          serving_grams: number | null
          serving_unit: string | null
          snapshot_brand_name: string | null
          snapshot_calories: number
          snapshot_carbs_g: number
          snapshot_fat_g: number
          snapshot_name: string
          snapshot_protein_g: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          quantity?: number
          recipe_id: string
          serving_grams?: number | null
          serving_unit?: string | null
          snapshot_brand_name?: string | null
          snapshot_calories?: number
          snapshot_carbs_g?: number
          snapshot_fat_g?: number
          snapshot_name: string
          snapshot_protein_g?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          item_type?: string
          metadata?: Json
          quantity?: number
          recipe_id?: string
          serving_grams?: number | null
          serving_unit?: string | null
          snapshot_brand_name?: string | null
          snapshot_calories?: number
          snapshot_carbs_g?: number
          snapshot_fat_g?: number
          snapshot_name?: string
          snapshot_protein_g?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          servings: number
          total_calories: number
          total_carbs_g: number
          total_fat_g: number
          total_protein_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          servings?: number
          total_calories?: number
          total_carbs_g?: number
          total_fat_g?: number
          total_protein_g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          servings?: number
          total_calories?: number
          total_carbs_g?: number
          total_fat_g?: number
          total_protein_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      roadmap_items: {
        Row: {
          campaign_id: string | null
          created_at: string
          goal_id: string | null
          id: string
          item_type: string
          position: number
          roadmap_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          goal_id?: string | null
          id?: string
          item_type: string
          position: number
          roadmap_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          goal_id?: string | null
          id?: string
          item_type?: string
          position?: number
          roadmap_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_write"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "skill_goals"
            referencedColumns: ["goal_id"]
          },
          {
            foreignKeyName: "roadmap_items_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmaps: {
        Row: {
          circle_id: string | null
          created_at: string | null
          emoji: string | null
          id: string
          monument_id: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          circle_id?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string
          monument_id?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          circle_id?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string
          monument_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadmaps_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmaps_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmaps_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
        ]
      }
      schedule_instances: {
        Row: {
          canceled_reason: string | null
          completed_at: string | null
          day_type_time_block_id: string | null
          duration_min: number | null
          end_utc: string | null
          energy_resolved: string
          event_name: string | null
          id: string
          locked: boolean
          metadata: Json | null
          missed_reason: string | null
          notes: string | null
          overlay_window_id: string | null
          placement_source: Database["public"]["Enums"]["schedule_instance_placement_source"]
          practice_context_monument_id: string | null
          project_name: string | null
          scheduled_at: string
          source_id: string
          source_type: string
          start_utc: string | null
          status: string
          time_block_id: string | null
          updated_at: string
          user_id: string
          weight_snapshot: number
          window_id: string | null
        }
        Insert: {
          canceled_reason?: string | null
          completed_at?: string | null
          day_type_time_block_id?: string | null
          duration_min?: number | null
          end_utc?: string | null
          energy_resolved: string
          event_name?: string | null
          id?: string
          locked?: boolean
          metadata?: Json | null
          missed_reason?: string | null
          notes?: string | null
          overlay_window_id?: string | null
          placement_source?: Database["public"]["Enums"]["schedule_instance_placement_source"]
          practice_context_monument_id?: string | null
          project_name?: string | null
          scheduled_at?: string
          source_id: string
          source_type: string
          start_utc?: string | null
          status?: string
          time_block_id?: string | null
          updated_at?: string
          user_id: string
          weight_snapshot: number
          window_id?: string | null
        }
        Update: {
          canceled_reason?: string | null
          completed_at?: string | null
          day_type_time_block_id?: string | null
          duration_min?: number | null
          end_utc?: string | null
          energy_resolved?: string
          event_name?: string | null
          id?: string
          locked?: boolean
          metadata?: Json | null
          missed_reason?: string | null
          notes?: string | null
          overlay_window_id?: string | null
          placement_source?: Database["public"]["Enums"]["schedule_instance_placement_source"]
          practice_context_monument_id?: string | null
          project_name?: string | null
          scheduled_at?: string
          source_id?: string
          source_type?: string
          start_utc?: string | null
          status?: string
          time_block_id?: string | null
          updated_at?: string
          user_id?: string
          weight_snapshot?: number
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_instances_day_type_time_block_id_fkey"
            columns: ["day_type_time_block_id"]
            isOneToOne: false
            referencedRelation: "day_type_time_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_instances_overlay_window_id_fkey"
            columns: ["overlay_window_id"]
            isOneToOne: false
            referencedRelation: "overlay_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_instances_practice_context_monument_id_fkey"
            columns: ["practice_context_monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_instances_practice_context_monument_id_fkey"
            columns: ["practice_context_monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
          {
            foreignKeyName: "schedule_instances_time_block_id_fkey"
            columns: ["time_block_id"]
            isOneToOne: false
            referencedRelation: "time_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_sync_pairings: {
        Row: {
          created_at: string
          id: string
          partner_instance_ids: string[]
          sync_instance_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_instance_ids?: string[]
          sync_instance_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_instance_ids?: string[]
          sync_instance_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sync_pairings_sync_instance_id_fkey"
            columns: ["sync_instance_id"]
            isOneToOne: false
            referencedRelation: "schedule_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_user_state: {
        Row: {
          created_at: string
          last_active_at: string | null
          last_scheduler_error: string | null
          last_scheduler_error_at: string | null
          last_scheduler_run_at: string | null
          last_scheduler_success_at: string | null
          next_scheduler_run_after: string | null
          scheduler_lock_token: string | null
          scheduler_locked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_active_at?: string | null
          last_scheduler_error?: string | null
          last_scheduler_error_at?: string | null
          last_scheduler_run_at?: string | null
          last_scheduler_success_at?: string | null
          next_scheduler_run_after?: string | null
          scheduler_lock_token?: string | null
          scheduler_locked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_active_at?: string | null
          last_scheduler_error?: string | null
          last_scheduler_error_at?: string | null
          last_scheduler_run_at?: string | null
          last_scheduler_success_at?: string | null
          next_scheduler_run_after?: string | null
          scheduler_lock_token?: string | null
          scheduler_locked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          duration_mins: number | null
          id: string
          price: number
          status: string
          thumbnail: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_mins?: number | null
          id?: string
          price: number
          status?: string
          thumbnail?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_mins?: number | null
          id?: string
          price?: number
          status?: string
          thumbnail?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          skill_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          skill_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          skill_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_badges_progress_fk"
            columns: ["user_id", "skill_id"]
            isOneToOne: false
            referencedRelation: "skill_progress"
            referencedColumns: ["user_id", "skill_id"]
          },
        ]
      }
      skill_progress: {
        Row: {
          level: number
          prestige: number
          skill_id: string
          total_xp: number
          updated_at: string
          user_id: string
          xp_into_level: number
        }
        Insert: {
          level?: number
          prestige?: number
          skill_id: string
          total_xp?: number
          updated_at?: string
          user_id: string
          xp_into_level?: number
        }
        Update: {
          level?: number
          prestige?: number
          skill_id?: string
          total_xp?: number
          updated_at?: string
          user_id?: string
          xp_into_level?: number
        }
        Relationships: []
      }
      skills: {
        Row: {
          cat_id: string | null
          created_at: string
          global_skill_id: string | null
          icon: string
          id: string
          is_default: boolean
          is_locked: boolean
          level: number
          monument_id: string | null
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cat_id?: string | null
          created_at?: string
          global_skill_id?: string | null
          icon: string
          id?: string
          is_default?: boolean
          is_locked?: boolean
          level?: number
          monument_id?: string | null
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cat_id?: string | null
          created_at?: string
          global_skill_id?: string | null
          icon?: string
          id?: string
          is_default?: boolean
          is_locked?: boolean
          level?: number
          monument_id?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_cat_id_fkey"
            columns: ["cat_id"]
            isOneToOne: false
            referencedRelation: "cats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_cat_id_fkey"
            columns: ["cat_id"]
            isOneToOne: false
            referencedRelation: "skills_by_cats_v"
            referencedColumns: ["cat_id"]
          },
          {
            foreignKeyName: "skills_global_skill_id_fkey"
            columns: ["global_skill_id"]
            isOneToOne: false
            referencedRelation: "global_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      social_links: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean | null
          platform: string
          position: number
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          platform: string
          position?: number
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          platform?: string
          position?: number
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      source_integrations: {
        Row: {
          auth_header: string | null
          auth_mode: string
          auth_token: string | null
          connection_url: string
          created_at: string
          display_name: string | null
          headers: Json | null
          id: string
          oauth_access_token: string | null
          oauth_authorize_url: string | null
          oauth_client_id: string | null
          oauth_client_secret: string | null
          oauth_expires_at: string | null
          oauth_metadata: Json | null
          oauth_refresh_token: string | null
          oauth_scopes: string[] | null
          oauth_token_url: string | null
          payload_template: Json | null
          provider: string
          publish_method: string
          publish_url: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_header?: string | null
          auth_mode?: string
          auth_token?: string | null
          connection_url: string
          created_at?: string
          display_name?: string | null
          headers?: Json | null
          id?: string
          oauth_access_token?: string | null
          oauth_authorize_url?: string | null
          oauth_client_id?: string | null
          oauth_client_secret?: string | null
          oauth_expires_at?: string | null
          oauth_metadata?: Json | null
          oauth_refresh_token?: string | null
          oauth_scopes?: string[] | null
          oauth_token_url?: string | null
          payload_template?: Json | null
          provider: string
          publish_method?: string
          publish_url: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_header?: string | null
          auth_mode?: string
          auth_token?: string | null
          connection_url?: string
          created_at?: string
          display_name?: string | null
          headers?: Json | null
          id?: string
          oauth_access_token?: string | null
          oauth_authorize_url?: string | null
          oauth_client_id?: string | null
          oauth_client_secret?: string | null
          oauth_expires_at?: string | null
          oauth_metadata?: Json | null
          oauth_refresh_token?: string | null
          oauth_scopes?: string[] | null
          oauth_token_url?: string | null
          payload_template?: Json | null
          provider?: string
          publish_method?: string
          publish_url?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_listings: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          price: number | null
          publish_results: Json | null
          published_at: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          price?: number | null
          publish_results?: Json | null
          published_at?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          price?: number | null
          publish_results?: Json | null
          published_at?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          integration_id: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          integration_id: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          integration_id?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_oauth_states_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "source_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          normalized_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_stage: {
        Row: {
          id: number
          name: string | null
          order_index: number | null
        }
        Insert: {
          id?: number
          name?: string | null
          order_index?: number | null
        }
        Update: {
          id?: number
          name?: string | null
          order_index?: number | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_min: number
          energy: Database["public"]["Enums"]["energy_enum"]
          energy_enum: Database["public"]["Enums"]["energy_enum"]
          goal_id: string | null
          id: string
          name: string
          priority: Database["public"]["Enums"]["priority_enum"]
          priority_enum: Database["public"]["Enums"]["priority_enum"]
          project_id: string
          skill_id: string | null
          stage: Database["public"]["Enums"]["task_stage_enum"]
          updated_at: string
          user_id: string
          why: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_min: number
          energy: Database["public"]["Enums"]["energy_enum"]
          energy_enum?: Database["public"]["Enums"]["energy_enum"]
          goal_id?: string | null
          id?: string
          name: string
          priority: Database["public"]["Enums"]["priority_enum"]
          priority_enum?: Database["public"]["Enums"]["priority_enum"]
          project_id: string
          skill_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage_enum"]
          updated_at?: string
          user_id: string
          why?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_min?: number
          energy?: Database["public"]["Enums"]["energy_enum"]
          energy_enum?: Database["public"]["Enums"]["energy_enum"]
          goal_id?: string | null
          id?: string
          name?: string
          priority?: Database["public"]["Enums"]["priority_enum"]
          priority_enum?: Database["public"]["Enums"]["priority_enum"]
          project_id?: string
          skill_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage_enum"]
          updated_at?: string
          user_id?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_write"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "skill_goals"
            referencedColumns: ["goal_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills_progress_v"
            referencedColumns: ["skill_id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          created_at: string
          day_type_id: string | null
          days: number[] | null
          end_local: string
          id: string
          label: string | null
          start_local: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_type_id?: string | null
          days?: number[] | null
          end_local: string
          id?: string
          label?: string | null
          start_local: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_type_id?: string | null
          days?: number[] | null
          end_local?: string
          id?: string
          label?: string | null
          start_local?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_day_type_id_fkey"
            columns: ["day_type_id"]
            isOneToOne: false
            referencedRelation: "day_types"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          bucket_start: string
          count: number
          key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket_start: string
          count?: number
          key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket_start?: string
          count?: number
          key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entitlements: {
        Row: {
          current_period_end: string | null
          is_active: boolean
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          current_period_end?: string | null
          is_active?: boolean
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          current_period_end?: string | null
          is_active?: boolean
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_legal_acceptances: {
        Row: {
          created_at: string
          privacy_accepted_at: string
          privacy_url: string
          privacy_version: string
          terms_accepted_at: string
          terms_url: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          privacy_accepted_at: string
          privacy_url: string
          privacy_version: string
          terms_accepted_at: string
          terms_url: string
          terms_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          privacy_accepted_at?: string
          privacy_url?: string
          privacy_version?: string
          terms_accepted_at?: string
          terms_url?: string
          terms_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          current_level: number
          prestige: number
          total_dark_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_level?: number
          prestige?: number
          total_dark_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_level?: number
          prestige?: number
          total_dark_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      windows: {
        Row: {
          created_at: string
          days: number[]
          end_local: string
          energy: string
          id: string
          label: string
          location_context_id: string | null
          start_local: string
          user_id: string
          window_kind: string
        }
        Insert: {
          created_at?: string
          days: number[]
          end_local: string
          energy?: string
          id?: string
          label: string
          location_context_id?: string | null
          start_local: string
          user_id?: string
          window_kind?: string
        }
        Update: {
          created_at?: string
          days?: number[]
          end_local?: string
          energy?: string
          id?: string
          label?: string
          location_context_id?: string | null
          start_local?: string
          user_id?: string
          window_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "windows_location_context_id_fkey"
            columns: ["location_context_id"]
            isOneToOne: false
            referencedRelation: "location_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          amount: number
          award_key: string | null
          completion_event_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["xp_kind"]
          monument_id: string | null
          schedule_instance_id: string | null
          skill_id: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          amount: number
          award_key?: string | null
          completion_event_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["xp_kind"]
          monument_id?: string | null
          schedule_instance_id?: string | null
          skill_id?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          award_key?: string | null
          completion_event_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["xp_kind"]
          monument_id?: string | null
          schedule_instance_id?: string | null
          skill_id?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_completion_event_id_fkey"
            columns: ["completion_event_id"]
            isOneToOne: false
            referencedRelation: "completion_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      goals_write: {
        Row: {
          active: boolean | null
          created_at: string | null
          due_date: string | null
          emoji: string | null
          energy: Database["public"]["Enums"]["energy_enum"] | null
          energy_code: string | null
          energy_enum: Database["public"]["Enums"]["energy_enum"] | null
          id: string | null
          monument_id: string | null
          name: string | null
          priority: Database["public"]["Enums"]["priority_enum"] | null
          priority_code: string | null
          priority_enum: Database["public"]["Enums"]["priority_enum"] | null
          priority_rank: number | null
          roadmap_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          weight: number | null
          weight_boost: number | null
          why: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          due_date?: string | null
          emoji?: string | null
          energy?: Database["public"]["Enums"]["energy_enum"] | null
          energy_code?: string | null
          energy_enum?: Database["public"]["Enums"]["energy_enum"] | null
          id?: string | null
          monument_id?: string | null
          name?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"] | null
          priority_code?: string | null
          priority_enum?: Database["public"]["Enums"]["priority_enum"] | null
          priority_rank?: number | null
          roadmap_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          weight?: number | null
          weight_boost?: number | null
          why?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          due_date?: string | null
          emoji?: string | null
          energy?: Database["public"]["Enums"]["energy_enum"] | null
          energy_code?: string | null
          energy_enum?: Database["public"]["Enums"]["energy_enum"] | null
          id?: string | null
          monument_id?: string | null
          name?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"] | null
          priority_code?: string | null
          priority_enum?: Database["public"]["Enums"]["priority_enum"] | null
          priority_rank?: number | null
          roadmap_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          weight?: number | null
          weight_boost?: number | null
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "monuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_monument_id_fkey"
            columns: ["monument_id"]
            isOneToOne: false
            referencedRelation: "v_monument_milestone_summary"
            referencedColumns: ["monument_id"]
          },
          {
            foreignKeyName: "goals_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_goal_ids: {
        Row: {
          goal_id: string | null
          skill_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      skill_goals: {
        Row: {
          energy_name: Database["public"]["Enums"]["energy_enum"] | null
          goal_id: string | null
          goal_name: string | null
          priority_name: Database["public"]["Enums"]["priority_enum"] | null
          why: string | null
        }
        Insert: {
          energy_name?: Database["public"]["Enums"]["energy_enum"] | null
          goal_id?: string | null
          goal_name?: string | null
          priority_name?: Database["public"]["Enums"]["priority_enum"] | null
          why?: string | null
        }
        Update: {
          energy_name?: Database["public"]["Enums"]["energy_enum"] | null
          goal_id?: string | null
          goal_name?: string | null
          priority_name?: Database["public"]["Enums"]["priority_enum"] | null
          why?: string | null
        }
        Relationships: []
      }
      skills_by_cats_v: {
        Row: {
          cat_id: string | null
          cat_name: string | null
          color_hex: string | null
          skill_count: number | null
          skills: Json[] | null
          sort_order: number | null
          user_id: string | null
        }
        Relationships: []
      }
      skills_progress_v: {
        Row: {
          cat_id: string | null
          cat_name: string | null
          icon: string | null
          level: number | null
          name: string | null
          skill_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skills_cat_id_fkey"
            columns: ["cat_id"]
            isOneToOne: false
            referencedRelation: "cats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_cat_id_fkey"
            columns: ["cat_id"]
            isOneToOne: false
            referencedRelation: "skills_by_cats_v"
            referencedColumns: ["cat_id"]
          },
        ]
      }
      v_monument_milestone_summary: {
        Row: {
          charge_gained: number | null
          milestones_done: number | null
          milestones_total: number | null
          monument_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_skill_xp: {
        Args: { p_amount: number; p_skill: string; p_user: string }
        Returns: undefined
      }
      cancel_schedule_instances_illegal_overlap_final: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      check_api_rate_limit: {
        Args: {
          p_action: string
          p_max_requests: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          request_count: number
          reset_at: string
        }[]
      }
      create_goal_with_projects_and_tasks: {
        Args: { goal_input: Json; project_inputs: Json }
        Returns: Json
      }
      create_nutrition_meal: {
        Args: { p_items: Json; p_meal: Json }
        Returns: {
          created_at: string
          deleted_at: string | null
          habit_id: string | null
          id: string
          metadata: Json
          name: string | null
          note: string | null
          occurred_at: string
          source_note_entry_id: string | null
          source_note_id: string | null
          timezone: string
          total_calories: number
          total_carbs_g: number
          total_fat_g: number
          total_protein_g: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_profile_user_id: { Args: { p_username: string }; Returns: string }
      increment_ai_monthly_usage:
        | {
            Args: {
              p_increment?: number
              p_model?: string
              p_month_start: string
              p_tokens_in?: number
              p_tokens_out?: number
              p_user_id: string
            }
            Returns: {
              created_at: string
              id: number
              model: string | null
              month: string
              month_start: string | null
              tokens_in: number | null
              tokens_out: number | null
              updated_at: string
              usage_count: number
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "ai_monthly_usage"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_cost_usd?: number
              p_input_tokens?: number
              p_model?: string
              p_month_start: string
              p_output_tokens?: number
              p_user_id: string
            }
            Returns: {
              created_at: string
              id: number
              model: string | null
              month: string
              month_start: string | null
              tokens_in: number | null
              tokens_out: number | null
              updated_at: string
              usage_count: number
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "ai_monthly_usage"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      increment_usage_counter: {
        Args: { p_bucket_start: string; p_key: string }
        Returns: number
      }
      is_circle_owner: { Args: { target_circle_id: string }; Returns: boolean }
      log_charge_update: {
        Args: { p_delta: number; p_monument_id: string; p_user_id: string }
        Returns: undefined
      }
      lookup_energy_id: { Args: { label: string }; Returns: number }
      lookup_priority_id: { Args: { label: string }; Returns: number }
      mark_missed_instances: {
        Args: { p_grace_minutes?: number; p_user_id: string }
        Returns: number
      }
      preview_global_rank: {
        Args: {
          p_goal_id: string
          p_project_priority: string
          p_project_stage: string
        }
        Returns: Record<string, unknown>
      }
      priority_enum_from_bigint: {
        Args: { p: number }
        Returns: Database["public"]["Enums"]["priority_enum"]
      }
      recalc_project_effective_duration: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      recalculate_global_rank: { Args: never; Returns: undefined }
      recalculate_goal_global_rank: { Args: never; Returns: undefined }
      recalculate_project_global_rank: { Args: never; Returns: undefined }
      reconcile_dark_xp_for_user: {
        Args: { p_user?: string }
        Returns: {
          actual_total: number
          delta: number
          expected_total: number
          skill_id: string
        }[]
      }
      refresh_habit_completion_stats: {
        Args: { target_habit_id: string }
        Returns: undefined
      }
      save_campaign_goal_order: {
        Args: { p_campaign_id: string; p_goal_ids: string[] }
        Returns: undefined
      }
      save_global_habit_order: {
        Args: { p_habit_ids: string[]; p_habit_type: string; p_user_id: string }
        Returns: undefined
      }
      save_global_priority_order: {
        Args: { p_items: Json }
        Returns: undefined
      }
      save_monument_priority_order: {
        Args: { p_monument_ids: string[] }
        Returns: undefined
      }
      save_roadmap_goal_order: {
        Args: { p_goal_ids: string[]; p_roadmap_id: string }
        Returns: undefined
      }
      save_roadmap_item_order: {
        Args: { p_item_ids: string[]; p_roadmap_id: string }
        Returns: undefined
      }
      save_routine_habit_order: {
        Args: { p_habit_ids: string[]; p_routine_id: string }
        Returns: undefined
      }
      seed_basic_skills_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      skill_base_cost: { Args: { p_level: number }; Returns: number }
      skill_cost: {
        Args: { p_level: number; p_prestige: number }
        Returns: number
      }
      sync_skill_level_badges: {
        Args: { p_level: number; p_skill: string; p_user: string }
        Returns: undefined
      }
      sync_skill_prestige_badges: {
        Args: { p_prestige: number; p_skill: string; p_user: string }
        Returns: undefined
      }
      sync_user_prestige_badges: {
        Args: { p_prestige: number; p_user: string }
        Returns: undefined
      }
      valid_default_days: {
        Args: { days: number[]; is_default: boolean }
        Returns: boolean
      }
    }
    Enums: {
      energy_enum: "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME"
      habit_anchor_type_enum: "DATE" | "DAY"
      habit_recurrence_mode_enum: "INTERVAL" | "ANCHORED"
      habit_type_enum:
        | "HABIT"
        | "CHORE"
        | "ASYNC"
        | "MEMO"
        | "PRACTICE"
        | "SYNC"
      priority_enum:
        | "NO"
        | "LOW"
        | "MEDIUM"
        | "HIGH"
        | "CRITICAL"
        | "ULTRA-CRITICAL"
      project_stage_enum: "RESEARCH" | "TEST" | "BUILD" | "REFINE" | "RELEASE"
      recurrence_enum:
        | "daily"
        | "weekly"
        | "bi-weekly"
        | "monthly"
        | "bi-monthly"
        | "yearly"
        | "every x days"
        | "none"
      schedule_instance_placement_source: "scheduler" | "manual"
      schedule_instance_source_type: "PROJECT" | "TASK" | "HABIT"
      task_stage_enum: "PREPARE" | "PRODUCE" | "PERFECT"
      xp_kind: "task" | "habit" | "project" | "goal" | "manual"
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
      energy_enum: ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"],
      habit_anchor_type_enum: ["DATE", "DAY"],
      habit_recurrence_mode_enum: ["INTERVAL", "ANCHORED"],
      habit_type_enum: ["HABIT", "CHORE", "ASYNC", "MEMO", "PRACTICE", "SYNC"],
      priority_enum: [
        "NO",
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL",
        "ULTRA-CRITICAL",
      ],
      project_stage_enum: ["RESEARCH", "TEST", "BUILD", "REFINE", "RELEASE"],
      recurrence_enum: [
        "daily",
        "weekly",
        "bi-weekly",
        "monthly",
        "bi-monthly",
        "yearly",
        "every x days",
        "none",
      ],
      schedule_instance_placement_source: ["scheduler", "manual"],
      schedule_instance_source_type: ["PROJECT", "TASK", "HABIT"],
      task_stage_enum: ["PREPARE", "PRODUCE", "PERFECT"],
      xp_kind: ["task", "habit", "project", "goal", "manual"],
    },
  },
} as const
