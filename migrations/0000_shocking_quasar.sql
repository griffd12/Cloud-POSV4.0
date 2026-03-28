CREATE TABLE "accounting_exports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"export_type" text DEFAULT 'daily' NOT NULL,
	"format_type" text DEFAULT 'csv' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'pending',
	"generated_at" timestamp,
	"generated_by_id" varchar,
	"download_url" text,
	"error_message" text,
	"total_revenue" numeric(12, 2),
	"total_tax" numeric(12, 2),
	"total_labor" numeric(12, 2),
	"row_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"property_id" varchar,
	"alert_type" text NOT NULL,
	"severity" text,
	"notify_email" boolean DEFAULT false,
	"notify_sms" boolean DEFAULT false,
	"notify_push" boolean DEFAULT true,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rvc_id" varchar,
	"employee_id" varchar,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"details" jsonb,
	"reason_code" text,
	"manager_approval_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"property_id" varchar,
	"exception_date" text NOT NULL,
	"is_available" boolean DEFAULT false,
	"start_time" text,
	"end_time" text,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "break_attestations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"timecard_id" varchar,
	"business_date" text NOT NULL,
	"attestation_type" text DEFAULT 'clock_out' NOT NULL,
	"breaks_provided" boolean NOT NULL,
	"missed_meal_break" boolean DEFAULT false,
	"missed_rest_break" boolean DEFAULT false,
	"missed_break_reason" text,
	"employee_signature" text,
	"attested_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "break_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text DEFAULT 'California Break Rules' NOT NULL,
	"state_code" text DEFAULT 'CA' NOT NULL,
	"enable_meal_break_enforcement" boolean DEFAULT true,
	"meal_break_minutes" integer DEFAULT 30,
	"meal_break_threshold_hours" numeric(4, 2) DEFAULT '5.00',
	"second_meal_break_threshold_hours" numeric(4, 2) DEFAULT '10.00',
	"allow_meal_break_waiver" boolean DEFAULT true,
	"meal_waiver_max_shift_hours" numeric(4, 2) DEFAULT '6.00',
	"enable_rest_break_enforcement" boolean DEFAULT true,
	"rest_break_minutes" integer DEFAULT 10,
	"rest_break_interval_hours" numeric(4, 2) DEFAULT '4.00',
	"rest_break_is_paid" boolean DEFAULT true,
	"enable_premium_pay" boolean DEFAULT true,
	"meal_break_premium_hours" numeric(4, 2) DEFAULT '1.00',
	"rest_break_premium_hours" numeric(4, 2) DEFAULT '1.00',
	"require_clock_out_attestation" boolean DEFAULT true,
	"attestation_message" text DEFAULT 'I confirm that I was provided with all required meal and rest breaks during my shift.',
	"enable_break_alerts" boolean DEFAULT true,
	"alert_minutes_before_deadline" integer DEFAULT 15,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "break_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"business_date" text NOT NULL,
	"break_type" text DEFAULT 'unpaid',
	"start_punch_id" varchar,
	"end_punch_id" varchar,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"scheduled_minutes" integer,
	"actual_minutes" integer,
	"is_paid" boolean DEFAULT false,
	"is_violation" boolean DEFAULT false,
	"violation_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "break_violations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"timecard_id" varchar,
	"break_session_id" varchar,
	"business_date" text NOT NULL,
	"violation_type" text NOT NULL,
	"violation_reason" text,
	"shift_start_time" timestamp,
	"shift_end_time" timestamp,
	"hours_worked" numeric(6, 2),
	"break_deadline_time" timestamp,
	"premium_pay_hours" numeric(4, 2) DEFAULT '1.00',
	"premium_pay_rate" numeric(8, 2),
	"premium_pay_amount" numeric(10, 2),
	"status" text DEFAULT 'pending',
	"acknowledged_by_id" varchar,
	"acknowledged_at" timestamp,
	"paid_in_payroll_date" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cal_deployment_targets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" varchar NOT NULL,
	"property_id" varchar,
	"workstation_id" varchar,
	"service_host_id" varchar,
	"status" text DEFAULT 'pending',
	"status_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"retry_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "cal_deployments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"package_version_id" varchar NOT NULL,
	"deployment_scope" text NOT NULL,
	"target_property_id" varchar,
	"target_workstation_id" varchar,
	"target_service_host_id" varchar,
	"action" text DEFAULT 'install' NOT NULL,
	"scheduled_at" timestamp,
	"expires_at" timestamp,
	"created_by_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cal_package_prerequisites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_version_id" varchar NOT NULL,
	"prerequisite_package_id" varchar NOT NULL,
	"min_version" text,
	"install_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "cal_package_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" varchar NOT NULL,
	"version" text NOT NULL,
	"release_notes" text,
	"download_url" text,
	"checksum" text,
	"file_size" integer,
	"min_os_version" text,
	"is_latest" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"released_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cal_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"name" text NOT NULL,
	"package_type" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_drawers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"workstation_id" varchar,
	"name" text NOT NULL,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "cash_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"drawer_id" varchar,
	"assignment_id" varchar,
	"employee_id" varchar NOT NULL,
	"transaction_type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"business_date" text NOT NULL,
	"check_id" varchar,
	"reason" text,
	"manager_approval_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "check_discounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" varchar NOT NULL,
	"discount_id" varchar NOT NULL,
	"discount_name" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"applied_at" timestamp DEFAULT now(),
	"employee_id" varchar,
	"manager_approval_id" varchar
);
--> statement-breakpoint
CREATE TABLE "check_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" varchar NOT NULL,
	"round_id" varchar,
	"menu_item_id" varchar,
	"menu_item_name" text NOT NULL,
	"quantity" integer DEFAULT 1,
	"unit_price" numeric(10, 2) NOT NULL,
	"modifiers" jsonb,
	"item_status" text DEFAULT 'active' NOT NULL,
	"sent" boolean DEFAULT false,
	"voided" boolean DEFAULT false,
	"void_reason" text,
	"voided_by_employee_id" varchar,
	"voided_at" timestamp,
	"added_at" timestamp DEFAULT now(),
	"business_date" text,
	"tax_group_id_at_sale" varchar,
	"tax_mode_at_sale" text,
	"tax_rate_at_sale" numeric(10, 6),
	"tax_amount" numeric(10, 2),
	"taxable_amount" numeric(10, 2),
	"discount_id" varchar,
	"discount_name" text,
	"discount_amount" numeric(10, 2),
	"discount_applied_by" varchar,
	"discount_approved_by" varchar,
	"is_non_revenue" boolean DEFAULT false,
	"non_revenue_type" text,
	"offline_transaction_id" varchar
);
--> statement-breakpoint
CREATE TABLE "check_locks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" varchar NOT NULL,
	"workstation_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"lock_mode" text DEFAULT 'green' NOT NULL,
	"acquired_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "check_locks_check_id_unique" UNIQUE("check_id")
);
--> statement-breakpoint
CREATE TABLE "check_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" varchar NOT NULL,
	"tender_id" varchar NOT NULL,
	"tender_name" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"paid_at" timestamp DEFAULT now(),
	"employee_id" varchar,
	"business_date" text,
	"payment_transaction_id" varchar,
	"payment_status" text DEFAULT 'completed',
	"tip_amount" numeric(10, 2),
	"origin_device_id" varchar,
	"payment_attempt_id" varchar,
	"offline_transaction_id" varchar
);
--> statement-breakpoint
CREATE TABLE "check_service_charges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar NOT NULL,
	"check_id" varchar NOT NULL,
	"service_charge_id" varchar NOT NULL,
	"name_at_sale" text NOT NULL,
	"code_at_sale" text,
	"is_taxable_at_sale" boolean DEFAULT false NOT NULL,
	"tax_rate_at_sale" numeric(8, 5),
	"amount" numeric(12, 2) NOT NULL,
	"taxable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"auto_applied" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"applied_by_employee_id" varchar,
	"business_date" text NOT NULL,
	"origin_device_id" text,
	"voided" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp,
	"voided_by_employee_id" varchar,
	"void_reason" text
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_number" integer NOT NULL,
	"rvc_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"customer_id" varchar,
	"order_type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0',
	"tax_total" numeric(10, 2) DEFAULT '0',
	"discount_total" numeric(10, 2) DEFAULT '0',
	"service_charge_total" numeric(10, 2) DEFAULT '0',
	"tip_total" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0',
	"guest_count" integer DEFAULT 1,
	"table_number" text,
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"origin_business_date" text,
	"business_date" text,
	"loyalty_points_earned" integer,
	"loyalty_points_redeemed" integer,
	"test_mode" boolean DEFAULT false,
	"fulfillment_status" text,
	"online_order_id" varchar,
	"customer_name" text,
	"platform_source" text,
	"origin_device_id" varchar,
	"origin_created_at" timestamp,
	"offline_transaction_id" varchar
);
--> statement-breakpoint
CREATE TABLE "config_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"source_item_id" text NOT NULL,
	"override_item_id" text NOT NULL,
	"override_level" text NOT NULL,
	"override_scope_id" text NOT NULL,
	"enterprise_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "config_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" varchar NOT NULL,
	"version" integer NOT NULL,
	"table_name" varchar(50) NOT NULL,
	"entity_id" varchar NOT NULL,
	"operation" varchar(10) NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_platform_item_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar NOT NULL,
	"external_item_id" text NOT NULL,
	"external_item_name" text,
	"local_menu_item_id" varchar,
	"local_menu_item_name" text,
	"external_modifier_group_id" text,
	"local_modifier_group_id" varchar,
	"external_modifier_id" text,
	"local_modifier_id" varchar,
	"mapping_type" text DEFAULT 'menu_item' NOT NULL,
	"price_override" numeric(10, 2),
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "descriptor_logo_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_path" text NOT NULL,
	"checksum" text,
	"escpos_data" text,
	"created_at" timestamp DEFAULT now(),
	"created_by_id" varchar
);
--> statement-breakpoint
CREATE TABLE "descriptor_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" varchar NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"header_lines" jsonb DEFAULT '[]'::jsonb,
	"trailer_lines" jsonb DEFAULT '[]'::jsonb,
	"logo_enabled" boolean DEFAULT false,
	"logo_asset_id" varchar,
	"override_header" boolean DEFAULT false,
	"override_trailer" boolean DEFAULT false,
	"override_logo" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	"updated_by_id" varchar
);
--> statement-breakpoint
CREATE TABLE "device_enrollment_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"property_id" varchar,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"device_type" text,
	"max_uses" integer DEFAULT 1,
	"used_count" integer DEFAULT 0,
	"expires_at" timestamp,
	"created_by_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"active" boolean DEFAULT true,
	CONSTRAINT "device_enrollment_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "device_heartbeats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" varchar NOT NULL,
	"app_version" text,
	"os_version" text,
	"ip_address" text,
	"cpu_usage" numeric(5, 2),
	"memory_usage" numeric(5, 2),
	"disk_usage" numeric(5, 2),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"property_id" varchar,
	"rvc_id" varchar,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"device_type" text NOT NULL,
	"os_type" text,
	"os_version" text,
	"hardware_model" text,
	"serial_number" text,
	"ip_address" text,
	"mac_address" text,
	"current_app_version" text,
	"target_app_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_seen_at" timestamp,
	"enrolled_at" timestamp,
	"auto_update" boolean DEFAULT true,
	"environment" text DEFAULT 'production',
	"source_config_type" text,
	"source_config_id" varchar,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"requires_manager_approval" boolean DEFAULT false,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "drawer_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawer_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"business_date" text NOT NULL,
	"status" text DEFAULT 'assigned',
	"opening_amount" numeric(12, 2) NOT NULL,
	"expected_amount" numeric(12, 2) DEFAULT '0',
	"actual_amount" numeric(12, 2),
	"variance" numeric(12, 2),
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"closed_by_id" varchar,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "emc_option_flags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"option_key" text NOT NULL,
	"value_text" text,
	"scope_level" text NOT NULL,
	"scope_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "emc_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"session_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "emc_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "emc_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"access_level" text DEFAULT 'property_admin' NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"employee_id" varchar,
	"active" boolean DEFAULT true,
	"last_login_at" timestamp,
	"failed_login_attempts" integer DEFAULT 0,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "emc_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "employee_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"is_primary" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "employee_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"property_id" varchar,
	"day_of_week" integer,
	"start_time" text,
	"end_time" text,
	"availability_type" text DEFAULT 'available',
	"effective_from" text,
	"effective_to" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_job_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"job_code_id" varchar NOT NULL,
	"pay_rate" numeric(10, 2),
	"is_primary" boolean DEFAULT false,
	"bypass_clock_in" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "employee_minor_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"date_of_birth" text NOT NULL,
	"is_minor" boolean DEFAULT false,
	"age_category" text,
	"work_permit_number" text,
	"work_permit_issue_date" text,
	"work_permit_expiration_date" text,
	"work_permit_document_url" text,
	"currently_in_school" boolean DEFAULT true,
	"school_name" text,
	"school_end_date" text,
	"max_daily_hours" numeric(4, 2),
	"max_weekly_hours" numeric(4, 2),
	"earliest_start_time" text,
	"latest_end_time" text,
	"verified_by_id" varchar,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"employee_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" text,
	"pin_hash" text NOT NULL,
	"role_id" varchar,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "enterprises" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true,
	CONSTRAINT "enterprises_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "family_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"major_group_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"display_order" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"business_date" text NOT NULL,
	"status" text DEFAULT 'open',
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"closed_by_id" varchar,
	"reopened_at" timestamp,
	"reopened_by_id" varchar,
	"reopen_reason" text,
	"gross_sales" numeric(12, 2) DEFAULT '0',
	"net_sales" numeric(12, 2) DEFAULT '0',
	"tax_collected" numeric(12, 2) DEFAULT '0',
	"discounts_total" numeric(12, 2) DEFAULT '0',
	"refunds_total" numeric(12, 2) DEFAULT '0',
	"tips_total" numeric(12, 2) DEFAULT '0',
	"service_charges_total" numeric(12, 2) DEFAULT '0',
	"check_count" integer DEFAULT 0,
	"guest_count" integer DEFAULT 0,
	"cash_expected" numeric(12, 2) DEFAULT '0',
	"cash_actual" numeric(12, 2),
	"cash_variance" numeric(12, 2),
	"card_total" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gift_card_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_card_id" varchar NOT NULL,
	"property_id" varchar,
	"transaction_type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"balance_before" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"check_id" varchar,
	"check_payment_id" varchar,
	"employee_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"card_number" text NOT NULL,
	"pin" text,
	"initial_balance" numeric(12, 2) NOT NULL,
	"current_balance" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'active',
	"activated_at" timestamp,
	"activated_by_id" varchar,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"purchaser_name" text,
	"recipient_name" text,
	"recipient_email" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "gift_cards_card_number_unique" UNIQUE("card_number")
);
--> statement-breakpoint
CREATE TABLE "gl_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"source_type" text NOT NULL,
	"source_id" varchar,
	"gl_account_code" text NOT NULL,
	"gl_account_name" text,
	"debit_credit" text DEFAULT 'credit',
	"description" text,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"workstation_id" varchar NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" varchar NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"request_hash" text,
	"response_status" integer,
	"response_body" text,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ingredient_prefixes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"print_name" text,
	"price_factor" numeric(5, 2) DEFAULT '1.00',
	"display_order" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"menu_item_id" varchar,
	"name" text NOT NULL,
	"sku" text,
	"category" text,
	"unit_type" text DEFAULT 'each',
	"unit_cost" numeric(10, 4),
	"par_level" numeric(10, 2),
	"reorder_point" numeric(10, 2),
	"reorder_quantity" numeric(10, 2),
	"vendor_id" varchar,
	"vendor_sku" text,
	"shelf_life_days" integer,
	"storage_location" text,
	"track_inventory" boolean DEFAULT true,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_stock" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"current_quantity" numeric(12, 4) DEFAULT '0',
	"last_count_date" text,
	"last_count_quantity" numeric(12, 4),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"transaction_type" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"quantity_before" numeric(12, 4),
	"quantity_after" numeric(12, 4),
	"unit_cost" numeric(10, 4),
	"total_cost" numeric(12, 2),
	"business_date" text,
	"check_id" varchar,
	"employee_id" varchar,
	"reason" text,
	"reference_number" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "item_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"business_date" text NOT NULL,
	"initial_quantity" integer,
	"current_quantity" integer,
	"sold_quantity" integer DEFAULT 0,
	"is_available" boolean DEFAULT true,
	"is_86ed" boolean DEFAULT false,
	"eighty_sixed_at" timestamp,
	"eighty_sixed_by_id" varchar,
	"low_stock_threshold" integer DEFAULT 5,
	"alert_sent" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"role_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"compensation_type" text DEFAULT 'hourly',
	"hourly_rate" numeric(10, 2),
	"salary_amount" numeric(12, 2),
	"salary_period" text,
	"tip_mode" text DEFAULT 'not_eligible',
	"tip_pool_weight" numeric(5, 2) DEFAULT '1.00',
	"color" text DEFAULT '#3B82F6',
	"display_order" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "kds_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"station_type" text DEFAULT 'hot' NOT NULL,
	"show_draft_items" boolean DEFAULT false,
	"show_sent_items_only" boolean DEFAULT true,
	"group_by" text DEFAULT 'order',
	"show_timers" boolean DEFAULT true,
	"auto_sort_by" text DEFAULT 'time',
	"allow_bump" boolean DEFAULT true,
	"allow_recall" boolean DEFAULT true,
	"allow_void_display" boolean DEFAULT true,
	"expo_mode" boolean DEFAULT false,
	"new_order_sound" boolean DEFAULT true,
	"new_order_blink_seconds" integer DEFAULT 5,
	"color_alert_1_enabled" boolean DEFAULT true,
	"color_alert_1_seconds" integer DEFAULT 60,
	"color_alert_1_color" text DEFAULT 'yellow',
	"color_alert_2_enabled" boolean DEFAULT true,
	"color_alert_2_seconds" integer DEFAULT 180,
	"color_alert_2_color" text DEFAULT 'orange',
	"color_alert_3_enabled" boolean DEFAULT true,
	"color_alert_3_seconds" integer DEFAULT 300,
	"color_alert_3_color" text DEFAULT 'red',
	"font_scale" integer DEFAULT 100,
	"ws_channel" text,
	"ip_address" text,
	"is_online" boolean DEFAULT false,
	"last_seen_at" timestamp,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "kds_ticket_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kds_ticket_id" varchar NOT NULL,
	"check_item_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_ready" boolean DEFAULT false,
	"ready_at" timestamp,
	"is_modified" boolean DEFAULT false,
	"modified_at" timestamp,
	"sort_priority" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "kds_tickets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" varchar NOT NULL,
	"round_id" varchar,
	"order_device_id" varchar,
	"kds_device_id" varchar,
	"station_type" text,
	"rvc_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_preview" boolean DEFAULT false,
	"paid" boolean DEFAULT false,
	"is_recalled" boolean DEFAULT false,
	"recalled_at" timestamp,
	"bumped_at" timestamp,
	"bumped_by_employee_id" varchar,
	"subtotal" numeric(10, 2),
	"origin_device_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labor_forecasts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"forecast_date" text NOT NULL,
	"job_code_id" varchar,
	"hourly_needs" jsonb,
	"total_hours_needed" numeric(8, 2),
	"projected_labor_cost" numeric(12, 2),
	"target_labor_percent" numeric(5, 2) DEFAULT '25',
	"actual_hours_worked" numeric(8, 2),
	"actual_labor_cost" numeric(12, 2),
	"actual_labor_percent" numeric(5, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labor_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"business_date" text NOT NULL,
	"hour" integer,
	"daypart" text,
	"total_sales" numeric(12, 2) DEFAULT '0',
	"labor_hours" numeric(8, 2) DEFAULT '0',
	"labor_cost" numeric(10, 2) DEFAULT '0',
	"labor_percentage" numeric(5, 2) DEFAULT '0',
	"sales_per_labor_hour" numeric(10, 2) DEFAULT '0',
	"headcount" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_member_enrollments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar NOT NULL,
	"program_id" varchar NOT NULL,
	"current_points" integer DEFAULT 0,
	"lifetime_points" integer DEFAULT 0,
	"current_tier" text DEFAULT 'standard',
	"visit_count" integer DEFAULT 0,
	"lifetime_spend" numeric(12, 2) DEFAULT '0',
	"status" text DEFAULT 'active',
	"enrolled_at" timestamp DEFAULT now(),
	"last_activity_at" timestamp,
	"points_expiration_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "loyalty_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"member_number" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"birth_date" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"notes" text,
	CONSTRAINT "loyalty_members_member_number_unique" UNIQUE("member_number")
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"name" text NOT NULL,
	"program_type" text DEFAULT 'points' NOT NULL,
	"points_per_dollar" numeric(5, 2) DEFAULT '1',
	"minimum_points_redeem" integer DEFAULT 100,
	"points_redemption_value" numeric(10, 4) DEFAULT '0.01',
	"visits_for_reward" integer DEFAULT 10,
	"tier_config" jsonb,
	"points_expiration_days" integer,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_redemptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar NOT NULL,
	"reward_id" varchar NOT NULL,
	"check_id" varchar,
	"property_id" varchar,
	"points_used" integer DEFAULT 0,
	"discount_applied" numeric(10, 2),
	"status" text DEFAULT 'applied',
	"employee_id" varchar,
	"redeemed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" varchar NOT NULL,
	"property_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"reward_type" text DEFAULT 'discount' NOT NULL,
	"points_cost" integer DEFAULT 0,
	"auto_award_at_points" integer,
	"auto_award_once" boolean DEFAULT true,
	"discount_amount" numeric(10, 2),
	"discount_percent" numeric(5, 2),
	"free_menu_item_id" varchar,
	"gift_card_amount" numeric(10, 2),
	"min_purchase" numeric(10, 2),
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"tier_required" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar NOT NULL,
	"program_id" varchar NOT NULL,
	"enrollment_id" varchar,
	"property_id" varchar,
	"transaction_type" text NOT NULL,
	"points" integer DEFAULT 0,
	"points_before" integer DEFAULT 0,
	"points_after" integer DEFAULT 0,
	"visit_increment" integer DEFAULT 0,
	"visits_before" integer DEFAULT 0,
	"visits_after" integer DEFAULT 0,
	"check_id" varchar,
	"check_total" numeric(12, 2),
	"employee_id" varchar,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "major_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"display_order" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "manager_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'warning',
	"title" text NOT NULL,
	"message" text NOT NULL,
	"employee_id" varchar,
	"check_id" varchar,
	"target_type" text,
	"target_id" varchar,
	"metadata" jsonb,
	"read" boolean DEFAULT false,
	"read_at" timestamp,
	"read_by_id" varchar,
	"acknowledged" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"acknowledged_by_id" varchar,
	"resolution" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifier_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"modifier_group_id" varchar NOT NULL,
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "menu_item_recipe_ingredients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"ingredient_name" text NOT NULL,
	"ingredient_category" text,
	"default_quantity" integer DEFAULT 1,
	"is_default" boolean DEFAULT true,
	"price_per_unit" numeric(10, 2) DEFAULT '0.00',
	"display_order" integer DEFAULT 0,
	"active" boolean DEFAULT true,
	"modifier_id" varchar,
	"default_prefix_id" varchar,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "menu_item_slus" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"slu_id" varchar NOT NULL,
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"short_name" text,
	"price" numeric(10, 2) NOT NULL,
	"tax_group_id" varchar,
	"print_class_id" varchar,
	"major_group_id" varchar,
	"family_group_id" varchar,
	"color" text DEFAULT '#3B82F6',
	"menu_build_enabled" boolean DEFAULT false,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "minor_labor_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"state_code" text DEFAULT 'CA' NOT NULL,
	"minor_age_threshold" integer DEFAULT 18,
	"young_minor_age_threshold" integer DEFAULT 16,
	"school_day_max_hours" numeric(4, 2) DEFAULT '4.00',
	"school_week_max_hours" numeric(4, 2) DEFAULT '18.00',
	"school_day_start_time" text DEFAULT '07:00',
	"school_day_end_time" text DEFAULT '19:00',
	"non_school_day_max_hours" numeric(4, 2) DEFAULT '8.00',
	"non_school_week_max_hours" numeric(4, 2) DEFAULT '40.00',
	"non_school_day_start_time" text DEFAULT '07:00',
	"non_school_day_end_time" text DEFAULT '21:00',
	"require_work_permit" boolean DEFAULT true,
	"work_permit_expiration_alert_days" integer DEFAULT 30,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "modifier_group_modifiers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modifier_group_id" varchar NOT NULL,
	"modifier_id" varchar NOT NULL,
	"is_default" boolean DEFAULT false,
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"required" boolean DEFAULT false,
	"min_select" integer DEFAULT 0,
	"max_select" integer DEFAULT 99,
	"display_order" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"price_delta" numeric(10, 2) DEFAULT '0',
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "offline_order_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"workstation_id" varchar,
	"employee_id" varchar,
	"local_id" text NOT NULL,
	"order_data" jsonb NOT NULL,
	"status" text DEFAULT 'pending',
	"sync_attempts" integer DEFAULT 0,
	"last_sync_attempt" timestamp,
	"synced_check_id" varchar,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "online_order_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text NOT NULL,
	"platform" text DEFAULT 'other' NOT NULL,
	"client_id" text,
	"client_secret" text,
	"merchant_store_id" text,
	"webhook_secret" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"api_key_prefix" text,
	"webhook_url" text,
	"auto_accept" boolean DEFAULT false,
	"auto_inject" boolean DEFAULT false,
	"auto_confirm_minutes" integer DEFAULT 5,
	"default_prep_minutes" integer DEFAULT 15,
	"default_rvc_id" varchar,
	"default_order_type" text DEFAULT 'delivery',
	"menu_mappings" jsonb,
	"menu_sync_status" text DEFAULT 'not_synced',
	"last_menu_sync_at" timestamp,
	"menu_sync_error" text,
	"commission_percent" numeric(5, 2),
	"connection_status" text DEFAULT 'disconnected',
	"last_connection_test" timestamp,
	"sound_enabled" boolean DEFAULT true,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "online_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"source_id" varchar,
	"external_order_id" text NOT NULL,
	"status" text DEFAULT 'received',
	"order_type" text DEFAULT 'pickup',
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"delivery_address" text,
	"delivery_instructions" text,
	"scheduled_time" timestamp,
	"estimated_prep_minutes" integer,
	"confirmed_at" timestamp,
	"ready_at" timestamp,
	"picked_up_at" timestamp,
	"delivered_at" timestamp,
	"subtotal" numeric(12, 2) NOT NULL,
	"tax_total" numeric(12, 2) DEFAULT '0',
	"delivery_fee" numeric(10, 2) DEFAULT '0',
	"service_fee" numeric(10, 2) DEFAULT '0',
	"tip" numeric(10, 2) DEFAULT '0',
	"total" numeric(12, 2) NOT NULL,
	"commission" numeric(10, 2) DEFAULT '0',
	"items" jsonb NOT NULL,
	"check_id" varchar,
	"injected_at" timestamp,
	"injected_by_id" varchar,
	"raw_payload" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_device_kds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_device_id" varchar NOT NULL,
	"kds_device_id" varchar NOT NULL,
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "order_device_printers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_device_id" varchar NOT NULL,
	"printer_id" varchar NOT NULL,
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "order_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"kds_device_id" varchar,
	"send_on" text DEFAULT 'send_button',
	"send_voids" boolean DEFAULT true,
	"send_reprints" boolean DEFAULT true,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "overtime_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"daily_regular_hours" numeric(4, 2) DEFAULT '8.00',
	"daily_overtime_threshold" numeric(4, 2) DEFAULT '8.00',
	"daily_double_time_threshold" numeric(4, 2),
	"weekly_overtime_threshold" numeric(4, 2) DEFAULT '40.00',
	"weekly_double_time_threshold" numeric(4, 2),
	"overtime_multiplier" numeric(3, 2) DEFAULT '1.50',
	"double_time_multiplier" numeric(3, 2) DEFAULT '2.00',
	"enable_daily_overtime" boolean DEFAULT true,
	"enable_daily_double_time" boolean DEFAULT false,
	"enable_weekly_overtime" boolean DEFAULT true,
	"enable_weekly_double_time" boolean DEFAULT false,
	"week_start_day" integer DEFAULT 0,
	"effective_date" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pay_periods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'open',
	"locked_at" timestamp,
	"locked_by_id" varchar,
	"exported_at" timestamp,
	"exported_by_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_gateway_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_level" text NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"workstation_id" varchar,
	"gateway_type" text,
	"integration_model" text,
	"environment" text,
	"credential_key_prefix" text,
	"merchant_id" text,
	"terminal_id" text,
	"site_id" text,
	"device_id" text,
	"license_id" text,
	"terminal_ip_address" text,
	"terminal_port" text,
	"terminal_connection_type" text,
	"enable_sale" boolean DEFAULT false,
	"enable_void" boolean DEFAULT false,
	"enable_refund" boolean DEFAULT false,
	"enable_auth_capture" boolean DEFAULT false,
	"enable_manual_entry" boolean DEFAULT false,
	"enable_debit" boolean DEFAULT false,
	"enable_ebt" boolean DEFAULT false,
	"enable_healthcare" boolean DEFAULT false,
	"enable_contactless" boolean DEFAULT false,
	"enable_emv" boolean DEFAULT false,
	"enable_msr" boolean DEFAULT false,
	"enable_partial_approval" boolean DEFAULT false,
	"enable_tokenization" boolean DEFAULT false,
	"enable_store_and_forward" boolean DEFAULT false,
	"enable_surcharge" boolean DEFAULT false,
	"enable_tip_adjust" boolean DEFAULT false,
	"enable_incremental_auth" boolean DEFAULT false,
	"enable_cashback" boolean DEFAULT false,
	"surcharge_percent" text,
	"saf_floor_limit" text,
	"saf_max_transactions" integer,
	"auth_hold_minutes" integer,
	"enable_auto_batch_close" boolean DEFAULT false,
	"batch_close_time" text,
	"enable_manual_batch_close" boolean DEFAULT false,
	"receipt_show_emv_fields" boolean DEFAULT false,
	"receipt_show_aid" boolean DEFAULT false,
	"receipt_show_tvr" boolean DEFAULT false,
	"receipt_show_tsi" boolean DEFAULT false,
	"receipt_show_app_label" boolean DEFAULT false,
	"receipt_show_entry_method" boolean DEFAULT false,
	"receipt_print_merchant_copy" boolean DEFAULT false,
	"receipt_print_customer_copy" boolean DEFAULT false,
	"enable_debug_logging" boolean DEFAULT false,
	"log_raw_requests" boolean DEFAULT false,
	"log_raw_responses" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_processors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"gateway_type" text NOT NULL,
	"environment" text DEFAULT 'sandbox',
	"credential_key_prefix" text NOT NULL,
	"gateway_settings" jsonb,
	"supports_tokenization" boolean DEFAULT true,
	"supports_tip_adjust" boolean DEFAULT true,
	"supports_partial_auth" boolean DEFAULT false,
	"supports_emv" boolean DEFAULT true,
	"supports_contactless" boolean DEFAULT true,
	"auth_hold_minutes" integer DEFAULT 1440,
	"settlement_time" text DEFAULT '02:00',
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_payment_id" varchar,
	"payment_processor_id" varchar NOT NULL,
	"gateway_transaction_id" text,
	"auth_code" text,
	"reference_number" text,
	"card_brand" text,
	"card_last4" text,
	"card_expiry_month" integer,
	"card_expiry_year" integer,
	"entry_mode" text,
	"auth_amount" integer NOT NULL,
	"capture_amount" integer,
	"tip_amount" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"transaction_type" text NOT NULL,
	"response_code" text,
	"response_message" text,
	"avs_result" text,
	"cvv_result" text,
	"initiated_at" timestamp DEFAULT now(),
	"authorized_at" timestamp,
	"captured_at" timestamp,
	"settled_at" timestamp,
	"terminal_id" text,
	"workstation_id" varchar,
	"employee_id" varchar,
	"original_transaction_id" varchar,
	"refunded_amount" integer DEFAULT 0,
	"batch_id" text,
	"business_date" text
);
--> statement-breakpoint
CREATE TABLE "pos_layout_cells" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" varchar NOT NULL,
	"row_index" integer NOT NULL,
	"col_index" integer NOT NULL,
	"row_span" integer DEFAULT 1,
	"col_span" integer DEFAULT 1,
	"menu_item_id" varchar,
	"background_color" text DEFAULT '#3B82F6',
	"text_color" text DEFAULT '#FFFFFF',
	"display_label" text
);
--> statement-breakpoint
CREATE TABLE "pos_layout_rvc_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar NOT NULL,
	"is_default" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "pos_layouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"mode" text DEFAULT 'slu_tabs' NOT NULL,
	"grid_rows" integer DEFAULT 4,
	"grid_cols" integer DEFAULT 6,
	"font_size" text DEFAULT 'medium',
	"is_default" boolean DEFAULT false,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "prep_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"par_level" integer NOT NULL,
	"current_level" integer DEFAULT 0,
	"unit" text DEFAULT 'each',
	"shelf_life_hours" integer,
	"prep_instructions" text,
	"menu_item_ids" text[],
	"consumption_per_item" numeric(5, 2) DEFAULT '1',
	"last_prep_at" timestamp,
	"last_prep_by_id" varchar,
	"last_prep_quantity" integer,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "print_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar,
	"workstation_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"agent_token" text NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_heartbeat" timestamp,
	"last_connected_at" timestamp,
	"last_disconnected_at" timestamp,
	"agent_version" text,
	"hostname" text,
	"ip_address" text,
	"os_info" text,
	"auto_reconnect" boolean DEFAULT true,
	"heartbeat_interval_ms" integer DEFAULT 30000,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "print_agents_agent_token_unique" UNIQUE("agent_token")
);
--> statement-breakpoint
CREATE TABLE "print_class_routing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"print_class_id" varchar NOT NULL,
	"order_device_id" varchar NOT NULL,
	"property_id" varchar,
	"rvc_id" varchar
);
--> statement-breakpoint
CREATE TABLE "print_classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"print_agent_id" varchar,
	"printer_id" varchar,
	"workstation_id" varchar,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 5,
	"check_id" varchar,
	"employee_id" varchar,
	"business_date" text,
	"esc_pos_data" text,
	"plain_text_data" text,
	"printer_ip" text,
	"printer_port" integer DEFAULT 9100,
	"printer_name" text,
	"connection_type" text DEFAULT 'network',
	"com_port" text,
	"baud_rate" integer,
	"windows_printer_name" text,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"last_error" text,
	"leased_by" varchar,
	"leased_until" timestamp,
	"dedupe_key" varchar,
	"origin_device_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"sent_to_agent_at" timestamp,
	"printed_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"host_workstation_id" varchar,
	"name" text NOT NULL,
	"printer_type" text DEFAULT 'kitchen' NOT NULL,
	"connection_type" text DEFAULT 'network' NOT NULL,
	"ip_address" text,
	"subnet_mask" text DEFAULT '255.255.255.0',
	"port" integer DEFAULT 9100,
	"com_port" text,
	"baud_rate" integer DEFAULT 9600,
	"windows_printer_name" text,
	"driver_protocol" text DEFAULT 'epson',
	"model" text,
	"character_width" integer DEFAULT 42,
	"auto_cut" boolean DEFAULT true,
	"print_logo" boolean DEFAULT false,
	"print_order_header" boolean DEFAULT true,
	"print_order_footer" boolean DEFAULT true,
	"print_voids" boolean DEFAULT true,
	"print_reprints" boolean DEFAULT true,
	"retry_attempts" integer DEFAULT 3,
	"failure_handling_mode" text DEFAULT 'alert_cashier',
	"is_online" boolean DEFAULT false,
	"last_seen_at" timestamp,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "privileges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"description" text,
	CONSTRAINT "privileges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'America/New_York',
	"business_date_rollover_time" text DEFAULT '04:00',
	"business_date_mode" text DEFAULT 'auto',
	"current_business_date" text,
	"sign_in_logo_url" text,
	"auto_clock_out_enabled" boolean DEFAULT false,
	"caps_workstation_id" varchar,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"inventory_item_id" varchar NOT NULL,
	"quantity" numeric(10, 4) NOT NULL,
	"unit_type" text,
	"waste_percent" numeric(5, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "refund_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" varchar NOT NULL,
	"original_check_item_id" varchar NOT NULL,
	"menu_item_name" text NOT NULL,
	"quantity" integer DEFAULT 1,
	"unit_price" numeric(10, 2) NOT NULL,
	"modifiers" jsonb,
	"tax_amount" numeric(10, 2) DEFAULT '0',
	"refund_amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" varchar NOT NULL,
	"original_payment_id" varchar NOT NULL,
	"tender_id" varchar NOT NULL,
	"tender_name" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"gateway_refund_id" text,
	"gateway_status" text,
	"gateway_message" text,
	"refund_method" text DEFAULT 'manual'
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_number" integer NOT NULL,
	"rvc_id" varchar NOT NULL,
	"original_check_id" varchar NOT NULL,
	"original_check_number" integer NOT NULL,
	"refund_type" text NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_total" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"reason" text,
	"processed_by_employee_id" varchar NOT NULL,
	"manager_approval_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"business_date" text
);
--> statement-breakpoint
CREATE TABLE "registered_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"device_type" text NOT NULL,
	"workstation_id" varchar,
	"kds_device_id" varchar,
	"name" text NOT NULL,
	"enrollment_code" text,
	"enrollment_code_expires_at" timestamp,
	"device_token" text,
	"device_token_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"enrolled_at" timestamp,
	"last_access_at" timestamp,
	"os_info" text,
	"browser_info" text,
	"screen_resolution" text,
	"serial_number" text,
	"asset_tag" text,
	"mac_address" text,
	"ip_address" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by_employee_id" varchar,
	"disabled_at" timestamp,
	"disabled_by_employee_id" varchar,
	"disabled_reason" text
);
--> statement-breakpoint
CREATE TABLE "role_privileges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"privilege_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"enterprise_id" varchar,
	"max_item_discount_pct" integer DEFAULT 0 NOT NULL,
	"max_check_discount_pct" integer DEFAULT 0 NOT NULL,
	"max_item_discount_amt" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_check_discount_amt" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_price_override_pct_down" integer DEFAULT 0 NOT NULL,
	"max_price_override_amt_down" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reopen_window_minutes" integer DEFAULT 0 NOT NULL,
	"edit_closed_window_minutes" integer DEFAULT 0 NOT NULL,
	"refund_window_minutes" integer DEFAULT 0 NOT NULL,
	"bypass_windows_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" varchar NOT NULL,
	"round_number" integer NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"sent_by_employee_id" varchar
);
--> statement-breakpoint
CREATE TABLE "rvc_counters" (
	"rvc_id" varchar PRIMARY KEY NOT NULL,
	"next_check_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rvcs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"fast_transaction_default" boolean DEFAULT false,
	"default_order_type" text DEFAULT 'dine_in',
	"order_type_default" text DEFAULT 'dine_in',
	"dynamic_order_mode" boolean DEFAULT false,
	"dom_send_mode" text DEFAULT 'fire_on_fly',
	"conversational_ordering_enabled" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"receipt_print_mode" text DEFAULT 'auto_on_close',
	"receipt_copies" integer DEFAULT 1,
	"kitchen_print_mode" text DEFAULT 'auto_on_send',
	"void_receipt_print" boolean DEFAULT true,
	"require_guest_count" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "safe_counts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"business_date" text NOT NULL,
	"count_type" text DEFAULT 'daily' NOT NULL,
	"expected_amount" numeric(12, 2),
	"actual_amount" numeric(12, 2) NOT NULL,
	"variance" numeric(12, 2),
	"denominations" jsonb,
	"notes" text,
	"verified_by_id" varchar,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_forecasts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"forecast_date" text NOT NULL,
	"day_of_week" integer,
	"hourly_projections" jsonb,
	"projected_sales" numeric(12, 2),
	"projected_guests" integer,
	"projected_checks" integer,
	"actual_sales" numeric(12, 2),
	"actual_guests" integer,
	"actual_checks" integer,
	"model_version" text,
	"confidence" numeric(5, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_charges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"auto_apply" boolean DEFAULT false,
	"order_types" text[],
	"active" boolean DEFAULT true,
	"is_taxable" boolean DEFAULT false NOT NULL,
	"tax_group_id" varchar,
	"revenue_category" text DEFAULT 'revenue' NOT NULL,
	"post_to_tip_pool" boolean DEFAULT false NOT NULL,
	"tip_eligible" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_host_alert_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'warning',
	"enabled" boolean DEFAULT true,
	"threshold_value" integer,
	"threshold_duration_minutes" integer,
	"notify_email" boolean DEFAULT true,
	"notify_sms" boolean DEFAULT false,
	"email_recipients" jsonb DEFAULT '[]'::jsonb,
	"sms_recipients" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_host_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_host_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'warning',
	"message" text NOT NULL,
	"details" jsonb,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"acknowledged_by_id" varchar,
	"resolved_at" timestamp,
	"notifications_sent" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "service_host_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_host_id" varchar NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"connection_mode" text DEFAULT 'green',
	"connected_workstations" integer DEFAULT 0,
	"pending_sync_items" integer DEFAULT 0,
	"cpu_usage_percent" integer,
	"memory_usage_mb" integer,
	"disk_usage_percent" integer,
	"disk_free_gb" real,
	"uptime" integer
);
--> statement-breakpoint
CREATE TABLE "service_host_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_host_id" varchar NOT NULL,
	"property_id" varchar NOT NULL,
	"local_id" varchar NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"business_date" text NOT NULL,
	"data" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now(),
	"cloud_entity_id" varchar
);
--> statement-breakpoint
CREATE TABLE "service_hosts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"name" text NOT NULL,
	"service_type" text DEFAULT 'caps' NOT NULL,
	"host_workstation_id" varchar,
	"workstation_id" varchar,
	"status" text DEFAULT 'offline',
	"last_heartbeat_at" timestamp,
	"version" varchar(20),
	"services" jsonb DEFAULT '[]'::jsonb,
	"registration_token" varchar(128),
	"registration_token_used" boolean DEFAULT false,
	"encryption_key_hash" varchar(64),
	"hostname" text,
	"ip_address" text,
	"active_checks" integer DEFAULT 0,
	"pending_transactions" integer DEFAULT 0,
	"local_config_version" integer DEFAULT 0,
	"connected_device_ids" jsonb DEFAULT '[]'::jsonb,
	"service_config" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_cover_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cover_request_id" varchar NOT NULL,
	"offer_id" varchar,
	"approved_by_id" varchar NOT NULL,
	"approved" boolean NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_cover_offers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cover_request_id" varchar NOT NULL,
	"offerer_id" varchar NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_cover_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" varchar NOT NULL,
	"requester_id" varchar NOT NULL,
	"reason" text,
	"status" text DEFAULT 'open',
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"job_code_id" varchar,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"break_minutes" integer DEFAULT 0,
	"color" text,
	"notes" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"employee_id" varchar,
	"job_code_id" varchar,
	"template_id" varchar,
	"shift_date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"scheduled_break_minutes" integer DEFAULT 0,
	"status" text DEFAULT 'draft',
	"notes" text,
	"published_at" timestamp,
	"published_by_id" varchar,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "slus" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"button_label" text NOT NULL,
	"display_order" integer DEFAULT 0,
	"color" text DEFAULT '#3B82F6',
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "stress_test_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"employee_id" varchar,
	"status" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"target_tx_per_minute" integer NOT NULL,
	"patterns" text[],
	"total_transactions" integer DEFAULT 0,
	"successful_transactions" integer DEFAULT 0,
	"failed_transactions" integer DEFAULT 0,
	"avg_transaction_ms" integer,
	"min_transaction_ms" integer,
	"max_transaction_ms" integer,
	"actual_tx_per_minute" numeric,
	"elapsed_seconds" integer,
	"errors" text[],
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sync_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"enterprise_id" varchar,
	"service_host_id" varchar,
	"category" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb,
	"read" boolean DEFAULT false,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tax_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"tax_mode" text DEFAULT 'add_on' NOT NULL,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"payment_processor_id" varchar,
	"active" boolean DEFAULT true,
	"is_system" boolean DEFAULT false,
	"pop_drawer" boolean DEFAULT false,
	"allow_tips" boolean DEFAULT false,
	"allow_over_tender" boolean DEFAULT false,
	"print_check_on_payment" boolean DEFAULT true,
	"require_manager_approval" boolean DEFAULT false,
	"requires_payment_processor" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"is_cash_media" boolean DEFAULT false,
	"is_card_media" boolean DEFAULT false,
	"is_gift_media" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "terminal_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"payment_processor_id" varchar,
	"workstation_id" varchar,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"serial_number" text,
	"terminal_id" text,
	"connection_type" text DEFAULT 'ethernet',
	"network_address" text,
	"port" integer,
	"cloud_device_id" text,
	"status" text DEFAULT 'offline',
	"last_heartbeat" timestamp,
	"capabilities" jsonb,
	"firmware_version" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "terminal_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"terminal_device_id" varchar NOT NULL,
	"check_id" varchar,
	"tender_id" varchar,
	"employee_id" varchar,
	"workstation_id" varchar,
	"amount" integer NOT NULL,
	"tip_amount" integer DEFAULT 0,
	"currency" text DEFAULT 'usd',
	"status" text DEFAULT 'pending',
	"status_message" text,
	"processor_reference" text,
	"payment_transaction_id" varchar,
	"initiated_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"expires_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "time_off_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" varchar NOT NULL,
	"property_id" varchar,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"request_type" text DEFAULT 'pto',
	"reason_code" text,
	"notes" text,
	"status" text DEFAULT 'submitted',
	"reviewed_by_id" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "time_punches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"job_code_id" varchar,
	"punch_type" text NOT NULL,
	"actual_timestamp" timestamp NOT NULL,
	"rounded_timestamp" timestamp,
	"business_date" text NOT NULL,
	"source" text DEFAULT 'pos',
	"notes" text,
	"is_edited" boolean DEFAULT false,
	"original_timestamp" timestamp,
	"edited_by_id" varchar,
	"edited_at" timestamp,
	"edit_reason" text,
	"voided" boolean DEFAULT false,
	"voided_by_id" varchar,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timecard_edits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"edit_type" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"reason_code" text,
	"notes" text,
	"edited_by_id" varchar,
	"edited_by_emc_user_id" varchar,
	"edited_by_display_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timecard_exceptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"timecard_id" varchar,
	"time_punch_id" varchar,
	"exception_type" text NOT NULL,
	"business_date" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'warning',
	"status" text DEFAULT 'pending',
	"resolved_by_id" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timecards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"pay_period_id" varchar,
	"business_date" text NOT NULL,
	"job_code_id" varchar,
	"pay_rate" numeric(10, 2),
	"clock_in_time" timestamp,
	"clock_out_time" timestamp,
	"regular_hours" numeric(6, 2) DEFAULT '0',
	"overtime_hours" numeric(6, 2) DEFAULT '0',
	"double_time_hours" numeric(6, 2) DEFAULT '0',
	"break_minutes" integer DEFAULT 0,
	"paid_break_minutes" integer DEFAULT 0,
	"unpaid_break_minutes" integer DEFAULT 0,
	"total_hours" numeric(6, 2) DEFAULT '0',
	"regular_pay" numeric(10, 2) DEFAULT '0',
	"overtime_pay" numeric(10, 2) DEFAULT '0',
	"total_pay" numeric(10, 2) DEFAULT '0',
	"tips" numeric(10, 2) DEFAULT '0',
	"status" text DEFAULT 'open',
	"approved_by_id" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tip_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tip_pool_run_id" varchar NOT NULL,
	"employee_id" varchar NOT NULL,
	"hours_worked" numeric(6, 2) DEFAULT '0',
	"points_earned" numeric(6, 2) DEFAULT '0',
	"share_percentage" numeric(5, 2) DEFAULT '0',
	"allocated_amount" numeric(10, 2) DEFAULT '0',
	"direct_tips" numeric(10, 2) DEFAULT '0',
	"total_tips" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tip_pool_policies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"calculation_method" text DEFAULT 'hours_worked',
	"role_weights" jsonb,
	"excluded_job_code_ids" text[],
	"exclude_managers" boolean DEFAULT true,
	"exclude_training" boolean DEFAULT true,
	"minimum_hours_required" numeric(4, 2) DEFAULT '0',
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tip_pool_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"policy_id" varchar,
	"business_date" text NOT NULL,
	"total_tips" numeric(10, 2) DEFAULT '0',
	"total_hours" numeric(10, 2) DEFAULT '0',
	"participant_count" integer DEFAULT 0,
	"status" text DEFAULT 'pending',
	"run_by_id" varchar,
	"run_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tip_rule_job_percentages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tip_rule_id" varchar NOT NULL,
	"job_code_id" varchar NOT NULL,
	"percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tip_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" varchar,
	"property_id" varchar,
	"rvc_id" varchar,
	"name" text DEFAULT 'Default Tip Rules' NOT NULL,
	"distribution_method" text DEFAULT 'tip_directly' NOT NULL,
	"timeframe" text DEFAULT 'daily',
	"applies_to_all_locations" boolean DEFAULT false,
	"declare_cash_tips" boolean DEFAULT false,
	"declare_cash_tips_all_locations" boolean DEFAULT false,
	"exclude_managers" boolean DEFAULT true,
	"minimum_hours_for_pool" numeric(4, 2) DEFAULT '0',
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workstation_order_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workstation_id" varchar NOT NULL,
	"order_device_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workstation_service_bindings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"workstation_id" varchar NOT NULL,
	"service_type" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workstations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"rvc_id" varchar,
	"name" text NOT NULL,
	"device_type" text DEFAULT 'pos_terminal' NOT NULL,
	"default_order_type" text DEFAULT 'dine_in',
	"fast_transaction_enabled" boolean DEFAULT false,
	"require_begin_check" boolean DEFAULT true,
	"allow_pickup_check" boolean DEFAULT true,
	"allow_reopen_closed_checks" boolean DEFAULT false,
	"allow_offline_operation" boolean DEFAULT false,
	"offline_check_number_start" integer,
	"offline_check_number_end" integer,
	"allowed_role_ids" text[],
	"manager_approval_device" boolean DEFAULT false,
	"clock_in_allowed" boolean DEFAULT true,
	"default_receipt_printer_id" varchar,
	"backup_receipt_printer_id" varchar,
	"report_printer_id" varchar,
	"backup_report_printer_id" varchar,
	"void_printer_id" varchar,
	"backup_void_printer_id" varchar,
	"default_order_device_id" varchar,
	"default_kds_expo_id" varchar,
	"ip_address" text,
	"hostname" text,
	"is_online" boolean DEFAULT false,
	"last_seen_at" timestamp,
	"service_host_url" text,
	"auto_logout_minutes" integer,
	"active" boolean DEFAULT true,
	"service_bindings" text[],
	"setup_status" text DEFAULT 'pending',
	"last_setup_at" timestamp,
	"last_setup_by" varchar,
	"installed_services" text[],
	"device_token" text,
	"registered_device_id" varchar,
	"font_scale" integer DEFAULT 100,
	"com_port" text,
	"com_baud_rate" integer DEFAULT 9600,
	"com_data_bits" integer DEFAULT 8,
	"com_stop_bits" text DEFAULT '1',
	"com_parity" text DEFAULT 'none',
	"com_flow_control" text DEFAULT 'none',
	"cash_drawer_enabled" boolean DEFAULT false,
	"cash_drawer_printer_id" varchar,
	"cash_drawer_kick_pin" text DEFAULT 'pin2',
	"cash_drawer_pulse_duration" integer DEFAULT 100,
	"cash_drawer_auto_open_on_cash" boolean DEFAULT true,
	"cash_drawer_auto_open_on_drop" boolean DEFAULT true
);
--> statement-breakpoint
ALTER TABLE "accounting_exports" ADD CONSTRAINT "accounting_exports_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_exports" ADD CONSTRAINT "accounting_exports_generated_by_id_employees_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_manager_approval_id_employees_id_fk" FOREIGN KEY ("manager_approval_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_attestations" ADD CONSTRAINT "break_attestations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_attestations" ADD CONSTRAINT "break_attestations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_attestations" ADD CONSTRAINT "break_attestations_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_rules" ADD CONSTRAINT "break_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_sessions" ADD CONSTRAINT "break_sessions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_sessions" ADD CONSTRAINT "break_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_sessions" ADD CONSTRAINT "break_sessions_start_punch_id_time_punches_id_fk" FOREIGN KEY ("start_punch_id") REFERENCES "public"."time_punches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_sessions" ADD CONSTRAINT "break_sessions_end_punch_id_time_punches_id_fk" FOREIGN KEY ("end_punch_id") REFERENCES "public"."time_punches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_violations" ADD CONSTRAINT "break_violations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_violations" ADD CONSTRAINT "break_violations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_violations" ADD CONSTRAINT "break_violations_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_violations" ADD CONSTRAINT "break_violations_break_session_id_break_sessions_id_fk" FOREIGN KEY ("break_session_id") REFERENCES "public"."break_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_violations" ADD CONSTRAINT "break_violations_acknowledged_by_id_employees_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployment_targets" ADD CONSTRAINT "cal_deployment_targets_deployment_id_cal_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."cal_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployment_targets" ADD CONSTRAINT "cal_deployment_targets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployment_targets" ADD CONSTRAINT "cal_deployment_targets_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployment_targets" ADD CONSTRAINT "cal_deployment_targets_service_host_id_service_hosts_id_fk" FOREIGN KEY ("service_host_id") REFERENCES "public"."service_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployments" ADD CONSTRAINT "cal_deployments_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployments" ADD CONSTRAINT "cal_deployments_package_version_id_cal_package_versions_id_fk" FOREIGN KEY ("package_version_id") REFERENCES "public"."cal_package_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployments" ADD CONSTRAINT "cal_deployments_target_property_id_properties_id_fk" FOREIGN KEY ("target_property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployments" ADD CONSTRAINT "cal_deployments_target_workstation_id_workstations_id_fk" FOREIGN KEY ("target_workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployments" ADD CONSTRAINT "cal_deployments_target_service_host_id_service_hosts_id_fk" FOREIGN KEY ("target_service_host_id") REFERENCES "public"."service_hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_deployments" ADD CONSTRAINT "cal_deployments_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_package_prerequisites" ADD CONSTRAINT "cal_package_prerequisites_package_version_id_cal_package_versions_id_fk" FOREIGN KEY ("package_version_id") REFERENCES "public"."cal_package_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_package_prerequisites" ADD CONSTRAINT "cal_package_prerequisites_prerequisite_package_id_cal_packages_id_fk" FOREIGN KEY ("prerequisite_package_id") REFERENCES "public"."cal_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_package_versions" ADD CONSTRAINT "cal_package_versions_package_id_cal_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."cal_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cal_packages" ADD CONSTRAINT "cal_packages_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawers" ADD CONSTRAINT "cash_drawers_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_drawer_id_cash_drawers_id_fk" FOREIGN KEY ("drawer_id") REFERENCES "public"."cash_drawers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_assignment_id_drawer_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."drawer_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_manager_approval_id_employees_id_fk" FOREIGN KEY ("manager_approval_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_discounts" ADD CONSTRAINT "check_discounts_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_discounts" ADD CONSTRAINT "check_discounts_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_discounts" ADD CONSTRAINT "check_discounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_discounts" ADD CONSTRAINT "check_discounts_manager_approval_id_employees_id_fk" FOREIGN KEY ("manager_approval_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_voided_by_employee_id_employees_id_fk" FOREIGN KEY ("voided_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_discount_applied_by_employees_id_fk" FOREIGN KEY ("discount_applied_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_discount_approved_by_employees_id_fk" FOREIGN KEY ("discount_approved_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_locks" ADD CONSTRAINT "check_locks_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_locks" ADD CONSTRAINT "check_locks_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_locks" ADD CONSTRAINT "check_locks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_payments" ADD CONSTRAINT "check_payments_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_payments" ADD CONSTRAINT "check_payments_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_payments" ADD CONSTRAINT "check_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_service_charges" ADD CONSTRAINT "check_service_charges_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_service_charges" ADD CONSTRAINT "check_service_charges_service_charge_id_service_charges_id_fk" FOREIGN KEY ("service_charge_id") REFERENCES "public"."service_charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_service_charges" ADD CONSTRAINT "check_service_charges_applied_by_employee_id_employees_id_fk" FOREIGN KEY ("applied_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_service_charges" ADD CONSTRAINT "check_service_charges_voided_by_employee_id_employees_id_fk" FOREIGN KEY ("voided_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_overrides" ADD CONSTRAINT "config_overrides_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_platform_item_mappings" ADD CONSTRAINT "delivery_platform_item_mappings_source_id_online_order_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."online_order_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_platform_item_mappings" ADD CONSTRAINT "delivery_platform_item_mappings_local_menu_item_id_menu_items_id_fk" FOREIGN KEY ("local_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptor_logo_assets" ADD CONSTRAINT "descriptor_logo_assets_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptor_sets" ADD CONSTRAINT "descriptor_sets_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descriptor_sets" ADD CONSTRAINT "descriptor_sets_logo_asset_id_descriptor_logo_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."descriptor_logo_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_enrollment_tokens" ADD CONSTRAINT "device_enrollment_tokens_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_enrollment_tokens" ADD CONSTRAINT "device_enrollment_tokens_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_enrollment_tokens" ADD CONSTRAINT "device_enrollment_tokens_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_heartbeats" ADD CONSTRAINT "device_heartbeats_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawer_assignments" ADD CONSTRAINT "drawer_assignments_drawer_id_cash_drawers_id_fk" FOREIGN KEY ("drawer_id") REFERENCES "public"."cash_drawers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawer_assignments" ADD CONSTRAINT "drawer_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawer_assignments" ADD CONSTRAINT "drawer_assignments_closed_by_id_employees_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emc_option_flags" ADD CONSTRAINT "emc_option_flags_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emc_sessions" ADD CONSTRAINT "emc_sessions_user_id_emc_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."emc_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emc_users" ADD CONSTRAINT "emc_users_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emc_users" ADD CONSTRAINT "emc_users_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emc_users" ADD CONSTRAINT "emc_users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_job_codes" ADD CONSTRAINT "employee_job_codes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_job_codes" ADD CONSTRAINT "employee_job_codes_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_minor_status" ADD CONSTRAINT "employee_minor_status_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_minor_status" ADD CONSTRAINT "employee_minor_status_verified_by_id_employees_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_groups" ADD CONSTRAINT "family_groups_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_groups" ADD CONSTRAINT "family_groups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_groups" ADD CONSTRAINT "family_groups_major_group_id_major_groups_id_fk" FOREIGN KEY ("major_group_id") REFERENCES "public"."major_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_id_employees_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_reopened_by_id_employees_id_fk" FOREIGN KEY ("reopened_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_gift_card_id_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_check_payment_id_check_payments_id_fk" FOREIGN KEY ("check_payment_id") REFERENCES "public"."check_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_activated_by_id_employees_id_fk" FOREIGN KEY ("activated_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_mappings" ADD CONSTRAINT "gl_mappings_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_mappings" ADD CONSTRAINT "gl_mappings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prefixes" ADD CONSTRAINT "ingredient_prefixes_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prefixes" ADD CONSTRAINT "ingredient_prefixes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prefixes" ADD CONSTRAINT "ingredient_prefixes_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_availability" ADD CONSTRAINT "item_availability_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_availability" ADD CONSTRAINT "item_availability_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_availability" ADD CONSTRAINT "item_availability_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_availability" ADD CONSTRAINT "item_availability_eighty_sixed_by_id_employees_id_fk" FOREIGN KEY ("eighty_sixed_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_devices" ADD CONSTRAINT "kds_devices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_ticket_items" ADD CONSTRAINT "kds_ticket_items_kds_ticket_id_kds_tickets_id_fk" FOREIGN KEY ("kds_ticket_id") REFERENCES "public"."kds_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_ticket_items" ADD CONSTRAINT "kds_ticket_items_check_item_id_check_items_id_fk" FOREIGN KEY ("check_item_id") REFERENCES "public"."check_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_order_device_id_order_devices_id_fk" FOREIGN KEY ("order_device_id") REFERENCES "public"."order_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_kds_device_id_kds_devices_id_fk" FOREIGN KEY ("kds_device_id") REFERENCES "public"."kds_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kds_tickets" ADD CONSTRAINT "kds_tickets_bumped_by_employee_id_employees_id_fk" FOREIGN KEY ("bumped_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_forecasts" ADD CONSTRAINT "labor_forecasts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_forecasts" ADD CONSTRAINT "labor_forecasts_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_forecasts" ADD CONSTRAINT "labor_forecasts_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_snapshots" ADD CONSTRAINT "labor_snapshots_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_snapshots" ADD CONSTRAINT "labor_snapshots_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_member_enrollments" ADD CONSTRAINT "loyalty_member_enrollments_member_id_loyalty_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_member_enrollments" ADD CONSTRAINT "loyalty_member_enrollments_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_members" ADD CONSTRAINT "loyalty_members_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_members" ADD CONSTRAINT "loyalty_members_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_member_id_loyalty_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_reward_id_loyalty_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_free_menu_item_id_menu_items_id_fk" FOREIGN KEY ("free_menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_member_id_loyalty_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."loyalty_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_program_id_loyalty_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."loyalty_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_enrollment_id_loyalty_member_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."loyalty_member_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "major_groups" ADD CONSTRAINT "major_groups_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "major_groups" ADD CONSTRAINT "major_groups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_alerts" ADD CONSTRAINT "manager_alerts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_alerts" ADD CONSTRAINT "manager_alerts_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_alerts" ADD CONSTRAINT "manager_alerts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_alerts" ADD CONSTRAINT "manager_alerts_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_alerts" ADD CONSTRAINT "manager_alerts_read_by_id_employees_id_fk" FOREIGN KEY ("read_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_alerts" ADD CONSTRAINT "manager_alerts_acknowledged_by_id_employees_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_recipe_ingredients" ADD CONSTRAINT "menu_item_recipe_ingredients_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_recipe_ingredients" ADD CONSTRAINT "menu_item_recipe_ingredients_modifier_id_modifiers_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_recipe_ingredients" ADD CONSTRAINT "menu_item_recipe_ingredients_default_prefix_id_ingredient_prefixes_id_fk" FOREIGN KEY ("default_prefix_id") REFERENCES "public"."ingredient_prefixes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_slus" ADD CONSTRAINT "menu_item_slus_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_slus" ADD CONSTRAINT "menu_item_slus_slu_id_slus_id_fk" FOREIGN KEY ("slu_id") REFERENCES "public"."slus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tax_group_id_tax_groups_id_fk" FOREIGN KEY ("tax_group_id") REFERENCES "public"."tax_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_print_class_id_print_classes_id_fk" FOREIGN KEY ("print_class_id") REFERENCES "public"."print_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_major_group_id_major_groups_id_fk" FOREIGN KEY ("major_group_id") REFERENCES "public"."major_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_family_group_id_family_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "public"."family_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minor_labor_rules" ADD CONSTRAINT "minor_labor_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_group_modifiers" ADD CONSTRAINT "modifier_group_modifiers_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_group_modifiers" ADD CONSTRAINT "modifier_group_modifiers_modifier_id_modifiers_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."modifiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_order_queue" ADD CONSTRAINT "offline_order_queue_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_order_queue" ADD CONSTRAINT "offline_order_queue_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_order_queue" ADD CONSTRAINT "offline_order_queue_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_order_queue" ADD CONSTRAINT "offline_order_queue_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_sources" ADD CONSTRAINT "online_order_sources_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_sources" ADD CONSTRAINT "online_order_sources_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_order_sources" ADD CONSTRAINT "online_order_sources_default_rvc_id_rvcs_id_fk" FOREIGN KEY ("default_rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_source_id_online_order_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."online_order_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_injected_by_id_employees_id_fk" FOREIGN KEY ("injected_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_device_kds" ADD CONSTRAINT "order_device_kds_order_device_id_order_devices_id_fk" FOREIGN KEY ("order_device_id") REFERENCES "public"."order_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_device_kds" ADD CONSTRAINT "order_device_kds_kds_device_id_kds_devices_id_fk" FOREIGN KEY ("kds_device_id") REFERENCES "public"."kds_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_device_printers" ADD CONSTRAINT "order_device_printers_order_device_id_order_devices_id_fk" FOREIGN KEY ("order_device_id") REFERENCES "public"."order_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_device_printers" ADD CONSTRAINT "order_device_printers_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_devices" ADD CONSTRAINT "order_devices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_devices" ADD CONSTRAINT "order_devices_kds_device_id_kds_devices_id_fk" FOREIGN KEY ("kds_device_id") REFERENCES "public"."kds_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_rules" ADD CONSTRAINT "overtime_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_locked_by_id_employees_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_exported_by_id_employees_id_fk" FOREIGN KEY ("exported_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_config" ADD CONSTRAINT "payment_gateway_config_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_config" ADD CONSTRAINT "payment_gateway_config_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_processors" ADD CONSTRAINT "payment_processors_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_check_payment_id_check_payments_id_fk" FOREIGN KEY ("check_payment_id") REFERENCES "public"."check_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_processor_id_payment_processors_id_fk" FOREIGN KEY ("payment_processor_id") REFERENCES "public"."payment_processors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layout_cells" ADD CONSTRAINT "pos_layout_cells_layout_id_pos_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."pos_layouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layout_cells" ADD CONSTRAINT "pos_layout_cells_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layout_rvc_assignments" ADD CONSTRAINT "pos_layout_rvc_assignments_layout_id_pos_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."pos_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layout_rvc_assignments" ADD CONSTRAINT "pos_layout_rvc_assignments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layout_rvc_assignments" ADD CONSTRAINT "pos_layout_rvc_assignments_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layouts" ADD CONSTRAINT "pos_layouts_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layouts" ADD CONSTRAINT "pos_layouts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_layouts" ADD CONSTRAINT "pos_layouts_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_items" ADD CONSTRAINT "prep_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_items" ADD CONSTRAINT "prep_items_last_prep_by_id_employees_id_fk" FOREIGN KEY ("last_prep_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_class_routing" ADD CONSTRAINT "print_class_routing_print_class_id_print_classes_id_fk" FOREIGN KEY ("print_class_id") REFERENCES "public"."print_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_class_routing" ADD CONSTRAINT "print_class_routing_order_device_id_order_devices_id_fk" FOREIGN KEY ("order_device_id") REFERENCES "public"."order_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_class_routing" ADD CONSTRAINT "print_class_routing_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_class_routing" ADD CONSTRAINT "print_class_routing_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_classes" ADD CONSTRAINT "print_classes_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_classes" ADD CONSTRAINT "print_classes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_classes" ADD CONSTRAINT "print_classes_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_print_agent_id_print_agents_id_fk" FOREIGN KEY ("print_agent_id") REFERENCES "public"."print_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_host_workstation_id_workstations_id_fk" FOREIGN KEY ("host_workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_original_check_item_id_check_items_id_fk" FOREIGN KEY ("original_check_item_id") REFERENCES "public"."check_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_payments" ADD CONSTRAINT "refund_payments_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_payments" ADD CONSTRAINT "refund_payments_original_payment_id_check_payments_id_fk" FOREIGN KEY ("original_payment_id") REFERENCES "public"."check_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_payments" ADD CONSTRAINT "refund_payments_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_original_check_id_checks_id_fk" FOREIGN KEY ("original_check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_employee_id_employees_id_fk" FOREIGN KEY ("processed_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_manager_approval_id_employees_id_fk" FOREIGN KEY ("manager_approval_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_kds_device_id_kds_devices_id_fk" FOREIGN KEY ("kds_device_id") REFERENCES "public"."kds_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_disabled_by_employee_id_employees_id_fk" FOREIGN KEY ("disabled_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_privileges" ADD CONSTRAINT "role_privileges_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_rules" ADD CONSTRAINT "role_rules_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_rules" ADD CONSTRAINT "role_rules_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_sent_by_employee_id_employees_id_fk" FOREIGN KEY ("sent_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rvc_counters" ADD CONSTRAINT "rvc_counters_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rvcs" ADD CONSTRAINT "rvcs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_counts" ADD CONSTRAINT "safe_counts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_counts" ADD CONSTRAINT "safe_counts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_counts" ADD CONSTRAINT "safe_counts_verified_by_id_employees_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_forecasts" ADD CONSTRAINT "sales_forecasts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_forecasts" ADD CONSTRAINT "sales_forecasts_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_tax_group_id_tax_groups_id_fk" FOREIGN KEY ("tax_group_id") REFERENCES "public"."tax_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_alert_rules" ADD CONSTRAINT "service_host_alert_rules_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_alerts" ADD CONSTRAINT "service_host_alerts_service_host_id_service_hosts_id_fk" FOREIGN KEY ("service_host_id") REFERENCES "public"."service_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_alerts" ADD CONSTRAINT "service_host_alerts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_alerts" ADD CONSTRAINT "service_host_alerts_acknowledged_by_id_employees_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_metrics" ADD CONSTRAINT "service_host_metrics_service_host_id_service_hosts_id_fk" FOREIGN KEY ("service_host_id") REFERENCES "public"."service_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_transactions" ADD CONSTRAINT "service_host_transactions_service_host_id_service_hosts_id_fk" FOREIGN KEY ("service_host_id") REFERENCES "public"."service_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_host_transactions" ADD CONSTRAINT "service_host_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_hosts" ADD CONSTRAINT "service_hosts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_hosts" ADD CONSTRAINT "service_hosts_host_workstation_id_workstations_id_fk" FOREIGN KEY ("host_workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_hosts" ADD CONSTRAINT "service_hosts_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_approvals" ADD CONSTRAINT "shift_cover_approvals_cover_request_id_shift_cover_requests_id_fk" FOREIGN KEY ("cover_request_id") REFERENCES "public"."shift_cover_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_approvals" ADD CONSTRAINT "shift_cover_approvals_offer_id_shift_cover_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."shift_cover_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_approvals" ADD CONSTRAINT "shift_cover_approvals_approved_by_id_employees_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_offers" ADD CONSTRAINT "shift_cover_offers_cover_request_id_shift_cover_requests_id_fk" FOREIGN KEY ("cover_request_id") REFERENCES "public"."shift_cover_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_offers" ADD CONSTRAINT "shift_cover_offers_offerer_id_employees_id_fk" FOREIGN KEY ("offerer_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_requests" ADD CONSTRAINT "shift_cover_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cover_requests" ADD CONSTRAINT "shift_cover_requests_requester_id_employees_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_template_id_shift_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_published_by_id_employees_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slus" ADD CONSTRAINT "slus_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slus" ADD CONSTRAINT "slus_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slus" ADD CONSTRAINT "slus_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stress_test_results" ADD CONSTRAINT "stress_test_results_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stress_test_results" ADD CONSTRAINT "stress_test_results_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stress_test_results" ADD CONSTRAINT "stress_test_results_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_notifications" ADD CONSTRAINT "sync_notifications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_notifications" ADD CONSTRAINT "sync_notifications_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_notifications" ADD CONSTRAINT "sync_notifications_service_host_id_service_hosts_id_fk" FOREIGN KEY ("service_host_id") REFERENCES "public"."service_hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_groups" ADD CONSTRAINT "tax_groups_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_groups" ADD CONSTRAINT "tax_groups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_groups" ADD CONSTRAINT "tax_groups_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_payment_processor_id_payment_processors_id_fk" FOREIGN KEY ("payment_processor_id") REFERENCES "public"."payment_processors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_devices" ADD CONSTRAINT "terminal_devices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_devices" ADD CONSTRAINT "terminal_devices_payment_processor_id_payment_processors_id_fk" FOREIGN KEY ("payment_processor_id") REFERENCES "public"."payment_processors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_devices" ADD CONSTRAINT "terminal_devices_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_terminal_device_id_terminal_devices_id_fk" FOREIGN KEY ("terminal_device_id") REFERENCES "public"."terminal_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_payment_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_reviewed_by_id_employees_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_edited_by_id_employees_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_voided_by_id_employees_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_edits" ADD CONSTRAINT "timecard_edits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_edits" ADD CONSTRAINT "timecard_edits_edited_by_id_employees_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_edits" ADD CONSTRAINT "timecard_edits_edited_by_emc_user_id_emc_users_id_fk" FOREIGN KEY ("edited_by_emc_user_id") REFERENCES "public"."emc_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_exceptions" ADD CONSTRAINT "timecard_exceptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_exceptions" ADD CONSTRAINT "timecard_exceptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_exceptions" ADD CONSTRAINT "timecard_exceptions_timecard_id_timecards_id_fk" FOREIGN KEY ("timecard_id") REFERENCES "public"."timecards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_exceptions" ADD CONSTRAINT "timecard_exceptions_time_punch_id_time_punches_id_fk" FOREIGN KEY ("time_punch_id") REFERENCES "public"."time_punches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecard_exceptions" ADD CONSTRAINT "timecard_exceptions_resolved_by_id_employees_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_pay_period_id_pay_periods_id_fk" FOREIGN KEY ("pay_period_id") REFERENCES "public"."pay_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timecards" ADD CONSTRAINT "timecards_approved_by_id_employees_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_tip_pool_run_id_tip_pool_runs_id_fk" FOREIGN KEY ("tip_pool_run_id") REFERENCES "public"."tip_pool_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_pool_policies" ADD CONSTRAINT "tip_pool_policies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_pool_policies" ADD CONSTRAINT "tip_pool_policies_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_pool_runs" ADD CONSTRAINT "tip_pool_runs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_pool_runs" ADD CONSTRAINT "tip_pool_runs_policy_id_tip_pool_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."tip_pool_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_pool_runs" ADD CONSTRAINT "tip_pool_runs_run_by_id_employees_id_fk" FOREIGN KEY ("run_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_rule_job_percentages" ADD CONSTRAINT "tip_rule_job_percentages_tip_rule_id_tip_rules_id_fk" FOREIGN KEY ("tip_rule_id") REFERENCES "public"."tip_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_rule_job_percentages" ADD CONSTRAINT "tip_rule_job_percentages_job_code_id_job_codes_id_fk" FOREIGN KEY ("job_code_id") REFERENCES "public"."job_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_rules" ADD CONSTRAINT "tip_rules_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_rules" ADD CONSTRAINT "tip_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_rules" ADD CONSTRAINT "tip_rules_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstation_order_devices" ADD CONSTRAINT "workstation_order_devices_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstation_order_devices" ADD CONSTRAINT "workstation_order_devices_order_device_id_order_devices_id_fk" FOREIGN KEY ("order_device_id") REFERENCES "public"."order_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstation_service_bindings" ADD CONSTRAINT "workstation_service_bindings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstation_service_bindings" ADD CONSTRAINT "workstation_service_bindings_workstation_id_workstations_id_fk" FOREIGN KEY ("workstation_id") REFERENCES "public"."workstations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstations" ADD CONSTRAINT "workstations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstations" ADD CONSTRAINT "workstations_rvc_id_rvcs_id_fk" FOREIGN KEY ("rvc_id") REFERENCES "public"."rvcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_check_payments_attempt_id" ON "check_payments" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE INDEX "idx_check_service_charges_business_date" ON "check_service_charges" USING btree ("business_date","property_id","rvc_id");--> statement-breakpoint
CREATE INDEX "idx_check_service_charges_check_id" ON "check_service_charges" USING btree ("check_id");--> statement-breakpoint
CREATE INDEX "idx_check_service_charges_sc_id" ON "check_service_charges" USING btree ("service_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_checks_rvc_check_number" ON "checks" USING btree ("rvc_id","check_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_emc_option_flags_unique" ON "emc_option_flags" USING btree ("enterprise_id","entity_type","entity_id","option_key","scope_level","scope_id");--> statement-breakpoint
CREATE INDEX "idx_emc_option_flags_entity" ON "emc_option_flags" USING btree ("enterprise_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_emc_option_flags_key" ON "emc_option_flags" USING btree ("enterprise_id","option_key");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_idempotency_keys_unique" ON "idempotency_keys" USING btree ("enterprise_id","workstation_id","operation","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_print_jobs_dedupe" ON "print_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_sync_notifications_property" ON "sync_notifications" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_sync_notifications_created" ON "sync_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_notifications_unread" ON "sync_notifications" USING btree ("property_id","read");