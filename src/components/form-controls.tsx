"use client";
import { useState } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const value = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  return { value, label: value };
});

export function FormSelect({
  id,
  placeholder = "선택해주세요",
  options,
  disabled,
  value,
  defaultValue = "",
  onValueChange,
  ...props
}: {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  options: { value: string; label: string }[];
}) {
  const [internal, setInternal] = useState(defaultValue);
  const selected = value ?? internal;
  return (
    <Select
      disabled={disabled}
      value={selected}
      onValueChange={(next) => {
        setInternal(next);
        onValueChange?.(next);
      }}
      {...props}
    >
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue placeholder={placeholder}>
          {options.find((option) => option.value === selected)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function DatePicker({
  id,
  name,
  placeholder = "날짜 선택",
  value,
  defaultValue = "",
  onValueChange,
  min,
  disabled,
  clearable = false,
}: {
  id: string;
  name?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (date: string) => void;
  min?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const [internal, setInternal] = useState(defaultValue),
    [open, setOpen] = useState(false);
  const selected = value ?? internal;
  const asDate = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  function change(date: string) {
    setInternal(date);
    onValueChange?.(date);
    setOpen(false);
  }
  return (
    <>
      {name && <input type="hidden" name={name} value={selected} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between tabular-nums"
          >
            {selected ? selected.replaceAll("-", ". ") : placeholder}
            <CalendarDaysIcon data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-y-auto p-0" align="start" collisionPadding={12}>
          <Calendar
            mode="single"
            required
            locale={ko}
            selected={selected ? asDate(selected) : undefined}
            defaultMonth={selected ? asDate(selected) : undefined}
            disabled={min ? { before: asDate(min) } : undefined}
            onSelect={(date) => {
              if (date) change(format(date, "yyyy-MM-dd"));
            }}
          />
          {clearable && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => change("")}
              >
                날짜 초기화
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
