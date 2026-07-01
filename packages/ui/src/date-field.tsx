import { Field as BaseField } from "@base-ui/react/field";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "./button";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "./popover";
import { cn } from "./utils";

export type CalendarLabels = {
  nextMonth: string;
  previousMonth: string;
  weekdays?: readonly [string, string, string, string, string, string, string] | undefined;
};

export function Calendar(props: {
  className?: string | undefined;
  labels: CalendarLabels;
  locale?: string | undefined;
  onValueChange: (value: string) => void;
  value?: string | null | undefined;
  weekStartsOn?: 0 | 1 | undefined;
}) {
  const selectedDate = parseDateValue(props.value);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const weekStartsOn = props.weekStartsOn ?? 0;
  const weekdays = props.labels.weekdays ?? weekdayLabels(weekStartsOn, props.locale);

  useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(startOfMonth(selectedDate));
    }
  }, [props.value]);

  const days = useMemo(
    () => calendarGrid(visibleMonth, weekStartsOn),
    [visibleMonth, weekStartsOn],
  );
  const visibleMonthValue = visibleMonth.getMonth();

  return (
    <div className={cn("qitu-calendar", props.className)}>
      <div className="qitu-calendar-header">
        <Button
          aria-label={props.labels.previousMonth}
          className="size-8 px-0"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
        >
          <ChevronLeft aria-hidden="true" size={14} />
        </Button>
        <div className="qitu-calendar-month">{formatMonth(visibleMonth, props.locale)}</div>
        <Button
          aria-label={props.labels.nextMonth}
          className="size-8 px-0"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
        >
          <ChevronRight aria-hidden="true" size={14} />
        </Button>
      </div>
      <div className="qitu-calendar-weekdays">
        {weekdays.map((weekday) => (
          <div key={weekday}>{weekday}</div>
        ))}
      </div>
      <div className="qitu-calendar-grid">
        {days.map((date) => {
          const value = dateValue(date);
          const selected = props.value === value;
          const outside = date.getMonth() !== visibleMonthValue;

          return (
            <button
              aria-pressed={selected}
              className="qitu-calendar-day"
              data-outside={outside ? "true" : undefined}
              data-selected={selected ? "true" : undefined}
              key={value}
              type="button"
              onClick={() => props.onValueChange(value)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateField(props: {
  className?: string | undefined;
  label: string;
  labels: CalendarLabels;
  locale?: string | undefined;
  name?: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  value: string;
  weekStartsOn?: 0 | 1 | undefined;
}) {
  const [open, setOpen] = useState(false);
  const label = props.value
    ? formatDateValue(props.value, props.locale)
    : (props.placeholder ?? "Select date");

  return (
    <BaseField.Root className={cn("qitu-form-field", props.className)}>
      <BaseField.Label className="qitu-form-label">{props.label}</BaseField.Label>
      {props.name ? <input name={props.name} type="hidden" value={props.value} /> : null}
      <PopoverRoot open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
        <PopoverTrigger className="qitu-field-control qitu-date-trigger" type="button">
          <span className={cn("truncate", !props.value && "text-[var(--qitu-dim)]")}>{label}</span>
          <CalendarDays aria-hidden="true" size={14} />
        </PopoverTrigger>
        <PopoverContent className="qitu-date-popover">
          <Calendar
            labels={props.labels}
            locale={props.locale}
            value={props.value}
            weekStartsOn={props.weekStartsOn}
            onValueChange={(value) => {
              props.onChange(value);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </PopoverRoot>
    </BaseField.Root>
  );
}

function calendarGrid(month: Date, weekStartsOn: 0 | 1): Date[] {
  const first = startOfMonth(month);
  const firstWeekday = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(first, -firstWeekday);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function dateValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateValue(value: string, locale: string | undefined): string {
  const date = parseDateValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMonth(date: Date, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function weekdayLabels(
  weekStartsOn: 0 | 1,
  locale: string | undefined,
): readonly [string, string, string, string, string, string, string] {
  const start = new Date(2026, 0, weekStartsOn === 1 ? 5 : 4);
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(start, index))) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
}
