"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  LoaderCircle,
  PencilLine,
  PiggyBank,
  Plus,
  ReceiptText,
  RotateCcw,
  WalletCards,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowser } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

type MoneyCategoryRow = {
  id: string;
  user_id: string;
  name: string | null;
  category_type: string | null;
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

type MoneyAccountsSupabaseClient = {
  from: {
    (table: "money_accounts"): MoneyAccountsTableClient;
    (table: "money_categories"): MoneyCategoriesTableClient;
    (table: "money_budgets"): MoneyBudgetsTableClient;
    (table: "money_transactions"): MoneyTransactionsTableClient;
    (table: "money_recurring_items"): MoneyRecurringItemsTableClient;
  };
  rpc: (
    fn: "create_manual_money_transaction",
    args: CreateManualMoneyTransactionRpcArgs
  ) => PromiseLike<MoneyQueryResult<null>>;
};

const MONEY_ACCOUNTS_QUERY_ROOT = ["money", "accounts"] as const;
const MONEY_CATEGORIES_QUERY_ROOT = ["money", "categories"] as const;
const MONEY_BUDGETS_QUERY_ROOT = ["money", "budgets"] as const;
const MONEY_TRANSACTIONS_QUERY_ROOT = ["money", "transactions"] as const;
const MONEY_MONTH_METRICS_QUERY_ROOT = ["money", "month-metrics"] as const;
const MONEY_SPENDING_HISTORY_QUERY_ROOT = ["money", "spending-history"] as const;
const MONEY_RECURRING_ITEMS_QUERY_ROOT = ["money", "recurring-items"] as const;
const NO_CATEGORY_VALUE = "__none__";
const NO_ACCOUNT_VALUE = "__none__";
const PROJECTION_HORIZONS = [7, 30, 90] as const;
const SAFE_TO_SPEND_FALLBACK_DAYS = 30;
const BEHAVIORAL_SPENDING_HISTORY_DAYS = 30;
const BEHAVIORAL_SPENDING_MIN_COVERAGE_DAYS = 7;

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

function getMoneyRecurringItemsQueryKey(userId: string | null) {
  return [...MONEY_RECURRING_ITEMS_QUERY_ROOT, userId] as const;
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

function getReadableAccountType(type: string | null | undefined) {
  if (type && type in ACCOUNT_TYPE_LABELS) {
    return ACCOUNT_TYPE_LABELS[type as MoneyAccountType];
  }
  return "Other";
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
    .select("id,user_id,name,category_type,archived_at,created_at")
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
      "id,user_id,account_id,category_id,name,direction,amount_minor,currency_code,frequency,anchor_date,end_date,is_active,source,note,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("anchor_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Unable to load recurring Money items.");
  }

  return (data ?? []).filter((item) => item.user_id === userId);
}

function MoneyMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.075] bg-[#090909] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
        {label}
      </p>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums tracking-tight text-white sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] font-medium text-white/36">
        {detail}
      </p>
    </div>
  );
}

function SafeToSpendStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
      <dt className="truncate text-[11px] font-medium text-white/38">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs font-semibold tabular-nums text-white/76">
        {value}
      </dd>
    </div>
  );
}

function MoneySafeToSpendPanel({
  summary,
}: {
  summary: MoneySafeToSpendSummary;
}) {
  const committedLabel = summary.usesFallbackWindow
    ? "Committed next 30 days"
    : "Committed before income";
  const nextIncomeDateLabel = summary.nextIncomeDate
    ? formatCompactDate(summary.nextIncomeDate)
    : "None scheduled";
  const daysUntilIncomeLabel =
    summary.daysUntilNextIncome === null
      ? "No date"
      : summary.daysUntilNextIncome === 1
        ? "1 day"
        : `${summary.daysUntilNextIncome} days`;
  const windowDetail = summary.usesFallbackWindow
    ? `Using known obligations from ${formatCompactDate(
        summary.obligationWindowStartDate
      )} to ${formatCompactDate(summary.obligationWindowEndDate)}.`
    : `Known obligations through ${formatCompactDate(
        summary.obligationWindowEndDate
      )}, including bills due on income day.`;

  return (
    <div className="border-b border-white/[0.055] bg-white/[0.018] p-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-end">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
            Safe to spend
          </p>
          <p className="mt-2 truncate text-4xl font-semibold tabular-nums tracking-tight text-white sm:text-5xl">
            {formatMoneyFromMinor(summary.safeToSpendMinor)}
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/42">
            {summary.usesFallbackWindow
              ? "No future recurring income is scheduled, so this uses the next 30 days of known obligations."
              : windowDetail}
          </p>
        </div>
        <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <SafeToSpendStat
            label="Liquid"
            value={formatMoneyFromMinor(summary.liquidBalanceMinor)}
          />
          <SafeToSpendStat
            label={committedLabel}
            value={formatMoneyFromMinor(
              summary.requiredOutflowsBeforeNextIncomeMinor
            )}
          />
          <SafeToSpendStat
            label="Next income"
            value={formatMoneyFromMinor(summary.nextIncomeAmountMinor)}
          />
          <SafeToSpendStat label="Next income date" value={nextIncomeDateLabel} />
          <SafeToSpendStat
            label="Days until income"
            value={daysUntilIncomeLabel}
          />
          <SafeToSpendStat
            label="After commitments"
            value={formatMoneyFromMinor(
              summary.balanceAfterKnownCommitmentsMinor
            )}
          />
        </dl>
      </div>
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
  categoryId: string;
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
  return {
    categoryId:
      expenseCategories.find((category) => !budgetedCategoryIds.has(category.id))
        ?.id ?? "",
    limit: "",
  };
}

function getEditBudgetFormState(budget: MoneyBudgetRow): BudgetFormState {
  return {
    categoryId: budget.category_id,
    limit: formatMinorForInput(budget.limit_amount_minor),
  };
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

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const isCreditCard = form.accountType === "credit_card";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSubmit(form);
    if (saved && mode === "add") setForm(getDefaultFormState());
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-2xl border border-white/[0.075] bg-black/30 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`money-account-name-${mode}`} className="text-white/58">
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
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] text-white placeholder:text-white/28"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/58">Account type</Label>
          <Select
            value={form.accountType}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                accountType: normalizeAccountType(value),
              }))
            }
            placeholder="Select type"
            triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
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

        <div className="space-y-1.5">
          <Label htmlFor={`money-account-balance-${mode}`} className="text-white/58">
            Current balance
          </Label>
          <Input
            id={`money-account-balance-${mode}`}
            inputMode="decimal"
            value={form.balance}
            onChange={(event) =>
              setForm((current) => ({ ...current, balance: event.target.value }))
            }
            placeholder={isCreditCard ? "500.00 owed" : "500.00"}
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono tabular-nums text-white placeholder:text-white/28"
          />
          <p className="text-[11px] leading-4 text-white/36">
            {isCreditCard
              ? "Enter what you owe as a positive amount; CREATOR stores it as negative debt."
              : "Enter the available account balance."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`money-account-institution-${mode}`}
            className="text-white/58"
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
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] text-white placeholder:text-white/28"
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="h-10 rounded-xl px-3 text-xs font-semibold text-white/54 hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
        >
          {isSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : mode === "add" ? (
            <Plus className="h-3.5 w-3.5" />
          ) : (
            <PencilLine className="h-3.5 w-3.5" />
          )}
          {isSaving ? "Saving" : mode === "add" ? "Add account" : "Save account"}
        </Button>
      </div>
    </form>
  );
}

