"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  Car,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Droplets,
  Fuel,
  HeartPulse,
  Home,
  LoaderCircle,
  MessageSquareText,
  Music,
  PencilLine,
  Plus,
  PiggyBank,
  Receipt,
  Repeat2,
  Tag,
  ShoppingCart,
  Smartphone,
  Utensils,
  WalletCards,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowser } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MONEY_CATEGORY_COLOR_KEY,
  getMoneyCategoryColor,
  MONEY_CATEGORY_COLORS,
  MONEY_SEMANTIC_COLORS,
  normalizeMoneyCategoryColorKey,
  type MoneyCategoryColorKey,
} from "./moneyColors";

type MoneyAccountType =
  | "checking"
  | "savings"
  | "cash"
  | "cash_app"
  | "venmo"
  | "apple_cash"
  | "credit_card"
  | "other";

type MoneyAccountRow = {
  id: string;
  user_id: string;
  name: string | null;
  account_type: MoneyAccountType | string | null;
  balance_minor: number | string | null;
  currency_code: string | null;
  balance_as_of: string | null;
  source: string | null;
  institution_name: string | null;
  last_synced_at: string | null;
  is_active: boolean | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MoneyAccountMutationPayload = {
  user_id?: string;
  name?: string;
  account_type?: MoneyAccountType;
  balance_minor?: number;
  currency_code?: string;
  balance_as_of?: string;
  source?: "manual";
  institution_name?: string | null;
  is_active?: boolean;
};

type MoneyTransactionType = "income" | "expense" | "transfer";
type MoneyTransactionDirection = "inflow" | "outflow";
type ManualTransactionType = "expense" | "income";
type MoneyRecurringDirection = "inflow" | "outflow";
type MoneyRecurringFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "quarterly"
  | "yearly";
type ManualRecurringType = "expense" | "income";
const MONEY_RECURRING_ICON_KEYS = [
  "arrow", "home", "wifi", "phone", "car", "fuel", "shopping-cart",
  "utensils", "zap", "droplets", "credit-card", "receipt", "heart-pulse",
  "briefcase", "piggy-bank", "music",
] as const;
type MoneyRecurringIconKey = (typeof MONEY_RECURRING_ICON_KEYS)[number];

type MoneyCategoryMutationPayload = {
  id?: string;
  user_id?: string;
  name?: string;
  category_type?: "expense";
  color_key?: MoneyCategoryColorKey;
  archived_at?: string | null;
};

type MoneyCategoryRow = {
  id: string;
  user_id: string;
  name: string | null;
  category_type: string | null;
  color_key: string | null;
  archived_at: string | null;
  created_at: string | null;
};

type MoneyBudgetRow = {
  id: string;
  user_id: string;
  category_id: string;
  budget_month: string;
  limit_amount_minor: number | string;
  currency_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MoneyTransactionRow = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: MoneyTransactionType | string;
  direction: MoneyTransactionDirection | string;
  amount_minor: number | string;
  currency_code: string | null;
  transaction_date: string;
  description: string;
  note: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
  reconciled_to_transaction_id: string | null;
  excluded_from_analytics: boolean | null;
};

type MoneyRecurringItemRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  category_id: string | null;
  name: string;
  direction: MoneyRecurringDirection | string;
  amount_minor: number | string;
  currency_code: string | null;
  frequency: MoneyRecurringFrequency | string;
  anchor_date: string;
  end_date: string | null;
  is_active: boolean | null;
  source: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
  icon_key: MoneyRecurringIconKey | string | null;
};

type MoneyRecurringOccurrenceRow = {
  id: string;
  user_id: string;
  recurring_item_id: string;
  occurrence_date: string;
  account_id: string | null;
  category_id: string | null;
  name: string;
  direction: MoneyRecurringDirection | string;
  amount_minor: number | string;
  currency_code: string | null;
  status: "pending" | "posted" | "void" | string;
  posted_transaction_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MoneyRecurringItemMutationPayload = {
  user_id?: string;
  account_id?: string | null;
  category_id?: string | null;
  name?: string;
  direction?: MoneyRecurringDirection;
  amount_minor?: number;
  currency_code?: "USD";
  frequency?: MoneyRecurringFrequency;
  anchor_date?: string;
  is_active?: boolean;
  source?: "manual";
  note?: string | null;
  icon_key?: MoneyRecurringIconKey;
};

type MoneyBudgetMutationPayload = {
  user_id?: string;
  category_id?: string;
  budget_month?: string;
  limit_amount_minor?: number;
  currency_code?: "USD";
};

type MoneyQueryError = {
  message?: string;
};

type MoneyQueryResult<T> = {
  data: T | null;
  error: MoneyQueryError | null;
};

type CreateManualMoneyTransactionRpcArgs = {
  p_account_id: string;
  p_category_id: string | null;
  p_transaction_type: ManualTransactionType;
  p_direction: MoneyTransactionDirection;
  p_amount_minor: number;
  p_transaction_date: string;
  p_description: string;
  p_note: string | null;
};

type MaterializeMoneyRecurringOccurrenceRpcArgs = {
  p_recurring_item_id: string;
  p_occurrence_date: string;
};

type ConfirmMoneyRecurringOccurrenceRpcArgs = {
  p_occurrence_id: string;
  p_account_id: string | null;
};

type MoneySelectValue = string | boolean | number;

type MoneySelectBuilder<T> = PromiseLike<MoneyQueryResult<T[]>> & {
  eq: (column: string, value: MoneySelectValue) => MoneySelectBuilder<T>;
  is: (column: string, value: null) => MoneySelectBuilder<T>;
  in: (column: string, values: MoneySelectValue[]) => MoneySelectBuilder<T>;
  gte: (column: string, value: string | number) => MoneySelectBuilder<T>;
  lt: (column: string, value: string | number) => MoneySelectBuilder<T>;
  order: (
    column: string,
    options: { ascending: boolean }
  ) => MoneySelectBuilder<T>;
  limit: (count: number) => MoneySelectBuilder<T>;
};

type MoneyAccountsMutationBuilder = PromiseLike<MoneyQueryResult<null>> & {
  eq: (column: string, value: string) => MoneyAccountsMutationBuilder;
};

type MoneyAccountsTableClient = {
  select: (columns: string) => MoneySelectBuilder<MoneyAccountRow>;
  insert: (payload: MoneyAccountMutationPayload) => MoneyAccountsMutationBuilder;
  update: (payload: MoneyAccountMutationPayload) => MoneyAccountsMutationBuilder;
};

type MoneyCategoriesTableClient = {
  select: (columns: string) => MoneySelectBuilder<MoneyCategoryRow>;
  insert: (payload: MoneyCategoryMutationPayload) => MoneyAccountsMutationBuilder;
  update: (payload: MoneyCategoryMutationPayload) => MoneyAccountsMutationBuilder;
};

type MoneyBudgetsTableClient = {
  select: (columns: string) => MoneySelectBuilder<MoneyBudgetRow>;
  insert: (payload: MoneyBudgetMutationPayload) => MoneyAccountsMutationBuilder;
  update: (payload: MoneyBudgetMutationPayload) => MoneyAccountsMutationBuilder;
};

type MoneyTransactionsTableClient = {
  select: (columns: string) => MoneySelectBuilder<MoneyTransactionRow>;
};

type MoneyRecurringItemsTableClient = {
  select: (columns: string) => MoneySelectBuilder<MoneyRecurringItemRow>;
  insert: (
    payload: MoneyRecurringItemMutationPayload
  ) => MoneyAccountsMutationBuilder;
  update: (
    payload: MoneyRecurringItemMutationPayload
  ) => MoneyAccountsMutationBuilder;
};

type MoneyRecurringOccurrencesTableClient = {
  select: (columns: string) => MoneySelectBuilder<MoneyRecurringOccurrenceRow>;
};

type MoneyAccountsSupabaseClient = {
  from: {
    (table: "money_accounts"): MoneyAccountsTableClient;
    (table: "money_categories"): MoneyCategoriesTableClient;
    (table: "money_budgets"): MoneyBudgetsTableClient;
    (table: "money_transactions"): MoneyTransactionsTableClient;
    (table: "money_recurring_items"): MoneyRecurringItemsTableClient;
    (table: "money_recurring_occurrences"): MoneyRecurringOccurrencesTableClient;
  };
  rpc: {
    (
      fn: "create_manual_money_transaction",
      args: CreateManualMoneyTransactionRpcArgs
    ): PromiseLike<MoneyQueryResult<null>>;
    (
      fn: "materialize_money_recurring_occurrence",
      args: MaterializeMoneyRecurringOccurrenceRpcArgs
    ): PromiseLike<MoneyQueryResult<null>>;
    (
      fn: "confirm_money_recurring_occurrence",
      args: ConfirmMoneyRecurringOccurrenceRpcArgs
    ): PromiseLike<MoneyQueryResult<null>>;
  };
};

const MONEY_ACCOUNTS_QUERY_ROOT = ["money", "accounts"] as const;
const MONEY_CATEGORIES_QUERY_ROOT = ["money", "categories"] as const;
const MONEY_BUDGETS_QUERY_ROOT = ["money", "budgets"] as const;
const MONEY_TRANSACTIONS_QUERY_ROOT = ["money", "transactions"] as const;
const MONEY_MONTH_METRICS_QUERY_ROOT = ["money", "month-metrics"] as const;
const MONEY_SPENDING_HISTORY_QUERY_ROOT = ["money", "spending-history"] as const;
const MONEY_BALANCE_HISTORY_QUERY_ROOT = ["money", "balance-history"] as const;
const MONEY_RECURRING_ITEMS_QUERY_ROOT = ["money", "recurring-items"] as const;
const MONEY_RECURRING_OCCURRENCES_QUERY_ROOT = [
  "money",
  "recurring-occurrences",
] as const;
const MONEY_RECURRING_OCCURRENCE_ROLLOUT_DATE = "2026-09-26";
const NO_CATEGORY_VALUE = "__none__";
const NO_ACCOUNT_VALUE = "__none__";
const PROJECTION_HORIZONS = [7, 30, 90] as const;
const SAFE_TO_SPEND_FALLBACK_DAYS = 30;
const BEHAVIORAL_SPENDING_HISTORY_DAYS = 30;
const BEHAVIORAL_SPENDING_MIN_COVERAGE_DAYS = 7;

const MONEY_DASHBOARD_RANGE_OPTIONS = [
  { value: "7D", days: 7 },
  { value: "30D", days: 30 },
  { value: "90D", days: 90 },
  { value: "6M", days: 180 },
  { value: "1Y", days: 365 },
] as const;

type MoneyDashboardRange =
  (typeof MONEY_DASHBOARD_RANGE_OPTIONS)[number]["value"];

type ProjectionHorizonDays = (typeof PROJECTION_HORIZONS)[number];

const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "cash_app", label: "Cash App" },
  { value: "venmo", label: "Venmo" },
  { value: "apple_cash", label: "Apple Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
] as const satisfies ReadonlyArray<{
  value: MoneyAccountType;
  label: string;
}>;

const SAFE_TO_SPEND_ACCOUNT_TYPES = new Set<MoneyAccountType>([
  "checking",
  "cash",
  "cash_app",
  "venmo",
  "apple_cash",
  "other",
]);

const ACCOUNT_TYPE_LABELS = ACCOUNT_TYPE_OPTIONS.reduce(
  (labels, option) => {
    labels[option.value] = option.label;
    return labels;
  },
  {} as Record<MoneyAccountType, string>
);

const RECURRING_FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semimonthly", label: "Semimonthly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const satisfies ReadonlyArray<{
  value: MoneyRecurringFrequency;
  label: string;
}>;

const RECURRING_FREQUENCY_LABELS = RECURRING_FREQUENCY_OPTIONS.reduce(
  (labels, option) => {
    labels[option.value] = option.label;
    return labels;
  },
  {} as Record<MoneyRecurringFrequency, string>
);

const RECURRING_PROPERTY_SELECT_TRIGGER_CLASS =
  "h-11 min-w-0 flex-1 justify-end rounded-none border-0 bg-transparent px-0 text-right text-xs font-medium text-white/72 shadow-none focus:ring-0 focus:text-white/86";
const RECURRING_PROPERTY_SELECT_MENU_CLASS =
  "rounded-2xl border-white/[0.09] bg-[#101010] shadow-2xl shadow-black/60";
const RECURRING_PROPERTY_SELECT_CONTENT_CLASS = "py-1";
const RECURRING_PROPERTY_SELECT_ITEM_CLASS =
  "min-h-11 rounded-none bg-transparent px-4 py-2.5 text-white/70 shadow-none hover:bg-white/[0.05] hover:text-white aria-selected:bg-white/[0.07] aria-selected:text-white";

function getMoneyAccountsQueryKey(userId: string | null) {
  return [...MONEY_ACCOUNTS_QUERY_ROOT, userId] as const;
}

function getMoneyCategoriesQueryKey(userId: string | null) {
  return [...MONEY_CATEGORIES_QUERY_ROOT, userId] as const;
}

function getMoneyBudgetsQueryKey(userId: string | null, monthStart: string) {
  return [...MONEY_BUDGETS_QUERY_ROOT, userId, monthStart] as const;
}

function getMoneyTransactionsQueryKey(userId: string | null) {
  return [...MONEY_TRANSACTIONS_QUERY_ROOT, userId] as const;
}

function getMoneyMonthMetricsQueryKey(userId: string | null, monthStart: string) {
  return [...MONEY_MONTH_METRICS_QUERY_ROOT, userId, monthStart] as const;
}

function getMoneySpendingHistoryQueryKey({
  userId,
  startDate,
  endExclusiveDate,
}: {
  userId: string | null;
  startDate: string;
  endExclusiveDate: string;
}) {
  return [
    ...MONEY_SPENDING_HISTORY_QUERY_ROOT,
    userId,
    startDate,
    endExclusiveDate,
  ] as const;
}

function getMoneyBalanceHistoryQueryKey({
  userId,
  startDate,
}: {
  userId: string | null;
  startDate: string;
}) {
  return [...MONEY_BALANCE_HISTORY_QUERY_ROOT, userId, startDate] as const;
}

function getMoneyRecurringItemsQueryKey(userId: string | null) {
  return [...MONEY_RECURRING_ITEMS_QUERY_ROOT, userId] as const;
}

function getMoneyRecurringOccurrencesQueryKey(userId: string | null) {
  return [...MONEY_RECURRING_OCCURRENCES_QUERY_ROOT, userId] as const;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function getLastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function addDaysToDateString(value: string, days: number) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day + days);
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function getMoneyDashboardRangeStartDate(
  todayDate: string,
  range: MoneyDashboardRange
) {
  const option =
    MONEY_DASHBOARD_RANGE_OPTIONS.find((candidate) => candidate.value === range) ??
    MONEY_DASHBOARD_RANGE_OPTIONS[1];

  return addDaysToDateString(todayDate, -(option.days - 1)) ?? todayDate;
}

function getDayDifference(start: string, end: string) {
  const startParts = parseDateParts(start);
  const endParts = parseDateParts(end);
  if (!startParts || !endParts) return null;
  const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.floor((endUtc - startUtc) / 86_400_000);
}

function addMonthsWithAnchorDay(
  anchor: { year: number; month: number; day: number },
  monthsToAdd: number
) {
  const zeroBasedTargetMonth = anchor.month - 1 + monthsToAdd;
  const targetYear = anchor.year + Math.floor(zeroBasedTargetMonth / 12);
  const targetMonth = ((zeroBasedTargetMonth % 12) + 12) % 12;
  const month = targetMonth + 1;
  const day = Math.min(anchor.day, getLastDayOfMonth(targetYear, month));
  return formatDateParts(targetYear, month, day);
}

function getSemimonthlyCandidates(
  anchor: { year: number; month: number; day: number },
  monthsToAdd: number
) {
  const zeroBasedTargetMonth = anchor.month - 1 + monthsToAdd;
  const targetYear = anchor.year + Math.floor(zeroBasedTargetMonth / 12);
  const targetMonth = ((zeroBasedTargetMonth % 12) + 12) % 12;
  const month = targetMonth + 1;
  const lastDay = getLastDayOfMonth(targetYear, month);
  const firstDay = Math.min(anchor.day, lastDay);
  const secondDay =
    anchor.day <= 15
      ? Math.min(anchor.day + 15, lastDay)
      : Math.max(1, anchor.day - 15);
  return Array.from(new Set([firstDay, secondDay]))
    .sort((a, b) => a - b)
    .map((day) => formatDateParts(targetYear, month, day));
}

function getRecurringOccurrencesInRange({
  anchorDate,
  frequency,
  recurrenceEndDate,
  rangeStartDate,
  rangeEndDate,
}: {
  anchorDate: string;
  frequency: string;
  recurrenceEndDate?: string | null;
  rangeStartDate: string;
  rangeEndDate: string;
}) {
  const anchor = parseDateParts(anchorDate);
  const rangeStart = parseDateParts(rangeStartDate);
  if (!anchor || !rangeStart) return [];
  if (rangeEndDate < rangeStartDate) return [];
  if (recurrenceEndDate && recurrenceEndDate < rangeStartDate) return [];

  const effectiveEndDate =
    recurrenceEndDate && recurrenceEndDate < rangeEndDate
      ? recurrenceEndDate
      : rangeEndDate;
  if (effectiveEndDate < anchorDate) return [];

  const occurrences: string[] = [];

  if (frequency === "weekly" || frequency === "biweekly") {
    const intervalDays = frequency === "weekly" ? 7 : 14;
    const diff = getDayDifference(anchorDate, rangeStartDate);
    if (diff === null) return [];

    let periods = diff <= 0 ? 0 : Math.ceil(diff / intervalDays);
    let candidate = addDaysToDateString(anchorDate, periods * intervalDays);

    while (candidate && candidate <= effectiveEndDate) {
      if (candidate >= rangeStartDate && candidate >= anchorDate) {
        occurrences.push(candidate);
      }
      periods += 1;
      candidate = addDaysToDateString(anchorDate, periods * intervalDays);
    }

    return occurrences;
  }

  if (
    frequency === "monthly" ||
    frequency === "quarterly" ||
    frequency === "yearly"
  ) {
    const intervalMonths =
      frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
    const monthsFromAnchor =
      (rangeStart.year - anchor.year) * 12 + (rangeStart.month - anchor.month);
    let periods = Math.max(
      0,
      Math.floor(monthsFromAnchor / intervalMonths)
    );
    let candidate = addMonthsWithAnchorDay(anchor, periods * intervalMonths);

    while (candidate < rangeStartDate) {
      periods += 1;
      candidate = addMonthsWithAnchorDay(anchor, periods * intervalMonths);
    }

    while (candidate <= effectiveEndDate) {
      if (candidate >= anchorDate) occurrences.push(candidate);
      periods += 1;
      candidate = addMonthsWithAnchorDay(anchor, periods * intervalMonths);
    }

    return occurrences;
  }

  if (frequency === "semimonthly") {
    const monthsFromAnchor =
      (rangeStart.year - anchor.year) * 12 + (rangeStart.month - anchor.month);
    let monthOffset = Math.max(0, monthsFromAnchor - 1);

    while (true) {
      const candidates = getSemimonthlyCandidates(anchor, monthOffset).filter(
        (candidate) =>
          candidate >= anchorDate &&
          candidate >= rangeStartDate &&
          candidate <= effectiveEndDate
      );
      occurrences.push(...candidates);

      const monthCandidates = getSemimonthlyCandidates(anchor, monthOffset);
      const lastCandidate = monthCandidates[monthCandidates.length - 1];
      if (!lastCandidate || lastCandidate > effectiveEndDate) break;
      monthOffset += 1;
    }

    return Array.from(new Set(occurrences)).sort((a, b) => a.localeCompare(b));
  }

  return [];
}

