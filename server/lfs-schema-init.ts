import type pg from "pg";

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`CREATE TABLE IF NOT EXISTS accounting_exports (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      export_type TEXT DEFAULT 'daily'::text,
      format_type TEXT DEFAULT 'csv'::text,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'pending'::text,
      generated_at TIMESTAMP,
      generated_by_id VARCHAR,
      download_url TEXT,
      error_message TEXT,
      total_revenue NUMERIC(12,2),
      total_tax NUMERIC(12,2),
      total_labor NUMERIC(12,2),
      row_count INTEGER,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      property_id VARCHAR,
      alert_type TEXT,
      severity TEXT,
      notify_email BOOLEAN DEFAULT false,
      notify_sms BOOLEAN DEFAULT false,
      notify_push BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      rvc_id VARCHAR,
      employee_id VARCHAR,
      action TEXT,
      target_type TEXT,
      target_id VARCHAR,
      details JSONB,
      reason_code TEXT,
      manager_approval_id VARCHAR,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS availability_exceptions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      property_id VARCHAR,
      exception_date TEXT,
      is_available BOOLEAN DEFAULT false,
      start_time TEXT,
      end_time TEXT,
      reason TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_attestations (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      timecard_id VARCHAR,
      business_date TEXT,
      attestation_type TEXT DEFAULT 'clock_out'::text,
      breaks_provided BOOLEAN,
      missed_meal_break BOOLEAN DEFAULT false,
      missed_rest_break BOOLEAN DEFAULT false,
      missed_break_reason TEXT,
      employee_signature TEXT,
      attested_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_rules (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT DEFAULT 'California Break Rules'::text,
      state_code TEXT DEFAULT 'CA'::text,
      enable_meal_break_enforcement BOOLEAN DEFAULT true,
      meal_break_minutes INTEGER DEFAULT 30,
      meal_break_threshold_hours NUMERIC(4,2) DEFAULT 5.00,
      second_meal_break_threshold_hours NUMERIC(4,2) DEFAULT 10.00,
      allow_meal_break_waiver BOOLEAN DEFAULT true,
      meal_waiver_max_shift_hours NUMERIC(4,2) DEFAULT 6.00,
      enable_rest_break_enforcement BOOLEAN DEFAULT true,
      rest_break_minutes INTEGER DEFAULT 10,
      rest_break_interval_hours NUMERIC(4,2) DEFAULT 4.00,
      rest_break_is_paid BOOLEAN DEFAULT true,
      enable_premium_pay BOOLEAN DEFAULT true,
      meal_break_premium_hours NUMERIC(4,2) DEFAULT 1.00,
      rest_break_premium_hours NUMERIC(4,2) DEFAULT 1.00,
      require_clock_out_attestation BOOLEAN DEFAULT true,
      attestation_message TEXT DEFAULT 'I confirm that I was provided with all required meal and rest breaks during my shift.'::text,
      enable_break_alerts BOOLEAN DEFAULT true,
      alert_minutes_before_deadline INTEGER DEFAULT 15,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_sessions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      business_date TEXT,
      break_type TEXT DEFAULT 'unpaid'::text,
      start_punch_id VARCHAR,
      end_punch_id VARCHAR,
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      scheduled_minutes INTEGER,
      actual_minutes INTEGER,
      is_paid BOOLEAN DEFAULT false,
      is_violation BOOLEAN DEFAULT false,
      violation_notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_violations (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      timecard_id VARCHAR,
      break_session_id VARCHAR,
      business_date TEXT,
      violation_type TEXT,
      violation_reason TEXT,
      shift_start_time TIMESTAMP,
      shift_end_time TIMESTAMP,
      hours_worked NUMERIC(6,2),
      break_deadline_time TIMESTAMP,
      premium_pay_hours NUMERIC(4,2) DEFAULT 1.00,
      premium_pay_rate NUMERIC(8,2),
      premium_pay_amount NUMERIC(10,2),
      status TEXT DEFAULT 'pending'::text,
      acknowledged_by_id VARCHAR,
      acknowledged_at TIMESTAMP,
      paid_in_payroll_date TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_deployment_targets (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      deployment_id VARCHAR,
      property_id VARCHAR,
      workstation_id VARCHAR,
      service_host_id VARCHAR,
      status TEXT DEFAULT 'pending'::text,
      status_message TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      retry_count INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_deployments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      package_version_id VARCHAR,
      deployment_scope TEXT,
      action TEXT DEFAULT 'install'::text,
      scheduled_at TIMESTAMP,
      expires_at TIMESTAMP,
      created_by_id VARCHAR,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      target_property_id VARCHAR,
      target_workstation_id VARCHAR,
      target_service_host_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_package_prerequisites (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      package_version_id VARCHAR,
      prerequisite_package_id VARCHAR,
      min_version TEXT,
      install_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_package_versions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      package_id VARCHAR,
      version TEXT,
      release_notes TEXT,
      download_url TEXT,
      checksum TEXT,
      file_size INTEGER,
      min_os_version TEXT,
      is_latest BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      released_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_packages (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      name TEXT,
      package_type TEXT,
      description TEXT,
      is_system BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cash_drawers (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      workstation_id VARCHAR,
      name TEXT,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cash_transactions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      drawer_id VARCHAR,
      assignment_id VARCHAR,
      employee_id VARCHAR,
      transaction_type TEXT,
      amount NUMERIC(12,2),
      business_date TEXT,
      check_id VARCHAR,
      reason TEXT,
      manager_approval_id VARCHAR,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_discounts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_id VARCHAR,
      discount_id VARCHAR,
      discount_name TEXT,
      amount NUMERIC(10,2),
      applied_at TIMESTAMP DEFAULT now(),
      employee_id VARCHAR,
      manager_approval_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_items (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_id VARCHAR,
      round_id VARCHAR,
      menu_item_id VARCHAR,
      menu_item_name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price NUMERIC(10,2),
      modifiers JSONB,
      sent BOOLEAN DEFAULT false,
      voided BOOLEAN DEFAULT false,
      void_reason TEXT,
      voided_by_employee_id VARCHAR,
      voided_at TIMESTAMP,
      added_at TIMESTAMP DEFAULT now(),
      item_status TEXT DEFAULT 'active'::text,
      business_date TEXT,
      tax_group_id_at_sale VARCHAR,
      tax_mode_at_sale TEXT,
      tax_rate_at_sale NUMERIC(10,6),
      tax_amount NUMERIC(10,2),
      taxable_amount NUMERIC(10,2),
      discount_id VARCHAR,
      discount_name TEXT,
      discount_amount NUMERIC(10,2),
      discount_applied_by VARCHAR,
      discount_approved_by VARCHAR,
      is_non_revenue BOOLEAN DEFAULT false,
      non_revenue_type TEXT,
      offline_transaction_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_locks (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_id VARCHAR,
      workstation_id VARCHAR,
      employee_id VARCHAR,
      acquired_at TIMESTAMP DEFAULT now(),
      expires_at TIMESTAMP,
      lock_mode TEXT DEFAULT 'green'::text
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_payments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_id VARCHAR,
      tender_id VARCHAR,
      tender_name TEXT,
      amount NUMERIC(10,2),
      paid_at TIMESTAMP DEFAULT now(),
      employee_id VARCHAR,
      business_date TEXT,
      payment_transaction_id VARCHAR,
      payment_status TEXT DEFAULT 'completed'::text,
      tip_amount NUMERIC(10,2),
      origin_device_id VARCHAR,
      payment_attempt_id VARCHAR,
      offline_transaction_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_service_charges (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      check_id VARCHAR,
      service_charge_id VARCHAR,
      name_at_sale TEXT,
      code_at_sale TEXT,
      is_taxable_at_sale BOOLEAN DEFAULT false,
      tax_rate_at_sale NUMERIC(8,5),
      amount NUMERIC(12,2),
      taxable_amount NUMERIC(12,2) DEFAULT '0'::numeric,
      tax_amount NUMERIC(12,2) DEFAULT '0'::numeric,
      auto_applied BOOLEAN DEFAULT false,
      applied_at TIMESTAMP DEFAULT now(),
      applied_by_employee_id VARCHAR,
      business_date TEXT,
      origin_device_id TEXT,
      voided BOOLEAN DEFAULT false,
      voided_at TIMESTAMP,
      voided_by_employee_id VARCHAR,
      void_reason TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS checks (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_number INTEGER,
      rvc_id VARCHAR,
      employee_id VARCHAR,
      order_type TEXT,
      status TEXT DEFAULT 'open'::text,
      subtotal NUMERIC(10,2) DEFAULT '0'::numeric,
      tax_total NUMERIC(10,2) DEFAULT '0'::numeric,
      discount_total NUMERIC(10,2) DEFAULT '0'::numeric,
      service_charge_total NUMERIC(10,2) DEFAULT '0'::numeric,
      total NUMERIC(10,2) DEFAULT '0'::numeric,
      guest_count INTEGER DEFAULT 1,
      table_number TEXT,
      opened_at TIMESTAMP DEFAULT now(),
      closed_at TIMESTAMP,
      business_date TEXT,
      customer_id VARCHAR,
      loyalty_points_earned INTEGER,
      loyalty_points_redeemed INTEGER,
      origin_business_date TEXT,
      tip_total NUMERIC(10,2) DEFAULT '0'::numeric,
      test_mode BOOLEAN DEFAULT false,
      fulfillment_status TEXT,
      online_order_id VARCHAR,
      customer_name TEXT,
      platform_source TEXT,
      origin_device_id VARCHAR,
      origin_created_at TIMESTAMP,
      offline_transaction_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS config_overrides (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      entity_type TEXT,
      source_item_id TEXT,
      override_item_id TEXT,
      override_level TEXT,
      override_scope_id TEXT,
      enterprise_id VARCHAR,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE SEQUENCE IF NOT EXISTS config_versions_id_seq`);

    await client.query(`CREATE TABLE IF NOT EXISTS config_versions (
      id INTEGER DEFAULT nextval('config_versions_id_seq'::regclass) PRIMARY KEY,
      property_id VARCHAR,
      version INTEGER,
      table_name VARCHAR,
      entity_id VARCHAR,
      operation VARCHAR,
      data JSONB,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS delivery_platform_item_mappings (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      source_id VARCHAR,
      external_item_id TEXT,
      external_item_name TEXT,
      local_menu_item_id VARCHAR,
      local_menu_item_name TEXT,
      external_modifier_group_id TEXT,
      local_modifier_group_id VARCHAR,
      external_modifier_id TEXT,
      local_modifier_id VARCHAR,
      mapping_type TEXT DEFAULT 'menu_item'::text,
      price_override NUMERIC(10,2),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS descriptor_logo_assets (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      filename TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      storage_path TEXT,
      checksum TEXT,
      escpos_data TEXT,
      created_at TIMESTAMP DEFAULT now(),
      created_by_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS descriptor_sets (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      scope_type TEXT,
      scope_id VARCHAR,
      enterprise_id VARCHAR,
      header_lines JSONB DEFAULT '[]'::jsonb,
      trailer_lines JSONB DEFAULT '[]'::jsonb,
      logo_enabled BOOLEAN DEFAULT false,
      logo_asset_id VARCHAR,
      override_header BOOLEAN DEFAULT false,
      override_trailer BOOLEAN DEFAULT false,
      override_logo BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT now(),
      updated_by_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS device_enrollment_tokens (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      token TEXT,
      device_type TEXT,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at TIMESTAMP,
      created_by_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      active BOOLEAN DEFAULT true,
      name TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS device_heartbeats (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      device_id VARCHAR,
      app_version TEXT,
      os_version TEXT,
      ip_address TEXT,
      cpu_usage NUMERIC(5,2),
      memory_usage NUMERIC(5,2),
      disk_usage NUMERIC(5,2),
      timestamp TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      device_id TEXT,
      name TEXT,
      device_type TEXT,
      os_type TEXT,
      os_version TEXT,
      hardware_model TEXT,
      serial_number TEXT,
      ip_address TEXT,
      mac_address TEXT,
      current_app_version TEXT,
      target_app_version TEXT,
      status TEXT DEFAULT 'pending'::text,
      last_seen_at TIMESTAMP,
      enrolled_at TIMESTAMP,
      auto_update BOOLEAN DEFAULT true,
      environment TEXT DEFAULT 'production'::text,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      source_config_type TEXT,
      source_config_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS discounts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      code TEXT,
      type TEXT,
      value NUMERIC(10,2),
      requires_manager_approval BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS drawer_assignments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      drawer_id VARCHAR,
      employee_id VARCHAR,
      business_date TEXT,
      status TEXT DEFAULT 'assigned'::text,
      opening_amount NUMERIC(12,2),
      expected_amount NUMERIC(12,2) DEFAULT '0'::numeric,
      actual_amount NUMERIC(12,2),
      variance NUMERIC(12,2),
      opened_at TIMESTAMP DEFAULT now(),
      closed_at TIMESTAMP,
      closed_by_id VARCHAR,
      notes TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS emc_option_flags (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      entity_type TEXT,
      entity_id VARCHAR,
      option_key TEXT,
      value_text TEXT,
      scope_level TEXT,
      scope_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS emc_sessions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id VARCHAR,
      session_token TEXT,
      expires_at TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS emc_users (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      email TEXT,
      password_hash TEXT,
      first_name TEXT,
      last_name TEXT,
      access_level TEXT DEFAULT 'property_admin'::text,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMP,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      employee_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_assignments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      is_primary BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_availability (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      property_id VARCHAR,
      day_of_week INTEGER,
      start_time TEXT,
      end_time TEXT,
      availability_type TEXT DEFAULT 'available'::text,
      effective_from TEXT,
      effective_to TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_job_codes (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      job_code_id VARCHAR,
      is_primary BOOLEAN DEFAULT false,
      pay_rate NUMERIC(10,2),
      bypass_clock_in BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_minor_status (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      date_of_birth TEXT,
      is_minor BOOLEAN DEFAULT false,
      age_category TEXT,
      work_permit_number TEXT,
      work_permit_issue_date TEXT,
      work_permit_expiration_date TEXT,
      work_permit_document_url TEXT,
      currently_in_school BOOLEAN DEFAULT true,
      school_name TEXT,
      school_end_date TEXT,
      max_daily_hours NUMERIC(4,2),
      max_weekly_hours NUMERIC(4,2),
      earliest_start_time TEXT,
      latest_end_time TEXT,
      verified_by_id VARCHAR,
      verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      employee_number TEXT,
      first_name TEXT,
      last_name TEXT,
      pin_hash TEXT,
      role_id VARCHAR,
      active BOOLEAN DEFAULT true,
      date_of_birth TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS enterprises (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT,
      code TEXT,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS family_groups (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      major_group_id VARCHAR,
      name TEXT,
      code TEXT,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS fiscal_periods (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      business_date TEXT,
      status TEXT DEFAULT 'open'::text,
      opened_at TIMESTAMP DEFAULT now(),
      closed_at TIMESTAMP,
      closed_by_id VARCHAR,
      reopened_at TIMESTAMP,
      reopened_by_id VARCHAR,
      reopen_reason TEXT,
      gross_sales NUMERIC(12,2) DEFAULT '0'::numeric,
      net_sales NUMERIC(12,2) DEFAULT '0'::numeric,
      tax_collected NUMERIC(12,2) DEFAULT '0'::numeric,
      discounts_total NUMERIC(12,2) DEFAULT '0'::numeric,
      refunds_total NUMERIC(12,2) DEFAULT '0'::numeric,
      tips_total NUMERIC(12,2) DEFAULT '0'::numeric,
      service_charges_total NUMERIC(12,2) DEFAULT '0'::numeric,
      check_count INTEGER DEFAULT 0,
      guest_count INTEGER DEFAULT 0,
      cash_expected NUMERIC(12,2) DEFAULT '0'::numeric,
      cash_actual NUMERIC(12,2),
      cash_variance NUMERIC(12,2),
      card_total NUMERIC(12,2) DEFAULT '0'::numeric,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gift_card_transactions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      gift_card_id VARCHAR,
      property_id VARCHAR,
      transaction_type TEXT,
      amount NUMERIC(12,2),
      balance_before NUMERIC(12,2),
      balance_after NUMERIC(12,2),
      check_id VARCHAR,
      check_payment_id VARCHAR,
      employee_id VARCHAR,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gift_cards (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      card_number TEXT,
      pin TEXT,
      initial_balance NUMERIC(12,2),
      current_balance NUMERIC(12,2),
      status TEXT DEFAULT 'active'::text,
      activated_at TIMESTAMP,
      activated_by_id VARCHAR,
      expires_at TIMESTAMP,
      last_used_at TIMESTAMP,
      purchaser_name TEXT,
      recipient_name TEXT,
      recipient_email TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gl_mappings (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      source_type TEXT,
      source_id VARCHAR,
      gl_account_code TEXT,
      gl_account_name TEXT,
      debit_credit TEXT DEFAULT 'credit'::text,
      description TEXT,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS idempotency_keys (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      workstation_id VARCHAR,
      operation TEXT,
      idempotency_key VARCHAR,
      response_status INTEGER,
      response_body TEXT,
      created_at TIMESTAMP DEFAULT now(),
      expires_at TIMESTAMP,
      status TEXT DEFAULT 'processing'::text,
      request_hash TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS ingredient_prefixes (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      code TEXT,
      print_name TEXT,
      price_factor NUMERIC(5,2) DEFAULT 1.00,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS inventory_items (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      name TEXT,
      sku TEXT,
      category TEXT,
      unit_type TEXT DEFAULT 'each'::text,
      unit_cost NUMERIC(10,4),
      par_level NUMERIC(10,2),
      reorder_point NUMERIC(10,2),
      reorder_quantity NUMERIC(10,2),
      vendor_id VARCHAR,
      vendor_sku TEXT,
      shelf_life_days INTEGER,
      storage_location TEXT,
      track_inventory BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      menu_item_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS inventory_stock (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      inventory_item_id VARCHAR,
      property_id VARCHAR,
      current_quantity NUMERIC(12,4) DEFAULT '0'::numeric,
      last_count_date TEXT,
      last_count_quantity NUMERIC(12,4),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS inventory_transactions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      inventory_item_id VARCHAR,
      property_id VARCHAR,
      transaction_type TEXT,
      quantity NUMERIC(12,4),
      quantity_before NUMERIC(12,4),
      quantity_after NUMERIC(12,4),
      unit_cost NUMERIC(10,4),
      total_cost NUMERIC(12,2),
      business_date TEXT,
      check_id VARCHAR,
      employee_id VARCHAR,
      reason TEXT,
      reference_number TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS item_availability (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      menu_item_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      business_date TEXT,
      initial_quantity INTEGER,
      current_quantity INTEGER,
      sold_quantity INTEGER DEFAULT 0,
      is_available BOOLEAN DEFAULT true,
      is_86ed BOOLEAN DEFAULT false,
      eighty_sixed_at TIMESTAMP,
      eighty_sixed_by_id VARCHAR,
      low_stock_threshold INTEGER DEFAULT 5,
      alert_sent BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS job_codes (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      name TEXT,
      code TEXT,
      hourly_rate NUMERIC(10,2),
      tip_mode TEXT DEFAULT 'not_eligible'::text,
      tip_pool_weight NUMERIC(5,2) DEFAULT 1.00,
      color TEXT DEFAULT '#3B82F6'::text,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      role_id VARCHAR,
      compensation_type TEXT DEFAULT 'hourly'::text,
      salary_amount NUMERIC(12,2),
      salary_period TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS kds_devices (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      station_type TEXT DEFAULT 'hot'::text,
      show_draft_items BOOLEAN DEFAULT false,
      show_sent_items_only BOOLEAN DEFAULT true,
      group_by TEXT DEFAULT 'order'::text,
      show_timers BOOLEAN DEFAULT true,
      auto_sort_by TEXT DEFAULT 'time'::text,
      allow_bump BOOLEAN DEFAULT true,
      allow_recall BOOLEAN DEFAULT true,
      allow_void_display BOOLEAN DEFAULT true,
      expo_mode BOOLEAN DEFAULT false,
      ws_channel TEXT,
      ip_address TEXT,
      is_online BOOLEAN DEFAULT false,
      last_seen_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      new_order_sound BOOLEAN DEFAULT true,
      new_order_blink_seconds INTEGER DEFAULT 5,
      color_alert_1_enabled BOOLEAN DEFAULT true,
      color_alert_1_seconds INTEGER DEFAULT 60,
      color_alert_1_color TEXT DEFAULT 'yellow'::text,
      color_alert_2_enabled BOOLEAN DEFAULT true,
      color_alert_2_seconds INTEGER DEFAULT 180,
      color_alert_2_color TEXT DEFAULT 'orange'::text,
      color_alert_3_enabled BOOLEAN DEFAULT true,
      color_alert_3_seconds INTEGER DEFAULT 300,
      color_alert_3_color TEXT DEFAULT 'red'::text,
      font_scale INTEGER DEFAULT 100,
      service_host_url TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS kds_ticket_items (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      kds_ticket_id VARCHAR,
      check_item_id VARCHAR,
      status TEXT DEFAULT 'pending'::text,
      is_ready BOOLEAN DEFAULT false,
      ready_at TIMESTAMP,
      is_modified BOOLEAN DEFAULT false,
      modified_at TIMESTAMP,
      sort_priority INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS kds_tickets (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_id VARCHAR,
      round_id VARCHAR,
      order_device_id VARCHAR,
      status TEXT DEFAULT 'draft'::text,
      bumped_at TIMESTAMP,
      bumped_by_employee_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      kds_device_id VARCHAR,
      station_type TEXT,
      rvc_id VARCHAR,
      is_preview BOOLEAN DEFAULT false,
      paid BOOLEAN DEFAULT false,
      is_recalled BOOLEAN DEFAULT false,
      recalled_at TIMESTAMP,
      subtotal NUMERIC(10,2),
      origin_device_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS labor_forecasts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      forecast_date TEXT,
      job_code_id VARCHAR,
      hourly_needs JSONB,
      total_hours_needed NUMERIC(8,2),
      projected_labor_cost NUMERIC(12,2),
      target_labor_percent NUMERIC(5,2) DEFAULT '25'::numeric,
      actual_hours_worked NUMERIC(8,2),
      actual_labor_cost NUMERIC(12,2),
      actual_labor_percent NUMERIC(5,2),
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS labor_snapshots (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      business_date TEXT,
      hour INTEGER,
      daypart TEXT,
      total_sales NUMERIC(12,2) DEFAULT '0'::numeric,
      labor_hours NUMERIC(8,2) DEFAULT '0'::numeric,
      labor_cost NUMERIC(10,2) DEFAULT '0'::numeric,
      labor_percentage NUMERIC(5,2) DEFAULT '0'::numeric,
      sales_per_labor_hour NUMERIC(10,2) DEFAULT '0'::numeric,
      headcount INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_configurations (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      api_key TEXT,
      api_key_masked TEXT,
      lfs_version TEXT,
      last_sync_at TIMESTAMP,
      last_sync_ip TEXT,
      sync_status TEXT DEFAULT 'never_connected'::text,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_sync_logs (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      sync_type TEXT,
      direction TEXT,
      record_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success'::text,
      error_message TEXT,
      lfs_ip TEXT,
      lfs_version TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_member_enrollments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      member_id VARCHAR,
      program_id VARCHAR,
      current_points INTEGER DEFAULT 0,
      lifetime_points INTEGER DEFAULT 0,
      current_tier TEXT DEFAULT 'standard'::text,
      visit_count INTEGER DEFAULT 0,
      lifetime_spend NUMERIC(12,2) DEFAULT 0,
      status TEXT DEFAULT 'active'::text,
      enrolled_at TIMESTAMP DEFAULT now(),
      last_activity_at TIMESTAMP,
      points_expiration_date TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_members (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      member_number TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      birth_date TEXT,
      status TEXT DEFAULT 'active'::text,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      property_id VARCHAR,
      enterprise_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_programs (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      name TEXT,
      program_type TEXT DEFAULT 'points'::text,
      points_per_dollar NUMERIC(5,2) DEFAULT '1'::numeric,
      minimum_points_redeem INTEGER DEFAULT 100,
      points_redemption_value NUMERIC(10,4) DEFAULT 0.01,
      visits_for_reward INTEGER DEFAULT 10,
      tier_config JSONB,
      points_expiration_days INTEGER,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      property_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      member_id VARCHAR,
      reward_id VARCHAR,
      check_id VARCHAR,
      property_id VARCHAR,
      points_used INTEGER DEFAULT 0,
      discount_applied NUMERIC(10,2),
      status TEXT DEFAULT 'applied'::text,
      employee_id VARCHAR,
      redeemed_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      program_id VARCHAR,
      name TEXT,
      description TEXT,
      reward_type TEXT DEFAULT 'discount'::text,
      points_cost INTEGER DEFAULT 0,
      discount_amount NUMERIC(10,2),
      discount_percent NUMERIC(5,2),
      free_menu_item_id VARCHAR,
      min_purchase NUMERIC(10,2),
      max_redemptions INTEGER,
      redemption_count INTEGER DEFAULT 0,
      valid_from TIMESTAMP,
      valid_until TIMESTAMP,
      tier_required TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      auto_award_at_points INTEGER,
      auto_award_once BOOLEAN DEFAULT true,
      gift_card_amount NUMERIC(10,2),
      property_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      member_id VARCHAR,
      property_id VARCHAR,
      transaction_type TEXT,
      points INTEGER DEFAULT 0,
      points_before INTEGER DEFAULT 0,
      points_after INTEGER DEFAULT 0,
      check_id VARCHAR,
      check_total NUMERIC(12,2),
      employee_id VARCHAR,
      reason TEXT,
      created_at TIMESTAMP DEFAULT now(),
      program_id VARCHAR,
      enrollment_id VARCHAR,
      visit_increment INTEGER DEFAULT 0,
      visits_before INTEGER DEFAULT 0,
      visits_after INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS major_groups (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      name TEXT,
      code TEXT,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS manager_alerts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      alert_type TEXT,
      severity TEXT DEFAULT 'warning'::text,
      title TEXT,
      message TEXT,
      employee_id VARCHAR,
      check_id VARCHAR,
      target_type TEXT,
      target_id VARCHAR,
      metadata JSONB,
      read BOOLEAN DEFAULT false,
      read_at TIMESTAMP,
      read_by_id VARCHAR,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_at TIMESTAMP,
      acknowledged_by_id VARCHAR,
      resolution TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      menu_item_id VARCHAR,
      modifier_group_id VARCHAR,
      display_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_item_recipe_ingredients (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      menu_item_id VARCHAR,
      ingredient_name TEXT,
      ingredient_category TEXT,
      default_quantity INTEGER DEFAULT 1,
      is_default BOOLEAN DEFAULT true,
      price_per_unit NUMERIC(10,2) DEFAULT 0.00,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      modifier_id VARCHAR,
      default_prefix_id VARCHAR,
      sort_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_item_slus (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      menu_item_id VARCHAR,
      slu_id VARCHAR,
      display_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_items (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      short_name TEXT,
      price NUMERIC(10,2),
      tax_group_id VARCHAR,
      print_class_id VARCHAR,
      color TEXT DEFAULT '#3B82F6'::text,
      active BOOLEAN DEFAULT true,
      major_group_id VARCHAR,
      family_group_id VARCHAR,
      menu_build_enabled BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS minor_labor_rules (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      state_code TEXT DEFAULT 'CA'::text,
      minor_age_threshold INTEGER DEFAULT 18,
      young_minor_age_threshold INTEGER DEFAULT 16,
      school_day_max_hours NUMERIC(4,2) DEFAULT 4.00,
      school_week_max_hours NUMERIC(4,2) DEFAULT 18.00,
      school_day_start_time TEXT DEFAULT '07:00'::text,
      school_day_end_time TEXT DEFAULT '19:00'::text,
      non_school_day_max_hours NUMERIC(4,2) DEFAULT 8.00,
      non_school_week_max_hours NUMERIC(4,2) DEFAULT 40.00,
      non_school_day_start_time TEXT DEFAULT '07:00'::text,
      non_school_day_end_time TEXT DEFAULT '21:00'::text,
      require_work_permit BOOLEAN DEFAULT true,
      work_permit_expiration_alert_days INTEGER DEFAULT 30,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS modifier_group_modifiers (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      modifier_group_id VARCHAR,
      modifier_id VARCHAR,
      is_default BOOLEAN DEFAULT false,
      display_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS modifier_groups (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      required BOOLEAN DEFAULT false,
      min_select INTEGER DEFAULT 0,
      max_select INTEGER DEFAULT 99,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS modifiers (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT,
      price_delta NUMERIC(10,2) DEFAULT '0'::numeric,
      active BOOLEAN DEFAULT true,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS offline_order_queue (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      workstation_id VARCHAR,
      employee_id VARCHAR,
      local_id TEXT,
      order_data JSONB,
      status TEXT DEFAULT 'pending'::text,
      sync_attempts INTEGER DEFAULT 0,
      last_sync_attempt TIMESTAMP,
      synced_check_id VARCHAR,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT now(),
      synced_at TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS online_order_sources (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      source_name TEXT,
      source_type TEXT,
      api_key_prefix TEXT,
      webhook_url TEXT,
      auto_accept BOOLEAN DEFAULT false,
      auto_confirm_minutes INTEGER DEFAULT 5,
      default_rvc_id VARCHAR,
      menu_mappings JSONB,
      commission_percent NUMERIC(5,2),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      enterprise_id VARCHAR,
      platform TEXT DEFAULT 'other'::text,
      client_id TEXT,
      client_secret TEXT,
      merchant_store_id TEXT,
      webhook_secret TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMP,
      auto_inject BOOLEAN DEFAULT false,
      default_prep_minutes INTEGER DEFAULT 15,
      default_order_type TEXT DEFAULT 'delivery'::text,
      menu_sync_status TEXT DEFAULT 'not_synced'::text,
      last_menu_sync_at TIMESTAMP,
      menu_sync_error TEXT,
      connection_status TEXT DEFAULT 'disconnected'::text,
      last_connection_test TIMESTAMP,
      sound_enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS online_orders (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      source_id VARCHAR,
      external_order_id TEXT,
      status TEXT DEFAULT 'received'::text,
      order_type TEXT DEFAULT 'pickup'::text,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      delivery_address TEXT,
      delivery_instructions TEXT,
      scheduled_time TIMESTAMP,
      estimated_prep_minutes INTEGER,
      confirmed_at TIMESTAMP,
      ready_at TIMESTAMP,
      picked_up_at TIMESTAMP,
      delivered_at TIMESTAMP,
      subtotal NUMERIC(12,2),
      tax_total NUMERIC(12,2) DEFAULT '0'::numeric,
      delivery_fee NUMERIC(10,2) DEFAULT '0'::numeric,
      service_fee NUMERIC(10,2) DEFAULT '0'::numeric,
      tip NUMERIC(10,2) DEFAULT '0'::numeric,
      total NUMERIC(12,2),
      commission NUMERIC(10,2) DEFAULT '0'::numeric,
      items JSONB,
      check_id VARCHAR,
      injected_at TIMESTAMP,
      injected_by_id VARCHAR,
      raw_payload JSONB,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS order_device_kds (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      order_device_id VARCHAR,
      kds_device_id VARCHAR,
      display_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS order_device_printers (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      order_device_id VARCHAR,
      printer_id VARCHAR,
      display_order INTEGER DEFAULT 0
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS order_devices (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      active BOOLEAN DEFAULT true,
      code TEXT,
      send_on TEXT DEFAULT 'send_button'::text,
      send_voids BOOLEAN DEFAULT true,
      send_reprints BOOLEAN DEFAULT true,
      kds_device_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS overtime_rules (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      description TEXT,
      daily_regular_hours NUMERIC(4,2) DEFAULT 8.00,
      daily_overtime_threshold NUMERIC(4,2) DEFAULT 8.00,
      daily_double_time_threshold NUMERIC(4,2),
      weekly_overtime_threshold NUMERIC(4,2) DEFAULT 40.00,
      weekly_double_time_threshold NUMERIC(4,2),
      overtime_multiplier NUMERIC(3,2) DEFAULT 1.50,
      double_time_multiplier NUMERIC(3,2) DEFAULT 2.00,
      enable_daily_overtime BOOLEAN DEFAULT true,
      enable_daily_double_time BOOLEAN DEFAULT false,
      enable_weekly_overtime BOOLEAN DEFAULT true,
      enable_weekly_double_time BOOLEAN DEFAULT false,
      week_start_day INTEGER DEFAULT 0,
      effective_date TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pay_periods (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'open'::text,
      locked_at TIMESTAMP,
      locked_by_id VARCHAR,
      exported_at TIMESTAMP,
      exported_by_id VARCHAR,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_gateway_config (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      config_level TEXT,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      workstation_id VARCHAR,
      gateway_type TEXT,
      environment TEXT,
      credential_key_prefix TEXT,
      merchant_id TEXT,
      terminal_id TEXT,
      site_id TEXT,
      device_id TEXT,
      license_id TEXT,
      enable_sale BOOLEAN DEFAULT false,
      enable_void BOOLEAN DEFAULT false,
      enable_refund BOOLEAN DEFAULT false,
      enable_auth_capture BOOLEAN DEFAULT false,
      enable_manual_entry BOOLEAN DEFAULT false,
      enable_debit BOOLEAN DEFAULT false,
      enable_ebt BOOLEAN DEFAULT false,
      enable_healthcare BOOLEAN DEFAULT false,
      enable_contactless BOOLEAN DEFAULT false,
      enable_emv BOOLEAN DEFAULT false,
      enable_msr BOOLEAN DEFAULT false,
      enable_partial_approval BOOLEAN DEFAULT false,
      enable_tokenization BOOLEAN DEFAULT false,
      enable_store_and_forward BOOLEAN DEFAULT false,
      enable_surcharge BOOLEAN DEFAULT false,
      enable_tip_adjust BOOLEAN DEFAULT false,
      enable_incremental_auth BOOLEAN DEFAULT false,
      enable_cashback BOOLEAN DEFAULT false,
      surcharge_percent TEXT,
      saf_floor_limit TEXT,
      saf_max_transactions INTEGER,
      auth_hold_minutes INTEGER,
      enable_auto_batch_close BOOLEAN DEFAULT false,
      batch_close_time TEXT,
      enable_manual_batch_close BOOLEAN DEFAULT false,
      receipt_show_emv_fields BOOLEAN DEFAULT false,
      receipt_show_aid BOOLEAN DEFAULT false,
      receipt_show_tvr BOOLEAN DEFAULT false,
      receipt_show_tsi BOOLEAN DEFAULT false,
      receipt_show_app_label BOOLEAN DEFAULT false,
      receipt_show_entry_method BOOLEAN DEFAULT false,
      receipt_print_merchant_copy BOOLEAN DEFAULT false,
      receipt_print_customer_copy BOOLEAN DEFAULT false,
      enable_debug_logging BOOLEAN DEFAULT false,
      log_raw_requests BOOLEAN DEFAULT false,
      log_raw_responses BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      integration_model TEXT,
      terminal_ip_address TEXT,
      terminal_port TEXT,
      terminal_connection_type TEXT,
      encrypted_credentials TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_processors (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      gateway_type TEXT,
      environment TEXT DEFAULT 'sandbox'::text,
      credential_key_prefix TEXT,
      gateway_settings JSONB,
      supports_tokenization BOOLEAN DEFAULT true,
      supports_tip_adjust BOOLEAN DEFAULT true,
      supports_partial_auth BOOLEAN DEFAULT false,
      supports_emv BOOLEAN DEFAULT true,
      supports_contactless BOOLEAN DEFAULT true,
      auth_hold_minutes INTEGER DEFAULT 1440,
      settlement_time TEXT DEFAULT '02:00'::text,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_transactions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_payment_id VARCHAR,
      payment_processor_id VARCHAR,
      gateway_transaction_id TEXT,
      auth_code TEXT,
      reference_number TEXT,
      card_brand TEXT,
      card_last4 TEXT,
      card_expiry_month INTEGER,
      card_expiry_year INTEGER,
      entry_mode TEXT,
      auth_amount INTEGER,
      capture_amount INTEGER,
      tip_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending'::text,
      transaction_type TEXT,
      response_code TEXT,
      response_message TEXT,
      avs_result TEXT,
      cvv_result TEXT,
      initiated_at TIMESTAMP DEFAULT now(),
      authorized_at TIMESTAMP,
      captured_at TIMESTAMP,
      settled_at TIMESTAMP,
      terminal_id TEXT,
      workstation_id VARCHAR,
      employee_id VARCHAR,
      original_transaction_id VARCHAR,
      refunded_amount INTEGER DEFAULT 0,
      batch_id TEXT,
      business_date TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pos_layout_cells (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      layout_id VARCHAR,
      row_index INTEGER,
      col_index INTEGER,
      row_span INTEGER DEFAULT 1,
      col_span INTEGER DEFAULT 1,
      menu_item_id VARCHAR,
      background_color TEXT DEFAULT '#3B82F6'::text,
      text_color TEXT DEFAULT '#FFFFFF'::text,
      display_label TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pos_layout_rvc_assignments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      layout_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      is_default BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pos_layouts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      mode TEXT DEFAULT 'slu_tabs'::text,
      grid_rows INTEGER DEFAULT 4,
      grid_cols INTEGER DEFAULT 6,
      is_default BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      font_size TEXT DEFAULT 'medium'::text
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS prep_items (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      category TEXT,
      par_level INTEGER,
      current_level INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'each'::text,
      shelf_life_hours INTEGER,
      prep_instructions TEXT,
      menu_item_ids TEXT[],
      consumption_per_item NUMERIC(5,2) DEFAULT '1'::numeric,
      last_prep_at TIMESTAMP,
      last_prep_by_id VARCHAR,
      last_prep_quantity INTEGER,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_agents (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      description TEXT,
      agent_token TEXT,
      status TEXT DEFAULT 'offline'::text,
      last_heartbeat TIMESTAMP,
      last_connected_at TIMESTAMP,
      last_disconnected_at TIMESTAMP,
      agent_version TEXT,
      hostname TEXT,
      ip_address TEXT,
      os_info TEXT,
      auto_reconnect BOOLEAN DEFAULT true,
      heartbeat_interval_ms INTEGER DEFAULT 30000,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      workstation_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_class_routing (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      print_class_id VARCHAR,
      order_device_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_classes (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      name TEXT,
      code TEXT,
      rvc_id VARCHAR,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_jobs (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      printer_id VARCHAR,
      workstation_id VARCHAR,
      job_type TEXT,
      status TEXT DEFAULT 'pending'::text,
      priority INTEGER DEFAULT 5,
      check_id VARCHAR,
      employee_id VARCHAR,
      business_date TEXT,
      esc_pos_data TEXT,
      plain_text_data TEXT,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT now(),
      printed_at TIMESTAMP,
      expires_at TIMESTAMP,
      print_agent_id VARCHAR,
      printer_ip TEXT,
      printer_port INTEGER DEFAULT 9100,
      printer_name TEXT,
      sent_to_agent_at TIMESTAMP,
      leased_by VARCHAR,
      leased_until TIMESTAMP,
      dedupe_key VARCHAR,
      origin_device_id VARCHAR,
      connection_type TEXT DEFAULT 'network'::text,
      com_port TEXT,
      baud_rate INTEGER,
      windows_printer_name TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS printers (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      printer_type TEXT DEFAULT 'kitchen'::text,
      connection_type TEXT DEFAULT 'network'::text,
      ip_address TEXT,
      port INTEGER DEFAULT 9100,
      driver_protocol TEXT DEFAULT 'epson'::text,
      character_width INTEGER DEFAULT 42,
      auto_cut BOOLEAN DEFAULT true,
      print_logo BOOLEAN DEFAULT false,
      print_order_header BOOLEAN DEFAULT true,
      print_order_footer BOOLEAN DEFAULT true,
      print_voids BOOLEAN DEFAULT true,
      print_reprints BOOLEAN DEFAULT true,
      retry_attempts INTEGER DEFAULT 3,
      failure_handling_mode TEXT DEFAULT 'alert_cashier'::text,
      is_online BOOLEAN DEFAULT false,
      last_seen_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      model TEXT,
      subnet_mask TEXT DEFAULT '255.255.255.0'::text,
      com_port TEXT,
      baud_rate INTEGER DEFAULT 9600,
      host_workstation_id VARCHAR,
      windows_printer_name TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS privileges (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      code TEXT,
      name TEXT,
      description TEXT,
      domain TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS properties (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      name TEXT,
      code TEXT,
      address TEXT,
      timezone TEXT DEFAULT 'America/New_York'::text,
      active BOOLEAN DEFAULT true,
      business_date_rollover_time TEXT DEFAULT '04:00'::text,
      business_date_mode TEXT DEFAULT 'auto'::text,
      current_business_date TEXT,
      sign_in_logo_url TEXT,
      auto_clock_out_enabled BOOLEAN DEFAULT false,
      caps_workstation_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS recipes (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      menu_item_id VARCHAR,
      inventory_item_id VARCHAR,
      quantity NUMERIC(10,4),
      unit_type TEXT,
      waste_percent NUMERIC(5,2) DEFAULT '0'::numeric
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS refund_items (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      refund_id VARCHAR,
      original_check_item_id VARCHAR,
      menu_item_name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price NUMERIC(10,2),
      modifiers JSONB,
      tax_amount NUMERIC(10,2) DEFAULT '0'::numeric,
      refund_amount NUMERIC(10,2)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS refund_payments (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      refund_id VARCHAR,
      original_payment_id VARCHAR,
      tender_id VARCHAR,
      tender_name TEXT,
      amount NUMERIC(10,2),
      gateway_refund_id TEXT,
      gateway_status TEXT,
      gateway_message TEXT,
      refund_method TEXT DEFAULT 'manual'::text
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS refunds (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      refund_number INTEGER,
      rvc_id VARCHAR,
      original_check_id VARCHAR,
      original_check_number INTEGER,
      refund_type TEXT,
      subtotal NUMERIC(10,2),
      tax_total NUMERIC(10,2),
      total NUMERIC(10,2),
      reason TEXT,
      processed_by_employee_id VARCHAR,
      manager_approval_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      business_date TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS registered_devices (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      device_type TEXT,
      workstation_id VARCHAR,
      kds_device_id VARCHAR,
      name TEXT,
      enrollment_code TEXT,
      enrollment_code_expires_at TIMESTAMP,
      device_token TEXT,
      device_token_hash TEXT,
      status TEXT DEFAULT 'pending'::text,
      enrolled_at TIMESTAMP,
      last_access_at TIMESTAMP,
      os_info TEXT,
      browser_info TEXT,
      screen_resolution TEXT,
      serial_number TEXT,
      asset_tag TEXT,
      mac_address TEXT,
      ip_address TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      created_by_employee_id VARCHAR,
      disabled_at TIMESTAMP,
      disabled_by_employee_id VARCHAR,
      disabled_reason TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS role_privileges (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      role_id VARCHAR,
      privilege_code TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS role_rules (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      role_id VARCHAR,
      enterprise_id VARCHAR,
      max_item_discount_pct INTEGER DEFAULT 0,
      max_check_discount_pct INTEGER DEFAULT 0,
      max_item_discount_amt NUMERIC(10,2) DEFAULT 0,
      max_check_discount_amt NUMERIC(10,2) DEFAULT 0,
      max_price_override_pct_down INTEGER DEFAULT 0,
      max_price_override_amt_down NUMERIC(10,2) DEFAULT 0,
      reopen_window_minutes INTEGER DEFAULT 0,
      edit_closed_window_minutes INTEGER DEFAULT 0,
      refund_window_minutes INTEGER DEFAULT 0,
      bypass_windows_allowed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      code TEXT,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS rounds (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      check_id VARCHAR,
      round_number INTEGER,
      sent_at TIMESTAMP DEFAULT now(),
      sent_by_employee_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS rvc_counters (
      rvc_id VARCHAR,
      next_check_number INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS rvcs (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      code TEXT,
      fast_transaction_default BOOLEAN DEFAULT false,
      default_order_type TEXT DEFAULT 'dine_in'::text,
      order_type_default TEXT DEFAULT 'dine_in'::text,
      active BOOLEAN DEFAULT true,
      dynamic_order_mode BOOLEAN DEFAULT false,
      dom_send_mode TEXT DEFAULT 'fire_on_fly'::text,
      conversational_ordering_enabled BOOLEAN DEFAULT false,
      receipt_print_mode TEXT DEFAULT 'auto_on_close'::text,
      receipt_copies INTEGER DEFAULT 1,
      kitchen_print_mode TEXT DEFAULT 'auto_on_send'::text,
      void_receipt_print BOOLEAN DEFAULT true,
      require_guest_count BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS safe_counts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      business_date TEXT,
      count_type TEXT DEFAULT 'daily'::text,
      expected_amount NUMERIC(12,2),
      actual_amount NUMERIC(12,2),
      variance NUMERIC(12,2),
      denominations JSONB,
      notes TEXT,
      verified_by_id VARCHAR,
      verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS sales_forecasts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      forecast_date TEXT,
      day_of_week INTEGER,
      hourly_projections JSONB,
      projected_sales NUMERIC(12,2),
      projected_guests INTEGER,
      projected_checks INTEGER,
      actual_sales NUMERIC(12,2),
      actual_guests INTEGER,
      actual_checks INTEGER,
      model_version TEXT,
      confidence NUMERIC(5,2),
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_charges (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      code TEXT,
      type TEXT,
      value NUMERIC(10,2),
      auto_apply BOOLEAN DEFAULT false,
      order_types TEXT[],
      active BOOLEAN DEFAULT true,
      is_taxable BOOLEAN DEFAULT false,
      tax_group_id VARCHAR,
      revenue_category TEXT DEFAULT 'revenue'::text,
      post_to_tip_pool BOOLEAN DEFAULT false,
      tip_eligible BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_alert_rules (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      alert_type TEXT,
      severity TEXT DEFAULT 'warning'::text,
      enabled BOOLEAN DEFAULT true,
      threshold_value INTEGER,
      threshold_duration_minutes INTEGER,
      notify_email BOOLEAN DEFAULT true,
      notify_sms BOOLEAN DEFAULT false,
      email_recipients JSONB DEFAULT '[]'::jsonb,
      sms_recipients JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_alerts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      service_host_id VARCHAR,
      property_id VARCHAR,
      alert_type TEXT,
      severity TEXT DEFAULT 'warning'::text,
      message TEXT,
      details JSONB,
      triggered_at TIMESTAMP DEFAULT now(),
      acknowledged_at TIMESTAMP,
      acknowledged_by_id VARCHAR,
      resolved_at TIMESTAMP,
      notifications_sent BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE SEQUENCE IF NOT EXISTS service_host_metrics_id_seq`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_metrics (
      id INTEGER DEFAULT nextval('service_host_metrics_id_seq'::regclass) PRIMARY KEY,
      service_host_id VARCHAR,
      recorded_at TIMESTAMP DEFAULT now(),
      connection_mode TEXT DEFAULT 'green'::text,
      connected_workstations INTEGER DEFAULT 0,
      pending_sync_items INTEGER DEFAULT 0,
      cpu_usage_percent INTEGER,
      memory_usage_mb INTEGER,
      disk_usage_percent INTEGER,
      disk_free_gb real,
      uptime INTEGER
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_transactions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      service_host_id VARCHAR,
      property_id VARCHAR,
      local_id VARCHAR,
      transaction_type VARCHAR,
      business_date TEXT,
      data JSONB,
      processed_at TIMESTAMP DEFAULT now(),
      cloud_entity_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_hosts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      name TEXT,
      workstation_id VARCHAR,
      status TEXT DEFAULT 'offline'::text,
      last_heartbeat_at TIMESTAMP,
      version VARCHAR,
      services JSONB DEFAULT '[]'::jsonb,
      registration_token VARCHAR,
      registration_token_used BOOLEAN DEFAULT false,
      encryption_key_hash VARCHAR,
      hostname TEXT,
      ip_address TEXT,
      active_checks INTEGER DEFAULT 0,
      pending_transactions INTEGER DEFAULT 0,
      local_config_version INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      service_type TEXT DEFAULT 'caps'::text,
      host_workstation_id VARCHAR,
      service_config JSONB,
      connected_device_ids JSONB DEFAULT '[]'::jsonb
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_cover_approvals (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      cover_request_id VARCHAR,
      offer_id VARCHAR,
      approved_by_id VARCHAR,
      approved BOOLEAN,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_cover_offers (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      cover_request_id VARCHAR,
      offerer_id VARCHAR,
      notes TEXT,
      status TEXT DEFAULT 'pending'::text,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_cover_requests (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      shift_id VARCHAR,
      requester_id VARCHAR,
      reason TEXT,
      status TEXT DEFAULT 'open'::text,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_templates (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      job_code_id VARCHAR,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER DEFAULT 0,
      color TEXT,
      notes TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      employee_id VARCHAR,
      job_code_id VARCHAR,
      template_id VARCHAR,
      shift_date TEXT,
      start_time TEXT,
      end_time TEXT,
      scheduled_break_minutes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft'::text,
      notes TEXT,
      published_at TIMESTAMP,
      published_by_id VARCHAR,
      acknowledged_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS slus (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      button_label TEXT,
      display_order INTEGER DEFAULT 0,
      color TEXT DEFAULT '#3B82F6'::text,
      active BOOLEAN DEFAULT true
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS stress_test_results (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      employee_id VARCHAR,
      status TEXT,
      duration_minutes INTEGER,
      target_tx_per_minute INTEGER,
      patterns TEXT[],
      total_transactions INTEGER DEFAULT 0,
      successful_transactions INTEGER DEFAULT 0,
      failed_transactions INTEGER DEFAULT 0,
      avg_transaction_ms INTEGER,
      min_transaction_ms INTEGER,
      max_transaction_ms INTEGER,
      actual_tx_per_minute NUMERIC(10,4),
      elapsed_seconds INTEGER,
      errors TEXT[],
      started_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS sync_notifications (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      enterprise_id VARCHAR,
      service_host_id VARCHAR,
      category TEXT,
      severity TEXT DEFAULT 'info'::text,
      title TEXT,
      message TEXT,
      metadata JSONB,
      read BOOLEAN DEFAULT false,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tax_groups (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      rate NUMERIC(5,4),
      active BOOLEAN DEFAULT true,
      tax_mode TEXT DEFAULT 'add_on'::text
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tenders (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      code TEXT,
      type TEXT,
      active BOOLEAN DEFAULT true,
      payment_processor_id VARCHAR,
      is_system BOOLEAN DEFAULT false,
      pop_drawer BOOLEAN DEFAULT false,
      allow_tips BOOLEAN DEFAULT false,
      allow_over_tender BOOLEAN DEFAULT false,
      print_check_on_payment BOOLEAN DEFAULT true,
      require_manager_approval BOOLEAN DEFAULT false,
      requires_payment_processor BOOLEAN DEFAULT false,
      display_order INTEGER DEFAULT 0,
      is_cash_media BOOLEAN DEFAULT false,
      is_card_media BOOLEAN DEFAULT false,
      is_gift_media BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS terminal_devices (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      payment_processor_id VARCHAR,
      workstation_id VARCHAR,
      name TEXT,
      model TEXT,
      serial_number TEXT,
      terminal_id TEXT,
      connection_type TEXT DEFAULT 'ethernet'::text,
      network_address TEXT,
      port INTEGER,
      cloud_device_id TEXT,
      status TEXT DEFAULT 'offline'::text,
      last_heartbeat TIMESTAMP,
      capabilities JSONB,
      firmware_version TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      supports_store_and_forward BOOLEAN DEFAULT false
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS terminal_sessions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      terminal_device_id VARCHAR,
      check_id VARCHAR,
      tender_id VARCHAR,
      employee_id VARCHAR,
      workstation_id VARCHAR,
      amount INTEGER,
      tip_amount INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'usd'::text,
      status TEXT DEFAULT 'pending'::text,
      status_message TEXT,
      processor_reference TEXT,
      payment_transaction_id VARCHAR,
      initiated_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP,
      expires_at TIMESTAMP,
      metadata JSONB
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS time_off_requests (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      employee_id VARCHAR,
      property_id VARCHAR,
      start_date TEXT,
      end_date TEXT,
      request_type TEXT DEFAULT 'pto'::text,
      reason_code TEXT,
      notes TEXT,
      status TEXT DEFAULT 'submitted'::text,
      reviewed_by_id VARCHAR,
      reviewed_at TIMESTAMP,
      review_notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS time_punches (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      job_code_id VARCHAR,
      punch_type TEXT,
      actual_timestamp TIMESTAMP,
      rounded_timestamp TIMESTAMP,
      business_date TEXT,
      source TEXT DEFAULT 'pos'::text,
      notes TEXT,
      is_edited BOOLEAN DEFAULT false,
      original_timestamp TIMESTAMP,
      edited_by_id VARCHAR,
      edited_at TIMESTAMP,
      edit_reason TEXT,
      voided BOOLEAN DEFAULT false,
      voided_by_id VARCHAR,
      voided_at TIMESTAMP,
      void_reason TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS timecard_edits (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      target_type TEXT,
      target_id VARCHAR,
      edit_type TEXT,
      before_value JSONB,
      after_value JSONB,
      reason_code TEXT,
      notes TEXT,
      edited_by_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      edited_by_emc_user_id VARCHAR,
      edited_by_display_name TEXT
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS timecard_exceptions (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      timecard_id VARCHAR,
      time_punch_id VARCHAR,
      exception_type TEXT,
      business_date TEXT,
      description TEXT,
      severity TEXT DEFAULT 'warning'::text,
      status TEXT DEFAULT 'pending'::text,
      resolved_by_id VARCHAR,
      resolved_at TIMESTAMP,
      resolution_notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS timecards (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      employee_id VARCHAR,
      pay_period_id VARCHAR,
      business_date TEXT,
      job_code_id VARCHAR,
      clock_in_time TIMESTAMP,
      clock_out_time TIMESTAMP,
      regular_hours NUMERIC(6,2) DEFAULT '0'::numeric,
      overtime_hours NUMERIC(6,2) DEFAULT '0'::numeric,
      double_time_hours NUMERIC(6,2) DEFAULT '0'::numeric,
      break_minutes INTEGER DEFAULT 0,
      paid_break_minutes INTEGER DEFAULT 0,
      unpaid_break_minutes INTEGER DEFAULT 0,
      total_hours NUMERIC(6,2) DEFAULT '0'::numeric,
      regular_pay NUMERIC(10,2) DEFAULT '0'::numeric,
      overtime_pay NUMERIC(10,2) DEFAULT '0'::numeric,
      total_pay NUMERIC(10,2) DEFAULT '0'::numeric,
      tips NUMERIC(10,2) DEFAULT '0'::numeric,
      status TEXT DEFAULT 'open'::text,
      approved_by_id VARCHAR,
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      pay_rate NUMERIC(10,2)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_allocations (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      tip_pool_run_id VARCHAR,
      employee_id VARCHAR,
      hours_worked NUMERIC(6,2) DEFAULT '0'::numeric,
      points_earned NUMERIC(6,2) DEFAULT '0'::numeric,
      share_percentage NUMERIC(5,2) DEFAULT '0'::numeric,
      allocated_amount NUMERIC(10,2) DEFAULT '0'::numeric,
      direct_tips NUMERIC(10,2) DEFAULT '0'::numeric,
      total_tips NUMERIC(10,2) DEFAULT '0'::numeric,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_pool_policies (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      calculation_method TEXT DEFAULT 'hours_worked'::text,
      role_weights JSONB,
      excluded_job_code_ids TEXT[],
      exclude_managers BOOLEAN DEFAULT true,
      exclude_training BOOLEAN DEFAULT true,
      minimum_hours_required NUMERIC(4,2) DEFAULT '0'::numeric,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_pool_runs (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      policy_id VARCHAR,
      business_date TEXT,
      total_tips NUMERIC(10,2) DEFAULT '0'::numeric,
      total_hours NUMERIC(10,2) DEFAULT '0'::numeric,
      participant_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending'::text,
      run_by_id VARCHAR,
      run_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_rule_job_percentages (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      tip_rule_id VARCHAR,
      job_code_id VARCHAR,
      percentage NUMERIC(5,2) DEFAULT '0'::numeric,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_rules (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT DEFAULT 'Default Tip Rules'::text,
      distribution_method TEXT DEFAULT 'tip_directly'::text,
      timeframe TEXT DEFAULT 'daily'::text,
      applies_to_all_locations BOOLEAN DEFAULT false,
      declare_cash_tips BOOLEAN DEFAULT false,
      declare_cash_tips_all_locations BOOLEAN DEFAULT false,
      exclude_managers BOOLEAN DEFAULT true,
      minimum_hours_for_pool NUMERIC(4,2) DEFAULT '0'::numeric,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS workstation_order_devices (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      workstation_id VARCHAR,
      order_device_id VARCHAR
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS workstation_service_bindings (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      workstation_id VARCHAR,
      service_type TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS workstations (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT,
      device_type TEXT DEFAULT 'pos_terminal'::text,
      default_order_type TEXT DEFAULT 'dine_in'::text,
      fast_transaction_enabled BOOLEAN DEFAULT false,
      require_begin_check BOOLEAN DEFAULT true,
      allow_pickup_check BOOLEAN DEFAULT true,
      allow_reopen_closed_checks BOOLEAN DEFAULT false,
      allow_offline_operation BOOLEAN DEFAULT false,
      allowed_role_ids TEXT[],
      manager_approval_device BOOLEAN DEFAULT false,
      clock_in_allowed BOOLEAN DEFAULT true,
      default_receipt_printer_id VARCHAR,
      backup_receipt_printer_id VARCHAR,
      default_order_device_id VARCHAR,
      default_kds_expo_id VARCHAR,
      ip_address TEXT,
      hostname TEXT,
      is_online BOOLEAN DEFAULT false,
      last_seen_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      report_printer_id VARCHAR,
      backup_report_printer_id VARCHAR,
      void_printer_id VARCHAR,
      backup_void_printer_id VARCHAR,
      auto_logout_minutes INTEGER,
      service_host_url TEXT,
      service_bindings TEXT[],
      setup_status TEXT DEFAULT 'pending'::text,
      last_setup_at TIMESTAMP,
      last_setup_by VARCHAR,
      installed_services TEXT[],
      device_token TEXT,
      registered_device_id VARCHAR,
      font_scale INTEGER DEFAULT 100,
      cash_drawer_enabled BOOLEAN DEFAULT false,
      cash_drawer_printer_id VARCHAR,
      cash_drawer_kick_pin TEXT DEFAULT 'pin2'::text,
      cash_drawer_pulse_duration INTEGER DEFAULT 100,
      cash_drawer_auto_open_on_cash BOOLEAN DEFAULT true,
      cash_drawer_auto_open_on_drop BOOLEAN DEFAULT true,
      com_port TEXT,
      com_baud_rate INTEGER DEFAULT 9600,
      com_data_bits INTEGER DEFAULT 8,
      com_stop_bits TEXT DEFAULT '1'::text,
      com_parity TEXT DEFAULT 'none'::text,
      com_flow_control TEXT DEFAULT 'none'::text,
      offline_check_number_start INTEGER,
      offline_check_number_end INTEGER
    );`);


    await client.query(`CREATE TABLE IF NOT EXISTS lfs_sync_status (
      table_name TEXT PRIMARY KEY,
      last_synced_at TIMESTAMP,
      record_count INTEGER DEFAULT 0
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_offline_sequence (
      workstation_id VARCHAR PRIMARY KEY,
      current_number INTEGER NOT NULL DEFAULT 0,
      range_start INTEGER NOT NULL DEFAULT 0,
      range_end INTEGER NOT NULL DEFAULT 0
    )`);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'lfs_offline_sequence' AND column_name = 'workstation_id'
        ) THEN
          DROP TABLE IF EXISTS lfs_offline_sequence;
          CREATE TABLE lfs_offline_sequence (
            workstation_id VARCHAR PRIMARY KEY,
            current_number INTEGER NOT NULL DEFAULT 0,
            range_start INTEGER NOT NULL DEFAULT 0,
            range_end INTEGER NOT NULL DEFAULT 0
          );
        END IF;
      END $$;
    `);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_transaction_journal (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id VARCHAR NOT NULL,
      operation TEXT NOT NULL,
      data JSONB,
      synced BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now(),
      synced_at TIMESTAMP,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_config_cache (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      config_key TEXT NOT NULL,
      config_value JSONB,
      source TEXT DEFAULT 'cloud',
      cached_at TIMESTAMP DEFAULT now(),
      expires_at TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_sync_queue (
      id VARCHAR DEFAULT gen_random_uuid() PRIMARY KEY,
      direction TEXT DEFAULT 'up',
      table_name TEXT NOT NULL,
      record_id VARCHAR,
      operation TEXT NOT NULL,
      payload JSONB,
      priority INTEGER DEFAULT 5,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      last_attempt_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_schema_version (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL,
      applied_at TIMESTAMP DEFAULT now(),
      description TEXT
    )`);

    await client.query(`
      INSERT INTO lfs_schema_version (id, version, description)
      VALUES (1, 2, 'Full cloud-parity schema with LFS tables')
      ON CONFLICT (id) DO UPDATE SET version = 2, applied_at = now(), description = 'Full cloud-parity schema with LFS tables'
    `);

    await client.query("COMMIT");
    console.log("[LFS] Schema migration complete — all tables created");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