function AccountRow({
  account,
  isEditing,
  onEdit,
}: {
  account: MoneyAccountRow;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const minor = normalizeMinorUnits(account.balance_minor);
  const currencyCode = account.currency_code ?? "USD";
  const accountType = normalizeAccountType(account.account_type);
  const isCreditCardDebt = accountType === "credit_card" && minor < 0;

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.995]",
        isEditing
          ? "border-white/[0.14] bg-white/[0.07]"
          : "border-white/[0.07] bg-[#090909] hover:bg-white/[0.045]"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white/84">
          {account.name?.trim() || "Untitled account"}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
          {getReadableAccountType(account.account_type)}
          {account.institution_name?.trim()
            ? ` · ${account.institution_name.trim()}`
            : ""}
          {isCreditCardDebt ? " · owed balance" : ""}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums text-white/82",
            isCreditCardDebt ? "text-white/62" : ""
          )}
        >
          {formatMoneyFromMinor(minor, currencyCode)}
        </span>
        <PencilLine className="h-3.5 w-3.5 shrink-0 text-white/30" />
      </span>
    </button>
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
    <div className="grid grid-cols-2 rounded-xl border border-white/[0.075] bg-white/[0.035] p-1">
      {(["expense", "income"] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={cn(
            "min-h-9 rounded-lg px-3 text-xs font-semibold capitalize transition",
            value === type
              ? "bg-white text-black"
              : "text-white/54 hover:bg-white/[0.055] hover:text-white/78"
          )}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

function MoneyTransactionForm({
  accounts,
  categories,
  isSaving,
  error,
  onCancel,
  onSubmit,
}: {
  accounts: MoneyAccountRow[];
  categories: MoneyCategoryRow[];
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (state: TransactionFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState(() =>
    getDefaultTransactionFormState(accounts)
  );
  const matchingCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.user_id === accounts[0]?.user_id ||
          accounts.some((account) => account.user_id === category.user_id)
      ),
    [accounts, categories]
  );
  const offeredCategories = useMemo(
    () =>
      matchingCategories.filter(
        (category) =>
          category.category_type === form.transactionType && !category.archived_at
      ),
    [form.transactionType, matchingCategories]
  );

  useEffect(() => {
    setForm((current) => {
      const accountStillAvailable = accounts.some(
        (account) => account.id === current.accountId
      );
      return {
        ...current,
        accountId: accountStillAvailable ? current.accountId : accounts[0]?.id ?? "",
      };
    });
  }, [accounts]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSubmit(form);
    if (saved) setForm(getDefaultTransactionFormState(accounts));
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-2xl border border-white/[0.075] bg-black/30 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-white/58">Type</Label>
          <TransactionTypeSegment
            value={form.transactionType}
            onChange={(transactionType) =>
              setForm((current) => ({
                ...current,
                transactionType,
                categoryId: NO_CATEGORY_VALUE,
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="money-transaction-amount" className="text-white/58">
            Amount
          </Label>
          <Input
            id="money-transaction-amount"
            inputMode="decimal"
            value={form.amount}
            onChange={(event) =>
              setForm((current) => ({ ...current, amount: event.target.value }))
            }
            placeholder="24.50"
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono tabular-nums text-white placeholder:text-white/28"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="money-transaction-date" className="text-white/58">
            Date
          </Label>
          <Input
            id="money-transaction-date"
            type="date"
            value={form.transactionDate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                transactionDate: event.target.value,
              }))
            }
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] text-white"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label
            htmlFor="money-transaction-description"
            className="text-white/58"
          >
            Description
          </Label>
          <Input
            id="money-transaction-description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="Client payment or coffee"
            maxLength={140}
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] text-white placeholder:text-white/28"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/58">Account</Label>
          <Select
            value={form.accountId}
            onValueChange={(accountId) =>
              setForm((current) => ({ ...current, accountId }))
            }
            placeholder="Select account"
            triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
          >
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name?.trim() || "Untitled account"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/58">Category</Label>
          <Select
            value={form.categoryId}
            onValueChange={(categoryId) =>
              setForm((current) => ({ ...current, categoryId }))
            }
            placeholder="Optional"
            triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
          >
            <SelectContent>
              <SelectItem value={NO_CATEGORY_VALUE}>No category</SelectItem>
              {offeredCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name?.trim() || "Untitled category"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {offeredCategories.length === 0 ? (
            <p className="text-[11px] leading-4 text-white/36">
              No matching categories yet; this transaction can still be logged.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="money-transaction-note" className="text-white/58">
            Note
          </Label>
          <Textarea
            id="money-transaction-note"
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Optional"
            maxLength={500}
            className="min-h-20 rounded-xl border-white/10 bg-white/[0.035] text-white placeholder:text-white/28 focus-visible:ring-white/15"
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="h-10 rounded-xl px-3 text-xs font-semibold text-white/54 hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving || accounts.length === 0}
          className="h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
        >
          {isSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {isSaving ? "Logging" : "Add transaction"}
        </Button>
      </div>
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
    <div className="grid grid-cols-2 rounded-xl border border-white/[0.075] bg-white/[0.035] p-1">
      {[
        { value: "expense", label: "Bill / Expense" },
        { value: "income", label: "Income" },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value as ManualRecurringType)}
          className={cn(
            "min-h-9 rounded-lg px-3 text-xs font-semibold transition",
            value === option.value
              ? "bg-white text-black"
              : "text-white/54 hover:bg-white/[0.055] hover:text-white/78"
          )}
        >
          {option.label}
        </button>
      ))}
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
  const [form, setForm] = useState(initialState);
  const offeredCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.category_type === form.recurringType && !category.archived_at
      ),
    [categories, form.recurringType]
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  useEffect(() => {
    setForm((current) => {
      const accountStillAvailable =
        current.accountId === NO_ACCOUNT_VALUE ||
        accounts.some((account) => account.id === current.accountId);
      const categoryStillAvailable =
        current.categoryId === NO_CATEGORY_VALUE ||
        offeredCategories.some((category) => category.id === current.categoryId);
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
      className="rounded-2xl border border-white/[0.075] bg-black/30 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-white/58">Type</Label>
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

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`money-recurring-name-${mode}`} className="text-white/58">
            Name
          </Label>
          <Input
            id={`money-recurring-name-${mode}`}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Rent, software, client retainer"
            maxLength={120}
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] text-white placeholder:text-white/28"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`money-recurring-amount-${mode}`}
            className="text-white/58"
          >
            Amount
          </Label>
          <Input
            id={`money-recurring-amount-${mode}`}
            inputMode="decimal"
            value={form.amount}
            onChange={(event) =>
              setForm((current) => ({ ...current, amount: event.target.value }))
            }
            placeholder="1200.00"
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono tabular-nums text-white placeholder:text-white/28"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/58">Frequency</Label>
          <Select
            value={form.frequency}
            onValueChange={(frequency) =>
              setForm((current) => ({
                ...current,
                frequency: normalizeRecurringFrequency(frequency),
              }))
            }
            placeholder="Frequency"
            triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
          >
            <SelectContent>
              {RECURRING_FREQUENCY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`money-recurring-anchor-${mode}`}
            className="text-white/58"
          >
            First date
          </Label>
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
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] text-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/58">Account</Label>
          <Select
            value={form.accountId}
            onValueChange={(accountId) =>
              setForm((current) => ({ ...current, accountId }))
            }
            placeholder="Optional"
            triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
          >
            <SelectContent>
              <SelectItem value={NO_ACCOUNT_VALUE}>No account</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name?.trim() || "Untitled account"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-white/58">Category</Label>
          <Select
            value={form.categoryId}
            onValueChange={(categoryId) =>
              setForm((current) => ({ ...current, categoryId }))
            }
            placeholder="Optional"
            triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
          >
            <SelectContent>
              <SelectItem value={NO_CATEGORY_VALUE}>No category</SelectItem>
              {offeredCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name?.trim() || "Untitled category"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {offeredCategories.length === 0 ? (
            <p className="text-[11px] leading-4 text-white/36">
              No matching categories yet; this item can stay uncategorized.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`money-recurring-note-${mode}`} className="text-white/58">
            Note
          </Label>
          <Textarea
            id={`money-recurring-note-${mode}`}
            value={form.note}
            onChange={(event) =>
              setForm((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Optional"
            maxLength={500}
            className="min-h-20 rounded-xl border-white/10 bg-white/[0.035] text-white placeholder:text-white/28 focus-visible:ring-white/15"
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="h-10 rounded-xl px-3 text-xs font-semibold text-white/54 hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
        >
          {isSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : mode === "add" ? (
            <Plus className="h-3.5 w-3.5" />
          ) : (
            <PencilLine className="h-3.5 w-3.5" />
          )}
          {isSaving ? "Saving" : mode === "add" ? "Add item" : "Save item"}
        </Button>
      </div>
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
}: {
  mode: "add" | "edit";
  initialState: BudgetFormState;
  expenseCategories: MoneyCategoryRow[];
  budgetedCategoryIds: Set<string>;
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (state: BudgetFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState(initialState);
  const availableCategories = useMemo(
    () =>
      mode === "add"
        ? expenseCategories.filter(
            (category) => !budgetedCategoryIds.has(category.id)
          )
        : expenseCategories,
    [budgetedCategoryIds, expenseCategories, mode]
  );

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  useEffect(() => {
    if (mode !== "add") return;
    setForm((current) => {
      if (availableCategories.some((category) => category.id === current.categoryId)) {
        return current;
      }
      return {
        ...current,
        categoryId: availableCategories[0]?.id ?? "",
      };
    });
  }, [availableCategories, mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSubmit(form);
    if (saved && mode === "add") {
      setForm(getDefaultBudgetFormState(expenseCategories, budgetedCategoryIds));
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-2xl border border-white/[0.075] bg-black/30 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {mode === "add" ? (
          <div className="space-y-1.5">
            <Label className="text-white/58">Expense category</Label>
            <Select
              value={form.categoryId}
              onValueChange={(categoryId) =>
                setForm((current) => ({ ...current, categoryId }))
              }
              placeholder="Select category"
              triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.035]"
            >
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name?.trim() || "Untitled category"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableCategories.length === 0 ? (
              <p className="text-[11px] leading-4 text-white/36">
                All active expense categories already have budgets. Edit an
                existing budget instead.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={cn("space-y-1.5", mode === "edit" ? "sm:col-span-2" : "")}>
          <Label htmlFor={`money-budget-limit-${mode}`} className="text-white/58">
            Monthly limit
          </Label>
          <Input
            id={`money-budget-limit-${mode}`}
            inputMode="decimal"
            value={form.limit}
            onChange={(event) =>
              setForm((current) => ({ ...current, limit: event.target.value }))
            }
            placeholder="500.00"
            className="h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono tabular-nums text-white placeholder:text-white/28"
          />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="h-10 rounded-xl px-3 text-xs font-semibold text-white/54 hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving || (mode === "add" && availableCategories.length === 0)}
          className="h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
        >
          {isSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : mode === "add" ? (
            <Plus className="h-3.5 w-3.5" />
          ) : (
            <PencilLine className="h-3.5 w-3.5" />
          )}
          {isSaving ? "Saving" : mode === "add" ? "Add budget" : "Save limit"}
        </Button>
      </div>
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
  const Icon = isOutflow ? ArrowUpRight : ArrowDownLeft;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-2xl border border-white/[0.07] bg-[#090909] px-3 py-3">
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
          isOutflow
            ? "border-red-200/10 bg-red-200/[0.035] text-red-100/70"
            : "border-emerald-200/10 bg-emerald-200/[0.04] text-emerald-100/72"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
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
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          isOutflow ? "text-red-100/78" : "text-emerald-100/78"
        )}
      >
        {formatVisualTransactionAmount(transaction)}
      </span>
    </div>
  );
}

function RecurringItemRow({
  item,
  nextDate,
  accountName,
  categoryName,
  isEditing,
  onEdit,
}: {
  item: MoneyRecurringItemRow;
  nextDate: string;
  accountName: string | null;
  categoryName: string | null;
  isEditing: boolean;
  onEdit: () => void;
}) {
  const isOutflow = item.direction === "outflow";
  const Icon = isOutflow ? ArrowUpRight : ArrowDownLeft;

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.995]",
        isEditing
          ? "border-white/[0.14] bg-white/[0.07]"
          : "border-white/[0.07] bg-[#090909] hover:bg-white/[0.045]"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
          isOutflow
            ? "border-red-200/10 bg-red-200/[0.035] text-red-100/70"
            : "border-emerald-200/10 bg-emerald-200/[0.04] text-emerald-100/72"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white/84">
          {item.name.trim() || "Untitled recurring item"}
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
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            isOutflow ? "text-red-100/78" : "text-emerald-100/78"
          )}
        >
          {formatVisualRecurringAmount(item)}
        </span>
        <PencilLine className="h-3.5 w-3.5 shrink-0 text-white/30" />
      </span>
    </button>
  );
}

type BudgetDisplayRow = {
  budget: MoneyBudgetRow;
  categoryName: string;
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

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "w-full rounded-2xl border px-3 py-3 text-left transition active:scale-[0.995]",
        isEditing
          ? "border-white/[0.14] bg-white/[0.07]"
          : "border-white/[0.07] bg-[#090909] hover:bg-white/[0.045]"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white/84">
            {row.categoryName}
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
              className={cn(
                "block font-mono text-sm font-semibold tabular-nums",
                isOverLimit ? "text-red-100/78" : "text-white/78"
              )}
            >
              {formatMoneyFromMinor(
                row.remainingMinor,
                row.budget.currency_code ?? "USD"
              )}
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">
              Remaining
            </span>
          </span>
          <PencilLine className="h-3.5 w-3.5 shrink-0 text-white/30" />
        </span>
      </span>
      <span className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <span
            className={cn(
              "block h-full rounded-full",
              isOverLimit ? "bg-red-100/58" : "bg-white/54"
            )}
            style={{ width: progressWidth }}
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
    <div className="grid grid-cols-3 rounded-xl border border-white/[0.075] bg-white/[0.035] p-1">
      {PROJECTION_HORIZONS.map((horizon) => (
        <button
          key={horizon}
          type="button"
          onClick={() => onChange(horizon)}
          className={cn(
            "min-h-8 rounded-lg px-2 text-xs font-semibold transition",
            value === horizon
              ? "bg-white text-black"
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
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 38, left: 76 };
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
  const rawMin = Math.min(0, ...balances);
  const rawMax = Math.max(0, ...balances);
  const rawRange = Math.max(1, rawMax - rawMin);
  const minBalance = rawMin - rawRange * 0.08;
  const maxBalance = rawMax + rawRange * 0.08;
  const range = Math.max(1, maxBalance - minBalance);
  const hasNegativeBalance = balances.some((balance) => balance < 0);
  const changedPoints = projection.points.filter(
    (point) => point.changeMinor !== 0
  );
  const markerStep = Math.max(1, Math.ceil(changedPoints.length / 12));

  const getX = (index: number) => {
    if (projection.points.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (projection.points.length - 1)) * chartWidth;
  };
  const getY = (balance: number) =>
    padding.top + chartHeight - ((balance - minBalance) / range) * chartHeight;

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
  const baselineY = getY(0);
  const areaPath =
    projection.points.length > 0
      ? [
          `M${getX(0).toFixed(2)},${baselineY.toFixed(2)}`,
          ...projection.points.map(
            (point, index) =>
              `L${getX(index).toFixed(2)},${getY(point.balanceMinor).toFixed(2)}`
          ),
          `L${getX(projection.points.length - 1).toFixed(2)},${baselineY.toFixed(
            2
          )}`,
          "Z",
        ].join(" ")
      : "";
  const labelIndexes = Array.from(
    new Set([
      0,
      projection.points.length > 8
        ? Math.floor((projection.points.length - 1) / 2)
        : null,
      projection.points.length - 1,
    ])
  ).filter((index): index is number => index !== null && index >= 0);

  return (
    <div className="min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[190px] w-full opacity-95 sm:h-[210px]"
        role="img"
        aria-label={`Projected Money balance from ${formatReadableDate(
          projection.startDate
        )} to ${formatReadableDate(projection.endDate)}`}
      >
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={
                hasNegativeBalance
                  ? "rgba(248,113,113,0.16)"
                  : "rgba(244,244,245,0.14)"
              }
            />
            <stop offset="100%" stopColor="rgba(244,244,245,0.01)" />
          </linearGradient>
        </defs>

        {[maxBalance, minBalance].map((balance) => {
          const y = getY(balance);
          return (
            <g key={`projection-grid-${balance}`}>
              <line
                x1={padding.left}
                x2={padding.left + chartWidth}
                y1={y}
                y2={y}
                stroke="rgba(82,82,91,0.2)"
                strokeDasharray="3 6"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="rgba(161,161,170,0.72)"
                fontSize="11"
              >
                {formatCompactMoneyFromMinor(balance)}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={padding.left + chartWidth}
          y1={baselineY}
          y2={baselineY}
          stroke={
            hasNegativeBalance
              ? "rgba(248,113,113,0.42)"
              : "rgba(82,82,91,0.34)"
          }
          strokeDasharray="4 7"
        />
        <text
          x={padding.left - 10}
          y={baselineY + 4}
          textAnchor="end"
          fill={
            hasNegativeBalance
              ? "rgba(254,202,202,0.72)"
              : "rgba(161,161,170,0.58)"
          }
          fontSize="11"
        >
          $0
        </text>

        <path d={areaPath} fill={`url(#${gradientId}-area)`} />
        <path
          d={linePath}
          fill="none"
          stroke={hasNegativeBalance ? "rgba(254,202,202,0.9)" : "#f4f4f5"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
        />
        {showBehavioralProjection ? (
          <path
            d={behavioralLinePath}
            fill="none"
            stroke="rgba(125,211,252,0.82)"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : null}

        {changedPoints.map((point, index) => {
          if (index % markerStep !== 0) return null;
          const pointIndex = projection.points.findIndex(
            (candidate) => candidate.date === point.date
          );
          return (
            <circle
              key={`projection-marker-${point.date}`}
              cx={getX(pointIndex)}
              cy={getY(point.balanceMinor)}
              r={2.8}
              fill={
                point.changeMinor < 0
                  ? "rgba(254,202,202,0.9)"
                  : "rgba(187,247,208,0.88)"
              }
              stroke="rgba(5,6,8,0.95)"
              strokeWidth={1}
            />
          );
        })}

        {labelIndexes.map((index) => {
          const point = projection.points[index];
          if (!point) return null;
          return (
            <text
              key={`projection-label-${point.date}`}
              x={getX(index)}
              y={height - 15}
              textAnchor="middle"
              fill="rgba(161,161,170,0.82)"
              fontSize="11"
            >
              {formatCompactDate(point.date)}
            </text>
          );
        })}
      </svg>
      {showBehavioralProjection ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-5 bg-white/72" aria-hidden="true" />
            Known cash flow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-px w-5 border-t border-dashed border-sky-200/82"
              aria-hidden="true"
            />
            Spending estimate
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
  const [recurringFormOpen, setRecurringFormOpen] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(
    null
  );
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [projectionHorizonDays, setProjectionHorizonDays] =
    useState<ProjectionHorizonDays>(30);

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
    ]);
  }, [monthRange.start, queryClient, userId]);
  const invalidateRecurringItems = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyRecurringItemsQueryKey(userId),
    });
  }, [queryClient, userId]);
  const invalidateBudgets = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({
      queryKey: getMoneyBudgetsQueryKey(userId, monthRange.start),
    });
  }, [monthRange.start, queryClient, userId]);

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

  const saveBudget = useCallback(
    async (mode: "add" | "edit", form: BudgetFormState, budgetId?: string) => {
      if (!supabase || !userId) {
        setBudgetError("Sign in before saving Money budgets.");
        return false;
      }

      const limitAmountMinor = parseDollarInput(form.limit);
      const selectedCategory =
        mode === "add"
          ? expenseCategories.find(
              (category) =>
                category.id === form.categoryId && category.user_id === userId
            ) ?? null
          : null;
      const existingBudget =
        mode === "add"
          ? budgets.find(
              (budget) =>
                budget.user_id === userId &&
                budget.category_id === form.categoryId &&
                budget.budget_month === monthRange.start &&
                (budget.currency_code ?? "USD") === "USD"
            ) ?? null
          : null;

      if (limitAmountMinor === null) {
        setBudgetError("Enter zero or a positive dollar amount with up to two decimals.");
        return false;
      }

      if (mode === "add" && !selectedCategory) {
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
        const result =
          mode === "add"
            ? await db.from("money_budgets").insert({
                user_id: userId,
                category_id: selectedCategory?.id,
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

        await invalidateBudgets();
        setBudgetFormOpen(false);
        setEditingBudgetId(null);
        return true;
      } catch (error) {
        setBudgetError(
          error instanceof Error ? error.message : "Unable to save budget."
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
      monthRange.start,
      supabase,
      userId,
    ]
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
  const projectionError = loadError ?? recurringItemsError;
  const isLoading = authLoading || (accountsQuery.isPending && Boolean(userId));
  const transactionsLoading =
    authLoading || (transactionsQuery.isPending && Boolean(userId));
  const recurringItemsLoading =
    authLoading || (recurringItemsQuery.isPending && Boolean(userId));
  const budgetsLoading =
    authLoading || (budgetsQuery.isPending && Boolean(userId));
  const hasAccounts = accounts.length > 0;
  const hasUnbudgetedExpenseCategories = expenseCategories.some(
    (category) => !budgetedCategoryIds.has(category.id)
  );

  return (
    <div className="space-y-3 py-3">
      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[linear-gradient(145deg,#070708_0%,#0A0A0B_58%,#101113_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Money summary"
      >
        <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/66">
                <WalletCards className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white/88">
                  Money
                </p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-white/38">
                  Manual account balances
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {accountsQuery.isFetching && hasAccounts ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-white/34" />
            ) : null}
            <Button
              type="button"
              onClick={() => {
                setEditingAccountId(null);
                setFormError(null);
                setAddOpen((open) => !open);
              }}
              className="h-10 rounded-xl border border-white/[0.09] bg-white/[0.055] px-3 text-xs font-semibold text-white/80 hover:bg-white/[0.09]"
            >
              {addOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {addOpen ? "Close" : "Add Account"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 border-t border-white/[0.055] p-3 sm:grid-cols-3">
          <MoneyMetricCard
            label="Total available"
            value={formatMoneyFromMinor(summary.totalAvailable)}
            detail="Active asset accounts"
          />
          <MoneyMetricCard
            label="Debt"
            value={formatMoneyFromMinor(summary.debt)}
            detail="Credit cards owed"
          />
          <MoneyMetricCard
            label="Net position"
            value={formatMoneyFromMinor(summary.netPosition)}
            detail="All active balances"
          />
        </div>
      </section>

      {addOpen ? (
        <MoneyAccountForm
          mode="add"
          initialState={getDefaultFormState()}
          isSaving={savingMode === "add"}
          error={savingMode === "add" || !editingAccountId ? formError : null}
          onCancel={() => {
            setAddOpen(false);
            setFormError(null);
          }}
          onSubmit={(form) => saveAccount("add", form)}
        />
      ) : null}

      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Money balance projection"
      >
        <div className="flex flex-col gap-3 border-b border-white/[0.055] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-white/44" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white/82">
                Projection
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/38">
                Active balances plus known recurring money
              </p>
            </div>
          </div>
          <div className="w-full sm:w-44">
            <ProjectionHorizonSegment
              value={projectionHorizonDays}
              onChange={setProjectionHorizonDays}
            />
          </div>
        </div>

        {projectionError ? (
          <div className="px-4 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-100/78">
                  Unable to calculate projection
                </p>
                <p className="mt-1 text-xs leading-5 text-white/38">
                  {projectionError}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void accountsQuery.refetch();
                  void recurringItemsQuery.refetch();
                }}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-white/62 transition hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            <MoneySafeToSpendPanel summary={safeToSpendSummary} />

            <div className="grid grid-cols-1 gap-2 border-b border-white/[0.055] p-3 sm:grid-cols-5">
              <MoneyMetricCard
                label="Projected balance"
                value={formatMoneyFromMinor(balanceProjection.projectedBalanceMinor)}
                detail={formatReadableDate(balanceProjection.endDate)}
              />
              <MoneyMetricCard
                label="Lowest balance"
                value={formatMoneyFromMinor(balanceProjection.lowestBalanceMinor)}
                detail="First minimum"
              />
              <MoneyMetricCard
                label="Low date"
                value={formatCompactDate(balanceProjection.lowestBalanceDate)}
                detail={formatReadableDate(balanceProjection.lowestBalanceDate)}
              />
              <MoneyMetricCard
                label="Inflows"
                value={formatMoneyFromMinor(balanceProjection.upcomingInflowMinor)}
                detail={`${balanceProjection.horizonDays} day window`}
              />
              <MoneyMetricCard
                label="Outflows"
                value={formatMoneyFromMinor(balanceProjection.upcomingOutflowMinor)}
                detail={`${balanceProjection.horizonDays} day window`}
              />
            </div>

            <div className="border-b border-white/[0.055] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                    Spending estimate
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/40">
                    Recent posted USD expenses from{" "}
                    {formatReadableDate(behavioralProjection.historicalStartDate)}{" "}
                    to {formatReadableDate(behavioralProjection.historicalEndDate)}.
                  </p>
                </div>
                {historicalSpendingQuery.isFetching ? (
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-white/34" />
                ) : null}
              </div>

              {historicalSpendingQuery.isPending && Boolean(userId) ? (
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.075] bg-white/[0.025] px-3 py-2 text-xs text-white/42">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading spending estimate...
                </div>
              ) : historicalSpendingError ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2">
                  <p className="text-xs leading-5 text-red-100/72">
                    Spending estimate unavailable. {historicalSpendingError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void historicalSpendingQuery.refetch()}
                    className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[11px] font-semibold text-white/62 transition hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              ) : behavioralProjection.status === "insufficient" ? (
                <p className="rounded-xl border border-white/[0.075] bg-white/[0.025] px-3 py-2 text-xs leading-5 text-white/42">
                  More transaction history is needed for spending estimates.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <MoneyMetricCard
                    label="Expected spending"
                    value={formatMoneyFromMinor(
                      behavioralProjection.expectedVariableSpendMinor
                    )}
                    detail={`${behavioralProjection.horizonDays} day window`}
                  />
                  <MoneyMetricCard
                    label="Likely balance"
                    value={formatMoneyFromMinor(
                      behavioralProjection.projectedBalanceMinor
                    )}
                    detail={formatReadableDate(balanceProjection.endDate)}
                  />
                  <MoneyMetricCard
                    label="Likely lowest"
                    value={formatMoneyFromMinor(
                      behavioralProjection.lowestBalanceMinor
                    )}
                    detail={formatReadableDate(
                      behavioralProjection.lowestBalanceDate
                    )}
                  />
                  <MoneyMetricCard
                    label="Avg daily spend"
                    value={`${formatMoneyFromMinor(
                      behavioralProjection.averageDailyVariableSpendMinor
                    )}/day`}
                    detail={`${behavioralProjection.transactionCount} posted expenses`}
                  />
                  <MoneyMetricCard
                    label="Vs known"
                    value={formatMoneyFromMinor(
                      behavioralProjection.differenceVsKnownMinor
                    )}
                    detail="Likely minus known"
                  />
                </div>
              )}
            </div>

            <div className="p-3">
              <MoneyProjectionChart
                projection={balanceProjection}
                behavioralProjection={
                  historicalSpendingError ? null : behavioralProjection
                }
              />
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-white/[0.055] pt-3 sm:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                    Window
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/44">
                    {formatReadableDate(balanceProjection.startDate)} to{" "}
                    {formatReadableDate(balanceProjection.endDate)} starts from{" "}
                    {formatMoneyFromMinor(balanceProjection.startingBalanceMinor)}.
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                    Largest recurring changes
                  </p>
                  {balanceProjection.keyOccurrences.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {balanceProjection.keyOccurrences.map((occurrence) => (
                        <div
                          key={occurrence.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs"
                        >
                          <span className="min-w-0 truncate font-medium text-white/58">
                            {formatCompactDate(occurrence.date)} · {occurrence.name}
                          </span>
                          <span
                            className={cn(
                              "font-mono font-semibold tabular-nums",
                              occurrence.direction === "outflow"
                                ? "text-red-100/72"
                                : "text-emerald-100/72"
                            )}
                          >
                            {formatMoneyFromMinor(
                              occurrence.signedAmountMinor,
                              occurrence.currencyCode
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs leading-5 text-white/40">
                      No recurring changes in this window.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/34">
                    Variable history
                  </p>
                  {behavioralProjection.status === "sufficient" &&
                  !historicalSpendingError ? (
                    <p className="mt-1 text-xs leading-5 text-white/44">
                      Trailing 7 days:{" "}
                      {formatMoneyFromMinor(
                        behavioralProjection.trailing7SpendMinor
                      )}
                      . Trailing 30 days:{" "}
                      {formatMoneyFromMinor(
                        behavioralProjection.trailing30SpendMinor
                      )}
                      {behavioralProjection.topCategoryName
                        ? `. Largest category: ${behavioralProjection.topCategoryName} · ${formatMoneyFromMinor(
                            behavioralProjection.topCategorySpendMinor
                          )}.`
                        : "."}
                      {" "}Direct recurring links are not available here, so
                      fixed-bill overlap is possible in V1.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-5 text-white/40">
                      Expense transactions are not linked directly to recurring
                      items here, so fixed-bill overlap is possible in V1.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Money accounts"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <CreditCard className="h-4 w-4 shrink-0 text-white/44" />
            <p className="truncate text-sm font-semibold text-white/82">
              Accounts
            </p>
          </div>
          {loadError ? (
            <button
              type="button"
              onClick={() => void accountsQuery.refetch()}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-white/62 transition hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          ) : (
            <span className="text-[11px] font-medium text-white/34">
              {hasAccounts
                ? `${accounts.length} active`
                : "No active accounts yet"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/44">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading Money accounts...
          </div>
        ) : loadError ? (
          <div className="px-4 py-5">
            <p className="text-sm font-semibold text-red-100/78">
              Unable to load Money accounts
            </p>
            <p className="mt-1 text-xs leading-5 text-white/38">{loadError}</p>
          </div>
        ) : hasAccounts ? (
          <div className="space-y-2 p-3">
            {accounts.map((account) => {
              const isEditing = editingAccountId === account.id;
              return (
                <div key={account.id} className="space-y-2">
                  <AccountRow
                    account={account}
                    isEditing={isEditing}
                    onEdit={() => {
                      setAddOpen(false);
                      setFormError(null);
                      setEditingAccountId((current) =>
                        current === account.id ? null : account.id
                      );
                    }}
                  />
                  {isEditing ? (
                    <MoneyAccountForm
                      mode="edit"
                      initialState={getEditFormState(account)}
                      isSaving={savingMode === "edit"}
                      error={formError}
                      onCancel={() => {
                        setEditingAccountId(null);
                        setFormError(null);
                      }}
                      onSubmit={(form) => saveAccount("edit", form, account.id)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6">
            <p className="text-sm font-semibold text-white/76">
              Add your first account
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">
              Track manual balances first. Add checking, savings, cash, or a
              credit card balance to make this Money area useful.
            </p>
            <Button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-3 h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Account
            </Button>
          </div>
        )}
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Money transactions"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <ReceiptText className="h-4 w-4 shrink-0 text-white/44" />
            <p className="truncate text-sm font-semibold text-white/82">
              Transactions
            </p>
          </div>
          <div className="flex items-center gap-2">
            {transactionsQuery.isFetching && recentTransactions.length > 0 ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-white/34" />
            ) : null}
            {transactionsError ? (
              <button
                type="button"
                onClick={() => void transactionsQuery.refetch()}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-white/62 transition hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setTransactionError(null);
                  setTransactionFormOpen((open) => !open);
                }}
                disabled={!hasAccounts}
                className="h-9 rounded-xl border border-white/[0.09] bg-white/[0.055] px-3 text-xs font-semibold text-white/80 hover:bg-white/[0.09]"
              >
                {transactionFormOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {transactionFormOpen ? "Close" : "Add"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b border-white/[0.055] p-3 sm:grid-cols-3">
          <MoneyMetricCard
            label="Income this month"
            value={formatMoneyFromMinor(monthMetrics.income)}
            detail="Posted inflows"
          />
          <MoneyMetricCard
            label="Spent this month"
            value={formatMoneyFromMinor(monthMetrics.spent)}
            detail="Posted outflows"
          />
          <MoneyMetricCard
            label="Net cash flow"
            value={formatMoneyFromMinor(monthMetrics.net)}
            detail="Income minus spend"
          />
        </div>

        {transactionFormOpen ? (
          <div className="border-b border-white/[0.055] p-3">
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
        ) : transactionError ? (
          <div className="border-b border-white/[0.055] px-4 py-3">
            <p className="rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
              {transactionError}
            </p>
          </div>
        ) : null}

        {transactionsLoading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/44">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading transactions...
          </div>
        ) : transactionsError ? (
          <div className="px-4 py-5">
            <p className="text-sm font-semibold text-red-100/78">
              Unable to load transactions
            </p>
            <p className="mt-1 text-xs leading-5 text-white/38">
              {transactionsError}
            </p>
          </div>
        ) : recentTransactions.length > 0 ? (
          <div className="space-y-2 p-3">
            {recentTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                accountName={
                  accountNameById[transaction.account_id] ?? "Unknown account"
                }
                categoryName={
                  transaction.category_id
                    ? categoryNameById[transaction.category_id] ?? null
                    : null
                }
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-6">
            <p className="text-sm font-semibold text-white/76">
              No transactions yet
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">
              Add posted income or expenses manually after creating an account.
            </p>
            <Button
              type="button"
              onClick={() => {
                setTransactionError(null);
                setTransactionFormOpen(true);
              }}
              disabled={!hasAccounts}
              className="mt-3 h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Transaction
            </Button>
          </div>
        )}
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Upcoming recurring Money items"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-white/44" />
            <p className="truncate text-sm font-semibold text-white/82">
              Upcoming
            </p>
          </div>
          <div className="flex items-center gap-2">
            {recurringItemsQuery.isFetching && upcomingRecurringItems.length > 0 ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-white/34" />
            ) : null}
            {recurringItemsError ? (
              <button
                type="button"
                onClick={() => void recurringItemsQuery.refetch()}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-white/62 transition hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setEditingRecurringId(null);
                  setRecurringError(null);
                  setRecurringFormOpen((open) => !open);
                }}
                className="h-9 rounded-xl border border-white/[0.09] bg-white/[0.055] px-3 text-xs font-semibold text-white/80 hover:bg-white/[0.09]"
              >
                {recurringFormOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {recurringFormOpen ? "Close" : "Add"}
              </Button>
            )}
          </div>
        </div>

        {recurringFormOpen ? (
          <div className="border-b border-white/[0.055] p-3">
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
        ) : recurringError && !editingRecurringId ? (
          <div className="border-b border-white/[0.055] px-4 py-3">
            <p className="rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
              {recurringError}
            </p>
          </div>
        ) : null}

        {recurringItemsLoading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/44">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading upcoming items...
          </div>
        ) : recurringItemsError ? (
          <div className="px-4 py-5">
            <p className="text-sm font-semibold text-red-100/78">
              Unable to load upcoming items
            </p>
            <p className="mt-1 text-xs leading-5 text-white/38">
              {recurringItemsError}
            </p>
          </div>
        ) : upcomingRecurringItems.length > 0 ? (
          <div className="space-y-2 p-3">
            {upcomingRecurringItems.map(({ item, nextDate }) => {
              const isEditing = editingRecurringId === item.id;
              return (
                <div key={item.id} className="space-y-2">
                  <RecurringItemRow
                    item={item}
                    nextDate={nextDate}
                    accountName={
                      item.account_id
                        ? accountNameById[item.account_id] ?? "Unknown account"
                        : null
                    }
                    categoryName={
                      item.category_id
                        ? categoryNameById[item.category_id] ?? null
                        : null
                    }
                    isEditing={isEditing}
                    onEdit={() => {
                      setRecurringFormOpen(false);
                      setRecurringError(null);
                      setEditingRecurringId((current) =>
                        current === item.id ? null : item.id
                      );
                    }}
                  />
                  {isEditing ? (
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
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6">
            <p className="text-sm font-semibold text-white/76">
              No upcoming items yet
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">
              Add recurring bills or expected income as planning items. They do
              not create transactions or change balances.
            </p>
            <Button
              type="button"
              onClick={() => {
                setRecurringError(null);
                setRecurringFormOpen(true);
              }}
              className="mt-3 h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </Button>
          </div>
        )}
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#090909] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        aria-label="Monthly Money budgets"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.055] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <PiggyBank className="h-4 w-4 shrink-0 text-white/44" />
            <p className="truncate text-sm font-semibold text-white/82">
              Budget
            </p>
          </div>
          <div className="flex items-center gap-2">
            {budgetsQuery.isFetching && budgetRows.length > 0 ? (
              <LoaderCircle className="h-4 w-4 animate-spin text-white/34" />
            ) : null}
            {budgetsError ? (
              <button
                type="button"
                onClick={() => void budgetsQuery.refetch()}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-semibold text-white/62 transition hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setEditingBudgetId(null);
                  setBudgetError(null);
                  setBudgetFormOpen((open) => !open);
                }}
                disabled={!hasUnbudgetedExpenseCategories}
                className="h-9 rounded-xl border border-white/[0.09] bg-white/[0.055] px-3 text-xs font-semibold text-white/80 hover:bg-white/[0.09]"
              >
                {budgetFormOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {budgetFormOpen ? "Close" : "Add"}
              </Button>
            )}
          </div>
        </div>

        {budgetRows.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 border-b border-white/[0.055] p-3 sm:grid-cols-3">
            <MoneyMetricCard
              label="Budgeted"
              value={formatMoneyFromMinor(budgetSummary.limit)}
              detail="Total limits"
            />
            <MoneyMetricCard
              label="Spent"
              value={formatMoneyFromMinor(budgetSummary.spent)}
              detail="Budgeted categories"
            />
            <MoneyMetricCard
              label="Remaining"
              value={formatMoneyFromMinor(budgetSummary.remaining)}
              detail="Limits minus spend"
            />
          </div>
        ) : null}

        {budgetFormOpen ? (
          <div className="border-b border-white/[0.055] p-3">
            <MoneyBudgetForm
              mode="add"
              initialState={getDefaultBudgetFormState(
                expenseCategories,
                budgetedCategoryIds
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
        ) : budgetError && !editingBudgetId ? (
          <div className="border-b border-white/[0.055] px-4 py-3">
            <p className="rounded-xl border border-red-200/10 bg-red-200/[0.035] px-3 py-2 text-xs font-medium text-red-100/78">
              {budgetError}
            </p>
          </div>
        ) : null}

        {budgetsLoading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/44">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading budgets...
          </div>
        ) : budgetsError ? (
          <div className="px-4 py-5">
            <p className="text-sm font-semibold text-red-100/78">
              Unable to load budgets
            </p>
            <p className="mt-1 text-xs leading-5 text-white/38">
              {budgetsError}
            </p>
          </div>
        ) : budgetRows.length > 0 ? (
          <div className="space-y-2 p-3">
            {budgetRows.map((row) => {
              const isEditing = editingBudgetId === row.budget.id;
              return (
                <div key={row.budget.id} className="space-y-2">
                  <BudgetRow
                    row={row}
                    isEditing={isEditing}
                    onEdit={() => {
                      setBudgetFormOpen(false);
                      setBudgetError(null);
                      setEditingBudgetId((current) =>
                        current === row.budget.id ? null : row.budget.id
                      );
                    }}
                  />
                  {isEditing ? (
                    <MoneyBudgetForm
                      mode="edit"
                      initialState={getEditBudgetFormState(row.budget)}
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
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6">
            <p className="text-sm font-semibold text-white/76">
              No budgets for this month
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">
              Add limits for active expense categories to compare current-month
              spending against plan.
            </p>
            <Button
              type="button"
              onClick={() => {
                setBudgetError(null);
                setBudgetFormOpen(true);
              }}
              disabled={!hasUnbudgetedExpenseCategories}
              className="mt-3 h-10 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Budget
            </Button>
            {!hasUnbudgetedExpenseCategories ? (
              <p className="mt-2 text-[11px] leading-4 text-white/36">
                Create an active expense category first, or edit an existing
                budget if every expense category already has one.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
