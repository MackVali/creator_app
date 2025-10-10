export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      goals: {
        Row: {
          id: string;
          created_at: string;
          is_current: boolean;
          priority_id: number;
          energy_id: number;
          stage_id: number;
          monument_id: string;
          Title: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          is_current?: boolean;
          priority_id: number;
          energy_id: number;
          stage_id: number;
          monument_id: string;
          Title?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          is_current?: boolean;
          priority_id?: number;
          energy_id?: number;
          stage_id?: number;
          monument_id?: string;
          Title?: string;
          user_id?: string;
        };
      };
      habits: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          name: string;
          description: string | null;
          habit_type: string;
          recurrence: string | null;
          duration_minutes: number | null;
          window_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          name: string;
          description?: string | null;
          habit_type?: string;
          recurrence?: string | null;
          duration_minutes?: number | null;
          window_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          habit_type?: string;
          recurrence?: string | null;
          duration_minutes?: number | null;
          window_id?: string | null;
        };
      };
      projects: {
        Row: {
          id: string;
          created_at: string;
          energy_id: number | null;
          priority_id: number | null;
          goal_id: string | null;
          stage_id: number;
          Title: string;
          user_id: string | null;
          duration_min: number | null;
          effective_duration_min: number | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          energy_id?: number | null;
          priority_id?: number | null;
          goal_id?: string | null;
          stage_id: number;
          Title?: string;
          user_id?: string | null;
          duration_min?: number | null;
          effective_duration_min?: number | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          energy_id?: number | null;
          priority_id?: number | null;
          goal_id?: string | null;
          stage_id?: number;
          Title?: string;
          user_id?: string | null;
          duration_min?: number | null;
          effective_duration_min?: number | null;
        };
      };
      tasks: {
        Row: {
          id: string;
          created_at: string;
          priority_id: number | null;
          energy_id: number | null;
          stage_id: number;
          project_id: string;
          Title: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          priority_id?: number | null;
          energy_id?: number | null;
          stage_id?: number;
          project_id: string;
          Title?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          priority_id?: number | null;
          energy_id?: number | null;
          stage_id?: number;
          project_id?: string;
          Title?: string;
          user_id?: string;
        };
      };
      skills: {
        Row: {
          id: string;
          created_at: string;
          Title: string | null;
          cat_id: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          Title?: string | null;
          cat_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          Title?: string | null;
          cat_id?: string | null;
          user_id?: string | null;
        };
      };
      monuments: {
        Row: {
          id: string;
          created_at: string;
          Title: string | null;
          description: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          Title?: string | null;
          description?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          Title?: string | null;
          description?: string | null;
          user_id?: string | null;
        };
      };
      notes: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string | null;
          user_id: string;
          title: string | null;
          content: string | null;
          monument_id: string | null;
          skill_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string | null;
          user_id: string;
          title?: string | null;
          content?: string | null;
          monument_id?: string | null;
          skill_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string | null;
          user_id?: string;
          title?: string | null;
          content?: string | null;
          monument_id?: string | null;
          skill_id?: string | null;
        };
      };
      friend_connections: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          friend_user_id: string | null;
          friend_username: string;
          friend_display_name: string | null;
          friend_avatar_url: string | null;
          friend_profile_url: string | null;
          has_ring: boolean;
          is_online: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          friend_user_id?: string | null;
          friend_username: string;
          friend_display_name?: string | null;
          friend_avatar_url?: string | null;
          friend_profile_url?: string | null;
          has_ring?: boolean;
          is_online?: boolean;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          friend_user_id?: string | null;
          friend_username?: string;
          friend_display_name?: string | null;
          friend_avatar_url?: string | null;
          friend_profile_url?: string | null;
          has_ring?: boolean;
          is_online?: boolean;
        };
      };
      friend_messages: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          sender_id: string;
          recipient_id: string;
          body: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          sender_id: string;
          recipient_id: string;
          body: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          sender_id?: string;
          recipient_id?: string;
          body?: string;
        };
      };
      monument_skills: {
        Row: {
          user_id: string;
          monument_id: string | null;
          skill_id: string | null;
        };
        Insert: {
          user_id: string;
          monument_id?: string | null;
          skill_id?: string | null;
        };
        Update: {
          user_id?: string;
          monument_id?: string | null;
          skill_id?: string | null;
        };
      };
      energy: {
        Row: {
          id: number;
          name: string;
          order_index: number;
        };
        Insert: {
          id: number;
          name: string;
          order_index: number;
        };
        Update: {
          id?: number;
          name?: string;
          order_index?: number;
        };
      };
      goal_stage: {
        Row: {
          id: number;
          name: string | null;
          order_index: number | null;
        };
        Insert: {
          id: number;
          name?: string | null;
          order_index?: number | null;
        };
        Update: {
          id?: number;
          name?: string | null;
          order_index?: number | null;
        };
      };
      habit_types: {
        Row: {
          id: number;
          name: string | null;
        };
        Insert: {
          id: number;
          name?: string | null;
        };
        Update: {
          id?: number;
          name?: string | null;
        };
      };
      priority: {
        Row: {
          id: number;
          name: string;
          order_index: number;
        };
        Insert: {
          id: number;
          name: string;
          order_index: number;
        };
        Update: {
          id?: number;
          name?: string;
          order_index?: number;
        };
      };
      project_stage: {
        Row: {
          id: number;
          name: string | null;
          order_index: number | null;
        };
        Insert: {
          id: number;
          name?: string | null;
          order_index?: number | null;
        };
        Update: {
          id?: number;
          name?: string | null;
          order_index?: number | null;
        };
      };
      task_stage: {
        Row: {
          id: number;
          name: string | null;
          order_index: number | null;
        };
        Insert: {
          id: number;
          name?: string | null;
          order_index?: number | null;
        };
        Update: {
          id?: number;
          name?: string | null;
          order_index?: number | null;
        };
      };
      skill_categories: {
        Row: {
          id: number;
          name: string | null;
        };
        Insert: {
          id: number;
          name?: string | null;
        };
        Update: {
          id?: number;
          name?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          created_at: string;
          user_id: string | null;
          username: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          username: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          username?: string;
        };
      };
      linked_accounts: {
        Row: {
          id: string;
          user_id: string;
          platform: string;
          url: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: string;
          url: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform?: string;
          url?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      social_links: {
        Row: {
          id: string;
          user_id: string;
          platform: string;
          url: string;
          icon: string | null;
          color: string | null;
          position: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: string;
          url: string;
          icon?: string | null;
          color?: string | null;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform?: string;
          url?: string;
          icon?: string | null;
          color?: string | null;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      content_cards: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          url: string;
          thumbnail_url: string | null;
          category: string | null;
          position: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          url: string;
          thumbnail_url?: string | null;
          category?: string | null;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          url?: string;
          thumbnail_url?: string | null;
          category?: string | null;
          position?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      profile_themes: {
        Row: {
          id: string;
          name: string;
          primary_color: string;
          secondary_color: string;
          accent_color: string;
          background_gradient: string | null;
          font_family: string;
          is_premium: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          primary_color: string;
          secondary_color: string;
          accent_color: string;
          background_gradient?: string | null;
          font_family: string;
          is_premium?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          primary_color?: string;
          secondary_color?: string;
          accent_color?: string;
          background_gradient?: string | null;
          font_family?: string;
          is_premium?: boolean;
          created_at?: string;
        };
      };
      text_overrides: {
        Row: {
          id: string;
          original_text: string;
          override_text: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          original_text: string;
          override_text: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          original_text?: string;
          override_text?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
      };
      windows: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          label: string;
          days: number[];
          start_local: string;
          end_local: string;
          energy: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          label: string;
          days?: number[];
          start_local?: string;
          end_local?: string;
          energy?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          label?: string;
          days?: number[];
          start_local?: string;
          end_local?: string;
          energy?: string;
        };
      };
      schedule_instances: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          source_type: Database['public']['Enums']['schedule_instance_source_type'];
          source_id: string;
          window_id: string | null;
          start_utc: string;
          end_utc: string;
          duration_min: number;
          status: Database['public']['Enums']['schedule_instance_status'];
          weight_snapshot: number;
          energy_resolved: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          source_type: Database['public']['Enums']['schedule_instance_source_type'];
          source_id: string;
          window_id?: string | null;
          start_utc: string;
          end_utc: string;
          duration_min: number;
          status?: Database['public']['Enums']['schedule_instance_status'];
          weight_snapshot: number;
          energy_resolved: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          source_type?: Database['public']['Enums']['schedule_instance_source_type'];
          source_id?: string;
          window_id?: string | null;
          start_utc?: string;
          end_utc?: string;
          duration_min?: number;
          status?: Database['public']['Enums']['schedule_instance_status'];
          weight_snapshot?: number;
          energy_resolved?: string;
          completed_at?: string | null;
        };
      };
      xp_events: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          kind: Database["public"]["Enums"]["xp_kind"];
          amount: number;
          schedule_instance_id: string | null;
          skill_id: string | null;
          monument_id: string | null;
          award_key: string | null;
          source: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          kind: Database["public"]["Enums"]["xp_kind"];
          amount: number;
          schedule_instance_id?: string | null;
          skill_id?: string | null;
          monument_id?: string | null;
          award_key?: string | null;
          source?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          kind?: Database["public"]["Enums"]["xp_kind"];
          amount?: number;
          schedule_instance_id?: string | null;
          skill_id?: string | null;
          monument_id?: string | null;
          award_key?: string | null;
          source?: string | null;
        };
      };
      skill_progress: {
        Row: {
          user_id: string;
          skill_id: string;
          level: number;
          prestige: number;
          xp_into_level: number;
          total_xp: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          skill_id: string;
          level?: number;
          prestige?: number;
          xp_into_level?: number;
          total_xp?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          skill_id?: string;
          level?: number;
          prestige?: number;
          xp_into_level?: number;
          total_xp?: number;
          updated_at?: string;
        };
      };
      dark_xp_events: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          skill_id: string;
          new_skill_level: number;
          amount: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          skill_id: string;
          new_skill_level: number;
          amount?: number;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          skill_id?: string;
          new_skill_level?: number;
          amount?: number;
        };
      };
      user_progress: {
        Row: {
          user_id: string;
          total_dark_xp: number;
          current_level: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          total_dark_xp?: number;
          current_level?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          total_dark_xp?: number;
          current_level?: number;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, unknown>;
    Functions: {
      get_profile_user_id: {
        Args: {
          p_username: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      schedule_instance_source_type: 'PROJECT' | 'TASK';
      schedule_instance_status: 'scheduled' | 'completed' | 'missed' | 'canceled';
      xp_kind: 'task' | 'habit' | 'project' | 'goal' | 'manual';
    };
    CompositeTypes: Record<string, unknown>;
  };
}
