/**
 * Interface text in English and German. Dates inside messages arrive already formatted
 * for the locale. Anything that is not German falls back to English.
 */

export interface Messages {
  previousMonth: string;
  nextMonth: string;
  previousYear: string;
  nextYear: string;
  previousYears: (count: number) => string;
  nextYears: (count: number) => string;
  /** range picking: the two steps */
  selectStart: string;
  selectEnd: string;
  chooseDate: string;
  chooseDates: string;
  /** how YYYY-MM-DD is written in hints and placeholders */
  datePattern: string;
  formatHint: (pattern: string) => string;
  badInput: (pattern: string) => string;
  badInputRange: (pattern: string) => string;
  valueMissing: string;
  valueMissingRange: string;
  rangeUnderflow: (min: string) => string;
  rangeOverflow: (max: string) => string;
  unavailable: string;
}

const en: Messages = {
  previousMonth: "Previous month",
  nextMonth: "Next month",
  previousYear: "Previous year",
  nextYear: "Next year",
  previousYears: (count) => `Previous ${count} years`,
  nextYears: (count) => `Next ${count} years`,
  selectStart: "Select start date",
  selectEnd: "Select end date",
  chooseDate: "Choose date",
  chooseDates: "Choose dates",
  datePattern: "YYYY-MM-DD",
  formatHint: (pattern) => `Format: ${pattern}`,
  badInput: (pattern) => `Enter a date as ${pattern}.`,
  badInputRange: (pattern) => `Enter dates as ${pattern}.`,
  valueMissing: "Please choose a date.",
  valueMissingRange: "Please choose dates.",
  rangeUnderflow: (min) => `Choose ${min} or later.`,
  rangeOverflow: (max) => `Choose ${max} or earlier.`,
  unavailable: "This date is not available.",
};

const de: Messages = {
  previousMonth: "Vorheriger Monat",
  nextMonth: "Nächster Monat",
  previousYear: "Vorheriges Jahr",
  nextYear: "Nächstes Jahr",
  previousYears: (count) => `Vorherige ${count} Jahre`,
  nextYears: (count) => `Nächste ${count} Jahre`,
  selectStart: "Startdatum wählen",
  selectEnd: "Enddatum wählen",
  chooseDate: "Datum wählen",
  chooseDates: "Zeitraum wählen",
  datePattern: "JJJJ-MM-TT",
  formatHint: (pattern) => `Format: ${pattern}`,
  badInput: (pattern) => `Bitte ein Datum im Format ${pattern} eingeben.`,
  badInputRange: (pattern) => `Bitte einen Zeitraum im Format ${pattern} eingeben.`,
  valueMissing: "Bitte ein Datum wählen.",
  valueMissingRange: "Bitte einen Zeitraum wählen.",
  rangeUnderflow: (min) => `Bitte ${min} oder später wählen.`,
  rangeOverflow: (max) => `Bitte ${max} oder früher wählen.`,
  unavailable: "Dieses Datum ist nicht verfügbar.",
};

const catalogs: Record<string, Messages> = { en, de };

/** the messages for a locale: by its language (de, de-AT, de-CH → German), English otherwise */
export const messagesFor = (locale: string) => {
  const language = (() => {
    try {
      return new Intl.Locale(locale).language;
    } catch {
      return "en";
    }
  })();
  return catalogs[language] ?? en;
};
