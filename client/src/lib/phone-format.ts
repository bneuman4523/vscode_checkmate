export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");

  if (!digits.startsWith("+")) {
    const raw = digits.replace(/\D/g, "");
    if (raw.length === 0) return "+";

    if (raw.length <= 1) return `+${raw}`;

    if (raw.startsWith("1") && raw.length <= 11) {
      const country = raw.slice(0, 1);
      const area = raw.slice(1, 4);
      const prefix = raw.slice(4, 7);
      const line = raw.slice(7, 11);

      if (raw.length <= 4) return `+${country} (${area}`;
      if (raw.length <= 7) return `+${country} (${area}) ${prefix}`;
      return `+${country} (${area}) ${prefix}-${line}`;
    }

    return `+${raw}`;
  }

  const rawDigits = digits.slice(1).replace(/\D/g, "");

  if (rawDigits.length === 0) return "+";

  if (rawDigits.startsWith("1") && rawDigits.length <= 11) {
    const country = rawDigits.slice(0, 1);
    const area = rawDigits.slice(1, 4);
    const prefix = rawDigits.slice(4, 7);
    const line = rawDigits.slice(7, 11);

    if (rawDigits.length <= 1) return `+${country}`;
    if (rawDigits.length <= 4) return `+${country} (${area}`;
    if (rawDigits.length <= 7) return `+${country} (${area}) ${prefix}`;
    return `+${country} (${area}) ${prefix}-${line}`;
  }

  return `+${rawDigits}`;
}

export function toE164(formatted: string): string {
  const digits = formatted.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return "+" + digits.slice(1).replace(/\D/g, "");
  }
  const raw = digits.replace(/\D/g, "");
  return raw ? `+${raw}` : "";
}
