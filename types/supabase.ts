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
          recurrence_days: number[] | null;
          duration_minutes: number | null;
          window_id: string | null;
          skill_id: string | null;
          energy: string | null;
          location_context_id: string | null;
          daylight_preference: string | null;
          window_edge_preference: string | null;
          goal_id: string | null;
          completion_target: number | null;
          last_completed_at: string | null;
          current_streak_days: number;
          longest_streak_days: number;
          next_due_override: string | null;
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
          recurrence_days?: number[] | null;
          duration_minutes?: number | null;
          window_id?: string | null;
          skill_id?: string | null;
          energy?: string | null;
          location_context_id?: string | null;
          daylight_preference?: string | null;
          window_edge_preference?: string | null;
          goal_id?: string | null;
          completion_target?: number | null;
          last_completed_at?: string | null;
          current_streak_days?: number;
          longest_streak_days?: number;
          next_due_override?: string | null;
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
          recurrence_days?: number[] | null;
          duration_minutes?: number | null;
          window_id?: string | null;
          skill_id?: string | null;
          energy?: string | null;
          location_context_id?: string | null;
          daylight_preference?: string | null;
          window_edge_preference?: string | null;
          goal_id?: string | null;
          completion_target?: number | null;
          last_completed_at?: string | null;
          current_streak_days?: number;
          longest_streak_days?: number;
          next_due_override?: string | null;
        };
      };
      habit_completion_days: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          completion_day: string;
          completed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          habit_id: string;
          completion_day: string;
          completed_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          habit_id?: string;
          completion_day?: string;
          completed_at?: string;
        };
      };
      location_contexts: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          user_id: string;
          value: string;
          label: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
          value: string;
          label: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          value?: string;
          label?: string;
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
          completed_at: string | null;
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
          completed_at?: string | null;
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
          completed_at?: string | null;
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
          metadata: Json | null;
          parent_note_id: string | null;
          sibling_order: number | null;
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
          metadata?: Json | null;
          parent_note_id?: string | null;
          sibling_order?: number | null;
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
          metadata?: Json | null;
          parent_note_id?: string | null;
          sibling_order?: number | null;
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
      friend_contact_imports: {
        Row: {
          id: string;
          user_id: string;
          total_contacts: number;
          imported_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          total_contacts?: number;
          imported_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          total_contacts?: number;
          imported_at?: string;
          updated_at?: string;
        };
      };
      friend_discovery_profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          role: string | null;
          highlight: string | null;
          reason: string | null;
          mutual_friends: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          role?: string | null;
          highlight?: string | null;
          reason?: string | null;
          mutual_friends?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: string | null;
          highlight?: string | null;
          reason?: string | null;
          mutual_friends?: number;
          created_at?: string;
        };
      };
      friend_invites: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          status: string;
          sent_at: string;
          last_sent_at: string;
          sent_count: number;
          responded_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          status?: string;
          sent_at?: string;
          last_sent_at?: string;
          sent_count?: number;
          responded_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          status?: string;
          sent_at?: string;
          last_sent_at?: string;
          sent_count?: number;
          responded_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      friend_requests: {
        Row: {
          id: string;
          requester_id: string;
          requester_username: string;
          requester_display_name: string | null;
          requester_avatar_url: string | null;
          target_id: string;
          target_username: string;
          target_display_name: string | null;
          target_avatar_url: string | null;
          note: string | null;
          status: string;
          mutual_friends: number;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          requester_username: string;
          requester_display_name?: string | null;
          requester_avatar_url?: string | null;
          target_id: string;
          target_username: string;
          target_display_name?: string | null;
          target_avatar_url?: string | null;
          note?: string | null;
          status?: string;
          mutual_friends?: number;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          requester_username?: string;
          requester_display_name?: string | null;
          requester_avatar_url?: string | null;
          target_id?: string;
          target_username?: string;
          target_display_name?: string | null;
          target_avatar_url?: string | null;
          note?: string | null;
          status?: string;
          mutual_friends?: number;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
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
          timezone: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          username: string;
          timezone?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string | null;
          username?: string;
          timezone?: string | null;
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
          location_context_id: string | null;
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
          location_context_id?: string | null;
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
          location_context_id?: string | null;
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
        locked: boolean;
        event_name: string | null;
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
        locked?: boolean;
        event_name?: string | null;
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
        locked?: boolean;
        event_name?: string | null;
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
      badges: {
        Row: {
          id: string;
          created_at: string;
          badge_type: "user_prestige_badge" | "skill_prestige_badge" | "skill_level_badge";
          level: number;
          emoji: string;
          label: string;
          description: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          badge_type: "user_prestige_badge" | "skill_prestige_badge" | "skill_level_badge";
          level: number;
          emoji: string;
          label: string;
          description?: string | null;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          badge_type?: "user_prestige_badge" | "skill_prestige_badge" | "skill_level_badge";
          level?: number;
          emoji?: string;
          label?: string;
          description?: string | null;
          metadata?: Json | null;
        };
      };
      skill_badges: {
        Row: {
          id: string;
          user_id: string;
          skill_id: string;
          badge_id: string;
          awarded_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_id: string;
          badge_id: string;
          awarded_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          skill_id?: string;
          badge_id?: string;
          awarded_at?: string;
        };
      };
      user_badges: {
        Row: {
          id: string;
          user_id: string;
          badge_id: string;
          awarded_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          badge_id: string;
          awarded_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          badge_id?: string;
          awarded_at?: string;
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
          prestige: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          total_dark_xp?: number;
          current_level?: number;
          prestige?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          total_dark_xp?: number;
          current_level?: number;
          prestige?: number;
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
      schedule_instance_source_type: 'PROJECT' | 'TASK' | 'HABIT';
      schedule_instance_status: 'scheduled' | 'completed' | 'missed' | 'canceled';
      xp_kind: 'task' | 'habit' | 'project' | 'goal' | 'manual';
    };
    CompositeTypes: Record<string, unknown>;
  };
}
