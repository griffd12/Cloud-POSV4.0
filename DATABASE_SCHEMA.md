# Cloud POS - Database Schema Reference

> Auto-generated schema documentation. Last updated: 2026-02-21
> **This document must be updated whenever database schema changes are made.**
> Total tables: 135 | Database: PostgreSQL

---

## Table of Contents

1. [Organization Hierarchy](#1-organization-hierarchy)
2. [Employee & Access Control](#2-employee--access-control)
3. [Menu & Item Configuration](#3-menu--item-configuration)
4. [Checks & Orders (Transaction Core)](#4-checks--orders-transaction-core)
5. [Payment Processing](#5-payment-processing)
6. [Kitchen Display System](#6-kitchen-display-system)
7. [Order Routing](#7-order-routing)
8. [Printing](#8-printing)
9. [Workstations & Devices](#9-workstations--devices)
10. [Cash Management](#10-cash-management)
11. [Time & Attendance](#11-time--attendance)
12. [Break Compliance](#12-break-compliance)
13. [Tip Management](#13-tip-management)
14. [Scheduling](#14-scheduling)
15. [Loyalty & Gift Cards](#15-loyalty--gift-cards)
16. [Online Ordering & Delivery](#16-online-ordering--delivery)
17. [Inventory](#17-inventory)
18. [Fiscal & Reporting](#18-fiscal--reporting)
19. [Audit & Alerts](#19-audit--alerts)
20. [POS Layouts](#20-pos-layouts)
21. [Receipt Descriptors](#21-receipt-descriptors)
22. [Service Hosts (CAPS)](#22-service-hosts-caps)
23. [CAL (Content Application Lifecycle)](#23-cal-content-application-lifecycle)
24. [Relationship Diagram (Key Relationships)](#24-relationship-diagram-key-relationships)

---

## 1. Organization Hierarchy

### `enterprises`

Top-level organizational unit representing a restaurant group or brand.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| name | text | NO | — |
| code | text | NO | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Unique Constraints:** `code`

---

### `properties`

Individual restaurant locations belonging to an enterprise.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | NO | — |
| name | text | NO | — |
| code | text | NO | — |
| address | text | YES | — |
| timezone | text | YES | `'America/New_York'` |
| active | boolean | YES | `true` |
| business_date_rollover_time | text | YES | `'04:00'` |
| business_date_mode | text | YES | `'auto'` |
| current_business_date | text | YES | — |
| sign_in_logo_url | text | YES | — |
| auto_clock_out_enabled | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`

---

### `rvcs`

Revenue Centers within a property (e.g., Bar, Dining Room, Drive-Through).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| code | text | NO | — |
| fast_transaction_default | boolean | YES | `false` |
| default_order_type | text | YES | `'dine_in'` |
| order_type_default | text | YES | `'dine_in'` |
| active | boolean | YES | `true` |
| dynamic_order_mode | boolean | YES | `false` |
| dom_send_mode | text | YES | `'fire_on_fly'` |
| conversational_ordering_enabled | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

## 2. Employee & Access Control

### `employees`

POS employees who clock in and operate the system using a PIN.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| employee_number | text | NO | — |
| first_name | text | NO | — |
| last_name | text | NO | — |
| pin_hash | text | NO | — |
| role_id | varchar | YES | — |
| active | boolean | YES | `true` |
| date_of_birth | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `role_id` → `roles.id`

---

### `roles`

Security roles defining what operations an employee can perform.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `privileges`

Individual privilege definitions that can be assigned to roles.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| code | text | NO | — |
| name | text | NO | — |
| description | text | YES | — |
| domain | text | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `code`

---

### `role_privileges`

Junction table linking roles to their assigned privileges.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| role_id | varchar | NO | — |
| privilege_code | text | NO | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `role_id` → `roles.id`

---

### `role_rules`

Per-role threshold and limit rules for pricing, discounts, price overrides, and time windows. Part of the auditor's Role Option Matrix specification.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| role_id | varchar | NO | — |
| enterprise_id | varchar | NO | — |
| max_item_discount_pct | integer | YES | `0` |
| max_check_discount_pct | integer | YES | `0` |
| max_item_discount_amt | numeric | YES | `0` |
| max_check_discount_amt | numeric | YES | `0` |
| max_price_override_pct_down | integer | YES | `0` |
| max_price_override_amt_down | numeric | YES | `0` |
| reopen_window_minutes | integer | YES | `0` |
| edit_closed_window_minutes | integer | YES | `0` |
| refund_window_minutes | integer | YES | `0` |
| bypass_windows_allowed | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `role_id` → `roles.id`
- **Unique Constraints:** `(role_id, enterprise_id)`

---

### `job_codes`

Job classifications for employees (e.g., Server, Cook, Manager) with pay and tip configuration.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| hourly_rate | numeric(10,2) | YES | — |
| tip_mode | text | YES | `'not_eligible'` |
| tip_pool_weight | numeric(5,2) | YES | `1.00` |
| color | text | YES | `'#3B82F6'` |
| display_order | integer | YES | — |
| active | boolean | YES | `true` |
| role_id | varchar | YES | — |
| compensation_type | text | YES | `'hourly'` |
| salary_amount | numeric(10,2) | YES | — |
| salary_period | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `role_id` → `roles.id`

---

### `employee_job_codes`

Links employees to their assigned job codes with per-employee pay rates.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| job_code_id | varchar | NO | — |
| is_primary | boolean | YES | — |
| pay_rate | numeric(10,2) | YES | — |
| bypass_clock_in | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `job_code_id` → `job_codes.id`

---

### `employee_assignments`

Assigns employees to specific enterprise/property/RVC combinations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| is_primary | boolean | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `employee_availability`

Recurring weekly availability preferences for scheduling.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| property_id | varchar | YES | — |
| day_of_week | integer | NO | — |
| start_time | text | YES | — |
| end_time | text | YES | — |
| availability_type | text | YES | `'available'` |
| effective_from | text | YES | — |
| effective_to | text | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `property_id` → `properties.id`

---

### `availability_exceptions`

One-off availability overrides for specific dates.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| property_id | varchar | YES | — |
| exception_date | text | NO | — |
| is_available | boolean | YES | `false` |
| start_time | text | YES | — |
| end_time | text | YES | — |
| reason | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `property_id` → `properties.id`

---

### `employee_minor_status`

Tracks minor (under-18) employee status, work permits, and school information for labor law compliance.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| date_of_birth | text | NO | — |
| is_minor | boolean | YES | `false` |
| age_category | text | YES | — |
| work_permit_number | text | YES | — |
| work_permit_issue_date | text | YES | — |
| work_permit_expiration_date | text | YES | — |
| work_permit_document_url | text | YES | — |
| currently_in_school | boolean | YES | `true` |
| school_name | text | YES | — |
| school_end_date | text | YES | — |
| max_daily_hours | numeric(4,2) | YES | — |
| max_weekly_hours | numeric(4,2) | YES | — |
| earliest_start_time | text | YES | — |
| latest_end_time | text | YES | — |
| verified_by_id | varchar | YES | — |
| verified_at | timestamp | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `verified_by_id` → `employees.id`

---

### `emc_users`

Enterprise Management Console users — admin users who access the web-based management system via email/password.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| email | text | NO | — |
| password_hash | text | NO | — |
| first_name | text | NO | — |
| last_name | text | NO | — |
| access_level | text | NO | `'property_admin'` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| active | boolean | YES | `true` |
| last_login_at | timestamp | YES | — |
| failed_login_attempts | integer | YES | `0` |
| locked_until | timestamp | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Unique Constraints:** `email`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`

---

### `emc_sessions`

Server-side session management for EMC admin users.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| user_id | varchar | NO | — |
| session_token | text | NO | — |
| expires_at | timestamp | NO | — |
| ip_address | text | YES | — |
| user_agent | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Unique Constraints:** `session_token`
- **Foreign Keys:**
  - `user_id` → `emc_users.id`

---

## 3. Menu & Item Configuration

### `major_groups`

Top-level menu categorization (e.g., Food, Beverage, Merchandise).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| display_order | integer | YES | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`

---

### `family_groups`

Sub-categories within major groups (e.g., Appetizers, Entrees under Food).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| major_group_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| display_order | integer | YES | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `major_group_id` → `major_groups.id`

---

### `menu_items`

Individual items that can be ordered (e.g., Cheeseburger, Coke).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| short_name | text | YES | — |
| price | numeric(10,2) | YES | — |
| tax_group_id | varchar | YES | — |
| print_class_id | varchar | YES | — |
| color | text | YES | `'#3B82F6'` |
| active | boolean | YES | `true` |
| major_group_id | varchar | YES | — |
| family_group_id | varchar | YES | — |
| menu_build_enabled | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `tax_group_id` → `tax_groups.id`
  - `print_class_id` → `print_classes.id`
  - `major_group_id` → `major_groups.id`
  - `family_group_id` → `family_groups.id`

---

### `modifier_groups`

Groups of modifiers that can be applied to menu items (e.g., "Choose a Size", "Add Toppings").

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| required | boolean | YES | `false` |
| min_select | integer | YES | `0` |
| max_select | integer | YES | `99` |
| display_order | integer | YES | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `modifiers`

Individual modifiers that adjust a menu item (e.g., "Extra Cheese", "No Onion").

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| name | text | NO | — |
| price_delta | numeric(10,2) | YES | `0` |
| active | boolean | YES | `true` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `modifier_group_modifiers`

Junction table linking modifiers to their groups.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| modifier_group_id | varchar | NO | — |
| modifier_id | varchar | NO | — |
| is_default | boolean | YES | — |
| display_order | integer | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `modifier_group_id` → `modifier_groups.id`
  - `modifier_id` → `modifiers.id`

---

### `menu_item_modifier_groups`

Links menu items to their applicable modifier groups.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| menu_item_id | varchar | NO | — |
| modifier_group_id | varchar | NO | — |
| display_order | integer | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `menu_item_id` → `menu_items.id`
  - `modifier_group_id` → `modifier_groups.id`

---

### `slus`

Screen Lookup Units — touchscreen buttons/tabs for organizing menu items on the POS.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| button_label | text | YES | — |
| display_order | integer | YES | — |
| color | text | YES | `'#3B82F6'` |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `menu_item_slus`

Links menu items to SLU tabs for POS display.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| menu_item_id | varchar | NO | — |
| slu_id | varchar | NO | — |
| display_order | integer | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `menu_item_id` → `menu_items.id`
  - `slu_id` → `slus.id`

---

### `tax_groups`

Tax rate configurations applied to menu items.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| rate | numeric(5,4) | NO | — |
| active | boolean | YES | `true` |
| tax_mode | text | YES | `'add_on'` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `discounts`

Discount definitions that can be applied to checks or items.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| type | text | NO | — |
| value | numeric(10,2) | NO | — |
| requires_manager_approval | boolean | YES | `false` |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `service_charges`

Automatic or manual service charges (e.g., gratuity for large parties).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| type | text | NO | — |
| value | numeric(10,2) | NO | — |
| auto_apply | boolean | YES | `false` |
| order_types | text[] | YES | — |
| is_taxable | boolean | YES | `false` |
| tax_group_id | varchar | YES | — |
| revenue_category | text | YES | `'revenue'` |
| post_to_tip_pool | boolean | YES | `false` |
| tip_eligible | boolean | YES | `false` |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `tax_group_id` → `tax_groups.id`
- **Notes:** `is_taxable` + `tax_group_id` control tax applicability. `revenue_category` is `'revenue'` or `'non_revenue'`. `post_to_tip_pool` includes in tip pool calculations; `tip_eligible` marks for employee tip distribution.

---

### `check_service_charges`

Transactional ledger of service charges applied to checks. Each row snapshots the charge configuration at time of application for audit/reporting.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| service_charge_id | varchar | NO | — |
| name | text | NO | — |
| code | text | NO | — |
| charge_type | text | NO | — |
| charge_value | numeric(10,2) | NO | — |
| computed_amount | numeric(12,2) | NO | — |
| is_taxable | boolean | YES | `false` |
| tax_group_id | varchar | YES | — |
| revenue_category | text | YES | `'revenue'` |
| post_to_tip_pool | boolean | YES | `false` |
| tip_eligible | boolean | YES | `false` |
| voided | boolean | YES | `false` |
| voided_by | varchar | YES | — |
| voided_at | timestamp | YES | — |
| void_reason | text | YES | — |
| business_date | date | YES | — |
| applied_by | varchar | YES | — |
| applied_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `service_charge_id` → `service_charges.id`
  - `applied_by` → `employees.id`
  - `voided_by` → `employees.id`
- **Indexes:**
  - `idx_check_sc_check_id` on `check_id`
  - `idx_check_sc_biz_date` on `business_date`
- **Notes:** Reports read from this ledger excluding `voided=true`. `computed_amount` is the actual dollar amount applied. Snapshot fields (`name`, `code`, `charge_type`, `charge_value`, `is_taxable`, etc.) capture config at time of application for audit trail.

---

### `tenders`

Payment tender types (e.g., Cash, Credit Card, Gift Card).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| type | text | NO | — |
| active | boolean | YES | `true` |
| payment_processor_id | varchar | YES | — |
| is_system | boolean | YES | `false` |
| pop_drawer | boolean | YES | `false` |
| allow_tips | boolean | YES | `false` |
| allow_over_tender | boolean | YES | `false` |
| print_check_on_payment | boolean | YES | `true` |
| require_manager_approval | boolean | YES | `false` |
| requires_payment_processor | boolean | YES | `false` |
| display_order | integer | YES | `0` |
| is_cash_media | boolean | YES | `false` |
| is_card_media | boolean | YES | `false` |
| is_gift_media | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `payment_processor_id` → `payment_processors.id`
- **Notes:** `is_cash_media`, `is_card_media`, `is_gift_media` are dedicated media classification flags used by reporting queries instead of string comparisons on `type`. Backfilled from `type` column: `cash` → `is_cash_media=true`, `credit`/`debit` → `is_card_media=true`, `gift` → `is_gift_media=true`.

---

### `config_overrides`

Hierarchical configuration overrides allowing property/RVC-level customization of enterprise-level entities.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| entity_type | text | NO | — |
| source_item_id | text | NO | — |
| override_item_id | text | NO | — |
| override_level | text | NO | — |
| override_scope_id | text | NO | — |
| enterprise_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`

---

### `config_versions`

Version tracking for configuration changes, used for offline sync.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | serial | NO | auto-increment |
| property_id | varchar | NO | — |
| version | integer | NO | — |
| table_name | varchar(50) | NO | — |
| entity_id | varchar | NO | — |
| operation | varchar(10) | NO | — |
| data | jsonb | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

### `item_availability`

Real-time item availability tracking and 86'd item management.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| menu_item_id | varchar | NO | — |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| business_date | text | NO | — |
| initial_quantity | integer | YES | — |
| current_quantity | integer | YES | — |
| sold_quantity | integer | YES | `0` |
| is_available | boolean | YES | `true` |
| is_86ed | boolean | YES | `false` |
| eighty_sixed_at | timestamp | YES | — |
| eighty_sixed_by_id | varchar | YES | — |
| low_stock_threshold | integer | YES | `5` |
| alert_sent | boolean | YES | `false` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `menu_item_id` → `menu_items.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `eighty_sixed_by_id` → `employees.id`

---

### `ingredient_prefixes`

Prefix modifiers for conversational ordering (e.g., "No", "Extra", "Sub", "Light").

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| print_name | text | YES | — |
| price_factor | numeric(5,2) | YES | `1.00` |
| display_order | integer | YES | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `menu_item_recipe_ingredients`

Recipe ingredients linked to menu items for conversational ordering and menu build.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| menu_item_id | varchar | NO | — |
| ingredient_name | text | NO | — |
| ingredient_category | text | YES | — |
| default_quantity | integer | YES | `1` |
| is_default | boolean | YES | `true` |
| price_per_unit | numeric(10,2) | YES | `0.00` |
| display_order | integer | YES | `0` |
| active | boolean | YES | `true` |
| modifier_id | varchar | YES | — |
| default_prefix_id | varchar | YES | — |
| sort_order | integer | YES | `0` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `menu_item_id` → `menu_items.id`
  - `modifier_id` → `modifiers.id`
  - `default_prefix_id` → `ingredient_prefixes.id`

---

## 4. Checks & Orders (Transaction Core)

### `checks`

The primary transaction record — represents a guest check/order.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_number | integer | NO | — |
| rvc_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| customer_id | varchar | YES | — |
| order_type | text | NO | — |
| status | text | NO | `'open'` |
| subtotal | numeric(10,2) | YES | `0` |
| tax_total | numeric(10,2) | YES | `0` |
| discount_total | numeric(10,2) | YES | `0` |
| service_charge_total | numeric(10,2) | YES | `0` |
| tip_total | numeric(10,2) | YES | `0` |
| total | numeric(10,2) | YES | `0` |
| guest_count | integer | YES | `1` |
| table_number | text | YES | — |
| opened_at | timestamp | YES | `now()` |
| closed_at | timestamp | YES | — |
| origin_business_date | text | YES | — |
| business_date | text | YES | — |
| loyalty_points_earned | integer | YES | — |
| loyalty_points_redeemed | integer | YES | — |
| test_mode | boolean | YES | `false` |
| fulfillment_status | text | YES | — |
| online_order_id | varchar | YES | — |
| customer_name | text | YES | — |
| platform_source | text | YES | — |
| origin_device_id | varchar | YES | — |
| origin_created_at | timestamp | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `(rvc_id, check_number)` via `idx_checks_rvc_check_number`
- **Foreign Keys:**
  - `rvc_id` → `rvcs.id`
  - `employee_id` → `employees.id`

---

### `check_items`

Individual line items on a check.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| round_id | varchar | YES | — |
| menu_item_id | varchar | YES | — |
| menu_item_name | text | NO | — |
| quantity | integer | YES | `1` |
| unit_price | numeric(10,2) | NO | — |
| modifiers | jsonb | YES | — |
| sent | boolean | YES | `false` |
| voided | boolean | YES | `false` |
| void_reason | text | YES | — |
| voided_by_employee_id | varchar | YES | — |
| voided_at | timestamp | YES | — |
| added_at | timestamp | YES | `now()` |
| item_status | text | YES | `'active'` |
| business_date | text | YES | — |
| tax_group_id_at_sale | varchar | YES | — |
| tax_mode_at_sale | text | YES | — |
| tax_rate_at_sale | numeric | YES | — |
| tax_amount | numeric(10,2) | YES | — |
| taxable_amount | numeric(10,2) | YES | — |
| discount_id | varchar | YES | — |
| discount_name | text | YES | — |
| discount_amount | numeric(10,2) | YES | — |
| discount_applied_by | varchar | YES | — |
| discount_approved_by | varchar | YES | — |
| is_non_revenue | boolean | YES | `false` |
| non_revenue_type | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `round_id` → `rounds.id`
  - `menu_item_id` → `menu_items.id`
  - `voided_by_employee_id` → `employees.id`
  - `discount_id` → `discounts.id`
  - `discount_applied_by` → `employees.id`
  - `discount_approved_by` → `employees.id`

---

### `check_payments`

Payments applied to a check.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| tender_id | varchar | YES | — |
| tender_name | text | YES | — |
| amount | numeric(10,2) | NO | — |
| paid_at | timestamp | YES | `now()` |
| employee_id | varchar | YES | — |
| business_date | text | YES | — |
| payment_transaction_id | varchar | YES | — |
| payment_status | text | YES | `'completed'` |
| tip_amount | numeric(10,2) | YES | — |
| origin_device_id | varchar | YES | — |
| payment_attempt_id | varchar | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `payment_attempt_id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `tender_id` → `tenders.id`
  - `employee_id` → `employees.id`

---

### `check_discounts`

Discounts applied at the check level.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| discount_id | varchar | YES | — |
| discount_name | text | YES | — |
| amount | numeric(10,2) | NO | — |
| applied_at | timestamp | YES | `now()` |
| employee_id | varchar | YES | — |
| manager_approval_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `discount_id` → `discounts.id`
  - `employee_id` → `employees.id`

---

### `check_locks`

Pessimistic locking mechanism for multi-workstation check editing.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| workstation_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| acquired_at | timestamp | YES | `now()` |
| expires_at | timestamp | YES | — |
| lock_mode | text | YES | `'green'` |

- **Primary Key:** `id`
- **Unique Constraints:** `check_id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `workstation_id` → `workstations.id`
  - `employee_id` → `employees.id`

---

### `rounds`

Groups of items sent to the kitchen together; each "send" creates a new round.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| round_number | integer | NO | — |
| sent_at | timestamp | YES | `now()` |
| sent_by_employee_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `sent_by_employee_id` → `employees.id`

---

### `rvc_counters`

Concurrency-safe auto-incrementing check number sequences per RVC.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| rvc_id | varchar | NO | — |
| next_check_number | integer | NO | `1` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `rvc_id`
- **Foreign Keys:**
  - `rvc_id` → `rvcs.id`

---

### `idempotency_keys`

Prevents duplicate transaction processing for POS operations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | NO | — |
| workstation_id | varchar | NO | — |
| operation | text | NO | — |
| idempotency_key | varchar | NO | — |
| status | text | NO | `'processing'` |
| request_hash | text | YES | — |
| response_status | integer | YES | — |
| response_body | text | YES | — |
| created_at | timestamp | YES | `now()` |
| expires_at | timestamp | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `(enterprise_id, workstation_id, operation, idempotency_key)` via `idx_idempotency_keys_unique`
- **Notable Indexes:** `idx_idempotency_keys_expires_at` on `expires_at`

---

## 5. Payment Processing

### `payment_processors`

Gateway-agnostic payment processor configurations per property.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| gateway_type | text | NO | — |
| environment | text | YES | `'sandbox'` |
| credential_key_prefix | text | NO | — |
| gateway_settings | jsonb | YES | — |
| supports_tokenization | boolean | YES | `true` |
| supports_tip_adjust | boolean | YES | `true` |
| supports_partial_auth | boolean | YES | `false` |
| supports_emv | boolean | YES | `true` |
| supports_contactless | boolean | YES | `true` |
| auth_hold_minutes | integer | YES | `1440` |
| settlement_time | text | YES | `'02:00'` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

### `payment_gateway_config`

Hierarchy-aware payment gateway configuration with Simphony-class inheritance (Enterprise → Property → Workstation). Settings defined at higher levels inherit down; overrides at lower levels take precedence.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| config_level | text | NO | — |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| gateway_type | text | YES | — |
| integration_model | text | YES | — |
| environment | text | YES | — |
| credential_key_prefix | text | YES | — |
| merchant_id | text | YES | — |
| terminal_id | text | YES | — |
| site_id | text | YES | — |
| device_id | text | YES | — |
| license_id | text | YES | — |
| terminal_ip_address | text | YES | — |
| terminal_port | text | YES | — |
| terminal_connection_type | text | YES | — |
| enable_sale | boolean | YES | `false` |
| enable_void | boolean | YES | `false` |
| enable_refund | boolean | YES | `false` |
| enable_auth_capture | boolean | YES | `false` |
| enable_manual_entry | boolean | YES | `false` |
| enable_debit | boolean | YES | `false` |
| enable_ebt | boolean | YES | `false` |
| enable_healthcare | boolean | YES | `false` |
| enable_contactless | boolean | YES | `false` |
| enable_emv | boolean | YES | `false` |
| enable_msr | boolean | YES | `false` |
| enable_partial_approval | boolean | YES | `false` |
| enable_tokenization | boolean | YES | `false` |
| enable_store_and_forward | boolean | YES | `false` |
| enable_surcharge | boolean | YES | `false` |
| enable_tip_adjust | boolean | YES | `false` |
| enable_incremental_auth | boolean | YES | `false` |
| enable_cashback | boolean | YES | `false` |
| surcharge_percent | text | YES | — |
| saf_floor_limit | text | YES | — |
| saf_max_transactions | integer | YES | — |
| auth_hold_minutes | integer | YES | — |
| enable_auto_batch_close | boolean | YES | `false` |
| batch_close_time | text | YES | — |
| enable_manual_batch_close | boolean | YES | `false` |
| receipt_show_emv_fields | boolean | YES | `false` |
| receipt_show_aid | boolean | YES | `false` |
| receipt_show_tvr | boolean | YES | `false` |
| receipt_show_tsi | boolean | YES | `false` |
| receipt_show_app_label | boolean | YES | `false` |
| receipt_show_entry_method | boolean | YES | `false` |
| receipt_print_merchant_copy | boolean | YES | `false` |
| receipt_print_customer_copy | boolean | YES | `false` |
| enable_debug_logging | boolean | YES | `false` |
| log_raw_requests | boolean | YES | `false` |
| log_raw_responses | boolean | YES | `false` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
- **Inheritance:** `config_level` is one of `enterprise`, `property`, `workstation`. Only one config row per level+scope combination.

---

### `payment_transactions`

Tracks all gateway communications for card payments (PCI compliant — no full card data stored).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_payment_id | varchar | YES | — |
| payment_processor_id | varchar | NO | — |
| gateway_transaction_id | text | YES | — |
| auth_code | text | YES | — |
| reference_number | text | YES | — |
| card_brand | text | YES | — |
| card_last4 | text | YES | — |
| card_expiry_month | integer | YES | — |
| card_expiry_year | integer | YES | — |
| entry_mode | text | YES | — |
| auth_amount | integer | NO | — |
| capture_amount | integer | YES | — |
| tip_amount | integer | YES | `0` |
| status | text | NO | `'pending'` |
| transaction_type | text | NO | — |
| response_code | text | YES | — |
| response_message | text | YES | — |
| avs_result | text | YES | — |
| cvv_result | text | YES | — |
| initiated_at | timestamp | YES | `now()` |
| authorized_at | timestamp | YES | — |
| captured_at | timestamp | YES | — |
| settled_at | timestamp | YES | — |
| terminal_id | text | YES | — |
| workstation_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| original_transaction_id | varchar | YES | — |
| refunded_amount | integer | YES | `0` |
| batch_id | text | YES | — |
| business_date | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `check_payment_id` → `check_payments.id`
  - `payment_processor_id` → `payment_processors.id`
  - `workstation_id` → `workstations.id`
  - `employee_id` → `employees.id`

---

### `terminal_devices`

Physical EMV card reader devices.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| payment_processor_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| name | text | NO | — |
| model | text | NO | — |
| serial_number | text | YES | — |
| terminal_id | text | YES | — |
| connection_type | text | YES | `'ethernet'` |
| network_address | text | YES | — |
| port | integer | YES | — |
| cloud_device_id | text | YES | — |
| status | text | YES | `'offline'` |
| last_heartbeat | timestamp | YES | — |
| capabilities | jsonb | YES | — |
| firmware_version | text | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `payment_processor_id` → `payment_processors.id`
  - `workstation_id` → `workstations.id`

---

### `terminal_sessions`

Active payment sessions on EMV terminals.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| terminal_device_id | varchar | NO | — |
| check_id | varchar | YES | — |
| tender_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| amount | integer | NO | — |
| tip_amount | integer | YES | `0` |
| currency | text | YES | `'usd'` |
| status | text | YES | `'pending'` |
| status_message | text | YES | — |
| processor_reference | text | YES | — |
| payment_transaction_id | varchar | YES | — |
| initiated_at | timestamp | YES | `now()` |
| completed_at | timestamp | YES | — |
| expires_at | timestamp | YES | — |
| metadata | jsonb | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `terminal_device_id` → `terminal_devices.id`
  - `check_id` → `checks.id`
  - `tender_id` → `tenders.id`
  - `employee_id` → `employees.id`
  - `workstation_id` → `workstations.id`
  - `payment_transaction_id` → `payment_transactions.id`

---

### `refunds`

Refund header records for post-close refund processing.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| refund_number | text | YES | — |
| rvc_id | varchar | YES | — |
| original_check_id | varchar | YES | — |
| original_check_number | integer | YES | — |
| refund_type | text | NO | — |
| subtotal | numeric(10,2) | NO | — |
| tax_total | numeric(10,2) | YES | — |
| total | numeric(10,2) | NO | — |
| reason | text | YES | — |
| processed_by_employee_id | varchar | YES | — |
| manager_approval_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |
| business_date | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `rvc_id` → `rvcs.id`
  - `original_check_id` → `checks.id`
  - `processed_by_employee_id` → `employees.id`

---

### `refund_items`

Individual items included in a refund.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| refund_id | varchar | NO | — |
| original_check_item_id | varchar | YES | — |
| menu_item_name | text | NO | — |
| quantity | integer | YES | `1` |
| unit_price | numeric(10,2) | NO | — |
| modifiers | jsonb | YES | — |
| tax_amount | numeric(10,2) | YES | `0` |
| refund_amount | numeric(10,2) | NO | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `refund_id` → `refunds.id`
  - `original_check_item_id` → `check_items.id`

---

### `refund_payments`

Payment methods used for refund disbursement.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| refund_id | varchar | NO | — |
| original_payment_id | varchar | YES | — |
| tender_id | varchar | YES | — |
| tender_name | text | YES | — |
| amount | numeric(10,2) | NO | — |
| gateway_refund_id | text | YES | — |
| gateway_status | text | YES | — |
| gateway_message | text | YES | — |
| refund_method | text | YES | `'manual'` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `refund_id` → `refunds.id`
  - `original_payment_id` → `check_payments.id`
  - `tender_id` → `tenders.id`

---

## 6. Kitchen Display System

### `kds_devices`

Kitchen display station configurations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| station_type | text | YES | `'hot'` |
| show_draft_items | boolean | YES | `false` |
| show_sent_items_only | boolean | YES | `true` |
| group_by | text | YES | `'order'` |
| show_timers | boolean | YES | `true` |
| auto_sort_by | text | YES | `'time'` |
| allow_bump | boolean | YES | `true` |
| allow_recall | boolean | YES | `true` |
| allow_void_display | boolean | YES | `true` |
| expo_mode | boolean | YES | `false` |
| ws_channel | text | YES | — |
| ip_address | text | YES | — |
| is_online | boolean | YES | `false` |
| last_seen_at | timestamp | YES | — |
| active | boolean | YES | `true` |
| new_order_sound | boolean | YES | `true` |
| new_order_blink_seconds | integer | YES | `5` |
| color_alert_1_enabled | boolean | YES | `true` |
| color_alert_1_seconds | integer | YES | `60` |
| color_alert_1_color | text | YES | `'yellow'` |
| color_alert_2_enabled | boolean | YES | `true` |
| color_alert_2_seconds | integer | YES | `180` |
| color_alert_2_color | text | YES | `'orange'` |
| color_alert_3_enabled | boolean | YES | `true` |
| color_alert_3_seconds | integer | YES | `300` |
| color_alert_3_color | text | YES | `'red'` |
| font_scale | integer | YES | `100` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

### `kds_tickets`

Kitchen tickets representing items to be prepared, created when orders are sent.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| check_id | varchar | NO | — |
| round_id | varchar | YES | — |
| order_device_id | varchar | YES | — |
| status | text | YES | `'draft'` |
| bumped_at | timestamp | YES | — |
| bumped_by_employee_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |
| kds_device_id | varchar | YES | — |
| station_type | text | YES | — |
| rvc_id | varchar | YES | — |
| is_preview | boolean | YES | `false` |
| paid | boolean | YES | `false` |
| is_recalled | boolean | YES | `false` |
| recalled_at | timestamp | YES | — |
| subtotal | numeric(10,2) | YES | — |
| origin_device_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `check_id` → `checks.id`
  - `round_id` → `rounds.id`
  - `order_device_id` → `order_devices.id`
  - `bumped_by_employee_id` → `employees.id`
  - `kds_device_id` → `kds_devices.id`
  - `rvc_id` → `rvcs.id`

---

### `kds_ticket_items`

Individual items within a KDS ticket.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| kds_ticket_id | varchar | NO | — |
| check_item_id | varchar | NO | — |
| status | text | YES | `'pending'` |
| is_ready | boolean | YES | `false` |
| ready_at | timestamp | YES | — |
| is_modified | boolean | YES | `false` |
| modified_at | timestamp | YES | — |
| sort_priority | integer | YES | `0` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `kds_ticket_id` → `kds_tickets.id`
  - `check_item_id` → `check_items.id`

---

## 7. Order Routing

### `order_devices`

Logical order routing devices that determine where items are sent (kitchen, bar, etc.).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| active | boolean | YES | `true` |
| code | text | YES | — |
| send_on | text | YES | `'send_button'` |
| send_voids | boolean | YES | `true` |
| send_reprints | boolean | YES | `true` |
| kds_device_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `kds_device_id` → `kds_devices.id`

---

### `workstation_order_devices`

Controls which Order Devices a workstation is allowed to send orders to. If no rows exist for a workstation, it defaults to sending to ALL order devices (backward compatible). This enables workstation-level KDS routing where each workstation can be restricted to specific expo/specialty stations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| workstation_id | varchar | NO | — |
| order_device_id | varchar | NO | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `workstation_id` → `workstations.id`
  - `order_device_id` → `order_devices.id`

---

### `order_device_kds`

Links order devices to KDS displays for routing.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| order_device_id | varchar | NO | — |
| kds_device_id | varchar | NO | — |
| display_order | integer | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `order_device_id` → `order_devices.id`
  - `kds_device_id` → `kds_devices.id`

---

### `order_device_printers`

Links order devices to printers for kitchen ticket printing.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| order_device_id | varchar | NO | — |
| printer_id | varchar | NO | — |
| display_order | integer | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `order_device_id` → `order_devices.id`
  - `printer_id` → `printers.id`

---

## 8. Printing

### `printers`

Physical printer configurations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| printer_type | text | YES | `'kitchen'` |
| connection_type | text | YES | `'network'` |
| ip_address | text | YES | — |
| port | integer | YES | `9100` |
| driver_protocol | text | YES | `'epson'` |
| character_width | integer | YES | `42` |
| auto_cut | boolean | YES | `true` |
| print_logo | boolean | YES | `false` |
| print_order_header | boolean | YES | `true` |
| print_order_footer | boolean | YES | `true` |
| print_voids | boolean | YES | `true` |
| print_reprints | boolean | YES | `true` |
| retry_attempts | integer | YES | `3` |
| failure_handling_mode | text | YES | `'alert_cashier'` |
| is_online | boolean | YES | `false` |
| last_seen_at | timestamp | YES | — |
| active | boolean | YES | `true` |
| model | text | YES | — |
| subnet_mask | text | YES | `'255.255.255.0'` |
| com_port | text | YES | — |
| baud_rate | integer | YES | `9600` |
| windows_printer_name | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
- **Notes:**
  - `connection_type` can be `'network'` (default), `'serial'`, or `'windows_printer'`
  - For serial printers: `com_port` (e.g., COM1-COM8) and `baud_rate` are required; `ip_address`/`port` should be null
  - For network printers: `ip_address`/`port` are required; `com_port`/`baud_rate` should be null
  - For Windows USB printers: `windows_printer_name` is required (exact name from Windows Devices and Printers, e.g., "Star TSP100 CUTTER (TSP143)")
  - Serial and Windows USB printing only work from the Electron desktop app

---

### `print_classes`

Categorize menu items for print routing (e.g., "Hot Food", "Cold Drinks").

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| name | text | NO | — |
| code | text | NO | — |
| rvc_id | varchar | YES | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `print_class_routing`

Routes print classes to order devices per property/RVC.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| print_class_id | varchar | NO | — |
| order_device_id | varchar | NO | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `print_class_id` → `print_classes.id`
  - `order_device_id` → `order_devices.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `print_jobs`

Individual print job queue entries with ESC/POS data.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| printer_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| job_type | text | NO | — |
| status | text | YES | `'pending'` |
| priority | integer | YES | `5` |
| check_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| business_date | text | YES | — |
| esc_pos_data | text | YES | — |
| plain_text_data | text | YES | — |
| attempts | integer | YES | `0` |
| max_attempts | integer | YES | `3` |
| last_error | text | YES | — |
| created_at | timestamp | YES | `now()` |
| printed_at | timestamp | YES | — |
| expires_at | timestamp | YES | — |
| print_agent_id | varchar | YES | — |
| printer_ip | text | YES | — |
| printer_port | integer | YES | `9100` |
| printer_name | text | YES | — |
| sent_to_agent_at | timestamp | YES | — |
| leased_by | varchar | YES | — |
| leased_until | timestamp | YES | — |
| dedupe_key | text | YES | — |
| origin_device_id | varchar | YES | — |
| connection_type | text | YES | `'network'` |
| com_port | text | YES | — |
| baud_rate | integer | YES | — |
| windows_printer_name | text | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `dedupe_key`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `printer_id` → `printers.id`
  - `workstation_id` → `workstations.id`
  - `check_id` → `checks.id`
  - `employee_id` → `employees.id`
  - `print_agent_id` → `print_agents.id`
- **Notes:**
  - `connection_type` determines how the print agent routes this job: `'network'`, `'serial'`, or `'windows_printer'`
  - `windows_printer_name` is the exact Windows printer device name for USB printer routing

---

### `print_agents`

On-premise print agent services that relay print jobs to physical printers.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| description | text | YES | — |
| agent_token | text | NO | — |
| status | text | YES | `'offline'` |
| last_heartbeat | timestamp | YES | — |
| last_connected_at | timestamp | YES | — |
| last_disconnected_at | timestamp | YES | — |
| agent_version | text | YES | — |
| hostname | text | YES | — |
| ip_address | text | YES | — |
| os_info | text | YES | — |
| auto_reconnect | boolean | YES | `true` |
| heartbeat_interval_ms | integer | YES | `30000` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Unique Constraints:** `agent_token`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

## 9. Workstations & Devices

### `workstations`

POS workstation configurations with peripheral assignments and operational settings.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| device_type | text | YES | `'pos_terminal'` |
| default_order_type | text | YES | `'dine_in'` |
| fast_transaction_enabled | boolean | YES | `false` |
| require_begin_check | boolean | YES | `true` |
| allow_pickup_check | boolean | YES | `true` |
| allow_reopen_closed_checks | boolean | YES | `false` |
| allow_offline_operation | boolean | YES | `false` |
| allowed_role_ids | text[] | YES | — |
| manager_approval_device | boolean | YES | `false` |
| clock_in_allowed | boolean | YES | `true` |
| default_receipt_printer_id | varchar | YES | — |
| backup_receipt_printer_id | varchar | YES | — |
| default_order_device_id | varchar | YES | — |
| default_kds_expo_id | varchar | YES | — |
| ip_address | text | YES | — |
| hostname | text | YES | — |
| is_online | boolean | YES | `false` |
| last_seen_at | timestamp | YES | — |
| active | boolean | YES | `true` |
| report_printer_id | varchar | YES | — |
| backup_report_printer_id | varchar | YES | — |
| void_printer_id | varchar | YES | — |
| backup_void_printer_id | varchar | YES | — |
| auto_logout_minutes | integer | YES | — |
| service_host_url | text | YES | — |
| service_bindings | text[] | YES | — |
| setup_status | text | YES | `'pending'` |
| last_setup_at | timestamp | YES | — |
| last_setup_by | varchar | YES | — |
| installed_services | text[] | YES | — |
| device_token | text | YES | — |
| registered_device_id | varchar | YES | — |
| font_scale | integer | YES | `100` |
| com_port | text | YES | — |
| com_baud_rate | integer | YES | `9600` |
| com_data_bits | integer | YES | `8` |
| com_stop_bits | text | YES | `'1'` |
| com_parity | text | YES | `'none'` |
| com_flow_control | text | YES | `'none'` |
| cash_drawer_enabled | boolean | YES | `false` |
| cash_drawer_printer_id | varchar | YES | — |
| cash_drawer_kick_pin | text | YES | `'pin2'` |
| cash_drawer_pulse_duration | integer | YES | `100` |
| cash_drawer_auto_open_on_cash | boolean | YES | `true` |
| cash_drawer_auto_open_on_drop | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
- **Notes:**
  - Serial COM port fields configure the physical RS-232 serial connection for serial printers connected to the workstation.
  - `com_port`: COM1–COM8 (COM1 is the standard default port).
  - `com_baud_rate`: Communication speed — 2400, 4800, 9600 (standard), 19200, 38400, 57600, 115200.
  - `com_data_bits`: 7 or 8 (standard).
  - `com_stop_bits`: 1 (standard), 1.5, or 2.
  - `com_parity`: none (standard), even, odd, mark, space.
  - `com_flow_control`: none (standard), xon_xoff, rts_cts, dtr_dsr.
  - Cash drawer fields configure printer-driven cash drawers connected via ESC/POS receipt printers. The serial printer's DK (drawer kick) port connects to the cash drawer.
  - `cash_drawer_printer_id` references a `printers.id` record; defaults to `default_receipt_printer_id` if null.
  - `cash_drawer_kick_pin`: `pin2` (standard, most drawers) or `pin5` (alternate, dual-drawer setups).
  - `cash_drawer_pulse_duration`: Electronic kick pulse duration in milliseconds (50–500ms).

---

### `devices`

Mobile/tablet devices enrolled in the system (Android, iOS).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| device_id | text | NO | — |
| name | text | NO | — |
| device_type | text | NO | — |
| os_type | text | YES | — |
| os_version | text | YES | — |
| hardware_model | text | YES | — |
| serial_number | text | YES | — |
| ip_address | text | YES | — |
| mac_address | text | YES | — |
| current_app_version | text | YES | — |
| target_app_version | text | YES | — |
| status | text | YES | `'pending'` |
| last_seen_at | timestamp | YES | — |
| enrolled_at | timestamp | YES | — |
| auto_update | boolean | YES | `true` |
| environment | text | YES | `'production'` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| source_config_type | text | YES | — |
| source_config_id | varchar | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `device_id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `registered_devices`

Browser-based devices authorized to access POS/KDS via enrollment code flow.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| device_type | text | NO | — |
| workstation_id | varchar | YES | — |
| kds_device_id | varchar | YES | — |
| name | text | NO | — |
| enrollment_code | text | YES | — |
| enrollment_code_expires_at | timestamp | YES | — |
| device_token | text | YES | — |
| device_token_hash | text | YES | — |
| status | text | NO | `'pending'` |
| enrolled_at | timestamp | YES | — |
| last_access_at | timestamp | YES | — |
| os_info | text | YES | — |
| browser_info | text | YES | — |
| screen_resolution | text | YES | — |
| serial_number | text | YES | — |
| asset_tag | text | YES | — |
| mac_address | text | YES | — |
| ip_address | text | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| created_by_employee_id | varchar | YES | — |
| disabled_at | timestamp | YES | — |
| disabled_by_employee_id | varchar | YES | — |
| disabled_reason | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `workstation_id` → `workstations.id`
  - `kds_device_id` → `kds_devices.id`
  - `created_by_employee_id` → `employees.id`
  - `disabled_by_employee_id` → `employees.id`

---

### `device_enrollment_tokens`

Pre-generated enrollment tokens for bulk device provisioning.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| token | text | NO | — |
| device_type | text | NO | — |
| max_uses | integer | YES | `1` |
| used_count | integer | YES | `0` |
| expires_at | timestamp | YES | — |
| created_by_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |
| active | boolean | YES | `true` |
| name | text | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `token`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `created_by_id` → `employees.id`

---

### `device_heartbeats`

Periodic health check data from enrolled devices.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| device_id | varchar | NO | — |
| app_version | text | YES | — |
| os_version | text | YES | — |
| ip_address | text | YES | — |
| cpu_usage | numeric | YES | — |
| memory_usage | numeric | YES | — |
| disk_usage | numeric | YES | — |
| timestamp | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `device_id` → `devices.id`

---

## 10. Cash Management

### `cash_drawers`

Physical cash drawer hardware assignments.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| workstation_id | varchar | YES | — |
| name | text | NO | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `workstation_id` → `workstations.id`

---

### `drawer_assignments`

Employee-to-drawer assignments for a business date with opening/closing counts.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| drawer_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| business_date | text | NO | — |
| status | text | YES | `'assigned'` |
| opening_amount | numeric(10,2) | YES | — |
| expected_amount | numeric(10,2) | YES | `0` |
| actual_amount | numeric(10,2) | YES | — |
| variance | numeric(10,2) | YES | — |
| opened_at | timestamp | YES | — |
| closed_at | timestamp | YES | — |
| closed_by_id | varchar | YES | — |
| notes | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `drawer_id` → `cash_drawers.id`
  - `employee_id` → `employees.id`
  - `closed_by_id` → `employees.id`

---

### `cash_transactions`

Individual cash movements (sales, pay-ins, pay-outs, tips).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| drawer_id | varchar | YES | — |
| assignment_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| transaction_type | text | NO | — |
| amount | numeric(10,2) | NO | — |
| business_date | text | YES | — |
| check_id | varchar | YES | — |
| reason | text | YES | — |
| manager_approval_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `drawer_id` → `cash_drawers.id`
  - `assignment_id` → `drawer_assignments.id`
  - `employee_id` → `employees.id`
  - `check_id` → `checks.id`

---

### `safe_counts`

Safe/vault cash counts for daily reconciliation.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| business_date | text | NO | — |
| count_type | text | YES | `'daily'` |
| expected_amount | numeric(10,2) | YES | — |
| actual_amount | numeric(10,2) | YES | — |
| variance | numeric(10,2) | YES | — |
| denominations | jsonb | YES | — |
| notes | text | YES | — |
| verified_by_id | varchar | YES | — |
| verified_at | timestamp | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `verified_by_id` → `employees.id`

---

## 11. Time & Attendance

### `timecards`

Daily timecard records per employee per job code with calculated hours and pay.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| pay_period_id | varchar | YES | — |
| business_date | text | NO | — |
| job_code_id | varchar | YES | — |
| clock_in_time | timestamp | YES | — |
| clock_out_time | timestamp | YES | — |
| regular_hours | numeric(6,2) | YES | `0` |
| overtime_hours | numeric(6,2) | YES | `0` |
| double_time_hours | numeric(6,2) | YES | `0` |
| break_minutes | integer | YES | `0` |
| paid_break_minutes | integer | YES | `0` |
| unpaid_break_minutes | integer | YES | `0` |
| total_hours | numeric(6,2) | YES | `0` |
| regular_pay | numeric(10,2) | YES | `0` |
| overtime_pay | numeric(10,2) | YES | `0` |
| total_pay | numeric(10,2) | YES | `0` |
| tips | numeric(10,2) | YES | `0` |
| status | text | YES | `'open'` |
| approved_by_id | varchar | YES | — |
| approved_at | timestamp | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |
| pay_rate | numeric(10,2) | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `pay_period_id` → `pay_periods.id`
  - `job_code_id` → `job_codes.id`
  - `approved_by_id` → `employees.id`

---

### `time_punches`

Individual clock in/out/break punch events.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| job_code_id | varchar | YES | — |
| punch_type | text | NO | — |
| actual_timestamp | timestamp | NO | — |
| rounded_timestamp | timestamp | YES | — |
| business_date | text | NO | — |
| source | text | YES | `'pos'` |
| notes | text | YES | — |
| is_edited | boolean | YES | `false` |
| original_timestamp | timestamp | YES | — |
| edited_by_id | varchar | YES | — |
| edited_at | timestamp | YES | — |
| edit_reason | text | YES | — |
| voided | boolean | YES | `false` |
| voided_by_id | varchar | YES | — |
| voided_at | timestamp | YES | — |
| void_reason | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `job_code_id` → `job_codes.id`
  - `edited_by_id` → `employees.id`
  - `voided_by_id` → `employees.id`

---

### `timecard_edits`

Audit trail for all timecard and time punch modifications.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| target_type | text | NO | — |
| target_id | varchar | NO | — |
| edit_type | text | NO | — |
| before_value | jsonb | YES | — |
| after_value | jsonb | YES | — |
| reason_code | text | YES | — |
| notes | text | YES | — |
| edited_by_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |
| edited_by_emc_user_id | varchar | YES | — |
| edited_by_display_name | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `edited_by_id` → `employees.id`
  - `edited_by_emc_user_id` → `emc_users.id`

---

### `timecard_exceptions`

Flagged issues on timecards (missed punches, overtime, etc.).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| timecard_id | varchar | YES | — |
| time_punch_id | varchar | YES | — |
| exception_type | text | NO | — |
| business_date | text | NO | — |
| description | text | YES | — |
| severity | text | YES | `'warning'` |
| status | text | YES | `'pending'` |
| resolved_by_id | varchar | YES | — |
| resolved_at | timestamp | YES | — |
| resolution_notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `timecard_id` → `timecards.id`
  - `time_punch_id` → `time_punches.id`
  - `resolved_by_id` → `employees.id`

---

### `pay_periods`

Defined pay periods for payroll processing.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| start_date | text | NO | — |
| end_date | text | NO | — |
| status | text | YES | `'open'` |
| locked_at | timestamp | YES | — |
| locked_by_id | varchar | YES | — |
| exported_at | timestamp | YES | — |
| exported_by_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `locked_by_id` → `employees.id`
  - `exported_by_id` → `employees.id`

---

### `overtime_rules`

Property-specific overtime calculation rules per labor law jurisdiction.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| description | text | YES | — |
| daily_regular_hours | numeric(4,2) | YES | `8.00` |
| daily_overtime_threshold | numeric(4,2) | YES | `8.00` |
| daily_double_time_threshold | numeric(4,2) | YES | — |
| weekly_overtime_threshold | numeric(4,2) | YES | `40.00` |
| weekly_double_time_threshold | numeric(4,2) | YES | — |
| overtime_multiplier | numeric(3,2) | YES | `1.50` |
| double_time_multiplier | numeric(3,2) | YES | `2.00` |
| enable_daily_overtime | boolean | YES | `true` |
| enable_daily_double_time | boolean | YES | `false` |
| enable_weekly_overtime | boolean | YES | `true` |
| enable_weekly_double_time | boolean | YES | `false` |
| week_start_day | integer | YES | `0` |
| effective_date | text | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

### `minor_labor_rules`

State-specific labor law rules for minor (under-18) employees.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| state_code | text | NO | `'CA'` |
| minor_age_threshold | integer | YES | `18` |
| young_minor_age_threshold | integer | YES | `16` |
| school_day_max_hours | numeric(4,2) | YES | `4.00` |
| school_week_max_hours | numeric(4,2) | YES | `18.00` |
| school_day_start_time | text | YES | `'07:00'` |
| school_day_end_time | text | YES | `'19:00'` |
| non_school_day_max_hours | numeric(4,2) | YES | `8.00` |
| non_school_week_max_hours | numeric(4,2) | YES | `40.00` |
| non_school_day_start_time | text | YES | `'07:00'` |
| non_school_day_end_time | text | YES | `'21:00'` |
| require_work_permit | boolean | YES | `true` |
| work_permit_expiration_alert_days | integer | YES | `30` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

## 12. Break Compliance

### `break_rules`

State-specific meal and rest break enforcement rules (defaults to California).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | `'California Break Rules'` |
| state_code | text | NO | `'CA'` |
| enable_meal_break_enforcement | boolean | YES | `true` |
| meal_break_minutes | integer | YES | `30` |
| meal_break_threshold_hours | numeric(4,2) | YES | `5.00` |
| second_meal_break_threshold_hours | numeric(4,2) | YES | `10.00` |
| allow_meal_break_waiver | boolean | YES | `true` |
| meal_waiver_max_shift_hours | numeric(4,2) | YES | `6.00` |
| enable_rest_break_enforcement | boolean | YES | `true` |
| rest_break_minutes | integer | YES | `10` |
| rest_break_interval_hours | numeric(4,2) | YES | `4.00` |
| rest_break_is_paid | boolean | YES | `true` |
| enable_premium_pay | boolean | YES | `true` |
| meal_break_premium_hours | numeric(4,2) | YES | `1.00` |
| rest_break_premium_hours | numeric(4,2) | YES | `1.00` |
| require_clock_out_attestation | boolean | YES | `true` |
| attestation_message | text | YES | *(default message text)* |
| enable_break_alerts | boolean | YES | `true` |
| alert_minutes_before_deadline | integer | YES | `15` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`

---

### `break_sessions`

Actual break periods taken by employees during a shift.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| business_date | text | NO | — |
| break_type | text | YES | `'unpaid'` |
| start_punch_id | varchar | YES | — |
| end_punch_id | varchar | YES | — |
| start_time | timestamp | YES | — |
| end_time | timestamp | YES | — |
| scheduled_minutes | integer | YES | — |
| actual_minutes | integer | YES | — |
| is_paid | boolean | YES | `false` |
| is_violation | boolean | YES | `false` |
| violation_notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `start_punch_id` → `time_punches.id`
  - `end_punch_id` → `time_punches.id`

---

### `break_attestations`

Employee attestations confirming breaks were provided at clock-out.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| timecard_id | varchar | YES | — |
| business_date | text | NO | — |
| attestation_type | text | NO | `'clock_out'` |
| breaks_provided | boolean | NO | — |
| missed_meal_break | boolean | YES | `false` |
| missed_rest_break | boolean | YES | `false` |
| missed_break_reason | text | YES | — |
| employee_signature | text | YES | — |
| attested_at | timestamp | YES | `now()` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `timecard_id` → `timecards.id`

---

### `break_violations`

Recorded break law violations with premium pay calculations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| timecard_id | varchar | YES | — |
| break_session_id | varchar | YES | — |
| business_date | text | NO | — |
| violation_type | text | NO | — |
| violation_reason | text | YES | — |
| shift_start_time | timestamp | YES | — |
| shift_end_time | timestamp | YES | — |
| hours_worked | numeric(6,2) | YES | — |
| break_deadline_time | timestamp | YES | — |
| premium_pay_hours | numeric(4,2) | YES | `1.00` |
| premium_pay_rate | numeric(8,2) | YES | — |
| premium_pay_amount | numeric(10,2) | YES | — |
| status | text | YES | `'pending'` |
| acknowledged_by_id | varchar | YES | — |
| acknowledged_at | timestamp | YES | — |
| paid_in_payroll_date | text | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`
  - `timecard_id` → `timecards.id`
  - `break_session_id` → `break_sessions.id`
  - `acknowledged_by_id` → `employees.id`

---

## 13. Tip Management

### `tip_rules`

Tip distribution rules configuration (direct tips, pooling by hours, pooling by percentage).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | `'Default Tip Rules'` |
| distribution_method | text | NO | `'tip_directly'` |
| timeframe | text | YES | `'daily'` |
| applies_to_all_locations | boolean | YES | `false` |
| declare_cash_tips | boolean | YES | `false` |
| declare_cash_tips_all_locations | boolean | YES | `false` |
| exclude_managers | boolean | YES | `true` |
| minimum_hours_for_pool | numeric(4,2) | YES | `0` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `tip_rule_job_percentages`

Per-job-code tip pool percentage allocations within a tip rule.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| tip_rule_id | varchar | NO | — |
| job_code_id | varchar | NO | — |
| percentage | numeric(5,2) | NO | `0` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `tip_rule_id` → `tip_rules.id` (ON DELETE CASCADE)
  - `job_code_id` → `job_codes.id`

---

### `tip_pool_policies`

Tip pooling policy definitions with calculation methods and exclusions.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| calculation_method | text | YES | `'hours_worked'` |
| role_weights | jsonb | YES | — |
| excluded_job_code_ids | text[] | YES | — |
| exclude_managers | boolean | YES | `true` |
| exclude_training | boolean | YES | `true` |
| minimum_hours_required | numeric(4,2) | YES | `0` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `tip_pool_runs`

Individual tip pool distribution runs for a business date.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| policy_id | varchar | YES | — |
| business_date | text | NO | — |
| total_tips | numeric(10,2) | YES | `0` |
| total_hours | numeric(10,2) | YES | `0` |
| participant_count | integer | YES | `0` |
| status | text | YES | `'pending'` |
| run_by_id | varchar | YES | — |
| run_at | timestamp | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `policy_id` → `tip_pool_policies.id`
  - `run_by_id` → `employees.id`

---

### `tip_allocations`

Individual employee tip allocations from a pool run.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| tip_pool_run_id | varchar | NO | — |
| employee_id | varchar | NO | — |
| hours_worked | numeric(6,2) | YES | `0` |
| points_earned | numeric(6,2) | YES | `0` |
| share_percentage | numeric(5,2) | YES | `0` |
| allocated_amount | numeric(10,2) | YES | `0` |
| direct_tips | numeric(10,2) | YES | `0` |
| total_tips | numeric(10,2) | YES | `0` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `tip_pool_run_id` → `tip_pool_runs.id`
  - `employee_id` → `employees.id`

---

## 14. Scheduling

### `shifts`

Scheduled employee shifts.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| job_code_id | varchar | YES | — |
| template_id | varchar | YES | — |
| shift_date | text | NO | — |
| start_time | text | NO | — |
| end_time | text | NO | — |
| scheduled_break_minutes | integer | YES | `0` |
| status | text | YES | `'draft'` |
| notes | text | YES | — |
| published_at | timestamp | YES | — |
| published_by_id | varchar | YES | — |
| acknowledged_at | timestamp | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `employee_id` → `employees.id`
  - `job_code_id` → `job_codes.id`
  - `template_id` → `shift_templates.id`
  - `published_by_id` → `employees.id`

---

### `shift_templates`

Reusable shift templates for common scheduling patterns.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| job_code_id | varchar | YES | — |
| start_time | text | NO | — |
| end_time | text | NO | — |
| break_minutes | integer | YES | `0` |
| color | text | YES | — |
| notes | text | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `job_code_id` → `job_codes.id`

---

### `shift_cover_requests`

Requests from employees to have their shifts covered.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| shift_id | varchar | NO | — |
| requester_id | varchar | NO | — |
| reason | text | YES | — |
| status | text | YES | `'open'` |
| expires_at | timestamp | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `shift_id` → `shifts.id`
  - `requester_id` → `employees.id`

---

### `shift_cover_offers`

Offers from employees willing to cover a shift.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| cover_request_id | varchar | NO | — |
| offerer_id | varchar | NO | — |
| notes | text | YES | — |
| status | text | YES | `'pending'` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `cover_request_id` → `shift_cover_requests.id`
  - `offerer_id` → `employees.id`

---

### `shift_cover_approvals`

Manager approvals/denials for shift cover requests.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| cover_request_id | varchar | NO | — |
| offer_id | varchar | YES | — |
| approved_by_id | varchar | NO | — |
| approved | boolean | NO | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `cover_request_id` → `shift_cover_requests.id`
  - `offer_id` → `shift_cover_offers.id`
  - `approved_by_id` → `employees.id`

---

### `time_off_requests`

Employee time-off/PTO requests with approval workflow.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| property_id | varchar | YES | — |
| start_date | text | NO | — |
| end_date | text | NO | — |
| request_type | text | YES | `'pto'` |
| reason_code | text | YES | — |
| notes | text | YES | — |
| status | text | YES | `'submitted'` |
| reviewed_by_id | varchar | YES | — |
| reviewed_at | timestamp | YES | — |
| review_notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `property_id` → `properties.id`
  - `reviewed_by_id` → `employees.id`

---

## 15. Loyalty & Gift Cards

### `loyalty_programs`

Loyalty program definitions with points/visits configuration and tiers.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| name | text | NO | — |
| program_type | text | YES | `'points'` |
| points_per_dollar | integer | YES | `1` |
| minimum_points_redeem | integer | YES | `100` |
| points_redemption_value | numeric(10,4) | YES | `0.01` |
| visits_for_reward | integer | YES | `10` |
| tier_config | jsonb | YES | — |
| points_expiration_days | integer | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`

---

### `loyalty_members`

Individual loyalty program members.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| member_number | text | NO | — |
| first_name | text | NO | — |
| last_name | text | NO | — |
| email | text | YES | — |
| phone | text | YES | — |
| birth_date | text | YES | — |
| status | text | YES | `'active'` |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| property_id | varchar | YES | — |
| enterprise_id | varchar | YES | — |

- **Primary Key:** `id`
- **Unique Constraints:** `member_number`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `enterprise_id` → `enterprises.id`

---

### `loyalty_member_enrollments`

Links members to specific loyalty programs with point/visit tracking.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| member_id | varchar | NO | — |
| program_id | varchar | NO | — |
| current_points | integer | YES | `0` |
| lifetime_points | integer | YES | `0` |
| current_tier | text | YES | `'standard'` |
| visit_count | integer | YES | `0` |
| lifetime_spend | numeric(12,2) | YES | `0` |
| status | text | YES | `'active'` |
| enrolled_at | timestamp | YES | `now()` |
| last_activity_at | timestamp | YES | — |
| points_expiration_date | timestamp | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `member_id` → `loyalty_members.id`
  - `program_id` → `loyalty_programs.id`

---

### `loyalty_rewards`

Available rewards that can be redeemed using loyalty points.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| program_id | varchar | NO | — |
| property_id | varchar | YES | — |
| name | text | NO | — |
| description | text | YES | — |
| reward_type | text | YES | `'discount'` |
| points_cost | integer | YES | `0` |
| discount_amount | numeric(10,2) | YES | — |
| discount_percent | numeric(5,2) | YES | — |
| free_menu_item_id | varchar | YES | — |
| min_purchase | numeric(10,2) | YES | — |
| max_redemptions | integer | YES | — |
| redemption_count | integer | YES | `0` |
| valid_from | timestamp | YES | — |
| valid_until | timestamp | YES | — |
| tier_required | text | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| auto_award_at_points | integer | YES | — |
| auto_award_once | boolean | YES | `true` |
| gift_card_amount | numeric(10,2) | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `program_id` → `loyalty_programs.id`
  - `property_id` → `properties.id`
  - `free_menu_item_id` → `menu_items.id`

---

### `loyalty_transactions`

Point earn/redeem/adjust transaction history.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| member_id | varchar | NO | — |
| property_id | varchar | YES | — |
| program_id | varchar | YES | — |
| enrollment_id | varchar | YES | — |
| transaction_type | text | NO | — |
| points | integer | YES | `0` |
| points_before | integer | YES | — |
| points_after | integer | YES | — |
| visit_increment | integer | YES | `0` |
| visits_before | integer | YES | — |
| visits_after | integer | YES | — |
| check_id | varchar | YES | — |
| check_total | numeric(10,2) | YES | — |
| employee_id | varchar | YES | — |
| reason | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `member_id` → `loyalty_members.id`
  - `property_id` → `properties.id`
  - `program_id` → `loyalty_programs.id`
  - `enrollment_id` → `loyalty_member_enrollments.id`
  - `check_id` → `checks.id`
  - `employee_id` → `employees.id`

---

### `loyalty_redemptions`

Records of rewards redeemed at the POS.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| member_id | varchar | NO | — |
| reward_id | varchar | NO | — |
| check_id | varchar | YES | — |
| property_id | varchar | YES | — |
| points_used | integer | YES | `0` |
| discount_applied | numeric(10,2) | YES | — |
| status | text | YES | `'applied'` |
| employee_id | varchar | YES | — |
| redeemed_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `member_id` → `loyalty_members.id`
  - `reward_id` → `loyalty_rewards.id`
  - `check_id` → `checks.id`
  - `property_id` → `properties.id`
  - `employee_id` → `employees.id`

---

### `gift_cards`

Gift card records with balances and activation tracking.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| card_number | text | NO | — |
| pin | text | YES | — |
| initial_balance | numeric(10,2) | NO | — |
| current_balance | numeric(10,2) | NO | — |
| status | text | YES | `'active'` |
| activated_at | timestamp | YES | — |
| activated_by_id | varchar | YES | — |
| expires_at | timestamp | YES | — |
| last_used_at | timestamp | YES | — |
| purchaser_name | text | YES | — |
| recipient_name | text | YES | — |
| recipient_email | text | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Unique Constraints:** `card_number`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `activated_by_id` → `employees.id`

---

### `gift_card_transactions`

Gift card balance change transaction history.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| gift_card_id | varchar | NO | — |
| property_id | varchar | YES | — |
| transaction_type | text | NO | — |
| amount | numeric(10,2) | NO | — |
| balance_before | numeric(10,2) | NO | — |
| balance_after | numeric(10,2) | NO | — |
| check_id | varchar | YES | — |
| check_payment_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `gift_card_id` → `gift_cards.id`
  - `property_id` → `properties.id`
  - `check_id` → `checks.id`
  - `check_payment_id` → `check_payments.id`
  - `employee_id` → `employees.id`

---

## 16. Online Ordering & Delivery

### `online_order_sources`

Third-party delivery platform integrations (DoorDash, UberEats, etc.).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | NO | — |
| source_name | text | NO | — |
| source_type | text | NO | — |
| platform | text | NO | `'other'` |
| client_id | text | YES | — |
| client_secret | text | YES | — |
| merchant_store_id | text | YES | — |
| webhook_secret | text | YES | — |
| access_token | text | YES | — |
| refresh_token | text | YES | — |
| token_expires_at | timestamp | YES | — |
| api_key_prefix | text | YES | — |
| webhook_url | text | YES | — |
| auto_accept | boolean | YES | `false` |
| auto_inject | boolean | YES | `false` |
| auto_confirm_minutes | integer | YES | `5` |
| default_prep_minutes | integer | YES | `15` |
| default_rvc_id | varchar | YES | — |
| default_order_type | text | YES | `'delivery'` |
| menu_mappings | jsonb | YES | — |
| menu_sync_status | text | YES | `'not_synced'` |
| last_menu_sync_at | timestamp | YES | — |
| menu_sync_error | text | YES | — |
| commission_percent | numeric(5,2) | YES | — |
| connection_status | text | YES | `'disconnected'` |
| last_connection_test | timestamp | YES | — |
| sound_enabled | boolean | YES | `true` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `default_rvc_id` → `rvcs.id`

---

### `online_orders`

Incoming online orders from delivery platforms with full lifecycle tracking.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| source_id | varchar | YES | — |
| external_order_id | text | NO | — |
| status | text | YES | `'received'` |
| order_type | text | YES | `'pickup'` |
| customer_name | text | YES | — |
| customer_phone | text | YES | — |
| customer_email | text | YES | — |
| delivery_address | text | YES | — |
| delivery_instructions | text | YES | — |
| scheduled_time | timestamp | YES | — |
| estimated_prep_minutes | integer | YES | — |
| confirmed_at | timestamp | YES | — |
| ready_at | timestamp | YES | — |
| picked_up_at | timestamp | YES | — |
| delivered_at | timestamp | YES | — |
| subtotal | numeric(12,2) | NO | — |
| tax_total | numeric(12,2) | YES | `0` |
| delivery_fee | numeric(10,2) | YES | `0` |
| service_fee | numeric(10,2) | YES | `0` |
| tip | numeric(10,2) | YES | `0` |
| total | numeric(12,2) | NO | — |
| commission | numeric(10,2) | YES | `0` |
| items | jsonb | NO | — |
| check_id | varchar | YES | — |
| injected_at | timestamp | YES | — |
| injected_by_id | varchar | YES | — |
| raw_payload | jsonb | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `source_id` → `online_order_sources.id`
  - `check_id` → `checks.id`
  - `injected_by_id` → `employees.id`

---

### `delivery_platform_item_mappings`

Maps external delivery platform menu items to local POS menu items.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| source_id | varchar | NO | — |
| external_item_id | text | NO | — |
| external_item_name | text | YES | — |
| local_menu_item_id | varchar | YES | — |
| local_menu_item_name | text | YES | — |
| external_modifier_group_id | text | YES | — |
| local_modifier_group_id | varchar | YES | — |
| external_modifier_id | text | YES | — |
| local_modifier_id | varchar | YES | — |
| mapping_type | text | NO | `'menu_item'` |
| price_override | numeric(10,2) | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `source_id` → `online_order_sources.id`
  - `local_menu_item_id` → `menu_items.id`

---

### `offline_order_queue`

Queued orders from offline POS operation, pending sync to cloud.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| local_id | text | YES | — |
| order_data | jsonb | NO | — |
| status | text | YES | `'pending'` |
| sync_attempts | integer | YES | `0` |
| last_sync_attempt | timestamp | YES | — |
| synced_check_id | varchar | YES | — |
| error_message | text | YES | — |
| created_at | timestamp | YES | `now()` |
| synced_at | timestamp | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `workstation_id` → `workstations.id`
  - `employee_id` → `employees.id`

---

## 17. Inventory

### `inventory_items`

Inventory item master records.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| menu_item_id | varchar | YES | — |
| name | text | NO | — |
| sku | text | YES | — |
| category | text | YES | — |
| unit_type | text | YES | `'each'` |
| unit_cost | numeric(10,4) | YES | — |
| par_level | numeric(10,2) | YES | — |
| reorder_point | numeric(10,2) | YES | — |
| reorder_quantity | numeric(10,2) | YES | — |
| vendor_id | varchar | YES | — |
| vendor_sku | text | YES | — |
| shelf_life_days | integer | YES | — |
| storage_location | text | YES | — |
| track_inventory | boolean | YES | `true` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `menu_item_id` → `menu_items.id`

---

### `inventory_stock`

Current stock levels per inventory item per property.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| inventory_item_id | varchar | NO | — |
| property_id | varchar | NO | — |
| current_quantity | numeric(12,4) | YES | `0` |
| last_count_date | text | YES | — |
| last_count_quantity | numeric(12,4) | YES | — |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `inventory_item_id` → `inventory_items.id`
  - `property_id` → `properties.id`

---

### `inventory_transactions`

Stock movement history (receives, sales, waste, transfers, adjustments).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| inventory_item_id | varchar | NO | — |
| property_id | varchar | NO | — |
| transaction_type | text | NO | — |
| quantity | numeric(12,4) | NO | — |
| quantity_before | numeric(12,4) | YES | — |
| quantity_after | numeric(12,4) | YES | — |
| unit_cost | numeric(10,4) | YES | — |
| total_cost | numeric(12,2) | YES | — |
| business_date | text | YES | — |
| check_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| reason | text | YES | — |
| reference_number | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `inventory_item_id` → `inventory_items.id`
  - `property_id` → `properties.id`
  - `check_id` → `checks.id`
  - `employee_id` → `employees.id`

---

### `recipes`

Links menu items to inventory ingredients with quantities for auto-deduction.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| menu_item_id | varchar | NO | — |
| inventory_item_id | varchar | NO | — |
| quantity | numeric(10,4) | NO | — |
| unit_type | text | YES | — |
| waste_percent | numeric(5,2) | YES | `0` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `menu_item_id` → `menu_items.id`
  - `inventory_item_id` → `inventory_items.id`

---

### `prep_items`

Kitchen prep items with par levels and consumption tracking.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| category | text | YES | — |
| par_level | integer | NO | — |
| current_level | integer | YES | `0` |
| unit | text | YES | `'each'` |
| shelf_life_hours | integer | YES | — |
| prep_instructions | text | YES | — |
| menu_item_ids | text[] | YES | — |
| consumption_per_item | numeric(5,2) | YES | `1` |
| last_prep_at | timestamp | YES | — |
| last_prep_by_id | varchar | YES | — |
| last_prep_quantity | integer | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `last_prep_by_id` → `employees.id`

---

## 18. Fiscal & Reporting

### `fiscal_periods`

Daily business date fiscal period records with aggregated totals.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| business_date | text | NO | — |
| status | text | YES | `'open'` |
| opened_at | timestamp | YES | — |
| closed_at | timestamp | YES | — |
| closed_by_id | varchar | YES | — |
| reopened_at | timestamp | YES | — |
| reopened_by_id | varchar | YES | — |
| reopen_reason | text | YES | — |
| gross_sales | numeric(12,2) | YES | `0` |
| net_sales | numeric(12,2) | YES | `0` |
| tax_collected | numeric(12,2) | YES | `0` |
| discounts_total | numeric(12,2) | YES | `0` |
| refunds_total | numeric(12,2) | YES | `0` |
| tips_total | numeric(12,2) | YES | `0` |
| service_charges_total | numeric(12,2) | YES | `0` |
| check_count | integer | YES | `0` |
| guest_count | integer | YES | `0` |
| cash_expected | numeric(12,2) | YES | `0` |
| cash_actual | numeric(12,2) | YES | — |
| cash_variance | numeric(12,2) | YES | — |
| card_total | numeric(12,2) | YES | `0` |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `closed_by_id` → `employees.id`
  - `reopened_by_id` → `employees.id`

---

### `accounting_exports`

Accounting/payroll export records.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| export_type | text | YES | `'daily'` |
| format_type | text | YES | `'csv'` |
| start_date | text | NO | — |
| end_date | text | NO | — |
| status | text | YES | `'pending'` |
| generated_at | timestamp | YES | — |
| generated_by_id | varchar | YES | — |
| download_url | text | YES | — |
| error_message | text | YES | — |
| total_revenue | numeric(12,2) | YES | — |
| total_tax | numeric(12,2) | YES | — |
| total_labor | numeric(12,2) | YES | — |
| row_count | integer | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `generated_by_id` → `employees.id`

---

### `gl_mappings`

General ledger account mappings for accounting integration.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| source_type | text | NO | — |
| source_id | varchar | YES | — |
| gl_account_code | text | NO | — |
| gl_account_name | text | YES | — |
| debit_credit | text | YES | `'credit'` |
| description | text | YES | — |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`

---

### `sales_forecasts`

Sales projection data for labor planning and scheduling.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| forecast_date | text | NO | — |
| day_of_week | integer | YES | — |
| hourly_projections | jsonb | YES | — |
| projected_sales | numeric(12,2) | YES | — |
| projected_guests | integer | YES | — |
| projected_checks | integer | YES | — |
| actual_sales | numeric(12,2) | YES | — |
| actual_guests | integer | YES | — |
| actual_checks | integer | YES | — |
| model_version | text | YES | — |
| confidence | numeric(5,2) | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `labor_forecasts`

Labor demand forecasts per job code and date.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| forecast_date | text | NO | — |
| job_code_id | varchar | YES | — |
| hourly_needs | jsonb | YES | — |
| total_hours_needed | numeric(8,2) | YES | — |
| projected_labor_cost | numeric(12,2) | YES | — |
| target_labor_percent | numeric(5,2) | YES | `25` |
| actual_hours_worked | numeric(8,2) | YES | — |
| actual_labor_cost | numeric(12,2) | YES | — |
| actual_labor_percent | numeric(5,2) | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `job_code_id` → `job_codes.id`

---

### `labor_snapshots`

Periodic labor vs. sales metric snapshots for real-time dashboards.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| business_date | text | NO | — |
| hour | integer | YES | — |
| daypart | text | YES | — |
| total_sales | numeric(12,2) | YES | `0` |
| labor_hours | numeric(8,2) | YES | `0` |
| labor_cost | numeric(10,2) | YES | `0` |
| labor_percentage | numeric(5,2) | YES | `0` |
| sales_per_labor_hour | numeric(10,2) | YES | `0` |
| headcount | integer | YES | `0` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `stress_test_results`

Performance stress test execution results.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| status | text | NO | — |
| duration_minutes | integer | NO | — |
| target_tx_per_minute | integer | NO | — |
| patterns | text[] | YES | — |
| total_transactions | integer | YES | `0` |
| successful_transactions | integer | YES | `0` |
| failed_transactions | integer | YES | `0` |
| avg_transaction_ms | integer | YES | — |
| min_transaction_ms | integer | YES | — |
| max_transaction_ms | integer | YES | — |
| actual_tx_per_minute | numeric | YES | — |
| elapsed_seconds | integer | YES | — |
| errors | text[] | YES | — |
| started_at | timestamp | YES | `now()` |
| completed_at | timestamp | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

## 19. Audit & Alerts

### `audit_logs`

System-wide audit trail for all significant operations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| rvc_id | varchar | YES | — |
| employee_id | varchar | YES | — |
| action | text | NO | — |
| target_type | text | YES | — |
| target_id | varchar | YES | — |
| details | jsonb | YES | — |
| reason_code | text | YES | — |
| manager_approval_id | varchar | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `rvc_id` → `rvcs.id`
  - `employee_id` → `employees.id`

---

### `manager_alerts`

Real-time alerts for managers (voids, discounts, overtime, hardware issues, etc.).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| rvc_id | varchar | YES | — |
| alert_type | text | NO | — |
| severity | text | YES | `'warning'` |
| title | text | NO | — |
| message | text | NO | — |
| employee_id | varchar | YES | — |
| check_id | varchar | YES | — |
| target_type | text | YES | — |
| target_id | varchar | YES | — |
| metadata | jsonb | YES | — |
| read | boolean | YES | `false` |
| read_at | timestamp | YES | — |
| read_by_id | varchar | YES | — |
| acknowledged | boolean | YES | `false` |
| acknowledged_at | timestamp | YES | — |
| acknowledged_by_id | varchar | YES | — |
| resolution | text | YES | — |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`
  - `employee_id` → `employees.id`
  - `check_id` → `checks.id`
  - `read_by_id` → `employees.id`
  - `acknowledged_by_id` → `employees.id`

---

### `alert_subscriptions`

Employee notification preferences for different alert types.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| employee_id | varchar | NO | — |
| property_id | varchar | YES | — |
| alert_type | text | NO | — |
| severity | text | YES | — |
| notify_email | boolean | YES | `false` |
| notify_sms | boolean | YES | `false` |
| notify_push | boolean | YES | `true` |
| active | boolean | YES | `true` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `employee_id` → `employees.id`
  - `property_id` → `properties.id`

---

## 20. POS Layouts

### `pos_layouts`

POS touchscreen layout configurations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | YES | — |
| property_id | varchar | YES | — |
| rvc_id | varchar | YES | — |
| name | text | NO | — |
| mode | text | YES | `'slu_tabs'` |
| grid_rows | integer | YES | `4` |
| grid_cols | integer | YES | `6` |
| is_default | boolean | YES | `false` |
| active | boolean | YES | `true` |
| font_size | text | YES | `'medium'` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

### `pos_layout_cells`

Individual button/cell positions within a POS layout grid.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| layout_id | varchar | NO | — |
| row_index | integer | NO | — |
| col_index | integer | NO | — |
| row_span | integer | YES | `1` |
| col_span | integer | YES | `1` |
| menu_item_id | varchar | YES | — |
| background_color | text | YES | `'#3B82F6'` |
| text_color | text | YES | `'#FFFFFF'` |
| display_label | text | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `layout_id` → `pos_layouts.id`
  - `menu_item_id` → `menu_items.id`

---

### `pos_layout_rvc_assignments`

Assigns POS layouts to specific RVCs within a property.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| layout_id | varchar | NO | — |
| property_id | varchar | NO | — |
| rvc_id | varchar | NO | — |
| is_default | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `layout_id` → `pos_layouts.id`
  - `property_id` → `properties.id`
  - `rvc_id` → `rvcs.id`

---

## 21. Receipt Descriptors

### `descriptor_sets`

Receipt header/trailer line configurations at enterprise, property, or RVC scope.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| scope_type | text | NO | — |
| scope_id | varchar | NO | — |
| enterprise_id | varchar | NO | — |
| header_lines | jsonb | YES | `'[]'` |
| trailer_lines | jsonb | YES | `'[]'` |
| logo_enabled | boolean | YES | `false` |
| logo_asset_id | varchar | YES | — |
| override_header | boolean | YES | `false` |
| override_trailer | boolean | YES | `false` |
| override_logo | boolean | YES | `false` |
| updated_at | timestamp | YES | `now()` |
| updated_by_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `logo_asset_id` → `descriptor_logo_assets.id`

---

### `descriptor_logo_assets`

Uploaded logo images for receipt printing, stored with ESC/POS pre-rendered data.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | NO | — |
| filename | text | NO | — |
| mime_type | text | NO | — |
| size_bytes | integer | NO | — |
| storage_path | text | NO | — |
| checksum | text | YES | — |
| escpos_data | text | YES | — |
| created_at | timestamp | YES | `now()` |
| created_by_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`

---

## 22. Service Hosts (CAPS)

### `service_hosts`

On-premise service host instances (CAPS, Print Controller, KDS Controller, Payment Controller).

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| name | text | NO | — |
| service_type | text | NO | `'caps'` |
| host_workstation_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| status | text | YES | `'offline'` |
| last_heartbeat_at | timestamp | YES | — |
| version | varchar(20) | YES | — |
| services | jsonb | YES | `'[]'` |
| registration_token | varchar(128) | YES | — |
| registration_token_used | boolean | YES | `false` |
| encryption_key_hash | varchar(64) | YES | — |
| hostname | text | YES | — |
| ip_address | text | YES | — |
| active_checks | integer | YES | `0` |
| pending_transactions | integer | YES | `0` |
| local_config_version | integer | YES | `0` |
| service_config | jsonb | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `host_workstation_id` → `workstations.id`
  - `workstation_id` → `workstations.id`

---

### `service_host_metrics`

Periodic health/performance metrics from service hosts.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | serial | NO | auto-increment |
| service_host_id | varchar | NO | — |
| recorded_at | timestamp | NO | `now()` |
| connection_mode | text | YES | `'green'` |
| connected_workstations | integer | YES | `0` |
| pending_sync_items | integer | YES | `0` |
| cpu_usage_percent | integer | YES | — |
| memory_usage_mb | integer | YES | — |
| disk_usage_percent | integer | YES | — |
| disk_free_gb | real | YES | — |
| uptime | integer | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `service_host_id` → `service_hosts.id` (ON DELETE CASCADE)

---

### `service_host_transactions`

Transactions synced from service hosts to the cloud.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| service_host_id | varchar | NO | — |
| property_id | varchar | NO | — |
| local_id | varchar | NO | — |
| transaction_type | varchar(50) | NO | — |
| business_date | text | NO | — |
| data | jsonb | NO | — |
| processed_at | timestamp | YES | `now()` |
| cloud_entity_id | varchar | YES | — |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `service_host_id` → `service_hosts.id` (ON DELETE CASCADE)
  - `property_id` → `properties.id`

---

### `service_host_alerts`

Triggered alerts from service host monitoring.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| service_host_id | varchar | NO | — |
| property_id | varchar | NO | — |
| alert_type | text | NO | — |
| severity | text | YES | `'warning'` |
| message | text | NO | — |
| details | jsonb | YES | — |
| triggered_at | timestamp | NO | `now()` |
| acknowledged_at | timestamp | YES | — |
| acknowledged_by_id | varchar | YES | — |
| resolved_at | timestamp | YES | — |
| notifications_sent | boolean | YES | `false` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `service_host_id` → `service_hosts.id` (ON DELETE CASCADE)
  - `property_id` → `properties.id`
  - `acknowledged_by_id` → `employees.id`

---

### `service_host_alert_rules`

Configurable alert thresholds and notification settings per enterprise.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | NO | — |
| alert_type | text | NO | — |
| severity | text | YES | `'warning'` |
| enabled | boolean | YES | `true` |
| threshold_value | integer | YES | — |
| threshold_duration_minutes | integer | YES | — |
| notify_email | boolean | YES | `true` |
| notify_sms | boolean | YES | `false` |
| email_recipients | jsonb | YES | `'[]'` |
| sms_recipients | jsonb | YES | `'[]'` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`

---

### `workstation_service_bindings`

Exclusive service-type-to-workstation assignments per property.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| property_id | varchar | NO | — |
| workstation_id | varchar | NO | — |
| service_type | text | NO | — |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Notable Indexes:** `wsb_property_service_unique` — unique on `(property_id, service_type)` WHERE `active = true`
- **Foreign Keys:**
  - `property_id` → `properties.id`
  - `workstation_id` → `workstations.id`

---

## 23. CAL (Content Application Lifecycle)

### `cal_packages`

Software package definitions for deployment to service hosts and workstations.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | NO | — |
| name | text | NO | — |
| package_type | text | NO | — |
| description | text | YES | — |
| is_system | boolean | YES | `false` |
| active | boolean | YES | `true` |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`

---

### `cal_package_versions`

Versioned releases of CAL packages with download URLs and checksums.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| package_id | varchar | NO | — |
| version | text | NO | — |
| release_notes | text | YES | — |
| download_url | text | YES | — |
| checksum | text | YES | — |
| file_size | integer | YES | — |
| min_os_version | text | YES | — |
| is_latest | boolean | YES | `false` |
| active | boolean | YES | `true` |
| released_at | timestamp | YES | `now()` |
| created_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `package_id` → `cal_packages.id`

---

### `cal_package_prerequisites`

Prerequisite dependencies between CAL packages.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| package_version_id | varchar | NO | — |
| prerequisite_package_id | varchar | NO | — |
| min_version | text | YES | — |
| install_order | integer | YES | `0` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `package_version_id` → `cal_package_versions.id`
  - `prerequisite_package_id` → `cal_packages.id`

---

### `cal_deployments`

Deployment requests for CAL packages to enterprise/property/workstation/service host targets.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| enterprise_id | varchar | NO | — |
| package_version_id | varchar | NO | — |
| deployment_scope | text | NO | — |
| target_property_id | varchar | YES | — |
| target_workstation_id | varchar | YES | — |
| target_service_host_id | varchar | YES | — |
| action | text | NO | `'install'` |
| scheduled_at | timestamp | YES | — |
| expires_at | timestamp | YES | — |
| created_by_id | varchar | YES | — |
| notes | text | YES | — |
| created_at | timestamp | YES | `now()` |
| updated_at | timestamp | YES | `now()` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `enterprise_id` → `enterprises.id`
  - `package_version_id` → `cal_package_versions.id`
  - `target_property_id` → `properties.id`
  - `target_workstation_id` → `workstations.id`
  - `target_service_host_id` → `service_hosts.id`
  - `created_by_id` → `employees.id`

---

### `cal_deployment_targets`

Individual target status tracking for each deployment.

| Column | Data Type | Nullable | Default |
|--------|-----------|----------|---------|
| id | varchar (UUID) | NO | `gen_random_uuid()` |
| deployment_id | varchar | NO | — |
| property_id | varchar | YES | — |
| workstation_id | varchar | YES | — |
| service_host_id | varchar | YES | — |
| status | text | YES | `'pending'` |
| status_message | text | YES | — |
| started_at | timestamp | YES | — |
| completed_at | timestamp | YES | — |
| retry_count | integer | YES | `0` |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `deployment_id` → `cal_deployments.id`
  - `property_id` → `properties.id`
  - `workstation_id` → `workstations.id`
  - `service_host_id` → `service_hosts.id` (ON DELETE CASCADE)

---

## 24. Relationship Diagram (Key Relationships)

### Core Transaction Flow

```
Enterprise
  └── Properties
        └── RVCs
              └── Checks
                    ├── Check Items
                    │     └── (linked to Menu Items, Rounds, Discounts)
                    ├── Check Payments
                    │     └── Payment Transactions
                    ├── Check Discounts
                    ├── Check Locks
                    └── Rounds
                          └── Check Items (per round)
```

### Employee & Labor Chain

```
Enterprise
  └── Employees
        ├── Employee Assignments (→ Property, RVC)
        ├── Employee Job Codes (→ Job Codes)
        ├── Timecards
        │     ├── Time Punches
        │     ├── Break Sessions
        │     ├── Break Attestations
        │     └── Break Violations
        ├── Shifts (Scheduling)
        │     ├── Shift Cover Requests → Offers → Approvals
        │     └── Shift Templates
        ├── Employee Availability / Exceptions
        ├── Employee Minor Status
        └── Tip Allocations (via Tip Pool Runs)
```

### Menu Configuration Chain

```
Enterprise
  └── Menu Items
        ├── SLUs (via menu_item_slus)
        ├── Modifier Groups (via menu_item_modifier_groups)
        │     └── Modifiers (via modifier_group_modifiers)
        ├── Print Classes (→ Print Class Routing → Order Devices)
        ├── Tax Groups
        ├── Major Groups → Family Groups
        ├── Recipe Ingredients (menu_item_recipe_ingredients)
        └── Item Availability
```

### Kitchen Display Flow

```
Checks
  └── Rounds
        └── KDS Tickets
              ├── KDS Ticket Items (→ Check Items)
              └── KDS Devices (station routing)
```

### Order Routing

```
Properties
  └── Order Devices
        ├── Order Device KDS Links (→ KDS Devices)
        └── Order Device Printer Links (→ Printers)
              └── Print Class Routing (→ Print Classes)
```

### Hardware & Infrastructure

```
Properties
  ├── Workstations
  │     ├── Registered Devices
  │     ├── Terminal Devices (EMV readers)
  │     ├── Workstation Service Bindings
  │     └── Check Locks
  ├── KDS Devices
  ├── Printers
  │     └── Print Agents
  ├── Service Hosts (CAPS)
  │     ├── Service Host Metrics
  │     ├── Service Host Transactions
  │     └── Service Host Alerts
  └── Devices (mobile/tablet)
        └── Device Heartbeats
```

### Cash Management Chain

```
Properties
  └── Cash Drawers
        └── Drawer Assignments (→ Employees)
              └── Cash Transactions
                    └── (linked to Checks, Manager Approvals)
```

### Loyalty & Gift Cards

```
Enterprise
  └── Loyalty Programs
        ├── Loyalty Member Enrollments (→ Members)
        ├── Loyalty Rewards
        ├── Loyalty Transactions (→ Checks)
        └── Loyalty Redemptions (→ Rewards, Checks)

Enterprise
  └── Gift Cards
        └── Gift Card Transactions (→ Checks, Check Payments)
```

### Online Ordering

```
Properties
  └── Online Order Sources (platform configs)
        ├── Online Orders (→ Checks when injected)
        └── Delivery Platform Item Mappings (→ Menu Items)
```

### CAL Deployment

```
Enterprise
  └── CAL Packages
        └── CAL Package Versions
              ├── CAL Package Prerequisites
              └── CAL Deployments
                    └── CAL Deployment Targets (→ Properties, Workstations, Service Hosts)
```

---

## emc_option_flags

Generic key-value option flags supporting scope-based inheritance (Enterprise → Property → RVC → Workstation). Used for configuration-driven behavior flags that don't warrant dedicated schema columns.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | varchar (PK) | UUID default | Unique flag record ID |
| enterprise_id | varchar | NOT NULL, FK → enterprises | Owning enterprise |
| entity_type | varchar | NOT NULL | Entity kind (e.g. "tender", "rvc", "menu_item") |
| entity_id | varchar | NOT NULL | ID of the entity this flag applies to |
| option_key | varchar | NOT NULL | Flag name (e.g. "popDrawer", "requireSignature") |
| value_text | text | NULL | Flag value stored as text ("true"/"false" for booleans, arbitrary text/numbers) |
| scope_level | varchar | NOT NULL | Scope at which this flag is set: "enterprise", "property", "rvc", or "workstation" |
| scope_id | varchar | NOT NULL | ID of the scope entity (enterprise/property/rvc/workstation ID) |
| created_at | timestamp | NOT NULL, default now() | Record creation time |
| updated_at | timestamp | NOT NULL, default now() | Last update time |

**Unique Constraint**: (enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id)

**Indexes**:
- idx_option_flags_entity: (enterprise_id, entity_type, entity_id)
- idx_option_flags_scope: (enterprise_id, scope_level, scope_id)

**Inheritance Resolution**: Most-specific scope wins (workstation > rvc > property > enterprise). Runtime uses batch loading with 60-second in-memory cache.

---

## Tender Media Classification Flags

Dedicated boolean columns on the `tenders` table that drive all reporting and cash drawer behavior. These replace hardcoded `tender.type === "cash"` string comparisons.

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| is_cash_media | boolean | false | Includes this tender in cash drawer totals, change due calculations, and cash over/short reporting |
| is_card_media | boolean | false | Includes this tender in card settlement totals, card tip pools, and card payment reporting |
| is_gift_media | boolean | false | Includes this tender in gift card liability tracking and redemption summaries |

**Backfill Logic** (migration 004): `type='cash' → is_cash_media=true`, `type='credit'/'debit' → is_card_media=true`, `type='gift' → is_gift_media=true`.

**Usage**: All reporting SQL and JS logic uses these flags instead of `tender.type` string comparisons. The `type` column is retained for classification labels only.

## Service Host (CAPS) SQLite Parity

The service-host SQLite schema (`service-host/src/db/schema.ts`, SCHEMA_VERSION=4) mirrors the cloud Postgres schema for offline operations:

**Tenders**: Includes all behavior flags (`is_system`, `pop_drawer`, `allow_tips`, `allow_over_tender`, `print_check_on_payment`, `require_manager_approval`, `requires_payment_processor`, `display_order`) and media classification flags (`is_cash_media`, `is_card_media`, `is_gift_media`). Migration v3→v4 uses ALTER TABLE ADD COLUMN with try/catch for idempotency and backfills from `type` column.

**RVCs**: Includes printing flags (`receipt_print_mode`, `receipt_copies`, `kitchen_print_mode`, `void_receipt_print`, `require_guest_count`).

**EMC Option Flags**: `emc_option_flags` table with unique index on `(enterprise_id, entity_type, entity_id, option_key, scope_level, scope_id)`. Synced from cloud during config sync. Scope resolution follows workstation → RVC → property → enterprise precedence.
