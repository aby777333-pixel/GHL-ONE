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
      ai_actions: {
        Row: {
          confirmed_at: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          message_id: string | null
          org_id: string
          payload: Json
          performed_at: string | null
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          message_id?: string | null
          org_id: string
          payload?: Json
          performed_at?: string | null
          result?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message_id?: string | null
          org_id?: string
          payload?: Json
          performed_at?: string | null
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_assistants: {
        Row: {
          action_level: number
          created_at: string
          daily_limit: number | null
          data_scopes: string[]
          department_ids: string[] | null
          description: string | null
          enabled: boolean
          id: string
          key: string
          model: string | null
          name: string
          org_id: string
          personality: string
          position: number
        }
        Insert: {
          action_level?: number
          created_at?: string
          daily_limit?: number | null
          data_scopes?: string[]
          department_ids?: string[] | null
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          model?: string | null
          name: string
          org_id: string
          personality: string
          position?: number
        }
        Update: {
          action_level?: number
          created_at?: string
          daily_limit?: number | null
          data_scopes?: string[]
          department_ids?: string[] | null
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          model?: string | null
          name?: string
          org_id?: string
          personality?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_assistants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          assistant_key: string | null
          created_at: string
          id: string
          mode: string | null
          org_id: string
          scope: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assistant_key?: string | null
          created_at?: string
          id?: string
          mode?: string | null
          org_id: string
          scope?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assistant_key?: string | null
          created_at?: string
          id?: string
          mode?: string | null
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
      ai_feedback: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          message_id: string | null
          note: string | null
          org_id: string
          rating: string
          resolved_at: string | null
          resolved_by: string | null
          routed_to: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          message_id?: string | null
          note?: string | null
          org_id: string
          rating: string
          resolved_at?: string | null
          resolved_by?: string | null
          routed_to?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          message_id?: string | null
          note?: string | null
          org_id?: string
          rating?: string
          resolved_at?: string | null
          resolved_by?: string | null
          routed_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_routed_to_fkey"
            columns: ["routed_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          classification: Database["public"]["Enums"]["classification"]
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          kind: string
          org_id: string
          owner_id: string | null
          review_at: string | null
          search: unknown
          source_id: string | null
          source_type: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: string
          org_id: string
          owner_id?: string | null
          review_at?: string | null
          search?: unknown
          source_id?: string | null
          source_type?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          classification?: Database["public"]["Enums"]["classification"]
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: string
          org_id?: string
          owner_id?: string | null
          review_at?: string | null
          search?: unknown
          source_id?: string | null
          source_type?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_owners: {
        Row: {
          department_id: string
          org_id: string
          user_id: string
        }
        Insert: {
          department_id: string
          org_id: string
          user_id: string
        }
        Update: {
          department_id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_owners_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_owners_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memory: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          attachments: Json | null
          confidence: string | null
          content: string
          context: Json | null
          conversation_id: string
          created_at: string
          id: string
          mode: string | null
          proposals: Json | null
          role: string
          sources: Json | null
        }
        Insert: {
          attachments?: Json | null
          confidence?: string | null
          content: string
          context?: Json | null
          conversation_id: string
          created_at?: string
          id?: string
          mode?: string | null
          proposals?: Json | null
          role: string
          sources?: Json | null
        }
        Update: {
          attachments?: Json | null
          confidence?: string | null
          content?: string
          context?: Json | null
          conversation_id?: string
          created_at?: string
          id?: string
          mode?: string | null
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
      asset_assignments: {
        Row: {
          asset_id: string
          assigned_at: string
          assigned_by: string | null
          condition_note: string | null
          id: string
          returned_at: string | null
          user_id: string
        }
        Insert: {
          asset_id: string
          assigned_at?: string
          assigned_by?: string | null
          condition_note?: string | null
          id?: string
          returned_at?: string | null
          user_id: string
        }
        Update: {
          asset_id?: string
          assigned_at?: string
          assigned_by?: string | null
          condition_note?: string | null
          id?: string
          returned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_requests: {
        Row: {
          approver_id: string | null
          asset_id: string | null
          created_at: string
          decided_at: string | null
          decision_note: string | null
          details: string
          id: string
          justification: string | null
          kind: string
          org_id: string
          status: string
          user_id: string
        }
        Insert: {
          approver_id?: string | null
          asset_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          details: string
          id?: string
          justification?: string | null
          kind: string
          org_id: string
          status?: string
          user_id: string
        }
        Update: {
          approver_id?: string | null
          asset_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          details?: string
          id?: string
          justification?: string | null
          kind?: string
          org_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          notes: string | null
          org_id: string
          purchased_on: string | null
          serial: string | null
          status: string
          tag: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          notes?: string | null
          org_id: string
          purchased_on?: string | null
          serial?: string | null
          status?: string
          tag: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          org_id?: string
          purchased_on?: string | null
          serial?: string | null
          status?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      candidates: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          hired_profile_id: string | null
          id: string
          job_id: string | null
          notes: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          rating: number | null
          resume_path: string | null
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          hired_profile_id?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          rating?: number | null
          resume_path?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          hired_profile_id?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          rating?: number | null
          resume_path?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_hired_profile_id_fkey"
            columns: ["hired_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
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
      courses: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          department_ids: string[] | null
          description: string | null
          duration_minutes: number | null
          id: string
          level: string
          mandatory: boolean
          org_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          department_ids?: string[] | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          level?: string
          mandatory?: boolean
          org_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          department_ids?: string[] | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          level?: string
          mandatory?: boolean
          org_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      employee_documents: {
        Row: {
          created_at: string
          id: string
          kind: string
          mime_type: string | null
          name: string
          org_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          user_id: string
          visible_to_employee: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          name: string
          org_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          user_id: string
          visible_to_employee?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          name?: string
          org_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          user_id?: string
          visible_to_employee?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_transfers: {
        Row: {
          applied_at: string | null
          approved_by: string | null
          created_at: string
          effective_on: string
          from_department_id: string | null
          from_manager_id: string | null
          id: string
          org_id: string
          reason: string | null
          requested_by: string | null
          status: string
          to_department_id: string
          to_manager_id: string | null
          to_team_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          approved_by?: string | null
          created_at?: string
          effective_on?: string
          from_department_id?: string | null
          from_manager_id?: string | null
          id?: string
          org_id: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          to_department_id: string
          to_manager_id?: string | null
          to_team_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          approved_by?: string | null
          created_at?: string
          effective_on?: string
          from_department_id?: string | null
          from_manager_id?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          to_department_id?: string
          to_manager_id?: string | null
          to_team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_from_manager_id_fkey"
            columns: ["from_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_to_manager_id_fkey"
            columns: ["to_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_on: string | null
          id: string
          progress: number
          score: number | null
          status: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_on?: string | null
          id?: string
          progress?: number
          score?: number | null
          status?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_on?: string | null
          id?: string
          progress?: number
          score?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      feedback: {
        Row: {
          body: string
          created_at: string
          from_user_id: string
          id: string
          kind: string
          org_id: string
          project_id: string | null
          to_user_id: string
          visibility: string
        }
        Insert: {
          body: string
          created_at?: string
          from_user_id: string
          id?: string
          kind?: string
          org_id: string
          project_id?: string | null
          to_user_id: string
          visibility?: string
        }
        Update: {
          body?: string
          created_at?: string
          from_user_id?: string
          id?: string
          kind?: string
          org_id?: string
          project_id?: string | null
          to_user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      goal_tasks: {
        Row: {
          goal_id: string
          task_id: string
        }
        Insert: {
          goal_id: string
          task_id: string
        }
        Update: {
          goal_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_on: string | null
          id: string
          level: string
          org_id: string
          owner_id: string | null
          parent_id: string | null
          period: string | null
          progress: number
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          level: string
          org_id: string
          owner_id?: string | null
          parent_id?: string | null
          period?: string | null
          progress?: number
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          level?: string
          org_id?: string
          owner_id?: string | null
          parent_id?: string | null
          period?: string | null
          progress?: number
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          resolution_note: string | null
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
          resolution_note?: string | null
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
          resolution_note?: string | null
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
      incidents: {
        Row: {
          channel_id: string | null
          department_id: string | null
          id: string
          org_id: string
          owner_id: string | null
          postmortem: string | null
          resolved_at: string | null
          severity: string
          started_at: string
          started_by: string | null
          status: string
          task_id: string | null
          timeline: Json
          title: string
        }
        Insert: {
          channel_id?: string | null
          department_id?: string | null
          id?: string
          org_id: string
          owner_id?: string | null
          postmortem?: string | null
          resolved_at?: string | null
          severity?: string
          started_at?: string
          started_by?: string | null
          status?: string
          task_id?: string | null
          timeline?: Json
          title: string
        }
        Update: {
          channel_id?: string | null
          department_id?: string | null
          id?: string
          org_id?: string
          owner_id?: string | null
          postmortem?: string | null
          resolved_at?: string | null
          severity?: string
          started_at?: string
          started_by?: string | null
          status?: string
          task_id?: string | null
          timeline?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      internal_applications: {
        Row: {
          created_at: string
          id: string
          job_id: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string
          created_at: string
          created_by: string | null
          decision: string | null
          id: string
          kind: string
          meeting_link: string | null
          notes: string | null
          panel: string[]
          scheduled_at: string
          scores: Json
        }
        Insert: {
          candidate_id: string
          created_at?: string
          created_by?: string | null
          decision?: string | null
          id?: string
          kind?: string
          meeting_link?: string | null
          notes?: string | null
          panel?: string[]
          scheduled_at: string
          scores?: Json
        }
        Update: {
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          decision?: string | null
          id?: string
          kind?: string
          meeting_link?: string | null
          notes?: string | null
          panel?: string[]
          scheduled_at?: string
          scores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      job_openings: {
        Row: {
          closes_on: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          external: boolean
          hiring_manager_id: string | null
          id: string
          internal: boolean
          org_id: string
          status: string
          title: string
        }
        Insert: {
          closes_on?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          external?: boolean
          hiring_manager_id?: string | null
          id?: string
          internal?: boolean
          org_id: string
          status?: string
          title: string
        }
        Update: {
          closes_on?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          external?: boolean
          hiring_manager_id?: string | null
          id?: string
          internal?: boolean
          org_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_openings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_openings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_openings_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_openings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kudos: {
        Row: {
          category: string
          created_at: string
          from_user_id: string
          id: string
          message: string
          org_id: string
          public: boolean
          to_user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          org_id: string
          public?: boolean
          to_user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          org_id?: string
          public?: boolean
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kudos_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kudos_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_interests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      lesson_progress: {
        Row: {
          completed_at: string
          enrollment_id: string
          lesson_id: string
          score: number | null
        }
        Insert: {
          completed_at?: string
          enrollment_id: string
          lesson_id: string
          score?: number | null
        }
        Update: {
          completed_at?: string
          enrollment_id?: string
          lesson_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          course_id: string
          duration_minutes: number | null
          file_id: string | null
          id: string
          kind: string
          position: number
          quiz: Json | null
          title: string
          wiki_page_id: string | null
        }
        Insert: {
          content?: string | null
          course_id: string
          duration_minutes?: number | null
          file_id?: string | null
          id?: string
          kind?: string
          position?: number
          quiz?: Json | null
          title: string
          wiki_page_id?: string | null
        }
        Update: {
          content?: string | null
          course_id?: string
          duration_minutes?: number | null
          file_id?: string | null
          id?: string
          kind?: string
          position?: number
          quiz?: Json | null
          title?: string
          wiki_page_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_wiki_page_id_fkey"
            columns: ["wiki_page_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
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
      mentorships: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          mentee_id: string
          mentor_id: string
          org_id: string
          requested_by: string | null
          status: string
          topic: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          mentee_id: string
          mentor_id: string
          org_id: string
          requested_by?: string | null
          status?: string
          topic: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          mentee_id?: string
          mentor_id?: string
          org_id?: string
          requested_by?: string | null
          status?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentorships_mentee_id_fkey"
            columns: ["mentee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorships_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentorships_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      one_on_ones: {
        Row: {
          action_items: Json
          agenda: Json
          created_at: string
          employee_id: string
          id: string
          manager_id: string
          meeting_id: string | null
          notes: string | null
          org_id: string
          recurrence: string | null
          scheduled_at: string
          status: string
        }
        Insert: {
          action_items?: Json
          agenda?: Json
          created_at?: string
          employee_id: string
          id?: string
          manager_id: string
          meeting_id?: string | null
          notes?: string | null
          org_id: string
          recurrence?: string | null
          scheduled_at: string
          status?: string
        }
        Update: {
          action_items?: Json
          agenda?: Json
          created_at?: string
          employee_id?: string
          id?: string
          manager_id?: string
          meeting_id?: string | null
          notes?: string | null
          org_id?: string
          recurrence?: string | null
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_ones_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "one_on_ones_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "one_on_ones_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "one_on_ones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      probation_reviews: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          extended_to: string | null
          goals: Json
          id: string
          notes: string | null
          org_id: string
          review_date: string
          reviewer_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          extended_to?: string | null
          goals?: Json
          id?: string
          notes?: string | null
          org_id: string
          review_date: string
          reviewer_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          extended_to?: string | null
          goals?: Json
          id?: string
          notes?: string | null
          org_id?: string
          review_date?: string
          reviewer_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "probation_reviews_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "probation_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "probation_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "probation_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      role_changes: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          effective_on: string
          id: string
          new_designation: string | null
          new_manager_id: string | null
          new_role: Database["public"]["Enums"]["role_level"]
          old_designation: string | null
          old_role: Database["public"]["Enums"]["role_level"] | null
          org_id: string
          reason: string | null
          requested_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          effective_on?: string
          id?: string
          new_designation?: string | null
          new_manager_id?: string | null
          new_role: Database["public"]["Enums"]["role_level"]
          old_designation?: string | null
          old_role?: Database["public"]["Enums"]["role_level"] | null
          org_id: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          effective_on?: string
          id?: string
          new_designation?: string | null
          new_manager_id?: string | null
          new_role?: Database["public"]["Enums"]["role_level"]
          old_designation?: string | null
          old_role?: Database["public"]["Enums"]["role_level"] | null
          org_id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_changes_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_changes_new_manager_id_fkey"
            columns: ["new_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_changes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_changes_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_changes_user_id_fkey"
            columns: ["user_id"]
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
      shift_handovers: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          critical_tasks: Json
          department_id: string
          from_user_id: string
          id: string
          notes: string | null
          open_issues: string | null
          org_id: string
          pending_requests: Json
          shift_id: string | null
          to_user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          critical_tasks?: Json
          department_id: string
          from_user_id: string
          id?: string
          notes?: string | null
          open_issues?: string | null
          org_id: string
          pending_requests?: Json
          shift_id?: string | null
          to_user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          critical_tasks?: Json
          department_id?: string
          from_user_id?: string
          id?: string
          notes?: string | null
          open_issues?: string | null
          org_id?: string
          pending_requests?: Json
          shift_id?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_to_user_id_fkey"
            columns: ["to_user_id"]
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
      skill_endorsements: {
        Row: {
          created_at: string
          endorsed_by: string
          id: string
          level: number | null
          note: string | null
          skill: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          endorsed_by: string
          id?: string
          level?: number | null
          note?: string | null
          skill: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          endorsed_by?: string
          id?: string
          level?: number | null
          note?: string | null
          skill?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "skill_endorsements_endorsed_by_fkey"
            columns: ["endorsed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_endorsements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          anonymous: boolean
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          org_id: string
          responded_by: string | null
          response: string | null
          status: string
          title: string
        }
        Insert: {
          anonymous?: boolean
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          org_id: string
          responded_by?: string | null
          response?: string | null
          status?: string
          title: string
        }
        Update: {
          anonymous?: boolean
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          responded_by?: string | null
          response?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_responded_by_fkey"
            columns: ["responded_by"]
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
      workflow_runs: {
        Row: {
          completed_at: string | null
          context: Json
          id: string
          kind: string
          org_id: string
          started_at: string
          started_by: string | null
          status: string
          subject_label: string
          subject_user_id: string | null
          template_id: string | null
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          id?: string
          kind: string
          org_id: string
          started_at?: string
          started_by?: string | null
          status?: string
          subject_label: string
          subject_user_id?: string | null
          template_id?: string | null
        }
        Update: {
          completed_at?: string | null
          context?: Json
          id?: string
          kind?: string
          org_id?: string
          started_at?: string
          started_by?: string | null
          status?: string
          subject_label?: string
          subject_user_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          completed_at: string | null
          department_id: string | null
          depends_on: string[]
          description: string | null
          due_date: string | null
          id: string
          key: string
          owner_id: string | null
          position: number
          run_id: string
          status: string
          task_id: string | null
          title: string
        }
        Insert: {
          completed_at?: string | null
          department_id?: string | null
          depends_on?: string[]
          description?: string | null
          due_date?: string | null
          id?: string
          key: string
          owner_id?: string | null
          position?: number
          run_id: string
          status?: string
          task_id?: string | null
          title: string
        }
        Update: {
          completed_at?: string | null
          department_id?: string | null
          depends_on?: string[]
          description?: string | null
          due_date?: string | null
          id?: string
          key?: string
          owner_id?: string | null
          position?: number
          run_id?: string
          status?: string
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string
          kind: string
          name: string
          org_id: string
          steps: Json
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key: string
          kind?: string
          name: string
          org_id: string
          steps?: Json
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string
          kind?: string
          name?: string
          org_id?: string
          steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      suggestions_view: {
        Row: {
          anonymous: boolean | null
          author_id: string | null
          body: string | null
          created_at: string | null
          id: string | null
          kind: string | null
          org_id: string | null
          responded_by: string | null
          response: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          anonymous?: boolean | null
          author_id?: never
          body?: string | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          org_id?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          anonymous?: boolean | null
          author_id?: never
          body?: string | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          org_id?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      ai_requests_today: { Args: never; Returns: number }
      apply_role_change: { Args: { p_change: string }; Returns: undefined }
      apply_transfer: { Args: { p_transfer: string }; Returns: undefined }
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
          missing_checkout: boolean
          mode: string
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
      blocker_chain: { Args: { p_task: string }; Returns: Json }
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
      claim_help_request: { Args: { p_id: string }; Returns: undefined }
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
      department_brief: { Args: { p_department: string }; Returns: Json }
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
      find_experts: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          department_id: string
          department_name: string
          designation: string
          full_name: string
          id: string
          matched_on: string
          open_tasks: number
          presence: Database["public"]["Enums"]["presence_status"]
          skills: string[]
        }[]
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
      hire_candidate: {
        Args: {
          p_candidate: string
          p_department?: string
          p_designation?: string
          p_manager?: string
          p_role?: Database["public"]["Enums"]["role_level"]
        }
        Returns: string
      }
      imm_array_to_string: { Args: { a: string[] }; Returns: string }
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
      is_hr: { Args: never; Returns: boolean }
      is_internal: { Args: never; Returns: boolean }
      is_knowledge_owner: { Args: { d: string }; Returns: boolean }
      is_lead_plus: { Args: never; Returns: boolean }
      is_manager_of: { Args: { u: string }; Returns: boolean }
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
      offboard_user: {
        Args: {
          p_last_day?: string
          p_reason: string
          p_transfer_to: string
          p_user: string
        }
        Returns: Json
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
      prepare_shift_handover: { Args: { p_department: string }; Returns: Json }
      probation_reminders: { Args: never; Returns: number }
      related_to: { Args: { eid: string; entity: string }; Returns: Json }
      render_tpl: { Args: { ctx: Json; tpl: string }; Returns: string }
      resolve_step_department: {
        Args: { p_org: string; p_owner: string; p_subject: string }
        Returns: string
      }
      resolve_step_owner: {
        Args: { p_org: string; p_owner: string; p_subject: string }
        Returns: string
      }
      resolve_targets: {
        Args: { ctx: Json; target: string }
        Returns: string[]
      }
      restore_handovers: { Args: never; Returns: number }
      restricted_hits: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          approver_id: string
          classification: Database["public"]["Enums"]["classification"]
          label: string
          resource_id: string
          resource_type: string
        }[]
      }
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
      search_knowledge: {
        Args: { p_department?: string; p_limit?: number; p_q: string }
        Returns: {
          department_id: string
          id: string
          kind: string
          outdated: boolean
          rank: number
          review_at: string
          snippet: string
          title: string
        }[]
      }
      since_last_visit: { Args: { p_since: string }; Returns: Json }
      skip_workflow_step: {
        Args: { p_reason?: string; p_step: string }
        Returns: undefined
      }
      start_focus: {
        Args: { p_note?: string; p_task?: string }
        Returns: string
      }
      start_war_room: {
        Args: {
          p_department?: string
          p_severity?: string
          p_summary?: string
          p_title: string
        }
        Returns: string
      }
      start_workflow: {
        Args: {
          p_context?: Json
          p_label?: string
          p_subject: string
          p_template_key: string
        }
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
      transfer_work: {
        Args: { p_from: string; p_reason?: string; p_to: string }
        Returns: Json
      }
      urgent_assistance: {
        Args: { p_kind: string; p_message: string }
        Returns: string
      }
      view_as: { Args: { p_user: string }; Returns: Json }
      who_can_see: { Args: { p_id: string; p_type: string }; Returns: Json }
      workflow_release_step: { Args: { p_step: string }; Returns: undefined }
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
