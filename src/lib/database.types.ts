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
      announcement_acks: {
        Row: {
          acked_at: string
          announcement_id: string
          user_id: string
        }
        Insert: {
          acked_at?: string
          announcement_id: string
          user_id: string
        }
        Update: {
          acked_at?: string
          announcement_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_acks_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_acks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string | null
          body: string
          department_ids: string[]
          expires_at: string | null
          id: string
          kind: string
          mandatory: boolean
          org_id: string
          pinned: boolean
          published_at: string
          title: string
        }
        Insert: {
          author_id?: string | null
          body: string
          department_ids?: string[]
          expires_at?: string | null
          id?: string
          kind?: string
          mandatory?: boolean
          org_id: string
          pinned?: boolean
          published_at?: string
          title: string
        }
        Update: {
          author_id?: string | null
          body?: string
          department_ids?: string[]
          expires_at?: string | null
          id?: string
          kind?: string
          mandatory?: boolean
          org_id?: string
          pinned?: boolean
          published_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_events: {
        Row: {
          action: string
          actor_id: string | null
          approval_id: string
          created_at: string
          id: number
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          approval_id: string
          created_at?: string
          id?: never
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          approval_id?: string
          created_at?: string
          id?: never
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_events_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          amount: number | null
          approver_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          delegated_from: string | null
          description: string | null
          due_date: string | null
          file_id: string | null
          id: string
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          task_id: string | null
          title: string
          type: Database["public"]["Enums"]["approval_type"]
        }
        Insert: {
          amount?: number | null
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          delegated_from?: string | null
          description?: string | null
          due_date?: string | null
          file_id?: string | null
          id?: string
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          task_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["approval_type"]
        }
        Update: {
          amount?: number | null
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          delegated_from?: string | null
          description?: string | null
          due_date?: string | null
          file_id?: string | null
          id?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          task_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["approval_type"]
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_delegated_from_fkey"
            columns: ["delegated_from"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          new_value: Json | null
          old_value: Json | null
          org_id: string | null
          project_id: string | null
          summary: string | null
          task_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          org_id?: string | null
          project_id?: string | null
          summary?: string | null
          task_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          org_id?: string | null
          project_id?: string | null
          summary?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          meeting_id: string | null
          org_id: string
          project_id: string | null
          starts_at: string
          task_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          meeting_id?: string | null
          org_id: string
          project_id?: string | null
          starts_at: string
          task_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          meeting_id?: string | null
          org_id?: string
          project_id?: string | null
          starts_at?: string
          task_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          joined_at: string
          last_read_at: string
          muted: boolean
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          classification: Database["public"]["Enums"]["classification"]
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          dm_key: string | null
          id: string
          is_private: boolean
          is_readonly: boolean
          last_message_at: string | null
          name: string
          org_id: string
          project_id: string | null
          slug: string | null
          task_id: string | null
          type: Database["public"]["Enums"]["channel_type"]
        }
        Insert: {
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          dm_key?: string | null
          id?: string
          is_private?: boolean
          is_readonly?: boolean
          last_message_at?: string | null
          name: string
          org_id: string
          project_id?: string | null
          slug?: string | null
          task_id?: string | null
          type?: Database["public"]["Enums"]["channel_type"]
        }
        Update: {
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          dm_key?: string | null
          id?: string
          is_private?: boolean
          is_readonly?: boolean
          last_message_at?: string | null
          name?: string
          org_id?: string
          project_id?: string | null
          slug?: string | null
          task_id?: string | null
          type?: Database["public"]["Enums"]["channel_type"]
        }
        Relationships: [
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          channel_id: string | null
          classification: Database["public"]["Enums"]["classification"]
          created_at: string
          decided_at: string
          decided_by: string | null
          decision: string
          department_id: string | null
          follow_up: string | null
          id: string
          meeting_id: string | null
          message_id: string | null
          org_id: string
          participants: string[]
          project_id: string | null
          reason: string | null
          title: string
        }
        Insert: {
          channel_id?: string | null
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision: string
          department_id?: string | null
          follow_up?: string | null
          id?: string
          meeting_id?: string | null
          message_id?: string | null
          org_id: string
          participants?: string[]
          project_id?: string | null
          reason?: string | null
          title: string
        }
        Update: {
          channel_id?: string | null
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision?: string
          department_id?: string | null
          follow_up?: string | null
          id?: string
          meeting_id?: string | null
          message_id?: string | null
          org_id?: string
          participants?: string[]
          project_id?: string | null
          reason?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          created_at: string
          description: string | null
          head_id: string | null
          icon: string | null
          id: string
          name: string
          org_id: string
          position: number
          slug: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          head_id?: string | null
          icon?: string | null
          id?: string
          name: string
          org_id: string
          position?: number
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          head_id?: string | null
          icon?: string | null
          id?: string
          name?: string
          org_id?: string
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_fk"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          created_at: string
          file_id: string
          id: string
          mime_type: string | null
          note: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          created_at?: string
          file_id: string
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          version: number
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          created_at?: string
          file_id?: string
          id?: string
          mime_type?: string | null
          note?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          classification: Database["public"]["Enums"]["classification"]
          created_at: string
          current_version: number
          department_id: string | null
          folder: string
          id: string
          name: string
          org_id: string
          owner_id: string | null
          project_id: string | null
          tags: string[]
          task_id: string | null
          updated_at: string
        }
        Insert: {
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          current_version?: number
          department_id?: string | null
          folder?: string
          id?: string
          name: string
          org_id: string
          owner_id?: string | null
          project_id?: string | null
          tags?: string[]
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          current_version?: number
          department_id?: string | null
          folder?: string
          id?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          project_id?: string | null
          tags?: string[]
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_votes: {
        Row: {
          idea_id: string
          user_id: string
        }
        Insert: {
          idea_id: string
          user_id: string
        }
        Update: {
          idea_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          org_id: string
          project_id: string | null
          status: string
          title: string
          votes: number
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          org_id: string
          project_id?: string | null
          status?: string
          title: string
          votes?: number
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          org_id?: string
          project_id?: string | null
          status?: string
          title?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "ideas_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          manager_id: string | null
          org_id: string
          role: Database["public"]["Enums"]["role_level"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          manager_id?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["role_level"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          manager_id?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["role_level"]
        }
        Relationships: [
          {
            foreignKeyName: "invites_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leaves: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          kind: string
          note: string | null
          org_id: string
          starts_on: string
          status: Database["public"]["Enums"]["approval_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          kind?: string
          note?: string | null
          org_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["approval_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          kind?: string
          note?: string | null
          org_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["approval_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaves_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_actions: {
        Row: {
          confirmed: boolean
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          meeting_id: string
          owner_id: string | null
          task_id: string | null
          title: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          meeting_id: string
          owner_id?: string | null
          task_id?: string | null
          title: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          meeting_id?: string
          owner_id?: string | null
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_actions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_actions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_actions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          meeting_id: string
          user_id: string
        }
        Insert: {
          meeting_id: string
          user_id: string
        }
        Update: {
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          created_at: string
          department_id: string | null
          ends_at: string | null
          id: string
          location: string | null
          meeting_link: string | null
          notes: string | null
          org_id: string
          organizer_id: string | null
          project_id: string | null
          recording_url: string | null
          starts_at: string
          summary: string | null
          title: string
          transcript: string | null
        }
        Insert: {
          agenda?: string | null
          created_at?: string
          department_id?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id: string
          organizer_id?: string | null
          project_id?: string | null
          recording_url?: string | null
          starts_at: string
          summary?: string | null
          title: string
          transcript?: string | null
        }
        Update: {
          agenda?: string | null
          created_at?: string
          department_id?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id?: string
          organizer_id?: string | null
          project_id?: string | null
          recording_url?: string | null
          starts_at?: string
          summary?: string | null
          title?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          emoji?: string
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
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          author_id: string | null
          body: string
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          kind: Database["public"]["Enums"]["message_kind"]
          mentions: string[]
          parent_id: string | null
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          body?: string
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          mentions?: string[]
          parent_id?: string | null
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          body?: string
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          mentions?: string[]
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          position: number
          project_id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          project_id: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          tagline: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          tagline?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          tagline?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_external: boolean
          joined_at: string | null
          last_seen_at: string | null
          manager_id: string | null
          org_id: string | null
          phone: string | null
          presence: Database["public"]["Enums"]["presence_status"]
          role: Database["public"]["Enums"]["role_level"]
          skills: string[]
          status_text: string | null
          team_id: string | null
          timezone: string | null
          updated_at: string
          working_hours: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          is_external?: boolean
          joined_at?: string | null
          last_seen_at?: string | null
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          presence?: Database["public"]["Enums"]["presence_status"]
          role?: Database["public"]["Enums"]["role_level"]
          skills?: string[]
          status_text?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
          working_hours?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_external?: boolean
          joined_at?: string | null
          last_seen_at?: string | null
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          presence?: Database["public"]["Enums"]["presence_status"]
          role?: Database["public"]["Enums"]["role_level"]
          skills?: string[]
          status_text?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
          working_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_risks: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mitigation: string | null
          owner_id: string | null
          project_id: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["task_priority"]
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mitigation?: string | null
          owner_id?: string | null
          project_id: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["task_priority"]
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mitigation?: string | null
          owner_id?: string | null
          project_id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["task_priority"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_risks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_risks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          department_slug: string | null
          description: string | null
          id: string
          key: string
          milestones: Json
          name: string
          org_id: string | null
          tasks: Json
        }
        Insert: {
          department_slug?: string | null
          description?: string | null
          id?: string
          key: string
          milestones?: Json
          name: string
          org_id?: string | null
          tasks?: Json
        }
        Update: {
          department_slug?: string | null
          description?: string | null
          id?: string
          key?: string
          milestones?: Json
          name?: string
          org_id?: string | null
          tasks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          classification: Database["public"]["Enums"]["classification"]
          client_name: string | null
          code: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          objectives: string | null
          org_id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[]
          template_key: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          classification?: Database["public"]["Enums"]["classification"]
          client_name?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          objectives?: string | null
          org_id: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[]
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          classification?: Database["public"]["Enums"]["classification"]
          client_name?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          objectives?: string | null
          org_id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[]
          template_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist: {
        Row: {
          done: boolean
          id: string
          label: string
          position: number
          task_id: string
        }
        Insert: {
          done?: boolean
          id?: string
          label: string
          position?: number
          task_id: string
        }
        Update: {
          done?: boolean
          id?: string
          label?: string
          position?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_collaborators: {
        Row: {
          task_id: string
          user_id: string
        }
        Insert: {
          task_id: string
          user_id: string
        }
        Update: {
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          attachments: Json
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          depends_on_id: string
          task_id: string
        }
        Insert: {
          depends_on_id: string
          task_id: string
        }
        Update: {
          depends_on_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string
          id: number
          new_value: string | null
          old_value: string | null
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field: string
          id?: never
          new_value?: string | null
          old_value?: string | null
          task_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string
          id?: never
          new_value?: string | null
          old_value?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          checklist: Json
          department_slug: string | null
          description: string | null
          estimated_hours: number | null
          id: string
          name: string
          org_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          subtasks: Json
        }
        Insert: {
          checklist?: Json
          department_slug?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string
          name: string
          org_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          subtasks?: Json
        }
        Update: {
          checklist?: Json
          department_slug?: string | null
          description?: string | null
          estimated_hours?: number | null
          id?: string
          name?: string
          org_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          subtasks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_hours: number | null
          approver_id: string | null
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          delegated_by: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          milestone_id: string | null
          org_id: string
          owner_id: string | null
          parent_id: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          recurrence: Json | null
          requires_approval: boolean
          source_decision_id: string | null
          source_meeting_id: string | null
          source_message_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          title: string
          updated_at: string
          waiting_note: string | null
          waiting_on: Database["public"]["Enums"]["waiting_on"]
          waiting_on_user_id: string | null
        }
        Insert: {
          actual_hours?: number | null
          approver_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delegated_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          milestone_id?: string | null
          org_id: string
          owner_id?: string | null
          parent_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence?: Json | null
          requires_approval?: boolean
          source_decision_id?: string | null
          source_meeting_id?: string | null
          source_message_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title: string
          updated_at?: string
          waiting_note?: string | null
          waiting_on?: Database["public"]["Enums"]["waiting_on"]
          waiting_on_user_id?: string | null
        }
        Update: {
          actual_hours?: number | null
          approver_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delegated_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          milestone_id?: string | null
          org_id?: string
          owner_id?: string | null
          parent_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence?: Json | null
          requires_approval?: boolean
          source_decision_id?: string | null
          source_meeting_id?: string | null
          source_message_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          waiting_note?: string | null
          waiting_on?: Database["public"]["Enums"]["waiting_on"]
          waiting_on_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_delegated_by_fkey"
            columns: ["delegated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_decision_id_fkey"
            columns: ["source_decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_meeting_fk"
            columns: ["source_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_message_fk"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_waiting_on_user_id_fkey"
            columns: ["waiting_on_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          department_id: string
          id: string
          lead_id: string | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          lead_id?: string | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          lead_id?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_lead_fk"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_pages: {
        Row: {
          author_id: string | null
          body: string
          category: string
          classification: Database["public"]["Enums"]["classification"]
          created_at: string
          department_id: string | null
          id: string
          org_id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          category?: string
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          department_id?: string | null
          id?: string
          org_id: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          category?: string
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          department_id?: string | null
          id?: string
          org_id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_pages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_pages_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_task: { Args: { t: string }; Returns: boolean }
      can_view_channel: { Args: { c: string }; Returns: boolean }
      can_view_classification: {
        Args: { c: Database["public"]["Enums"]["classification"] }
        Returns: boolean
      }
      can_view_project: { Args: { p: string }; Returns: boolean }
      can_view_task: { Args: { t: string }; Returns: boolean }
      company_pulse: { Args: never; Returns: Json }
      create_delegation: {
        Args: {
          p_approver: string
          p_project: string
          p_summary: string
          steps: Json
        }
        Returns: string[]
      }
      create_project_from_template: {
        Args: {
          p_department?: string
          p_due: string
          p_name: string
          p_owner: string
          tpl_key: string
        }
        Returns: string
      }
      current_department: { Args: never; Returns: string }
      current_org: { Args: never; Returns: string }
      current_role_level: {
        Args: never
        Returns: Database["public"]["Enums"]["role_level"]
      }
      department_health: {
        Args: never
        Returns: {
          at_risk: number
          blocked: number
          color: string
          critical: number
          department_id: string
          name: string
          open_tasks: number
          overdue: number
          pending_approvals: number
          people: number
          projects: number
          slug: string
        }[]
      }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_channel_member: { Args: { c: string }; Returns: boolean }
      is_internal: { Args: never; Returns: boolean }
      is_lead_plus: { Args: never; Returns: boolean }
      is_manager_plus: { Args: never; Returns: boolean }
      is_project_member: { Args: { p: string }; Returns: boolean }
      mark_channel_read: { Args: { c: string }; Returns: undefined }
      my_unread_counts: {
        Args: never
        Returns: {
          channel_id: string
          unread: number
        }[]
      }
      open_dm: { Args: { other: string }; Returns: string }
      related_to: { Args: { eid: string; entity: string }; Returns: Json }
      role_rank: {
        Args: { r: Database["public"]["Enums"]["role_level"] }
        Returns: number
      }
      search_all: {
        Args: { lim?: number; q: string }
        Returns: {
          id: string
          kind: string
          link: string
          rank: number
          subtitle: string
          title: string
        }[]
      }
      task_from_message: {
        Args: {
          msg: string
          p_assignee: string
          p_due: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_title: string
        }
        Returns: string
      }
      workload: {
        Args: never
        Returns: {
          avatar_url: string
          blocked: number
          department_id: string
          designation: string
          due_week: number
          est_hours: number
          full_name: string
          on_leave: boolean
          open_tasks: number
          overdue: number
          presence: Database["public"]["Enums"]["presence_status"]
          urgent: number
          user_id: string
          waiting: number
        }[]
      }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected" | "changes_requested"
      approval_type:
        | "design"
        | "content"
        | "budget"
        | "purchase"
        | "hiring"
        | "leave"
        | "vendor"
        | "marketing"
        | "campaign"
        | "deployment"
        | "contract"
        | "expense"
        | "investor_material"
        | "other"
      channel_type:
        | "dm"
        | "group"
        | "department"
        | "project"
        | "company"
        | "announcement"
        | "task"
      classification:
        | "public"
        | "internal"
        | "confidential"
        | "highly_confidential"
        | "board_only"
      event_kind:
        | "meeting"
        | "deadline"
        | "campaign"
        | "event"
        | "release"
        | "interview"
        | "holiday"
        | "leave"
        | "publishing"
        | "client_meeting"
        | "compliance"
        | "milestone"
      message_kind: "text" | "voice" | "file" | "system" | "video"
      notification_kind:
        | "critical"
        | "action_required"
        | "mention"
        | "approval"
        | "deadline"
        | "information"
      presence_status:
        | "available"
        | "busy"
        | "in_meeting"
        | "dnd"
        | "away"
        | "offline"
        | "leave"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "at_risk"
        | "delayed"
        | "completed"
        | "cancelled"
      role_level:
        | "super_admin"
        | "director"
        | "executive"
        | "department_head"
        | "manager"
        | "team_lead"
        | "employee"
        | "intern"
        | "consultant"
        | "vendor"
        | "guest"
      task_priority: "critical" | "urgent" | "high" | "normal" | "low"
      task_status:
        | "backlog"
        | "todo"
        | "in_progress"
        | "in_review"
        | "waiting"
        | "blocked"
        | "done"
        | "cancelled"
      waiting_on:
        | "none"
        | "employee"
        | "manager"
        | "client"
        | "vendor"
        | "approval"
        | "blocked"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      approval_status: ["pending", "approved", "rejected", "changes_requested"],
      approval_type: [
        "design",
        "content",
        "budget",
        "purchase",
        "hiring",
        "leave",
        "vendor",
        "marketing",
        "campaign",
        "deployment",
        "contract",
        "expense",
        "investor_material",
        "other",
      ],
      channel_type: [
        "dm",
        "group",
        "department",
        "project",
        "company",
        "announcement",
        "task",
      ],
      classification: [
        "public",
        "internal",
        "confidential",
        "highly_confidential",
        "board_only",
      ],
      event_kind: [
        "meeting",
        "deadline",
        "campaign",
        "event",
        "release",
        "interview",
        "holiday",
        "leave",
        "publishing",
        "client_meeting",
        "compliance",
        "milestone",
      ],
      message_kind: ["text", "voice", "file", "system", "video"],
      notification_kind: [
        "critical",
        "action_required",
        "mention",
        "approval",
        "deadline",
        "information",
      ],
      presence_status: [
        "available",
        "busy",
        "in_meeting",
        "dnd",
        "away",
        "offline",
        "leave",
      ],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "at_risk",
        "delayed",
        "completed",
        "cancelled",
      ],
      role_level: [
        "super_admin",
        "director",
        "executive",
        "department_head",
        "manager",
        "team_lead",
        "employee",
        "intern",
        "consultant",
        "vendor",
        "guest",
      ],
      task_priority: ["critical", "urgent", "high", "normal", "low"],
      task_status: [
        "backlog",
        "todo",
        "in_progress",
        "in_review",
        "waiting",
        "blocked",
        "done",
        "cancelled",
      ],
      waiting_on: [
        "none",
        "employee",
        "manager",
        "client",
        "vendor",
        "approval",
        "blocked",
      ],
    },
  },
} as const
