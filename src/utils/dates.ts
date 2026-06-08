export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function addHours(hours: number): string {
  return addMinutes(hours * 60);
}

export function isExpired(isoDate: string): boolean {
  return new Date(isoDate) < new Date();
}

export function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function periodLabel(period: string): string {
  switch (period) {
    case 'today': return 'today';
    case 'this_week': return 'this week';
    case 'this_month': return 'this month';
    default: return 'all time';
  }
}

export function periodStart(period: string): string | null {
  switch (period) {
    case 'today': return startOfToday();
    case 'this_week': return startOfWeek();
    case 'this_month': return startOfMonth();
    default: return null;
  }
}
