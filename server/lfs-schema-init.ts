import type pg from "pg";

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ========================================================================
    // CREATE ALL TABLES (auto-generated from shared/schema.ts Drizzle defs)
    // Schema version: 4 | Tables: 144
    // DO NOT EDIT BY HAND - regenerate with: npx tsx _gen_schema.ts
    // ========================================================================

    await client.query(`CREATE TABLE IF NOT EXISTS accounting_exports (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      export_type TEXT NOT NULL DEFAULT 'daily',
      format_type TEXT NOT NULL DEFAULT 'csv',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      generated_at TIMESTAMP,
      generated_by_id VARCHAR,
      download_url TEXT,
      error_message TEXT,
      total_revenue NUMERIC(12,2),
      total_tax NUMERIC(12,2),
      total_labor NUMERIC(12,2),
      row_count INTEGER,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      property_id VARCHAR,
      alert_type TEXT NOT NULL,
      severity TEXT,
      notify_email BOOLEAN DEFAULT false,
      notify_sms BOOLEAN DEFAULT false,
      notify_push BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      rvc_id VARCHAR,
      employee_id VARCHAR,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id VARCHAR NOT NULL,
      details JSONB,
      reason_code TEXT,
      manager_approval_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS availability_exceptions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      property_id VARCHAR,
      exception_date TEXT NOT NULL,
      is_available BOOLEAN DEFAULT false,
      start_time TEXT,
      end_time TEXT,
      reason TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_attestations (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      timecard_id VARCHAR,
      business_date TEXT NOT NULL,
      attestation_type TEXT NOT NULL DEFAULT 'clock_out',
      breaks_provided BOOLEAN NOT NULL,
      missed_meal_break BOOLEAN DEFAULT false,
      missed_rest_break BOOLEAN DEFAULT false,
      missed_break_reason TEXT,
      employee_signature TEXT,
      attested_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_rules (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL DEFAULT 'California Break Rules',
      state_code TEXT NOT NULL DEFAULT 'CA',
      enable_meal_break_enforcement BOOLEAN DEFAULT true,
      meal_break_minutes INTEGER DEFAULT 30,
      meal_break_threshold_hours NUMERIC(4,2) DEFAULT '5.00',
      second_meal_break_threshold_hours NUMERIC(4,2) DEFAULT '10.00',
      allow_meal_break_waiver BOOLEAN DEFAULT true,
      meal_waiver_max_shift_hours NUMERIC(4,2) DEFAULT '6.00',
      enable_rest_break_enforcement BOOLEAN DEFAULT true,
      rest_break_minutes INTEGER DEFAULT 10,
      rest_break_interval_hours NUMERIC(4,2) DEFAULT '4.00',
      rest_break_is_paid BOOLEAN DEFAULT true,
      enable_premium_pay BOOLEAN DEFAULT true,
      meal_break_premium_hours NUMERIC(4,2) DEFAULT '1.00',
      rest_break_premium_hours NUMERIC(4,2) DEFAULT '1.00',
      require_clock_out_attestation BOOLEAN DEFAULT true,
      attestation_message TEXT DEFAULT 'I confirm that I was provided with all required meal and rest breaks during my shift.',
      enable_break_alerts BOOLEAN DEFAULT true,
      alert_minutes_before_deadline INTEGER DEFAULT 15,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_sessions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      business_date TEXT NOT NULL,
      break_type TEXT DEFAULT 'unpaid',
      start_punch_id VARCHAR,
      end_punch_id VARCHAR,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP,
      scheduled_minutes INTEGER,
      actual_minutes INTEGER,
      is_paid BOOLEAN DEFAULT false,
      is_violation BOOLEAN DEFAULT false,
      violation_notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS break_violations (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      timecard_id VARCHAR,
      break_session_id VARCHAR,
      business_date TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      violation_reason TEXT,
      shift_start_time TIMESTAMP,
      shift_end_time TIMESTAMP,
      hours_worked NUMERIC(6,2),
      break_deadline_time TIMESTAMP,
      premium_pay_hours NUMERIC(4,2) DEFAULT '1.00',
      premium_pay_rate NUMERIC(8,2),
      premium_pay_amount NUMERIC(10,2),
      status TEXT DEFAULT 'pending',
      acknowledged_by_id VARCHAR,
      acknowledged_at TIMESTAMP,
      paid_in_payroll_date TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_deployment_targets (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      deployment_id VARCHAR NOT NULL,
      property_id VARCHAR,
      workstation_id VARCHAR,
      service_host_id VARCHAR,
      status TEXT DEFAULT 'pending',
      status_message TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      retry_count INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_deployments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      package_version_id VARCHAR NOT NULL,
      deployment_scope TEXT NOT NULL,
      target_property_id VARCHAR,
      target_workstation_id VARCHAR,
      target_service_host_id VARCHAR,
      action TEXT NOT NULL DEFAULT 'install',
      scheduled_at TIMESTAMP,
      expires_at TIMESTAMP,
      created_by_id VARCHAR,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_package_prerequisites (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      package_version_id VARCHAR NOT NULL,
      prerequisite_package_id VARCHAR NOT NULL,
      min_version TEXT,
      install_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_package_versions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      package_id VARCHAR NOT NULL,
      version TEXT NOT NULL,
      release_notes TEXT,
      download_url TEXT,
      checksum TEXT,
      file_size INTEGER,
      min_os_version TEXT,
      is_latest BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      released_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cal_packages (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      package_type TEXT NOT NULL,
      description TEXT,
      is_system BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cash_drawers (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      workstation_id VARCHAR,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS cash_transactions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      drawer_id VARCHAR,
      assignment_id VARCHAR,
      employee_id VARCHAR NOT NULL,
      transaction_type TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      business_date TEXT NOT NULL,
      check_id VARCHAR,
      reason TEXT,
      manager_approval_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_discounts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_id VARCHAR NOT NULL,
      discount_id VARCHAR NOT NULL,
      discount_name TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      applied_at TIMESTAMP DEFAULT now(),
      employee_id VARCHAR,
      manager_approval_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_items (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_id VARCHAR NOT NULL,
      round_id VARCHAR,
      menu_item_id VARCHAR,
      menu_item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price NUMERIC(10,2) NOT NULL,
      modifiers JSONB,
      item_status TEXT NOT NULL DEFAULT 'active',
      sent BOOLEAN DEFAULT false,
      voided BOOLEAN DEFAULT false,
      void_reason TEXT,
      voided_by_employee_id VARCHAR,
      voided_at TIMESTAMP,
      added_at TIMESTAMP DEFAULT now(),
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
      offline_transaction_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_locks (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_id VARCHAR NOT NULL UNIQUE,
      workstation_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      lock_mode TEXT NOT NULL DEFAULT 'green',
      acquired_at TIMESTAMP DEFAULT now(),
      expires_at TIMESTAMP NOT NULL,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_payments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_id VARCHAR NOT NULL,
      tender_id VARCHAR NOT NULL,
      tender_name TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      paid_at TIMESTAMP DEFAULT now(),
      employee_id VARCHAR,
      business_date TEXT,
      payment_transaction_id VARCHAR,
      payment_status TEXT DEFAULT 'completed',
      tip_amount NUMERIC(10,2),
      origin_device_id VARCHAR,
      payment_attempt_id VARCHAR,
      offline_transaction_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS check_service_charges (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR NOT NULL,
      check_id VARCHAR NOT NULL,
      service_charge_id VARCHAR NOT NULL,
      name_at_sale TEXT NOT NULL,
      code_at_sale TEXT,
      is_taxable_at_sale BOOLEAN NOT NULL DEFAULT false,
      tax_rate_at_sale NUMERIC(8,5),
      amount NUMERIC(12,2) NOT NULL,
      taxable_amount NUMERIC(12,2) NOT NULL DEFAULT '0',
      tax_amount NUMERIC(12,2) NOT NULL DEFAULT '0',
      auto_applied BOOLEAN NOT NULL DEFAULT false,
      applied_at TIMESTAMP NOT NULL DEFAULT now(),
      applied_by_employee_id VARCHAR,
      business_date TEXT NOT NULL,
      origin_device_id TEXT,
      voided BOOLEAN NOT NULL DEFAULT false,
      voided_at TIMESTAMP,
      voided_by_employee_id VARCHAR,
      void_reason TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS checks (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_number INTEGER NOT NULL,
      rvc_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      customer_id VARCHAR,
      order_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      subtotal NUMERIC(10,2) DEFAULT '0',
      tax_total NUMERIC(10,2) DEFAULT '0',
      discount_total NUMERIC(10,2) DEFAULT '0',
      service_charge_total NUMERIC(10,2) DEFAULT '0',
      tip_total NUMERIC(10,2) DEFAULT '0',
      total NUMERIC(10,2) DEFAULT '0',
      guest_count INTEGER DEFAULT 1,
      table_number TEXT,
      opened_at TIMESTAMP DEFAULT now(),
      closed_at TIMESTAMP,
      origin_business_date TEXT,
      business_date TEXT,
      loyalty_points_earned INTEGER,
      loyalty_points_redeemed INTEGER,
      test_mode BOOLEAN DEFAULT false,
      fulfillment_status TEXT,
      online_order_id VARCHAR,
      customer_name TEXT,
      platform_source TEXT,
      origin_device_id VARCHAR,
      origin_created_at TIMESTAMP,
      offline_transaction_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS config_overrides (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      entity_type TEXT NOT NULL,
      source_item_id TEXT NOT NULL,
      override_item_id TEXT NOT NULL,
      override_level TEXT NOT NULL,
      override_scope_id TEXT NOT NULL,
      enterprise_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS config_versions (
      id SERIAL PRIMARY KEY,
      property_id VARCHAR NOT NULL,
      version INTEGER NOT NULL,
      table_name VARCHAR(50) NOT NULL,
      entity_id VARCHAR NOT NULL,
      operation VARCHAR(10) NOT NULL,
      data JSONB,
      created_at TIMESTAMP DEFAULT now()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS delivery_platform_item_mappings (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      source_id VARCHAR NOT NULL,
      external_item_id TEXT NOT NULL,
      external_item_name TEXT,
      local_menu_item_id VARCHAR,
      local_menu_item_name TEXT,
      external_modifier_group_id TEXT,
      local_modifier_group_id VARCHAR,
      external_modifier_id TEXT,
      local_modifier_id VARCHAR,
      mapping_type TEXT NOT NULL DEFAULT 'menu_item',
      price_override NUMERIC(10,2),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS descriptor_logo_assets (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      checksum TEXT,
      escpos_data TEXT,
      created_at TIMESTAMP DEFAULT now(),
      created_by_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS descriptor_sets (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      scope_type TEXT NOT NULL,
      scope_id VARCHAR NOT NULL,
      enterprise_id VARCHAR NOT NULL,
      header_lines JSONB DEFAULT '[]'::jsonb,
      trailer_lines JSONB DEFAULT '[]'::jsonb,
      logo_enabled BOOLEAN DEFAULT false,
      logo_asset_id VARCHAR,
      override_header BOOLEAN DEFAULT false,
      override_trailer BOOLEAN DEFAULT false,
      override_logo BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT now(),
      updated_by_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS device_enrollment_tokens (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      property_id VARCHAR,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      device_type TEXT,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at TIMESTAMP,
      created_by_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS device_heartbeats (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      device_id VARCHAR NOT NULL,
      app_version TEXT,
      os_version TEXT,
      ip_address TEXT,
      cpu_usage NUMERIC(5,2),
      memory_usage NUMERIC(5,2),
      disk_usage NUMERIC(5,2),
      timestamp TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      property_id VARCHAR,
      rvc_id VARCHAR,
      device_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      os_type TEXT,
      os_version TEXT,
      hardware_model TEXT,
      serial_number TEXT,
      ip_address TEXT,
      mac_address TEXT,
      current_app_version TEXT,
      target_app_version TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_seen_at TIMESTAMP,
      enrolled_at TIMESTAMP,
      auto_update BOOLEAN DEFAULT true,
      environment TEXT DEFAULT 'production',
      source_config_type TEXT,
      source_config_id VARCHAR,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS discounts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      value NUMERIC(10,2) NOT NULL,
      requires_manager_approval BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS drawer_assignments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      drawer_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      business_date TEXT NOT NULL,
      status TEXT DEFAULT 'assigned',
      opening_amount NUMERIC(12,2) NOT NULL,
      expected_amount NUMERIC(12,2) DEFAULT '0',
      actual_amount NUMERIC(12,2),
      variance NUMERIC(12,2),
      opened_at TIMESTAMP DEFAULT now(),
      closed_at TIMESTAMP,
      closed_by_id VARCHAR,
      notes TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS emc_option_flags (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id VARCHAR NOT NULL,
      option_key TEXT NOT NULL,
      value_text TEXT,
      scope_level TEXT NOT NULL,
      scope_id VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS emc_sessions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS emc_users (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'property_admin',
      enterprise_id VARCHAR,
      property_id VARCHAR,
      employee_id VARCHAR,
      active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMP,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_assignments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      is_primary BOOLEAN DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_availability (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      property_id VARCHAR,
      day_of_week INTEGER,
      start_time TEXT,
      end_time TEXT,
      availability_type TEXT DEFAULT 'available',
      effective_from TEXT,
      effective_to TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_job_codes (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      job_code_id VARCHAR NOT NULL,
      pay_rate NUMERIC(10,2),
      is_primary BOOLEAN DEFAULT false,
      bypass_clock_in BOOLEAN DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employee_minor_status (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      date_of_birth TEXT NOT NULL,
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
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS employees (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      employee_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT,
      pin_hash TEXT NOT NULL,
      role_id VARCHAR,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS enterprises (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS family_groups (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      major_group_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS fiscal_periods (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      business_date TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      opened_at TIMESTAMP DEFAULT now(),
      closed_at TIMESTAMP,
      closed_by_id VARCHAR,
      reopened_at TIMESTAMP,
      reopened_by_id VARCHAR,
      reopen_reason TEXT,
      gross_sales NUMERIC(12,2) DEFAULT '0',
      net_sales NUMERIC(12,2) DEFAULT '0',
      tax_collected NUMERIC(12,2) DEFAULT '0',
      discounts_total NUMERIC(12,2) DEFAULT '0',
      refunds_total NUMERIC(12,2) DEFAULT '0',
      tips_total NUMERIC(12,2) DEFAULT '0',
      service_charges_total NUMERIC(12,2) DEFAULT '0',
      check_count INTEGER DEFAULT 0,
      guest_count INTEGER DEFAULT 0,
      cash_expected NUMERIC(12,2) DEFAULT '0',
      cash_actual NUMERIC(12,2),
      cash_variance NUMERIC(12,2),
      card_total NUMERIC(12,2) DEFAULT '0',
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gift_card_transactions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      gift_card_id VARCHAR NOT NULL,
      property_id VARCHAR,
      transaction_type TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      balance_before NUMERIC(12,2) NOT NULL,
      balance_after NUMERIC(12,2) NOT NULL,
      check_id VARCHAR,
      check_payment_id VARCHAR,
      employee_id VARCHAR,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gift_cards (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      card_number TEXT NOT NULL UNIQUE,
      pin TEXT,
      initial_balance NUMERIC(12,2) NOT NULL,
      current_balance NUMERIC(12,2) NOT NULL,
      status TEXT DEFAULT 'active',
      activated_at TIMESTAMP,
      activated_by_id VARCHAR,
      expires_at TIMESTAMP,
      last_used_at TIMESTAMP,
      purchaser_name TEXT,
      recipient_name TEXT,
      recipient_email TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS gl_mappings (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      source_type TEXT NOT NULL,
      source_id VARCHAR,
      gl_account_code TEXT NOT NULL,
      gl_account_name TEXT,
      debit_credit TEXT DEFAULT 'credit',
      description TEXT,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS idempotency_keys (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      workstation_id VARCHAR NOT NULL,
      operation TEXT NOT NULL,
      idempotency_key VARCHAR NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      request_hash TEXT,
      response_status INTEGER,
      response_body TEXT,
      created_at TIMESTAMP DEFAULT now(),
      expires_at TIMESTAMP,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS ingredient_prefixes (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      print_name TEXT,
      price_factor NUMERIC(5,2) DEFAULT '1.00',
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS inventory_items (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      menu_item_id VARCHAR,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      unit_type TEXT DEFAULT 'each',
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
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS inventory_stock (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      inventory_item_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      current_quantity NUMERIC(12,4) DEFAULT '0',
      last_count_date TEXT,
      last_count_quantity NUMERIC(12,4),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS inventory_transactions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      inventory_item_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      transaction_type TEXT NOT NULL,
      quantity NUMERIC(12,4) NOT NULL,
      quantity_before NUMERIC(12,4),
      quantity_after NUMERIC(12,4),
      unit_cost NUMERIC(10,4),
      total_cost NUMERIC(12,2),
      business_date TEXT,
      check_id VARCHAR,
      employee_id VARCHAR,
      reason TEXT,
      reference_number TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS item_availability (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      menu_item_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      business_date TEXT NOT NULL,
      initial_quantity INTEGER,
      current_quantity INTEGER,
      sold_quantity INTEGER DEFAULT 0,
      is_available BOOLEAN DEFAULT true,
      is_86ed BOOLEAN DEFAULT false,
      eighty_sixed_at TIMESTAMP,
      eighty_sixed_by_id VARCHAR,
      low_stock_threshold INTEGER DEFAULT 5,
      alert_sent BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS job_codes (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      role_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      compensation_type TEXT DEFAULT 'hourly',
      hourly_rate NUMERIC(10,2),
      salary_amount NUMERIC(12,2),
      salary_period TEXT,
      tip_mode TEXT DEFAULT 'not_eligible',
      tip_pool_weight NUMERIC(5,2) DEFAULT '1.00',
      color TEXT DEFAULT '#3B82F6',
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS kds_devices (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      station_type TEXT NOT NULL DEFAULT 'hot',
      show_draft_items BOOLEAN DEFAULT false,
      show_sent_items_only BOOLEAN DEFAULT true,
      group_by TEXT DEFAULT 'order',
      show_timers BOOLEAN DEFAULT true,
      auto_sort_by TEXT DEFAULT 'time',
      allow_bump BOOLEAN DEFAULT true,
      allow_recall BOOLEAN DEFAULT true,
      allow_void_display BOOLEAN DEFAULT true,
      expo_mode BOOLEAN DEFAULT false,
      new_order_sound BOOLEAN DEFAULT true,
      new_order_blink_seconds INTEGER DEFAULT 5,
      color_alert_1_enabled BOOLEAN DEFAULT true,
      color_alert_1_seconds INTEGER DEFAULT 60,
      color_alert_1_color TEXT DEFAULT 'yellow',
      color_alert_2_enabled BOOLEAN DEFAULT true,
      color_alert_2_seconds INTEGER DEFAULT 180,
      color_alert_2_color TEXT DEFAULT 'orange',
      color_alert_3_enabled BOOLEAN DEFAULT true,
      color_alert_3_seconds INTEGER DEFAULT 300,
      color_alert_3_color TEXT DEFAULT 'red',
      font_scale INTEGER DEFAULT 100,
      ws_channel TEXT,
      ip_address TEXT,
      service_host_url TEXT,
      is_online BOOLEAN DEFAULT false,
      last_seen_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS kds_ticket_items (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      kds_ticket_id VARCHAR NOT NULL,
      check_item_id VARCHAR NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      is_ready BOOLEAN DEFAULT false,
      ready_at TIMESTAMP,
      is_modified BOOLEAN DEFAULT false,
      modified_at TIMESTAMP,
      sort_priority INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS kds_tickets (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_id VARCHAR NOT NULL,
      round_id VARCHAR,
      order_device_id VARCHAR,
      kds_device_id VARCHAR,
      station_type TEXT,
      rvc_id VARCHAR,
      status TEXT NOT NULL DEFAULT 'draft',
      is_preview BOOLEAN DEFAULT false,
      paid BOOLEAN DEFAULT false,
      is_recalled BOOLEAN DEFAULT false,
      recalled_at TIMESTAMP,
      bumped_at TIMESTAMP,
      bumped_by_employee_id VARCHAR,
      subtotal NUMERIC(10,2),
      origin_device_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS labor_forecasts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      forecast_date TEXT NOT NULL,
      job_code_id VARCHAR,
      hourly_needs JSONB,
      total_hours_needed NUMERIC(8,2),
      projected_labor_cost NUMERIC(12,2),
      target_labor_percent NUMERIC(5,2) DEFAULT '25',
      actual_hours_worked NUMERIC(8,2),
      actual_labor_cost NUMERIC(12,2),
      actual_labor_percent NUMERIC(5,2),
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS labor_snapshots (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      business_date TEXT NOT NULL,
      hour INTEGER,
      daypart TEXT,
      total_sales NUMERIC(12,2) DEFAULT '0',
      labor_hours NUMERIC(8,2) DEFAULT '0',
      labor_cost NUMERIC(10,2) DEFAULT '0',
      labor_percentage NUMERIC(5,2) DEFAULT '0',
      sales_per_labor_hour NUMERIC(10,2) DEFAULT '0',
      headcount INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_configurations (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      api_key TEXT NOT NULL,
      api_key_masked TEXT NOT NULL,
      lfs_version TEXT,
      last_sync_at TIMESTAMP,
      last_sync_ip TEXT,
      sync_status TEXT DEFAULT 'never_connected',
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_offline_sequence (
      workstation_id VARCHAR NOT NULL,
      current_number INTEGER NOT NULL,
      range_start INTEGER NOT NULL,
      range_end INTEGER NOT NULL,
      PRIMARY KEY (workstation_id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_sync_logs (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      sync_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      lfs_ip TEXT,
      lfs_version TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_sync_status (
      table_name TEXT NOT NULL,
      last_synced_at TIMESTAMP,
      record_count INTEGER DEFAULT 0,
      PRIMARY KEY (table_name)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_member_enrollments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      member_id VARCHAR NOT NULL,
      program_id VARCHAR NOT NULL,
      current_points INTEGER DEFAULT 0,
      lifetime_points INTEGER DEFAULT 0,
      current_tier TEXT DEFAULT 'standard',
      visit_count INTEGER DEFAULT 0,
      lifetime_spend NUMERIC(12,2) DEFAULT '0',
      status TEXT DEFAULT 'active',
      enrolled_at TIMESTAMP DEFAULT now(),
      last_activity_at TIMESTAMP,
      points_expiration_date TIMESTAMP,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_members (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      member_number TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      birth_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT now(),
      notes TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_programs (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      name TEXT NOT NULL,
      program_type TEXT NOT NULL DEFAULT 'points',
      points_per_dollar NUMERIC(5,2) DEFAULT '1',
      minimum_points_redeem INTEGER DEFAULT 100,
      points_redemption_value NUMERIC(10,4) DEFAULT '0.01',
      visits_for_reward INTEGER DEFAULT 10,
      tier_config JSONB,
      points_expiration_days INTEGER,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      member_id VARCHAR NOT NULL,
      reward_id VARCHAR NOT NULL,
      check_id VARCHAR,
      property_id VARCHAR,
      points_used INTEGER DEFAULT 0,
      discount_applied NUMERIC(10,2),
      status TEXT DEFAULT 'applied',
      employee_id VARCHAR,
      redeemed_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      program_id VARCHAR NOT NULL,
      property_id VARCHAR,
      name TEXT NOT NULL,
      description TEXT,
      reward_type TEXT NOT NULL DEFAULT 'discount',
      points_cost INTEGER DEFAULT 0,
      auto_award_at_points INTEGER,
      auto_award_once BOOLEAN DEFAULT true,
      discount_amount NUMERIC(10,2),
      discount_percent NUMERIC(5,2),
      free_menu_item_id VARCHAR,
      gift_card_amount NUMERIC(10,2),
      min_purchase NUMERIC(10,2),
      max_redemptions INTEGER,
      redemption_count INTEGER DEFAULT 0,
      valid_from TIMESTAMP,
      valid_until TIMESTAMP,
      tier_required TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      member_id VARCHAR NOT NULL,
      program_id VARCHAR NOT NULL,
      enrollment_id VARCHAR,
      property_id VARCHAR,
      transaction_type TEXT NOT NULL,
      points INTEGER DEFAULT 0,
      points_before INTEGER DEFAULT 0,
      points_after INTEGER DEFAULT 0,
      visit_increment INTEGER DEFAULT 0,
      visits_before INTEGER DEFAULT 0,
      visits_after INTEGER DEFAULT 0,
      check_id VARCHAR,
      check_total NUMERIC(12,2),
      employee_id VARCHAR,
      reason TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS major_groups (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS manager_alerts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
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
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      menu_item_id VARCHAR NOT NULL,
      modifier_group_id VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_item_recipe_ingredients (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      menu_item_id VARCHAR NOT NULL,
      ingredient_name TEXT NOT NULL,
      ingredient_category TEXT,
      default_quantity INTEGER DEFAULT 1,
      is_default BOOLEAN DEFAULT true,
      price_per_unit NUMERIC(10,2) DEFAULT '0.00',
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      modifier_id VARCHAR,
      default_prefix_id VARCHAR,
      sort_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_item_slus (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      menu_item_id VARCHAR NOT NULL,
      slu_id VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS menu_items (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      short_name TEXT,
      price NUMERIC(10,2) NOT NULL,
      tax_group_id VARCHAR,
      print_class_id VARCHAR,
      major_group_id VARCHAR,
      family_group_id VARCHAR,
      color TEXT DEFAULT '#3B82F6',
      menu_build_enabled BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS minor_labor_rules (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      state_code TEXT NOT NULL DEFAULT 'CA',
      minor_age_threshold INTEGER DEFAULT 18,
      young_minor_age_threshold INTEGER DEFAULT 16,
      school_day_max_hours NUMERIC(4,2) DEFAULT '4.00',
      school_week_max_hours NUMERIC(4,2) DEFAULT '18.00',
      school_day_start_time TEXT DEFAULT '07:00',
      school_day_end_time TEXT DEFAULT '19:00',
      non_school_day_max_hours NUMERIC(4,2) DEFAULT '8.00',
      non_school_week_max_hours NUMERIC(4,2) DEFAULT '40.00',
      non_school_day_start_time TEXT DEFAULT '07:00',
      non_school_day_end_time TEXT DEFAULT '21:00',
      require_work_permit BOOLEAN DEFAULT true,
      work_permit_expiration_alert_days INTEGER DEFAULT 30,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS modifier_group_modifiers (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      modifier_group_id VARCHAR NOT NULL,
      modifier_id VARCHAR NOT NULL,
      is_default BOOLEAN DEFAULT false,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS modifier_groups (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      required BOOLEAN DEFAULT false,
      min_select INTEGER DEFAULT 0,
      max_select INTEGER DEFAULT 99,
      display_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS modifiers (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      price_delta NUMERIC(10,2) DEFAULT '0',
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS offline_order_queue (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      workstation_id VARCHAR,
      employee_id VARCHAR,
      local_id TEXT NOT NULL,
      order_data JSONB NOT NULL,
      status TEXT DEFAULT 'pending',
      sync_attempts INTEGER DEFAULT 0,
      last_sync_attempt TIMESTAMP,
      synced_check_id VARCHAR,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT now(),
      synced_at TIMESTAMP,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS online_order_sources (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR NOT NULL,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'other',
      client_id TEXT,
      client_secret TEXT,
      merchant_store_id TEXT,
      webhook_secret TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMP,
      api_key_prefix TEXT,
      webhook_url TEXT,
      auto_accept BOOLEAN DEFAULT false,
      auto_inject BOOLEAN DEFAULT false,
      auto_confirm_minutes INTEGER DEFAULT 5,
      default_prep_minutes INTEGER DEFAULT 15,
      default_rvc_id VARCHAR,
      default_order_type TEXT DEFAULT 'delivery',
      menu_mappings JSONB,
      menu_sync_status TEXT DEFAULT 'not_synced',
      last_menu_sync_at TIMESTAMP,
      menu_sync_error TEXT,
      commission_percent NUMERIC(5,2),
      connection_status TEXT DEFAULT 'disconnected',
      last_connection_test TIMESTAMP,
      sound_enabled BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS online_orders (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      source_id VARCHAR,
      external_order_id TEXT NOT NULL,
      status TEXT DEFAULT 'received',
      order_type TEXT DEFAULT 'pickup',
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
      subtotal NUMERIC(12,2) NOT NULL,
      tax_total NUMERIC(12,2) DEFAULT '0',
      delivery_fee NUMERIC(10,2) DEFAULT '0',
      service_fee NUMERIC(10,2) DEFAULT '0',
      tip NUMERIC(10,2) DEFAULT '0',
      total NUMERIC(12,2) NOT NULL,
      commission NUMERIC(10,2) DEFAULT '0',
      items JSONB NOT NULL,
      check_id VARCHAR,
      injected_at TIMESTAMP,
      injected_by_id VARCHAR,
      raw_payload JSONB,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS order_device_kds (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      order_device_id VARCHAR NOT NULL,
      kds_device_id VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS order_device_printers (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      order_device_id VARCHAR NOT NULL,
      printer_id VARCHAR NOT NULL,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS order_devices (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      kds_device_id VARCHAR,
      send_on TEXT DEFAULT 'send_button',
      send_voids BOOLEAN DEFAULT true,
      send_reprints BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS overtime_rules (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      daily_regular_hours NUMERIC(4,2) DEFAULT '8.00',
      daily_overtime_threshold NUMERIC(4,2) DEFAULT '8.00',
      daily_double_time_threshold NUMERIC(4,2),
      weekly_overtime_threshold NUMERIC(4,2) DEFAULT '40.00',
      weekly_double_time_threshold NUMERIC(4,2),
      overtime_multiplier NUMERIC(3,2) DEFAULT '1.50',
      double_time_multiplier NUMERIC(3,2) DEFAULT '2.00',
      enable_daily_overtime BOOLEAN DEFAULT true,
      enable_daily_double_time BOOLEAN DEFAULT false,
      enable_weekly_overtime BOOLEAN DEFAULT true,
      enable_weekly_double_time BOOLEAN DEFAULT false,
      week_start_day INTEGER DEFAULT 0,
      effective_date TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pay_periods (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      locked_at TIMESTAMP,
      locked_by_id VARCHAR,
      exported_at TIMESTAMP,
      exported_by_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_gateway_config (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      config_level TEXT NOT NULL,
      enterprise_id VARCHAR,
      property_id VARCHAR,
      workstation_id VARCHAR,
      gateway_type TEXT,
      integration_model TEXT,
      environment TEXT,
      credential_key_prefix TEXT,
      merchant_id TEXT,
      terminal_id TEXT,
      site_id TEXT,
      device_id TEXT,
      license_id TEXT,
      terminal_ip_address TEXT,
      terminal_port TEXT,
      terminal_connection_type TEXT,
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
      encrypted_credentials TEXT,
      enable_debug_logging BOOLEAN DEFAULT false,
      log_raw_requests BOOLEAN DEFAULT false,
      log_raw_responses BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_processors (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      gateway_type TEXT NOT NULL,
      environment TEXT DEFAULT 'sandbox',
      credential_key_prefix TEXT NOT NULL,
      gateway_settings JSONB,
      supports_tokenization BOOLEAN DEFAULT true,
      supports_tip_adjust BOOLEAN DEFAULT true,
      supports_partial_auth BOOLEAN DEFAULT false,
      supports_emv BOOLEAN DEFAULT true,
      supports_contactless BOOLEAN DEFAULT true,
      auth_hold_minutes INTEGER DEFAULT 1440,
      settlement_time TEXT DEFAULT '02:00',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_transactions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_payment_id VARCHAR,
      payment_processor_id VARCHAR NOT NULL,
      gateway_transaction_id TEXT,
      auth_code TEXT,
      reference_number TEXT,
      card_brand TEXT,
      card_last4 TEXT,
      card_expiry_month INTEGER,
      card_expiry_year INTEGER,
      entry_mode TEXT,
      auth_amount INTEGER NOT NULL,
      capture_amount INTEGER,
      tip_amount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_type TEXT NOT NULL,
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
      business_date TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pos_layout_cells (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      layout_id VARCHAR NOT NULL,
      row_index INTEGER NOT NULL,
      col_index INTEGER NOT NULL,
      row_span INTEGER DEFAULT 1,
      col_span INTEGER DEFAULT 1,
      menu_item_id VARCHAR,
      background_color TEXT DEFAULT '#3B82F6',
      text_color TEXT DEFAULT '#FFFFFF',
      display_label TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pos_layout_rvc_assignments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      layout_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR NOT NULL,
      is_default BOOLEAN DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS pos_layouts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'slu_tabs',
      grid_rows INTEGER DEFAULT 4,
      grid_cols INTEGER DEFAULT 6,
      font_size TEXT DEFAULT 'medium',
      is_default BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS prep_items (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      par_level INTEGER NOT NULL,
      current_level INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'each',
      shelf_life_hours INTEGER,
      prep_instructions TEXT,
      menu_item_ids TEXT[],
      consumption_per_item NUMERIC(5,2) DEFAULT '1',
      last_prep_at TIMESTAMP,
      last_prep_by_id VARCHAR,
      last_prep_quantity INTEGER,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_agents (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR,
      workstation_id VARCHAR,
      name TEXT NOT NULL,
      description TEXT,
      agent_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'offline',
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
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_class_routing (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      print_class_id VARCHAR NOT NULL,
      order_device_id VARCHAR NOT NULL,
      property_id VARCHAR,
      rvc_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_classes (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS print_jobs (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      print_agent_id VARCHAR,
      printer_id VARCHAR,
      workstation_id VARCHAR,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER DEFAULT 5,
      check_id VARCHAR,
      employee_id VARCHAR,
      business_date TEXT,
      esc_pos_data TEXT,
      plain_text_data TEXT,
      printer_ip TEXT,
      printer_port INTEGER DEFAULT 9100,
      printer_name TEXT,
      connection_type TEXT DEFAULT 'network',
      com_port TEXT,
      baud_rate INTEGER,
      windows_printer_name TEXT,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_error TEXT,
      leased_by VARCHAR,
      leased_until TIMESTAMP,
      dedupe_key VARCHAR,
      origin_device_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      sent_to_agent_at TIMESTAMP,
      printed_at TIMESTAMP,
      expires_at TIMESTAMP,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS printers (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      host_workstation_id VARCHAR,
      name TEXT NOT NULL,
      printer_type TEXT NOT NULL DEFAULT 'kitchen',
      connection_type TEXT NOT NULL DEFAULT 'network',
      ip_address TEXT,
      subnet_mask TEXT DEFAULT '255.255.255.0',
      port INTEGER DEFAULT 9100,
      com_port TEXT,
      baud_rate INTEGER DEFAULT 9600,
      windows_printer_name TEXT,
      driver_protocol TEXT DEFAULT 'epson',
      model TEXT,
      character_width INTEGER DEFAULT 42,
      auto_cut BOOLEAN DEFAULT true,
      print_logo BOOLEAN DEFAULT false,
      print_order_header BOOLEAN DEFAULT true,
      print_order_footer BOOLEAN DEFAULT true,
      print_voids BOOLEAN DEFAULT true,
      print_reprints BOOLEAN DEFAULT true,
      retry_attempts INTEGER DEFAULT 3,
      failure_handling_mode TEXT DEFAULT 'alert_cashier',
      is_online BOOLEAN DEFAULT false,
      last_seen_at TIMESTAMP,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS privileges (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      domain TEXT,
      description TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS properties (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      address TEXT,
      timezone TEXT DEFAULT 'America/New_York',
      business_date_rollover_time TEXT DEFAULT '04:00',
      business_date_mode TEXT DEFAULT 'auto',
      current_business_date TEXT,
      sign_in_logo_url TEXT,
      auto_clock_out_enabled BOOLEAN DEFAULT false,
      caps_workstation_id VARCHAR,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS recipes (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      menu_item_id VARCHAR NOT NULL,
      inventory_item_id VARCHAR NOT NULL,
      quantity NUMERIC(10,4) NOT NULL,
      unit_type TEXT,
      waste_percent NUMERIC(5,2) DEFAULT '0',
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS refund_items (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      refund_id VARCHAR NOT NULL,
      original_check_item_id VARCHAR NOT NULL,
      menu_item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price NUMERIC(10,2) NOT NULL,
      modifiers JSONB,
      tax_amount NUMERIC(10,2) DEFAULT '0',
      refund_amount NUMERIC(10,2) NOT NULL,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS refund_payments (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      refund_id VARCHAR NOT NULL,
      original_payment_id VARCHAR NOT NULL,
      tender_id VARCHAR NOT NULL,
      tender_name TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      gateway_refund_id TEXT,
      gateway_status TEXT,
      gateway_message TEXT,
      refund_method TEXT DEFAULT 'manual',
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS refunds (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      refund_number INTEGER NOT NULL,
      rvc_id VARCHAR NOT NULL,
      original_check_id VARCHAR NOT NULL,
      original_check_number INTEGER NOT NULL,
      refund_type TEXT NOT NULL,
      subtotal NUMERIC(10,2) NOT NULL,
      tax_total NUMERIC(10,2) NOT NULL,
      total NUMERIC(10,2) NOT NULL,
      reason TEXT,
      processed_by_employee_id VARCHAR NOT NULL,
      manager_approval_id VARCHAR,
      created_at TIMESTAMP DEFAULT now(),
      business_date TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS registered_devices (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      device_type TEXT NOT NULL,
      workstation_id VARCHAR,
      kds_device_id VARCHAR,
      name TEXT NOT NULL,
      enrollment_code TEXT,
      enrollment_code_expires_at TIMESTAMP,
      device_token TEXT,
      device_token_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
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
      disabled_reason TEXT,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS role_privileges (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      role_id VARCHAR NOT NULL,
      privilege_code TEXT NOT NULL,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS role_rules (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      role_id VARCHAR NOT NULL,
      enterprise_id VARCHAR,
      max_item_discount_pct INTEGER NOT NULL DEFAULT 0,
      max_check_discount_pct INTEGER NOT NULL DEFAULT 0,
      max_item_discount_amt NUMERIC(10,2) NOT NULL DEFAULT '0',
      max_check_discount_amt NUMERIC(10,2) NOT NULL DEFAULT '0',
      max_price_override_pct_down INTEGER NOT NULL DEFAULT 0,
      max_price_override_amt_down NUMERIC(10,2) NOT NULL DEFAULT '0',
      reopen_window_minutes INTEGER NOT NULL DEFAULT 0,
      edit_closed_window_minutes INTEGER NOT NULL DEFAULT 0,
      refund_window_minutes INTEGER NOT NULL DEFAULT 0,
      bypass_windows_allowed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS rounds (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      check_id VARCHAR NOT NULL,
      round_number INTEGER NOT NULL,
      sent_at TIMESTAMP DEFAULT now(),
      sent_by_employee_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS rvc_counters (
      rvc_id VARCHAR NOT NULL,
      next_check_number INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (rvc_id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS rvcs (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      fast_transaction_default BOOLEAN DEFAULT false,
      default_order_type TEXT DEFAULT 'dine_in',
      order_type_default TEXT DEFAULT 'dine_in',
      dynamic_order_mode BOOLEAN DEFAULT false,
      dom_send_mode TEXT DEFAULT 'fire_on_fly',
      conversational_ordering_enabled BOOLEAN DEFAULT false,
      active BOOLEAN DEFAULT true,
      receipt_print_mode TEXT DEFAULT 'auto_on_close',
      receipt_copies INTEGER DEFAULT 1,
      kitchen_print_mode TEXT DEFAULT 'auto_on_send',
      void_receipt_print BOOLEAN DEFAULT true,
      require_guest_count BOOLEAN DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS safe_counts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      business_date TEXT NOT NULL,
      count_type TEXT NOT NULL DEFAULT 'daily',
      expected_amount NUMERIC(12,2),
      actual_amount NUMERIC(12,2) NOT NULL,
      variance NUMERIC(12,2),
      denominations JSONB,
      notes TEXT,
      verified_by_id VARCHAR,
      verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS sales_forecasts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      forecast_date TEXT NOT NULL,
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
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_charges (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      value NUMERIC(10,2) NOT NULL,
      auto_apply BOOLEAN DEFAULT false,
      order_types TEXT[],
      active BOOLEAN DEFAULT true,
      is_taxable BOOLEAN NOT NULL DEFAULT false,
      tax_group_id VARCHAR,
      revenue_category TEXT NOT NULL DEFAULT 'revenue',
      post_to_tip_pool BOOLEAN NOT NULL DEFAULT false,
      tip_eligible BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_alert_rules (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      enabled BOOLEAN DEFAULT true,
      threshold_value INTEGER,
      threshold_duration_minutes INTEGER,
      notify_email BOOLEAN DEFAULT true,
      notify_sms BOOLEAN DEFAULT false,
      email_recipients JSONB DEFAULT '[]'::jsonb,
      sms_recipients JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_alerts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      service_host_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      message TEXT NOT NULL,
      details JSONB,
      triggered_at TIMESTAMP NOT NULL DEFAULT now(),
      acknowledged_at TIMESTAMP,
      acknowledged_by_id VARCHAR,
      resolved_at TIMESTAMP,
      notifications_sent BOOLEAN DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_metrics (
      id SERIAL PRIMARY KEY,
      service_host_id VARCHAR NOT NULL,
      recorded_at TIMESTAMP NOT NULL DEFAULT now(),
      connection_mode TEXT DEFAULT 'green',
      connected_workstations INTEGER DEFAULT 0,
      pending_sync_items INTEGER DEFAULT 0,
      cpu_usage_percent INTEGER,
      memory_usage_mb INTEGER,
      disk_usage_percent INTEGER,
      disk_free_gb REAL,
      uptime INTEGER
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_host_transactions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      service_host_id VARCHAR NOT NULL,
      property_id VARCHAR NOT NULL,
      local_id VARCHAR NOT NULL,
      transaction_type VARCHAR(50) NOT NULL,
      business_date TEXT NOT NULL,
      data JSONB NOT NULL,
      processed_at TIMESTAMP DEFAULT now(),
      cloud_entity_id VARCHAR,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS service_hosts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      name TEXT NOT NULL,
      service_type TEXT NOT NULL DEFAULT 'caps',
      host_workstation_id VARCHAR,
      workstation_id VARCHAR,
      status TEXT DEFAULT 'offline',
      last_heartbeat_at TIMESTAMP,
      version VARCHAR(20),
      services JSONB DEFAULT '[]'::jsonb,
      registration_token VARCHAR(128),
      registration_token_used BOOLEAN DEFAULT false,
      encryption_key_hash VARCHAR(64),
      hostname TEXT,
      ip_address TEXT,
      active_checks INTEGER DEFAULT 0,
      pending_transactions INTEGER DEFAULT 0,
      local_config_version INTEGER DEFAULT 0,
      connected_device_ids JSONB DEFAULT '[]'::jsonb,
      service_config JSONB,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_cover_approvals (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      cover_request_id VARCHAR NOT NULL,
      offer_id VARCHAR,
      approved_by_id VARCHAR NOT NULL,
      approved BOOLEAN NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_cover_offers (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      cover_request_id VARCHAR NOT NULL,
      offerer_id VARCHAR NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_cover_requests (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      shift_id VARCHAR NOT NULL,
      requester_id VARCHAR NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'open',
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shift_templates (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      job_code_id VARCHAR,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      break_minutes INTEGER DEFAULT 0,
      color TEXT,
      notes TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      employee_id VARCHAR,
      job_code_id VARCHAR,
      template_id VARCHAR,
      shift_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      scheduled_break_minutes INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      notes TEXT,
      published_at TIMESTAMP,
      published_by_id VARCHAR,
      acknowledged_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS slus (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      button_label TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      color TEXT DEFAULT '#3B82F6',
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS stress_test_results (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      employee_id VARCHAR,
      status TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      target_tx_per_minute INTEGER NOT NULL,
      patterns TEXT[],
      total_transactions INTEGER DEFAULT 0,
      successful_transactions INTEGER DEFAULT 0,
      failed_transactions INTEGER DEFAULT 0,
      avg_transaction_ms INTEGER,
      min_transaction_ms INTEGER,
      max_transaction_ms INTEGER,
      actual_tx_per_minute NUMERIC,
      elapsed_seconds INTEGER,
      errors TEXT[],
      started_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS sync_notifications (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      enterprise_id VARCHAR,
      service_host_id VARCHAR,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB,
      read BOOLEAN DEFAULT false,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tax_groups (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      rate NUMERIC(5,4) NOT NULL,
      tax_mode TEXT NOT NULL DEFAULT 'add_on',
      active BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tenders (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      payment_processor_id VARCHAR,
      active BOOLEAN DEFAULT true,
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
      is_gift_media BOOLEAN DEFAULT false,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS terminal_devices (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      payment_processor_id VARCHAR,
      workstation_id VARCHAR,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      serial_number TEXT,
      terminal_id TEXT,
      connection_type TEXT DEFAULT 'ethernet',
      network_address TEXT,
      port INTEGER,
      cloud_device_id TEXT,
      status TEXT DEFAULT 'offline',
      last_heartbeat TIMESTAMP,
      capabilities JSONB,
      supports_store_and_forward BOOLEAN DEFAULT false,
      firmware_version TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS terminal_sessions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      terminal_device_id VARCHAR NOT NULL,
      check_id VARCHAR,
      tender_id VARCHAR,
      employee_id VARCHAR,
      workstation_id VARCHAR,
      amount INTEGER NOT NULL,
      tip_amount INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'usd',
      status TEXT DEFAULT 'pending',
      status_message TEXT,
      processor_reference TEXT,
      payment_transaction_id VARCHAR,
      initiated_at TIMESTAMP DEFAULT now(),
      completed_at TIMESTAMP,
      expires_at TIMESTAMP,
      metadata JSONB,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS time_off_requests (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      employee_id VARCHAR NOT NULL,
      property_id VARCHAR,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      request_type TEXT DEFAULT 'pto',
      reason_code TEXT,
      notes TEXT,
      status TEXT DEFAULT 'submitted',
      reviewed_by_id VARCHAR,
      reviewed_at TIMESTAMP,
      review_notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS time_punches (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      job_code_id VARCHAR,
      punch_type TEXT NOT NULL,
      actual_timestamp TIMESTAMP NOT NULL,
      rounded_timestamp TIMESTAMP,
      business_date TEXT NOT NULL,
      source TEXT DEFAULT 'pos',
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
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS timecard_edits (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      target_type TEXT NOT NULL,
      target_id VARCHAR NOT NULL,
      edit_type TEXT NOT NULL,
      before_value JSONB,
      after_value JSONB,
      reason_code TEXT,
      notes TEXT,
      edited_by_id VARCHAR,
      edited_by_emc_user_id VARCHAR,
      edited_by_display_name TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS timecard_exceptions (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      timecard_id VARCHAR,
      time_punch_id VARCHAR,
      exception_type TEXT NOT NULL,
      business_date TEXT NOT NULL,
      description TEXT,
      severity TEXT DEFAULT 'warning',
      status TEXT DEFAULT 'pending',
      resolved_by_id VARCHAR,
      resolved_at TIMESTAMP,
      resolution_notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS timecards (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      pay_period_id VARCHAR,
      business_date TEXT NOT NULL,
      job_code_id VARCHAR,
      pay_rate NUMERIC(10,2),
      clock_in_time TIMESTAMP,
      clock_out_time TIMESTAMP,
      regular_hours NUMERIC(6,2) DEFAULT '0',
      overtime_hours NUMERIC(6,2) DEFAULT '0',
      double_time_hours NUMERIC(6,2) DEFAULT '0',
      break_minutes INTEGER DEFAULT 0,
      paid_break_minutes INTEGER DEFAULT 0,
      unpaid_break_minutes INTEGER DEFAULT 0,
      total_hours NUMERIC(6,2) DEFAULT '0',
      regular_pay NUMERIC(10,2) DEFAULT '0',
      overtime_pay NUMERIC(10,2) DEFAULT '0',
      total_pay NUMERIC(10,2) DEFAULT '0',
      tips NUMERIC(10,2) DEFAULT '0',
      status TEXT DEFAULT 'open',
      approved_by_id VARCHAR,
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_allocations (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      tip_pool_run_id VARCHAR NOT NULL,
      employee_id VARCHAR NOT NULL,
      hours_worked NUMERIC(6,2) DEFAULT '0',
      points_earned NUMERIC(6,2) DEFAULT '0',
      share_percentage NUMERIC(5,2) DEFAULT '0',
      allocated_amount NUMERIC(10,2) DEFAULT '0',
      direct_tips NUMERIC(10,2) DEFAULT '0',
      total_tips NUMERIC(10,2) DEFAULT '0',
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_pool_policies (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      calculation_method TEXT DEFAULT 'hours_worked',
      role_weights JSONB,
      excluded_job_code_ids TEXT[],
      exclude_managers BOOLEAN DEFAULT true,
      exclude_training BOOLEAN DEFAULT true,
      minimum_hours_required NUMERIC(4,2) DEFAULT '0',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_pool_runs (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      policy_id VARCHAR,
      business_date TEXT NOT NULL,
      total_tips NUMERIC(10,2) DEFAULT '0',
      total_hours NUMERIC(10,2) DEFAULT '0',
      participant_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      run_by_id VARCHAR,
      run_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_rule_job_percentages (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      tip_rule_id VARCHAR NOT NULL,
      job_code_id VARCHAR NOT NULL,
      percentage NUMERIC(5,2) NOT NULL DEFAULT '0',
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS tip_rules (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      enterprise_id VARCHAR,
      property_id VARCHAR,
      rvc_id VARCHAR,
      name TEXT NOT NULL DEFAULT 'Default Tip Rules',
      distribution_method TEXT NOT NULL DEFAULT 'tip_directly',
      timeframe TEXT DEFAULT 'daily',
      applies_to_all_locations BOOLEAN DEFAULT false,
      declare_cash_tips BOOLEAN DEFAULT false,
      declare_cash_tips_all_locations BOOLEAN DEFAULT false,
      exclude_managers BOOLEAN DEFAULT true,
      minimum_hours_for_pool NUMERIC(4,2) DEFAULT '0',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS transaction_journal (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      event_id VARCHAR NOT NULL UNIQUE,
      operation_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      http_method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      payload JSONB,
      offline_transaction_id TEXT,
      workstation_id VARCHAR,
      property_id VARCHAR,
      journal_status TEXT DEFAULT 'completed',
      synced BOOLEAN DEFAULT false,
      synced_at TIMESTAMP,
      sync_error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS workstation_order_devices (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      workstation_id VARCHAR NOT NULL,
      order_device_id VARCHAR NOT NULL,
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS workstation_service_bindings (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      workstation_id VARCHAR NOT NULL,
      service_type TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      PRIMARY KEY (id)
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS workstations (
      id VARCHAR NOT NULL DEFAULT gen_random_uuid(),
      property_id VARCHAR NOT NULL,
      rvc_id VARCHAR,
      name TEXT NOT NULL,
      device_type TEXT NOT NULL DEFAULT 'pos_terminal',
      default_order_type TEXT DEFAULT 'dine_in',
      fast_transaction_enabled BOOLEAN DEFAULT false,
      require_begin_check BOOLEAN DEFAULT true,
      allow_pickup_check BOOLEAN DEFAULT true,
      allow_reopen_closed_checks BOOLEAN DEFAULT false,
      allow_offline_operation BOOLEAN DEFAULT false,
      offline_check_number_start INTEGER,
      offline_check_number_end INTEGER,
      allowed_role_ids TEXT[],
      manager_approval_device BOOLEAN DEFAULT false,
      clock_in_allowed BOOLEAN DEFAULT true,
      default_receipt_printer_id VARCHAR,
      backup_receipt_printer_id VARCHAR,
      report_printer_id VARCHAR,
      backup_report_printer_id VARCHAR,
      void_printer_id VARCHAR,
      backup_void_printer_id VARCHAR,
      default_order_device_id VARCHAR,
      default_kds_expo_id VARCHAR,
      ip_address TEXT,
      hostname TEXT,
      is_online BOOLEAN DEFAULT false,
      last_seen_at TIMESTAMP,
      service_host_url TEXT,
      auto_logout_minutes INTEGER,
      active BOOLEAN DEFAULT true,
      service_bindings TEXT[],
      setup_status TEXT DEFAULT 'pending',
      last_setup_at TIMESTAMP,
      last_setup_by VARCHAR,
      installed_services TEXT[],
      device_token TEXT,
      registered_device_id VARCHAR,
      font_scale INTEGER DEFAULT 100,
      com_port TEXT,
      com_baud_rate INTEGER DEFAULT 9600,
      com_data_bits INTEGER DEFAULT 8,
      com_stop_bits TEXT DEFAULT '1',
      com_parity TEXT DEFAULT 'none',
      com_flow_control TEXT DEFAULT 'none',
      cash_drawer_enabled BOOLEAN DEFAULT false,
      cash_drawer_printer_id VARCHAR,
      cash_drawer_kick_pin TEXT DEFAULT 'pin2',
      cash_drawer_pulse_duration INTEGER DEFAULT 100,
      cash_drawer_auto_open_on_cash BOOLEAN DEFAULT true,
      cash_drawer_auto_open_on_drop BOOLEAN DEFAULT true,
      PRIMARY KEY (id)
    );`);


    // ========================================================================
    // INDEXES (from Drizzle uniqueIndex / index definitions)
    // ========================================================================

    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_check_payments_attempt_id ON check_payments (payment_attempt_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_check_service_charges_business_date ON check_service_charges (business_date, property_id, rvc_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_check_service_charges_check_id ON check_service_charges (check_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_check_service_charges_sc_id ON check_service_charges (service_charge_id);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_checks_rvc_check_number ON checks (rvc_id, check_number);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_emc_option_flags_unique ON emc_option_flags (enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emc_option_flags_entity ON emc_option_flags (enterprise_id, entity_type, entity_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emc_option_flags_key ON emc_option_flags (enterprise_id, option_key);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique ON idempotency_keys (enterprise_id, workstation_id, operation, idempotency_key);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys (expires_at);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lfs_configurations_property ON lfs_configurations (property_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lfs_sync_logs_property ON lfs_sync_logs (property_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lfs_sync_logs_created ON lfs_sync_logs (created_at);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_dedupe ON print_jobs (dedupe_key);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sync_notifications_property ON sync_notifications (property_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sync_notifications_created ON sync_notifications (created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sync_notifications_unread ON sync_notifications (property_id, read);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transaction_journal_synced ON transaction_journal (synced);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transaction_journal_entity ON transaction_journal (entity_type, entity_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transaction_journal_created ON transaction_journal (created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transaction_journal_property ON transaction_journal (property_id);`);


    // ========================================================================
    // LFS-ONLY TABLE (not in Drizzle schema)
    // ========================================================================

    await client.query(`CREATE TABLE IF NOT EXISTS lfs_schema_version (
      version INTEGER NOT NULL,
      applied_at TIMESTAMP DEFAULT now()
    );`);

    // ========================================================================
    // SELF-HEALING: Fix constraints on installs upgrading from schema v3
    // ========================================================================

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conrelid = 'rvc_counters'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE rvc_counters ADD PRIMARY KEY (rvc_id);
        END IF;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conrelid = 'lfs_sync_status'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE lfs_sync_status ADD PRIMARY KEY (table_name);
        END IF;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conrelid = 'lfs_offline_sequence'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE lfs_offline_sequence ADD PRIMARY KEY (workstation_id);
        END IF;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    // ========================================================================
    // ADD MISSING COLUMNS (idempotent upgrade path)
    // ========================================================================

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS online_order_id VARCHAR;
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS platform_source TEXT;
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS origin_device_id VARCHAR;
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS origin_created_at TIMESTAMP;
        ALTER TABLE checks ADD COLUMN IF NOT EXISTS offline_transaction_id VARCHAR;
        ALTER TABLE check_items ADD COLUMN IF NOT EXISTS business_date TEXT;
        ALTER TABLE check_items ADD COLUMN IF NOT EXISTS offline_transaction_id VARCHAR;
        ALTER TABLE check_payments ADD COLUMN IF NOT EXISTS origin_device_id VARCHAR;
        ALTER TABLE check_payments ADD COLUMN IF NOT EXISTS payment_attempt_id VARCHAR;
        ALTER TABLE check_payments ADD COLUMN IF NOT EXISTS offline_transaction_id VARCHAR;
        ALTER TABLE workstations ADD COLUMN IF NOT EXISTS font_scale INTEGER DEFAULT 100;
        ALTER TABLE workstations ADD COLUMN IF NOT EXISTS com_port TEXT;
        ALTER TABLE workstations ADD COLUMN IF NOT EXISTS cash_drawer_enabled BOOLEAN DEFAULT false;
        ALTER TABLE workstations ADD COLUMN IF NOT EXISTS cash_drawer_printer_id VARCHAR;
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS origin_device_id VARCHAR;
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR;
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS leased_by VARCHAR;
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS leased_until TIMESTAMP;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    // ========================================================================
    // SCHEMA VERSION
    // ========================================================================

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM lfs_schema_version WHERE version = 4) THEN
          INSERT INTO lfs_schema_version (version) VALUES (4);
        END IF;
      END $$;
    `);

    await client.query("COMMIT");
    console.log("[LFS] Schema migration v4 completed (144 tables)");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[LFS] Schema migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}
