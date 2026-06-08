const ALIAS_RE = /^[a-z0-9_]{2,32}$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

export function normalizeAlias(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim();
}

export function isValidAlias(alias: string): boolean {
  return ALIAS_RE.test(alias);
}

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone);
}

export function isValidUsdcAmount(amount: number): boolean {
  return amount > 0 && amount <= 10_000 && Number.isFinite(amount);
}

export function normalizePhone(phone: string): string {
  // Strip whatsapp: prefix if present
  return phone.replace(/^whatsapp:/i, '').trim();
}

export function toWhatsAppNumber(phone: string): string {
  const clean = normalizePhone(phone);
  return clean.startsWith('whatsapp:') ? clean : `whatsapp:${clean}`;
}

export function truncateWallet(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
