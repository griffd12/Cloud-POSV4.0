import { Express, Request, Response } from "express";
import { storage } from "./storage";
import type {
  InsertEnterprise, InsertProperty, InsertRvc, InsertTaxGroup,
  InsertTender, InsertDiscount, InsertServiceCharge, InsertRole,
  InsertJobCode, InsertPrinter, InsertKdsDevice, InsertOrderDevice,
  InsertPrintClass, InsertMajorGroup, InsertFamilyGroup, InsertSlu,
  InsertModifierGroup, InsertModifier, InsertMenuItem,
  InsertEmployee, InsertModifierGroupModifier, InsertMenuItemModifierGroup,
} from "@shared/schema";
import ExcelJS from "exceljs";
import crypto from "crypto";

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });
  return { headers, rows };
}

interface PhaseDefinition {
  phase: number;
  sheetName: string;
  columns: { header: string; key: string; width: number; description?: string; lookupSheet?: string; required?: boolean }[];
  exampleRows: Record<string, string | number | boolean>[];
}

function getPhaseDefinitions(): PhaseDefinition[] {
  return [
    {
      phase: 1,
      sheetName: "01 Enterprise",
      columns: [
        { header: "name", key: "name", width: 30, required: true, description: "Enterprise name" },
        { header: "code", key: "code", width: 15, required: true, description: "Unique code (e.g., ENT01)" },
      ],
      exampleRows: [{ name: "Demo Restaurant Group", code: "DEMO01" }],
    },
    {
      phase: 2,
      sheetName: "02 Properties",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise", description: "Must match an Enterprise code" },
        { header: "address", key: "address", width: 35 },
        { header: "timezone", key: "timezone", width: 22, description: "e.g., America/New_York, America/Chicago" },
        { header: "business_date_rollover_time", key: "business_date_rollover_time", width: 15, description: "HH:MM (e.g., 04:00)" },
        { header: "business_date_mode", key: "business_date_mode", width: 12, description: "auto or manual" },
        { header: "auto_clock_out_enabled", key: "auto_clock_out_enabled", width: 12, description: "true or false" },
        { header: "header_line_1", key: "header_line_1", width: 48, description: "Receipt header line 1 (max 48 chars)" },
        { header: "header_line_2", key: "header_line_2", width: 48 },
        { header: "header_line_3", key: "header_line_3", width: 48 },
        { header: "header_line_4", key: "header_line_4", width: 48 },
        { header: "header_line_5", key: "header_line_5", width: 48 },
        { header: "header_line_6", key: "header_line_6", width: 48 },
        { header: "trailer_line_1", key: "trailer_line_1", width: 48, description: "Receipt trailer line 1" },
        { header: "trailer_line_2", key: "trailer_line_2", width: 48 },
        { header: "trailer_line_3", key: "trailer_line_3", width: 48 },
        { header: "trailer_line_4", key: "trailer_line_4", width: 48 },
      ],
      exampleRows: [
        {
          name: "Downtown Location", code: "PROP01", enterprise_code: "DEMO01",
          address: "123 Main St, Anytown, ST 12345", timezone: "America/New_York",
          business_date_rollover_time: "04:00", business_date_mode: "auto", auto_clock_out_enabled: "false",
          header_line_1: "DEMO RESTAURANT", header_line_2: "123 Main Street",
          header_line_3: "Anytown, ST 12345", header_line_4: "(555) 123-4567",
          header_line_5: "", header_line_6: "",
          trailer_line_1: "Thank you for dining with us!", trailer_line_2: "Visit us again soon",
          trailer_line_3: "", trailer_line_4: "",
        },
      ],
    },
    {
      phase: 3,
      sheetName: "03 Revenue Centers",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "property_code", key: "property_code", width: 15, required: true, lookupSheet: "02 Properties", description: "Must match a Property code" },
        { header: "default_order_type", key: "default_order_type", width: 15, description: "dine_in, take_out, delivery, pickup" },
        { header: "fast_transaction_default", key: "fast_transaction_default", width: 12, description: "true or false" },
        { header: "dynamic_order_mode", key: "dynamic_order_mode", width: 12, description: "true or false" },
        { header: "dom_send_mode", key: "dom_send_mode", width: 15, description: "fire_on_fly, fire_on_next, fire_on_tender" },
        { header: "conversational_ordering_enabled", key: "conversational_ordering_enabled", width: 15, description: "true or false" },
        { header: "override_header", key: "override_header", width: 10, description: "true to override property header" },
        { header: "header_line_1", key: "header_line_1", width: 48 },
        { header: "header_line_2", key: "header_line_2", width: 48 },
        { header: "header_line_3", key: "header_line_3", width: 48 },
        { header: "header_line_4", key: "header_line_4", width: 48 },
        { header: "override_trailer", key: "override_trailer", width: 10, description: "true to override property trailer" },
        { header: "trailer_line_1", key: "trailer_line_1", width: 48 },
        { header: "trailer_line_2", key: "trailer_line_2", width: 48 },
        { header: "trailer_line_3", key: "trailer_line_3", width: 48 },
        { header: "trailer_line_4", key: "trailer_line_4", width: 48 },
      ],
      exampleRows: [
        {
          name: "Dine In", code: "DIN01", property_code: "PROP01",
          default_order_type: "dine_in", fast_transaction_default: "false",
          dynamic_order_mode: "false", dom_send_mode: "fire_on_fly",
          conversational_ordering_enabled: "false",
          override_header: "false", header_line_1: "", header_line_2: "", header_line_3: "", header_line_4: "",
          override_trailer: "false", trailer_line_1: "", trailer_line_2: "", trailer_line_3: "", trailer_line_4: "",
        },
        {
          name: "Drive Thru", code: "DRV01", property_code: "PROP01",
          default_order_type: "take_out", fast_transaction_default: "true",
          dynamic_order_mode: "true", dom_send_mode: "fire_on_fly",
          conversational_ordering_enabled: "false",
          override_header: "false", header_line_1: "", header_line_2: "", header_line_3: "", header_line_4: "",
          override_trailer: "false", trailer_line_1: "", trailer_line_2: "", trailer_line_3: "", trailer_line_4: "",
        },
      ],
    },
    {
      phase: 4,
      sheetName: "04 Tax Groups",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "rate", key: "rate", width: 12, required: true, description: "Decimal rate (e.g., 0.0825 for 8.25%)" },
        { header: "tax_mode", key: "tax_mode", width: 12, description: "add_on or inclusive" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "State Sales Tax", rate: "0.0825", tax_mode: "add_on", enterprise_code: "DEMO01" },
        { name: "No Tax", rate: "0.0000", tax_mode: "add_on", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 5,
      sheetName: "05 Tenders",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "type", key: "type", width: 12, required: true, description: "cash, credit, gift, other" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Cash", code: "CASH", type: "cash", enterprise_code: "DEMO01" },
        { name: "Credit Card", code: "CC", type: "credit", enterprise_code: "DEMO01" },
        { name: "Gift Card", code: "GC", type: "gift", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 6,
      sheetName: "06 Discounts",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "type", key: "type", width: 12, required: true, description: "percent or amount" },
        { header: "value", key: "value", width: 12, required: true, description: "Percentage or dollar amount" },
        { header: "requires_manager_approval", key: "requires_manager_approval", width: 15, description: "true or false" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "10% Off", code: "DISC10", type: "percent", value: "10.00", requires_manager_approval: "false", enterprise_code: "DEMO01" },
        { name: "Employee Meal", code: "EMPMEAL", type: "percent", value: "50.00", requires_manager_approval: "true", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 7,
      sheetName: "07 Service Charges",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "type", key: "type", width: 12, required: true, description: "percent or amount" },
        { header: "value", key: "value", width: 12, required: true },
        { header: "auto_apply", key: "auto_apply", width: 12, description: "true or false" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Large Party Gratuity", code: "LGPTY", type: "percent", value: "18.00", auto_apply: "false", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 8,
      sheetName: "08 Roles",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Manager", code: "MGR", enterprise_code: "DEMO01" },
        { name: "Cashier", code: "CASHIER", enterprise_code: "DEMO01" },
        { name: "Server", code: "SERVER", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 9,
      sheetName: "09 Job Codes",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "role_code", key: "role_code", width: 15, lookupSheet: "08 Roles", description: "Must match a Role code" },
        { header: "compensation_type", key: "compensation_type", width: 15, description: "hourly or salaried" },
        { header: "hourly_rate", key: "hourly_rate", width: 12, description: "e.g., 15.00" },
        { header: "tip_mode", key: "tip_mode", width: 15, description: "not_eligible, pooled, direct, both" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Shift Manager", code: "SHFTMGR", role_code: "MGR", compensation_type: "hourly", hourly_rate: "22.00", tip_mode: "not_eligible", enterprise_code: "DEMO01" },
        { name: "Cashier", code: "CASH01", role_code: "CASHIER", compensation_type: "hourly", hourly_rate: "15.00", tip_mode: "not_eligible", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 10,
      sheetName: "10 Printers",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "printer_type", key: "printer_type", width: 15, required: true, description: "receipt, kitchen, bar, prep, report" },
        { header: "connection_type", key: "connection_type", width: 12, description: "network, usb, serial" },
        { header: "ip_address", key: "ip_address", width: 18, description: "e.g., 192.168.1.100" },
        { header: "port", key: "port", width: 8, description: "Default: 9100" },
        { header: "driver_protocol", key: "driver_protocol", width: 12, description: "epson or star" },
        { header: "model", key: "model", width: 18, description: "e.g., TM-T88VI, TSP143IV" },
        { header: "character_width", key: "character_width", width: 10, description: "42, 48, or 56" },
        { header: "property_code", key: "property_code", width: 15, required: true, lookupSheet: "02 Properties" },
      ],
      exampleRows: [
        { name: "Receipt Printer 1", printer_type: "receipt", connection_type: "network", ip_address: "192.168.1.100", port: "9100", driver_protocol: "epson", model: "TM-T88VI", character_width: "42", property_code: "PROP01" },
        { name: "Kitchen Printer", printer_type: "kitchen", connection_type: "network", ip_address: "192.168.1.101", port: "9100", driver_protocol: "epson", model: "TM-T88V", character_width: "42", property_code: "PROP01" },
      ],
    },
    {
      phase: 11,
      sheetName: "11 KDS Devices",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "station_type", key: "station_type", width: 12, required: true, description: "hot, cold, prep, expo, bar" },
        { header: "property_code", key: "property_code", width: 15, required: true, lookupSheet: "02 Properties" },
      ],
      exampleRows: [
        { name: "Hot Line KDS", station_type: "hot", property_code: "PROP01" },
        { name: "Cold Line KDS", station_type: "cold", property_code: "PROP01" },
        { name: "Expo KDS", station_type: "expo", property_code: "PROP01" },
      ],
    },
    {
      phase: 12,
      sheetName: "12 Order Devices",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "property_code", key: "property_code", width: 15, required: true, lookupSheet: "02 Properties" },
        { header: "kds_device_name", key: "kds_device_name", width: 25, lookupSheet: "11 KDS Devices", description: "Must match a KDS Device name" },
        { header: "send_on", key: "send_on", width: 15, description: "send_button or dynamic" },
        { header: "send_voids", key: "send_voids", width: 10, description: "true or false" },
        { header: "send_reprints", key: "send_reprints", width: 10, description: "true or false" },
      ],
      exampleRows: [
        { name: "Hot Line", code: "HOTLINE", property_code: "PROP01", kds_device_name: "Hot Line KDS", send_on: "send_button", send_voids: "true", send_reprints: "true" },
        { name: "Cold Line", code: "COLDLINE", property_code: "PROP01", kds_device_name: "Cold Line KDS", send_on: "send_button", send_voids: "true", send_reprints: "true" },
      ],
    },
    {
      phase: 13,
      sheetName: "13 Print Classes",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Hot Food", code: "HOTFOOD", enterprise_code: "DEMO01" },
        { name: "Cold Food", code: "COLDFOOD", enterprise_code: "DEMO01" },
        { name: "Drinks", code: "DRINKS", enterprise_code: "DEMO01" },
        { name: "No Print", code: "NOPRINT", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 14,
      sheetName: "14 Major Groups",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "display_order", key: "display_order", width: 10, description: "Sort order number" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Food", code: "FOOD", display_order: "1", enterprise_code: "DEMO01" },
        { name: "Beverage", code: "BEV", display_order: "2", enterprise_code: "DEMO01" },
        { name: "Dessert", code: "DSRT", display_order: "3", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 15,
      sheetName: "15 Family Groups",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "code", key: "code", width: 15, required: true },
        { header: "major_group_code", key: "major_group_code", width: 15, required: true, lookupSheet: "14 Major Groups", description: "Must match a Major Group code" },
        { header: "display_order", key: "display_order", width: 10 },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Burgers", code: "BURG", major_group_code: "FOOD", display_order: "1", enterprise_code: "DEMO01" },
        { name: "Chicken", code: "CHKN", major_group_code: "FOOD", display_order: "2", enterprise_code: "DEMO01" },
        { name: "Sides", code: "SIDES", major_group_code: "FOOD", display_order: "3", enterprise_code: "DEMO01" },
        { name: "Soft Drinks", code: "SODA", major_group_code: "BEV", display_order: "1", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 16,
      sheetName: "16 SLUs",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "button_label", key: "button_label", width: 15, required: true, description: "Text shown on POS button" },
        { header: "display_order", key: "display_order", width: 10 },
        { header: "color", key: "color", width: 12, description: "Hex color (e.g., #3B82F6)" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Appetizers", button_label: "APPS", display_order: "1", color: "#3B82F6", enterprise_code: "DEMO01" },
        { name: "Entrees", button_label: "ENTREES", display_order: "2", color: "#EF4444", enterprise_code: "DEMO01" },
        { name: "Sides", button_label: "SIDES", display_order: "3", color: "#10B981", enterprise_code: "DEMO01" },
        { name: "Drinks", button_label: "DRINKS", display_order: "4", color: "#8B5CF6", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 17,
      sheetName: "17 Modifier Groups",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "required", key: "required", width: 10, description: "true or false" },
        { header: "min_select", key: "min_select", width: 10, description: "Minimum selections (0 = optional)" },
        { header: "max_select", key: "max_select", width: 10, description: "Maximum selections" },
        { header: "display_order", key: "display_order", width: 10 },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Meat Temperature", required: "true", min_select: "1", max_select: "1", display_order: "1", enterprise_code: "DEMO01" },
        { name: "Bread Choice", required: "true", min_select: "1", max_select: "1", display_order: "2", enterprise_code: "DEMO01" },
        { name: "Extra Toppings", required: "false", min_select: "0", max_select: "5", display_order: "3", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 18,
      sheetName: "18 Modifiers",
      columns: [
        { header: "name", key: "name", width: 20, required: true },
        { header: "price_delta", key: "price_delta", width: 12, description: "Extra charge (0.00 for no charge)" },
        { header: "modifier_group_name", key: "modifier_group_name", width: 25, required: true, lookupSheet: "17 Modifier Groups", description: "Must match a Modifier Group name" },
        { header: "is_default", key: "is_default", width: 10, description: "true or false" },
        { header: "display_order", key: "display_order", width: 10 },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { name: "Rare", price_delta: "0.00", modifier_group_name: "Meat Temperature", is_default: "false", display_order: "1", enterprise_code: "DEMO01" },
        { name: "Medium Rare", price_delta: "0.00", modifier_group_name: "Meat Temperature", is_default: "true", display_order: "2", enterprise_code: "DEMO01" },
        { name: "Medium", price_delta: "0.00", modifier_group_name: "Meat Temperature", is_default: "false", display_order: "3", enterprise_code: "DEMO01" },
        { name: "Well Done", price_delta: "0.00", modifier_group_name: "Meat Temperature", is_default: "false", display_order: "4", enterprise_code: "DEMO01" },
        { name: "White", price_delta: "0.00", modifier_group_name: "Bread Choice", is_default: "true", display_order: "1", enterprise_code: "DEMO01" },
        { name: "Wheat", price_delta: "0.00", modifier_group_name: "Bread Choice", is_default: "false", display_order: "2", enterprise_code: "DEMO01" },
        { name: "Rye", price_delta: "0.00", modifier_group_name: "Bread Choice", is_default: "false", display_order: "3", enterprise_code: "DEMO01" },
        { name: "Bacon", price_delta: "1.50", modifier_group_name: "Extra Toppings", is_default: "false", display_order: "1", enterprise_code: "DEMO01" },
        { name: "Extra Cheese", price_delta: "0.75", modifier_group_name: "Extra Toppings", is_default: "false", display_order: "2", enterprise_code: "DEMO01" },
      ],
    },
    {
      phase: 19,
      sheetName: "19 Menu Items",
      columns: [
        { header: "name", key: "name", width: 25, required: true },
        { header: "short_name", key: "short_name", width: 15, description: "Short display name for POS buttons" },
        { header: "price", key: "price", width: 10, required: true, description: "e.g., 12.99" },
        { header: "tax_group_name", key: "tax_group_name", width: 20, lookupSheet: "04 Tax Groups", description: "Must match a Tax Group name" },
        { header: "print_class_code", key: "print_class_code", width: 15, lookupSheet: "13 Print Classes", description: "Must match a Print Class code" },
        { header: "major_group_code", key: "major_group_code", width: 15, lookupSheet: "14 Major Groups", description: "Must match a Major Group code" },
        { header: "family_group_code", key: "family_group_code", width: 15, lookupSheet: "15 Family Groups", description: "Must match a Family Group code" },
        { header: "slu_name", key: "slu_name", width: 20, lookupSheet: "16 SLUs", description: "Must match an SLU name (for POS screen)" },
        { header: "modifier_group_names", key: "modifier_group_names", width: 35, lookupSheet: "17 Modifier Groups", description: "Pipe-separated: Group1|Group2" },
        { header: "color", key: "color", width: 10, description: "Hex color for POS button" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        {
          name: "Classic Burger", short_name: "Cls Burger", price: "12.99",
          tax_group_name: "State Sales Tax", print_class_code: "HOTFOOD",
          major_group_code: "FOOD", family_group_code: "BURG", slu_name: "Entrees",
          modifier_group_names: "Meat Temperature|Bread Choice|Extra Toppings",
          color: "#EF4444", enterprise_code: "DEMO01",
        },
        {
          name: "Chicken Tenders", short_name: "Chk Tndrs", price: "10.99",
          tax_group_name: "State Sales Tax", print_class_code: "HOTFOOD",
          major_group_code: "FOOD", family_group_code: "CHKN", slu_name: "Entrees",
          modifier_group_names: "",
          color: "#F59E0B", enterprise_code: "DEMO01",
        },
        {
          name: "French Fries", short_name: "Fries", price: "4.99",
          tax_group_name: "State Sales Tax", print_class_code: "HOTFOOD",
          major_group_code: "FOOD", family_group_code: "SIDES", slu_name: "Sides",
          modifier_group_names: "",
          color: "#10B981", enterprise_code: "DEMO01",
        },
        {
          name: "Coca-Cola", short_name: "Coke", price: "2.99",
          tax_group_name: "State Sales Tax", print_class_code: "DRINKS",
          major_group_code: "BEV", family_group_code: "SODA", slu_name: "Drinks",
          modifier_group_names: "",
          color: "#8B5CF6", enterprise_code: "DEMO01",
        },
      ],
    },
    {
      phase: 20,
      sheetName: "20 Employees",
      columns: [
        { header: "employee_number", key: "employee_number", width: 15, required: true },
        { header: "first_name", key: "first_name", width: 15, required: true },
        { header: "last_name", key: "last_name", width: 15, required: true },
        { header: "pin", key: "pin", width: 10, required: true, description: "4-digit PIN for POS login" },
        { header: "role_code", key: "role_code", width: 15, required: true, lookupSheet: "08 Roles", description: "Must match a Role code" },
        { header: "job_code", key: "job_code", width: 15, lookupSheet: "09 Job Codes", description: "Must match a Job Code code" },
        { header: "property_code", key: "property_code", width: 15, lookupSheet: "02 Properties", description: "Primary property assignment" },
        { header: "enterprise_code", key: "enterprise_code", width: 15, required: true, lookupSheet: "01 Enterprise" },
      ],
      exampleRows: [
        { employee_number: "1001", first_name: "John", last_name: "Doe", pin: "1234", role_code: "MGR", job_code: "SHFTMGR", property_code: "PROP01", enterprise_code: "DEMO01" },
        { employee_number: "1002", first_name: "Jane", last_name: "Smith", pin: "5678", role_code: "CASHIER", job_code: "CASH01", property_code: "PROP01", enterprise_code: "DEMO01" },
      ],
    },
  ];
}

async function generateExcelTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OnPoint POS";
  workbook.created = new Date();

  const phases = getPhaseDefinitions();

  const instructionsSheet = workbook.addWorksheet("Instructions", { properties: { tabColor: { argb: "FF4472C4" } } });
  instructionsSheet.columns = [
    { header: "Step", key: "step", width: 6 },
    { header: "Tab Name", key: "tab", width: 25 },
    { header: "Description", key: "description", width: 50 },
    { header: "Dependencies", key: "deps", width: 40 },
  ];
  instructionsSheet.getRow(1).font = { bold: true, size: 12 };
  instructionsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  instructionsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };

  const lookupDescriptions: Record<string, string> = {
    "01 Enterprise": "Organization — fill this first",
    "02 Properties": "Locations with receipt headers/trailers",
    "03 Revenue Centers": "Service areas within each location",
    "04 Tax Groups": "Tax rates for menu items",
    "05 Tenders": "Payment methods (cash, credit, etc.)",
    "06 Discounts": "Discount types and values",
    "07 Service Charges": "Automatic or manual service charges",
    "08 Roles": "Permission levels (Manager, Cashier, etc.)",
    "09 Job Codes": "Job positions with pay rates",
    "10 Printers": "Physical receipt and kitchen printers",
    "11 KDS Devices": "Kitchen display stations",
    "12 Order Devices": "Logical routing to printers and KDS",
    "13 Print Classes": "Menu item routing categories",
    "14 Major Groups": "Top-level reporting categories",
    "15 Family Groups": "Sub-categories under major groups",
    "16 SLUs": "POS screen category buttons",
    "17 Modifier Groups": "Modifier categories (size, temp, etc.)",
    "18 Modifiers": "Individual modifier options",
    "19 Menu Items": "All menu items with pricing and links",
    "20 Employees": "Staff with PINs and assignments",
  };

  const depsMap: Record<string, string> = {
    "01 Enterprise": "None — start here",
    "02 Properties": "Enterprise",
    "03 Revenue Centers": "Properties",
    "04 Tax Groups": "Enterprise",
    "05 Tenders": "Enterprise",
    "06 Discounts": "Enterprise",
    "07 Service Charges": "Enterprise",
    "08 Roles": "Enterprise",
    "09 Job Codes": "Enterprise, Roles",
    "10 Printers": "Properties",
    "11 KDS Devices": "Properties",
    "12 Order Devices": "Properties, KDS Devices",
    "13 Print Classes": "Enterprise",
    "14 Major Groups": "Enterprise",
    "15 Family Groups": "Enterprise, Major Groups",
    "16 SLUs": "Enterprise",
    "17 Modifier Groups": "Enterprise",
    "18 Modifiers": "Enterprise, Modifier Groups",
    "19 Menu Items": "Enterprise, Tax Groups, Print Classes, Major Groups, Family Groups, SLUs, Modifier Groups",
    "20 Employees": "Enterprise, Roles, Job Codes, Properties",
  };

  phases.forEach((p, i) => {
    const row = instructionsSheet.addRow({
      step: p.phase,
      tab: p.sheetName,
      description: lookupDescriptions[p.sheetName] || "",
      deps: depsMap[p.sheetName] || "",
    });
    if (i % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    }
  });

  const namedRanges: Record<string, { sheetName: string; col: string }> = {};

  for (const phase of phases) {
    const sheet = workbook.addWorksheet(phase.sheetName, {
      properties: { tabColor: { argb: phase.phase <= 3 ? "FF4472C4" : phase.phase <= 9 ? "FF70AD47" : phase.phase <= 13 ? "FFFFC000" : phase.phase <= 18 ? "FFED7D31" : "FF5B9BD5" } },
    });

    sheet.columns = phase.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
    headerRow.alignment = { horizontal: "center" };

    const descRow = sheet.addRow(
      phase.columns.reduce((acc, col) => {
        acc[col.key] = col.description || "";
        return acc;
      }, {} as Record<string, string>)
    );
    descRow.font = { italic: true, color: { argb: "FF808080" }, size: 9 };
    descRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };

    for (const example of phase.exampleRows) {
      const row = sheet.addRow(example);
      row.font = { color: { argb: "FF666666" } };
    }

    phase.columns.forEach((col, colIdx) => {
      if (col.required) {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 1000; r++) {
          const cell = sheet.getCell(`${colLetter}${r}`);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF7FF" } };
        }
      }
    });

    const codeCol = phase.columns.find((c) => c.key === "code");
    const nameCol = phase.columns.find((c) => c.key === "name");
    const lookupCol = codeCol || nameCol;
    if (lookupCol) {
      const colIdx = phase.columns.indexOf(lookupCol);
      const colLetter = String.fromCharCode(65 + colIdx);
      const rangeName = phase.sheetName.replace(/\s+/g, "_");
      namedRanges[phase.sheetName] = { sheetName: phase.sheetName, col: colLetter };
    }
  }

  for (const phase of phases) {
    const sheet = workbook.getWorksheet(phase.sheetName);
    if (!sheet) continue;

    phase.columns.forEach((col, colIdx) => {
      if (col.lookupSheet && namedRanges[col.lookupSheet]) {
        const ref = namedRanges[col.lookupSheet];
        const refSheet = workbook.getWorksheet(ref.sheetName);
        if (!refSheet) return;

        const lookupColDef = getPhaseDefinitions().find((p) => p.sheetName === col.lookupSheet);
        if (!lookupColDef) return;

        const lookupKey = col.key.includes("code") || col.key === "role_code" || col.key === "enterprise_code" || col.key === "property_code" || col.key === "major_group_code" || col.key === "family_group_code" || col.key === "print_class_code"
          ? "code"
          : "name";
        const lookupColIdx = lookupColDef.columns.findIndex((c) => c.key === lookupKey);
        if (lookupColIdx < 0) return;

        const lookupLetter = String.fromCharCode(65 + lookupColIdx);
        const formula = `'${ref.sheetName}'!$${lookupLetter}$3:$${lookupLetter}$500`;

        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list",
            allowBlank: !col.required,
            formulae: [formula],
            showErrorMessage: true,
            errorTitle: "Invalid Value",
            error: `Value must match an entry from the "${col.lookupSheet}" tab`,
          };
        }
      }

      if (col.key === "business_date_mode") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"auto,manual"'],
          };
        }
      }
      if (col.key === "tax_mode") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"add_on,inclusive"'],
          };
        }
      }
      if (col.key === "type" && (phase.sheetName.includes("Tender") || phase.sheetName.includes("05"))) {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: false,
            formulae: ['"cash,credit,gift,other"'],
          };
        }
      }
      if (col.key === "type" && (phase.sheetName.includes("Discount") || phase.sheetName.includes("Service"))) {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: false,
            formulae: ['"percent,amount"'],
          };
        }
      }
      if (col.key === "printer_type") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: false,
            formulae: ['"receipt,kitchen,bar,prep,report"'],
          };
        }
      }
      if (col.key === "connection_type") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"network,usb,serial"'],
          };
        }
      }
      if (col.key === "driver_protocol") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"epson,star"'],
          };
        }
      }
      if (col.key === "station_type") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: false,
            formulae: ['"hot,cold,prep,expo,bar"'],
          };
        }
      }
      if (col.key === "send_on") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"send_button,dynamic"'],
          };
        }
      }
      if (col.key === "compensation_type") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"hourly,salaried"'],
          };
        }
      }
      if (col.key === "tip_mode") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"not_eligible,pooled,direct,both"'],
          };
        }
      }
      if (col.key === "default_order_type") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"dine_in,take_out,delivery,pickup"'],
          };
        }
      }
      if (col.key === "dom_send_mode") {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"fire_on_fly,fire_on_next,fire_on_tender"'],
          };
        }
      }
      if (["auto_clock_out_enabled", "fast_transaction_default", "dynamic_order_mode", "conversational_ordering_enabled", "requires_manager_approval", "auto_apply", "override_header", "override_trailer", "send_voids", "send_reprints", "required", "is_default"].includes(col.key)) {
        const colLetter = String.fromCharCode(65 + colIdx);
        for (let r = 4; r <= 500; r++) {
          sheet.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list", allowBlank: true,
            formulae: ['"true,false"'],
          };
        }
      }
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: phase.columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}

