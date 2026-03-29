const DEFAULT_TIMEZONE = "America/New_York";

function safeTz(timezone?: string | null): string {
  return timezone || DEFAULT_TIMEZONE;
}

export function formatTimeInTimezone(
  date: Date,
  timezone?: string | null,
): string {
  try {
    return date.toLocaleTimeString("en-US", {
      timeZone: safeTz(timezone),
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date.toLocaleTimeString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export function formatDateInTimezone(
  date: Date,
  timezone?: string | null,
): string {
  try {
    return date.toLocaleDateString("en-US", {
      timeZone: safeTz(timezone),
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date.toLocaleDateString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}

export function formatDateTimeInTimezone(
  date: Date,
  timezone?: string | null,
): string {
  return `${formatDateInTimezone(date, timezone)} ${formatTimeInTimezone(date, timezone)}`;
}

export function formatTimestampInTimezone(
  date: Date | string | null | undefined,
  timezone?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const defaults: Intl.DateTimeFormatOptions = {
    timeZone: safeTz(timezone),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return d.toLocaleString("en-US", options ? { ...defaults, ...options } : defaults);
  } catch {
    return d.toLocaleString("en-US", { ...defaults, timeZone: DEFAULT_TIMEZONE });
  }
}

export function formatShortTimeInTimezone(
  date: Date | string | null | undefined,
  timezone?: string | null,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return d.toLocaleTimeString("en-US", {
      timeZone: safeTz(timezone),
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d.toLocaleTimeString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

export function formatShortDateInTimezone(
  date: Date | string | null | undefined,
  timezone?: string | null,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return d.toLocaleDateString("en-US", {
      timeZone: safeTz(timezone),
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d.toLocaleDateString("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}
