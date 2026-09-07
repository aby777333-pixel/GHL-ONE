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
      access_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          level: string
          org_id: string
          reason: string | null
          resource_id: string
          resource_type: string
          revoked_at: string | null
          revoked_by: string | null
          source_request_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          level?: string
          org_id: string
          reason?: string | null
          resource_id: string
          resource_type: string
          revoked_at?: string | null
          revoked_by?: string | null
          source_request_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          level?: string
          org_id?: string
          reason?: string | null
          resource_id?: string
          resource_type?: string
          revoked_at?: string | null
          revoked_by?: string | null
          source_request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "access_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_requests: {
        Row: {
          approver_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          duration: string
          granted_level: string | null
          granted_until: string | null
          id: string
          level: string
          org_id: string
          project_id: string | null
          reason: string
          requester_id: string
          resource_id: string | null
          resource_label: string
          resource_type: string
          risk: string
          status: Database["public"]["Enums"]["approval_status"]
          until_at: string | null
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          duration?: string
          granted_level?: string | null
          granted_until?: string | null
          id?: string
          level?: string
          org_id: string
          project_id?: string | null
          reason: string
          requester_id: string
          resource_id?: string | null
          resource_label: string
          resource_type: string
          risk?: string
          status?: Database["public"]["Enums"]["approval_status"]
          until_at?: string | null
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          duration?: string
          granted_level?: string | null
          granted_until?: string | null
          id?: string
          level?: string
          org_id?: string
          project_id?: string | null
          reason?: string
          requester_id?: string
          resource_id?: string | null
          resource_label?: string
          resource_type?: string
          risk?: string
          status?: Database["public"]["Enums"]["approval_status"]
          until_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_assignments: {
        Row: {
          admin_role_id: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          org_id: string
          scope_department_id: string | null
          user_id: string
        }
        Insert: {
          admin_role_id: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          org_id: string
          scope_department_id?: string | null
          user_id: string
        }
        Update: {
          admin_role_id?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          org_id?: string
          scope_department_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_assignments_admin_role_id_fkey"
            columns: ["admin_role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_assignments_scope_department_id_fkey"
            columns: ["scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          org_id: string
          permissions: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          org_id: string
          permissions?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          org_id?: string
          permissions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          org_id: string
          scope: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          scope?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          scope?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          proposals: Json | null
          role: string
          sources: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          proposals?: Json | null
          role: string
          sources?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          proposals?: Json | null
          role?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_summaries: {
        Row: {
          content: Json
          created_at: string
          day: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          input_hash: string | null
          kind: string
          model: string | null
          org_id: string
          user_id: string | null
        }
        Insert: {
          content: Json
          created_at?: string
          day?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          input_hash?: string | null
          kind: string
          model?: string | null
          org_id: string
          user_id?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          day?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          input_hash?: string | null
          kind?: string
          model?: string | null
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          created_at: string
          feature: string
          id: number
          input_tokens: number
          latency_ms: number | null
          model: string
          org_id: string | null
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          created_at?: string
          feature: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model: string
          org_id?: string | null
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          created_at?: string
          feature?: string
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          model?: string
          org_id?: string | null
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      attendance_days: {
        Row: {
          corrected_by: string | null
          correction_note: string | null
          day: string
          first_in: string | null
          last_out: string | null
          late: boolean
          minutes_break: number
          minutes_worked: number
          missing_checkout: boolean
          mode: string | null
          org_id: string
          status: string
          user_id: string
        }
        Insert: {
          corrected_by?: string | null
          correction_note?: string | null
          day: string
          first_in?: string | null
          last_out?: string | null
          late?: boolean
          minutes_break?: number
          minutes_worked?: number
          missing_checkout?: boolean
          mode?: string | null
          org_id: string
          status?: string
          user_id: string
        }
        Update: {
          corrected_by?: string | null
          correction_note?: string | null
          day?: string
          first_in?: string | null
          last_out?: string | null
          late?: boolean
          minutes_break?: number
          minutes_worked?: number
          missing_checkout?: boolean
          mode?: string | null
          org_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          location: Json | null
          mode: string
          note: string | null
          occurred_at: string
          org_id: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          location?: Json | null
          mode?: string
          note?: string | null
          occurred_at?: string
          org_id: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          location?: Json | null
          mode?: string
          note?: string | null
          occurred_at?: string
          org_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      automation_runs: {
        Row: {
          automation_id: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          event: string
          id: number
          org_id: string
          status: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event: string
          id?: never
          org_id: string
          status?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event?: string
          id?: never
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          name: string
          next_run_at: string | null
          org_id: string
          run_count: number
          scope_department_id: string | null
          scope_project_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          org_id: string
          run_count?: number
          scope_department_id?: string | null
          scope_project_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          org_id?: string
          run_count?: number
          scope_department_id?: string | null
          scope_project_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_scope_department_id_fkey"
            columns: ["scope_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_scope_project_id_fkey"
            columns: ["scope_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      calendar_feed_tokens: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feed_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          expires_at: string | null
          invite_reason: string | null
          invited_by: string | null
          joined_at: string
          last_read_at: string
          muted: boolean
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          expires_at?: string | null
          invite_reason?: string | null
          invited_by?: string | null
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          expires_at?: string | null
          invite_reason?: string | null
          invited_by?: string | null
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
            foreignKeyName: "channel_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          archive_at: string | null
          archived: boolean
          classification: Database["public"]["Enums"]["classification"]
          co_owner_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          department_ids: string[]
          description: string | null
          dm_key: string | null
          help_request_id: string | null
          id: string
          is_private: boolean
          is_readonly: boolean
          last_message_at: string | null
          name: string
          org_id: string
          owner_id: string | null
          project_id: string | null
          purpose: string | null
          settings: Json
          slug: string | null
          task_id: string | null
          type: Database["public"]["Enums"]["channel_type"]
          visibility: string
        }
        Insert: {
          archive_at?: string | null
          archived?: boolean
          classification?: Database["public"]["Enums"]["classification"]
          co_owner_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          department_ids?: string[]
          description?: string | null
          dm_key?: string | null
          help_request_id?: string | null
          id?: string
          is_private?: boolean
          is_readonly?: boolean
          last_message_at?: string | null
          name: string
          org_id: string
          owner_id?: string | null
          project_id?: string | null
          purpose?: string | null
          settings?: Json
          slug?: string | null
          task_id?: string | null
          type?: Database["public"]["Enums"]["channel_type"]
          visibility?: string
        }
        Update: {
          archive_at?: string | null
          archived?: boolean
          classification?: Database["public"]["Enums"]["classification"]
          co_owner_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          department_ids?: string[]
          description?: string | null
          dm_key?: string | null
          help_request_id?: string | null
          id?: string
          is_private?: boolean
          is_readonly?: boolean
          last_message_at?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          project_id?: string | null
          purpose?: string | null
          settings?: Json
          slug?: string | null
          task_id?: string | null
          type?: Database["public"]["Enums"]["channel_type"]
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_co_owner_id_fkey"
            columns: ["co_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "channels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          escalation_matrix: string[]
          head_id: string | null
          icon: string | null
          id: string
          name: string
          on_duty_user_id: string | null
          org_id: string
          position: number
          services_intro: string | null
          settings: Json
          slug: string
          status: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          escalation_matrix?: string[]
          head_id?: string | null
          icon?: string | null
          id?: string
          name: string
          on_duty_user_id?: string | null
          org_id: string
          position?: number
          services_intro?: string | null
          settings?: Json
          slug: string
          status?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          escalation_matrix?: string[]
          head_id?: string | null
          icon?: string | null
          id?: string
          name?: string
          on_duty_user_id?: string | null
          org_id?: string
          position?: number
          services_intro?: string | null
          settings?: Json
          slug?: string
          status?: string
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
            foreignKeyName: "departments_on_duty_user_id_fkey"
            columns: ["on_duty_user_id"]
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
      escalation_log: {
        Row: {
          rule_id: string
          sent_at: string
          task_id: string
        }
        Insert: {
          rule_id: string
          sent_at?: string
          task_id: string
        }
        Update: {
          rule_id?: string
          sent_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "escalation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_rules: {
        Row: {
          created_at: string
          enabled: boolean
          hours_after_due: number
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          name: string
          notify: string[]
          org_id: string
          position: number
          priority: Database["public"]["Enums"]["task_priority"] | null
          respect_quiet_hours: boolean
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          hours_after_due: number
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          name: string
          notify: string[]
          org_id: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"] | null
          respect_quiet_hours?: boolean
        }
        Update: {
          created_at?: string
          enabled?: boolean
          hours_after_due?: number
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          name?: string
          notify?: string[]
          org_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"] | null
          respect_quiet_hours?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "escalation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          beta: boolean
          department_ids: string[] | null
          enabled: boolean
          feature: string
          org_id: string
        }
        Insert: {
          beta?: boolean
          department_ids?: string[] | null
          enabled?: boolean
          feature: string
          org_id: string
        }
        Update: {
          beta?: boolean
          department_ids?: string[] | null
          enabled?: boolean
          feature?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_org_id_fkey"
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
      handoffs: {
        Row: {
          created_at: string
          from_department_id: string | null
          from_user_id: string | null
          id: string
          note: string | null
          org_id: string
          package: Json
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["handoff_status"]
          task_id: string
          to_department_id: string
          to_user_id: string | null
        }
        Insert: {
          created_at?: string
          from_department_id?: string | null
          from_user_id?: string | null
          id?: string
          note?: string | null
          org_id: string
          package?: Json
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["handoff_status"]
          task_id: string
          to_department_id: string
          to_user_id?: string | null
        }
        Update: {
          created_at?: string
          from_department_id?: string | null
          from_user_id?: string | null
          id?: string
          note?: string | null
          org_id?: string
          package?: Json
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["handoff_status"]
          task_id?: string
          to_department_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handoffs_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_requests: {
        Row: {
          ack_due_at: string | null
          acknowledged_at: string | null
          attachments: Json
          channel_id: string | null
          completed_at: string | null
          created_at: string
          deadline: string | null
          department_id: string
          details: string | null
          escalation_level: number
          form_data: Json
          id: string
          org_id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          requester_department_id: string | null
          requester_id: string
          service_id: string | null
          status: Database["public"]["Enums"]["help_status"]
          task_id: string | null
          title: string
          updated_at: string
          visible_on_board: boolean
        }
        Insert: {
          ack_due_at?: string | null
          acknowledged_at?: string | null
          attachments?: Json
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          department_id: string
          details?: string | null
          escalation_level?: number
          form_data?: Json
          id?: string
          org_id: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          requester_department_id?: string | null
          requester_id: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["help_status"]
          task_id?: string | null
          title: string
          updated_at?: string
          visible_on_board?: boolean
        }
        Update: {
          ack_due_at?: string | null
          acknowledged_at?: string | null
          attachments?: Json
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          department_id?: string
          details?: string | null
          escalation_level?: number
          form_data?: Json
          id?: string
          org_id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          requester_department_id?: string | null
          requester_id?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["help_status"]
          task_id?: string | null
          title?: string
          updated_at?: string
          visible_on_board?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_requester_department_id_fkey"
            columns: ["requester_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_task_id_fkey"
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
      integration_deliveries: {
        Row: {
          created_at: string
          error: string | null
          event: string
          id: number
          integration_id: string
          payload: Json | null
          request_id: number | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          id?: never
          integration_id: string
          payload?: Json | null
          request_id?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          id?: never
          integration_id?: string
          payload?: Json | null
          request_id?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_deliveries_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          last_used_at: string | null
          name: string
          org_id: string
          provider: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          name: string
          org_id: string
          provider: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      leave_balances: {
        Row: {
          allocated: number
          leave_type_id: string
          used: number
          user_id: string
          year: number
        }
        Insert: {
          allocated?: number
          leave_type_id: string
          used?: number
          user_id: string
          year: number
        }
        Update: {
          allocated?: number
          leave_type_id?: string
          used?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          active: boolean
          annual_quota: number
          code: string
          color: string
          id: string
          name: string
          org_id: string
          paid: boolean
          position: number
          requires_hr: boolean
        }
        Insert: {
          active?: boolean
          annual_quota?: number
          code: string
          color?: string
          id?: string
          name: string
          org_id: string
          paid?: boolean
          position?: number
          requires_hr?: boolean
        }
        Update: {
          active?: boolean
          annual_quota?: number
          code?: string
          color?: string
          id?: string
          name?: string
          org_id?: string
          paid?: boolean
          position?: number
          requires_hr?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_org_id_fkey"
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
          days: number | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          ends_on: string
          half_day: boolean
          handover: Json | null
          hr_decision: Database["public"]["Enums"]["approval_status"] | null
          id: string
          kind: string
          leave_type_id: string | null
          manager_decision:
            | Database["public"]["Enums"]["approval_status"]
            | null
          manager_id: string | null
          note: string | null
          org_id: string
          starts_on: string
          status: Database["public"]["Enums"]["approval_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          days?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ends_on: string
          half_day?: boolean
          handover?: Json | null
          hr_decision?: Database["public"]["Enums"]["approval_status"] | null
          id?: string
          kind?: string
          leave_type_id?: string | null
          manager_decision?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          manager_id?: string | null
          note?: string | null
          org_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["approval_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ends_on?: string
          half_day?: boolean
          handover?: Json | null
          hr_decision?: Database["public"]["Enums"]["approval_status"] | null
          id?: string
          kind?: string
          leave_type_id?: string | null
          manager_decision?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          manager_id?: string | null
          note?: string | null
          org_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["approval_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaves_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaves_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaves_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      notification_prefs: {
        Row: {
          digest_kinds: string[]
          dnd_until: string | null
          mode: string
          muted_channels: string[]
          priority_people: string[]
          quiet_end: string | null
          quiet_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          digest_kinds?: string[]
          dnd_until?: string | null
          mode?: string
          muted_channels?: string[]
          priority_people?: string[]
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          digest_kinds?: string[]
          dnd_until?: string | null
          mode?: string
          muted_channels?: string[]
          priority_people?: string[]
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          employee_code: string | null
          employment_type: string
          full_name: string
          id: string
          is_active: boolean
          is_external: boolean
          joined_at: string | null
          languages: string[]
          last_seen_at: string | null
          location: string | null
          manager_id: string | null
          org_id: string | null
          phone: string | null
          presence: Database["public"]["Enums"]["presence_status"]
          probation_ends_on: string | null
          qualifications: string | null
          responsibilities: string | null
          role: Database["public"]["Enums"]["role_level"]
          secondary_manager_id: string | null
          shift_id: string | null
          skills: string[]
          status_text: string | null
          status_until: string | null
          team_id: string | null
          timezone: string | null
          updated_at: string
          work_mode: string
          working_hours: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          employee_code?: string | null
          employment_type?: string
          full_name?: string
          id: string
          is_active?: boolean
          is_external?: boolean
          joined_at?: string | null
          languages?: string[]
          last_seen_at?: string | null
          location?: string | null
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          presence?: Database["public"]["Enums"]["presence_status"]
          probation_ends_on?: string | null
          qualifications?: string | null
          responsibilities?: string | null
          role?: Database["public"]["Enums"]["role_level"]
          secondary_manager_id?: string | null
          shift_id?: string | null
          skills?: string[]
          status_text?: string | null
          status_until?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
          work_mode?: string
          working_hours?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_code?: string | null
          employment_type?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_external?: boolean
          joined_at?: string | null
          languages?: string[]
          last_seen_at?: string | null
          location?: string | null
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          presence?: Database["public"]["Enums"]["presence_status"]
          probation_ends_on?: string | null
          qualifications?: string | null
          responsibilities?: string | null
          role?: Database["public"]["Enums"]["role_level"]
          secondary_manager_id?: string | null
          shift_id?: string | null
          skills?: string[]
          status_text?: string | null
          status_until?: string | null
          team_id?: string | null
          timezone?: string | null
          updated_at?: string
          work_mode?: string
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
            foreignKeyName: "profiles_secondary_manager_id_fkey"
            columns: ["secondary_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shift_fk"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
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
      profiles_private: {
        Row: {
          address: string | null
          date_of_birth: string | null
          emergency_contact: Json | null
          notes: string | null
          personal_email: string | null
          show_birthday: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          date_of_birth?: string | null
          emergency_contact?: Json | null
          notes?: string | null
          personal_email?: string | null
          show_birthday?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          date_of_birth?: string | null
          emergency_contact?: Json | null
          notes?: string | null
          personal_email?: string | null
          show_birthday?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      security_events: {
        Row: {
          created_at: string
          details: Json | null
          id: number
          ip: string | null
          kind: string
          org_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: never
          ip?: string | null
          kind: string
          org_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: never
          ip?: string | null
          kind?: string
          org_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          active: boolean
          created_at: string
          default_owner_id: string | null
          default_priority: Database["public"]["Enums"]["task_priority"]
          department_id: string
          description: string | null
          form_schema: Json
          id: string
          name: string
          org_id: string
          position: number
          sla_ack_minutes: number
          sla_resolve_minutes: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_owner_id?: string | null
          default_priority?: Database["public"]["Enums"]["task_priority"]
          department_id: string
          description?: string | null
          form_schema?: Json
          id?: string
          name: string
          org_id: string
          position?: number
          sla_ack_minutes?: number
          sla_resolve_minutes?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          default_owner_id?: string | null
          default_priority?: Database["public"]["Enums"]["task_priority"]
          department_id?: string
          description?: string | null
          form_schema?: Json
          id?: string
          name?: string
          org_id?: string
          position?: number
          sla_ack_minutes?: number
          sla_resolve_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_default_owner_id_fkey"
            columns: ["default_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          note: string | null
          org_id: string
          shift_id: string
          starts_on: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          note?: string | null
          org_id: string
          shift_id: string
          starts_on: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          note?: string | null
          org_id?: string
          shift_id?: string
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swaps: {
        Row: {
          created_at: string
          day: string
          decided_at: string | null
          decided_by: string | null
          from_shift_id: string | null
          id: string
          org_id: string
          reason: string | null
          requester_id: string
          status: Database["public"]["Enums"]["approval_status"]
          to_shift_id: string | null
          with_user_id: string | null
        }
        Insert: {
          created_at?: string
          day: string
          decided_at?: string | null
          decided_by?: string | null
          from_shift_id?: string | null
          id?: string
          org_id: string
          reason?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          to_shift_id?: string | null
          with_user_id?: string | null
        }
        Update: {
          created_at?: string
          day?: string
          decided_at?: string | null
          decided_by?: string | null
          from_shift_id?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          to_shift_id?: string | null
          with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_swaps_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_from_shift_id_fkey"
            columns: ["from_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_to_shift_id_fkey"
            columns: ["to_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swaps_with_user_id_fkey"
            columns: ["with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          active: boolean
          color: string
          created_at: string
          days: number[]
          department_id: string | null
          end_time: string
          id: string
          kind: string
          name: string
          org_id: string
          start_time: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          days?: number[]
          department_id?: string | null
          end_time?: string
          id?: string
          kind?: string
          name: string
          org_id: string
          start_time?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          days?: number[]
          department_id?: string | null
          end_time?: string
          id?: string
          kind?: string
          name?: string
          org_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      time_entries: {
        Row: {
          confirmed: boolean
          created_at: string
          ended_at: string | null
          id: string
          meeting_id: string | null
          minutes: number | null
          note: string | null
          org_id: string
          source: string
          started_at: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          meeting_id?: string | null
          minutes?: number | null
          note?: string | null
          org_id: string
          source?: string
          started_at?: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          ended_at?: string | null
          id?: string
          meeting_id?: string | null
          minutes?: number | null
          note?: string | null
          org_id?: string
          source?: string
          started_at?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      activity_timeline: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: {
          kind: string
          link: string
          occurred_at: string
          title: string
        }[]
      }
      attendance_board: {
        Args: { p_day?: string }
        Returns: {
          att_status: string
          avatar_url: string
          department_id: string
          designation: string
          first_in: string
          full_name: string
          in_meeting: boolean
          last_out: string
          late: boolean
          leave_kind: string
          minutes_worked: number
          on_leave: boolean
          presence: Database["public"]["Enums"]["presence_status"]
          shift_name: string
          status_text: string
          user_id: string
        }[]
      }
      attendance_recompute: {
        Args: { p_day: string; p_user: string }
        Returns: undefined
      }
      automation_ctx: { Args: { p_entity: string; p_row: Json }; Returns: Json }
      bring_in: {
        Args: {
          p_channel: string
          p_expires_at?: string
          p_reason?: string
          p_user: string
        }
        Returns: undefined
      }
      calendar_feed: {
        Args: { p_token: string }
        Returns: {
          all_day: boolean
          description: string
          ends_at: string
          starts_at: string
          summary: string
          uid: string
          url: string
        }[]
      }
      can_edit_task: { Args: { t: string }; Returns: boolean }
      can_view_channel: { Args: { c: string }; Returns: boolean }
      can_view_classification: {
        Args: { c: Database["public"]["Enums"]["classification"] }
        Returns: boolean
      }
      can_view_project: { Args: { p: string }; Returns: boolean }
      can_view_task: { Args: { t: string }; Returns: boolean }
      clear_expired_dnd: { Args: never; Returns: number }
      clock: {
        Args: {
          p_kind: string
          p_location?: Json
          p_mode?: string
          p_note?: string
          p_source?: string
        }
        Returns: Json
      }
      collaboration_map: {
        Args: never
        Returns: {
          avg_ack_minutes: number
          from_department_id: string
          from_name: string
          handoffs: number
          help_requests: number
          shared_rooms: number
          to_department_id: string
          to_name: string
        }[]
      }
      company_now: { Args: never; Returns: Json }
      company_pulse: { Args: never; Returns: Json }
      convert_channel_to_project: {
        Args: { p_channel: string; p_due?: string; p_name: string }
        Returns: string
      }
      correct_attendance: {
        Args: {
          p_day: string
          p_note: string
          p_status: string
          p_user: string
        }
        Returns: undefined
      }
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
      department_availability: {
        Args: never
        Returns: {
          available: number
          avg_ack_minutes: number
          busy: number
          color: string
          department_id: string
          name: string
          on_duty_user_id: string
          on_leave: number
          open_requests: number
          services: number
          slug: string
          status: string
        }[]
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
      escalate_help_requests: { Args: never; Returns: number }
      eval_condition: { Args: { cond: Json; ctx: Json }; Returns: boolean }
      expire_access_grants: { Args: never; Returns: number }
      expire_collaboration: { Args: never; Returns: number }
      explain_access: {
        Args: { p_id: string; p_type: string; p_user: string }
        Returns: Json
      }
      fire_automations: {
        Args: { p_entity: string; p_event: string; p_old?: Json; p_row: Json }
        Returns: number
      }
      has_admin_perm: { Args: { perm: string }; Returns: boolean }
      has_grant: {
        Args: { p_id: string; p_level?: string; p_type: string }
        Returns: boolean
      }
      in_quiet_hours: { Args: { uid: string }; Returns: boolean }
      ingest_webhook: {
        Args: { p_payload: Json; p_token: string }
        Returns: Json
      }
      invite_department: {
        Args: { p_channel: string; p_department: string; p_reason?: string }
        Returns: number
      }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_channel_member: { Args: { c: string }; Returns: boolean }
      is_internal: { Args: never; Returns: boolean }
      is_lead_plus: { Args: never; Returns: boolean }
      is_manager_plus: { Args: never; Returns: boolean }
      is_primary_admin: { Args: never; Returns: boolean }
      is_project_member: { Args: { p: string }; Returns: boolean }
      leave_days: {
        Args: { p_from: string; p_half: boolean; p_to: string }
        Returns: number
      }
      leave_impact: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: Json
      }
      mark_channel_read: { Args: { c: string }; Returns: undefined }
      my_attendance: {
        Args: { p_from: string; p_to: string }
        Returns: {
          corrected_by: string | null
          correction_note: string | null
          day: string
          first_in: string | null
          last_out: string | null
          late: boolean
          minutes_break: number
          minutes_worked: number
          missing_checkout: boolean
          mode: string | null
          org_id: string
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "attendance_days"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_calendar_token: { Args: never; Returns: string }
      my_leave_balances: {
        Args: { p_user?: string }
        Returns: {
          allocated: number
          code: string
          color: string
          leave_type_id: string
          name: string
          pending: number
          remaining: number
          used: number
        }[]
      }
      my_unread_counts: {
        Args: never
        Returns: {
          channel_id: string
          unread: number
        }[]
      }
      open_dm: { Args: { other: string }; Returns: string }
      person_name: { Args: { uid: string }; Returns: string }
      prepare_handover: {
        Args: {
          p_backup: string
          p_leave: string
          p_notes?: string
          p_task_ids?: string[]
        }
        Returns: Json
      }
      related_to: { Args: { eid: string; entity: string }; Returns: Json }
      render_tpl: { Args: { ctx: Json; tpl: string }; Returns: string }
      resolve_targets: {
        Args: { ctx: Json; target: string }
        Returns: string[]
      }
      restore_handovers: { Args: never; Returns: number }
      revoke_everywhere: {
        Args: { p_reason: string; p_user: string }
        Returns: Json
      }
      revoke_grant: {
        Args: { p_grant: string; p_reason?: string }
        Returns: undefined
      }
      role_rank: {
        Args: { r: Database["public"]["Enums"]["role_level"] }
        Returns: number
      }
      roster: {
        Args: { p_department?: string; p_from: string; p_to: string }
        Returns: {
          color: string
          day: string
          department_id: string
          end_time: string
          full_name: string
          on_leave: boolean
          shift_id: string
          shift_name: string
          start_time: string
          user_id: string
        }[]
      }
      rotate_calendar_token: { Args: never; Returns: string }
      run_automation_action: {
        Args: {
          act: Json
          aut: Database["public"]["Tables"]["automations"]["Row"]
          ctx: Json
          p_entity: string
        }
        Returns: Json
      }
      run_digests: { Args: { p_mode: string }; Returns: number }
      run_escalations: { Args: never; Returns: number }
      run_scheduled_automations: { Args: never; Returns: number }
      schedule_next_run: {
        Args: { cfg: Json; from_ts: string }
        Returns: string
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
      since_last_visit: { Args: { p_since: string }; Returns: Json }
      start_focus: {
        Args: { p_note?: string; p_task: string }
        Returns: string
      }
      stop_focus: { Args: never; Returns: Json }
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
      task_recurrence_next: {
        Args: { base: string; rec: Json }
        Returns: string
      }
      test_automation: { Args: { p_id: string; p_task: string }; Returns: Json }
      timesheet_suggestions: { Args: { p_day: string }; Returns: Json }
      view_as: { Args: { p_user: string }; Returns: Json }
      who_can_see: { Args: { p_id: string; p_type: string }; Returns: Json }
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
        | "temporary"
        | "client"
        | "vendor"
        | "social"
        | "emergency"
        | "management"
        | "team"
        | "help"
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
      handoff_status: "pending" | "accepted" | "rejected"
      help_status:
        | "new"
        | "accepted"
        | "working"
        | "waiting"
        | "completed"
        | "declined"
      message_kind: "text" | "voice" | "file" | "system" | "video"
      notification_kind:
        | "critical"
        | "action_required"
        | "mention"
        | "approval"
        | "deadline"
        | "information"
        | "help_request"
        | "security"
      presence_status:
        | "available"
        | "busy"
        | "in_meeting"
        | "dnd"
        | "away"
        | "offline"
        | "leave"
        | "focus"
        | "break"
        | "lunch"
        | "field"
        | "remote"
        | "on_call"
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
        "temporary",
        "client",
        "vendor",
        "social",
        "emergency",
        "management",
        "team",
        "help",
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
      handoff_status: ["pending", "accepted", "rejected"],
      help_status: [
        "new",
        "accepted",
        "working",
        "waiting",
        "completed",
        "declined",
      ],
      message_kind: ["text", "voice", "file", "system", "video"],
      notification_kind: [
        "critical",
        "action_required",
        "mention",
        "approval",
        "deadline",
        "information",
        "help_request",
        "security",
      ],
      presence_status: [
        "available",
        "busy",
        "in_meeting",
        "dnd",
        "away",
        "offline",
        "leave",
        "focus",
        "break",
        "lunch",
        "field",
        "remote",
        "on_call",
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