async function lookupEnterpriseByCode(code: string): Promise<string | null> {
  const all = await storage.getEnterprises();
  const ent = all.find(e => e.code === code);
  return ent?.id || null;
}

async function lookupPropertyByCode(code: string): Promise<{ id: string; enterpriseId: string } | null> {
  const all = await storage.getProperties();
  const prop = all.find(p => p.code === code);
  return prop ? { id: prop.id, enterpriseId: prop.enterpriseId } : null;
}

async function lookupRoleByCode(code: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getRoles();
  const role = all.find(r => r.code === code && r.enterpriseId === enterpriseId);
  return role?.id || null;
}

async function lookupTaxGroupByName(name: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getTaxGroups();
  const tg = all.find(t => t.name === name && t.enterpriseId === enterpriseId);
  return tg?.id || null;
}

async function lookupPrintClassByCode(code: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getPrintClasses();
  const pc = all.find(p => p.code === code && p.enterpriseId === enterpriseId);
  return pc?.id || null;
}

async function lookupMajorGroupByCode(code: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getMajorGroups();
  const mg = all.find(m => m.code === code && m.enterpriseId === enterpriseId);
  return mg?.id || null;
}

async function lookupFamilyGroupByCode(code: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getFamilyGroups();
  const fg = all.find(f => f.code === code && f.enterpriseId === enterpriseId);
  return fg?.id || null;
}