function getNextRecurringOccurrence({
  anchorDate,
  frequency,
  endDate,
  today = getTodayDateString(),
}: {
  anchorDate: string;
  frequency: string;
  endDate?: string | null;
  today?: string;
}) {
  if (!parseDateParts(anchorDate) || !parseDateParts(today)) return null;
  if (endDate && endDate < today) return null;

  const defaultSearchEnd = addDaysToDateString(today, 370) ?? today;
  const rangeEndDate =
    endDate ?? (anchorDate > defaultSearchEnd ? anchorDate : defaultSearchEnd);

  return (
    getRecurringOccurrencesInRange({
      anchorDate,
      frequency,
      recurrenceEndDate: endDate,
      rangeStartDate: today,
      rangeEndDate,
    })[0] ?? null
  );
}

function getMonthDateRange(instant = new Date()) {
  const start = new Date(instant.getFullYear(), instant.getMonth(), 1);
  const next = new Date(instant.getFullYear(), instant.getMonth() + 1, 1);
  const format = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return { start: format(start), next: format(next) };
}

function getTrailingCompletedDateRange(today: string, days: number) {
  const start = addDaysToDateString(today, -days) ?? today;
  const endInclusive = addDaysToDateString(today, -1) ?? today;

  return { start, endInclusive, endExclusive: today, days };
}

function normalizeAccountType(type: string | null | undefined): MoneyAccountType {
  return type && type in ACCOUNT_TYPE_LABELS
    ? (type as MoneyAccountType)
    : "other";
}

function normalizeMinorUnits(value: MoneyAccountRow["balance_minor"]) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }
  return 0;
}

function normalizeTransactionMinor(value: MoneyTransactionRow["amount_minor"]) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }
  return 0;
}

function formatMoneyFromMinor(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
  }).format(value / 100);
}

function formatCompactMoneyFromMinor(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function formatVisualTransactionAmount(transaction: MoneyTransactionRow) {
  const minor = Math.abs(normalizeTransactionMinor(transaction.amount_minor));
  const sign = transaction.direction === "outflow" ? -1 : 1;
  return formatMoneyFromMinor(sign * minor, transaction.currency_code ?? "USD");
}

function formatVisualRecurringAmount(item: MoneyRecurringItemRow) {
  const minor = Math.abs(normalizeTransactionMinor(item.amount_minor));
  const sign = item.direction === "outflow" ? -1 : 1;
  return formatMoneyFromMinor(sign * minor, item.currency_code ?? "USD");
}

function formatReadableDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatCompactDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getReadableRecurringFrequency(frequency: string | null | undefined) {
  if (frequency && frequency in RECURRING_FREQUENCY_LABELS) {
    return RECURRING_FREQUENCY_LABELS[frequency as MoneyRecurringFrequency];
  }
  return frequency || "Recurring";
}

function normalizeRecurringFrequency(
  frequency: string | null | undefined
): MoneyRecurringFrequency {
  return frequency && frequency in RECURRING_FREQUENCY_LABELS
    ? (frequency as MoneyRecurringFrequency)
    : "monthly";
}

function formatMinorForInput(value: MoneyAccountRow["balance_minor"]) {
  const minor = Math.abs(normalizeMinorUnits(value));
  return (minor / 100).toFixed(2);
}

function parseDollarInput(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) return null;
  if (normalized.includes("-")) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;

  const [dollars = "0", cents = ""] = normalized.split(".");
  const centsPadded = cents.padEnd(2, "0").slice(0, 2);
  const minor = Number(dollars) * 100 + Number(centsPadded || "0");

  return Number.isSafeInteger(minor) ? minor : null;
}

function getMoneyDb(client: NonNullable<ReturnType<typeof getSupabaseBrowser>>) {
  return client as unknown as MoneyAccountsSupabaseClient;
}

