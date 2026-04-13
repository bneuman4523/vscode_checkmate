CREATE TABLE IF NOT EXISTS "attendee_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"attendee_id" text NOT NULL,
	"event_id" text NOT NULL,
	"disclaimer_id" text NOT NULL,
	"signature_data" text NOT NULL,
	"signature_file_url" text,
	"thumbnail_file_url" text,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendee_workflow_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"attendee_id" text NOT NULL,
	"event_id" text NOT NULL,
	"question_id" text NOT NULL,
	"response_value" text,
	"response_values" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendees" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"title" text,
	"participant_type" text NOT NULL,
	"custom_fields" jsonb,
	"registration_status" text DEFAULT 'Registered' NOT NULL,
	"registration_status_label" text,
	"checked_in" boolean DEFAULT false NOT NULL,
	"checked_in_at" timestamp,
	"badge_printed" boolean DEFAULT false NOT NULL,
	"badge_printed_at" timestamp,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"participant_type" text NOT NULL,
	"participant_types" jsonb DEFAULT '[]',
	"background_color" text NOT NULL,
	"text_color" text NOT NULL,
	"accent_color" text NOT NULL,
	"width" integer DEFAULT 4 NOT NULL,
	"height" integer DEFAULT 3 NOT NULL,
	"include_qr" boolean DEFAULT true NOT NULL,
	"qr_position" text DEFAULT 'bottom-right' NOT NULL,
	"qr_code_config" jsonb DEFAULT '{"embedType": "externalId", "fields": ["externalId"], "separator": "|", "includeLabel": false}',
	"font_family" text DEFAULT 'Arial' NOT NULL,
	"merge_fields" jsonb DEFAULT '[]' NOT NULL,
	"image_elements" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "check_in_log" (
	"id" text PRIMARY KEY NOT NULL,
	"attendee_id" text NOT NULL,
	"event_id" text NOT NULL,
	"checked_in_by" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_fonts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"display_name" text NOT NULL,
	"font_family" text NOT NULL,
	"font_weight" text DEFAULT '400' NOT NULL,
	"font_style" text DEFAULT 'normal' NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"font_data" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"account_code" text,
	"test_endpoint_path" text,
	"event_list_endpoint_path" text,
	"auth_type" text NOT NULL,
	"credentials_ref" text,
	"oauth2_profile_id" text,
	"rate_limit_policy" jsonb,
	"endpoints" jsonb DEFAULT '[]' NOT NULL,
	"sync_templates" jsonb,
	"default_sync_settings" jsonb,
	"realtime_sync_config" jsonb,
	"initial_sync_completed_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text NOT NULL,
	"api_base_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_contact_email_unique" UNIQUE("contact_email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_badge_template_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"participant_type" text NOT NULL,
	"badge_template_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"effective_from" timestamp,
	"effective_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_buyer_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"step_id" text NOT NULL,
	"question_text" text NOT NULL,
	"question_type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"options" jsonb DEFAULT '[]',
	"placeholder" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_code_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"external_event_code" text,
	"external_event_name" text,
	"sync_cursor" text,
	"last_synced_at" timestamp,
	"total_attendees_count" integer,
	"synced_attendees_count" integer DEFAULT 0 NOT NULL,
	"field_mapping" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_configuration_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_badge_template_id" text,
	"badge_template_overrides" jsonb,
	"default_printer_id" text,
	"staff_settings" jsonb,
	"workflow_snapshot" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_disclaimers" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"step_id" text NOT NULL,
	"title" text DEFAULT 'Terms and Conditions' NOT NULL,
	"disclaimer_text" text NOT NULL,
	"require_signature" boolean DEFAULT true NOT NULL,
	"confirmation_text" text DEFAULT 'I have read and agree to the terms above',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"variables" jsonb DEFAULT '{}',
	"is_primary" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_sync_states" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"data_type" text NOT NULL,
	"resolved_endpoint" text,
	"last_sync_at" timestamp,
	"last_sync_timestamp" text,
	"next_sync_at" timestamp,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_sync_result" jsonb,
	"last_error_message" text,
	"last_error_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_interval_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_workflow_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_for_temp_staff" boolean DEFAULT true NOT NULL,
	"enabled_for_kiosk" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_workflow_configs_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_workflow_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"step_type" text NOT NULL,
	"position" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"location_id" text,
	"name" text NOT NULL,
	"event_date" timestamp NOT NULL,
	"location" text,
	"venue" text,
	"account_code" text,
	"event_code" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"selected_templates" text[] DEFAULT '{}' NOT NULL,
	"selected_printer_id" text,
	"integration_id" text,
	"external_event_id" text,
	"default_badge_template_id" text,
	"printer_settings" jsonb,
	"badge_settings" jsonb,
	"temp_staff_settings" jsonb,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"config_status" text DEFAULT 'unconfigured' NOT NULL,
	"configured_at" timestamp,
	"config_template_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"auth_method" text NOT NULL,
	"connection_status" text DEFAULT 'disconnected' NOT NULL,
	"oauth2_state" text,
	"pkce_code_verifier" text,
	"granted_scopes" text[],
	"last_validated_at" timestamp,
	"last_successful_call_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error_message" text,
	"last_error_at" timestamp,
	"connected_by" text,
	"connected_at" timestamp,
	"disconnected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_endpoint_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"data_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"path_override" text,
	"variable_overrides" jsonb,
	"filter_defaults" jsonb,
	"header_overrides" jsonb,
	"field_mapping_overrides" jsonb,
	"pagination_overrides" jsonb,
	"sync_interval_seconds" integer DEFAULT 3600,
	"sync_min_interval_seconds" integer DEFAULT 60,
	"sync_max_interval_seconds" integer DEFAULT 86400,
	"sync_window_start" text,
	"sync_window_end" text,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"next_sync_at" timestamp,
	"last_sync_status" text,
	"last_sync_error" text,
	"last_sync_count" integer,
	"run_on_check_in_request" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"logo_url" text,
	"auth_type" text NOT NULL,
	"oauth2_config" jsonb,
	"default_base_url" text,
	"endpoint_templates" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"state" text,
	"country" text,
	"timezone" text,
	"match_patterns" jsonb DEFAULT '[]',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"event_id" text,
	"name" text NOT NULL,
	"trigger_event" text NOT NULL,
	"participant_type_filter" text,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_secret_ref" text,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"sms_recipients" jsonb,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"email_recipients" jsonb,
	"email_subject" text,
	"include_attendee_details" boolean DEFAULT true NOT NULL,
	"custom_payload" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"configuration_id" text NOT NULL,
	"attendee_id" text,
	"event_id" text,
	"channel" text NOT NULL,
	"recipient" text,
	"payload" jsonb,
	"status" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth2_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"connection_id" text,
	"access_token_ref" text,
	"refresh_token_ref" text,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"scope" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_refreshed_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"error_message" text,
	"refresh_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"reset_code_hash" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "printers" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"location_id" text,
	"name" text NOT NULL,
	"provider" text DEFAULT 'network' NOT NULL,
	"printnode_printer_id" integer,
	"printnode_computer_id" integer,
	"printnode_computer_name" text,
	"printnode_state" text,
	"connection_type" text NOT NULL,
	"ip_address" text,
	"port" integer,
	"bluetooth_device_id" text,
	"bluetooth_name" text,
	"supported_sizes" jsonb,
	"max_width" integer,
	"max_height" integer,
	"dpi" integer DEFAULT 300,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"attendee_id" text NOT NULL,
	"action" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"source" text DEFAULT 'kiosk' NOT NULL,
	"checked_in_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_code_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_code_mapping_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"external_session_id" text NOT NULL,
	"external_session_code" text,
	"external_session_name" text,
	"field_mapping" jsonb,
	"last_synced_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"attendee_id" text NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"waitlist_position" integer,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"promoted_at" timestamp,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"external_id" text,
	"session_code" text,
	"name" text NOT NULL,
	"description" text,
	"location" text,
	"venue" text,
	"track_name" text,
	"track_color" text,
	"type_name" text,
	"start_time" timestamp,
	"end_time" timestamp,
	"capacity" integer,
	"restrict_to_registered" boolean DEFAULT false NOT NULL,
	"allow_waitlist" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "temp_staff_activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_id" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "temp_staff_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"staff_name" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "temp_staff_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"credential_type" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"masked_value" text,
	"token_type" text,
	"scope" text,
	"issued_at" timestamp,
	"expires_at" timestamp,
	"is_valid" boolean DEFAULT true NOT NULL,
	"invalidated_at" timestamp,
	"invalidation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"event_code_mapping_id" text,
	"endpoint_config_id" text,
	"event_id" text,
	"job_type" text NOT NULL,
	"trigger_type" text DEFAULT 'manual' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"payload" jsonb,
	"result" jsonb,
	"error_message" text,
	"error_stack" text,
	"processed_records" integer DEFAULT 0 NOT NULL,
	"created_records" integer DEFAULT 0 NOT NULL,
	"updated_records" integer DEFAULT 0 NOT NULL,
	"skipped_records" integer DEFAULT 0 NOT NULL,
	"failed_records" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"sync_type" text NOT NULL,
	"status" text NOT NULL,
	"processed_count" integer DEFAULT 0,
	"created_count" integer DEFAULT 0,
	"updated_count" integer DEFAULT 0,
	"skipped_count" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"errors" jsonb,
	"api_response_summary" text,
	"duration_ms" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"json_value" jsonb,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"email" text NOT NULL,
	"phone_number" text,
	"password_hash" text,
	"first_name" text,
	"last_name" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"integration_id" text NOT NULL,
	"event_type" text NOT NULL,
	"url" text NOT NULL,
	"secret_ref" text,
	"signature_header" text DEFAULT 'X-Webhook-Signature' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp,
	"total_received" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendee_signatures" ADD CONSTRAINT "attendee_signatures_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendee_signatures" ADD CONSTRAINT "attendee_signatures_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendee_signatures" ADD CONSTRAINT "attendee_signatures_disclaimer_id_event_disclaimers_id_fk" FOREIGN KEY ("disclaimer_id") REFERENCES "public"."event_disclaimers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendee_workflow_responses" ADD CONSTRAINT "attendee_workflow_responses_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendee_workflow_responses" ADD CONSTRAINT "attendee_workflow_responses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendee_workflow_responses" ADD CONSTRAINT "attendee_workflow_responses_question_id_event_buyer_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."event_buyer_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendees" ADD CONSTRAINT "attendees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "badge_templates" ADD CONSTRAINT "badge_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "check_in_log" ADD CONSTRAINT "check_in_log_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "check_in_log" ADD CONSTRAINT "check_in_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "custom_fonts" ADD CONSTRAINT "custom_fonts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "custom_fonts" ADD CONSTRAINT "custom_fonts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_integrations" ADD CONSTRAINT "customer_integrations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_integrations" ADD CONSTRAINT "customer_integrations_provider_id_integration_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integration_providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_badge_template_overrides" ADD CONSTRAINT "event_badge_template_overrides_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_badge_template_overrides" ADD CONSTRAINT "event_badge_template_overrides_badge_template_id_badge_templates_id_fk" FOREIGN KEY ("badge_template_id") REFERENCES "public"."badge_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_buyer_questions" ADD CONSTRAINT "event_buyer_questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_buyer_questions" ADD CONSTRAINT "event_buyer_questions_step_id_event_workflow_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."event_workflow_steps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_code_mappings" ADD CONSTRAINT "event_code_mappings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_code_mappings" ADD CONSTRAINT "event_code_mappings_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_configuration_templates" ADD CONSTRAINT "event_configuration_templates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_configuration_templates" ADD CONSTRAINT "event_configuration_templates_default_badge_template_id_badge_templates_id_fk" FOREIGN KEY ("default_badge_template_id") REFERENCES "public"."badge_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_configuration_templates" ADD CONSTRAINT "event_configuration_templates_default_printer_id_printers_id_fk" FOREIGN KEY ("default_printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_disclaimers" ADD CONSTRAINT "event_disclaimers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_disclaimers" ADD CONSTRAINT "event_disclaimers_step_id_event_workflow_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."event_workflow_steps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_integrations" ADD CONSTRAINT "event_integrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_integrations" ADD CONSTRAINT "event_integrations_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_sync_states" ADD CONSTRAINT "event_sync_states_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_sync_states" ADD CONSTRAINT "event_sync_states_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_workflow_configs" ADD CONSTRAINT "event_workflow_configs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_workflow_steps" ADD CONSTRAINT "event_workflow_steps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_selected_printer_id_printers_id_fk" FOREIGN KEY ("selected_printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_endpoint_configs" ADD CONSTRAINT "integration_endpoint_configs_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "locations" ADD CONSTRAINT "locations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_configurations" ADD CONSTRAINT "notification_configurations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_configurations" ADD CONSTRAINT "notification_configurations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_configuration_id_notification_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."notification_configurations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "oauth2_tokens" ADD CONSTRAINT "oauth2_tokens_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "oauth2_tokens" ADD CONSTRAINT "oauth2_tokens_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "printers" ADD CONSTRAINT "printers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "printers" ADD CONSTRAINT "printers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_checkins" ADD CONSTRAINT "session_checkins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_checkins" ADD CONSTRAINT "session_checkins_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_code_mappings" ADD CONSTRAINT "session_code_mappings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_code_mappings" ADD CONSTRAINT "session_code_mappings_event_code_mapping_id_event_code_mappings_id_fk" FOREIGN KEY ("event_code_mapping_id") REFERENCES "public"."event_code_mappings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_code_mappings" ADD CONSTRAINT "session_code_mappings_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_registrations" ADD CONSTRAINT "session_registrations_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "temp_staff_activity_log" ADD CONSTRAINT "temp_staff_activity_log_session_id_temp_staff_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."temp_staff_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "temp_staff_activity_log" ADD CONSTRAINT "temp_staff_activity_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "temp_staff_sessions" ADD CONSTRAINT "temp_staff_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stored_credentials" ADD CONSTRAINT "stored_credentials_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_event_code_mapping_id_event_code_mappings_id_fk" FOREIGN KEY ("event_code_mapping_id") REFERENCES "public"."event_code_mappings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_endpoint_config_id_integration_endpoint_configs_id_fk" FOREIGN KEY ("endpoint_config_id") REFERENCES "public"."integration_endpoint_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "webhook_configurations" ADD CONSTRAINT "webhook_configurations_integration_id_customer_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."customer_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendee_signatures_attendee_idx" ON "attendee_signatures" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendee_signatures_event_idx" ON "attendee_signatures" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendee_signatures_disclaimer_idx" ON "attendee_signatures" USING btree ("disclaimer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendee_workflow_responses_attendee_idx" ON "attendee_workflow_responses" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendee_workflow_responses_event_idx" ON "attendee_workflow_responses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendee_workflow_responses_question_idx" ON "attendee_workflow_responses" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendees_event_idx" ON "attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendees_email_idx" ON "attendees" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendees_external_id_idx" ON "attendees" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendees_registration_status_idx" ON "attendees" USING btree ("registration_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_auth_session_expire" ON "auth_sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "badge_templates_customer_idx" ON "badge_templates" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_in_log_attendee_idx" ON "check_in_log" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_in_log_event_idx" ON "check_in_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_fonts_customer_idx" ON "custom_fonts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_fonts_family_idx" ON "custom_fonts" USING btree ("font_family");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_integrations_customer_idx" ON "customer_integrations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_integrations_provider_idx" ON "customer_integrations" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_badge_template_overrides_event_idx" ON "event_badge_template_overrides" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_badge_template_overrides_event_type_idx" ON "event_badge_template_overrides" USING btree ("event_id","participant_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_badge_template_overrides_template_idx" ON "event_badge_template_overrides" USING btree ("badge_template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_buyer_questions_event_idx" ON "event_buyer_questions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_buyer_questions_step_idx" ON "event_buyer_questions" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_code_mappings_event_idx" ON "event_code_mappings" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_code_mappings_integration_idx" ON "event_code_mappings" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_code_mappings_external_event_idx" ON "event_code_mappings" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_code_mappings_status_idx" ON "event_code_mappings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_config_templates_customer_idx" ON "event_configuration_templates" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_config_templates_default_idx" ON "event_configuration_templates" USING btree ("customer_id","is_default");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_disclaimers_event_idx" ON "event_disclaimers" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_disclaimers_step_idx" ON "event_disclaimers" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_integrations_event_idx" ON "event_integrations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_integrations_integration_idx" ON "event_integrations" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_integrations_unique" ON "event_integrations" USING btree ("event_id","integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_sync_states_event_idx" ON "event_sync_states" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_sync_states_integration_idx" ON "event_sync_states" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_sync_states_data_type_idx" ON "event_sync_states" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_sync_states_event_data_type_idx" ON "event_sync_states" USING btree ("event_id","data_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_workflow_configs_event_idx" ON "event_workflow_configs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_workflow_steps_event_idx" ON "event_workflow_steps" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_workflow_steps_position_idx" ON "event_workflow_steps" USING btree ("event_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_customer_idx" ON "events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_location_idx" ON "events" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_printer_idx" ON "events" USING btree ("selected_printer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_integration_idx" ON "events" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_config_status_idx" ON "events" USING btree ("customer_id","config_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connections_integration_idx" ON "integration_connections" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connections_status_idx" ON "integration_connections" USING btree ("connection_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_endpoint_configs_integration_idx" ON "integration_endpoint_configs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_endpoint_configs_data_type_idx" ON "integration_endpoint_configs" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_endpoint_configs_unique" ON "integration_endpoint_configs" USING btree ("integration_id","data_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_endpoint_configs_next_sync_idx" ON "integration_endpoint_configs" USING btree ("next_sync_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "locations_customer_idx" ON "locations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "locations_name_idx" ON "locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_configurations_customer_idx" ON "notification_configurations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_configurations_event_idx" ON "notification_configurations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_configurations_active_idx" ON "notification_configurations" USING btree ("active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_config_idx" ON "notification_logs" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_attendee_idx" ON "notification_logs" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_status_idx" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_logs_sent_at_idx" ON "notification_logs" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth2_tokens_integration_idx" ON "oauth2_tokens" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth2_tokens_connection_idx" ON "oauth2_tokens" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth2_tokens_expires_at_idx" ON "oauth2_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printers_customer_idx" ON "printers" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printers_location_idx" ON "printers" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printers_printnode_idx" ON "printers" USING btree ("printnode_printer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_checkins_session_idx" ON "session_checkins" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_checkins_attendee_idx" ON "session_checkins" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_checkins_timestamp_idx" ON "session_checkins" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_code_mappings_session_idx" ON "session_code_mappings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_code_mappings_event_code_mapping_idx" ON "session_code_mappings" USING btree ("event_code_mapping_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_code_mappings_external_session_idx" ON "session_code_mappings" USING btree ("external_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_registrations_session_idx" ON "session_registrations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_registrations_attendee_idx" ON "session_registrations" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_registrations_status_idx" ON "session_registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_registrations_unique" ON "session_registrations" USING btree ("session_id","attendee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_event_idx" ON "sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_start_time_idx" ON "sessions" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_external_id_idx" ON "sessions" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "temp_staff_activity_session_idx" ON "temp_staff_activity_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "temp_staff_activity_event_idx" ON "temp_staff_activity_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "temp_staff_sessions_event_idx" ON "temp_staff_sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "temp_staff_sessions_token_idx" ON "temp_staff_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_credentials_connection_idx" ON "stored_credentials" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_credentials_type_idx" ON "stored_credentials" USING btree ("credential_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_credentials_expires_at_idx" ON "stored_credentials" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_integration_idx" ON "sync_jobs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_next_retry_idx" ON "sync_jobs" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_priority_idx" ON "sync_jobs" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_endpoint_config_idx" ON "sync_jobs" USING btree ("endpoint_config_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_event_idx" ON "sync_jobs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_logs_integration_idx" ON "sync_logs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_logs_customer_idx" ON "sync_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_logs_started_at_idx" ON "sync_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_customer_idx" ON "users" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_configurations_integration_idx" ON "webhook_configurations" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_configurations_active_idx" ON "webhook_configurations" USING btree ("active");