async function lookupSluByName(name: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getSlus();
  const slu = all.find(s => s.name === name && s.enterpriseId === enterpriseId);
  return slu?.id || null;
}

async function lookupModifierGroupByName(name: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getModifierGroups();
  const mg = all.find(m => m.name === name && m.enterpriseId === enterpriseId);
  return mg?.id || null;
}

async function lookupKdsDeviceByName(name: string, propertyId: string): Promise<string | null> {
  const all = await storage.getKdsDevices(propertyId);
  const kds = all.find(k => k.name === name);
  return kds?.id || null;
}

async function lookupJobCodeByCode(code: string, enterpriseId: string): Promise<string | null> {
  const all = await storage.getJobCodes();
  const jc = all.find(j => j.code === code && j.enterpriseId === enterpriseId);
  return jc?.id || null;
}

function toBool(val: string): boolean {
  return val?.toLowerCase() === "true";
}

async function importPhase(phase: number, rows: Record<string, string>[]): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      switch (phase) {
        case 1: {
          if (!row.name || !row.code) { errors.push(`Row ${rowNum}: name and code are required`); break; }
          await storage.createEnterprise({ name: row.name, code: row.code } as InsertEnterprise);
          inserted++;
          break;
        }
        case 2: {
          if (!row.name || !row.code || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createProperty({
            name: row.name, code: row.code, enterpriseId: entId,
            address: row.address || null,
            timezone: row.timezone || "America/New_York",
            businessDateRolloverTime: row.business_date_rollover_time || "04:00",
            businessDateMode: row.business_date_mode || "auto",
            autoClockOutEnabled: toBool(row.auto_clock_out_enabled),
          } as InsertProperty);
          inserted++;
          break;
        }
        case 3: {
          if (!row.name || !row.code || !row.property_code) { errors.push(`Row ${rowNum}: name, code, and property_code are required`); break; }
          const prop = await lookupPropertyByCode(row.property_code);
          if (!prop) { errors.push(`Row ${rowNum}: Property code '${row.property_code}' not found`); break; }
          await storage.createRvc({
            name: row.name, code: row.code, propertyId: prop.id,
            defaultOrderType: row.default_order_type || "dine_in",
            fastTransactionDefault: toBool(row.fast_transaction_default),
            dynamicOrderMode: toBool(row.dynamic_order_mode),
            domSendMode: row.dom_send_mode || "fire_on_fly",
            conversationalOrderingEnabled: toBool(row.conversational_ordering_enabled),
          } as InsertRvc);
          inserted++;
          break;
        }
        case 4: {
          if (!row.name || !row.rate || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, rate, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createTaxGroup({
            name: row.name, rate: row.rate,
            taxMode: row.tax_mode || "add_on",
            enterpriseId: entId,
          } as InsertTaxGroup);
          inserted++;
          break;
        }
        case 5: {
          if (!row.name || !row.code || !row.type || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, type, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createTender({
            name: row.name, code: row.code, type: row.type,
            enterpriseId: entId,
          } as InsertTender);
          inserted++;
          break;
        }
        case 6: {
          if (!row.name || !row.code || !row.type || !row.value || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, type, value, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createDiscount({
            name: row.name, code: row.code, type: row.type, value: row.value,
            requiresManagerApproval: toBool(row.requires_manager_approval),
            enterpriseId: entId,
          } as InsertDiscount);
          inserted++;
          break;
        }
        case 7: {
          if (!row.name || !row.code || !row.type || !row.value || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, type, value, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createServiceCharge({
            name: row.name, code: row.code, type: row.type, value: row.value,
            autoApply: toBool(row.auto_apply),
            enterpriseId: entId,
          } as InsertServiceCharge);
          inserted++;
          break;
        }
        case 8: {
          if (!row.name || !row.code || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createRole({
            name: row.name, code: row.code, enterpriseId: entId,
          } as InsertRole);
          inserted++;
          break;
        }
        case 9: {
          if (!row.name || !row.code || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          let roleId: string | null = null;
          if (row.role_code) {
            roleId = await lookupRoleByCode(row.role_code, entId);
            if (!roleId) { errors.push(`Row ${rowNum}: Role code '${row.role_code}' not found`); break; }
          }
          await storage.createJobCode({
            name: row.name, code: row.code, enterpriseId: entId,
            roleId,
            compensationType: row.compensation_type || "hourly",
            hourlyRate: row.hourly_rate || null,
            tipMode: row.tip_mode || "not_eligible",
          } as InsertJobCode);
          inserted++;
          break;
        }
        case 10: {
          if (!row.name || !row.printer_type || !row.property_code) { errors.push(`Row ${rowNum}: name, printer_type, and property_code are required`); break; }
          const prop = await lookupPropertyByCode(row.property_code);
          if (!prop) { errors.push(`Row ${rowNum}: Property code '${row.property_code}' not found`); break; }
          await storage.createPrinter({
            name: row.name, printerType: row.printer_type,
            connectionType: row.connection_type || "network",
            ipAddress: row.ip_address || null,
            port: row.port ? parseInt(row.port) : 9100,
            driverProtocol: row.driver_protocol || "epson",
            model: row.model || null,
            characterWidth: row.character_width ? parseInt(row.character_width) : 42,
            propertyId: prop.id,
          } as InsertPrinter);
          inserted++;
          break;
        }
        case 11: {
          if (!row.name || !row.station_type || !row.property_code) { errors.push(`Row ${rowNum}: name, station_type, and property_code are required`); break; }
          const prop = await lookupPropertyByCode(row.property_code);
          if (!prop) { errors.push(`Row ${rowNum}: Property code '${row.property_code}' not found`); break; }
          await storage.createKdsDevice({
            name: row.name, stationType: row.station_type,
            propertyId: prop.id,
          } as InsertKdsDevice);
          inserted++;
          break;
        }
        case 12: {
          if (!row.name || !row.code || !row.property_code) { errors.push(`Row ${rowNum}: name, code, and property_code are required`); break; }
          const prop = await lookupPropertyByCode(row.property_code);
          if (!prop) { errors.push(`Row ${rowNum}: Property code '${row.property_code}' not found`); break; }
          let kdsDeviceId: string | null = null;
          if (row.kds_device_name) {
            kdsDeviceId = await lookupKdsDeviceByName(row.kds_device_name, prop.id);
            if (!kdsDeviceId) { errors.push(`Row ${rowNum}: KDS Device '${row.kds_device_name}' not found for property '${row.property_code}'`); break; }
          }
          await storage.createOrderDevice({
            name: row.name, code: row.code, propertyId: prop.id,
            kdsDeviceId,
            sendOn: row.send_on || "send_button",
            sendVoids: row.send_voids ? toBool(row.send_voids) : true,
            sendReprints: row.send_reprints ? toBool(row.send_reprints) : true,
          } as InsertOrderDevice);
          inserted++;
          break;
        }
        case 13: {
          if (!row.name || !row.code || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createPrintClass({
            name: row.name, code: row.code, enterpriseId: entId,
          } as InsertPrintClass);
          inserted++;
          break;
        }
        case 14: {
          if (!row.name || !row.code || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createMajorGroup({
            name: row.name, code: row.code,
            displayOrder: row.display_order ? parseInt(row.display_order) : 0,
            enterpriseId: entId,
          } as InsertMajorGroup);
          inserted++;
          break;
        }
        case 15: {
          if (!row.name || !row.code || !row.major_group_code || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, code, major_group_code, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          const mgId = await lookupMajorGroupByCode(row.major_group_code, entId);
          if (!mgId) { errors.push(`Row ${rowNum}: Major Group code '${row.major_group_code}' not found`); break; }
          await storage.createFamilyGroup({
            name: row.name, code: row.code, majorGroupId: mgId,
            displayOrder: row.display_order ? parseInt(row.display_order) : 0,
            enterpriseId: entId,
          } as InsertFamilyGroup);
          inserted++;
          break;
        }
        case 16: {
          if (!row.name || !row.button_label || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, button_label, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createSlu({
            name: row.name, buttonLabel: row.button_label,
            displayOrder: row.display_order ? parseInt(row.display_order) : 0,
            color: row.color || "#3B82F6",
            enterpriseId: entId,
          } as InsertSlu);
          inserted++;
          break;
        }
        case 17: {
          if (!row.name || !row.enterprise_code) { errors.push(`Row ${rowNum}: name and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          await storage.createModifierGroup({
            name: row.name,
            required: toBool(row.required),
            minSelect: row.min_select ? parseInt(row.min_select) : 0,
            maxSelect: row.max_select ? parseInt(row.max_select) : 99,
            displayOrder: row.display_order ? parseInt(row.display_order) : 0,
            enterpriseId: entId,
          } as InsertModifierGroup);
          inserted++;
          break;
        }
        case 18: {
          if (!row.name || !row.enterprise_code || !row.modifier_group_name) { errors.push(`Row ${rowNum}: name, modifier_group_name, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          const mgId = await lookupModifierGroupByName(row.modifier_group_name, entId);
          if (!mgId) { errors.push(`Row ${rowNum}: Modifier Group '${row.modifier_group_name}' not found`); break; }
          const mod = await storage.createModifier({
            name: row.name,
            priceDelta: row.price_delta || "0",
            enterpriseId: entId,
          } as InsertModifier);
          await storage.linkModifierToGroup({
            modifierGroupId: mgId, modifierId: mod.id,
            isDefault: toBool(row.is_default),
            displayOrder: row.display_order ? parseInt(row.display_order) : 0,
          } as InsertModifierGroupModifier);
          inserted++;
          break;
        }
        case 19: {
          if (!row.name || !row.price || !row.enterprise_code) { errors.push(`Row ${rowNum}: name, price, and enterprise_code are required`); break; }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          let taxGroupId: string | null = null;
          if (row.tax_group_name) {
            taxGroupId = await lookupTaxGroupByName(row.tax_group_name, entId);
            if (!taxGroupId) { errors.push(`Row ${rowNum}: Tax Group '${row.tax_group_name}' not found`); break; }
          }
          let printClassId: string | null = null;
          if (row.print_class_code) {
            printClassId = await lookupPrintClassByCode(row.print_class_code, entId);
            if (!printClassId) { errors.push(`Row ${rowNum}: Print Class '${row.print_class_code}' not found`); break; }
          }
          let majorGroupId: string | null = null;
          if (row.major_group_code) {
            majorGroupId = await lookupMajorGroupByCode(row.major_group_code, entId);
            if (!majorGroupId) { errors.push(`Row ${rowNum}: Major Group '${row.major_group_code}' not found`); break; }
          }
          let familyGroupId: string | null = null;
          if (row.family_group_code) {
            familyGroupId = await lookupFamilyGroupByCode(row.family_group_code, entId);
            if (!familyGroupId) { errors.push(`Row ${rowNum}: Family Group '${row.family_group_code}' not found`); break; }
          }
          const menuItem = await storage.createMenuItem({
            name: row.name, shortName: row.short_name || null,
            price: row.price, taxGroupId, printClassId, majorGroupId, familyGroupId,
            color: row.color || "#3B82F6",
            enterpriseId: entId,
          } as InsertMenuItem);
          if (row.slu_name) {
            const sluId = await lookupSluByName(row.slu_name, entId);
            if (sluId) {
              await storage.setMenuItemSlus(menuItem.id, [sluId]);
            } else {
              errors.push(`Row ${rowNum}: SLU '${row.slu_name}' not found (menu item was created but SLU not linked)`);
            }
          }
          if (row.modifier_group_names) {
            const groupNames = row.modifier_group_names.split("|").map((s) => s.trim()).filter(Boolean);
            for (let g = 0; g < groupNames.length; g++) {
              const modGroupId = await lookupModifierGroupByName(groupNames[g], entId);
              if (modGroupId) {
                await storage.linkModifierGroupToMenuItem({
                  menuItemId: menuItem.id, modifierGroupId: modGroupId, displayOrder: g,
                } as InsertMenuItemModifierGroup);
              } else {
                errors.push(`Row ${rowNum}: Modifier Group '${groupNames[g]}' not found (menu item was created but modifier group not linked)`);
              }
            }
          }
          inserted++;
          break;
        }
        case 20: {
          if (!row.employee_number || !row.first_name || !row.last_name || !row.pin || !row.role_code || !row.enterprise_code) {
            errors.push(`Row ${rowNum}: employee_number, first_name, last_name, pin, role_code, and enterprise_code are required`); break;
          }
          const entId = await lookupEnterpriseByCode(row.enterprise_code);
          if (!entId) { errors.push(`Row ${rowNum}: Enterprise code '${row.enterprise_code}' not found`); break; }
          const roleId = await lookupRoleByCode(row.role_code, entId);
          if (!roleId) { errors.push(`Row ${rowNum}: Role code '${row.role_code}' not found`); break; }
          const emp = await storage.createEmployee({
            employeeNumber: row.employee_number,
            firstName: row.first_name,
            lastName: row.last_name,
            pinHash: hashPin(row.pin),
            roleId,
            enterpriseId: entId,
          } as InsertEmployee);
          if (row.property_code) {
            const prop = await lookupPropertyByCode(row.property_code);
            if (prop) {
              await storage.setEmployeeAssignments(emp.id, [prop.id]);
            }
          }
          if (row.job_code) {
            const jcId = await lookupJobCodeByCode(row.job_code, entId);
            if (jcId) {
              await storage.setEmployeeJobCodes(emp.id, [{ jobCodeId: jcId, isPrimary: true }]);
            }
          }
          inserted++;
          break;
        }
        default:
          errors.push(`Unknown phase: ${phase}`);
      }
    } catch (err: any) {
      errors.push(`Row ${rowNum}: ${err.message || String(err)}`);
    }
  }

  return { inserted, errors };
}

export function registerOnboardingRoutes(app: Express) {
  app.get("/api/onboarding/templates", async (_req: Request, res: Response) => {
    try {
      const buffer = await generateExcelTemplate();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=OnPoint_POS_Onboarding_Templates.xlsx");
      res.send(buffer);
    } catch (err: any) {
      console.error("Error generating template:", err);
      res.status(500).json({ error: "Failed to generate template" });
    }
  });

  app.post("/api/onboarding/import/:phase", async (req: Request, res: Response) => {
    try {
      const phase = parseInt(req.params.phase);
      if (isNaN(phase) || phase < 1 || phase > 20) {
        return res.status(400).json({ error: "Phase must be between 1 and 20" });
      }

      const contentType = req.headers["content-type"] || "";

      let rows: Record<string, string>[] = [];

      if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
        const csvText = typeof req.body === "string" ? req.body : req.body.toString("utf8");
        const parsed = parseCSV(csvText);
        rows = parsed.rows;
      } else if (contentType.includes("application/json")) {
        rows = req.body.rows || req.body;
        if (!Array.isArray(rows)) {
          return res.status(400).json({ error: "Expected JSON body with 'rows' array" });
        }
      } else if (contentType.includes("spreadsheetml") || contentType.includes("octet-stream")) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.body);
        const phases = getPhaseDefinitions();
        const phaseDef = phases.find((p) => p.phase === phase);
        if (!phaseDef) {
          return res.status(400).json({ error: `No definition found for phase ${phase}` });
        }
        const sheet = workbook.getWorksheet(phaseDef.sheetName);
        if (!sheet) {
          return res.status(400).json({ error: `Sheet '${phaseDef.sheetName}' not found in workbook` });
        }
        const headers: string[] = [];
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value || "").trim();
        });
        for (let r = 3; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          const record: Record<string, string> = {};
          let hasData = false;
          headers.forEach((h, idx) => {
            const val = String(row.getCell(idx + 1).value || "").trim();
            if (val) hasData = true;
            record[h] = val;
          });
          if (hasData) rows.push(record);
        }
      } else {
        return res.status(400).json({ error: "Unsupported content type. Use text/csv, application/json, or application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      }

      if (rows.length === 0) {
        return res.status(400).json({ error: "No data rows found" });
      }

      const result = await importPhase(phase, rows);
      res.json({
        phase,
        inserted: result.inserted,
        errors: result.errors,
        total: rows.length,
        success: result.errors.length === 0,
      });
    } catch (err: any) {
      console.error("Import error:", err);
      res.status(500).json({ error: err.message || "Import failed" });
    }
  });

  app.get("/api/onboarding/phases", (_req: Request, res: Response) => {
    const phases = getPhaseDefinitions().map((p) => ({
      phase: p.phase,
      sheetName: p.sheetName,
      columns: p.columns.map((c) => ({
        header: c.header,
        required: c.required || false,
        description: c.description || null,
        lookupSheet: c.lookupSheet || null,
      })),
    }));
    res.json(phases);
  });
}