async function fetchMoneyAccounts({
  userId,
  signal,
}: {
  userId: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_accounts")
    .select(
      "id,user_id,name,account_type,balance_minor,currency_code,balance_as_of,source,institution_name,last_synced_at,is_active,archived_at,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message || "Unable to load Money accounts.");

  return (data ?? []).filter((account) => account.user_id === userId);
}

async function fetchMoneyCategories({
  userId,
  signal,
}: {
  userId: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_categories")
    .select("id,user_id,name,category_type,color_key,archived_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message || "Unable to load Money categories.");

  return (data ?? []).filter((category) => category.user_id === userId);
}

async function fetchCurrentMonthMoneyBudgets({
  userId,
  monthStart,
  signal,
}: {
  userId: string;
  monthStart: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_budgets")
    .select(
      "id,user_id,category_id,budget_month,limit_amount_minor,currency_code,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("budget_month", monthStart)
    .eq("currency_code", "USD")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message || "Unable to load Money budgets.");

  return (data ?? []).filter((budget) => budget.user_id === userId);
}

async function fetchRecentMoneyTransactions({
  userId,
  signal,
}: {
  userId: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_transactions")
    .select(
      "id,user_id,account_id,category_id,transaction_type,direction,amount_minor,currency_code,transaction_date,description,note,status,source,created_at,reconciled_to_transaction_id,excluded_from_analytics"
    )
    .eq("user_id", userId)
    .eq("status", "posted")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(error.message || "Unable to load Money transactions.");
  }

  return (data ?? []).filter((transaction) => transaction.user_id === userId);
}

async function fetchMoneyBalanceHistoryTransactions({
  userId,
  startDate,
  signal,
}: {
  userId: string;
  startDate: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_transactions")
    .select(
      "id,user_id,account_id,category_id,transaction_type,direction,amount_minor,currency_code,transaction_date,description,note,status,source,created_at,reconciled_to_transaction_id,excluded_from_analytics"
    )
    .eq("user_id", userId)
    .eq("status", "posted")
    .is("reconciled_to_transaction_id", null)
    .gte("transaction_date", startDate)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load Money balance history.");
  }

  return (data ?? []).filter((transaction) => transaction.user_id === userId);
}

async function fetchCurrentMonthMoneyTransactions({
  userId,
  monthStart,
  nextMonthStart,
  signal,
}: {
  userId: string;
  monthStart: string;
  nextMonthStart: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_transactions")
    .select(
      "id,user_id,account_id,category_id,transaction_type,direction,amount_minor,currency_code,transaction_date,description,note,status,source,created_at,reconciled_to_transaction_id,excluded_from_analytics"
    )
    .eq("user_id", userId)
    .eq("status", "posted")
    .is("reconciled_to_transaction_id", null)
    .eq("excluded_from_analytics", false)
    .gte("transaction_date", monthStart)
    .lt("transaction_date", nextMonthStart)
    .in("transaction_type", ["income", "expense"]);

  if (error) {
    throw new Error(error.message || "Unable to load month metrics.");
  }

  return (data ?? []).filter((transaction) => transaction.user_id === userId);
}

async function fetchHistoricalMoneySpending({
  userId,
  startDate,
  endExclusiveDate,
  signal,
}: {
  userId: string;
  startDate: string;
  endExclusiveDate: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_transactions")
    .select(
      "id,user_id,account_id,category_id,transaction_type,direction,amount_minor,currency_code,transaction_date,description,note,status,source,created_at,reconciled_to_transaction_id,excluded_from_analytics"
    )
    .eq("user_id", userId)
    .eq("status", "posted")
    .is("reconciled_to_transaction_id", null)
    .eq("excluded_from_analytics", false)
    .eq("transaction_type", "expense")
    .eq("currency_code", "USD")
    .gte("transaction_date", startDate)
    .lt("transaction_date", endExclusiveDate)
    .order("transaction_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load spending history.");
  }

  return (data ?? []).filter((transaction) => transaction.user_id === userId);
}

async function fetchActiveMoneyRecurringItems({
  userId,
  signal,
}: {
  userId: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_recurring_items")
    .select(
      "id,user_id,account_id,category_id,name,direction,amount_minor,currency_code,frequency,anchor_date,end_date,is_active,source,note,created_at,updated_at,icon_key"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("anchor_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load recurring Money items.");
  }

  return (data ?? []).filter((item) => item.user_id === userId);
}

async function fetchPendingMoneyRecurringOccurrences({
  userId,
  signal,
}: {
  userId: string;
  signal?: AbortSignal;
}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");

  const db = getMoneyDb(client);
  const { data, error } = await db
    .from("money_recurring_occurrences")
    .select(
      "id,user_id,recurring_item_id,occurrence_date,account_id,category_id,name,direction,amount_minor,currency_code,status,posted_transaction_id,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("occurrence_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load pending Money.");
  }

  return (data ?? []).filter((occurrence) => occurrence.user_id === userId);
}

function MoneyForecastSummary({
  projection,
  horizon,
  onHorizonChange,
}: {
  projection: MoneyBalanceProjection;
  horizon: ProjectionHorizonDays;
  onHorizonChange: (value: ProjectionHorizonDays) => void;
}) {
  const hasScheduledMovement =
    projection.upcomingInflowMinor !== 0 ||
    projection.upcomingOutflowMinor !== 0;
  const projectedChangeMinor =
    projection.projectedBalanceMinor - projection.startingBalanceMinor;
  const cells = [
    {
      label: "Lowest",
      value: formatMoneyFromMinor(projection.lowestBalanceMinor),
      detail: formatCompactDate(projection.lowestBalanceDate),
      color:
        projection.lowestBalanceMinor < projection.startingBalanceMinor
          ? MONEY_SEMANTIC_COLORS.negative
          : undefined,
    },
    {
      label: "Money in",
      value: formatMoneyFromMinor(projection.upcomingInflowMinor),
      color: MONEY_SEMANTIC_COLORS.positive,
    },
    {
      label: "Money out",
      value: formatMoneyFromMinor(projection.upcomingOutflowMinor),
      color: MONEY_SEMANTIC_COLORS.negative,
    },
  ];

  return (
    <div className="border-b border-white/[0.055] px-3 pb-3">
      <dl aria-label="Forecast summary">
        <div className="py-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Projected balance
            </dt>
            <ProjectionHorizonSegment value={horizon} onChange={onHorizonChange} />
          </div>
          <dd className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-white/90">
            {formatMoneyFromMinor(projection.projectedBalanceMinor)}
          </dd>
          <dd
            className="mt-0.5 text-[11px] font-medium tabular-nums"
            style={{
              color: !hasScheduledMovement || projectedChangeMinor === 0
                ? "rgba(255,255,255,0.42)"
                : projectedChangeMinor > 0
                  ? MONEY_SEMANTIC_COLORS.positive
                  : MONEY_SEMANTIC_COLORS.negative,
            }}
          >
            {hasScheduledMovement ? (
              <>
                {projectedChangeMinor > 0 ? "+" : ""}
                {formatMoneyFromMinor(projectedChangeMinor)} from today ·{" "}
                {formatCompactDate(projection.endDate)}
              </>
            ) : (
              <>No scheduled change through {formatCompactDate(projection.endDate)}</>
            )}
          </dd>
        </div>

        {hasScheduledMovement ? (
          <div className="mt-1 grid grid-cols-3 border-y border-white/[0.055]">
            {cells.map((cell, index) => (
              <div
                key={cell.label}
                className={cn(
                  "min-w-0 px-2 py-1.5",
                  index > 0 && "border-l border-white/[0.06]"
                )}
              >
                <dt className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-white/34">
                  {cell.label}
                </dt>
                <dd
                  className="mt-0.5 truncate text-sm font-semibold tabular-nums tracking-tight text-white/88"
                  style={{ color: cell.color }}
                >
                  {cell.value}
                </dd>
                {cell.detail ? (
                  <dd className="truncate text-[9px] font-medium tabular-nums text-white/34">
                    {cell.detail}
                  </dd>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-white/42">
            Add scheduled bills or income to build a useful forecast.
          </p>
        )}
      </dl>
    </div>
  );
}

type AccountFormState = {
  name: string;
  accountType: MoneyAccountType;
  balance: string;
  institutionName: string;
};

function getDefaultFormState(): AccountFormState {
  return {
    name: "",
    accountType: "checking",
    balance: "",
    institutionName: "",
  };
}

function getEditFormState(account: MoneyAccountRow): AccountFormState {
  return {
    name: account.name ?? "",
    accountType: normalizeAccountType(account.account_type),
    balance: formatMinorForInput(account.balance_minor),
    institutionName: account.institution_name ?? "",
  };
}

type TransactionFormState = {
  transactionType: ManualTransactionType;
  amount: string;
  description: string;
  accountId: string;
  categoryId: string;
  transactionDate: string;
  note: string;
};

type RecurringItemFormState = {
  recurringType: ManualRecurringType;
  name: string;
  amount: string;
  frequency: MoneyRecurringFrequency;
  anchorDate: string;
  accountId: string;
  categoryId: string;
  note: string;
};

type BudgetFormState = {
  categoryMode: "existing" | "create";
  categoryId: string;
  categoryName: string;
  categoryColorKey: MoneyCategoryColorKey;
  limit: string;
};

function getDefaultTransactionFormState(
  accounts: MoneyAccountRow[]
): TransactionFormState {
  return {
    transactionType: "expense",
    amount: "",
    description: "",
    accountId: accounts[0]?.id ?? "",
    categoryId: NO_CATEGORY_VALUE,
    transactionDate: getTodayDateString(),
    note: "",
  };
}

function getDefaultRecurringItemFormState(): RecurringItemFormState {
  return {
    recurringType: "expense",
    name: "",
    amount: "",
    frequency: "monthly",
    anchorDate: getTodayDateString(),
    accountId: NO_ACCOUNT_VALUE,
    categoryId: NO_CATEGORY_VALUE,
    note: "",
  };
}

function getDefaultBudgetFormState(
  expenseCategories: MoneyCategoryRow[],
  budgetedCategoryIds: Set<string>
): BudgetFormState {
  const categoryId =
    expenseCategories.find((category) => !budgetedCategoryIds.has(category.id))
      ?.id ?? "";
  return {
    categoryMode: categoryId ? "existing" : "create",
    categoryId,
    categoryName: "",
    categoryColorKey: DEFAULT_MONEY_CATEGORY_COLOR_KEY,
    limit: "",
  };
}

function getEditBudgetFormState(
  budget: MoneyBudgetRow,
  category: MoneyCategoryRow | undefined,
): BudgetFormState {
  return {
    categoryMode: "existing",
    categoryId: budget.category_id,
    categoryName: category?.name?.trim() ?? "",
    categoryColorKey: normalizeMoneyCategoryColorKey(category?.color_key),
    limit: formatMinorForInput(budget.limit_amount_minor),
  };
}

function MoneyCategoryColorPicker({
  value,
  onChange,
}: {
  value: MoneyCategoryColorKey;
  onChange: (value: MoneyCategoryColorKey) => void;
}) {
  return (
    <fieldset className="border-b border-white/[0.065] py-3">
      <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
        Color
      </legend>
      <div className="grid grid-cols-6 gap-2" aria-label="Category color">
        {(Object.keys(MONEY_CATEGORY_COLORS) as MoneyCategoryColorKey[]).map(
          (colorKey) => {
            const option = MONEY_CATEGORY_COLORS[colorKey];
            const selected = value === colorKey;
            return (
              <button
                key={colorKey}
                type="button"
                onClick={() => onChange(colorKey)}
                aria-label={`${option.label} category color`}
                aria-pressed={selected}
                className={cn(
                  "flex h-11 w-full items-center justify-center rounded-xl border bg-white/[0.025] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45",
                  selected
                    ? "border-white/70"
                    : "border-white/[0.08] hover:border-white/25",
                )}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: option.color }}
                >
                  {selected ? (
                    <Check className="h-3.5 w-3.5 text-black/75" strokeWidth={3} />
                  ) : null}
                </span>
              </button>
            );
          },
        )}
      </div>
    </fieldset>
  );
}

function getEditRecurringItemFormState(
  item: MoneyRecurringItemRow
): RecurringItemFormState {
  return {
    recurringType: item.direction === "inflow" ? "income" : "expense",
    name: item.name ?? "",
    amount: formatMinorForInput(item.amount_minor),
    frequency: normalizeRecurringFrequency(item.frequency),
    anchorDate: item.anchor_date,
    accountId: item.account_id ?? NO_ACCOUNT_VALUE,
    categoryId: item.category_id ?? NO_CATEGORY_VALUE,
    note: item.note ?? "",
  };
}

function MoneyAccountForm({
  mode,
  initialState,
  isSaving,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "add" | "edit";
  initialState: AccountFormState;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (state: AccountFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState(initialState);

  const isCreditCard = form.accountType === "credit_card";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const saved = await onSubmit(form);
    if (saved && mode === "add") setForm(getDefaultFormState());
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="overflow-hidden border-y border-white/[0.075] bg-black/25 sm:rounded-2xl sm:border"
    >
      <div className="flex h-12 items-center justify-between border-b border-white/[0.065] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            aria-label={`Close ${mode === "add" ? "add" : "edit"} account editor`}
            className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/48 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <h3 className="truncate text-sm font-semibold text-white/86">
            {mode === "add" ? "Add Account" : "Edit Account"}
          </h3>
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-8 min-w-14 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white/76 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          {isSaving ? "Saving" : "Save"}
        </button>
      </div>

      <div className="px-3">
        <div className="border-b border-white/[0.065] py-3">
          <Label
            htmlFor={`money-account-name-${mode}`}
            className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38"
          >
            Account name
          </Label>
          <Input
            id={`money-account-name-${mode}`}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Main checking"
            maxLength={80}
            autoFocus={mode === "add"}
            className="mt-0.5 h-10 rounded-none border-0 bg-transparent px-0 text-lg font-semibold text-white shadow-none placeholder:text-white/24 focus-visible:ring-0"
          />
        </div>

        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]">
          <Label className="min-w-28 text-xs font-medium text-white/48">
            Account type
          </Label>
          <div className="min-w-0 flex-1">
            <Select
              value={form.accountType}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  accountType: normalizeAccountType(value),
                }))
              }
              placeholder="Select type"
              triggerClassName="h-10 justify-end rounded-none border-0 bg-transparent px-0 font-medium text-white/76 shadow-none focus:ring-0"
            >
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-b border-white/[0.065] py-2">
          <div className="flex min-h-10 items-center gap-3">
            <Label
              htmlFor={`money-account-balance-${mode}`}
              className="min-w-28 text-xs font-medium text-white/48"
            >
              Current balance
            </Label>
            <div className="flex min-w-0 flex-1 items-center justify-end">
              <span className="font-mono text-base text-white/38">$</span>
              <Input
                id={`money-account-balance-${mode}`}
                inputMode="decimal"
                value={form.balance}
                onChange={(event) =>
                  setForm((current) => ({ ...current, balance: event.target.value }))
                }
                placeholder={isCreditCard ? "500.00 owed" : "0.00"}
                className="h-10 min-w-0 rounded-none border-0 bg-transparent px-1 text-right font-mono text-base tabular-nums text-white shadow-none placeholder:text-white/24 focus-visible:ring-0"
              />
            </div>
          </div>
          <p className="text-[11px] leading-4 text-white/36">
            {isCreditCard
              ? "Enter what you owe as a positive amount; CREATOR stores it as negative debt."
              : "Enter the available account balance."}
          </p>
        </div>

        <div className="flex min-h-12 items-center gap-3">
          <Label
            htmlFor={`money-account-institution-${mode}`}
            className="min-w-28 text-xs font-medium text-white/48"
          >
            Institution
          </Label>
          <Input
            id={`money-account-institution-${mode}`}
            value={form.institutionName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                institutionName: event.target.value,
              }))
            }
            placeholder="Optional"
            maxLength={80}
            className="h-10 min-w-0 rounded-none border-0 bg-transparent px-0 text-right text-sm text-white/72 shadow-none placeholder:text-white/24 focus-visible:ring-0"
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
          {error}
        </p>
      ) : null}

    </form>
  );
}

function TransactionTypeSegment({
  value,
  onChange,
}: {
  value: ManualTransactionType;
  onChange: (value: ManualTransactionType) => void;
}) {
  return (
    <div
      className="inline-flex w-full rounded-lg border border-white/10 bg-[#050506]/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur"
      aria-label="Transaction type"
    >
      {(["expense", "income"] as const).map((type) => {
        const isSelected = value === type;

        return (
          <button
            key={type}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(type)}
            className={cn(
              "min-h-8 flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/50",
              isSelected
                ? "bg-zinc-800/90 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_18px_rgba(0,0,0,0.25)]"
                : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200",
            )}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <span
                className="inline-block text-[16px] font-black leading-none"
                style={{
                  color:
                    type === "expense"
                      ? "#813D58"
                      : "#4A8557",
                }}
                aria-hidden="true"
              >
                {type === "expense" ? "▼" : "▲"}
              </span>

              <span>{type === "expense" ? "EXPENSE" : "INCOME"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MoneyTransactionForm({ accounts, categories, isSaving, error, onCancel, onSubmit }: {
  accounts: MoneyAccountRow[]; categories: MoneyCategoryRow[]; isSaving: boolean;
  error: string | null; onCancel: () => void;
  onSubmit: (state: TransactionFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState(() => getDefaultTransactionFormState(accounts));
  const offeredCategories = categories.filter(
    (category) => category.category_type === form.transactionType && !category.archived_at
  );
  useEffect(() => {
    setForm((current) => accounts.some((account) => account.id === current.accountId)
      ? current : { ...current, accountId: accounts[0]?.id ?? "" });
  }, [accounts]);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const saved = await onSubmit(form);
    if (saved) setForm(getDefaultTransactionFormState(accounts));
  }
  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="overflow-hidden border-y border-white/[0.075] bg-black/25 sm:rounded-2xl sm:border">
      <div className="flex h-12 items-center justify-between border-b border-white/[0.065] px-3">
        <div className="flex items-center gap-2"><button type="button" onClick={onCancel} disabled={isSaving} aria-label="Close add transaction editor" className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/48 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button><h3 className="text-sm font-semibold text-white/86">Add Transaction</h3></div>
        <button type="submit" disabled={isSaving || accounts.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white/76 disabled:opacity-50">{isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}{isSaving ? "Saving" : "Save"}</button>
      </div>
      <div className="px-3">
        <div className="border-b border-white/[0.065] py-2"><TransactionTypeSegment value={form.transactionType} onChange={(transactionType) => setForm((current) => ({ ...current, transactionType, categoryId: NO_CATEGORY_VALUE }))} /></div>
        <div className="border-b border-white/[0.065] py-3"><Label htmlFor="money-transaction-amount" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Amount</Label><div className="flex items-center"><span className="font-mono text-xl text-white/38">$</span><Input id="money-transaction-amount" autoFocus inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" className="h-12 rounded-none border-0 bg-transparent px-1 font-mono text-3xl font-semibold tabular-nums shadow-none focus-visible:ring-0" /></div></div>
        <div className="border-b border-white/[0.065] py-2"><Label htmlFor="money-transaction-description" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Description</Label><Input id="money-transaction-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Coffee, client payment…" maxLength={140} className="h-10 rounded-none border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0" /></div>
        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]"><Label className="min-w-24 text-xs text-white/48">Date</Label><Input type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} className="h-10 rounded-none border-0 bg-transparent px-0 text-right shadow-none focus-visible:ring-0" /></div>
        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]"><Label className="min-w-24 text-xs text-white/48">Account</Label><Select value={form.accountId} onValueChange={(accountId) => setForm((current) => ({ ...current, accountId }))} placeholder="Select account" triggerClassName="h-10 justify-end rounded-none border-0 bg-transparent px-0 shadow-none focus:ring-0"><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name?.trim() || "Untitled account"}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]"><Label className="min-w-24 text-xs text-white/48">Category</Label><Select value={form.categoryId} onValueChange={(categoryId) => setForm((current) => ({ ...current, categoryId }))} placeholder="Optional" triggerClassName="h-10 justify-end rounded-none border-0 bg-transparent px-0 shadow-none focus:ring-0"><SelectContent><SelectItem value={NO_CATEGORY_VALUE}>No category</SelectItem>{offeredCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name?.trim() || "Untitled category"}</SelectItem>)}</SelectContent></Select></div>
        <div className="py-2"><Label htmlFor="money-transaction-note" className="text-xs text-white/40">Note <span className="text-white/24">(optional)</span></Label><Textarea id="money-transaction-note" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Add a note" maxLength={500} className="mt-1 min-h-14 resize-none rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" /></div>
      </div>
      {error ? <p className="border-t border-red-200/10 px-3 py-2 text-xs text-red-100/78">{error}</p> : null}
    </form>
  );
}

function RecurringTypeSegment({
  value,
  onChange,
}: {
  value: ManualRecurringType;
  onChange: (value: ManualRecurringType) => void;
}) {
  return (
    <div
      className="inline-flex w-full rounded-lg border border-white/10 bg-[#050506]/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur"
      aria-label="Scheduled money type"
    >
      {(["expense", "income"] as const).map((type) => {
        const isSelected = value === type;

        return (
          <button
            key={type}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(type)}
            className={cn(
              "min-h-8 flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/50",
              isSelected
                ? "bg-zinc-800/90 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_18px_rgba(0,0,0,0.25)]"
                : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200",
            )}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <span
                className="inline-block text-[16px] font-black leading-none"
                style={{
                  color:
                    type === "expense"
                      ? "#813D58"
                      : "#4A8557",
                }}
                aria-hidden="true"
              >
                {type === "expense" ? "▼" : "▲"}
              </span>

              <span>{type === "expense" ? "EXPENSE" : "INCOME"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MoneyRecurringItemForm({
  mode,
  initialState,
  accounts,
  categories,
  isSaving,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "add" | "edit";
  initialState: RecurringItemFormState;
  accounts: MoneyAccountRow[];
  categories: MoneyCategoryRow[];
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (state: RecurringItemFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState(() => initialState);
  const [noteExpanded, setNoteExpanded] = useState(
    () => initialState.note.trim().length > 0,
  );
  const offeredCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.category_type === form.recurringType &&
          !category.archived_at,
      ),
    [categories, form.recurringType],
  );

  useEffect(() => {
    setForm((current) => {
      const accountStillAvailable =
        current.accountId === NO_ACCOUNT_VALUE ||
        accounts.some((account) => account.id === current.accountId);
      const categoryStillAvailable =
        current.categoryId === NO_CATEGORY_VALUE ||
        offeredCategories.some(
          (category) => category.id === current.categoryId,
        );
      return {
        ...current,
        accountId: accountStillAvailable ? current.accountId : NO_ACCOUNT_VALUE,
        categoryId: categoryStillAvailable
          ? current.categoryId
          : NO_CATEGORY_VALUE,
      };
    });
  }, [accounts, offeredCategories]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSubmit(form);
    if (saved && mode === "add") setForm(getDefaultRecurringItemFormState());
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="overflow-hidden border-y border-white/[0.075] bg-black/30 sm:rounded-2xl sm:border"
    >
      <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-white/[0.065] px-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="justify-self-start text-xs font-medium text-white/48 transition hover:text-white/76 disabled:opacity-40"
        >
          Close
        </button>
        <div className="text-center">
          <h3 className="text-sm font-semibold text-white/86">
            {mode === "add" ? "add FORECAST" : "edit FORECAST"}
          </h3>
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-10 items-center gap-1.5 justify-self-end text-xs font-semibold text-white/76 transition hover:text-white disabled:opacity-50"
        >
          {isSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          {isSaving ? "Saving" : "Save"}
        </button>
      </div>

      <div className="px-3">
        <div className="border-b border-white/[0.065] py-2.5">
          <Label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/36">
            Type
          </Label>
          <RecurringTypeSegment
            value={form.recurringType}
            onChange={(recurringType) =>
              setForm((current) => ({
                ...current,
                recurringType,
                categoryId: NO_CATEGORY_VALUE,
              }))
            }
          />
        </div>

        <div className="border-b border-white/[0.065] py-3">
          <Label
            htmlFor={`money-recurring-amount-${mode}`}
            className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/36"
          >
            Amount
          </Label>
          <div className="flex min-h-12 items-center gap-2">
            <CircleDollarSign className="h-5 w-5 shrink-0 text-white/28" />
            <Input
              id={`money-recurring-amount-${mode}`}
              inputMode="decimal"
              value={form.amount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder="1,200.00"
              className="h-12 min-w-0 rounded-none border-0 bg-transparent px-0 font-mono text-3xl font-semibold tabular-nums text-white shadow-none placeholder:text-white/20 focus-visible:ring-0"
            />
            <span className="text-[11px] font-medium tracking-wider text-white/30">
              USD
            </span>
          </div>
        </div>

        <div className="border-b border-white/[0.065] py-2.5">
          <Label
            htmlFor={`money-recurring-name-${mode}`}
            className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/36"
          >
            Name
          </Label>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-white/28" />
            <Input
              id={`money-recurring-name-${mode}`}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Rent, software, client retainer"
              maxLength={120}
              className="h-11 rounded-none border-0 bg-transparent px-0 text-lg font-semibold text-white shadow-none placeholder:text-white/24 focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]">
          <Repeat2 className="h-4 w-4 shrink-0 text-white/28" />
          <Label className="min-w-20 text-xs text-white/52">Frequency</Label>
          <Select
            value={form.frequency}
            className="ml-auto min-w-0 flex-1"
            onValueChange={(frequency) =>
              setForm((current) => ({
                ...current,
                frequency: normalizeRecurringFrequency(frequency),
              }))
            }
            placeholder="Frequency"
            trigger={
              <span className="ml-auto block max-w-full truncate text-right">
                {getReadableRecurringFrequency(form.frequency)}
              </span>
            }
            triggerClassName={RECURRING_PROPERTY_SELECT_TRIGGER_CLASS}
            contentWrapperClassName={RECURRING_PROPERTY_SELECT_MENU_CLASS}
            contentAlign="end"
            minContentWidth={210}
          >
            <SelectContent className={RECURRING_PROPERTY_SELECT_CONTENT_CLASS}>
              {RECURRING_FREQUENCY_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={RECURRING_PROPERTY_SELECT_ITEM_CLASS}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex min-h-12 items-center gap-3 border-b border-white/[0.065]">
          <CalendarDays className="h-4 w-4 shrink-0 text-white/28" />
          <Label
            htmlFor={`money-recurring-anchor-${mode}`}
            className="min-w-20 text-xs text-white/52"
          >
            First date
          </Label>
          <span className="ml-auto text-xs font-medium text-white/72">
            {formatReadableDate(form.anchorDate)}
          </span>
          <span className="text-white/24" aria-hidden="true">
            ›
          </span>
          <Input
            id={`money-recurring-anchor-${mode}`}
            type="date"
            value={form.anchorDate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                anchorDate: event.target.value,
              }))
            }
            aria-label="First date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]">
          <WalletCards className="h-4 w-4 shrink-0 text-white/28" />
          <Label className="min-w-20 text-xs text-white/52">Account</Label>
          <Select
            value={form.accountId}
            className="ml-auto min-w-0 flex-1"
            onValueChange={(accountId) =>
              setForm((current) => ({ ...current, accountId }))
            }
            placeholder="Optional"
            trigger={
              <span className="ml-auto block max-w-full truncate text-right">
                {accounts.find((account) => account.id === form.accountId)?.name?.trim() ||
                  "No account"}
              </span>
            }
            triggerClassName={RECURRING_PROPERTY_SELECT_TRIGGER_CLASS}
            contentWrapperClassName={RECURRING_PROPERTY_SELECT_MENU_CLASS}
            contentAlign="end"
            minContentWidth={220}
          >
            <SelectContent className={RECURRING_PROPERTY_SELECT_CONTENT_CLASS}>
              <SelectItem
                value={NO_ACCOUNT_VALUE}
                className={RECURRING_PROPERTY_SELECT_ITEM_CLASS}
              >
                No account
              </SelectItem>
              {accounts.map((account) => (
                <SelectItem
                  key={account.id}
                  value={account.id}
                  className={RECURRING_PROPERTY_SELECT_ITEM_CLASS}
                >
                  {account.name?.trim() || "Untitled account"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-h-12 items-center gap-3 border-b border-white/[0.065]">
          <Tag className="h-4 w-4 shrink-0 text-white/28" />
          <Label className="min-w-20 text-xs text-white/52">Category</Label>
          <Select
            value={form.categoryId}
            className="ml-auto min-w-0 flex-1"
            onValueChange={(categoryId) =>
              setForm((current) => ({ ...current, categoryId }))
            }
            placeholder="Optional"
            trigger={
              <span className="ml-auto block max-w-full truncate text-right">
                {offeredCategories
                  .find((category) => category.id === form.categoryId)
                  ?.name?.trim() || "No category"}
              </span>
            }
            triggerClassName={RECURRING_PROPERTY_SELECT_TRIGGER_CLASS}
            contentWrapperClassName={RECURRING_PROPERTY_SELECT_MENU_CLASS}
            contentAlign="end"
            minContentWidth={220}
          >
            <SelectContent className={RECURRING_PROPERTY_SELECT_CONTENT_CLASS}>
              <SelectItem
                value={NO_CATEGORY_VALUE}
                className={RECURRING_PROPERTY_SELECT_ITEM_CLASS}
              >
                No category
              </SelectItem>
              {offeredCategories.map((category) => (
                <SelectItem
                  key={category.id}
                  value={category.id}
                  className={RECURRING_PROPERTY_SELECT_ITEM_CLASS}
                >
                  {category.name?.trim() || "Untitled category"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {offeredCategories.length === 0 ? (
          <p className="border-b border-white/[0.065] py-1.5 pl-7 text-[10px] leading-4 text-white/28">
            No matching categories yet; this item can stay uncategorized.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setNoteExpanded((expanded) => !expanded)}
          aria-expanded={noteExpanded}
          className="flex min-h-12 w-full items-center gap-3 border-b border-white/[0.065] text-left"
        >
          <MessageSquareText className="h-4 w-4 shrink-0 text-white/28" />
          <span className="text-xs text-white/52">Note</span>
          <span className="ml-auto max-w-[55%] truncate text-xs font-medium text-white/36">
            {form.note.trim() || "Optional note"}
          </span>
          <span className="text-white/24" aria-hidden="true">
            ›
          </span>
        </button>
        {noteExpanded ? (
          <div className="border-b border-white/[0.065] py-2">
            <Label htmlFor={`money-recurring-note-${mode}`} className="sr-only">
              Note
            </Label>
            <Textarea
              id={`money-recurring-note-${mode}`}
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="Optional note"
              maxLength={500}
              autoFocus
              className="min-h-16 resize-none rounded-lg border-white/[0.075] bg-white/[0.025] text-sm text-white placeholder:text-white/24 focus-visible:ring-white/10"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="border-t border-red-200/10 px-3 py-2 text-xs text-red-100/78">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function MoneyBudgetForm({
  mode,
  initialState,
  expenseCategories,
  budgetedCategoryIds,
  isSaving,
  error,
  onCancel,
  onSubmit,
  onRemoveCategory,
}: {
  mode: "add" | "edit";
  initialState: BudgetFormState;
  expenseCategories: MoneyCategoryRow[];
  budgetedCategoryIds: Set<string>;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (state: BudgetFormState) => Promise<boolean>;
  onRemoveCategory?: () => Promise<boolean>;
}) {
  const [form, setForm] = useState(() => initialState);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const categoryNameInputId = useId();
  const limitInputId = useId();
  const removeCategoryName = form.categoryName.trim() || "this category";
  const availableCategories = useMemo(() => mode === "add"
    ? expenseCategories.filter((category) => !budgetedCategoryIds.has(category.id))
    : expenseCategories, [budgetedCategoryIds, expenseCategories, mode]);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const saved = await onSubmit(form);
    if (saved && mode === "add") setForm(getDefaultBudgetFormState(expenseCategories, budgetedCategoryIds));
  }
  async function handleRemoveCategory() {
    if (!onRemoveCategory || isSaving) return;
    await onRemoveCategory();
  }
  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="overflow-hidden border-y border-white/[0.075] bg-black/25 sm:rounded-2xl sm:border">
      <div className="flex h-12 items-center justify-between border-b border-white/[0.065] px-3">
        <div className="flex items-center gap-2"><button type="button" onClick={onCancel} disabled={isSaving} aria-label="Close budget editor" className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/48 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button><h3 className="text-sm font-semibold text-white/86">{mode === "add" ? "Add Budget" : "Edit Budget"}</h3></div>
        <button type="submit" disabled={isSaving} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white/76 disabled:opacity-50">{isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}{isSaving ? "Saving" : "Save"}</button>
      </div>
      <div className="px-3">
        {mode === "add" ? <>
          {availableCategories.length > 0 ? <div className="grid grid-cols-2 gap-1 border-b border-white/[0.065] py-2"><button type="button" onClick={() => setForm((current) => ({ ...current, categoryMode: "existing", categoryId: current.categoryId || availableCategories[0]?.id || "" }))} className={cn("h-8 rounded-lg text-xs font-semibold", form.categoryMode === "existing" ? "bg-white text-black" : "text-white/48")}>Existing</button><button type="button" onClick={() => setForm((current) => ({ ...current, categoryMode: "create" }))} className={cn("h-8 rounded-lg text-xs font-semibold", form.categoryMode === "create" ? "bg-white text-black" : "text-white/48")}>Create category</button></div> : null}
          {form.categoryMode === "existing" && availableCategories.length > 0 ? <div className="border-b border-white/[0.065] py-2"><Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Category</Label><Select value={form.categoryId} onValueChange={(categoryId) => setForm((current) => ({ ...current, categoryId }))} placeholder="Choose category" triggerClassName="h-11 rounded-none border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus:ring-0"><SelectContent>{availableCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name?.trim() || "Untitled category"}</SelectItem>)}</SelectContent></Select></div> : <><div className="border-b border-white/[0.065] py-2"><Label htmlFor={categoryNameInputId} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Category name</Label><Input id={categoryNameInputId} value={form.categoryName} onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))} placeholder="Food" maxLength={80} className="h-11 rounded-none border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0" /></div><MoneyCategoryColorPicker value={form.categoryColorKey} onChange={(categoryColorKey) => setForm((current) => ({ ...current, categoryColorKey }))} /></>}
        </> : null}
        {mode === "edit" ? <><div className="border-b border-white/[0.065] py-2"><Label htmlFor={categoryNameInputId} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Category name</Label><Input id={categoryNameInputId} value={form.categoryName} onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))} placeholder="Food" maxLength={80} className="h-11 rounded-none border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0" /></div><MoneyCategoryColorPicker value={form.categoryColorKey} onChange={(categoryColorKey) => setForm((current) => ({ ...current, categoryColorKey }))} /></> : null}
        <div className="py-3"><Label htmlFor={limitInputId} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">Monthly limit</Label><div className="flex items-center"><span className="font-mono text-xl text-white/38">$</span><Input id={limitInputId} inputMode="decimal" value={form.limit} onChange={(event) => setForm((current) => ({ ...current, limit: event.target.value }))} placeholder="400" className="h-12 rounded-none border-0 bg-transparent px-1 font-mono text-3xl font-semibold tabular-nums shadow-none focus-visible:ring-0" /></div></div>
        {mode === "edit" && onRemoveCategory ? (
          <div className="border-t border-white/[0.065] py-3">
            {confirmingRemove ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white/84">
                    Remove &quot;{removeCategoryName}&quot;?
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/44">
                    Historical transactions will keep this category, but it will no longer be available for new Money entries.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={isSaving}
                    className="h-8 px-2 text-xs font-semibold text-white/52 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveCategory()}
                    disabled={isSaving}
                    className="inline-flex h-8 items-center gap-1.5 px-2 text-xs font-semibold text-rose-200/86 disabled:opacity-50"
                  >
                    {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                disabled={isSaving}
                className="text-xs font-semibold text-rose-200/72 disabled:opacity-50"
              >
                Remove category
              </button>
            )}
          </div>
        ) : null}
      </div>
      {error ? <p className="border-t border-red-200/10 px-3 py-2 text-xs text-red-100/78">{error}</p> : null}
    </form>
  );
}

function TransactionRow({
  transaction,
  accountName,
  categoryName,
}: {
  transaction: MoneyTransactionRow;
  accountName: string;
  categoryName: string | null;
}) {
  const isOutflow = transaction.direction === "outflow";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.065] px-3 py-2 last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white/84">
          {transaction.description.trim() || "Untitled transaction"}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
          {formatReadableDate(transaction.transaction_date)} · {accountName}
          {categoryName ? ` · ${categoryName}` : ""}
        </span>
      </span>
      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: isOutflow ? MONEY_SEMANTIC_COLORS.negative : MONEY_SEMANTIC_COLORS.positive }}
      >
        {formatVisualTransactionAmount(transaction)}
      </span>
    </div>
  );
}

function PendingRecurringOccurrenceRow({
  occurrence,
  accounts,
  accountName,
  categoryName,
  isConfirming,
  onConfirm,
}: {
  occurrence: MoneyRecurringOccurrenceRow;
  accounts: MoneyAccountRow[];
  accountName: string | null;
  categoryName: string | null;
  isConfirming: boolean;
  onConfirm: (accountId: string | null) => void;
}) {
  const [accountId, setAccountId] = useState(
    occurrence.account_id ?? NO_ACCOUNT_VALUE
  );
  const isOutflow = occurrence.direction === "outflow";
  const amountMinor = Math.abs(normalizeTransactionMinor(occurrence.amount_minor));
  const visualAmount = formatMoneyFromMinor(
    isOutflow ? -amountMinor : amountMinor,
    occurrence.currency_code ?? "USD"
  );

  return (
    <div className="border-b border-white/[0.06] px-3 py-2.5 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/46">
              Pending
            </span>
            <span className="truncate text-sm font-semibold text-white/84">
              {occurrence.name.trim() || "Scheduled money"}
            </span>
          </div>

          <p className="mt-1 truncate text-[11px] font-medium text-white/38">
            {formatReadableDate(occurrence.occurrence_date)}
            {accountName ? ` · ${accountName}` : ""}
            {categoryName ? ` · ${categoryName}` : ""}
          </p>
        </div>

        <span
          className="font-mono text-sm font-semibold tabular-nums"
          style={{
            color: isOutflow
              ? MONEY_SEMANTIC_COLORS.negative
              : MONEY_SEMANTIC_COLORS.positive,
          }}
        >
          {visualAmount}
        </span>
      </div>

      {!occurrence.account_id ? (
        <div className="mt-2 flex items-center gap-2">
          <Select
            value={accountId}
            onValueChange={setAccountId}
            placeholder="Choose account"
            className="min-w-0 flex-1"
            triggerClassName="h-8 justify-start rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 text-xs text-white/62 shadow-none focus:ring-0"
          >
            <SelectContent>
              <SelectItem value={NO_ACCOUNT_VALUE}>Choose account</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name?.trim() || "Untitled account"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            disabled={isConfirming || accountId === NO_ACCOUNT_VALUE}
            onClick={() =>
              onConfirm(accountId === NO_ACCOUNT_VALUE ? null : accountId)
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black disabled:opacity-35"
          >
            {isConfirming ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Confirm
          </button>
        </div>
      ) : (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={isConfirming}
            onClick={() => onConfirm(occurrence.account_id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black disabled:opacity-35"
          >
            {isConfirming ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

const RECURRING_ICON_COMPONENTS = {
  home: Home, wifi: Wifi, phone: Smartphone, car: Car, fuel: Fuel,
  "shopping-cart": ShoppingCart, utensils: Utensils, zap: Zap,
  droplets: Droplets, "credit-card": CreditCard, receipt: Receipt,
  "heart-pulse": HeartPulse, briefcase: Briefcase, "piggy-bank": PiggyBank,
  music: Music,
} as const;

function normalizeRecurringIconKey(value: string | null): MoneyRecurringIconKey {
  return MONEY_RECURRING_ICON_KEYS.includes(value as MoneyRecurringIconKey)
    ? (value as MoneyRecurringIconKey)
    : "arrow";
}

function RecurringIcon({ item, className }: { item: MoneyRecurringItemRow; className?: string }) {
  const key = normalizeRecurringIconKey(item.icon_key);
  const Icon = key === "arrow"
    ? item.direction === "outflow" ? ArrowUpRight : ArrowDownLeft
    : RECURRING_ICON_COMPONENTS[key];
  return <Icon className={className} aria-hidden="true" />;
}

function RecurringItemRow({
  item,
  nextDate,
  accountName,
  categoryName,
  isEditing,
  onEdit,
  onIconClick,
}: {
  item: MoneyRecurringItemRow;
  nextDate: string;
  accountName: string | null;
  categoryName: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onIconClick: () => void;
}) {
  const isOutflow = item.direction === "outflow";
  const name = item.name.trim() || "Untitled recurring item";

  return (
    <div
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)] items-stretch border-b px-2 py-2 text-left transition last:border-b-0",
        isEditing
          ? "border-white/[0.12] bg-white/[0.06]"
          : "border-white/[0.055] hover:bg-white/[0.035]"
      )}
    >
      <button
        type="button"
        onClick={onIconClick}
        aria-label={`Change icon for ${name}`}
        className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full transition active:scale-95"
        style={{
          backgroundColor: isOutflow
            ? "#813D58"
            : "#4A8557",
        }}
      >
        <RecurringIcon
          item={item}
          className="h-[17px] w-[17px] stroke-[2.1] text-white"
        />
      </button>
      <button type="button" onClick={onEdit} aria-label={`Edit ${name} scheduled money`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-left active:scale-[0.995]">
      <span className="min-w-0 self-center">
        <span className="block truncate text-sm font-semibold text-white/84">
          {name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
          {formatReadableDate(nextDate)} ·{" "}
          {getReadableRecurringFrequency(item.frequency)}
          {accountName ? ` · ${accountName}` : ""}
          {categoryName ? ` · ${categoryName}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span
          className="font-mono text-sm font-semibold tabular-nums"
          style={{ color: isOutflow ? MONEY_SEMANTIC_COLORS.negative : MONEY_SEMANTIC_COLORS.positive }}
        >
          {formatVisualRecurringAmount(item)}
        </span>
        <PencilLine className="h-3.5 w-3.5 shrink-0 text-white/30" />
      </span>
      </button>
    </div>
  );
}

function RecurringIconPicker({ item, saving, error, onSelect }: {
  item: MoneyRecurringItemRow; saving: boolean; error: string | null;
  onSelect: (key: MoneyRecurringIconKey) => void;
}) {
  const selected = normalizeRecurringIconKey(item.icon_key);
  return <div className="mx-2 mb-2 rounded-lg border border-white/[0.09] bg-[#080808] p-2" aria-label={`Choose icon for ${item.name}`}>
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">Choose icon</p>
    <div className="grid grid-cols-4 gap-1 sm:grid-cols-5">
      {MONEY_RECURRING_ICON_KEYS.map((key) => {
        const Icon = key === "arrow" ? (item.direction === "outflow" ? ArrowUpRight : ArrowDownLeft) : RECURRING_ICON_COMPONENTS[key];
        return <button key={key} type="button" disabled={saving} onClick={() => onSelect(key)} aria-label={key} aria-pressed={selected === key} className={cn("flex h-10 items-center justify-center rounded-md border border-transparent text-white/58 hover:bg-white/[0.06] hover:text-white/84 disabled:opacity-40", selected === key && "border-white/[0.14] bg-white/[0.09] text-white")}><Icon className="h-4 w-4" /></button>;
      })}
    </div>
    {error ? <p className="mt-1.5 text-[11px] text-red-100/76">{error}</p> : null}
  </div>;
}

type BudgetDisplayRow = {
  budget: MoneyBudgetRow;
  categoryName: string;
  categoryColorKey: MoneyCategoryColorKey;
  spentMinor: number;
  limitMinor: number;
  remainingMinor: number;
  percentageUsed: number;
};

function BudgetRow({
  row,
  isEditing,
  onEdit,
}: {
  row: BudgetDisplayRow;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const percentLabel = `${Math.round(row.percentageUsed * 100)}%`;
  const progressWidth = `${Math.min(100, Math.max(0, row.percentageUsed * 100))}%`;
  const isOverLimit = row.remainingMinor < 0;
  const categoryColor = getMoneyCategoryColor(row.categoryColorKey).color;

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "w-full border-b px-3 py-2.5 text-left transition last:border-b-0 active:scale-[0.995]",
        isEditing
          ? "border-white/[0.14] bg-white/[0.07]"
          : "border-white/[0.07] bg-[#090909] hover:bg-white/[0.045]"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2 truncate text-sm font-semibold text-white/84">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor }}
              aria-hidden="true"
            />
            <span className="truncate">{row.categoryName}</span>
          </span>
          <span className="mt-0.5 block text-[11px] font-medium text-white/38">
            {formatMoneyFromMinor(row.spentMinor, row.budget.currency_code ?? "USD")}{" "}
            spent of{" "}
            {formatMoneyFromMinor(row.limitMinor, row.budget.currency_code ?? "USD")}
          </span>
        </span>
        <span className="flex shrink-0 items-start gap-2">
          <span className="text-right">
            <span
              className="block font-mono text-sm font-semibold tabular-nums"
              style={{
                color: isOverLimit
                  ? MONEY_SEMANTIC_COLORS.negative
                  : MONEY_SEMANTIC_COLORS.positive,
              }}
            >
              {formatMoneyFromMinor(
                row.remainingMinor,
                row.budget.currency_code ?? "USD"
              )}
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">
              {isOverLimit ? "over" : "left"}
            </span>
          </span>
          <PencilLine className="h-3.5 w-3.5 shrink-0 text-white/30" />
        </span>
      </span>
      <span className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <span
            className="block h-full rounded-full"
            style={{ width: progressWidth, backgroundColor: categoryColor }}
          />
        </span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-white/42">
          {percentLabel}
        </span>
      </span>
    </button>
  );
}

type MoneyProjectionOccurrence = {
  id: string;
  itemId: string;
  date: string;
  name: string;
  direction: MoneyRecurringDirection;
  amountMinor: number;
  signedAmountMinor: number;
  currencyCode: string;
};

type MoneyProjectionPoint = {
  date: string;
  balanceMinor: number;
  changeMinor: number;
  occurrences: MoneyProjectionOccurrence[];
};

type MoneyBalanceProjection = {
  horizonDays: ProjectionHorizonDays;
  startDate: string;
  endDate: string;
  startingBalanceMinor: number;
  projectedBalanceMinor: number;
  lowestBalanceMinor: number;
  lowestBalanceDate: string;
  upcomingInflowMinor: number;
  upcomingOutflowMinor: number;
  points: MoneyProjectionPoint[];
  occurrences: MoneyProjectionOccurrence[];
  keyOccurrences: MoneyProjectionOccurrence[];
};

type MoneyBehavioralProjectionPoint = {
  date: string;
  balanceMinor: number;
  expectedVariableSpendMinor: number;
};

type MoneyBehavioralProjection = {
  status: "sufficient" | "insufficient";
  horizonDays: ProjectionHorizonDays;
  historicalStartDate: string;
  historicalEndDate: string;
  historicalDays: number;
  coverageDays: number;
  transactionCount: number;
  totalVariableSpendMinor: number;
  trailing7SpendMinor: number;
  trailing30SpendMinor: number;
  averageDailyVariableSpendMinor: number;
  expectedVariableSpendMinor: number;
  projectedBalanceMinor: number;
  lowestBalanceMinor: number;
  lowestBalanceDate: string;
  differenceVsKnownMinor: number;
  topCategoryName: string | null;
  topCategorySpendMinor: number;
  points: MoneyBehavioralProjectionPoint[];
};

type MoneySafeToSpendSummary = {
  liquidBalanceMinor: number;
  requiredOutflowsBeforeNextIncomeMinor: number;
  safeToSpendMinor: number;
  nextIncomeAmountMinor: number;
  nextIncomeDate: string | null;
  daysUntilNextIncome: number | null;
  balanceAfterKnownCommitmentsMinor: number;
  obligationWindowStartDate: string;
  obligationWindowEndDate: string;
  usesFallbackWindow: boolean;
};

function buildMoneyBehavioralProjection({
  historicalTransactions,
  categoryNameById,
  deterministicProjection,
  historicalStartDate,
  historicalEndDate,
  historicalDays,
  today,
}: {
  historicalTransactions: MoneyTransactionRow[];
  categoryNameById: Record<string, string>;
  deterministicProjection: MoneyBalanceProjection;
  historicalStartDate: string;
  historicalEndDate: string;
  historicalDays: number;
  today: string;
}): MoneyBehavioralProjection {
  const eligibleTransactions = historicalTransactions.filter(
    (transaction) =>
      transaction.user_id &&
      transaction.status === "posted" &&
      transaction.reconciled_to_transaction_id === null &&
      transaction.excluded_from_analytics !== true &&
      transaction.transaction_type === "expense" &&
      (transaction.currency_code ?? "USD") === "USD" &&
      transaction.transaction_date >= historicalStartDate &&
      transaction.transaction_date <= historicalEndDate
  );
  const firstTransactionDate =
    eligibleTransactions[0]?.transaction_date ?? historicalEndDate;
  const rawCoverageDays = getDayDifference(firstTransactionDate, today) ?? 0;
  const coverageDays =
    eligibleTransactions.length > 0
      ? Math.min(historicalDays, Math.max(1, rawCoverageDays))
      : 0;
  const totalVariableSpendMinor = eligibleTransactions.reduce(
    (total, transaction) =>
      total + Math.abs(normalizeTransactionMinor(transaction.amount_minor)),
    0
  );
  const trailing7StartDate =
    addDaysToDateString(today, -BEHAVIORAL_SPENDING_MIN_COVERAGE_DAYS) ??
    historicalStartDate;
  const trailing7SpendMinor = eligibleTransactions.reduce((total, transaction) => {
    if (transaction.transaction_date < trailing7StartDate) return total;
    return total + Math.abs(normalizeTransactionMinor(transaction.amount_minor));
  }, 0);
  const categoryTotals = eligibleTransactions.reduce(
    (totals, transaction) => {
      const categoryId = transaction.category_id ?? NO_CATEGORY_VALUE;
      totals[categoryId] =
        (totals[categoryId] ?? 0) +
        Math.abs(normalizeTransactionMinor(transaction.amount_minor));
      return totals;
    },
    {} as Record<string, number>
  );
  const topCategory = Object.entries(categoryTotals).sort(
    ([categoryA, totalA], [categoryB, totalB]) =>
      totalB - totalA || categoryA.localeCompare(categoryB)
  )[0];
  const topCategoryName = topCategory
    ? topCategory[0] === NO_CATEGORY_VALUE
      ? "Uncategorized"
      : categoryNameById[topCategory[0]] ?? "Untitled category"
    : null;
  const averageDailyVariableSpendMinor =
    coverageDays > 0 ? totalVariableSpendMinor / coverageDays : 0;
  const expectedVariableSpendMinor = Math.round(
    averageDailyVariableSpendMinor * deterministicProjection.horizonDays
  );
  const points = deterministicProjection.points.map((point) => {
    const elapsedFutureDays = getDayDifference(today, point.date) ?? 0;
    const expectedCumulativeSpendMinor =
      elapsedFutureDays > 0
        ? Math.round(averageDailyVariableSpendMinor * elapsedFutureDays)
        : 0;

    return {
      date: point.date,
      balanceMinor: point.balanceMinor - expectedCumulativeSpendMinor,
      expectedVariableSpendMinor: expectedCumulativeSpendMinor,
    };
  });
  const fallbackLowestPoint = {
    date: deterministicProjection.startDate,
    balanceMinor: deterministicProjection.startingBalanceMinor,
    expectedVariableSpendMinor: 0,
  };
  const lowestPoint = points.reduce(
    (lowest, point) =>
      point.balanceMinor < lowest.balanceMinor ? point : lowest,
    points[0] ?? fallbackLowestPoint
  );
  const projectedBalanceMinor =
    points[points.length - 1]?.balanceMinor ??
    deterministicProjection.projectedBalanceMinor;

  return {
    status:
      coverageDays >= BEHAVIORAL_SPENDING_MIN_COVERAGE_DAYS
        ? "sufficient"
        : "insufficient",
    horizonDays: deterministicProjection.horizonDays,
    historicalStartDate,
    historicalEndDate,
    historicalDays,
    coverageDays,
    transactionCount: eligibleTransactions.length,
    totalVariableSpendMinor,
    trailing7SpendMinor,
    trailing30SpendMinor: totalVariableSpendMinor,
    averageDailyVariableSpendMinor,
    expectedVariableSpendMinor,
    projectedBalanceMinor,
    lowestBalanceMinor: lowestPoint.balanceMinor,
    lowestBalanceDate: lowestPoint.date,
    differenceVsKnownMinor:
      projectedBalanceMinor - deterministicProjection.projectedBalanceMinor,
    topCategoryName,
    topCategorySpendMinor: topCategory?.[1] ?? 0,
    points,
  };
}

function buildMoneySafeToSpendSummary({
  accounts,
  recurringItems,
  today,
}: {
  accounts: MoneyAccountRow[];
  recurringItems: MoneyRecurringItemRow[];
  today: string;
}): MoneySafeToSpendSummary {
  const tomorrow = addDaysToDateString(today, 1) ?? today;
  const liquidBalanceMinor = accounts.reduce((total, account) => {
    if (account.is_active === false || account.archived_at) return total;
    const accountType = normalizeAccountType(account.account_type);
    if (!SAFE_TO_SPEND_ACCOUNT_TYPES.has(accountType)) return total;
    return total + normalizeMinorUnits(account.balance_minor);
  }, 0);

  const futureInflowOccurrences = recurringItems
    .filter((item) => item.is_active !== false && item.direction === "inflow")
    .flatMap((item) => {
      const amountMinor = Math.abs(normalizeTransactionMinor(item.amount_minor));
      if (amountMinor <= 0) return [];

      const nextDate = getNextRecurringOccurrence({
        anchorDate: item.anchor_date,
        frequency: item.frequency,
        endDate: item.end_date,
        today: tomorrow,
      });

      return nextDate
        ? [{ date: nextDate, amountMinor }]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextIncomeDate = futureInflowOccurrences[0]?.date ?? null;
  const nextIncomeAmountMinor = nextIncomeDate
    ? futureInflowOccurrences.reduce(
        (total, occurrence) =>
          occurrence.date === nextIncomeDate
            ? total + occurrence.amountMinor
            : total,
        0
      )
    : 0;
  const fallbackEndDate =
    addDaysToDateString(today, SAFE_TO_SPEND_FALLBACK_DAYS) ?? today;
  const obligationWindowEndDate = nextIncomeDate ?? fallbackEndDate;
  const requiredOutflowsBeforeNextIncomeMinor = recurringItems
    .filter((item) => item.is_active !== false && item.direction === "outflow")
    .reduce((total, item) => {
      const amountMinor = Math.abs(normalizeTransactionMinor(item.amount_minor));
      if (amountMinor <= 0) return total;

      const occurrences = getRecurringOccurrencesInRange({
        anchorDate: item.anchor_date,
        frequency: item.frequency,
        recurrenceEndDate: item.end_date,
        rangeStartDate: tomorrow,
        rangeEndDate: obligationWindowEndDate,
      });

      return total + occurrences.length * amountMinor;
    }, 0);
  const balanceAfterKnownCommitmentsMinor =
    liquidBalanceMinor - requiredOutflowsBeforeNextIncomeMinor;
  const daysUntilNextIncome = nextIncomeDate
    ? getDayDifference(today, nextIncomeDate)
    : null;

  return {
    liquidBalanceMinor,
    requiredOutflowsBeforeNextIncomeMinor,
    safeToSpendMinor: Math.max(0, balanceAfterKnownCommitmentsMinor),
    nextIncomeAmountMinor,
    nextIncomeDate,
    daysUntilNextIncome,
    balanceAfterKnownCommitmentsMinor,
    obligationWindowStartDate: tomorrow,
    obligationWindowEndDate,
    usesFallbackWindow: nextIncomeDate === null,
  };
}

function buildMoneyBalanceProjection({
  accounts,
  recurringItems,
  horizonDays,
  today,
}: {
  accounts: MoneyAccountRow[];
  recurringItems: MoneyRecurringItemRow[];
  horizonDays: ProjectionHorizonDays;
  today: string;
}): MoneyBalanceProjection {
  const endDate = addDaysToDateString(today, horizonDays) ?? today;
  const startingBalanceMinor = accounts.reduce(
    (total, account) => total + normalizeMinorUnits(account.balance_minor),
    0
  );
  const occurrences = recurringItems
    .filter((item) => item.is_active !== false)
    .flatMap((item) => {
      if (item.direction !== "inflow" && item.direction !== "outflow") {
        return [];
      }

      const direction: MoneyRecurringDirection =
        item.direction === "inflow" ? "inflow" : "outflow";
      const amountMinor = Math.abs(normalizeTransactionMinor(item.amount_minor));
      if (amountMinor <= 0) return [];

      const projectionStartDate = addDaysToDateString(today, 1) ?? today;
      return getRecurringOccurrencesInRange({
        anchorDate: item.anchor_date,
        frequency: item.frequency,
        recurrenceEndDate: item.end_date,
        rangeStartDate: projectionStartDate,
        rangeEndDate: endDate,
      }).map((date) => {
        const signedAmountMinor =
          direction === "inflow" ? amountMinor : -amountMinor;

        return {
          id: `${item.id}-${date}`,
          itemId: item.id,
          date,
          name: item.name.trim() || "Untitled recurring item",
          direction,
          amountMinor,
          signedAmountMinor,
          currencyCode: item.currency_code ?? "USD",
        };
      });
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Math.abs(b.signedAmountMinor) - Math.abs(a.signedAmountMinor) ||
        a.name.localeCompare(b.name)
    );

  const occurrencesByDate = occurrences.reduce(
    (dates, occurrence) => {
      dates[occurrence.date] = [...(dates[occurrence.date] ?? []), occurrence];
      return dates;
    },
    {} as Record<string, MoneyProjectionOccurrence[]>
  );

  let runningBalance = startingBalanceMinor;
  const points: MoneyProjectionPoint[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset += 1) {
    const date = addDaysToDateString(today, dayOffset) ?? today;
    const dayOccurrences = occurrencesByDate[date] ?? [];
    const changeMinor = dayOccurrences.reduce(
      (total, occurrence) => total + occurrence.signedAmountMinor,
      0
    );

    runningBalance += changeMinor;
    points.push({
      date,
      balanceMinor: runningBalance,
      changeMinor,
      occurrences: dayOccurrences,
    });
  }

  const lowestPoint = points.reduce(
    (lowest, point) =>
      point.balanceMinor < lowest.balanceMinor ? point : lowest,
    points[0] ?? {
      date: today,
      balanceMinor: startingBalanceMinor,
      changeMinor: 0,
      occurrences: [],
    }
  );
  const upcomingInflowMinor = occurrences.reduce(
    (total, occurrence) =>
      occurrence.direction === "inflow" ? total + occurrence.amountMinor : total,
    0
  );
  const upcomingOutflowMinor = occurrences.reduce(
    (total, occurrence) =>
      occurrence.direction === "outflow" ? total + occurrence.amountMinor : total,
    0
  );
  const keyOccurrences = [...occurrences]
    .sort(
      (a, b) =>
        Math.abs(b.signedAmountMinor) - Math.abs(a.signedAmountMinor) ||
        a.date.localeCompare(b.date) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 4)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  return {
    horizonDays,
    startDate: today,
    endDate,
    startingBalanceMinor,
    projectedBalanceMinor:
      points[points.length - 1]?.balanceMinor ?? startingBalanceMinor,
    lowestBalanceMinor: lowestPoint.balanceMinor,
    lowestBalanceDate: lowestPoint.date,
    upcomingInflowMinor,
    upcomingOutflowMinor,
    points,
    occurrences,
    keyOccurrences,
  };
}

function ProjectionHorizonSegment({
  value,
  onChange,
}: {
  value: ProjectionHorizonDays;
  onChange: (value: ProjectionHorizonDays) => void;
}) {
  return (
    <div className="grid h-7 shrink-0 grid-cols-3 rounded-md border border-white/[0.075] bg-black/20 p-px">
      {PROJECTION_HORIZONS.map((horizon) => (
        <button
          key={horizon}
          type="button"
          onClick={() => onChange(horizon)}
          className={cn(
            "h-6 rounded-[4px] px-1.5 text-[10px] font-semibold transition",
            value === horizon
              ? "bg-white/[0.10] text-white"
              : "text-white/54 hover:bg-white/[0.055] hover:text-white/78"
          )}
        >
          {horizon}d
        </button>
      ))}
    </div>
  );
}

function MoneyProjectionChart({
  projection,
  behavioralProjection,
}: {
  projection: MoneyBalanceProjection;
  behavioralProjection?: MoneyBehavioralProjection | null;
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 720;
  const height = 190;
  const padding = { top: 16, right: 78, bottom: 30, left: 12 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const showBehavioralProjection =
    behavioralProjection?.status === "sufficient" &&
    behavioralProjection.points.length === projection.points.length;

  const behavioralPoints = showBehavioralProjection
    ? behavioralProjection.points
    : [];

  const balances = [
    ...projection.points.map((point) => point.balanceMinor),
    ...behavioralPoints.map((point) => point.balanceMinor),
  ];

  const firstBalance = projection.points[0]?.balanceMinor ?? 0;
  const lastBalance =
    projection.points[projection.points.length - 1]?.balanceMinor ?? firstBalance;

  const isUp = lastBalance >= firstBalance;
  const lineColor = isUp
    ? MONEY_SEMANTIC_COLORS.positive
    : MONEY_SEMANTIC_COLORS.negative;

  const actualMin = balances.length ? Math.min(...balances) : 0;
  const actualMax = balances.length ? Math.max(...balances) : 0;
  const actualRange = Math.max(1, actualMax - actualMin);

  const crossesZero = actualMin < 0 && actualMax > 0;
  const verticalPadding = Math.max(actualRange * 0.18, Math.abs(actualMax) * 0.04, 100);

  const minBalance = actualMin - verticalPadding;
  const maxBalance = actualMax + verticalPadding;
  const range = Math.max(1, maxBalance - minBalance);

  const getX = (index: number) => {
    if (projection.points.length <= 1) {
      return padding.left + chartWidth / 2;
    }

    return (
      padding.left +
      (index / (projection.points.length - 1)) * chartWidth
    );
  };

  const getY = (balance: number) =>
    padding.top +
    chartHeight -
    ((balance - minBalance) / range) * chartHeight;

  const linePath = projection.points
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.balanceMinor);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const behavioralLinePath = behavioralPoints
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.balanceMinor);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaBottom = padding.top + chartHeight;

  const areaPath =
    projection.points.length > 0
      ? [
          `M${getX(0).toFixed(2)},${areaBottom.toFixed(2)}`,
          ...projection.points.map(
            (point, index) =>
              `L${getX(index).toFixed(2)},${getY(point.balanceMinor).toFixed(2)}`
          ),
          `L${getX(projection.points.length - 1).toFixed(2)},${areaBottom.toFixed(2)}`,
          "Z",
        ].join(" ")
      : "";

  const labelIndexes = Array.from(
    new Set([
      0,
      projection.points.length > 2
        ? Math.floor((projection.points.length - 1) / 2)
        : null,
      projection.points.length - 1,
    ])
  ).filter((index): index is number => index !== null && index >= 0);

  const gridRatios = [0.25, 0.5, 0.75];

  const lastPointIndex = Math.max(0, projection.points.length - 1);
  const lastPointY = getY(lastBalance);
  const priceLabelY = Math.min(
    height - padding.bottom - 10,
    Math.max(padding.top + 10, lastPointY)
  );

  return (
    <div className="min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[150px] w-full sm:h-[175px]"
        role="img"
        aria-label={`Projected Money balance from ${formatReadableDate(
          projection.startDate
        )} to ${formatReadableDate(projection.endDate)}`}
      >
        <defs>
          <linearGradient
            id={`${gradientId}-area`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor={lineColor}
              stopOpacity="0.24"
            />
            <stop
              offset="58%"
              stopColor={lineColor}
              stopOpacity="0.07"
            />
            <stop
              offset="100%"
              stopColor={lineColor}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {gridRatios.map((ratio) => {
          const y = padding.top + chartHeight * ratio;

          return (
            <line
              key={ratio}
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />
          );
        })}

        {crossesZero ? (
          <line
            x1={padding.left}
            x2={padding.left + chartWidth}
            y1={getY(0)}
            y2={getY(0)}
            stroke="rgba(255,255,255,0.16)"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        ) : null}

        <path
          d={areaPath}
          fill={`url(#${gradientId}-area)`}
        />

        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />

        {showBehavioralProjection ? (
          <path
            d={behavioralLinePath}
            fill="none"
            stroke="rgba(255,255,255,0.38)"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {projection.points.length ? (
          <>
            <circle
              cx={getX(lastPointIndex)}
              cy={lastPointY}
              r="4"
              fill={lineColor}
              stroke="#090909"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            <line
              x1={getX(lastPointIndex)}
              x2={padding.left + chartWidth + 8}
              y1={lastPointY}
              y2={lastPointY}
              stroke={lineColor}
              strokeOpacity="0.5"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />

            <rect
              x={padding.left + chartWidth + 10}
              y={priceLabelY - 11}
              width="64"
              height="22"
              rx="6"
              fill={lineColor}
            />

            <text
              x={padding.left + chartWidth + 42}
              y={priceLabelY + 4}
              textAnchor="middle"
              fill="white"
              fontSize="10"
              fontWeight="700"
            >
              {formatCompactMoneyFromMinor(lastBalance)}
            </text>
          </>
        ) : null}

        {labelIndexes.map((index) => {
          const point = projection.points[index];
          if (!point) return null;

          return (
            <text
              key={`projection-label-${point.date}`}
              x={getX(index)}
              y={height - 9}
              textAnchor={
                index === 0
                  ? "start"
                  : index === projection.points.length - 1
                    ? "end"
                    : "middle"
              }
              fill="rgba(255,255,255,0.34)"
              fontSize="10"
            >
              {formatCompactDate(point.date)}
            </text>
          );
        })}
      </svg>

      {showBehavioralProjection ? (
        <div className="mt-1 flex items-center gap-4 px-1 text-[10px] font-medium text-white/30">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-[2px] w-4 rounded-full"
              style={{ backgroundColor: lineColor }}
              aria-hidden="true"
            />
            Known
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 border-t border-dashed border-white/35"
              aria-hidden="true"
            />
            Estimate
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function MoneyAreaDashboard() {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<"add" | "edit" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [transactionSaving, setTransactionSaving] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [confirmingOccurrenceId, setConfirmingOccurrenceId] =
    useState<string | null>(null);
  const [pendingOccurrenceActionError, setPendingOccurrenceActionError] =
    useState<string | null>(null);
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const recurringAddFormRef = useRef<HTMLDivElement | null>(null);

  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(
    null
  );
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [iconPickerRecurringId, setIconPickerRecurringId] = useState<string | null>(null);
  const [iconSaving, setIconSaving] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [workspace, setWorkspace] = useState<"activity" | "budget" | "forecast">(
    "activity"
  );
  const [projectionHorizonDays, setProjectionHorizonDays] =
    useState<ProjectionHorizonDays>(30);
  const [dashboardRange, setDashboardRange] =
    useState<MoneyDashboardRange>("30D");

  useEffect(() => {
    if (workspace !== "forecast" || !recurringFormOpen) return;

    const frame = requestAnimationFrame(() => {
      recurringAddFormRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [workspace, recurringFormOpen]);

  useEffect(() => {
    if (workspace !== "forecast") {
      setIconPickerRecurringId(null);
      setIconError(null);
    }
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      if (!supabase) {
        setAuthError("Supabase is not configured.");
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      setAuthError(null);

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;
        if (cancelled) return;
        setUserId(user?.id ?? null);
      } catch (error) {
        if (cancelled) return;
        setAuthError(
          error instanceof Error ? error.message : "Unable to resolve user."
        );
        setUserId(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const queryKey = useMemo(() => getMoneyAccountsQueryKey(userId), [userId]);
  const categoriesQueryKey = useMemo(
    () => getMoneyCategoriesQueryKey(userId),
    [userId]
  );
  const transactionsQueryKey = useMemo(
    () => getMoneyTransactionsQueryKey(userId),
    [userId]
  );
  const monthRange = useMemo(() => getMonthDateRange(), []);
  const todayDate = getTodayDateString();
  const dashboardRangeStartDate = useMemo(
    () => getMoneyDashboardRangeStartDate(todayDate, dashboardRange),
    [dashboardRange, todayDate]
  );
  const balanceHistoryQueryKey = useMemo(
    () =>
      getMoneyBalanceHistoryQueryKey({
        userId,
        startDate: dashboardRangeStartDate,
      }),
    [dashboardRangeStartDate, userId]
  );
  const historicalSpendingRange = useMemo(
    () =>
      getTrailingCompletedDateRange(
        todayDate,
        BEHAVIORAL_SPENDING_HISTORY_DAYS
      ),
    [todayDate]
  );
  const monthMetricsQueryKey = useMemo(
    () => getMoneyMonthMetricsQueryKey(userId, monthRange.start),
    [monthRange.start, userId]
  );
  const historicalSpendingQueryKey = useMemo(
    () =>
      getMoneySpendingHistoryQueryKey({
        userId,
        startDate: historicalSpendingRange.start,
        endExclusiveDate: historicalSpendingRange.endExclusive,
      }),
    [historicalSpendingRange.endExclusive, historicalSpendingRange.start, userId]
  );
  const budgetsQueryKey = useMemo(
    () => getMoneyBudgetsQueryKey(userId, monthRange.start),
    [monthRange.start, userId]
  );
  const recurringItemsQueryKey = useMemo(
    () => getMoneyRecurringItemsQueryKey(userId),
    [userId]
  );
  const recurringOccurrencesQueryKey = useMemo(
    () => getMoneyRecurringOccurrencesQueryKey(userId),
    [userId]
  );

  const accountsQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchMoneyAccounts({ userId: userId!, signal }),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: ({ signal }) => fetchMoneyCategories({ userId: userId!, signal }),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const transactionsQuery = useQuery({
    queryKey: transactionsQueryKey,
    queryFn: ({ signal }) =>
      fetchRecentMoneyTransactions({ userId: userId!, signal }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const balanceHistoryQuery = useQuery({
    queryKey: balanceHistoryQueryKey,
    queryFn: ({ signal }) =>
      fetchMoneyBalanceHistoryTransactions({
        userId: userId!,
        startDate: dashboardRangeStartDate,
        signal,
      }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const monthMetricsQuery = useQuery({
    queryKey: monthMetricsQueryKey,
    queryFn: ({ signal }) =>
      fetchCurrentMonthMoneyTransactions({
        userId: userId!,
        monthStart: monthRange.start,
        nextMonthStart: monthRange.next,
        signal,
      }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const historicalSpendingQuery = useQuery({
    queryKey: historicalSpendingQueryKey,
    queryFn: ({ signal }) =>
      fetchHistoricalMoneySpending({
        userId: userId!,
        startDate: historicalSpendingRange.start,
        endExclusiveDate: historicalSpendingRange.endExclusive,
        signal,
      }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const budgetsQuery = useQuery({
    queryKey: budgetsQueryKey,
    queryFn: ({ signal }) =>
      fetchCurrentMonthMoneyBudgets({
        userId: userId!,
        monthStart: monthRange.start,
        signal,
      }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const recurringItemsQuery = useQuery({
    queryKey: recurringItemsQueryKey,
    queryFn: ({ signal }) =>
      fetchActiveMoneyRecurringItems({ userId: userId!, signal }),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const recurringOccurrencesQuery = useQuery({
    queryKey: recurringOccurrencesQueryKey,
    queryFn: ({ signal }) =>
      fetchPendingMoneyRecurringOccurrences({
        userId: userId!,
        signal,
      }),
    enabled: Boolean(userId),
    staleTime: 15 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const accounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data]
  );
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );
  const budgets = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data]);
  const recentTransactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data]
  );
  const recurringItems = useMemo(
    () => recurringItemsQuery.data ?? [],
    [recurringItemsQuery.data]
  );
  const pendingRecurringOccurrences = useMemo(
    () => recurringOccurrencesQuery.data ?? [],
    [recurringOccurrencesQuery.data]
  );

  useEffect(() => {
    if (!supabase || !userId || recurringItems.length === 0) return;

    const dueOccurrences = recurringItems.flatMap((item) => {
      const createdDate = item.created_at?.slice(0, 10) ?? item.anchor_date;
      const rangeStartDate = [
        item.anchor_date,
        createdDate,
        MONEY_RECURRING_OCCURRENCE_ROLLOUT_DATE,
      ].sort().at(-1) ?? item.anchor_date;

      if (rangeStartDate > todayDate) return [];

      return getRecurringOccurrencesInRange({
        anchorDate: item.anchor_date,
        frequency: item.frequency,
        recurrenceEndDate: item.end_date,
        rangeStartDate,
        rangeEndDate: todayDate,
      }).map((occurrenceDate) => ({
        recurringItemId: item.id,
        occurrenceDate,
      }));
    });

    if (dueOccurrences.length === 0) return;

    let cancelled = false;

    void Promise.all(
      dueOccurrences.map(({ recurringItemId, occurrenceDate }) =>
        getMoneyDb(supabase).rpc("materialize_money_recurring_occurrence", {
          p_recurring_item_id: recurringItemId,
          p_occurrence_date: occurrenceDate,
        })
      )
    )
      .then(async (results) => {
        if (cancelled) return;

        const firstError = results.find((result) => result.error)?.error;
        if (firstError) {
          throw new Error(
            firstError.message || "Unable to prepare scheduled Money."
          );
        }

        await queryClient.invalidateQueries({
          queryKey: getMoneyRecurringOccurrencesQueryKey(userId),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Unable to materialize recurring Money occurrences", error);
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient, recurringItems, supabase, todayDate, userId]);

  const upcomingRecurringItems = useMemo(() => {
    const today = getTodayDateString();
    return recurringItems
      .map((item) => ({
        item,
        nextDate: getNextRecurringOccurrence({
          anchorDate: item.anchor_date,
          frequency: item.frequency,
          endDate: item.end_date,
          today,
        }),
      }))
      .filter(
        (entry): entry is { item: MoneyRecurringItemRow; nextDate: string } =>
          entry.nextDate !== null
      )
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  }, [recurringItems]);
  const accountNameById = useMemo(() => {
    return accounts.reduce(
      (names, account) => {
        names[account.id] = account.name?.trim() || "Untitled account";
        return names;
      },
      {} as Record<string, string>
    );
  }, [accounts]);
  const categoryNameById = useMemo(() => {
    return categories.reduce(
      (names, category) => {
        names[category.id] = category.name?.trim() || "Untitled category";
        return names;
      },
      {} as Record<string, string>
    );
  }, [categories]);
  const categoryById = useMemo(
    () =>
      categories.reduce(
        (byId, category) => {
          byId[category.id] = category;
          return byId;
        },
        {} as Record<string, MoneyCategoryRow>,
      ),
    [categories],
  );
  const expenseCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.user_id === userId &&
          category.category_type === "expense" &&
          !category.archived_at
      ),
    [categories, userId]
  );
  const expenseCategoryIds = useMemo(
    () => new Set(expenseCategories.map((category) => category.id)),
    [expenseCategories]
  );
  const budgetedCategoryIds = useMemo(
    () => new Set(budgets.map((budget) => budget.category_id)),
    [budgets]
  );
  const summary = useMemo(() => {
    return accounts.reduce(
      (totals, account) => {
        const minor = normalizeMinorUnits(account.balance_minor);
        const accountType = normalizeAccountType(account.account_type);
        totals.netPosition += minor;
        if (accountType === "credit_card") {
          if (minor < 0) totals.debt += Math.abs(minor);
          return totals;
        }
        totals.totalAvailable += minor;
        return totals;
      },
      { totalAvailable: 0, debt: 0, netPosition: 0 }
    );
  }, [accounts]);
  const balanceProjection = useMemo(
    () =>
      buildMoneyBalanceProjection({
        accounts,
        recurringItems,
        horizonDays: projectionHorizonDays,
        today: todayDate,
      }),
    [accounts, projectionHorizonDays, recurringItems, todayDate]
  );
  const safeToSpendSummary = useMemo(
    () =>
      buildMoneySafeToSpendSummary({
        accounts,
        recurringItems,
        today: todayDate,
      }),
    [accounts, recurringItems, todayDate]
  );

  const moneyBalanceSparkline = useMemo(() => {
    const transactions = balanceHistoryQuery.data ?? [];
    const dates: string[] = [];

    let cursor = dashboardRangeStartDate;
    while (cursor <= todayDate) {
      dates.push(cursor);
      const next = addDaysToDateString(cursor, 1);
      if (!next || next === cursor) break;
      cursor = next;
    }

    if (!dates.length) {
      return {
        path: "M2 17 L92 17",
        color: "rgba(255,255,255,0.48)",
      };
    }

    const eligibleAccounts = accounts.filter(
      (account) => normalizeAccountType(account.account_type) !== "credit_card"
    );

    const transactionsByAccount = new Map<string, MoneyTransactionRow[]>();

    for (const transaction of transactions) {
      const rows = transactionsByAccount.get(transaction.account_id) ?? [];
      rows.push(transaction);
      transactionsByAccount.set(transaction.account_id, rows);
    }

    const values = dates.map(() => 0);

    for (const account of eligibleAccounts) {
      const rows = transactionsByAccount.get(account.id) ?? [];
      const flowByDate = new Map<string, number>();

      for (const transaction of rows) {
        const amount = normalizeMinorUnits(transaction.amount_minor);
        const signed =
          transaction.direction === "inflow" ? amount : -amount;

        flowByDate.set(
          transaction.transaction_date,
          (flowByDate.get(transaction.transaction_date) ?? 0) + signed
        );
      }

      let balance = normalizeMinorUnits(account.balance_minor);
      const createdDate = account.created_at?.slice(0, 10) ?? null;

      for (let index = dates.length - 1; index >= 0; index -= 1) {
        const date = dates[index];

        if (!createdDate || date >= createdDate) {
          values[index] += balance;
        }

        balance -= flowByDate.get(date) ?? 0;
      }
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    const path = values
      .map((value, index) => {
        const x =
          values.length === 1
            ? 92
            : 2 + (index / (values.length - 1)) * 90;

        const y =
          max === min
            ? 17
            : 30 - ((value - min) / (max - min)) * 26;

        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    const startBalance = values[0] ?? 0;
    const endBalance = values[values.length - 1] ?? startBalance;

    const color =
      endBalance > startBalance
        ? MONEY_SEMANTIC_COLORS.positive
        : endBalance < startBalance
          ? MONEY_SEMANTIC_COLORS.negative
          : "rgba(255,255,255,0.48)";

    return { path, color };
  }, [
    accounts,
    balanceHistoryQuery.data,
    dashboardRangeStartDate,
    todayDate,
  ]);
  const behavioralProjection = useMemo(
    () =>
      buildMoneyBehavioralProjection({
        historicalTransactions: historicalSpendingQuery.data ?? [],
        categoryNameById,
        deterministicProjection: balanceProjection,
        historicalStartDate: historicalSpendingRange.start,
        historicalEndDate: historicalSpendingRange.endInclusive,
        historicalDays: historicalSpendingRange.days,
        today: todayDate,
      }),
    [
      balanceProjection,
      categoryNameById,
      historicalSpendingQuery.data,
      historicalSpendingRange.days,
      historicalSpendingRange.endInclusive,
      historicalSpendingRange.start,
      todayDate,
    ]
  );
  const monthMetrics = useMemo(() => {
    return (monthMetricsQuery.data ?? []).reduce(
      (totals, transaction) => {
        const minor = Math.abs(normalizeTransactionMinor(transaction.amount_minor));
        if (transaction.transaction_type === "income") {
          totals.income += minor;
        } else if (transaction.transaction_type === "expense") {
          totals.spent += minor;
        }
        totals.net = totals.income - totals.spent;
        return totals;
      },
      { income: 0, spent: 0, net: 0 }
    );
  }, [monthMetricsQuery.data]);
  const budgetRows = useMemo(() => {
    return budgets
      .filter(
        (budget) =>
          budget.user_id === userId &&
          budget.budget_month === monthRange.start &&
          (budget.currency_code ?? "USD") === "USD" &&
          expenseCategoryIds.has(budget.category_id)
      )
      .map((budget) => {
        const limitMinor = normalizeMinorUnits(budget.limit_amount_minor);
        const spentMinor = (monthMetricsQuery.data ?? []).reduce(
          (total, transaction) => {
            const matchesBudget =
              transaction.user_id === userId &&
              transaction.status === "posted" &&
              transaction.reconciled_to_transaction_id === null &&
              transaction.excluded_from_analytics !== true &&
              transaction.transaction_type === "expense" &&
              transaction.category_id === budget.category_id &&
              transaction.transaction_date >= monthRange.start &&
              transaction.transaction_date < monthRange.next;

            return matchesBudget
              ? total + Math.abs(normalizeTransactionMinor(transaction.amount_minor))
              : total;
          },
          0
        );
        const remainingMinor = limitMinor - spentMinor;
        const percentageUsed = limitMinor > 0 ? spentMinor / limitMinor : 0;

        return {
          budget,
          categoryName: categoryNameById[budget.category_id] ?? "Untitled category",
          categoryColorKey: normalizeMoneyCategoryColorKey(
            categoryById[budget.category_id]?.color_key,
          ),
          spentMinor,
          limitMinor,
          remainingMinor,
          percentageUsed,
        };
      })
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [
    budgets,
    categoryNameById,
    categoryById,
    expenseCategoryIds,
    monthMetricsQuery.data,
    monthRange.next,
    monthRange.start,
    userId,
  ]);
  const budgetSummary = useMemo(() => {
    return budgetRows.reduce(
      (totals, row) => {
        totals.limit += row.limitMinor;
        totals.spent += row.spentMinor;
        totals.remaining += row.remainingMinor;
        return totals;
      },
      { limit: 0, spent: 0, remaining: 0 }
    );
  }, [budgetRows]);
  const invalidateAccounts = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyAccountsQueryKey(userId),
    });
  }, [queryClient, userId]);
  const invalidateTransactions = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getMoneyTransactionsQueryKey(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: getMoneyMonthMetricsQueryKey(userId, monthRange.start),
      }),
      queryClient.invalidateQueries({
        queryKey: [...MONEY_SPENDING_HISTORY_QUERY_ROOT, userId],
      }),
      queryClient.invalidateQueries({
        queryKey: [...MONEY_BALANCE_HISTORY_QUERY_ROOT, userId],
      }),
    ]);
  }, [monthRange.start, queryClient, userId]);
  const invalidateRecurringItems = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyRecurringItemsQueryKey(userId),
    });
  }, [queryClient, userId]);

  const invalidateRecurringOccurrences = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyRecurringOccurrencesQueryKey(userId),
    });
  }, [queryClient, userId]);
  const invalidateBudgets = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyBudgetsQueryKey(userId, monthRange.start),
    });
  }, [monthRange.start, queryClient, userId]);
  const invalidateCategories = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyCategoriesQueryKey(userId),
    });
  }, [queryClient, userId]);

  const saveAccount = useCallback(
    async (
      mode: "add" | "edit",
      form: AccountFormState,
      accountId?: string
    ) => {
      if (!supabase || !userId) {
        setFormError("Sign in before saving Money accounts.");
        return false;
      }

      const name = form.name.trim();
      const institutionName = form.institutionName.trim();
      const parsedBalanceMinor = parseDollarInput(form.balance);

      if (!name) {
        setFormError("Add an account name.");
        return false;
      }

      if (parsedBalanceMinor === null) {
        setFormError("Enter a positive dollar amount with up to two decimals.");
        return false;
      }

      const balanceMinor =
        form.accountType === "credit_card"
          ? -Math.abs(parsedBalanceMinor)
          : Math.abs(parsedBalanceMinor);
      const payload: MoneyAccountMutationPayload = {
        name,
        account_type: form.accountType,
        balance_minor: balanceMinor,
        currency_code: "USD",
        balance_as_of: getTodayDateString(),
        institution_name: institutionName || null,
      };

      if (mode === "add") {
        payload.user_id = userId;
        payload.source = "manual";
        payload.is_active = true;
      }

      setSavingMode(mode);
      setFormError(null);

      try {
        const db = getMoneyDb(supabase);
        const result =
          mode === "add"
            ? await db.from("money_accounts").insert(payload)
            : await db
                .from("money_accounts")
                .update(payload)
                .eq("id", accountId ?? "")
                .eq("user_id", userId);

        if (result.error) {
          throw new Error(result.error.message || "Unable to save account.");
        }

        await invalidateAccounts();
        setAddOpen(false);
        setEditingAccountId(null);
        return true;
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Unable to save account."
        );
        return false;
      } finally {
        setSavingMode(null);
      }
    },
    [invalidateAccounts, supabase, userId]
  );

  const addTransaction = useCallback(
    async (form: TransactionFormState) => {
      if (!supabase || !userId) {
        setTransactionError("Sign in before logging Money transactions.");
        return false;
      }

      const amountMinor = parseDollarInput(form.amount);
      const description = form.description.trim();
      const note = form.note.trim();
      const selectedAccount = accounts.find(
        (account) => account.id === form.accountId && account.user_id === userId
      );
      const selectedCategory =
        form.categoryId === NO_CATEGORY_VALUE
          ? null
          : categories.find(
              (category) =>
                category.id === form.categoryId &&
                category.user_id === userId &&
                category.category_type === form.transactionType &&
                !category.archived_at
            ) ?? null;

      if (amountMinor === null || amountMinor <= 0) {
        setTransactionError("Enter a transaction amount greater than zero.");
        return false;
      }

      if (!description) {
        setTransactionError("Add a transaction description.");
        return false;
      }

      if (!selectedAccount) {
        setTransactionError("Select one of your active Money accounts.");
        return false;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transactionDate)) {
        setTransactionError("Choose a valid transaction date.");
        return false;
      }

      if (form.categoryId !== NO_CATEGORY_VALUE && !selectedCategory) {
        setTransactionError("Select a matching active category or use no category.");
        return false;
      }

      const direction: MoneyTransactionDirection =
        form.transactionType === "expense" ? "outflow" : "inflow";

      setTransactionSaving(true);
      setTransactionError(null);

      try {
        const db = getMoneyDb(supabase);
        const result = await db.rpc("create_manual_money_transaction", {
          p_account_id: selectedAccount.id,
          p_category_id: selectedCategory?.id ?? null,
          p_transaction_type: form.transactionType,
          p_direction: direction,
          p_amount_minor: amountMinor,
          p_transaction_date: form.transactionDate,
          p_description: description,
          p_note: note || null,
        });

        if (result.error) {
          throw new Error(
            result.error.message || "Unable to save transaction."
          );
        }

        await Promise.all([invalidateAccounts(), invalidateTransactions()]);
        setTransactionFormOpen(false);
        return true;
      } catch (error) {
        setTransactionError(
          error instanceof Error ? error.message : "Unable to save transaction."
        );
        return false;
      } finally {
        setTransactionSaving(false);
      }
    },
    [
      accounts,
      categories,
      invalidateAccounts,
      invalidateTransactions,
      supabase,
      userId,
    ]
  );

  const confirmRecurringOccurrence = useCallback(
    async (
      occurrence: MoneyRecurringOccurrenceRow,
      accountId: string | null
    ) => {
      if (!supabase || !userId) {
        setPendingOccurrenceActionError(
          "Sign in before confirming scheduled Money."
        );
        return false;
      }

      if (!accountId) {
        setPendingOccurrenceActionError(
          "Choose an account before confirming this transaction."
        );
        return false;
      }

      setConfirmingOccurrenceId(occurrence.id);
      setPendingOccurrenceActionError(null);

      try {
        const result = await getMoneyDb(supabase).rpc(
          "confirm_money_recurring_occurrence",
          {
            p_occurrence_id: occurrence.id,
            p_account_id: accountId,
          }
        );

        if (result.error) {
          throw new Error(
            result.error.message || "Unable to confirm scheduled Money."
          );
        }

        await Promise.all([
          invalidateAccounts(),
          invalidateTransactions(),
          invalidateRecurringOccurrences(),
        ]);

        return true;
      } catch (error) {
        setPendingOccurrenceActionError(
          error instanceof Error
            ? error.message
            : "Unable to confirm scheduled Money."
        );
        return false;
      } finally {
        setConfirmingOccurrenceId(null);
      }
    },
    [
      invalidateAccounts,
      invalidateRecurringOccurrences,
      invalidateTransactions,
      supabase,
      userId,
    ]
  );

  const saveRecurringItem = useCallback(
    async (
      mode: "add" | "edit",
      form: RecurringItemFormState,
      recurringItemId?: string
    ) => {
      if (!supabase || !userId) {
        setRecurringError("Sign in before saving recurring Money items.");
        return false;
      }

      const amountMinor = parseDollarInput(form.amount);
      const name = form.name.trim();
      const note = form.note.trim();
      const direction: MoneyRecurringDirection =
        form.recurringType === "expense" ? "outflow" : "inflow";
      const selectedAccount =
        form.accountId === NO_ACCOUNT_VALUE
          ? null
          : accounts.find(
              (account) => account.id === form.accountId && account.user_id === userId
            ) ?? null;
      const selectedCategory =
        form.categoryId === NO_CATEGORY_VALUE
          ? null
          : categories.find(
              (category) =>
                category.id === form.categoryId &&
                category.user_id === userId &&
                category.category_type === form.recurringType &&
                !category.archived_at
            ) ?? null;

      if (amountMinor === null || amountMinor <= 0) {
        setRecurringError("Enter a recurring amount greater than zero.");
        return false;
      }

      if (!name) {
        setRecurringError("Add a recurring item name.");
        return false;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.anchorDate)) {
        setRecurringError("Choose a valid first date.");
        return false;
      }

      if (form.accountId !== NO_ACCOUNT_VALUE && !selectedAccount) {
        setRecurringError("Select one of your active Money accounts or no account.");
        return false;
      }

      if (form.categoryId !== NO_CATEGORY_VALUE && !selectedCategory) {
        setRecurringError("Select a matching active category or use no category.");
        return false;
      }

      const payload: MoneyRecurringItemMutationPayload = {
        account_id: selectedAccount?.id ?? null,
        category_id: selectedCategory?.id ?? null,
        name,
        direction,
        amount_minor: amountMinor,
        currency_code: "USD",
        frequency: form.frequency,
        anchor_date: form.anchorDate,
        note: note || null,
      };

      if (mode === "add") {
        payload.user_id = userId;
        payload.source = "manual";
        payload.is_active = true;
      }

      setRecurringSaving(true);
      setRecurringError(null);

      try {
        const db = getMoneyDb(supabase);
        const result =
          mode === "add"
            ? await db.from("money_recurring_items").insert(payload)
            : await db
                .from("money_recurring_items")
                .update(payload)
                .eq("id", recurringItemId ?? "")
                .eq("user_id", userId);

        if (result.error) {
          throw new Error(
            result.error.message || "Unable to save recurring item."
          );
        }

        await invalidateRecurringItems();
        setRecurringFormOpen(false);
        setEditingRecurringId(null);
        return true;
      } catch (error) {
        setRecurringError(
          error instanceof Error ? error.message : "Unable to save recurring item."
        );
        return false;
      } finally {
        setRecurringSaving(false);
      }
    },
    [accounts, categories, invalidateRecurringItems, supabase, userId]
  );

  const saveRecurringIcon = useCallback(async (itemId: string, iconKey: MoneyRecurringIconKey) => {
    if (!supabase || !userId) {
      setIconError("Sign in before changing an icon.");
      return;
    }
    setIconSaving(true);
    setIconError(null);
    try {
      const result = await getMoneyDb(supabase)
        .from("money_recurring_items")
        .update({ icon_key: iconKey })
        .eq("id", itemId)
        .eq("user_id", userId);
      if (result.error) throw new Error(result.error.message || "Unable to save icon.");
      await invalidateRecurringItems();
      setIconPickerRecurringId(null);
    } catch (error) {
      setIconError(error instanceof Error ? error.message : "Unable to save icon.");
    } finally {
      setIconSaving(false);
    }
  }, [invalidateRecurringItems, supabase, userId]);

  const saveBudget = useCallback(
    async (mode: "add" | "edit", form: BudgetFormState, budgetId?: string) => {
      if (!supabase || !userId) {
        setBudgetError("Sign in before saving Money budgets.");
        return false;
      }

      const limitAmountMinor = parseDollarInput(form.limit);
      const isCreatingCategory = mode === "add" && form.categoryMode === "create";
      const categoryName = form.categoryName.trim();
      const normalizedCategoryName = categoryName.toLocaleLowerCase();
      const selectedCategory = mode === "add" && !isCreatingCategory
        ? expenseCategories.find((category) =>
            category.id === form.categoryId && category.user_id === userId) ?? null
        : null;
      const existingBudget = mode === "add" && !isCreatingCategory
        ? budgets.find((budget) =>
            budget.user_id === userId && budget.category_id === form.categoryId &&
            budget.budget_month === monthRange.start &&
            (budget.currency_code ?? "USD") === "USD") ?? null
        : null;
      const editedBudget = mode === "edit"
        ? budgets.find(
            (budget) => budget.id === budgetId && budget.user_id === userId,
          ) ?? null
        : null;
      const editedCategory = editedBudget
        ? expenseCategories.find(
            (category) => category.id === editedBudget.category_id,
          ) ?? null
        : null;
      const duplicateCategory = categoryName
        ? expenseCategories.find((category) => {
            if (category.user_id !== userId) return false;
            if (category.id === editedCategory?.id) return false;
            return (
              (category.name?.trim().toLocaleLowerCase() ?? "") ===
              normalizedCategoryName
            );
          }) ?? null
        : null;

      if (limitAmountMinor === null) {
        setBudgetError("Enter zero or a positive dollar amount with up to two decimals.");
        return false;
      }

      if ((mode === "edit" || isCreatingCategory) && !categoryName) {
        setBudgetError("Enter a category name.");
        return false;
      }
      if ((mode === "edit" || isCreatingCategory) && categoryName.length > 80) {
        setBudgetError("Category names must be 80 characters or fewer.");
        return false;
      }
      if (mode === "edit" && (!editedBudget || !editedCategory)) {
        setBudgetError("Select an active expense category.");
        return false;
      }
      if ((mode === "edit" || isCreatingCategory) && duplicateCategory) {
        setBudgetError("A category with that name already exists.");
        return false;
      }
      if (mode === "add" && !isCreatingCategory && !selectedCategory) {
        setBudgetError("Select an active expense category.");
        return false;
      }

      if (existingBudget) {
        setBudgetError(
          "That category already has a budget for this month. Edit the existing budget instead."
        );
        setBudgetFormOpen(false);
        setEditingBudgetId(existingBudget.id);
        return false;
      }

      setBudgetSaving(true);
      setBudgetError(null);

      try {
        const db = getMoneyDb(supabase);
        let categoryId = selectedCategory?.id;
        if (mode === "add" && isCreatingCategory) {
          categoryId = crypto.randomUUID();
          const categoryResult = await db.from("money_categories").insert({
            id: categoryId,
            user_id: userId,
            name: categoryName,
            category_type: "expense",
            color_key: form.categoryColorKey,
          });
          if (categoryResult.error) throw new Error(categoryResult.error.message || "Unable to create category.");
        }
        const result =
          mode === "add"
            ? await db.from("money_budgets").insert({
                user_id: userId,
                category_id: categoryId,
                budget_month: monthRange.start,
                limit_amount_minor: limitAmountMinor,
                currency_code: "USD",
              })
            : await db
                .from("money_budgets")
                .update({ limit_amount_minor: limitAmountMinor })
                .eq("id", budgetId ?? "")
                .eq("user_id", userId);

        if (result.error) {
          throw new Error(result.error.message || "Unable to save budget.");
        }

        if (
          mode === "edit" &&
          editedCategory
        ) {
          const categoryPayload: MoneyCategoryMutationPayload = {};
          if ((editedCategory.name?.trim() ?? "") !== categoryName) {
            categoryPayload.name = categoryName;
          }
          if (
            normalizeMoneyCategoryColorKey(editedCategory.color_key) !==
            form.categoryColorKey
          ) {
            categoryPayload.color_key = form.categoryColorKey;
          }

          if (Object.keys(categoryPayload).length > 0) {
            const categoryResult = await db
              .from("money_categories")
              .update(categoryPayload)
              .eq("id", editedCategory.id)
              .eq("user_id", userId);
            if (categoryResult.error) {
              throw new Error(
                categoryResult.error.message ||
                  "Unable to update category details.",
              );
            }
          }
        }

        await Promise.all([invalidateBudgets(), invalidateCategories()]);
        setBudgetFormOpen(false);
        setEditingBudgetId(null);
        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unable to save budget.";
        const normalizedErrorMessage = errorMessage.toLocaleLowerCase();
        setBudgetError(
          normalizedErrorMessage.includes("categor") &&
            (normalizedErrorMessage.includes("duplicate") ||
              normalizedErrorMessage.includes("unique"))
            ? "A category with that name already exists."
            : errorMessage,
        );
        return false;
      } finally {
        setBudgetSaving(false);
      }
    },
    [
      budgets,
      expenseCategories,
      invalidateBudgets,
      invalidateCategories,
      monthRange.start,
      supabase,
      userId,
    ]
  );

  const archiveBudgetCategory = useCallback(
    async (budgetId: string) => {
      if (!supabase || !userId) {
        setBudgetError("Sign in before removing Money categories.");
        return false;
      }

      const budget = budgets.find(
        (item) => item.id === budgetId && item.user_id === userId,
      );
      const category = budget ? categoryById[budget.category_id] : null;

      if (!budget || !category || category.user_id !== userId) {
        setBudgetError("Unable to find that budget category.");
        return false;
      }

      setBudgetSaving(true);
      setBudgetError(null);

      try {
        const result = await getMoneyDb(supabase)
          .from("money_categories")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", category.id)
          .eq("user_id", userId);

        if (result.error) {
          throw new Error(
            result.error.message || "Unable to remove category.",
          );
        }

        await Promise.all([invalidateCategories(), invalidateBudgets()]);
        setBudgetFormOpen(false);
        setEditingBudgetId(null);
        setBudgetError(null);
        return true;
      } catch (error) {
        setBudgetError(
          error instanceof Error ? error.message : "Unable to remove category.",
        );
        return false;
      } finally {
        setBudgetSaving(false);
      }
    },
    [
      budgets,
      categoryById,
      invalidateBudgets,
      invalidateCategories,
      supabase,
      userId,
    ],
  );

  const loadError = authError ?? (accountsQuery.error instanceof Error
    ? accountsQuery.error.message
    : accountsQuery.error
      ? "Unable to load Money accounts."
      : null);
  const transactionsError = transactionsQuery.error instanceof Error
    ? transactionsQuery.error.message
    : transactionsQuery.error
      ? "Unable to load Money transactions."
      : null;
  const recurringItemsError = recurringItemsQuery.error instanceof Error
    ? recurringItemsQuery.error.message
    : recurringItemsQuery.error
      ? "Unable to load recurring Money items."
      : null;
  const recurringOccurrencesError =
    recurringOccurrencesQuery.error instanceof Error
      ? recurringOccurrencesQuery.error.message
      : recurringOccurrencesQuery.error
        ? "Unable to load pending Money."
        : null;
  const budgetsError = budgetsQuery.error instanceof Error
    ? budgetsQuery.error.message
    : budgetsQuery.error
      ? "Unable to load Money budgets."
      : null;
  const historicalSpendingError = historicalSpendingQuery.error instanceof Error
    ? historicalSpendingQuery.error.message
    : historicalSpendingQuery.error
      ? "Unable to load spending history."
      : null;
  void behavioralProjection;
  void historicalSpendingError;
  const projectionError = loadError ?? recurringItemsError;
  const isLoading = authLoading || (accountsQuery.isPending && Boolean(userId));
  const transactionsLoading =
    authLoading || (transactionsQuery.isPending && Boolean(userId));
  const recurringItemsLoading =
    authLoading || (recurringItemsQuery.isPending && Boolean(userId));
  const recurringOccurrencesLoading =
    authLoading || (recurringOccurrencesQuery.isPending && Boolean(userId));
  const budgetsLoading =
    authLoading || (budgetsQuery.isPending && Boolean(userId));
  const hasAccounts = accounts.length > 0;
  const accountSummaryLoading =
    authLoading || (accountsQuery.isPending && Boolean(userId));
  const availableSummaryLoading =
    accountSummaryLoading ||
    (recurringItemsQuery.isPending && Boolean(userId));
  const balanceHistoryLoading =
    accountSummaryLoading ||
    (balanceHistoryQuery.isPending && Boolean(userId));

  return (
    <div className="space-y-2 py-2 sm:space-y-3 sm:py-3">
      <div className="space-y-2 sm:space-y-3">
        <section
          className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,#070708_0%,#0a0a0b_60%,#101113_100%)]"
          aria-label="Money overview"
        >
        <div className="px-4 pb-3.5 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[-0.01em] text-white/64">
                Available
              </p>
              <p className="mt-1 min-h-[2.5rem] text-[2rem] font-semibold tabular-nums tracking-[-0.045em] text-white">
                {availableSummaryLoading ? (
                  <span
                    className="inline-block h-8 w-28 animate-pulse rounded-md bg-white/[0.08]"
                    aria-label="Loading available balance"
                  />
                ) : (
                  formatMoneyFromMinor(safeToSpendSummary.safeToSpendMinor)
                )}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="relative">
                <select
                  aria-label="Money history range"
                  value={dashboardRange}
                  onChange={(event) =>
                    setDashboardRange(event.target.value as MoneyDashboardRange)
                  }
                  className="appearance-none rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-2.5 pr-6 text-[10px] font-semibold text-white/58 outline-none"
                >
                  {MONEY_DASHBOARD_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/34"
                />
              </div>

              <div className="flex h-[34px] w-[94px] items-center justify-end">
                {balanceHistoryLoading ? (
                  <span
                    className="h-[22px] w-[82px] animate-pulse rounded-md bg-white/[0.055]"
                    aria-label="Loading balance history"
                  />
                ) : (
                  <svg
                    viewBox="0 0 94 34"
                    className="h-[34px] w-[94px] overflow-visible"
                    role="img"
                    aria-label={`${dashboardRange} available cash history`}
                  >
                    <path
                      d={moneyBalanceSparkline.path}
                      fill="none"
                      stroke={moneyBalanceSparkline.color}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 border-t border-white/[0.06]">
          {[
            {
              label: "Cash",
              value: summary.totalAvailable,
              accountCount: accounts.filter(
                (account) =>
                  normalizeAccountType(account.account_type) !== "credit_card"
              ).length,
              dotColor: MONEY_SEMANTIC_COLORS.positive,
            },
            {
              label: "Debt",
              value: summary.debt,
              accountCount: accounts.filter(
                (account) =>
                  normalizeAccountType(account.account_type) === "credit_card"
              ).length,
              dotColor: MONEY_SEMANTIC_COLORS.negative,
            },
            {
              label: "Net",
              value: summary.netPosition,
              accountCount: null,
              dotColor: null,
            },
          ].map(({ label, value, accountCount, dotColor }, index) => (
            <button
              key={label}
              type="button"
              onClick={
                label === "Cash" || label === "Debt"
                  ? () => setAccountsOpen((open) => !open)
                  : undefined
              }
              className={cn(
                "min-w-0 px-2 py-3 text-center",
                index > 0 && "border-l border-white/[0.06]",
                label !== "Net" && "transition-colors hover:bg-white/[0.025]",
              )}
            >
              <dt className="flex items-center justify-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-white/36">
                {dotColor ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                ) : null}
                {label}
              </dt>

              <dd
                className="mt-1 flex min-h-5 items-center justify-center truncate text-sm font-semibold tabular-nums"
                style={{
                  color:
                    (label === "Debt" && Number(value) > 0) ||
                    (label === "Net" && Number(value) < 0)
                      ? MONEY_SEMANTIC_COLORS.negative
                      : "rgba(255,255,255,0.82)",
                }}
              >
                {accountSummaryLoading ? (
                  <span
                    className="inline-block h-4 w-14 animate-pulse rounded bg-white/[0.07]"
                    aria-label={`Loading ${label.toLowerCase()}`}
                  />
                ) : (
                  formatMoneyFromMinor(Number(value))
                )}
              </dd>

              <dd className="mt-0.5 min-h-[14px] text-[9px] text-white/30">
                {accountSummaryLoading ? (
                  <span className="inline-block h-2.5 w-12 animate-pulse rounded bg-white/[0.045]" />
                ) : accountCount === null ? (
                  "Net position"
                ) : (
                  `${accountCount} ${accountCount === 1 ? "account" : "accounts"}`
                )}
              </dd>
            </button>
          ))}
        </dl>
        {accountsOpen ? (
          <div className="border-t border-white/[0.06]">
            <div className="flex justify-end px-3 py-2">
              <Button
                type="button"
                onClick={() => {
                  setEditingAccountId(null);
                  setFormError(null);
                  setAddOpen((open) => !open);
                }}
                className="h-8 rounded-lg border border-white/[0.09] bg-white/[0.05] px-2.5 text-[11px] text-white/76 hover:bg-white/[0.09]"
              >
                {addOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {addOpen ? "Close" : "Add Account"}
              </Button>
            </div>
            {addOpen ? (
              <div className="border-t border-white/[0.06] p-3">
                <MoneyAccountForm
                  mode="add"
                  initialState={getDefaultFormState()}
                  isSaving={savingMode === "add"}
                  error={
                    savingMode === "add" || !editingAccountId ? formError : null
                  }
                  onCancel={() => {
                    setAddOpen(false);
                    setFormError(null);
                  }}
                  onSubmit={(form) => saveAccount("add", form)}
                />
              </div>
            ) : null}
            {isLoading ? (
              <div className="px-4 py-4 text-xs text-white/44">
                Loading accounts...
              </div>
            ) : loadError ? (
              <div className="px-4 py-4 text-xs text-red-100/78">
                {loadError}
              </div>
            ) : accounts.length ? (
              accounts.map((account) => {
                const isEditing = editingAccountId === account.id;
                return (
                  <div
                    key={account.id}
                    className="border-t border-white/[0.06]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAddOpen(false);
                        setFormError(null);
                        setEditingAccountId((current) =>
                          current === account.id ? null : account.id,
                        );
                      }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white/82">
                          {account.name?.trim() || "Untitled account"}
                        </span>
                        <span className="block truncate text-[11px] capitalize text-white/36">
                          {normalizeAccountType(
                            account.account_type,
                          ).replaceAll("_", " ")}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-sm font-semibold tabular-nums text-white/76">
                        {formatMoneyFromMinor(
                          normalizeMinorUnits(account.balance_minor),
                        )}
                        <PencilLine className="h-3.5 w-3.5 text-white/28" />
                      </span>
                    </button>
                    {isEditing ? (
                      <div className="p-3 pt-0">
                        <MoneyAccountForm
                          mode="edit"
                          initialState={getEditFormState(account)}
                          isSaving={savingMode === "edit"}
                          error={formError}
                          onCancel={() => {
                            setEditingAccountId(null);
                            setFormError(null);
                          }}
                          onSubmit={(form) =>
                            saveAccount("edit", form, account.id)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="border-t border-white/[0.06] px-4 py-4 text-xs text-white/44">
                No accounts yet. Add one to start tracking cash.
              </div>
            )}
          </div>
        ) : null}
        </section>

        <section
          className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909]"
          aria-label="Upcoming scheduled money"
        >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-white/38">Upcoming</p>
          </div>
          <button
            type="button"
            aria-label="Add scheduled money"
            onClick={() => {
              setWorkspace("forecast");
              setRecurringFormOpen(true);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/58 transition hover:bg-white/[0.06] hover:text-white/78"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {recurringItemsLoading ? (
          <div className="px-3 py-4 text-xs text-white/42">
            Loading scheduled money...
          </div>
        ) : recurringItemsError ? (
          <div className="px-3 py-4 text-xs text-red-100/76">
            {recurringItemsError}
          </div>
        ) : upcomingRecurringItems.length ? (
          <div>
            {upcomingRecurringItems.slice(0, 3).map(({ item, nextDate }) => {
              const days = getDayDifference(todayDate, nextDate);
              const isOutflow = item.direction === "outflow";
              const name = item.name.trim() || "Untitled recurring item";

              return (
                <div
                  key={item.id}
                  className="border-b border-white/[0.055] last:border-b-0"
                >
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={`Change icon for ${name}`}
                      onClick={() => {
                        setEditingRecurringId(null);
                        setRecurringFormOpen(false);
                        setRecurringError(null);
                        setIconError(null);
                        setIconPickerRecurringId((current) =>
                          current === item.id ? null : item.id
                        );
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                      style={{
                        backgroundColor: isOutflow
                          ? "#813D58"
                          : "#4A8557",
                      }}
                    >
                      <RecurringIcon
                        item={item}
                        className="h-[17px] w-[17px] stroke-[2.1] text-white"
                      />
                    </button>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white/82">
                        {name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/38">
                        {formatCompactDate(nextDate)}
                        {item.account_id
                          ? ` · ${accountNameById[item.account_id] ?? "Unknown account"}`
                          : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <p
                        className="text-sm font-semibold tabular-nums"
                        style={{
                          color: isOutflow
                            ? MONEY_SEMANTIC_COLORS.negative
                            : MONEY_SEMANTIC_COLORS.positive,
                        }}
                      >
                        {formatVisualRecurringAmount(item)}
                      </p>
                      <p className="mt-0.5 text-[10px] tabular-nums text-white/34">
                        {days === 0
                          ? "today"
                          : `in ${days} ${days === 1 ? "day" : "days"}`}
                      </p>
                    </div>
                  </div>

                  {iconPickerRecurringId === item.id ? (
                    <RecurringIconPicker
                      item={item}
                      saving={iconSaving}
                      error={iconError}
                      onSelect={(key) => saveRecurringIcon(item.id, key)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 px-3 py-3">
            <div>
              <p className="text-sm font-semibold text-white/74">
                Nothing scheduled yet
              </p>
              <p className="mt-1 text-xs leading-5 text-white/38">
                Add bills or expected income so Safe to Spend and Forecast have
                context.
              </p>
            </div>

          </div>
        )}
        </section>

        <section
          className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909]"
          aria-label="Money workspace"
        >
        <div
          className="grid grid-cols-3 gap-1 border-b border-white/[0.06] bg-white/[0.018] p-1.5"
          role="tablist"
          aria-label="Money workspace"
        >
          {(["activity", "budget", "forecast"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={workspace === tab}
              onClick={() => setWorkspace(tab)}
              className={cn(
                "h-8 rounded-lg text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                workspace === tab
                  ? "bg-white/[0.10] text-white/88"
                  : "text-white/38",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {workspace === "activity" ? (
          <div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Activity
                </p>
              </div>
              <Button
                type="button"
                disabled={!hasAccounts}
                onClick={() => {
                  setTransactionError(null);
                  setTransactionFormOpen((open) => !open);
                }}
                className="h-8 rounded-lg border border-white/[0.09] bg-white/[0.05] px-2.5 text-[11px] text-white/76 hover:bg-white/[0.09]"
              >
                {transactionFormOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {transactionFormOpen ? "Close" : "Add Transaction"}
              </Button>
            </div>
            <dl className="grid grid-cols-3 border-y border-white/[0.06]">
              {[
                ["Income", monthMetrics.income],
                ["Spent", monthMetrics.spent],
                ["Net", monthMetrics.net],
              ].map(([label, value], index) => (
                <div
                  key={String(label)}
                  className={cn(
                    "min-w-0 px-2 py-2.5 text-center",
                    index > 0 && "border-l border-white/[0.06]",
                  )}
                >
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/32">
                    {label}
                  </dt>
                  <dd
                    className="mt-1 truncate text-sm font-semibold tabular-nums"
                    style={{
                      color:
                        label === "Income"
                          ? MONEY_SEMANTIC_COLORS.positive
                          : label === "Spent" || Number(value) < 0
                            ? MONEY_SEMANTIC_COLORS.negative
                            : "rgba(255,255,255,0.78)",
                    }}
                  >
                    {formatMoneyFromMinor(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            {transactionFormOpen ? (
              <div className="border-b border-white/[0.06] p-3">
                <MoneyTransactionForm
                  accounts={accounts}
                  categories={categories}
                  isSaving={transactionSaving}
                  error={
                    transactionError ??
                    (categoriesQuery.error
                      ? "Categories could not load. You can still log without a category."
                      : null)
                  }
                  onCancel={() => {
                    setTransactionFormOpen(false);
                    setTransactionError(null);
                  }}
                  onSubmit={addTransaction}
                />
              </div>
            ) : null}
            {recurringOccurrencesLoading ? (
              <div className="border-b border-white/[0.06] px-3 py-3 text-xs text-white/42">
                Loading pending money...
              </div>
            ) : recurringOccurrencesError ? (
              <div className="border-b border-white/[0.06] px-3 py-3 text-xs text-red-100/76">
                {recurringOccurrencesError}
              </div>
            ) : pendingRecurringOccurrences.length ? (
              <div className="border-b border-white/[0.06]">
                <div className="px-3 pb-1 pt-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/34">
                    Pending
                  </p>
                </div>

                {pendingRecurringOccurrences.map((occurrence) => (
                  <PendingRecurringOccurrenceRow
                    key={occurrence.id}
                    occurrence={occurrence}
                    accounts={accounts}
                    accountName={
                      occurrence.account_id
                        ? accountNameById[occurrence.account_id] ?? "Unknown account"
                        : null
                    }
                    categoryName={
                      occurrence.category_id
                        ? categoryNameById[occurrence.category_id] ?? null
                        : null
                    }
                    isConfirming={confirmingOccurrenceId === occurrence.id}
                    onConfirm={(accountId) =>
                      void confirmRecurringOccurrence(occurrence, accountId)
                    }
                  />
                ))}

                {pendingOccurrenceActionError ? (
                  <p className="px-3 py-2 text-[11px] text-red-100/76">
                    {pendingOccurrenceActionError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {transactionsLoading ? (
              <div className="px-3 py-4 text-xs text-white/42">
                Loading activity...
              </div>
            ) : transactionsError ? (
              <div className="px-3 py-4 text-xs text-red-100/76">
                {transactionsError}
              </div>
            ) : recentTransactions.length ? (
              recentTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  accountName={
                    accountNameById[transaction.account_id] ?? "Unknown account"
                  }
                  categoryName={
                    transaction.category_id
                      ? (categoryNameById[transaction.category_id] ?? null)
                      : null
                  }
                />
              ))
            ) : (
              <div className="px-3 py-5 text-xs text-white/42">
                No activity yet. Add income or spending after it happens.
              </div>
            )}
          </div>
        ) : null}

        {workspace === "budget" ? (
          <div>
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
                Monthly budget
              </p>
            </div>
            <dl className="grid grid-cols-3 border-y border-white/[0.06]">
              {[
                ["Budgeted", budgetSummary.limit],
                ["Spent", budgetSummary.spent],
                ["Left", budgetSummary.remaining],
              ].map(([label, value], index) => (
                <div
                  key={String(label)}
                  className={cn(
                    "min-w-0 px-2 py-2.5 text-center",
                    index > 0 && "border-l border-white/[0.06]",
                  )}
                >
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/32">
                    {label}
                  </dt>
                  <dd
                    className="mt-1 truncate text-sm font-semibold tabular-nums"
                    style={{
                      color:
                        label === "Budgeted"
                          ? MONEY_SEMANTIC_COLORS.allocated
                          : label === "Spent" || Number(value) < 0
                            ? MONEY_SEMANTIC_COLORS.negative
                            : MONEY_SEMANTIC_COLORS.positive,
                    }}
                  >
                    {formatMoneyFromMinor(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            {budgetFormOpen ? (
              <div className="border-b border-white/[0.06] p-3">
                <MoneyBudgetForm
                  mode="add"
                  initialState={getDefaultBudgetFormState(
                    expenseCategories,
                    budgetedCategoryIds,
                  )}
                  expenseCategories={expenseCategories}
                  budgetedCategoryIds={budgetedCategoryIds}
                  isSaving={budgetSaving}
                  error={
                    budgetError ??
                    (categoriesQuery.error
                      ? "Expense categories could not load, so budgets cannot be added."
                      : null)
                  }
                  onCancel={() => {
                    setBudgetFormOpen(false);
                    setBudgetError(null);
                  }}
                  onSubmit={(form) => saveBudget("add", form)}
                />
              </div>
            ) : null}
            {budgetsLoading ? (
              <div className="px-3 py-4 text-xs text-white/42">
                Loading monthly budget...
              </div>
            ) : budgetsError ? (
              <div className="px-3 py-4 text-xs text-red-100/76">
                {budgetsError}
              </div>
            ) : budgetRows.length ? (
              budgetRows.map((row) => {
                const isEditing = editingBudgetId === row.budget.id;
                return (
                  <div key={row.budget.id}>
                    <BudgetRow
                      row={row}
                      isEditing={isEditing}
                      onEdit={() => {
                        setBudgetFormOpen(false);
                        setBudgetError(null);
                        setEditingBudgetId((current) =>
                          current === row.budget.id ? null : row.budget.id,
                        );
                      }}
                    />
                    {isEditing ? (
                      <div className="border-b border-white/[0.06] p-3">
                        <MoneyBudgetForm
                          mode="edit"
                          initialState={getEditBudgetFormState(
                            row.budget,
                            categoryById[row.budget.category_id],
                          )}
                          expenseCategories={expenseCategories}
                          budgetedCategoryIds={budgetedCategoryIds}
                          isSaving={budgetSaving}
                          error={budgetError}
                          onCancel={() => {
                            setEditingBudgetId(null);
                            setBudgetError(null);
                          }}
                          onSubmit={(form) =>
                            saveBudget("edit", form, row.budget.id)
                          }
                          onRemoveCategory={() =>
                            archiveBudgetCategory(row.budget.id)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-4 text-xs text-white/42">
                No limits set for this month. Build your budget from zero.
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingBudgetId(null);
                setBudgetError(null);
                setBudgetFormOpen(true);
              }}
              className="w-full border-t border-white/[0.06] px-3 py-3 text-left text-xs font-semibold text-white/68 hover:bg-white/[0.035]"
            >
              + Add Category
            </button>
          </div>
        ) : null}

        {workspace === "forecast" ? (
          <div>
            {projectionError ? (
              <div className="px-3 py-4 text-xs text-red-100/76">
                {projectionError}
              </div>
            ) : (
              <>
                <MoneyForecastSummary projection={balanceProjection} horizon={projectionHorizonDays} onHorizonChange={setProjectionHorizonDays} />
                {balanceProjection.upcomingInflowMinor !== 0 ||
                balanceProjection.upcomingOutflowMinor !== 0 ? (
                  <div className="border-b border-white/[0.06] p-2">
                    <MoneyProjectionChart
                      projection={balanceProjection}
                      behavioralProjection={null}
                    />
                  </div>
                ) : null}
              </>
            )}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-white/82">
                  Scheduled money
                </p>
              </div>
              {!recurringFormOpen ? (
                <button
                  type="button"
                  aria-label="Add forecast"
                  onClick={() => {
                    setIconPickerRecurringId(null);
                    setIconError(null);
                    setEditingRecurringId(null);
                    setRecurringError(null);
                    setRecurringFormOpen(true);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/58 transition hover:bg-white/[0.06] hover:text-white/78"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {recurringFormOpen ? (
              <div ref={recurringAddFormRef}>
                <MoneyRecurringItemForm
                  mode="add"
                  initialState={getDefaultRecurringItemFormState()}
                  accounts={accounts}
                  categories={categories}
                  isSaving={recurringSaving}
                  error={
                    recurringError ??
                    (categoriesQuery.error
                      ? "Categories could not load. You can still save without a category."
                      : null)
                  }
                  onCancel={() => {
                    setRecurringFormOpen(false);
                    setRecurringError(null);
                  }}
                  onSubmit={(form) => saveRecurringItem("add", form)}
                />
              </div>
            ) : null}
            {recurringItemsLoading ? (
              <div className="px-3 py-4 text-xs text-white/42">
                Loading scheduled money...
              </div>
            ) : recurringItemsError ? (
              <div className="px-3 py-4 text-xs text-red-100/76">
                {recurringItemsError}
              </div>
            ) : upcomingRecurringItems.length ? (
              <div>
                {upcomingRecurringItems.map(({ item, nextDate }) => {
                  const isEditing = editingRecurringId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="border-t border-white/[0.04] p-2"
                    >
                      <RecurringItemRow
                        item={item}
                        nextDate={nextDate}
                        accountName={
                          item.account_id
                            ? (accountNameById[item.account_id] ??
                              "Unknown account")
                            : null
                        }
                        categoryName={
                          item.category_id
                            ? (categoryNameById[item.category_id] ?? null)
                            : null
                        }
                        isEditing={isEditing}
                        onEdit={() => {
                          setIconPickerRecurringId(null);
                          setIconError(null);
                          setRecurringFormOpen(false);
                          setRecurringError(null);
                          setEditingRecurringId((current) =>
                            current === item.id ? null : item.id,
                          );
                        }}
                        onIconClick={() => {
                          setEditingRecurringId(null);
                          setRecurringFormOpen(false);
                          setRecurringError(null);
                          setIconError(null);
                          setIconPickerRecurringId((current) => current === item.id ? null : item.id);
                        }}
                      />
                      {iconPickerRecurringId === item.id ? (
                        <RecurringIconPicker item={item} saving={iconSaving} error={iconError} onSelect={(key) => saveRecurringIcon(item.id, key)} />
                      ) : null}
                      {isEditing ? (
                        <div className="pt-2">
                          <MoneyRecurringItemForm
                            mode="edit"
                            initialState={getEditRecurringItemFormState(item)}
                            accounts={accounts}
                            categories={categories}
                            isSaving={recurringSaving}
                            error={recurringError}
                            onCancel={() => {
                              setEditingRecurringId(null);
                              setRecurringError(null);
                            }}
                            onSubmit={(form) =>
                              saveRecurringItem("edit", form, item.id)
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-4 text-xs text-white/42">
                Nothing scheduled yet.
              </div>
            )}
          </div>
        ) : null}
        </section>
      </div>
    </div>
  );
}
