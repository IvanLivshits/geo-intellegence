export enum Locale {
  En = 'en',
  Es = 'es',
  Ru = 'ru',
}

export function parseLocale(value: string | null | undefined): Locale | null {
  return (Object.values(Locale) as string[]).includes(value ?? '') ? (value as Locale) : null;
}
