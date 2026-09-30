"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { toEthiopic, fromEthiopic, type EthiopicDate } from "@/lib/ethiopic";
import { useLang } from "@/lib/lang-context";
import { Button, buttonVariants } from "@/components/ui/button";

const ETH_MONTHS_EN = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagumē",
];

const ETH_MONTHS_AM = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
  "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ",
];

const WEEKDAYS_SHORT_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_SHORT_AM = ["ሰኞ", "ማክሰ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ", "እሁድ"];

function daysInEthMonth(year: number, month: number): number {
  if (month < 13) return 30;
  return year % 4 === 0 ? 6 : 5;
}

function getMonthStartDow(year: number, month: number): number {
  const d = fromEthiopic(year, month, 1);
  return (d.getDay() + 6) % 7;
}

function ethiopicEqual(a: EthiopicDate, b: EthiopicDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function buildMonthGrid(year: number, month: number) {
  const days = daysInEthMonth(year, month);
  const startDow = getMonthStartDow(year, month);
  const rows: number[][] = [];
  let row: number[] = [];

  for (let i = 0; i < startDow; i++) {
    row.push(0);
  }
  for (let d = 1; d <= days; d++) {
    row.push(d);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < 7) {
      row.push(0);
    }
    rows.push(row);
  }
  return rows;
}

function isToday(date: EthiopicDate): boolean {
  const now = toEthiopic(new Date());
  return ethiopicEqual(date, now);
}

function makeEthDate(year: number, month: number, day: number): EthiopicDate {
  return { year, month, day, monthNameEn: ETH_MONTHS_EN[month - 1], monthNameAm: ETH_MONTHS_AM[month - 1] };
}

export interface EthiopianCalendarProps {
  mode?: "single" | "range";
  selected?: Date | DateRange;
  onSelect?: (date: Date | DateRange | undefined) => void;
  captionLayout?: "label" | "dropdown";
  initialFocus?: boolean;
  numberOfMonths?: number;
  showOutsideDays?: boolean;
  className?: string;
}

