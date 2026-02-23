import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface MonthYearRangePickerProps {
  value: { from: string; to: string } | null;
  onChange: (range: { from: string; to: string }) => void;
  currency?: string;
}

interface MonthYearState {
  month: number;
  year: number;
}

export function MonthYearRangePicker({ value, onChange }: MonthYearRangePickerProps) {
  const { t } = useTranslation();
  const [isFromOpen, setIsFromOpen] = useState(false);
  const [isToOpen, setIsToOpen] = useState(false);
  
  const parseMonthYear = (str: string | null): MonthYearState => {
    if (!str) return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
    // Support both formats: MM/YYYY and MM-YYYY
    const normalized = str.replace('-', '/');
    const [month, year] = normalized.split('/').map(Number);
    return { month, year };
  };

  const [fromState, setFromState] = useState<MonthYearState>(parseMonthYear(value?.from || null));
  const [toState, setToState] = useState<MonthYearState>(parseMonthYear(value?.to || null));

  // Sync with external value changes
  useEffect(() => {
    if (value) {
      setFromState(parseMonthYear(value.from));
      setToState(parseMonthYear(value.to));
    }
  }, [value?.from, value?.to]);

  const months = [
    { value: 1, label: t("reports.months.jan") },
    { value: 2, label: t("reports.months.feb") },
    { value: 3, label: t("reports.months.mar") },
    { value: 4, label: t("reports.months.apr") },
    { value: 5, label: t("reports.months.may") },
    { value: 6, label: t("reports.months.jun") },
    { value: 7, label: t("reports.months.jul") },
    { value: 8, label: t("reports.months.aug") },
    { value: 9, label: t("reports.months.sep") },
    { value: 10, label: t("reports.months.oct") },
    { value: 11, label: t("reports.months.nov") },
    { value: 12, label: t("reports.months.dec") },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const formatMonthYear = (state: MonthYearState) => {
    const monthLabel = months.find(m => m.value === state.month)?.label || '';
    return `${monthLabel} ${state.year}`;
  };

  const formatMonthYearValue = (state: MonthYearState) => {
    const monthStr = state.month.toString().padStart(2, '0');
    return `${monthStr}/${state.year}`;
  };

  const handleMonthClick = (month: number, type: 'from' | 'to') => {
    const currentState = type === 'from' ? fromState : toState;
    const newState = { ...currentState, month };
    
    if (type === 'from') {
      setFromState(newState);
    } else {
      setToState(newState);
    }
  };

  const handleYearChange = (yearStr: string, type: 'from' | 'to') => {
    const year = parseInt(yearStr);
    const currentState = type === 'from' ? fromState : toState;
    const newState = { ...currentState, year };
    
    if (type === 'from') {
      setFromState(newState);
    } else {
      setToState(newState);
    }
  };

  const handleApply = (type: 'from' | 'to') => {
    const from = formatMonthYearValue(fromState);
    const to = formatMonthYearValue(toState);
    
    // Update the range with both values
    onChange({ from, to });
    
    // Close the popover
    if (type === 'from') {
      setIsFromOpen(false);
    } else {
      setIsToOpen(false);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* From Date Picker */}
      <div>
        <label className="text-xs text-muted-foreground px-1 sm:hidden">{t("reports.from")}</label>
        <Popover open={isFromOpen} onOpenChange={setIsFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between text-left font-normal"
            >
              <span className="truncate">{formatMonthYear(fromState)}</span>
              <Calendar className="ml-2 h-4 w-4 opacity-50 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-3" align="start">
            {/* Year Selector */}
            <div className="mb-3">
              <Select 
                value={fromState.year.toString()} 
                onValueChange={(val) => handleYearChange(val, 'from')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month Grid */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {months.map(month => (
                <button
                  key={month.value}
                  onClick={() => handleMonthClick(month.value, 'from')}
                  className={`px-2 py-1.5 rounded-md text-xs transition-colors ${
                    fromState.month === month.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {month.label}
                </button>
              ))}
            </div>

            {/* Apply Button */}
            <Button onClick={() => handleApply('from')} className="w-full" size="sm">
              {t("reports.apply")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* To Date Picker */}
      <div>
        <label className="text-xs text-muted-foreground px-1 sm:hidden">{t("reports.to")}</label>
        <Popover open={isToOpen} onOpenChange={setIsToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between text-left font-normal"
            >
              <span className="truncate">{formatMonthYear(toState)}</span>
              <Calendar className="ml-2 h-4 w-4 opacity-50 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-3" align="start">
            {/* Year Selector */}
            <div className="mb-3">
              <Select 
                value={toState.year.toString()} 
                onValueChange={(val) => handleYearChange(val, 'to')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month Grid */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {months.map(month => (
                <button
                  key={month.value}
                  onClick={() => handleMonthClick(month.value, 'to')}
                  className={`px-2 py-1.5 rounded-md text-xs transition-colors ${
                    toState.month === month.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {month.label}
                </button>
              ))}
            </div>

            {/* Apply Button */}
            <Button onClick={() => handleApply('to')} className="w-full" size="sm">
              {t("reports.apply")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
