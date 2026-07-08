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
      app_settings: {
        Row: {
          app_language: string
          default_transport_pct: number
          email_dns_records: Json
          email_domain: string | null
          hide_location_info: boolean
          id: number
          outbound_from_email: string | null
          outbound_reply_to_email: string | null
          outbound_test_email: string | null
          outbound_test_mode: boolean
          primary_location_id: string | null
          updated_at: string
          worker_language: string
          workshop_phone: string | null
        }
        Insert: {
          app_language?: string
          default_transport_pct?: number
          email_dns_records?: Json
          email_domain?: string | null
          hide_location_info?: boolean
          id?: number
          outbound_from_email?: string | null
          outbound_reply_to_email?: string | null
          outbound_test_email?: string | null
          outbound_test_mode?: boolean
          primary_location_id?: string | null
          updated_at?: string
          worker_language?: string
          workshop_phone?: string | null
        }
        Update: {
          app_language?: string
          default_transport_pct?: number
          email_dns_records?: Json
          email_domain?: string | null
          hide_location_info?: boolean
          id?: number
          outbound_from_email?: string | null
          outbound_reply_to_email?: string | null
          outbound_test_email?: string | null
          outbound_test_mode?: boolean
          primary_location_id?: string | null
          updated_at?: string
          worker_language?: string
          workshop_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_primary_location_id_fkey"
            columns: ["primary_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          mime_type: string | null
          purpose: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          purpose?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          purpose?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changed_fields: string[] | null
          entity_id: string
          entity_type: string
          id: string
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          request_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changed_fields?: string[] | null
          entity_id: string
          entity_type: string
          id?: string
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changed_fields?: string[] | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          request_id?: string | null
        }
        Relationships: []
      }
      bike_families: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      bike_identifier_types: {
        Row: {
          created_at: string
          description_da: string | null
          description_en: string | null
          format_regex: string | null
          id: string
          is_active: boolean
          is_globally_unique: boolean
          name_da: string | null
          name_en: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          format_regex?: string | null
          id?: string
          is_active?: boolean
          is_globally_unique?: boolean
          name_da?: string | null
          name_en: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          format_regex?: string | null
          id?: string
          is_active?: boolean
          is_globally_unique?: boolean
          name_da?: string | null
          name_en?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      bike_identifiers: {
        Row: {
          bike_id: string
          created_at: string
          deactivated_at: string | null
          id: string
          identifier_type_id: string
          identifier_value: string
          is_active: boolean
          notes: string | null
        }
        Insert: {
          bike_id: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          identifier_type_id: string
          identifier_value: string
          is_active?: boolean
          notes?: string | null
        }
        Update: {
          bike_id?: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          identifier_type_id?: string
          identifier_value?: string
          is_active?: boolean
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bike_identifiers_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_identifiers_identifier_type_id_fkey"
            columns: ["identifier_type_id"]
            isOneToOne: false
            referencedRelation: "bike_identifier_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bike_parts: {
        Row: {
          bike_id: string
          created_at: string
          id: string
          installed_at: string
          inventory_movement_id: string | null
          notes: string | null
          part_id: string
          quantity: number
          removed_at: string | null
        }
        Insert: {
          bike_id: string
          created_at?: string
          id?: string
          installed_at?: string
          inventory_movement_id?: string | null
          notes?: string | null
          part_id: string
          quantity?: number
          removed_at?: string | null
        }
        Update: {
          bike_id?: string
          created_at?: string
          id?: string
          installed_at?: string
          inventory_movement_id?: string | null
          notes?: string | null
          part_id?: string
          quantity?: number
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bike_parts_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_parts_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      bike_state_log: {
        Row: {
          actor_id: string | null
          bike_id: string
          from_status: Database["public"]["Enums"]["bike_status"] | null
          id: string
          metadata: Json
          occurred_at: string
          reason: string | null
          to_status: Database["public"]["Enums"]["bike_status"]
        }
        Insert: {
          actor_id?: string | null
          bike_id: string
          from_status?: Database["public"]["Enums"]["bike_status"] | null
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["bike_status"]
        }
        Update: {
          actor_id?: string | null
          bike_id?: string
          from_status?: Database["public"]["Enums"]["bike_status"] | null
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["bike_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bike_state_log_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      bike_template_parts: {
        Row: {
          id: string
          is_optional: boolean
          notes: string | null
          part_id: string
          quantity: number
          template_id: string
        }
        Insert: {
          id?: string
          is_optional?: boolean
          notes?: string | null
          part_id: string
          quantity?: number
          template_id: string
        }
        Update: {
          id?: string
          is_optional?: boolean
          notes?: string | null
          part_id?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bike_template_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_template_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_template_parts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      bike_templates: {
        Row: {
          bike_type_id: string
          created_at: string
          created_by: string | null
          default_retail_currency: string | null
          default_retail_price: number | null
          family_id: string | null
          frame_size: string
          id: string
          is_current: boolean
          name_da: string | null
          name_en: string
          notes: string | null
          version: number
        }
        Insert: {
          bike_type_id: string
          created_at?: string
          created_by?: string | null
          default_retail_currency?: string | null
          default_retail_price?: number | null
          family_id?: string | null
          frame_size: string
          id?: string
          is_current?: boolean
          name_da?: string | null
          name_en: string
          notes?: string | null
          version?: number
        }
        Update: {
          bike_type_id?: string
          created_at?: string
          created_by?: string | null
          default_retail_currency?: string | null
          default_retail_price?: number | null
          family_id?: string | null
          frame_size?: string
          id?: string
          is_current?: boolean
          name_da?: string | null
          name_en?: string
          notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bike_templates_bike_type_id_fkey"
            columns: ["bike_type_id"]
            isOneToOne: false
            referencedRelation: "bike_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_templates_default_retail_currency_fkey"
            columns: ["default_retail_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bike_templates_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "bike_families"
            referencedColumns: ["id"]
          },
        ]
      }
      bike_type_required_identifiers: {
        Row: {
          bike_identifier_type_id: string
          bike_type_id: string
          is_required: boolean
          notes: string | null
        }
        Insert: {
          bike_identifier_type_id: string
          bike_type_id: string
          is_required?: boolean
          notes?: string | null
        }
        Update: {
          bike_identifier_type_id?: string
          bike_type_id?: string
          is_required?: boolean
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bike_type_required_identifiers_bike_identifier_type_id_fkey"
            columns: ["bike_identifier_type_id"]
            isOneToOne: false
            referencedRelation: "bike_identifier_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bike_type_required_identifiers_bike_type_id_fkey"
            columns: ["bike_type_id"]
            isOneToOne: false
            referencedRelation: "bike_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bike_types: {
        Row: {
          created_at: string
          description_da: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_da: string | null
          name_en: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      bikes: {
        Row: {
          assigned_at: string | null
          bike_type_id: string
          build_cost_dkk: number | null
          built_at: string | null
          color_id: string | null
          created_at: string
          current_location_id: string | null
          current_location_text: string | null
          deleted_at: string | null
          frame_number: string
          frame_number_confirmed: boolean
          id: string
          manufacturing_order_id: string | null
          notes: string | null
          owner_organization_id: string | null
          owner_unit_id: string | null
          sale_currency: string | null
          sale_price: number | null
          status: Database["public"]["Enums"]["bike_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          bike_type_id: string
          build_cost_dkk?: number | null
          built_at?: string | null
          color_id?: string | null
          created_at?: string
          current_location_id?: string | null
          current_location_text?: string | null
          deleted_at?: string | null
          frame_number: string
          frame_number_confirmed?: boolean
          id?: string
          manufacturing_order_id?: string | null
          notes?: string | null
          owner_organization_id?: string | null
          owner_unit_id?: string | null
          sale_currency?: string | null
          sale_price?: number | null
          status?: Database["public"]["Enums"]["bike_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          bike_type_id?: string
          build_cost_dkk?: number | null
          built_at?: string | null
          color_id?: string | null
          created_at?: string
          current_location_id?: string | null
          current_location_text?: string | null
          deleted_at?: string | null
          frame_number?: string
          frame_number_confirmed?: boolean
          id?: string
          manufacturing_order_id?: string | null
          notes?: string | null
          owner_organization_id?: string | null
          owner_unit_id?: string | null
          sale_currency?: string | null
          sale_price?: number | null
          status?: Database["public"]["Enums"]["bike_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bikes_bike_type_id_fkey"
            columns: ["bike_type_id"]
            isOneToOne: false
            referencedRelation: "bike_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bikes_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bikes_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bikes_owner_organization_id_fkey"
            columns: ["owner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bikes_owner_unit_id_fkey"
            columns: ["owner_unit_id"]
            isOneToOne: false
            referencedRelation: "organization_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bikes_sale_currency_fkey"
            columns: ["sale_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bikes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bikes_mo"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coatings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label_da: string
          label_en: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_da: string
          label_en: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_da?: string
          label_en?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      colors: {
        Row: {
          coating: string | null
          created_at: string
          hex: string | null
          id: string
          is_active: boolean
          name_da: string
          name_en: string
          ral_code: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          coating?: string | null
          created_at?: string
          hex?: string | null
          id?: string
          is_active?: boolean
          name_da: string
          name_en: string
          ral_code?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          coating?: string | null
          created_at?: string
          hex?: string | null
          id?: string
          is_active?: boolean
          name_da?: string
          name_en?: string
          ral_code?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          is_primary: boolean
          last_name: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          pii_redacted_at: string | null
          preferred_language: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          pii_redacted_at?: string | null
          preferred_language?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean
          last_name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          pii_redacted_at?: string | null
          preferred_language?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          decimal_places: number
          name_da: string | null
          name_en: string
          sort_order: number
          symbol: string | null
        }
        Insert: {
          code: string
          decimal_places?: number
          name_da?: string | null
          name_en: string
          sort_order?: number
          symbol?: string | null
        }
        Update: {
          code?: string
          decimal_places?: number
          name_da?: string | null
          name_en?: string
          sort_order?: number
          symbol?: string | null
        }
        Relationships: []
      }
      customer_groups: {
        Row: {
          created_at: string
          default_discount_percent: number
          description_da: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_da: string | null
          name_en: string
          slug: string
        }
        Insert: {
          created_at?: string
          default_discount_percent?: number
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en: string
          slug: string
        }
        Update: {
          created_at?: string
          default_discount_percent?: number
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en?: string
          slug?: string
        }
        Relationships: []
      }
      customer_segments: {
        Row: {
          created_at: string
          description_da: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_da: string | null
          name_en: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      document_sequences: {
        Row: {
          current_value: number
          document_type: string
          pad_width: number
          prefix: string
          year: number
        }
        Insert: {
          current_value?: number
          document_type: string
          pad_width?: number
          prefix: string
          year: number
        }
        Update: {
          current_value?: number
          document_type?: string
          pad_width?: number
          prefix?: string
          year?: number
        }
        Relationships: []
      }
      frame_lookup_attempts: {
        Row: {
          attempted_at: string
          found: boolean
          id: number
          ip: unknown
        }
        Insert: {
          attempted_at?: string
          found: boolean
          id?: number
          ip: unknown
        }
        Update: {
          attempted_at?: string
          found?: boolean
          id?: number
          ip?: unknown
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          created_at: string
          from_currency: string
          id: string
          rate: number
          rate_date: string
          source: string | null
          to_currency: string
        }
        Insert: {
          created_at?: string
          from_currency: string
          id?: string
          rate: number
          rate_date: string
          source?: string | null
          to_currency?: string
        }
        Update: {
          created_at?: string
          from_currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string | null
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_rates_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      hs_codes: {
        Row: {
          anti_dumping_pct: number | null
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          notes: string | null
          tariff_pct: number
          updated_at: string
        }
        Insert: {
          anti_dumping_pct?: number | null
          code: string
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tariff_pct: number
          updated_at?: string
        }
        Update: {
          anti_dumping_pct?: number | null
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          tariff_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_locations: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_da: string | null
          name_en: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          occurred_at: string
          part_id: string
          quantity_delta: number
          reason: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          unit_cost_dkk: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          occurred_at?: string
          part_id: string
          quantity_delta: number
          reason?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          unit_cost_dkk?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          occurred_at?: string
          part_id?: string
          quantity_delta?: number
          reason?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          unit_cost_dkk?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          bike_template_id: string | null
          billing_period_end: string | null
          billing_period_start: string | null
          color_id: string | null
          description_da: string | null
          description_en: string | null
          id: string
          invoice_id: string
          line_number: number
          line_subtotal: number
          line_total: number
          line_vat_amount: number
          part_id: string | null
          quantity: number
          service_agreement_id: string | null
          unit_price: number
          vat_code: string | null
          vat_rate: number
        }
        Insert: {
          bike_template_id?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          color_id?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          invoice_id: string
          line_number: number
          line_subtotal: number
          line_total: number
          line_vat_amount: number
          part_id?: string | null
          quantity: number
          service_agreement_id?: string | null
          unit_price: number
          vat_code?: string | null
          vat_rate?: number
        }
        Update: {
          bike_template_id?: string | null
          billing_period_end?: string | null
          billing_period_start?: string | null
          color_id?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          invoice_id?: string
          line_number?: number
          line_subtotal?: number
          line_total?: number
          line_vat_amount?: number
          part_id?: string | null
          quantity?: number
          service_agreement_id?: string | null
          unit_price?: number
          vat_code?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_service_agreement_id_fkey"
            columns: ["service_agreement_id"]
            isOneToOne: false
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          credited_invoice_id: string | null
          currency: string
          deposit_pct: number | null
          due_date: string | null
          ean_number_used: string | null
          economic_synced_at: string | null
          economic_voucher_id: string | null
          id: string
          invoice_number: string
          is_export: boolean
          is_reverse_charge: boolean
          issued_date: string | null
          issued_locked_at: string | null
          kind: string
          language: string
          notes: string | null
          organization_id: string
          paid_date: string | null
          pdf_url: string | null
          sales_order_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_amount: number
          total_amount: number
          total_vat_amount: number
        }
        Insert: {
          created_at?: string
          credited_invoice_id?: string | null
          currency?: string
          deposit_pct?: number | null
          due_date?: string | null
          ean_number_used?: string | null
          economic_synced_at?: string | null
          economic_voucher_id?: string | null
          id?: string
          invoice_number: string
          is_export?: boolean
          is_reverse_charge?: boolean
          issued_date?: string | null
          issued_locked_at?: string | null
          kind?: string
          language?: string
          notes?: string | null
          organization_id: string
          paid_date?: string | null
          pdf_url?: string | null
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_amount?: number
          total_amount?: number
          total_vat_amount?: number
        }
        Update: {
          created_at?: string
          credited_invoice_id?: string | null
          currency?: string
          deposit_pct?: number | null
          due_date?: string | null
          ean_number_used?: string | null
          economic_synced_at?: string | null
          economic_voucher_id?: string | null
          id?: string
          invoice_number?: string
          is_export?: boolean
          is_reverse_charge?: boolean
          issued_date?: string | null
          issued_locked_at?: string | null
          kind?: string
          language?: string
          notes?: string | null
          organization_id?: string
          paid_date?: string | null
          pdf_url?: string | null
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_amount?: number
          total_amount?: number
          total_vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_credited_invoice_id_fkey"
            columns: ["credited_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      kits: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kit_number: number | null
          sticker_color: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kit_number?: number | null
          sticker_color: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kit_number?: number | null
          sticker_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_tickets: {
        Row: {
          bike_id: string | null
          created_at: string
          description: string
          id: string
          notes: string | null
          priority: number
          reported_at: string
          reported_by_contact_id: string | null
          reported_by_phone: string | null
          reported_by_text: string | null
          reported_language: string | null
          resolved_at: string | null
          source: Database["public"]["Enums"]["ticket_source"]
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          updated_at: string
        }
        Insert: {
          bike_id?: string | null
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          priority?: number
          reported_at?: string
          reported_by_contact_id?: string | null
          reported_by_phone?: string | null
          reported_by_text?: string | null
          reported_language?: string | null
          resolved_at?: string | null
          source?: Database["public"]["Enums"]["ticket_source"]
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          updated_at?: string
        }
        Update: {
          bike_id?: string | null
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          priority?: number
          reported_at?: string
          reported_by_contact_id?: string | null
          reported_by_phone?: string | null
          reported_by_text?: string | null
          reported_language?: string | null
          resolved_at?: string | null
          source?: Database["public"]["Enums"]["ticket_source"]
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_reported_by_contact_id_fkey"
            columns: ["reported_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_order_parts: {
        Row: {
          created_at: string
          id: string
          manufacturing_order_id: string
          notes: string | null
          origin: string
          part_id: string
          quantity_per_bike: number
          substituted_part_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manufacturing_order_id: string
          notes?: string | null
          origin?: string
          part_id: string
          quantity_per_bike?: number
          substituted_part_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manufacturing_order_id?: string
          notes?: string | null
          origin?: string
          part_id?: string
          quantity_per_bike?: number
          substituted_part_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_order_parts_manufacturing_order_id_fkey"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_order_parts_substituted_part_id_fkey"
            columns: ["substituted_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_order_parts_substituted_part_id_fkey"
            columns: ["substituted_part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_orders: {
        Row: {
          actual_completion_date: string | null
          actual_start_date: string | null
          assigned_to_user_id: string | null
          bike_template_id: string | null
          bike_type_id: string
          color_id: string | null
          completed_quantity: number
          created_at: string
          created_by: string | null
          id: string
          mo_number: string
          notes: string | null
          planned_completion_date: string | null
          planned_completion_precision: string | null
          planned_start_date: string | null
          sales_order_id: string | null
          sales_order_line_id: string | null
          status: Database["public"]["Enums"]["manufacturing_order_status"]
          target_quantity: number
          updated_at: string
        }
        Insert: {
          actual_completion_date?: string | null
          actual_start_date?: string | null
          assigned_to_user_id?: string | null
          bike_template_id?: string | null
          bike_type_id: string
          color_id?: string | null
          completed_quantity?: number
          created_at?: string
          created_by?: string | null
          id?: string
          mo_number: string
          notes?: string | null
          planned_completion_date?: string | null
          planned_completion_precision?: string | null
          planned_start_date?: string | null
          sales_order_id?: string | null
          sales_order_line_id?: string | null
          status?: Database["public"]["Enums"]["manufacturing_order_status"]
          target_quantity: number
          updated_at?: string
        }
        Update: {
          actual_completion_date?: string | null
          actual_start_date?: string | null
          assigned_to_user_id?: string | null
          bike_template_id?: string | null
          bike_type_id?: string
          color_id?: string | null
          completed_quantity?: number
          created_at?: string
          created_by?: string | null
          id?: string
          mo_number?: string
          notes?: string | null
          planned_completion_date?: string | null
          planned_completion_precision?: string | null
          planned_start_date?: string | null
          sales_order_id?: string | null
          sales_order_line_id?: string | null
          status?: Database["public"]["Enums"]["manufacturing_order_status"]
          target_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_orders_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_bike_type_id_fkey"
            columns: ["bike_type_id"]
            isOneToOne: false
            referencedRelation: "bike_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "v_sales_order_lines_localized"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_lines: {
        Row: {
          bike_template_id: string | null
          color_id: string | null
          description_da: string | null
          description_en: string | null
          id: string
          line_number: number
          line_subtotal: number | null
          line_total: number | null
          line_vat_amount: number | null
          offer_id: string
          part_id: string | null
          quantity: number
          unit_price: number | null
          vat_code: string | null
          vat_rate: number | null
        }
        Insert: {
          bike_template_id?: string | null
          color_id?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          line_number: number
          line_subtotal?: number | null
          line_total?: number | null
          line_vat_amount?: number | null
          offer_id: string
          part_id?: string | null
          quantity?: number
          unit_price?: number | null
          vat_code?: string | null
          vat_rate?: number | null
        }
        Update: {
          bike_template_id?: string | null
          color_id?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          line_number?: number
          line_subtotal?: number | null
          line_total?: number | null
          line_vat_amount?: number | null
          offer_id?: string
          part_id?: string | null
          quantity?: number
          unit_price?: number | null
          vat_code?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_lines_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      offers: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          expiry_date: string | null
          id: string
          is_price_template: boolean
          issued_date: string | null
          language: string
          notes: string | null
          offer_number: string
          organization_id: string
          organization_unit_id: string | null
          status: Database["public"]["Enums"]["offer_status"]
          subtotal_amount: number | null
          total_amount: number | null
          total_vat_amount: number | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expiry_date?: string | null
          id?: string
          is_price_template?: boolean
          issued_date?: string | null
          language?: string
          notes?: string | null
          offer_number: string
          organization_id: string
          organization_unit_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          subtotal_amount?: number | null
          total_amount?: number | null
          total_vat_amount?: number | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expiry_date?: string | null
          id?: string
          is_price_template?: boolean
          issued_date?: string | null
          language?: string
          notes?: string | null
          offer_number?: string
          organization_id?: string
          organization_unit_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          subtotal_amount?: number | null
          total_amount?: number | null
          total_vat_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "offers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_organization_unit_id_fkey"
            columns: ["organization_unit_id"]
            isOneToOne: false
            referencedRelation: "organization_units"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_tax_identifiers: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          notes: string | null
          organization_id: string
          tax_identifier_type_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          organization_id: string
          tax_identifier_type_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          organization_id?: string
          tax_identifier_type_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_tax_identifiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_tax_identifiers_tax_identifier_type_id_fkey"
            columns: ["tax_identifier_type_id"]
            isOneToOne: false
            referencedRelation: "tax_identifier_types"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_units: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          country_code: string | null
          created_at: string
          cvr_number: string | null
          deleted_at: string | null
          ean_number: string | null
          email: string | null
          external_customer_no: number | null
          geocoded_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          country_code?: string | null
          created_at?: string
          cvr_number?: string | null
          deleted_at?: string | null
          ean_number?: string | null
          email?: string | null
          external_customer_no?: number | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          country_code?: string | null
          created_at?: string
          cvr_number?: string | null
          deleted_at?: string | null
          ean_number?: string | null
          email?: string | null
          external_customer_no?: number | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          billing_currency: string | null
          city: string | null
          country_code: string | null
          created_at: string
          customer_group_id: string | null
          customer_segment_id: string | null
          cvr_number: string | null
          default_vat_code: string | null
          deleted_at: string | null
          display_name_da: string | null
          display_name_en: string | null
          ean_number: string | null
          email: string | null
          external_customer_no: number | null
          geocoded_at: string | null
          id: string
          is_active: boolean
          latitude: number | null
          legal_name: string
          lifecycle_stage: string
          longitude: number | null
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          pii_redacted_at: string | null
          preferred_language: string
          state_province: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          billing_currency?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          customer_group_id?: string | null
          customer_segment_id?: string | null
          cvr_number?: string | null
          default_vat_code?: string | null
          deleted_at?: string | null
          display_name_da?: string | null
          display_name_en?: string | null
          ean_number?: string | null
          email?: string | null
          external_customer_no?: number | null
          geocoded_at?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          legal_name: string
          lifecycle_stage?: string
          longitude?: number | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          pii_redacted_at?: string | null
          preferred_language?: string
          state_province?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          billing_currency?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          customer_group_id?: string | null
          customer_segment_id?: string | null
          cvr_number?: string | null
          default_vat_code?: string | null
          deleted_at?: string | null
          display_name_da?: string | null
          display_name_en?: string | null
          ean_number?: string | null
          email?: string | null
          external_customer_no?: number | null
          geocoded_at?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          legal_name?: string
          lifecycle_stage?: string
          longitude?: number | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          pii_redacted_at?: string | null
          preferred_language?: string
          state_province?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_billing_currency_fkey"
            columns: ["billing_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organizations_customer_group_id_fkey"
            columns: ["customer_group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_customer_segment_id_fkey"
            columns: ["customer_segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_default_vat_code_fkey"
            columns: ["default_vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      paint_order_bikes: {
        Row: {
          added_at: string
          bike_id: string
          color_id: string | null
          notes: string | null
          paint_order_id: string
          scope: string | null
        }
        Insert: {
          added_at?: string
          bike_id: string
          color_id?: string | null
          notes?: string | null
          paint_order_id: string
          scope?: string | null
        }
        Update: {
          added_at?: string
          bike_id?: string
          color_id?: string | null
          notes?: string | null
          paint_order_id?: string
          scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paint_order_bikes_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_order_bikes_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_order_bikes_paint_order_id_fkey"
            columns: ["paint_order_id"]
            isOneToOne: false
            referencedRelation: "paint_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      paint_orders: {
        Row: {
          color_id: string | null
          created_at: string
          created_by: string | null
          expected_return_at: string | null
          id: string
          notes: string | null
          paint_order_number: string
          paint_part_id: string | null
          planned_send_date: string | null
          received_at: string | null
          sales_order_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["paint_order_status"]
          supplier_id: string
          unit_cost: number | null
          unit_cost_currency: string | null
          updated_at: string
        }
        Insert: {
          color_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_return_at?: string | null
          id?: string
          notes?: string | null
          paint_order_number: string
          paint_part_id?: string | null
          planned_send_date?: string | null
          received_at?: string | null
          sales_order_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["paint_order_status"]
          supplier_id: string
          unit_cost?: number | null
          unit_cost_currency?: string | null
          updated_at?: string
        }
        Update: {
          color_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_return_at?: string | null
          id?: string
          notes?: string | null
          paint_order_number?: string
          paint_part_id?: string | null
          planned_send_date?: string | null
          received_at?: string | null
          sales_order_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["paint_order_status"]
          supplier_id?: string
          unit_cost?: number | null
          unit_cost_currency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paint_orders_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_orders_paint_part_id_fkey"
            columns: ["paint_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_orders_paint_part_id_fkey"
            columns: ["paint_part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paint_orders_unit_cost_currency_fkey"
            columns: ["unit_cost_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      part_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description_da: string | null
          description_en: string | null
          id: string
          is_active: boolean
          name_da: string | null
          name_en: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "part_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      part_kits: {
        Row: {
          created_at: string
          id: string
          kit_id: string
          part_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kit_id: string
          part_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kit_id?: string
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_kits_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_kits_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_kits_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      part_retail_prices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          part_id: string
          price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          part_id: string
          price: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          part_id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "part_retail_prices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "part_retail_prices_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_retail_prices_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      part_supplier_offerings: {
        Row: {
          created_at: string
          default_purchase_currency: string | null
          default_purchase_price: number | null
          id: string
          is_preferred: boolean
          lead_time_days: number | null
          minimum_order_quantity: number | null
          notes: string | null
          part_id: string
          supplier_id: string
          supplier_sku: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_purchase_currency?: string | null
          default_purchase_price?: number | null
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          notes?: string | null
          part_id: string
          supplier_id: string
          supplier_sku?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_purchase_currency?: string | null
          default_purchase_price?: number | null
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          notes?: string | null
          part_id?: string
          supplier_id?: string
          supplier_sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_supplier_offerings_default_purchase_currency_fkey"
            columns: ["default_purchase_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "part_supplier_offerings_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_offerings_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_supplier_offerings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          attributes: Json
          category_id: string
          created_at: string
          default_retail_currency: string | null
          default_retail_price: number | null
          deleted_at: string | null
          description_da: string | null
          description_en: string | null
          hs_code_id: string | null
          id: string
          internal_sku: string
          name_da: string | null
          name_en: string
          notes: string | null
          origin: string | null
          reorder_point: number | null
          reorder_quantity: number | null
          tariff_pct_override: number | null
          unit_of_measure: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          attributes?: Json
          category_id: string
          created_at?: string
          default_retail_currency?: string | null
          default_retail_price?: number | null
          deleted_at?: string | null
          description_da?: string | null
          description_en?: string | null
          hs_code_id?: string | null
          id?: string
          internal_sku: string
          name_da?: string | null
          name_en: string
          notes?: string | null
          origin?: string | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          tariff_pct_override?: number | null
          unit_of_measure?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          attributes?: Json
          category_id?: string
          created_at?: string
          default_retail_currency?: string | null
          default_retail_price?: number | null
          deleted_at?: string | null
          description_da?: string | null
          description_en?: string | null
          hs_code_id?: string | null
          id?: string
          internal_sku?: string
          name_da?: string | null
          name_en?: string
          notes?: string | null
          origin?: string | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          tariff_pct_override?: number | null
          unit_of_measure?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "part_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_default_retail_currency_fkey"
            columns: ["default_retail_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "parts_hs_code_id_fkey"
            columns: ["hs_code_id"]
            isOneToOne: false
            referencedRelation: "hs_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      public_report_attempts: {
        Row: {
          bike_id: string | null
          created_at: string
          id: string
          ip: unknown
          ticket_id: string | null
        }
        Insert: {
          bike_id?: string | null
          created_at?: string
          id?: string
          ip: unknown
          ticket_id?: string | null
        }
        Update: {
          bike_id?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_report_attempts_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_report_attempts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          anti_dumping_pct: number | null
          created_at: string
          currency: string
          fx_rate_to_dkk: number
          id: string
          import_tax_basis: string | null
          landed_cost_dkk_per_unit: number | null
          notes: string | null
          part_id: string
          purchase_order_id: string
          quantity: number
          received_quantity: number
          tariff_pct: number
          transport_pct: number
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          anti_dumping_pct?: number | null
          created_at?: string
          currency: string
          fx_rate_to_dkk: number
          id?: string
          import_tax_basis?: string | null
          landed_cost_dkk_per_unit?: number | null
          notes?: string | null
          part_id: string
          purchase_order_id: string
          quantity: number
          received_quantity?: number
          tariff_pct?: number
          transport_pct?: number
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          anti_dumping_pct?: number | null
          created_at?: string
          currency?: string
          fx_rate_to_dkk?: number
          id?: string
          import_tax_basis?: string | null
          landed_cost_dkk_per_unit?: number | null
          notes?: string | null
          part_id?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          tariff_pct?: number
          transport_pct?: number
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          emailed_at: string | null
          emailed_to: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          received_date: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          total_amount: number | null
          total_currency: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          emailed_at?: string | null
          emailed_to?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date: string
          po_number: string
          received_date?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          total_amount?: number | null
          total_currency?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          emailed_at?: string | null
          emailed_to?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          received_date?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string
          total_amount?: number | null
          total_currency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_total_currency_fkey"
            columns: ["total_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      report_page_views: {
        Row: {
          id: number
          path: string
          visited_at: string
        }
        Insert: {
          id?: number
          path: string
          visited_at?: string
        }
        Update: {
          id?: number
          path?: string
          visited_at?: string
        }
        Relationships: []
      }
      sales_order_lines: {
        Row: {
          bike_template_id: string | null
          color_id: string | null
          description_da: string | null
          description_en: string | null
          id: string
          line_number: number
          line_subtotal: number | null
          line_total: number | null
          line_vat_amount: number | null
          part_id: string | null
          quantity: number
          sales_order_id: string
          unit_price: number
          vat_code: string | null
          vat_rate: number | null
        }
        Insert: {
          bike_template_id?: string | null
          color_id?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          line_number: number
          line_subtotal?: number | null
          line_total?: number | null
          line_vat_amount?: number | null
          part_id?: string | null
          quantity?: number
          sales_order_id: string
          unit_price: number
          vat_code?: string | null
          vat_rate?: number | null
        }
        Update: {
          bike_template_id?: string | null
          color_id?: string | null
          description_da?: string | null
          description_en?: string | null
          id?: string
          line_number?: number
          line_subtotal?: number | null
          line_total?: number | null
          line_vat_amount?: number | null
          part_id?: string | null
          quantity?: number
          sales_order_id?: string
          unit_price?: number
          vat_code?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      sales_orders: {
        Row: {
          actual_delivery_date: string | null
          contact_id: string | null
          converted_from_offer_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          language: string
          notes: string | null
          order_date: string
          organization_id: string
          organization_unit_id: string | null
          production_note: string | null
          requested_delivery_date: string | null
          requested_delivery_precision: string | null
          sales_order_number: string
          status: Database["public"]["Enums"]["sales_order_status"]
          subtotal_amount: number | null
          total_amount: number | null
          total_vat_amount: number | null
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          contact_id?: string | null
          converted_from_offer_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          language?: string
          notes?: string | null
          order_date: string
          organization_id: string
          organization_unit_id?: string | null
          production_note?: string | null
          requested_delivery_date?: string | null
          requested_delivery_precision?: string | null
          sales_order_number: string
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal_amount?: number | null
          total_amount?: number | null
          total_vat_amount?: number | null
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          contact_id?: string | null
          converted_from_offer_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          language?: string
          notes?: string | null
          order_date?: string
          organization_id?: string
          organization_unit_id?: string | null
          production_note?: string | null
          requested_delivery_date?: string | null
          requested_delivery_precision?: string | null
          sales_order_number?: string
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal_amount?: number | null
          total_amount?: number | null
          total_vat_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_converted_from_offer_id_fkey"
            columns: ["converted_from_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_unit_id_fkey"
            columns: ["organization_unit_id"]
            isOneToOne: false
            referencedRelation: "organization_units"
            referencedColumns: ["id"]
          },
        ]
      }
      service_agreements: {
        Row: {
          coverage_details: Json
          covers_labor: boolean
          covers_parts: boolean
          created_at: string
          description_da: string | null
          description_en: string | null
          end_date: string | null
          fee_currency: string | null
          has_gps: boolean
          id: string
          monthly_fee: number | null
          name_da: string | null
          name_en: string
          notes: string | null
          organization_id: string
          organization_unit_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["service_agreement_status"]
          updated_at: string
        }
        Insert: {
          coverage_details?: Json
          covers_labor?: boolean
          covers_parts?: boolean
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          end_date?: string | null
          fee_currency?: string | null
          has_gps?: boolean
          id?: string
          monthly_fee?: number | null
          name_da?: string | null
          name_en: string
          notes?: string | null
          organization_id: string
          organization_unit_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["service_agreement_status"]
          updated_at?: string
        }
        Update: {
          coverage_details?: Json
          covers_labor?: boolean
          covers_parts?: boolean
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          end_date?: string | null
          fee_currency?: string | null
          has_gps?: boolean
          id?: string
          monthly_fee?: number | null
          name_da?: string | null
          name_en?: string
          notes?: string | null
          organization_id?: string
          organization_unit_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["service_agreement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_agreements_fee_currency_fkey"
            columns: ["fee_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "service_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_organization_unit_id_fkey"
            columns: ["organization_unit_id"]
            isOneToOne: false
            referencedRelation: "organization_units"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          actual_delivery_date: string | null
          actual_ship_date: string | null
          carrier: string | null
          created_at: string
          customs_currency: string | null
          customs_value: number | null
          destination_address: string | null
          direction: Database["public"]["Enums"]["shipment_direction"]
          id: string
          incoterms: string | null
          incoterms_location: string | null
          notes: string | null
          origin_address: string | null
          planned_delivery_date: string | null
          planned_ship_date: string | null
          service_level: string | null
          shipment_number: string
          shipping_cost: number | null
          shipping_cost_currency: string | null
          source_entity_id: string
          source_entity_type: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string | null
          updated_at: string
          volume_m3: number | null
          weight_kg: number | null
        }
        Insert: {
          actual_delivery_date?: string | null
          actual_ship_date?: string | null
          carrier?: string | null
          created_at?: string
          customs_currency?: string | null
          customs_value?: number | null
          destination_address?: string | null
          direction: Database["public"]["Enums"]["shipment_direction"]
          id?: string
          incoterms?: string | null
          incoterms_location?: string | null
          notes?: string | null
          origin_address?: string | null
          planned_delivery_date?: string | null
          planned_ship_date?: string | null
          service_level?: string | null
          shipment_number: string
          shipping_cost?: number | null
          shipping_cost_currency?: string | null
          source_entity_id: string
          source_entity_type: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string | null
          updated_at?: string
          volume_m3?: number | null
          weight_kg?: number | null
        }
        Update: {
          actual_delivery_date?: string | null
          actual_ship_date?: string | null
          carrier?: string | null
          created_at?: string
          customs_currency?: string | null
          customs_value?: number | null
          destination_address?: string | null
          direction?: Database["public"]["Enums"]["shipment_direction"]
          id?: string
          incoterms?: string | null
          incoterms_location?: string | null
          notes?: string | null
          origin_address?: string | null
          planned_delivery_date?: string | null
          planned_ship_date?: string | null
          service_level?: string | null
          shipment_number?: string
          shipping_cost?: number | null
          shipping_cost_currency?: string | null
          source_entity_id?: string
          source_entity_type?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string | null
          updated_at?: string
          volume_m3?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_customs_currency_fkey"
            columns: ["customs_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "shipments_shipping_cost_currency_fkey"
            columns: ["shipping_cost_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      suppliers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          country_code: string | null
          created_at: string
          default_currency: string | null
          deleted_at: string | null
          email_primary: string | null
          email_secondary: string | null
          id: string
          import_duty_prepaid_default: boolean
          is_active: boolean
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          province: string | null
          town: string | null
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          deleted_at?: string | null
          email_primary?: string | null
          email_secondary?: string | null
          id?: string
          import_duty_prepaid_default?: boolean
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          province?: string | null
          town?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          country_code?: string | null
          created_at?: string
          default_currency?: string | null
          deleted_at?: string | null
          email_primary?: string | null
          email_secondary?: string | null
          id?: string
          import_duty_prepaid_default?: boolean
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          province?: string | null
          town?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      tax_identifier_types: {
        Row: {
          code: string
          country_code: string | null
          created_at: string
          description_da: string | null
          description_en: string | null
          format_regex: string | null
          id: string
          is_active: boolean
          name_da: string | null
          name_en: string
        }
        Insert: {
          code: string
          country_code?: string | null
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          format_regex?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en: string
        }
        Update: {
          code?: string
          country_code?: string | null
          created_at?: string
          description_da?: string | null
          description_en?: string | null
          format_regex?: string | null
          id?: string
          is_active?: boolean
          name_da?: string | null
          name_en?: string
        }
        Relationships: []
      }
      vat_codes: {
        Row: {
          code: string
          country_code: string | null
          created_at: string
          default_rate: number
          description_da: string | null
          description_en: string | null
          is_active: boolean
          is_export: boolean
          is_reverse_charge: boolean
          name_da: string | null
          name_en: string
        }
        Insert: {
          code: string
          country_code?: string | null
          created_at?: string
          default_rate: number
          description_da?: string | null
          description_en?: string | null
          is_active?: boolean
          is_export?: boolean
          is_reverse_charge?: boolean
          name_da?: string | null
          name_en: string
        }
        Update: {
          code?: string
          country_code?: string | null
          created_at?: string
          default_rate?: number
          description_da?: string | null
          description_en?: string | null
          is_active?: boolean
          is_export?: boolean
          is_reverse_charge?: boolean
          name_da?: string | null
          name_en?: string
        }
        Relationships: []
      }
      work_order_parts: {
        Row: {
          id: string
          installed_at: string
          inventory_movement_id: string | null
          part_id: string
          quantity: number
          unit_price: number | null
          work_order_id: string
        }
        Insert: {
          id?: string
          installed_at?: string
          inventory_movement_id?: string | null
          part_id: string
          quantity: number
          unit_price?: number | null
          work_order_id: string
        }
        Update: {
          id?: string
          installed_at?: string
          inventory_movement_id?: string | null
          part_id?: string
          quantity?: number
          unit_price?: number | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_parts_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_to: string | null
          bike_id: string
          completed_at: string | null
          covered_by_service_agreement_id: string | null
          created_at: string
          customer_summary_da: string | null
          customer_summary_en: string | null
          diagnosis: string | null
          id: string
          invoice_id: string | null
          is_billable: boolean
          labor_minutes: number | null
          labor_rate_dkk: number | null
          language: string
          started_at: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          ticket_id: string | null
          updated_at: string
          wo_number: string
          work_performed: string | null
        }
        Insert: {
          assigned_to?: string | null
          bike_id: string
          completed_at?: string | null
          covered_by_service_agreement_id?: string | null
          created_at?: string
          customer_summary_da?: string | null
          customer_summary_en?: string | null
          diagnosis?: string | null
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          labor_minutes?: number | null
          labor_rate_dkk?: number | null
          language?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          ticket_id?: string | null
          updated_at?: string
          wo_number: string
          work_performed?: string | null
        }
        Update: {
          assigned_to?: string | null
          bike_id?: string
          completed_at?: string | null
          covered_by_service_agreement_id?: string | null
          created_at?: string
          customer_summary_da?: string | null
          customer_summary_en?: string | null
          diagnosis?: string | null
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          labor_minutes?: number | null
          labor_rate_dkk?: number | null
          language?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          ticket_id?: string | null
          updated_at?: string
          wo_number?: string
          work_performed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_covered_by_service_agreement_id_fkey"
            columns: ["covered_by_service_agreement_id"]
            isOneToOne: false
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "maintenance_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_current_stock: {
        Row: {
          last_movement_at: string | null
          location_id: string | null
          part_id: string | null
          quantity_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_lines_localized: {
        Row: {
          bike_template_id: string | null
          color_id: string | null
          description_da: string | null
          description_en: string | null
          document_language: string | null
          effective_description: string | null
          id: string | null
          invoice_id: string | null
          line_number: number | null
          line_subtotal: number | null
          line_total: number | null
          line_vat_amount: number | null
          part_id: string | null
          quantity: number | null
          unit_price: number | null
          vat_code: string | null
          vat_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      v_offer_lines_localized: {
        Row: {
          bike_template_id: string | null
          color_id: string | null
          description_da: string | null
          description_en: string | null
          document_language: string | null
          effective_description: string | null
          id: string | null
          line_number: number | null
          line_subtotal: number | null
          line_total: number | null
          line_vat_amount: number | null
          offer_id: string | null
          part_id: string | null
          quantity: number | null
          unit_price: number | null
          vat_code: string | null
          vat_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_lines_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_lines_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      v_part_last_cost: {
        Row: {
          last_cost_dkk: number | null
          last_order_date: string | null
          last_purchase_quantity: number | null
          part_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      v_parts_dashboard: {
        Row: {
          category_id: string | null
          category_name: string | null
          default_retail_currency: string | null
          default_retail_price: number | null
          deleted_at: string | null
          description_da: string | null
          description_en: string | null
          id: string | null
          internal_sku: string | null
          last_cost_dkk: number | null
          last_order_date: string | null
          last_purchase_quantity: number | null
          name_da: string | null
          name_en: string | null
          primary_supplier_name: string | null
          reorder_point: number | null
          reorder_quantity: number | null
          stock_on_hand: number | null
          stock_status: string | null
          supplier_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "part_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_default_retail_currency_fkey"
            columns: ["default_retail_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_po_totals: {
        Row: {
          landed_total_dkk: number | null
          line_count: number | null
          purchase_order_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_order_lines_localized: {
        Row: {
          bike_template_id: string | null
          color_id: string | null
          description_da: string | null
          description_en: string | null
          document_language: string | null
          effective_description: string | null
          id: string | null
          line_number: number | null
          line_subtotal: number | null
          line_total: number | null
          line_vat_amount: number | null
          part_id: string | null
          quantity: number | null
          sales_order_id: string | null
          unit_price: number | null
          vat_code: string | null
          vat_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_bike_template_id_fkey"
            columns: ["bike_template_id"]
            isOneToOne: false
            referencedRelation: "bike_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "v_parts_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      effective_line_description: {
        Args: {
          p_lang: string
          p_override_da: string
          p_override_en: string
          p_part_id: string
          p_template_id: string
        }
        Returns: string
      }
      mo_copy_template_parts: { Args: { p_mo_id: string }; Returns: number }
      next_document_number: { Args: { p_doc_type: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      bike_status:
        | "planning"
        | "building"
        | "in_stock"
        | "assigned"
        | "in_service"
        | "in_maintenance"
        | "retired"
        | "lost_or_stolen"
      inventory_movement_type:
        | "received"
        | "consumed_build"
        | "consumed_maintenance"
        | "returned_to_supplier"
        | "adjustment"
        | "transfer_out"
        | "transfer_in"
        | "disposed"
      invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "overdue"
        | "credited"
        | "cancelled"
      manufacturing_order_status:
        | "planned"
        | "released"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "cancelled"
      offer_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      paint_order_status:
        | "planned"
        | "sent_to_painter"
        | "at_painter"
        | "received_back"
        | "cancelled"
      purchase_order_status:
        | "draft"
        | "placed"
        | "partially_received"
        | "received"
        | "cancelled"
      sales_order_status:
        | "draft"
        | "confirmed"
        | "in_production"
        | "ready"
        | "delivered"
        | "cancelled"
      service_agreement_status: "active" | "expired" | "cancelled"
      shipment_direction: "inbound" | "outbound"
      shipment_status:
        | "planned"
        | "in_transit"
        | "delivered"
        | "exception"
        | "cancelled"
      ticket_source:
        | "email"
        | "phone"
        | "app"
        | "in_person"
        | "scheduled"
        | "other"
      ticket_status:
        | "open"
        | "in_diagnosis"
        | "awaiting_parts"
        | "in_repair"
        | "resolved"
        | "closed"
        | "cancelled"
      work_order_status: "open" | "in_progress" | "completed" | "cancelled"
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
      bike_status: [
        "planning",
        "building",
        "in_stock",
        "assigned",
        "in_service",
        "in_maintenance",
        "retired",
        "lost_or_stolen",
      ],
      inventory_movement_type: [
        "received",
        "consumed_build",
        "consumed_maintenance",
        "returned_to_supplier",
        "adjustment",
        "transfer_out",
        "transfer_in",
        "disposed",
      ],
      invoice_status: [
        "draft",
        "issued",
        "paid",
        "overdue",
        "credited",
        "cancelled",
      ],
      manufacturing_order_status: [
        "planned",
        "released",
        "in_progress",
        "on_hold",
        "completed",
        "cancelled",
      ],
      offer_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      paint_order_status: [
        "planned",
        "sent_to_painter",
        "at_painter",
        "received_back",
        "cancelled",
      ],
      purchase_order_status: [
        "draft",
        "placed",
        "partially_received",
        "received",
        "cancelled",
      ],
      sales_order_status: [
        "draft",
        "confirmed",
        "in_production",
        "ready",
        "delivered",
        "cancelled",
      ],
      service_agreement_status: ["active", "expired", "cancelled"],
      shipment_direction: ["inbound", "outbound"],
      shipment_status: [
        "planned",
        "in_transit",
        "delivered",
        "exception",
        "cancelled",
      ],
      ticket_source: [
        "email",
        "phone",
        "app",
        "in_person",
        "scheduled",
        "other",
      ],
      ticket_status: [
        "open",
        "in_diagnosis",
        "awaiting_parts",
        "in_repair",
        "resolved",
        "closed",
        "cancelled",
      ],
      work_order_status: ["open", "in_progress", "completed", "cancelled"],
    },
  },
} as const