export function EthiopianCalendar({
  mode = "single",
  selected,
  onSelect,
  captionLayout = "label",
  initialFocus,
  numberOfMonths = 1,
  showOutsideDays = true,
  className,
}: EthiopianCalendarProps) {
  const lang = useLang();
  const months = lang === "am" ? ETH_MONTHS_AM : ETH_MONTHS_EN;
  const weekdays = lang === "am" ? WEEKDAYS_SHORT_AM : WEEKDAYS_SHORT_EN;

  const today = React.useMemo(() => toEthiopic(new Date()), []);

  const initialEthDate = React.useMemo(() => {
    if (mode === "single" && selected instanceof Date) {
      return toEthiopic(selected);
    }
    if (mode === "range" && selected && "from" in selected && selected.from) {
      return toEthiopic(selected.from);
    }
    return today;
  }, [mode, selected, today]);

  const [viewYear, setViewYear] = React.useState(initialEthDate.year);
  const [viewMonth, setViewMonth] = React.useState(initialEthDate.month);

  React.useEffect(() => {
    if (initialFocus) {
      const btn = document.querySelector<HTMLButtonElement>(
        `[data-eth-today="true"]`,
      );
      btn?.focus();
    }
  }, [initialFocus, viewYear, viewMonth]);

  const selectedEth = React.useMemo((): EthiopicDate | null => {
    if (mode === "single" && selected instanceof Date) {
      return toEthiopic(selected);
    }
    if (mode === "range" && selected && "from" in selected && selected.from instanceof Date) {
      return toEthiopic(selected.from);
    }
    return null;
  }, [mode, selected]);

  const selectedEthTo = React.useMemo((): EthiopicDate | null => {
    if (mode === "range" && selected && "to" in selected && selected.to instanceof Date) {
      return toEthiopic(selected.to);
    }
    return null;
  }, [mode, selected]);

  function goPrev() {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(13);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goNext() {
    if (viewMonth === 13) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleDayClick(day: number) {
    const gregDate = fromEthiopic(viewYear, viewMonth, day);

    if (mode === "single") {
      onSelect?.(gregDate);
      return;
    }

    if (mode === "range") {
      const hasFrom = selectedEth !== null;
      const hasTo = selectedEthTo !== null;

      if (!hasFrom || hasTo) {
        onSelect?.({ from: gregDate, to: undefined });
      } else {
        const fromGreg = fromEthiopic(selectedEth!.year, selectedEth!.month, selectedEth!.day);
        const range: DateRange = gregDate < fromGreg
          ? { from: gregDate, to: fromGreg }
          : { from: fromGreg, to: gregDate };
        onSelect?.(range);
      }
    }
  }

  function isInRange(ethDate: EthiopicDate): boolean {
    if (mode !== "range" || !selectedEth) return false;
    if (!selectedEthTo) return false;
    const start = selectedEth;
    const end = selectedEthTo;
    const d1 = start.year * 1000 + start.month * 100 + start.day;
    const d2 = end.year * 1000 + end.month * 100 + end.day;
    const dv = ethDate.year * 1000 + ethDate.month * 100 + ethDate.day;
    return dv >= Math.min(d1, d2) && dv <= Math.max(d1, d2);
  }

  function isRangeStart(ethDate: EthiopicDate): boolean {
    if (mode !== "range" || !selectedEth) return false;
    return ethiopicEqual(ethDate, selectedEth);
  }

  function isRangeEnd(ethDate: EthiopicDate): boolean {
    if (mode !== "range" || !selectedEthTo) return false;
    return ethiopicEqual(ethDate, selectedEthTo);
  }

  const monthsToRender = React.useMemo(() => {
    const list: { year: number; month: number }[] = [];
    for (let i = 0; i < numberOfMonths; i++) {
      let y = viewYear;
      let m = viewMonth + i;
      while (m > 13) {
        y++;
        m -= 13;
      }
      list.push({ year: y, month: m });
    }
    return list;
  }, [viewYear, viewMonth, numberOfMonths]);

  return (
    <div
      data-slot="calendar"
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col gap-6",
          numberOfMonths >= 2 && "md:flex-row md:gap-4",
        )}
      >
        {monthsToRender.map(({ year, month }) => {
          const grid = buildMonthGrid(year, month);
          return (
            <div
              key={`${year}-${month}`}
              className={cn(
                "flex flex-col gap-4",
                numberOfMonths >= 2 ? "flex-1 min-w-0" : "w-full",
              )}
            >
              <Caption
                year={year}
                month={month}
                monthName={months[month - 1]}
                captionLayout={captionLayout}
                months={months}
                onPrev={goPrev}
                onNext={goNext}
                onMonthChange={(m) => setViewMonth(m)}
                onYearChange={(y) => setViewYear(y)}
              />
              <table className="w-full border-collapse">
                <thead>
                  <tr className="flex">
                    {weekdays.map((wd) => (
                      <th
                        key={wd}
                        className="text-muted-foreground flex-1 select-none rounded-md text-[0.8rem] font-normal"
                      >
                        {wd}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, ri) => (
                    <tr key={ri} className="mt-2 flex w-full">
                      {row.map((day, ci) => {
                      if (day === 0) {
                        return (
                          <td key={`empty-${ci}`} className="flex flex-1 items-center justify-center p-0">
                            <div className="h-(--cell-size) w-(--cell-size)" />
                          </td>
                        );
                      }
                        const ethDate = makeEthDate(year, month, day);
                        const isSel = mode === "single" && selectedEth && ethiopicEqual(ethDate, selectedEth);
                        const isRngStart = isRangeStart(ethDate);
                        const isRngEnd = isRangeEnd(ethDate);
                        const isRngMid = mode === "range" && isInRange(ethDate) && !isRngStart && !isRngEnd;
                        const isTodayDate = isToday(ethDate);

                        return (
                          <td
                            key={day}
                            className={cn(
                              "group/day flex flex-1 items-center justify-center p-0",
                              isRngStart && "bg-accent rounded-l-md",
                              isRngEnd && "bg-accent rounded-r-md",
                              isRngMid && "rounded-none",
                            )}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              data-eth-today={isTodayDate || undefined}
                              data-selected-single={isSel || undefined}
                              data-range-start={isRngStart || undefined}
                              data-range-end={isRngEnd || undefined}
                              data-range-middle={isRngMid || undefined}
                              className={cn(
                                "flex aspect-square h-auto w-full max-w-(--cell-size) flex-col items-center justify-center gap-1 font-normal leading-none",
                                "data-[selected-single]:bg-primary data-[selected-single]:text-primary-foreground",
                                "data-[range-start]:bg-primary data-[range-start]:text-primary-foreground data-[range-start]:rounded-md",
                                "data-[range-end]:bg-primary data-[range-end]:text-primary-foreground data-[range-end]:rounded-md",
                                "data-[range-middle]:bg-accent data-[range-middle]:text-accent-foreground",
                                isTodayDate && !isSel && !isRngStart && !isRngEnd && "bg-accent text-accent-foreground rounded-md",
                              )}
                              onClick={() => handleDayClick(day)}
                            >
                              {day}
                            </Button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Caption({
  year,
  month,
  monthName,
  captionLayout,
  months,
  onPrev,
  onNext,
  onMonthChange,
  onYearChange,
}: {
  year: number;
  month: number;
  monthName: string;
  captionLayout: "label" | "dropdown";
  months: string[];
  onPrev: () => void;
  onNext: () => void;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
}) {
  const years = React.useMemo(() => {
    const list: number[] = [];
    for (let y = year - 10; y <= year + 10; y++) list.push(y);
    return list;
  }, [year]);

  if (captionLayout === "dropdown") {
    return (
      <div className="relative flex h-8 items-center justify-center">
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "absolute left-0 h-(--cell-size) w-(--cell-size) select-none p-0",
          )}
          onClick={onPrev}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div className="flex items-center gap-1 text-sm font-medium">
          <select
            className="bg-popover border-input has-focus:border-ring has-focus:ring-ring/50 relative rounded-md border px-2 py-1 text-sm"
            value={month}
            onChange={(e) => onMonthChange(Number(e.target.value))}
          >
            {months.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="bg-popover border-input has-focus:border-ring has-focus:ring-ring/50 relative rounded-md border px-2 py-1 text-sm"
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "absolute right-0 h-(--cell-size) w-(--cell-size) select-none p-0",
          )}
          onClick={onNext}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-8 items-center justify-center">
      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute left-0 h-(--cell-size) w-(--cell-size) select-none p-0",
        )}
        onClick={onPrev}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <div className="flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)">
        <span className="select-none text-sm font-medium">
          {monthName} {year}
        </span>
      </div>
      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute right-0 h-(--cell-size) w-(--cell-size) select-none p-0",
        )}
        onClick={onNext}
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
