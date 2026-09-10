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
      access_events: {
        Row: {
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: number
          kind: string
          org_id: string
          path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          kind: string
          org_id: string
          path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          kind?: string
          org_id?: string
          path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      access_review_items: {
        Row: {
          decided_at: string | null
          decision: string | null
          extend_to: string | null
          id: string
          item_id: string | null
          item_type: string
          label: string
          note: string | null
          review_id: string
          reviewer_id: string | null
          user_id: string
        }
        Insert: {
          decided_at?: string | null
          decision?: string | null
          extend_to?: string | null
          id?: string
          item_id?: string | null
          item_type: string
          label: string
          note?: string | null
          review_id: string
          reviewer_id?: string | null
          user_id: string
        }
        Update: {
          decided_at?: string | null
          decision?: string | null
          extend_to?: string | null
          id?: string
          item_id?: string | null
          item_type?: string
          label?: string
          note?: string | null
          review_id?: string
          reviewer_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "access_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_review_items_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_review_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_reviews: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          due_on: string
          id: string
          name: string
          org_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          due_on: string
          id?: string
          name: string
          org_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          due_on?: string
          id?: string
          name?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_reviews_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      active_workspace: {
        Row: {
          org_id: string
          switched_at: string
          user_id: string
        }
        Insert: {
          org_id: string
          switched_at?: string
          user_id: string
        }
        Update: {
          org_id?: string
          switched_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_workspace_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_workspace_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          recording_id: string | null
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
          recording_id?: string | null
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
          recording_id?: string | null
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
          {
            foreignKeyName: "ai_knowledge_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "live_recordings"
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
          org_id: string | null
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          org_id?: string | null
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          org_id?: string | null
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      allocations: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          ends_on: string | null
          id: string
          note: string | null
          percent: number
          project_id: string | null
          starts_on: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          ends_on?: string | null
          id?: string
          note?: string | null
          percent: number
          project_id?: string | null
          starts_on?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          ends_on?: string | null
          id?: string
          note?: string | null
          percent?: number
          project_id?: string | null
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_user_id_fkey"
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
      answer_votes: {
        Row: {
          answer_id: string
          user_id: string
        }
        Insert: {
          answer_id: string
          user_id: string
        }
        Update: {
          answer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_votes_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          knowledge_id: string | null
          question_id: string
          votes: number
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          knowledge_id?: string | null
          question_id: string
          votes?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          knowledge_id?: string | null
          question_id?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "answers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
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
          break_type: string | null
          coverage_warning: boolean
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
          break_type?: string | null
          coverage_warning?: boolean
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
          break_type?: string | null
          coverage_warning?: boolean
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
          actor_label: string | null
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
          actor_label?: string | null
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
          actor_label?: string | null
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
      board_access_log: {
        Row: {
          action: string
          actor_id: string | null
          board_id: string
          created_at: string
          details: Json
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          board_id: string
          created_at?: string
          details?: Json
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          board_id?: string
          created_at?: string
          details?: Json
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "board_access_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_access_log_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_comments: {
        Row: {
          author_id: string | null
          board_id: string
          body: string
          created_at: string
          element_id: string | null
          id: string
          mentions: string[]
          page_id: string | null
          resolved: boolean
          task_id: string | null
        }
        Insert: {
          author_id?: string | null
          board_id: string
          body: string
          created_at?: string
          element_id?: string | null
          id?: string
          mentions?: string[]
          page_id?: string | null
          resolved?: boolean
          task_id?: string | null
        }
        Update: {
          author_id?: string | null
          board_id?: string
          body?: string
          created_at?: string
          element_id?: string | null
          id?: string
          mentions?: string[]
          page_id?: string | null
          resolved?: boolean
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_comments_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      board_versions: {
        Row: {
          board_id: string
          created_at: string
          created_by: string | null
          doc: Json
          id: string
          label: string | null
          version: number
        }
        Insert: {
          board_id: string
          created_at?: string
          created_by?: string | null
          doc: Json
          id?: string
          label?: string | null
          version: number
        }
        Update: {
          board_id?: string
          created_at?: string
          created_by?: string | null
          doc?: Json
          id?: string
          label?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_versions_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          doc: Json
          id: string
          kind: string
          locked: boolean
          member_ids: string[]
          org_id: string
          owner_id: string | null
          project_id: string | null
          room_id: string | null
          team_id: string | null
          template_key: string | null
          title: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          doc?: Json
          id?: string
          kind?: string
          locked?: boolean
          member_ids?: string[]
          org_id: string
          owner_id?: string | null
          project_id?: string | null
          room_id?: string | null
          team_id?: string | null
          template_key?: string | null
          title: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          doc?: Json
          id?: string
          kind?: string
          locked?: boolean
          member_ids?: string[]
          org_id?: string
          owner_id?: string | null
          project_id?: string | null
          room_id?: string | null
          team_id?: string | null
          template_key?: string | null
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          meeting_id: string | null
          purpose: string | null
          resource_id: string
          starts_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          meeting_id?: string | null
          purpose?: string | null
          resource_id: string
          starts_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          meeting_id?: string | null
          purpose?: string | null
          resource_id?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      break_glass_sessions: {
        Row: {
          actions: number
          actor_id: string
          ended_at: string | null
          expires_at: string
          id: string
          justification: string
          org_id: string
          reason: string
          scope: string
          started_at: string
        }
        Insert: {
          actions?: number
          actor_id: string
          ended_at?: string | null
          expires_at: string
          id?: string
          justification: string
          org_id: string
          reason: string
          scope?: string
          started_at?: string
        }
        Update: {
          actions?: number
          actor_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          justification?: string
          org_id?: string
          reason?: string
          scope?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_glass_sessions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_glass_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      break_policies: {
        Row: {
          block_when_uncovered: boolean
          department_id: string | null
          id: string
          lunch_window: unknown
          max_count: number
          max_total_minutes: number
          min_available: number
          note: string | null
          org_id: string
          shift_id: string | null
        }
        Insert: {
          block_when_uncovered?: boolean
          department_id?: string | null
          id?: string
          lunch_window?: unknown
          max_count?: number
          max_total_minutes?: number
          min_available?: number
          note?: string | null
          org_id: string
          shift_id?: string | null
        }
        Update: {
          block_when_uncovered?: boolean
          department_id?: string | null
          id?: string
          lunch_window?: unknown
          max_count?: number
          max_total_minutes?: number
          min_available?: number
          note?: string | null
          org_id?: string
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "break_policies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_policies_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      break_types: {
        Row: {
          active: boolean
          color: string
          id: string
          key: string
          max_minutes: number
          name: string
          org_id: string
          paid: boolean
          requires_note: boolean
          sort_order: number
        }
        Insert: {
          active?: boolean
          color?: string
          id?: string
          key: string
          max_minutes?: number
          name: string
          org_id: string
          paid?: boolean
          requires_note?: boolean
          sort_order?: number
        }
        Update: {
          active?: boolean
          color?: string
          id?: string
          key?: string
          max_minutes?: number
          name?: string
          org_id?: string
          paid?: boolean
          requires_note?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "break_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_acks: {
        Row: {
          acked_at: string
          broadcast_id: string
          user_id: string
        }
        Insert: {
          acked_at?: string
          broadcast_id: string
          user_id: string
        }
        Update: {
          acked_at?: string
          broadcast_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_acks_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_acks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: Json
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          org_id: string
          request_checkin: boolean
          require_ack: boolean
          title: string
        }
        Insert: {
          audience?: Json
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id: string
          request_checkin?: boolean
          require_ack?: boolean
          title: string
        }
        Update: {
          audience?: Json
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id?: string
          request_checkin?: boolean
          require_ack?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_org_id_fkey"
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
      callbacks: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          due_at: string
          id: string
          note: string | null
          org_id: string
          status: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at: string
          id?: string
          note?: string | null
          org_id: string
          status?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at?: string
          id?: string
          note?: string | null
          org_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "callbacks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callbacks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callbacks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callbacks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callbacks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          disposition: string | null
          duration_seconds: number | null
          ended_at: string | null
          external_id: string | null
          id: string
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          org_id: string
          phone: string | null
          provider: string | null
          recording_url: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          provider?: string | null
          recording_url?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          provider?: string | null
          recording_url?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
          referred_by: string | null
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
          referred_by?: string | null
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
          referred_by?: string | null
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
          {
            foreignKeyName: "candidates_referred_by_fkey"
            columns: ["referred_by"]
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
          federation_id: string | null
          help_request_id: string | null
          id: string
          is_private: boolean
          is_readonly: boolean
          last_message_at: string | null
          live_room_id: string | null
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
          federation_id?: string | null
          help_request_id?: string | null
          id?: string
          is_private?: boolean
          is_readonly?: boolean
          last_message_at?: string | null
          live_room_id?: string | null
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
          federation_id?: string | null
          help_request_id?: string | null
          id?: string
          is_private?: boolean
          is_readonly?: boolean
          last_message_at?: string | null
          live_room_id?: string | null
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
            foreignKeyName: "channels_federation_id_fkey"
            columns: ["federation_id"]
            isOneToOne: false
            referencedRelation: "federations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_live_room_id_fkey"
            columns: ["live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
      checkins: {
        Row: {
          at: string
          broadcast_id: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          at?: string
          broadcast_id: string
          note?: string | null
          status: string
          user_id: string
        }
        Update: {
          at?: string
          broadcast_id?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_favorites: {
        Row: {
          created_at: string
          entity_id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_policies: {
        Row: {
          can_create_public_rooms: boolean
          can_invite_guests: boolean
          can_record: boolean
          can_remote_assist: boolean
          can_share_screen: boolean
          can_start_calls: boolean
          can_townhall: boolean
          can_video: boolean
          can_whiteboard: boolean
          confidential_default: boolean
          department_id: string | null
          id: string
          org_id: string
          recording_retention_days: number | null
          role: Database["public"]["Enums"]["role_level"] | null
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          can_create_public_rooms?: boolean
          can_invite_guests?: boolean
          can_record?: boolean
          can_remote_assist?: boolean
          can_share_screen?: boolean
          can_start_calls?: boolean
          can_townhall?: boolean
          can_video?: boolean
          can_whiteboard?: boolean
          confidential_default?: boolean
          department_id?: string | null
          id?: string
          org_id: string
          recording_retention_days?: number | null
          role?: Database["public"]["Enums"]["role_level"] | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          can_create_public_rooms?: boolean
          can_invite_guests?: boolean
          can_record?: boolean
          can_remote_assist?: boolean
          can_share_screen?: boolean
          can_start_calls?: boolean
          can_townhall?: boolean
          can_video?: boolean
          can_whiteboard?: boolean
          confidential_default?: boolean
          department_id?: string | null
          id?: string
          org_id?: string
          recording_retention_days?: number | null
          role?: Database["public"]["Enums"]["role_level"] | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collab_policies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_templates: {
        Row: {
          approved: boolean
          approved_by: string | null
          body: string
          category: string | null
          created_at: string
          department_id: string | null
          id: string
          kind: string
          name: string
          org_id: string
          owner_id: string | null
          scope: string
          subject: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          approved?: boolean
          approved_by?: string | null
          body: string
          category?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          kind?: string
          name: string
          org_id: string
          owner_id?: string | null
          scope?: string
          subject?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          approved?: boolean
          approved_by?: string | null
          body?: string
          category?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          kind?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          scope?: string
          subject?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "comm_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          created_at: string
          done_at: string | null
          due_at: string | null
          id: string
          org_id: string
          promised_by: string
          promised_to_contact: string | null
          promised_to_label: string | null
          promised_to_user: string | null
          reminded_at: string | null
          source_id: string | null
          source_link: string | null
          source_type: string
          status: string
          task_id: string | null
          text: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          due_at?: string | null
          id?: string
          org_id: string
          promised_by: string
          promised_to_contact?: string | null
          promised_to_label?: string | null
          promised_to_user?: string | null
          reminded_at?: string | null
          source_id?: string | null
          source_link?: string | null
          source_type?: string
          status?: string
          task_id?: string | null
          text: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          due_at?: string | null
          id?: string
          org_id?: string
          promised_by?: string
          promised_to_contact?: string | null
          promised_to_label?: string | null
          promised_to_user?: string | null
          reminded_at?: string | null
          source_id?: string | null
          source_link?: string | null
          source_type?: string
          status?: string
          task_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_contact_fk"
            columns: ["promised_to_contact"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_promised_by_fkey"
            columns: ["promised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_promised_to_user_fkey"
            columns: ["promised_to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      company_admin_limits: {
        Row: {
          note: string | null
          org_id: string
          permissions: string[] | null
          set_by: string | null
          template: string
          updated_at: string
        }
        Insert: {
          note?: string | null
          org_id: string
          permissions?: string[] | null
          set_by?: string | null
          template?: string
          updated_at?: string
        }
        Update: {
          note?: string | null
          org_id?: string
          permissions?: string[] | null
          set_by?: string | null
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_admin_limits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_admin_limits_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invites: {
        Row: {
          company_name: string
          contact_email: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          org_id: string | null
          status: string
          submitted: Json | null
          template_key: string | null
          token: string
        }
        Insert: {
          company_name: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          org_id?: string | null
          status?: string
          submitted?: Json | null
          template_key?: string | null
          token?: string
        }
        Update: {
          company_name?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          org_id?: string | null
          status?: string
          submitted?: Json | null
          template_key?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invites_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "company_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      company_onboarding: {
        Row: {
          channel_id: string | null
          notes: string | null
          org_id: string
          owner_id: string | null
          room_id: string | null
          steps: Json
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          notes?: string | null
          org_id: string
          owner_id?: string | null
          room_id?: string | null
          steps?: Json
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          room_id?: string | null
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_onboarding_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_onboarding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_onboarding_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          industry: string | null
          is_system: boolean
          key: string
          name: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          industry?: string | null
          is_system?: boolean
          key: string
          name: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          industry?: string | null
          is_system?: boolean
          key?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_history: {
        Row: {
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          op: string
          org_id: string | null
          undone_at: string | null
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          op: string
          org_id?: string | null
          undone_at?: string | null
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          op?: string
          org_id?: string | null
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "config_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          dnc_reason: string | null
          do_not_contact: boolean
          emails: string[]
          id: string
          kind: string
          language: string | null
          last_contact_at: string | null
          name: string
          notes: string | null
          org_id: string
          owner_id: string | null
          phones: string[]
          preferred_channel: string | null
          source: string | null
          tags: string[]
          updated_at: string
          vip: boolean
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          dnc_reason?: string | null
          do_not_contact?: boolean
          emails?: string[]
          id?: string
          kind?: string
          language?: string | null
          last_contact_at?: string | null
          name: string
          notes?: string | null
          org_id: string
          owner_id?: string | null
          phones?: string[]
          preferred_channel?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
          vip?: boolean
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          dnc_reason?: string | null
          do_not_contact?: boolean
          emails?: string[]
          id?: string
          kind?: string
          language?: string | null
          last_contact_at?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          phones?: string[]
          preferred_channel?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
          vip?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          ai_drafted: boolean
          approved_by: string | null
          attachments: Json
          author_id: string | null
          body: string | null
          cc_addresses: string[]
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          external_id: string | null
          from_address: string | null
          html: string | null
          id: string
          kind: string
          mentions: string[]
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
          to_addresses: string[]
        }
        Insert: {
          ai_drafted?: boolean
          approved_by?: string | null
          attachments?: Json
          author_id?: string | null
          body?: string | null
          cc_addresses?: string[]
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          external_id?: string | null
          from_address?: string | null
          html?: string | null
          id?: string
          kind?: string
          mentions?: string[]
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          to_addresses?: string[]
        }
        Update: {
          ai_drafted?: boolean
          approved_by?: string | null
          attachments?: Json
          author_id?: string | null
          body?: string | null
          cc_addresses?: string[]
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          external_id?: string | null
          from_address?: string | null
          html?: string | null
          id?: string
          kind?: string
          mentions?: string[]
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_template_fk"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "comm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          claimed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          disposition: string | null
          external_id: string | null
          first_reply_at: string | null
          id: string
          inbox_id: string | null
          last_inbound_at: string | null
          last_message_at: string
          last_outbound_at: string | null
          linked_help_request_id: string | null
          linked_task_id: string | null
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          resolved_at: string | null
          resolved_by: string | null
          sla_breached: boolean
          sla_due_at: string | null
          snoozed_until: string | null
          status: string
          subject: string | null
          tags: string[]
          thread_key: string | null
          unread: boolean
          updated_at: string
          vip: boolean
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          disposition?: string | null
          external_id?: string | null
          first_reply_at?: string | null
          id?: string
          inbox_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string
          last_outbound_at?: string | null
          linked_help_request_id?: string | null
          linked_task_id?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          sla_breached?: boolean
          sla_due_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          tags?: string[]
          thread_key?: string | null
          unread?: boolean
          updated_at?: string
          vip?: boolean
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          claimed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          disposition?: string | null
          external_id?: string | null
          first_reply_at?: string | null
          id?: string
          inbox_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string
          last_outbound_at?: string | null
          linked_help_request_id?: string | null
          linked_task_id?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          resolved_at?: string | null
          resolved_by?: string | null
          sla_breached?: boolean
          sla_due_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          tags?: string[]
          thread_key?: string | null
          unread?: boolean
          updated_at?: string
          vip?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "inboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_linked_help_request_id_fkey"
            columns: ["linked_help_request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      coverage_requirements: {
        Row: {
          created_at: string
          days: number[]
          department_id: string
          from_time: string
          id: string
          label: string | null
          max_leave_same_day: number | null
          min_people: number
          org_id: string
          team_id: string | null
          to_time: string
        }
        Insert: {
          created_at?: string
          days?: number[]
          department_id: string
          from_time?: string
          id?: string
          label?: string | null
          max_leave_same_day?: number | null
          min_people?: number
          org_id: string
          team_id?: string | null
          to_time?: string
        }
        Update: {
          created_at?: string
          days?: number[]
          department_id?: string
          from_time?: string
          id?: string
          label?: string | null
          max_leave_same_day?: number | null
          min_people?: number
          org_id?: string
          team_id?: string | null
          to_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_requirements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_requirements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_requirements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          live_room_id: string | null
          meeting_id: string | null
          message_id: string | null
          org_id: string
          participants: string[]
          project_id: string | null
          reason: string | null
          reversal_reason: string | null
          status: string
          superseded_by: string | null
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
          live_room_id?: string | null
          meeting_id?: string | null
          message_id?: string | null
          org_id: string
          participants?: string[]
          project_id?: string | null
          reason?: string | null
          reversal_reason?: string | null
          status?: string
          superseded_by?: string | null
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
          live_room_id?: string | null
          meeting_id?: string | null
          message_id?: string | null
          org_id?: string
          participants?: string[]
          project_id?: string | null
          reason?: string | null
          reversal_reason?: string | null
          status?: string
          superseded_by?: string | null
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
            foreignKeyName: "decisions_live_room_id_fkey"
            columns: ["live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
          {
            foreignKeyName: "decisions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          from_user_id: string
          id: string
          kinds: string[]
          org_id: string
          reason: string | null
          starts_at: string
          to_user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          from_user_id: string
          id?: string
          kinds?: string[]
          org_id: string
          reason?: string | null
          starts_at?: string
          to_user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          from_user_id?: string
          id?: string
          kinds?: string[]
          org_id?: string
          reason?: string | null
          starts_at?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          charter: Json
          color: string
          created_at: string
          default_permissions: string[]
          default_screens: string[]
          description: string | null
          escalation_matrix: string[]
          frozen: boolean
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
          charter?: Json
          color?: string
          created_at?: string
          default_permissions?: string[]
          default_screens?: string[]
          description?: string | null
          escalation_matrix?: string[]
          frozen?: boolean
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
          charter?: Json
          color?: string
          created_at?: string
          default_permissions?: string[]
          default_screens?: string[]
          description?: string | null
          escalation_matrix?: string[]
          frozen?: boolean
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
      employee_imports: {
        Row: {
          applied_at: string | null
          created_at: string
          id: string
          org_id: string
          report: Json
          rows: Json
          status: string
          uploaded_by: string | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          id?: string
          org_id: string
          report?: Json
          rows?: Json
          status?: string
          uploaded_by?: string | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          id?: string
          org_id?: string
          report?: Json
          rows?: Json
          status?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
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
      event_rsvps: {
        Row: {
          event_id: string
          status: string
          user_id: string
        }
        Insert: {
          event_id: string
          status?: string
          user_id: string
        }
        Update: {
          event_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          department_ids: string[] | null
          description: string | null
          ends_at: string | null
          id: string
          kind: string
          location: string | null
          org_id: string
          starts_at: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_ids?: string[] | null
          description?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          org_id: string
          starts_at: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_ids?: string[] | null
          description?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          location?: string | null
          org_id?: string
          starts_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string | null
          hypothesis: string | null
          id: string
          idea_id: string | null
          org_id: string
          owner_id: string | null
          result: string | null
          starts_on: string | null
          status: string
          suggestion_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          hypothesis?: string | null
          id?: string
          idea_id?: string | null
          org_id: string
          owner_id?: string | null
          result?: string | null
          starts_on?: string | null
          status?: string
          suggestion_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          hypothesis?: string | null
          id?: string
          idea_id?: string | null
          org_id?: string
          owner_id?: string | null
          result?: string | null
          starts_on?: string | null
          status?: string
          suggestion_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions_view"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_slots: {
        Row: {
          created_at: string
          ends_at: string
          host_id: string
          id: string
          office_hours_id: string | null
          starts_at: string
          status: string
          topic: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          host_id: string
          id?: string
          office_hours_id?: string | null
          starts_at: string
          status?: string
          topic?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          host_id?: string
          id?: string
          office_hours_id?: string | null
          starts_at?: string
          status?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_slots_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_slots_office_hours_id_fkey"
            columns: ["office_hours_id"]
            isOneToOne: false
            referencedRelation: "office_hours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          locked: boolean
          org_id: string
          team_ids: string[] | null
          user_ids: string[] | null
        }
        Insert: {
          beta?: boolean
          department_ids?: string[] | null
          enabled?: boolean
          feature: string
          locked?: boolean
          org_id: string
          team_ids?: string[] | null
          user_ids?: string[] | null
        }
        Update: {
          beta?: boolean
          department_ids?: string[] | null
          enabled?: boolean
          feature?: string
          locked?: boolean
          org_id?: string
          team_ids?: string[] | null
          user_ids?: string[] | null
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
      federation_members: {
        Row: {
          added_at: string
          added_by: string | null
          federation_id: string
          org_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          federation_id: string
          org_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          federation_id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "federation_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federation_members_federation_id_fkey"
            columns: ["federation_id"]
            isOneToOne: false
            referencedRelation: "federations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federation_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      federations: {
        Row: {
          approved_by_a: string | null
          approved_by_b: string | null
          created_at: string
          expires_at: string
          id: string
          org_a: string
          org_b: string
          purpose: string
          requested_by: string | null
          status: string
        }
        Insert: {
          approved_by_a?: string | null
          approved_by_b?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          org_a: string
          org_b: string
          purpose: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          approved_by_a?: string | null
          approved_by_b?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          org_a?: string
          org_b?: string
          purpose?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "federations_approved_by_a_fkey"
            columns: ["approved_by_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federations_approved_by_b_fkey"
            columns: ["approved_by_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federations_org_a_fkey"
            columns: ["org_a"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federations_org_b_fkey"
            columns: ["org_b"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "federations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      follow_ups: {
        Row: {
          commitment_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          due_at: string
          id: string
          note: string | null
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          source: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          commitment_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at: string
          id?: string
          note?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          source?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          commitment_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at?: string
          id?: string
          note?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          source?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary: {
        Row: {
          created_at: string
          created_by: string | null
          definition: string
          department_id: string | null
          id: string
          org_id: string
          term: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: string
          department_id?: string | null
          id?: string
          org_id: string
          term: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: string
          department_id?: string | null
          id?: string
          org_id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "glossary_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "glossary_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "glossary_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          live_room_id: string | null
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
          live_room_id?: string | null
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
          live_room_id?: string | null
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
            foreignKeyName: "help_requests_live_room_id_fkey"
            columns: ["live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
      inbox_members: {
        Row: {
          added_by: string | null
          created_at: string
          inbox_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          inbox_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          inbox_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_members_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "inboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_by: string | null
          enabled: boolean
          id: string
          inbox_id: string
          name: string
          sort_order: number
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_by?: string | null
          enabled?: boolean
          id?: string
          inbox_id: string
          name: string
          sort_order?: number
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_by?: string | null
          enabled?: boolean
          id?: string
          inbox_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "inbox_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_rules_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "inboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      inboxes: {
        Row: {
          active: boolean
          address: string | null
          assignment: string
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          kind: string
          name: string
          org_id: string
          provider: string | null
          settings: Json
          signature: string | null
          sla_first_reply_minutes: number
          sla_resolve_hours: number
          visibility: string
          webhook_token: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          assignment?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: string
          name: string
          org_id: string
          provider?: string | null
          settings?: Json
          signature?: string | null
          sla_first_reply_minutes?: number
          sla_resolve_hours?: number
          visibility?: string
          webhook_token?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          assignment?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: string
          name?: string
          org_id?: string
          provider?: string | null
          settings?: Json
          signature?: string | null
          sla_first_reply_minutes?: number
          sla_resolve_hours?: number
          visibility?: string
          webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inboxes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inboxes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inboxes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          channel_id: string | null
          department_id: string | null
          id: string
          live_room_id: string | null
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
          live_room_id?: string | null
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
          live_room_id?: string | null
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
            foreignKeyName: "incidents_live_room_id_fkey"
            columns: ["live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
      live_doc_comments: {
        Row: {
          accepted: boolean | null
          anchor: string | null
          author_id: string | null
          body: string
          created_at: string
          doc_id: string
          id: string
          mentions: string[]
          resolved: boolean
          suggestion: string | null
          task_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          anchor?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          doc_id: string
          id?: string
          mentions?: string[]
          resolved?: boolean
          suggestion?: string | null
          task_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          anchor?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          doc_id?: string
          id?: string
          mentions?: string[]
          resolved?: boolean
          suggestion?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_doc_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_doc_comments_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "live_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_doc_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      live_doc_versions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          doc_id: string
          id: string
          label: string | null
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          doc_id: string
          id?: string
          label?: string | null
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          doc_id?: string
          id?: string
          label?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_doc_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_doc_versions_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "live_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      live_docs: {
        Row: {
          archived: boolean
          body: string
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          kind: string
          meeting_id: string | null
          member_ids: string[]
          org_id: string
          owner_id: string | null
          project_id: string | null
          room_id: string | null
          suggestion_mode: boolean
          task_id: string | null
          title: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          archived?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: string
          meeting_id?: string | null
          member_ids?: string[]
          org_id: string
          owner_id?: string | null
          project_id?: string | null
          room_id?: string | null
          suggestion_mode?: boolean
          task_id?: string | null
          title: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          archived?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          kind?: string
          meeting_id?: string | null
          member_ids?: string[]
          org_id?: string
          owner_id?: string | null
          project_id?: string | null
          room_id?: string | null
          suggestion_mode?: boolean
          task_id?: string | null
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_docs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_docs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      live_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          id: number
          kind: string
          org_id: string
          payload: Json
          room_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          id?: never
          kind: string
          org_id: string
          payload?: Json
          room_id: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          id?: never
          kind?: string
          org_id?: string
          payload?: Json
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_guest_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          guest_email: string | null
          guest_name: string | null
          id: string
          max_uses: number
          org_id: string
          revoked: boolean
          room_id: string
          token: string
          uses: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          max_uses?: number
          org_id: string
          revoked?: boolean
          room_id: string
          token?: string
          uses?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          max_uses?: number
          org_id?: string
          revoked?: boolean
          room_id?: string
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_guest_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_guest_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_guest_links_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_invites: {
        Row: {
          created_at: string
          from_user: string
          id: string
          kind: string
          message: string | null
          org_id: string
          responded_at: string | null
          room_id: string
          status: string
          to_user: string
        }
        Insert: {
          created_at?: string
          from_user: string
          id?: string
          kind?: string
          message?: string | null
          org_id: string
          responded_at?: string | null
          room_id: string
          status?: string
          to_user: string
        }
        Update: {
          created_at?: string
          from_user?: string
          id?: string
          kind?: string
          message?: string | null
          org_id?: string
          responded_at?: string | null
          room_id?: string
          status?: string
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_invites_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_invites_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_invites_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_notes: {
        Row: {
          body: string
          org_id: string
          room_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body?: string
          org_id: string
          room_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          org_id?: string
          room_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_notes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          device: string | null
          hand_raised: boolean
          invited_by: string | null
          joined_at: string
          left_at: string | null
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          device?: string | null
          hand_raised?: boolean
          invited_by?: string | null
          joined_at?: string
          left_at?: string | null
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          device?: string | null
          hand_raised?: boolean
          invited_by?: string | null
          joined_at?: string
          left_at?: string | null
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_polls: {
        Row: {
          anonymous: boolean
          board_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          multi: boolean
          options: Json
          org_id: string
          question: string
          room_id: string | null
          status: string
          votes: Json
        }
        Insert: {
          anonymous?: boolean
          board_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          multi?: boolean
          options?: Json
          org_id: string
          question: string
          room_id?: string | null
          status?: string
          votes?: Json
        }
        Update: {
          anonymous?: boolean
          board_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          multi?: boolean
          options?: Json
          org_id?: string
          question?: string
          room_id?: string | null
          status?: string
          votes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "live_polls_board_fk"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_polls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_polls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_questions: {
        Row: {
          anonymous: boolean
          answer: string | null
          answered: boolean
          answered_by: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          org_id: string
          room_id: string
          upvotes: string[]
        }
        Insert: {
          anonymous?: boolean
          answer?: string | null
          answered?: boolean
          answered_by?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          org_id: string
          room_id: string
          upvotes?: string[]
        }
        Update: {
          anonymous?: boolean
          answer?: string | null
          answered?: boolean
          answered_by?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          room_id?: string
          upvotes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "live_questions_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_questions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recording_replies: {
        Row: {
          at_sec: number | null
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          recording_id: string
          storage_path: string | null
        }
        Insert: {
          at_sec?: number | null
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          recording_id: string
          storage_path?: string | null
        }
        Update: {
          at_sec?: number | null
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          recording_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_recording_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recording_replies_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "live_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recordings: {
        Row: {
          access: string
          access_ids: string[]
          channel_id: string | null
          chapters: Json
          created_at: string
          department_id: string | null
          description: string | null
          downloadable: boolean
          duration_sec: number
          expires_at: string | null
          help_request_id: string | null
          id: string
          kind: string
          knowledge_id: string | null
          mime_type: string
          org_id: string
          owner_id: string
          project_id: string | null
          room_id: string | null
          size_bytes: number
          status: string
          storage_path: string
          summary: Json | null
          task_id: string | null
          thumbnail_path: string | null
          title: string
          transcript: string | null
          transcript_segments: Json
          updated_at: string
          views: number
        }
        Insert: {
          access?: string
          access_ids?: string[]
          channel_id?: string | null
          chapters?: Json
          created_at?: string
          department_id?: string | null
          description?: string | null
          downloadable?: boolean
          duration_sec?: number
          expires_at?: string | null
          help_request_id?: string | null
          id?: string
          kind?: string
          knowledge_id?: string | null
          mime_type?: string
          org_id: string
          owner_id: string
          project_id?: string | null
          room_id?: string | null
          size_bytes?: number
          status?: string
          storage_path: string
          summary?: Json | null
          task_id?: string | null
          thumbnail_path?: string | null
          title: string
          transcript?: string | null
          transcript_segments?: Json
          updated_at?: string
          views?: number
        }
        Update: {
          access?: string
          access_ids?: string[]
          channel_id?: string | null
          chapters?: Json
          created_at?: string
          department_id?: string | null
          description?: string | null
          downloadable?: boolean
          duration_sec?: number
          expires_at?: string | null
          help_request_id?: string | null
          id?: string
          kind?: string
          knowledge_id?: string | null
          mime_type?: string
          org_id?: string
          owner_id?: string
          project_id?: string | null
          room_id?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          summary?: Json | null
          task_id?: string | null
          thumbnail_path?: string | null
          title?: string
          transcript?: string | null
          transcript_segments?: Json
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_recordings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_help_request_id_fkey"
            columns: ["help_request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      live_rooms: {
        Row: {
          channel_id: string | null
          co_hosts: string[]
          confidential: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          ended_at: string | null
          federation_id: string | null
          help_request_id: string | null
          host_id: string | null
          id: string
          incident_id: string | null
          kind: string
          last_active_at: string
          livekit_room: string | null
          locked: boolean
          meeting_id: string | null
          org_id: string
          parent_room_id: string | null
          peak_participants: number
          persistent: boolean
          project_id: string | null
          settings: Json
          started_at: string
          status: string
          task_id: string | null
          team_id: string | null
          title: string
          updated_at: string
          visibility: string
          waiting_room: boolean
        }
        Insert: {
          channel_id?: string | null
          co_hosts?: string[]
          confidential?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          ended_at?: string | null
          federation_id?: string | null
          help_request_id?: string | null
          host_id?: string | null
          id?: string
          incident_id?: string | null
          kind?: string
          last_active_at?: string
          livekit_room?: string | null
          locked?: boolean
          meeting_id?: string | null
          org_id: string
          parent_room_id?: string | null
          peak_participants?: number
          persistent?: boolean
          project_id?: string | null
          settings?: Json
          started_at?: string
          status?: string
          task_id?: string | null
          team_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
          waiting_room?: boolean
        }
        Update: {
          channel_id?: string | null
          co_hosts?: string[]
          confidential?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          ended_at?: string | null
          federation_id?: string | null
          help_request_id?: string | null
          host_id?: string | null
          id?: string
          incident_id?: string | null
          kind?: string
          last_active_at?: string
          livekit_room?: string | null
          locked?: boolean
          meeting_id?: string | null
          org_id?: string
          parent_room_id?: string | null
          peak_participants?: number
          persistent?: boolean
          project_id?: string | null
          settings?: Json
          started_at?: string
          status?: string
          task_id?: string | null
          team_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
          waiting_room?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "live_rooms_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_federation_id_fkey"
            columns: ["federation_id"]
            isOneToOne: false
            referencedRelation: "federations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_help_request_id_fkey"
            columns: ["help_request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_parent_room_id_fkey"
            columns: ["parent_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_rooms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_transcripts: {
        Row: {
          created_at: string
          id: number
          lang: string
          offset_ms: number | null
          org_id: string
          recording_id: string | null
          room_id: string | null
          speaker_id: string | null
          speaker_name: string | null
          text: string
        }
        Insert: {
          created_at?: string
          id?: never
          lang?: string
          offset_ms?: number | null
          org_id: string
          recording_id?: string | null
          room_id?: string | null
          speaker_id?: string | null
          speaker_name?: string | null
          text: string
        }
        Update: {
          created_at?: string
          id?: never
          lang?: string
          offset_ms?: number | null
          org_id?: string
          recording_id?: string | null
          room_id?: string | null
          speaker_id?: string | null
          speaker_name?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_transcripts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_transcripts_recording_fk"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "live_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_transcripts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_transcripts_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          kind: string
          new_manager_id: string | null
          old_manager_id: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          kind?: string
          new_manager_id?: string | null
          old_manager_id?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          kind?: string
          new_manager_id?: string | null
          old_manager_id?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_history_new_manager_id_fkey"
            columns: ["new_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_history_old_manager_id_fkey"
            columns: ["old_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_history_user_id_fkey"
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
          async_suggested: boolean
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          department_id: string | null
          ends_at: string | null
          id: string
          live_room_id: string | null
          location: string | null
          meeting_link: string | null
          notes: string | null
          org_id: string
          organizer_id: string | null
          outcome_recorded: boolean
          project_id: string | null
          recording_url: string | null
          recurrence: string | null
          review_due_on: string | null
          starts_at: string
          summary: string | null
          title: string
          transcript: string | null
        }
        Insert: {
          agenda?: string | null
          async_suggested?: boolean
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          department_id?: string | null
          ends_at?: string | null
          id?: string
          live_room_id?: string | null
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id: string
          organizer_id?: string | null
          outcome_recorded?: boolean
          project_id?: string | null
          recording_url?: string | null
          recurrence?: string | null
          review_due_on?: string | null
          starts_at: string
          summary?: string | null
          title: string
          transcript?: string | null
        }
        Update: {
          agenda?: string | null
          async_suggested?: boolean
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          department_id?: string | null
          ends_at?: string | null
          id?: string
          live_room_id?: string | null
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          org_id?: string
          organizer_id?: string | null
          outcome_recorded?: boolean
          project_id?: string | null
          recording_url?: string | null
          recurrence?: string | null
          review_due_on?: string | null
          starts_at?: string
          summary?: string | null
          title?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_live_room_id_fkey"
            columns: ["live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
      memberships: {
        Row: {
          id: string
          is_primary: boolean
          joined_at: string
          last_used_at: string | null
          org_id: string
          role: Database["public"]["Enums"]["role_level"]
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          id?: string
          is_primary?: boolean
          joined_at?: string
          last_used_at?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["role_level"]
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          id?: string
          is_primary?: boolean
          joined_at?: string
          last_used_at?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["role_level"]
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      module_usage: {
        Row: {
          day: string
          hits: number
          module: string
          user_id: string
        }
        Insert: {
          day?: string
          hits?: number
          module: string
          user_id: string
        }
        Update: {
          day?: string
          hits?: number
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_layouts: {
        Row: {
          home_cards: Json
          id: string
          nav: Json
          org_id: string
          quick_actions: Json
          scope: string
          scope_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          home_cards?: Json
          id?: string
          nav?: Json
          org_id: string
          quick_actions?: Json
          scope: string
          scope_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          home_cards?: Json
          id?: string
          nav?: Json
          org_id?: string
          quick_actions?: Json
          scope?: string
          scope_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nav_layouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nav_layouts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      office_hours: {
        Row: {
          active: boolean
          department_id: string | null
          end_time: string
          host_id: string | null
          id: string
          note: string | null
          org_id: string
          slot_minutes: number
          start_time: string
          title: string
          weekday: number
        }
        Insert: {
          active?: boolean
          department_id?: string | null
          end_time: string
          host_id?: string | null
          id?: string
          note?: string | null
          org_id: string
          slot_minutes?: number
          start_time: string
          title: string
          weekday: number
        }
        Update: {
          active?: boolean
          department_id?: string | null
          end_time?: string
          host_id?: string | null
          id?: string
          note?: string | null
          org_id?: string
          slot_minutes?: number
          start_time?: string
          title?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_hours_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_hours_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_hours_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      org_features: {
        Row: {
          enabled: boolean
          feature_key: string
          limit_value: number | null
          org_id: string
          sandbox_user_ids: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          limit_value?: number | null
          org_id: string
          sandbox_user_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          limit_value?: number | null
          org_id?: string
          sandbox_user_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "platform_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "org_features_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_features_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          activated_at: string | null
          address: string | null
          archived_at: string | null
          country: string | null
          created_at: string
          created_by: string | null
          custom_domain: string | null
          domain_verified: boolean
          domain_verify_token: string | null
          email_domain: string | null
          favicon_url: string | null
          id: string
          industry: string | null
          legal_name: string | null
          limits: Json
          locale: string
          login_bg_url: string | null
          logo_url: string | null
          maintenance_until: string | null
          mfa_required: boolean
          name: string
          onboarding_stage: string
          plan: string
          primary_contact: string | null
          restrict_to_domain: boolean
          retention_days: number | null
          settings: Json
          slug: string
          status: string
          suspended_at: string | null
          tagline: string | null
          tenant_code: string | null
          terminology: Json
          timezone: string
          updated_at: string
          website: string | null
          welcome_message: string | null
          work_week: number[]
        }
        Insert: {
          accent_color?: string | null
          activated_at?: string | null
          address?: string | null
          archived_at?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_domain?: string | null
          domain_verified?: boolean
          domain_verify_token?: string | null
          email_domain?: string | null
          favicon_url?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          limits?: Json
          locale?: string
          login_bg_url?: string | null
          logo_url?: string | null
          maintenance_until?: string | null
          mfa_required?: boolean
          name: string
          onboarding_stage?: string
          plan?: string
          primary_contact?: string | null
          restrict_to_domain?: boolean
          retention_days?: number | null
          settings?: Json
          slug: string
          status?: string
          suspended_at?: string | null
          tagline?: string | null
          tenant_code?: string | null
          terminology?: Json
          timezone?: string
          updated_at?: string
          website?: string | null
          welcome_message?: string | null
          work_week?: number[]
        }
        Update: {
          accent_color?: string | null
          activated_at?: string | null
          address?: string | null
          archived_at?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_domain?: string | null
          domain_verified?: boolean
          domain_verify_token?: string | null
          email_domain?: string | null
          favicon_url?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          limits?: Json
          locale?: string
          login_bg_url?: string | null
          logo_url?: string | null
          maintenance_until?: string | null
          mfa_required?: boolean
          name?: string
          onboarding_stage?: string
          plan?: string
          primary_contact?: string | null
          restrict_to_domain?: boolean
          retention_days?: number | null
          settings?: Json
          slug?: string
          status?: string
          suspended_at?: string | null
          tagline?: string | null
          tenant_code?: string | null
          terminology?: Json
          timezone?: string
          updated_at?: string
          website?: string | null
          welcome_message?: string | null
          work_week?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_changes: {
        Row: {
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          id: number
          org_id: string | null
          perm: string | null
          reason: string | null
          subject: string
          subject_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: number
          org_id?: string | null
          perm?: string | null
          reason?: string | null
          subject: string
          subject_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: number
          org_id?: string | null
          perm?: string | null
          reason?: string | null
          subject?: string
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_changes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_overrides: {
        Row: {
          allowed: boolean
          created_at: string
          expires_at: string | null
          id: string
          perm: string
          reason: string | null
          set_by: string | null
          user_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          perm: string
          reason?: string | null
          set_by?: string | null
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          perm?: string
          reason?: string | null
          set_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_overrides_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_scopes: {
        Row: {
          created_at: string
          department_ids: string[]
          expires_at: string | null
          id: string
          org_id: string
          perm: string
          reason: string | null
          scope: string
          set_by: string | null
          subject: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          department_ids?: string[]
          expires_at?: string | null
          id?: string
          org_id: string
          perm: string
          reason?: string | null
          scope: string
          set_by?: string | null
          subject: string
          subject_id: string
        }
        Update: {
          created_at?: string
          department_ids?: string[]
          expires_at?: string | null
          id?: string
          org_id?: string
          perm?: string
          reason?: string | null
          scope?: string
          set_by?: string | null
          subject?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_scopes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_scopes_perm_fkey"
            columns: ["perm"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "permission_scopes_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string | null
          description: string | null
          grp: string
          key: string
          label: string
          legacy_alias: string | null
          module: string | null
          platform_only: boolean
          position: number
          requires: string[]
          risk: string
        }
        Insert: {
          action?: string | null
          description?: string | null
          grp?: string
          key: string
          label: string
          legacy_alias?: string | null
          module?: string | null
          platform_only?: boolean
          position?: number
          requires?: string[]
          risk?: string
        }
        Update: {
          action?: string | null
          description?: string | null
          grp?: string
          key?: string
          label?: string
          legacy_alias?: string | null
          module?: string | null
          platform_only?: boolean
          position?: number
          requires?: string[]
          risk?: string
        }
        Relationships: []
      }
      platform_admin_invites: {
        Row: {
          created_at: string
          email: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          role?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          note: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          publish_at: string
          severity: string
          target_orgs: string[]
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          publish_at?: string
          severity?: string
          target_orgs?: string[]
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          publish_at?: string
          severity?: string
          target_orgs?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_assignments: {
        Row: {
          created_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: number
          org_id: string | null
          reason: string | null
          summary: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          org_id?: string | null
          reason?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: never
          org_id?: string | null
          reason?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_features: {
        Row: {
          category: string
          default_enabled: boolean
          deprecated: boolean
          description: string | null
          key: string
          label: string
          position: number
        }
        Insert: {
          category?: string
          default_enabled?: boolean
          deprecated?: boolean
          description?: string | null
          key: string
          label: string
          position?: number
        }
        Update: {
          category?: string
          default_enabled?: boolean
          deprecated?: boolean
          description?: string | null
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      policies: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string | null
          department_ids: string[] | null
          effective_on: string
          employment_types: string[] | null
          id: string
          key: string
          org_id: string
          owner_id: string | null
          pass_mark: number
          quiz: Json | null
          requires_ack: boolean
          review_at: string | null
          roles: Database["public"]["Enums"]["role_level"][] | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          created_by?: string | null
          department_ids?: string[] | null
          effective_on?: string
          employment_types?: string[] | null
          id?: string
          key: string
          org_id: string
          owner_id?: string | null
          pass_mark?: number
          quiz?: Json | null
          requires_ack?: boolean
          review_at?: string | null
          roles?: Database["public"]["Enums"]["role_level"][] | null
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          department_ids?: string[] | null
          effective_on?: string
          employment_types?: string[] | null
          id?: string
          key?: string
          org_id?: string
          owner_id?: string | null
          pass_mark?: number
          quiz?: Json | null
          requires_ack?: boolean
          review_at?: string | null
          roles?: Database["public"]["Enums"]["role_level"][] | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acks: {
        Row: {
          acked_at: string
          policy_id: string
          quiz_score: number | null
          user_id: string
          version: number
        }
        Insert: {
          acked_at?: string
          policy_id: string
          quiz_score?: number | null
          user_id: string
          version: number
        }
        Update: {
          acked_at?: string
          policy_id?: string
          quiz_score?: number | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_acks_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          body: string
          change_note: string | null
          effective_on: string
          policy_id: string
          published_at: string
          published_by: string | null
          version: number
        }
        Insert: {
          body: string
          change_note?: string | null
          effective_on: string
          policy_id: string
          published_at?: string
          published_by?: string | null
          version: number
        }
        Update: {
          body?: string
          change_note?: string | null
          effective_on?: string
          policy_id?: string
          published_at?: string
          published_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_versions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          config_incomplete: boolean
          contract_ends_on: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          employee_code: string | null
          employment_type: string
          frozen: boolean
          frozen_reason: string | null
          full_name: string
          functional_manager_id: string | null
          id: string
          is_active: boolean
          is_external: boolean
          jd_file_id: string | null
          job_scope: string | null
          joined_at: string | null
          languages: string[]
          last_seen_at: string | null
          live_room_id: string | null
          live_state: string | null
          location: string | null
          manager_id: string | null
          notice_ends_on: string | null
          org_id: string | null
          phone: string | null
          presence: Database["public"]["Enums"]["presence_status"]
          presence_before_live:
            | Database["public"]["Enums"]["presence_status"]
            | null
          probation_ends_on: string | null
          qualifications: string | null
          responsibilities: string | null
          role: Database["public"]["Enums"]["role_level"]
          secondary_manager_id: string | null
          shift_id: string | null
          skills: string[]
          status: string
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
          config_incomplete?: boolean
          contract_ends_on?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          employee_code?: string | null
          employment_type?: string
          frozen?: boolean
          frozen_reason?: string | null
          full_name?: string
          functional_manager_id?: string | null
          id: string
          is_active?: boolean
          is_external?: boolean
          jd_file_id?: string | null
          job_scope?: string | null
          joined_at?: string | null
          languages?: string[]
          last_seen_at?: string | null
          live_room_id?: string | null
          live_state?: string | null
          location?: string | null
          manager_id?: string | null
          notice_ends_on?: string | null
          org_id?: string | null
          phone?: string | null
          presence?: Database["public"]["Enums"]["presence_status"]
          presence_before_live?:
            | Database["public"]["Enums"]["presence_status"]
            | null
          probation_ends_on?: string | null
          qualifications?: string | null
          responsibilities?: string | null
          role?: Database["public"]["Enums"]["role_level"]
          secondary_manager_id?: string | null
          shift_id?: string | null
          skills?: string[]
          status?: string
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
          config_incomplete?: boolean
          contract_ends_on?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_code?: string | null
          employment_type?: string
          frozen?: boolean
          frozen_reason?: string | null
          full_name?: string
          functional_manager_id?: string | null
          id?: string
          is_active?: boolean
          is_external?: boolean
          jd_file_id?: string | null
          job_scope?: string | null
          joined_at?: string | null
          languages?: string[]
          last_seen_at?: string | null
          live_room_id?: string | null
          live_state?: string | null
          location?: string | null
          manager_id?: string | null
          notice_ends_on?: string | null
          org_id?: string | null
          phone?: string | null
          presence?: Database["public"]["Enums"]["presence_status"]
          presence_before_live?:
            | Database["public"]["Enums"]["presence_status"]
            | null
          probation_ends_on?: string | null
          qualifications?: string | null
          responsibilities?: string | null
          role?: Database["public"]["Enums"]["role_level"]
          secondary_manager_id?: string | null
          shift_id?: string | null
          skills?: string[]
          status?: string
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
            foreignKeyName: "profiles_functional_manager_id_fkey"
            columns: ["functional_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_jd_file_id_fkey"
            columns: ["jd_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_live_room_id_fkey"
            columns: ["live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
      push_config: {
        Row: {
          enabled: boolean
          hook_secret: string | null
          hook_url: string | null
          id: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          hook_secret?: string | null
          hook_url?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          hook_secret?: string | null
          hook_url?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_used_at: string | null
          org_id: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          org_id?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          org_id?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          accepted_answer_id: string | null
          author_id: string
          body: string | null
          created_at: string
          department_id: string | null
          id: string
          org_id: string
          status: string
          tags: string[]
          title: string
          views: number
        }
        Insert: {
          accepted_answer_id?: string | null
          author_id: string
          body?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          org_id: string
          status?: string
          tags?: string[]
          title: string
          views?: number
        }
        Update: {
          accepted_answer_id?: string | null
          author_id?: string
          body?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          org_id?: string
          status?: string
          tags?: string[]
          title?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          amount: number | null
          approver_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          details: string | null
          ends_on: string | null
          escalated_at: string | null
          id: string
          kind: string
          org_id: string
          payload: Json
          second_approver_id: string | null
          sla_due_at: string | null
          starts_on: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          details?: string | null
          ends_on?: string | null
          escalated_at?: string | null
          id?: string
          kind: string
          org_id: string
          payload?: Json
          second_approver_id?: string | null
          sla_due_at?: string | null
          starts_on?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          details?: string | null
          ends_on?: string | null
          escalated_at?: string | null
          id?: string
          kind?: string
          org_id?: string
          payload?: Json
          second_approver_id?: string | null
          sla_due_at?: string | null
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_second_approver_id_fkey"
            columns: ["second_approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          active: boolean
          capacity: number | null
          id: string
          kind: string
          location: string | null
          name: string
          notes: string | null
          org_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          id?: string
          kind: string
          location?: string | null
          name: string
          notes?: string | null
          org_id: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          id?: string
          kind?: string
          location?: string | null
          name?: string
          notes?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      responsibilities: {
        Row: {
          backup_id: string | null
          created_at: string
          created_by: string | null
          critical: boolean
          decision_level: string | null
          department_id: string | null
          description: string | null
          escalation_owner_id: string | null
          id: string
          name: string
          org_id: string
          owner_id: string | null
          raci: Json | null
          requires_backup: boolean
          sop_knowledge_id: string | null
          successor_id: string | null
          tags: string[]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          backup_id?: string | null
          created_at?: string
          created_by?: string | null
          critical?: boolean
          decision_level?: string | null
          department_id?: string | null
          description?: string | null
          escalation_owner_id?: string | null
          id?: string
          name: string
          org_id: string
          owner_id?: string | null
          raci?: Json | null
          requires_backup?: boolean
          sop_knowledge_id?: string | null
          successor_id?: string | null
          tags?: string[]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          backup_id?: string | null
          created_at?: string
          created_by?: string | null
          critical?: boolean
          decision_level?: string | null
          department_id?: string | null
          description?: string | null
          escalation_owner_id?: string | null
          id?: string
          name?: string
          org_id?: string
          owner_id?: string | null
          raci?: Json | null
          requires_backup?: boolean
          sop_knowledge_id?: string | null
          successor_id?: string | null
          tags?: string[]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responsibilities_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_escalation_owner_id_fkey"
            columns: ["escalation_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_sop_knowledge_id_fkey"
            columns: ["sop_knowledge_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responsibilities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      retrospectives: {
        Row: {
          actions: Json
          changes: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          failed: string | null
          id: string
          org_id: string
          period: string | null
          project_id: string | null
          scope: string
          team_id: string | null
          worked: string | null
        }
        Insert: {
          actions?: Json
          changes?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          failed?: string | null
          id?: string
          org_id: string
          period?: string | null
          project_id?: string | null
          scope?: string
          team_id?: string | null
          worked?: string | null
        }
        Update: {
          actions?: Json
          changes?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          failed?: string | null
          id?: string
          org_id?: string
          period?: string | null
          project_id?: string | null
          scope?: string
          team_id?: string | null
          worked?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retrospectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrospectives_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrospectives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrospectives_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrospectives_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      role_defaults: {
        Row: {
          level: Database["public"]["Enums"]["role_level"]
          org_id: string
          permissions: string[]
        }
        Insert: {
          level: Database["public"]["Enums"]["role_level"]
          org_id: string
          permissions?: string[]
        }
        Update: {
          level?: Database["public"]["Enums"]["role_level"]
          org_id?: string
          permissions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "role_defaults_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_department_id: string | null
          new_designation: string | null
          new_role: Database["public"]["Enums"]["role_level"] | null
          new_status: string | null
          old_department_id: string | null
          old_designation: string | null
          old_role: Database["public"]["Enums"]["role_level"] | null
          old_status: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_department_id?: string | null
          new_designation?: string | null
          new_role?: Database["public"]["Enums"]["role_level"] | null
          new_status?: string | null
          old_department_id?: string | null
          old_designation?: string | null
          old_role?: Database["public"]["Enums"]["role_level"] | null
          old_status?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_department_id?: string | null
          new_designation?: string | null
          new_role?: Database["public"]["Enums"]["role_level"] | null
          new_status?: string | null
          old_department_id?: string | null
          old_designation?: string | null
          old_role?: Database["public"]["Enums"]["role_level"] | null
          old_status?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_rules: {
        Row: {
          allowed: boolean
          created_at: string
          expires_at: string | null
          id: string
          org_id: string
          reason: string | null
          scope: string
          scope_id: string | null
          screen_key: string
          set_by: string | null
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id: string
          reason?: string | null
          scope: string
          scope_id?: string | null
          screen_key: string
          set_by?: string | null
        }
        Update: {
          allowed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          scope?: string
          scope_id?: string | null
          screen_key?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screen_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_rules_screen_key_fkey"
            columns: ["screen_key"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "screen_rules_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      screens: {
        Row: {
          admin_only: boolean
          default_min_level: Database["public"]["Enums"]["role_level"]
          description: string | null
          external_ok: boolean
          grp: string
          key: string
          label: string
          path: string
          position: number
        }
        Insert: {
          admin_only?: boolean
          default_min_level?: Database["public"]["Enums"]["role_level"]
          description?: string | null
          external_ok?: boolean
          grp?: string
          key: string
          label: string
          path: string
          position?: number
        }
        Update: {
          admin_only?: boolean
          default_min_level?: Database["public"]["Enums"]["role_level"]
          description?: string | null
          external_ok?: boolean
          grp?: string
          key?: string
          label?: string
          path?: string
          position?: number
        }
        Relationships: []
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
      service_status: {
        Row: {
          id: string
          name: string
          note: string | null
          org_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          name: string
          note?: string | null
          org_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          note?: string | null
          org_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      signatures: {
        Row: {
          body: string
          inbox_id: string
          user_id: string
        }
        Insert: {
          body: string
          inbox_id: string
          user_id: string
        }
        Update: {
          body?: string
          inbox_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "inboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      standups: {
        Row: {
          audio_path: string | null
          blockers: string | null
          created_at: string
          day: string
          done: string | null
          id: string
          next: string | null
          org_id: string
          transcript: string | null
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          blockers?: string | null
          created_at?: string
          day?: string
          done?: string | null
          id?: string
          next?: string | null
          org_id: string
          transcript?: string | null
          user_id: string
        }
        Update: {
          audio_path?: string | null
          blockers?: string | null
          created_at?: string
          day?: string
          done?: string | null
          id?: string
          next?: string | null
          org_id?: string
          transcript?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standups_user_id_fkey"
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
      support_sessions: {
        Row: {
          created_at: string
          expires_at: string
          granted_by: string | null
          granted_to: string | null
          id: string
          org_id: string
          reason: string | null
          revoked_at: string | null
          scope: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by?: string | null
          granted_to?: string | null
          id?: string
          org_id: string
          reason?: string | null
          revoked_at?: string | null
          scope?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by?: string | null
          granted_to?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          revoked_at?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sessions_granted_to_fkey"
            columns: ["granted_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json
          created_at: string
          id: string
          survey_id: string
          user_id: string | null
        }
        Insert: {
          answers: Json
          created_at?: string
          id?: string
          survey_id: string
          user_id?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          survey_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          anonymous: boolean
          audience: Json
          created_at: string
          created_by: string | null
          id: string
          open_until: string | null
          org_id: string
          questions: Json
          title: string
        }
        Insert: {
          anonymous?: boolean
          audience?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          open_until?: string | null
          org_id: string
          questions?: Json
          title: string
        }
        Update: {
          anonymous?: boolean
          audience?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          open_until?: string | null
          org_id?: string
          questions?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_role_versions: {
        Row: {
          created_at: string
          created_by: string | null
          denied_screens: string[]
          description: string | null
          id: string
          name: string | null
          note: string | null
          org_id: string | null
          permissions: string[]
          screens: string[]
          system_role_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          denied_screens?: string[]
          description?: string | null
          id?: string
          name?: string | null
          note?: string | null
          org_id?: string | null
          permissions?: string[]
          screens?: string[]
          system_role_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          denied_screens?: string[]
          description?: string | null
          id?: string
          name?: string | null
          note?: string | null
          org_id?: string | null
          permissions?: string[]
          screens?: string[]
          system_role_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_role_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_role_versions_system_role_id_fkey"
            columns: ["system_role_id"]
            isOneToOne: false
            referencedRelation: "system_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_roles: {
        Row: {
          base_level: Database["public"]["Enums"]["role_level"]
          created_at: string
          created_by: string | null
          denied_screens: string[]
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          org_id: string
          permissions: string[]
          screens: string[]
        }
        Insert: {
          base_level?: Database["public"]["Enums"]["role_level"]
          created_at?: string
          created_by?: string | null
          denied_screens?: string[]
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          org_id: string
          permissions?: string[]
          screens?: string[]
        }
        Update: {
          base_level?: Database["public"]["Enums"]["role_level"]
          created_at?: string
          created_by?: string | null
          denied_screens?: string[]
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          org_id?: string
          permissions?: string[]
          screens?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "system_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_roles_org_id_fkey"
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
          ack_at: string | null
          ack_note: string | null
          ack_status: string | null
          actual_hours: number | null
          approver_id: string | null
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          definition_of_done: string | null
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
          quality_gates: Json | null
          recurrence: Json | null
          reopen_reason: string | null
          requires_approval: boolean
          revision_count: number
          source_decision_id: string | null
          source_live_room_id: string | null
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
          ack_at?: string | null
          ack_note?: string | null
          ack_status?: string | null
          actual_hours?: number | null
          approver_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          definition_of_done?: string | null
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
          quality_gates?: Json | null
          recurrence?: Json | null
          reopen_reason?: string | null
          requires_approval?: boolean
          revision_count?: number
          source_decision_id?: string | null
          source_live_room_id?: string | null
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
          ack_at?: string | null
          ack_note?: string | null
          ack_status?: string | null
          actual_hours?: number | null
          approver_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          definition_of_done?: string | null
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
          quality_gates?: Json | null
          recurrence?: Json | null
          reopen_reason?: string | null
          requires_approval?: boolean
          revision_count?: number
          source_decision_id?: string | null
          source_live_room_id?: string | null
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
            foreignKeyName: "tasks_source_live_room_id_fkey"
            columns: ["source_live_room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
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
          charter: Json
          created_at: string
          department_id: string
          id: string
          lead_id: string | null
          name: string
          org_id: string
          purpose: string | null
          wip_limit: number | null
        }
        Insert: {
          charter?: Json
          created_at?: string
          department_id: string
          id?: string
          lead_id?: string | null
          name: string
          org_id: string
          purpose?: string | null
          wip_limit?: number | null
        }
        Update: {
          charter?: Json
          created_at?: string
          department_id?: string
          id?: string
          lead_id?: string | null
          name?: string
          org_id?: string
          purpose?: string | null
          wip_limit?: number | null
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
      tenant_usage: {
        Row: {
          active_users: number
          ai_calls: number
          day: string
          employees: number
          messages: number
          org_id: string
          projects: number
          recordings: number
          storage_mb: number
          video_minutes: number
        }
        Insert: {
          active_users?: number
          ai_calls?: number
          day: string
          employees?: number
          messages?: number
          org_id: string
          projects?: number
          recordings?: number
          storage_mb?: number
          video_minutes?: number
        }
        Update: {
          active_users?: number
          ai_calls?: number
          day?: string
          employees?: number
          messages?: number
          org_id?: string
          projects?: number
          recordings?: number
          storage_mb?: number
          video_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_org_id_fkey"
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
      user_roles: {
        Row: {
          acting: boolean
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          reason: string | null
          starts_at: string
          system_role_id: string
          user_id: string
        }
        Insert: {
          acting?: boolean
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          starts_at?: string
          system_role_id: string
          user_id: string
        }
        Update: {
          acting?: boolean
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          starts_at?: string
          system_role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_system_role_id_fkey"
            columns: ["system_role_id"]
            isOneToOne: false
            referencedRelation: "system_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          arrived_at: string | null
          company: string | null
          created_at: string
          expected_at: string
          host_id: string
          id: string
          left_at: string | null
          name: string
          org_id: string
          phone: string | null
          purpose: string | null
          status: string
        }
        Insert: {
          arrived_at?: string | null
          company?: string | null
          created_at?: string
          expected_at: string
          host_id: string
          id?: string
          left_at?: string | null
          name: string
          org_id: string
          phone?: string | null
          purpose?: string | null
          status?: string
        }
        Update: {
          arrived_at?: string | null
          company?: string | null
          created_at?: string
          expected_at?: string
          host_id?: string
          id?: string
          left_at?: string | null
          name?: string
          org_id?: string
          phone?: string | null
          purpose?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitors_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_org_id_fkey"
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
      access_event_summary: { Args: { p_days?: number }; Returns: Json }
      access_findings: { Args: never; Returns: Json }
      access_review_board: { Args: { p_org?: string }; Returns: Json }
      ack_task: {
        Args: { p_note?: string; p_status: string; p_task: string }
        Returns: undefined
      }
      activity_timeline: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: {
          kind: string
          link: string
          occurred_at: string
          title: string
        }[]
      }
      add_promise: {
        Args: { p_conversation: string; p_due: string; p_text: string }
        Returns: string
      }
      admin_ceiling: { Args: { p_org?: string }; Returns: string[] }
      admin_sessions: {
        Args: { p_user?: string }
        Returns: {
          created_at: string
          current: boolean
          full_name: string
          ip: string
          session_id: string
          updated_at: string
          user_agent: string
          user_id: string
        }[]
      }
      ai_feedback_excerpt: { Args: { p_feedback: string }; Returns: Json }
      ai_requests_today: { Args: never; Returns: number }
      amend_grant: {
        Args: {
          p_clear_expiry?: boolean
          p_expires_at?: string
          p_grant: string
          p_level?: string
          p_reason?: string
        }
        Returns: undefined
      }
      apply_access_review: { Args: { p_review: string }; Returns: Json }
      apply_inbox_rules: {
        Args: {
          p_body: string
          p_conversation: string
          p_from: string
          p_subject: string
        }
        Returns: undefined
      }
      apply_role_change: { Args: { p_change: string }; Returns: undefined }
      apply_transfer: { Args: { p_transfer: string }; Returns: undefined }
      approve_message: {
        Args: { p_approve: boolean; p_message: string; p_note?: string }
        Returns: undefined
      }
      assign_conversation: {
        Args: { p_id: string; p_note?: string; p_user: string }
        Returns: undefined
      }
      assignment_warnings: {
        Args: { p_assignee: string; p_due?: string }
        Returns: Json
      }
      attendance_auto_checkout: { Args: never; Returns: number }
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
      attendance_cron_tick: { Args: never; Returns: Json }
      attendance_daily_summary: { Args: never; Returns: number }
      attendance_exceptions: {
        Args: { p_department?: string; p_from: string; p_to: string }
        Returns: {
          day: string
          department_id: string
          detail: string
          full_name: string
          kind: string
          minutes: number
          user_id: string
        }[]
      }
      attendance_patterns: {
        Args: { p_department?: string; p_from: string; p_to: string }
        Returns: {
          absent: number
          department_id: string
          early_leave: number
          excess_break: number
          full_name: string
          late: number
          missing_checkout: number
          short_day: number
          total: number
          user_id: string
        }[]
      }
      attendance_recompute: {
        Args: { p_day: string; p_user: string }
        Returns: undefined
      }
      attendance_settings: { Args: never; Returns: Json }
      attendance_summary: {
        Args: { p_department?: string; p_from: string; p_to: string }
        Returns: Json
      }
      automation_ctx: { Args: { p_entity: string; p_row: Json }; Returns: Json }
      blocker_chain: { Args: { p_task: string }; Returns: Json }
      board_element_task: {
        Args: {
          p_assignee?: string
          p_board: string
          p_due?: string
          p_element_id: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_title: string
        }
        Returns: string
      }
      board_restore: {
        Args: { p_board: string; p_version_id: string }
        Returns: undefined
      }
      board_snapshot: {
        Args: { p_board: string; p_label?: string }
        Returns: number
      }
      board_to_project: {
        Args: {
          p_board: string
          p_due?: string
          p_items?: Json
          p_name: string
        }
        Returns: string
      }
      break_policy_for: {
        Args: { p_user: string }
        Returns: {
          block_when_uncovered: boolean
          department_id: string | null
          id: string
          lunch_window: unknown
          max_count: number
          max_total_minutes: number
          min_available: number
          note: string | null
          org_id: string
          shift_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "break_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      call_person: {
        Args: { p_user: string; p_video?: boolean }
        Returns: string
      }
      can_assign: {
        Args: { p_assignee: string; p_assigner?: string }
        Returns: boolean
      }
      can_edit_board: { Args: { b: string }; Returns: boolean }
      can_edit_task: { Args: { t: string }; Returns: boolean }
      can_manage_permission: {
        Args: { p_org?: string; p_perm: string }
        Returns: boolean
      }
      can_review_access: { Args: { p_user: string }; Returns: boolean }
      can_see_workforce: { Args: { p_department?: string }; Returns: boolean }
      can_view_board: { Args: { b: string }; Returns: boolean }
      can_view_channel: { Args: { c: string }; Returns: boolean }
      can_view_classification: {
        Args: { c: Database["public"]["Enums"]["classification"] }
        Returns: boolean
      }
      can_view_contact: { Args: { p_id: string }; Returns: boolean }
      can_view_conversation: { Args: { p_id: string }; Returns: boolean }
      can_view_live_doc: { Args: { d: string }; Returns: boolean }
      can_view_live_room: { Args: { r: string }; Returns: boolean }
      can_view_project: { Args: { p: string }; Returns: boolean }
      can_view_recording: { Args: { r: string }; Returns: boolean }
      can_view_screen: { Args: { p_key: string }; Returns: boolean }
      can_view_task: { Args: { t: string }; Returns: boolean }
      can_view_workflow_run: { Args: { p_run: string }; Returns: boolean }
      cancel_meeting: {
        Args: { p_meeting: string; p_reason?: string }
        Returns: Json
      }
      candidate_org: { Args: { p_candidate: string }; Returns: string }
      candidate_owner: { Args: { p_candidate: string }; Returns: string }
      capacity_calendar: {
        Args: { p_days?: number; p_user?: string }
        Returns: Json
      }
      change_impact: {
        Args: {
          p_new_department?: string
          p_new_manager?: string
          p_new_role?: Database["public"]["Enums"]["role_level"]
          p_user: string
        }
        Returns: Json
      }
      change_manager: {
        Args: {
          p_kind?: string
          p_new_manager: string
          p_reason?: string
          p_user: string
        }
        Returns: undefined
      }
      claim_conversation: { Args: { p_id: string }; Returns: undefined }
      claim_help_request: { Args: { p_id: string }; Returns: undefined }
      clear_expired_dnd: { Args: never; Returns: number }
      clock: {
        Args: {
          p_break_type?: string
          p_kind: string
          p_location?: Json
          p_mode?: string
          p_note?: string
          p_source?: string
        }
        Returns: Json
      }
      collab_can: {
        Args: { p_action: string; p_user?: string }
        Returns: boolean
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
      commitment_reminders: { Args: never; Returns: number }
      company_go_live_blockers: { Args: { p_org: string }; Returns: Json }
      company_now: { Args: never; Returns: Json }
      company_pulse: { Args: never; Returns: Json }
      company_setup_health: { Args: { p_org: string }; Returns: Json }
      complete_follow_up: {
        Args: { p_id: string; p_outcome?: string }
        Returns: undefined
      }
      connect_dashboard: {
        Args: { p_days?: number; p_inbox?: string }
        Returns: Json
      }
      connect_settings: { Args: never; Returns: Json }
      connect_sla_tick: { Args: never; Returns: Json }
      contact_timeline: {
        Args: { p_contact: string; p_limit?: number }
        Returns: Json
      }
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
      coverage_after_break: { Args: { p_user: string }; Returns: Json }
      coverage_forecast: {
        Args: { p_department?: string; p_from?: string; p_to?: string }
        Returns: {
          absentees: string[]
          day: string
          department_id: string
          expected: number
          name: string
          on_leave: number
          required: number
          risk: string
        }[]
      }
      create_breakouts: {
        Args: { p_groups: Json; p_room: string }
        Returns: string[]
      }
      create_company: {
        Args: {
          p_admin_email?: string
          p_admin_name?: string
          p_clone_from?: string
          p_country?: string
          p_departments?: Json
          p_email_domain?: string
          p_industry?: string
          p_name: string
          p_slug?: string
          p_status?: string
          p_template?: string
          p_timezone?: string
        }
        Returns: string
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
      default_onboarding_steps: { Args: never; Returns: Json }
      delegate_for: {
        Args: { p_kind: string; p_user: string }
        Returns: string
      }
      delete_collab_policy: { Args: { p_id: string }; Returns: undefined }
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
      department_coverage: {
        Args: { p_at?: string }
        Returns: {
          available: number
          color: string
          department_id: string
          field: number
          in_meeting: number
          name: string
          not_in: number
          on_break: number
          on_duty: string
          on_leave: number
          remote: number
          required: number
          shortfall: number
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
      effective_approver: {
        Args: { p_kind?: string; p_user: string }
        Returns: string
      }
      effective_level: {
        Args: { p_user?: string }
        Returns: Database["public"]["Enums"]["role_level"]
      }
      effective_nav: { Args: { p_user?: string }; Returns: Json }
      effective_permissions: { Args: { p_user?: string }; Returns: Json }
      effective_screens: {
        Args: { p_user?: string }
        Returns: {
          allowed: boolean
          grp: string
          key: string
          label: string
          path: string
          sort_order: number
          source: string
        }[]
      }
      end_break_glass: { Args: { p_id: string }; Returns: undefined }
      end_breakouts: { Args: { p_room: string }; Returns: undefined }
      end_live_room: {
        Args: { p_room: string; p_summary?: string }
        Returns: undefined
      }
      escalate_help_requests: { Args: never; Returns: number }
      escalate_requests: { Args: never; Returns: number }
      eval_condition: { Args: { cond: Json; ctx: Json }; Returns: boolean }
      expire_access_grants: { Args: never; Returns: number }
      expire_collaboration: { Args: never; Returns: number }
      expire_delegations_and_roles: { Args: never; Returns: number }
      explain_access: {
        Args: { p_id: string; p_type: string; p_user: string }
        Returns: Json
      }
      explain_permission: {
        Args: { p_perm: string; p_user: string }
        Returns: Json
      }
      feature_enabled: {
        Args: { p_feature: string; p_user?: string }
        Returns: boolean
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
      find_or_create_contact: {
        Args: {
          p_department?: string
          p_email?: string
          p_name?: string
          p_org: string
          p_phone?: string
        }
        Returns: string
      }
      fire_automations: {
        Args: { p_entity: string; p_event: string; p_old?: Json; p_row: Json }
        Returns: number
      }
      freeze_department: {
        Args: { p_department: string; p_frozen: boolean; p_reason?: string }
        Returns: number
      }
      freeze_user: {
        Args: { p_reason: string; p_user: string }
        Returns: undefined
      }
      grant_support_access: {
        Args: { p_hours?: number; p_reason?: string; p_scope?: string }
        Returns: string
      }
      has_admin_perm: { Args: { perm: string }; Returns: boolean }
      has_admin_perm_user: {
        Args: { p_user: string; perm: string }
        Returns: boolean
      }
      has_break_glass: {
        Args: { p_org: string; p_user?: string }
        Returns: boolean
      }
      has_grant: {
        Args: { p_id: string; p_level?: string; p_type: string }
        Returns: boolean
      }
      has_perm: { Args: { p_perm: string; p_user?: string }; Returns: boolean }
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
      huddle_suggestion: { Args: { p_channel: string }; Returns: Json }
      imm_array_to_string: { Args: { a: string[] }; Returns: string }
      import_people: { Args: { p_rows: Json }; Returns: Json }
      in_federation: {
        Args: { p_federation: string; p_user?: string }
        Returns: boolean
      }
      in_focus_window: {
        Args: { p_at: string; p_department: string }
        Returns: boolean
      }
      in_quiet_hours: { Args: { uid: string }; Returns: boolean }
      in_scope_department: {
        Args: { p_dept: string; p_perm: string; p_user?: string }
        Returns: boolean
      }
      in_scope_user: {
        Args: { p_perm: string; p_target: string; p_user?: string }
        Returns: boolean
      }
      ingest_email: {
        Args: { p_payload: Json; p_token: string }
        Returns: Json
      }
      ingest_message: {
        Args: { p_payload: Json; p_token: string }
        Returns: Json
      }
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
      is_candidate_panelist: {
        Args: { p_candidate: string; p_user?: string }
        Returns: boolean
      }
      is_channel_member: { Args: { c: string }; Returns: boolean }
      is_company_super_admin: { Args: { p_user?: string }; Returns: boolean }
      is_hr: { Args: never; Returns: boolean }
      is_inbox_member: {
        Args: { p_inbox: string; p_user?: string }
        Returns: boolean
      }
      is_inbox_supervisor: {
        Args: { p_inbox: string; p_user?: string }
        Returns: boolean
      }
      is_internal: { Args: never; Returns: boolean }
      is_internal_user: { Args: { p_user: string }; Returns: boolean }
      is_knowledge_owner: { Args: { d: string }; Returns: boolean }
      is_lead_plus: { Args: never; Returns: boolean }
      is_live_host: { Args: { p_user?: string; r: string }; Returns: boolean }
      is_manager_of: { Args: { u: string }; Returns: boolean }
      is_manager_of_user: {
        Args: { p_manager: string; p_user: string }
        Returns: boolean
      }
      is_manager_plus: { Args: never; Returns: boolean }
      is_meeting_participant: {
        Args: { p_meeting: string; p_user?: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_admin_user: { Args: { p_user: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      is_platform_owner_user: { Args: { p_user: string }; Returns: boolean }
      is_primary_admin: { Args: never; Returns: boolean }
      is_primary_admin_user: { Args: { p_user: string }; Returns: boolean }
      is_project_member: { Args: { p: string }; Returns: boolean }
      is_run_step_owner: {
        Args: { p_run: string; p_user?: string }
        Returns: boolean
      }
      join_live_room: {
        Args: { p_device?: string; p_room: string }
        Returns: Json
      }
      knock: { Args: { p_message?: string; p_user: string }; Returns: string }
      leave_collisions: { Args: { p_leave: string }; Returns: Json }
      leave_days: {
        Args: { p_from: string; p_half: boolean; p_to: string }
        Returns: number
      }
      leave_impact: {
        Args: { p_from: string; p_to: string; p_user: string }
        Returns: Json
      }
      leave_live_room: { Args: { p_room: string }; Returns: undefined }
      live_bookmark: {
        Args: { p_label?: string; p_offset_ms?: number; p_room: string }
        Returns: undefined
      }
      live_doc_snapshot: {
        Args: { p_doc: string; p_label?: string }
        Returns: number
      }
      live_doc_task: {
        Args: {
          p_assignee?: string
          p_doc: string
          p_due?: string
          p_text: string
        }
        Returns: string
      }
      live_governance: { Args: never; Returns: Json }
      live_guest_consume: {
        Args: { p_name: string; p_token: string }
        Returns: undefined
      }
      live_guest_link: {
        Args: {
          p_email?: string
          p_hours?: number
          p_name?: string
          p_room: string
        }
        Returns: string
      }
      live_guest_lookup: { Args: { p_token: string }; Returns: Json }
      live_history: { Args: { p_id: string; p_type: string }; Returns: Json }
      live_invite: {
        Args: {
          p_kind?: string
          p_message?: string
          p_room: string
          p_user: string
        }
        Returns: string
      }
      live_invite_department: {
        Args: { p_department: string; p_message?: string; p_room: string }
        Returns: number
      }
      live_moderate: {
        Args: {
          p_action: string
          p_room: string
          p_user: string
          p_value?: string
        }
        Returns: undefined
      }
      live_raise_hand: {
        Args: { p_room: string; p_up: boolean }
        Returns: undefined
      }
      live_room_decision: {
        Args: {
          p_decision: string
          p_reason?: string
          p_room: string
          p_title: string
        }
        Returns: string
      }
      live_room_task: {
        Args: {
          p_assignee?: string
          p_attachments?: Json
          p_description?: string
          p_due?: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_room: string
          p_title: string
        }
        Returns: string
      }
      live_running_late: {
        Args: { p_meeting: string; p_minutes?: number }
        Returns: undefined
      }
      live_tick: { Args: never; Returns: number }
      live_to_knowledge: {
        Args: {
          p_body: string
          p_department?: string
          p_kind?: string
          p_recording?: string
          p_room?: string
          p_title: string
        }
        Returns: string
      }
      lock_feature: {
        Args: { p_feature: string; p_locked: boolean; p_reason?: string }
        Returns: undefined
      }
      log_access_event: {
        Args: {
          p_details?: Json
          p_id?: string
          p_kind: string
          p_path?: string
          p_type?: string
        }
        Returns: undefined
      }
      log_call: {
        Args: {
          p_contact: string
          p_conversation?: string
          p_direction: string
          p_disposition?: string
          p_ended?: string
          p_next_action?: string
          p_next_at?: string
          p_notes?: string
          p_phone?: string
          p_promise?: string
          p_promise_due?: string
          p_started?: string
        }
        Returns: Json
      }
      mark_channel_read: { Args: { c: string }; Returns: undefined }
      mark_message_sent: {
        Args: {
          p_error?: string
          p_external_id?: string
          p_message: string
          p_ok: boolean
        }
        Returns: undefined
      }
      meeting_cost: { Args: { p_meeting: string }; Returns: Json }
      meeting_load: { Args: { p_day?: string; p_user?: string }; Returns: Json }
      meeting_org: { Args: { p_meeting: string }; Returns: string }
      meeting_project: { Args: { p_meeting: string }; Returns: string }
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
      my_attendance_exceptions: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          detail: string
          kind: string
          minutes: number
        }[]
      }
      my_calendar_token: { Args: never; Returns: string }
      my_commitments: { Args: never; Returns: Json }
      my_connect_queue: { Args: never; Returns: Json }
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
      my_pending_policies: {
        Args: never
        Returns: {
          category: string
          effective_on: string
          has_quiz: boolean
          id: string
          title: string
          version: number
        }[]
      }
      my_unread_counts: {
        Args: never
        Returns: {
          channel_id: string
          unread: number
        }[]
      }
      my_workspaces: { Args: never; Returns: Json }
      needs_send_approval: { Args: { p_user?: string }; Returns: boolean }
      nudge_workflow_step: {
        Args: { p_note?: string; p_step: string }
        Returns: undefined
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
      operational_inactivity: { Args: { p_hours?: number }; Returns: Json }
      org_completeness_audit: { Args: never; Returns: number }
      org_feature_enabled: {
        Args: { p_key: string; p_org?: string }
        Returns: boolean
      }
      org_health: { Args: never; Returns: Json }
      people_intelligence: { Args: { p_days?: number }; Returns: Json }
      permission_holders: { Args: { p_perm: string }; Returns: Json }
      permission_scope: {
        Args: { p_perm: string; p_user?: string }
        Returns: Json
      }
      person_name: { Args: { uid: string }; Returns: string }
      pick_agent: { Args: { p_inbox: string }; Returns: string }
      platform_can_touch: {
        Args: { p_org: string; p_user?: string }
        Returns: boolean
      }
      platform_company: { Args: { p_org: string }; Returns: Json }
      platform_overview: { Args: never; Returns: Json }
      platform_role: { Args: { p_user?: string }; Returns: string }
      platform_self_test: { Args: never; Returns: Json }
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
      preview_role_access: { Args: { p_role: string }; Returns: Json }
      preview_user_access: { Args: { p_user: string }; Returns: Json }
      probation_reminders: { Args: never; Returns: number }
      publish_platform_announcement: { Args: { p_id: string }; Returns: number }
      purge_access_events: { Args: never; Returns: number }
      push_notification: {
        Args: { p_id: string; p_secret: string }
        Returns: Json
      }
      push_settle: {
        Args: {
          p_dead?: string[]
          p_delivered?: string[]
          p_secret: string
          p_shaky?: string[]
        }
        Returns: undefined
      }
      push_targets: {
        Args: {
          p_kind?: string
          p_org?: string
          p_secret: string
          p_user: string
        }
        Returns: Json
      }
      queue_message: {
        Args: {
          p_ai?: boolean
          p_attachments?: Json
          p_body: string
          p_cc?: string[]
          p_conversation: string
          p_html?: string
          p_kind?: string
          p_subject?: string
          p_template?: string
          p_to?: string[]
        }
        Returns: Json
      }
      related_to: { Args: { eid: string; entity: string }; Returns: Json }
      remove_push_subscription: {
        Args: { p_endpoint: string }
        Returns: number
      }
      render_tpl: { Args: { ctx: Json; tpl: string }; Returns: string }
      reports_of: {
        Args: { p_depth?: number; p_user?: string }
        Returns: {
          department_id: string
          depth: number
          designation: string
          full_name: string
          id: string
          manager_id: string
          presence: Database["public"]["Enums"]["presence_status"]
          role: Database["public"]["Enums"]["role_level"]
          status: string
        }[]
      }
      request_federation: {
        Args: { p_days?: number; p_other_org: string; p_purpose: string }
        Returns: string
      }
      resolve_conversation: {
        Args: { p_disposition?: string; p_id: string; p_note?: string }
        Returns: undefined
      }
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
      respond_federation: {
        Args: { p_approve: boolean; p_id: string }
        Returns: undefined
      }
      respond_live_invite: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      restore_handovers: { Args: never; Returns: number }
      restore_system_role: {
        Args: { p_reason?: string; p_role: string; p_version: number }
        Returns: Json
      }
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
      revoke_session: { Args: { p_session: string }; Returns: undefined }
      revoke_support_access: { Args: { p_id: string }; Returns: undefined }
      role_change_impact: {
        Args: { p_permissions: string[]; p_role: string }
        Returns: Json
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
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: string
      }
      schedule_next_run: {
        Args: { cfg: Json; from_ts: string }
        Returns: string
      }
      scope_rank: { Args: { p_scope: string }; Returns: number }
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
      search_contacts: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          company: string
          do_not_contact: boolean
          emails: string[]
          id: string
          kind: string
          last_contact_at: string
          name: string
          owner: string
          phones: string[]
          vip: boolean
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
      selftest_allowed: { Args: never; Returns: boolean }
      selftest_global_tables: { Args: never; Returns: string[] }
      selftest_isolation_report: { Args: never; Returns: Json }
      selftest_jwt_role: { Args: never; Returns: string }
      selftest_platform_only_tables: { Args: never; Returns: string[] }
      selftest_result: { Args: { p_checks: Json }; Returns: Json }
      set_active_workspace: {
        Args: { p_org: string; p_reason?: string }
        Returns: Json
      }
      set_attendance_settings: { Args: { p_patch: Json }; Returns: Json }
      set_collab_policy: {
        Args: {
          p_department: string
          p_role: Database["public"]["Enums"]["role_level"]
          p_scope: string
          p_values: Json
        }
        Returns: string
      }
      set_company_status: {
        Args: { p_org: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_connect_settings: { Args: { p_patch: Json }; Returns: Json }
      set_employee_status: {
        Args: { p_reason?: string; p_status: string; p_user: string }
        Returns: undefined
      }
      set_live_state: { Args: { p_state: string }; Returns: undefined }
      set_org_feature: {
        Args: {
          p_enabled: boolean
          p_key: string
          p_limit?: number
          p_org: string
        }
        Returns: undefined
      }
      similar_help_requests: {
        Args: { p_department: string; p_limit?: number; p_title: string }
        Returns: {
          id: string
          similarity: number
          status: Database["public"]["Enums"]["help_status"]
          title: string
        }[]
      }
      similar_knowledge: {
        Args: { p_limit?: number; p_title: string }
        Returns: {
          id: string
          kind: string
          similarity: number
          title: string
        }[]
      }
      similar_tasks: {
        Args: { p_limit?: number; p_title: string }
        Returns: {
          assignee: string
          id: string
          similarity: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }[]
      }
      since_last_visit: { Args: { p_since: string }; Returns: Json }
      skip_workflow_step: {
        Args: { p_reason?: string; p_step: string }
        Returns: undefined
      }
      snooze_conversation: {
        Args: { p_id: string; p_note?: string; p_until: string }
        Returns: undefined
      }
      start_access_review: {
        Args: { p_department?: string; p_due?: string; p_name: string }
        Returns: string
      }
      start_break_glass: {
        Args: {
          p_justification: string
          p_minutes?: number
          p_org: string
          p_reason: string
          p_scope?: string
        }
        Returns: string
      }
      start_conversation: {
        Args: {
          p_channel?: string
          p_contact: string
          p_inbox?: string
          p_subject?: string
        }
        Returns: string
      }
      start_focus: {
        Args: { p_note?: string; p_task?: string }
        Returns: string
      }
      start_live_room: {
        Args: {
          p_channel?: string
          p_department?: string
          p_help?: string
          p_incident?: string
          p_invitees?: string[]
          p_kind?: string
          p_meeting?: string
          p_parent?: string
          p_persistent?: boolean
          p_project?: string
          p_settings?: Json
          p_task?: string
          p_team?: string
          p_title?: string
          p_visibility?: string
        }
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
      storage_org_ok: { Args: { p_name: string }; Returns: boolean }
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
      team_digest: {
        Args: { p_day?: string; p_department?: string }
        Returns: Json
      }
      tenant_isolation_probe: { Args: { p_other_org: string }; Returns: Json }
      tenant_isolation_report: { Args: never; Returns: Json }
      tenant_usage_snapshot: { Args: never; Returns: number }
      test_access_control: { Args: never; Returns: Json }
      test_automation: { Args: { p_id: string; p_task: string }; Returns: Json }
      test_enum_casts: { Args: never; Returns: Json }
      test_function_volatility: { Args: never; Returns: Json }
      test_policy_recursion: { Args: never; Returns: Json }
      test_returning_policies: { Args: never; Returns: Json }
      test_rls_role_sweep: { Args: never; Returns: Json }
      test_tenant_scoping: { Args: never; Returns: Json }
      timesheet_suggestions: { Args: { p_day: string }; Returns: Json }
      touch_module: { Args: { p_module: string }; Returns: undefined }
      training_gate_ok: { Args: { p_user?: string }; Returns: boolean }
      transfer_work: {
        Args: { p_from: string; p_reason?: string; p_to: string }
        Returns: Json
      }
      undo_config: { Args: { p_history: number }; Returns: undefined }
      unfreeze_user: { Args: { p_user: string }; Returns: undefined }
      urgent_assistance: {
        Args: { p_kind: string; p_message: string }
        Returns: string
      }
      view_as: { Args: { p_user: string }; Returns: Json }
      waiting_on_me: { Args: { p_user?: string }; Returns: Json }
      what_if_absent: {
        Args: { p_from?: string; p_to?: string; p_user: string }
        Returns: Json
      }
      while_you_were_away: { Args: { p_since: string }; Returns: Json }
      who_can_see: { Args: { p_id: string; p_type: string }; Returns: Json }
      who_has_ball: { Args: { p_id: string; p_type: string }; Returns: Json }
      who_owns: {
        Args: { p_q: string }
        Returns: {
          backup_id: string
          backup_name: string
          critical: boolean
          department: string
          id: string
          kind: string
          name: string
          owner_id: string
          owner_name: string
        }[]
      }
      workflow_release_step: { Args: { p_step: string }; Returns: undefined }
      workflow_run_starter: { Args: { p_run: string }; Returns: string }
      workforce_live: { Args: never; Returns: Json }
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
      workspaces_for_email: { Args: { p_email: string }; Returns: Json }
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
