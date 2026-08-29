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
  ChevronRight,
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

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowser } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "cash_app"
  | "venmo"
  | "apple_cash"
  | "credit_card"
  | "other";
type TransactionKind = "expense" | "income";
type Direction = "inflow" | "outflow";
type RecurringFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "quarterly"
  | "yearly";
type MoneyTab = "activity" | "budget" | "forecast";
type EditorKind = "account" | "transaction" | "budget" | "scheduled" | null;

type AccountRow = {
  id: string;
  user_id: string;
  name: string | null;
  account_type: string | null;
  balance_minor: number | string | null;
  currency_code: string | null;
  balance_as_of: string | null;
  source: string | null;
  institution_name: string | null;
  is_active: boolean | null;
  archived_at: string | null;
  created_at: string | null;
};

type CategoryRow = {
  id: string;
  user_id: string;
  name: string | null;
  category_type: string | null;
  archived_at: string | null;
  created_at: string | null;
};

type BudgetRow = {
  id: string;
  user_id: string;
  category_id: string;
  budget_month: string;
  limit_amount_minor: number | string;
  currency_code: string | null;
  created_at: string | null;
};

type TransactionRow = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: string;
  direction: string;
  amount_minor: number | string;
  currency_code: string | null;
  transaction_date: string;
  description: string;
  note: string | null;
  status: string | null;
  created_at: string | null;
  reconciled_to_transaction_id: string | null;
  excluded_from_analytics: boolean | null;
};

type RecurringRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  category_id: string | null;
  name: string;
  direction: string;
  amount_minor: number | string;
  currency_code: string | null;
  frequency: string;
  anchor_date: string;
  end_date: string | null;
  is_active: boolean | null;
  note: string | null;
  created_at: string | null;
};

type QueryError = { message?: string };
type QueryResult<T> = { data: T | null; error: QueryError | null };
type SelectValue = string | boolean | number;
type SelectBuilder<T> = PromiseLike<QueryResult<T[]>> & {
  eq: (column: string, value: SelectValue) => SelectBuilder<T>;
  is: (column: string, value: null) => SelectBuilder<T>;
  in: (column: string, values: SelectValue[]) => SelectBuilder<T>;
  gte: (column: string, value: string | number) => SelectBuilder<T>;
  lt: (column: string, value: string | number) => SelectBuilder<T>;
  order: (column: string, options: { ascending: boolean }) => SelectBuilder<T>;
  limit: (count: number) => SelectBuilder<T>;
};
type MutationBuilder = PromiseLike<QueryResult<null>> & {
  eq: (column: string, value: string) => MutationBuilder;
};

type AccountMutation = {
  user_id?: string;
  name?: string;
  account_type?: AccountType;
  balance_minor?: number;
  currency_code?: "USD";
  balance_as_of?: string;
  source?: "manual";
  institution_name?: string | null;
  is_active?: boolean;
};
type CategoryMutation = {
  id?: string;
  user_id?: string;
  name?: string;
  category_type?: "expense";
};
type BudgetMutation = {
  user_id?: string;
  category_id?: string;
  budget_month?: string;
  limit_amount_minor?: number;
  currency_code?: "USD";
};
type RecurringMutation = {
  user_id?: string;
  account_id?: string | null;
  category_id?: string | null;
  name?: string;
  direction?: Direction;
  amount_minor?: number;
  currency_code?: "USD";
  frequency?: RecurringFrequency;
  anchor_date?: string;
  is_active?: boolean;
  source?: "manual";
  note?: string | null;
};
type TransactionRpcArgs = {
  p_account_id: string;
  p_category_id: string | null;
  p_transaction_type: TransactionKind;
  p_direction: Direction;
  p_amount_minor: number;
  p_transaction_date: string;
  p_description: string;
  p_note: string | null;
};

type AccountsClient = {
  select: (columns: string) => SelectBuilder<AccountRow>;
  insert: (payload: AccountMutation) => MutationBuilder;
  update: (payload: AccountMutation) => MutationBuilder;
};
type CategoriesClient = {
  select: (columns: string) => SelectBuilder<CategoryRow>;
  insert: (payload: CategoryMutation) => MutationBuilder;
  delete: () => MutationBuilder;
};
type BudgetsClient = {
  select: (columns: string) => SelectBuilder<BudgetRow>;
  insert: (payload: BudgetMutation) => MutationBuilder;
  update: (payload: BudgetMutation) => MutationBuilder;
};
type TransactionsClient = {
  select: (columns: string) => SelectBuilder<TransactionRow>;
};
type RecurringClient = {
  select: (columns: string) => SelectBuilder<RecurringRow>;
  insert: (payload: RecurringMutation) => MutationBuilder;
  update: (payload: RecurringMutation) => MutationBuilder;
};
type MoneyDb = {
  from: {
    (table: "money_accounts"): AccountsClient;
    (table: "money_categories"): CategoriesClient;
    (table: "money_budgets"): BudgetsClient;
    (table: "money_transactions"): TransactionsClient;
    (table: "money_recurring_items"): RecurringClient;
  };
  rpc: (
    fn: "create_manual_money_transaction",
    args: TransactionRpcArgs
  ) => PromiseLike<QueryResult<null>>;
};

const ACCOUNT_TYPES = [
  ["checking", "Checking"],
  ["savings", "Savings"],
  ["cash", "Cash"],
  ["cash_app", "Cash App"],
  ["venmo", "Venmo"],
  ["apple_cash", "Apple Cash"],
  ["credit_card", "Credit Card"],
  ["other", "Other"],
] as const satisfies ReadonlyArray<readonly [AccountType, string]>;
const ACCOUNT_TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPES) as Record<
  AccountType,
  string
>;
const LIQUID_ACCOUNT_TYPES = new Set<AccountType>([
  "checking",
  "cash",
  "cash_app",
  "venmo",
  "apple_cash",
  "other",
]);
const FREQUENCIES = [
  ["weekly", "Weekly"],
  ["biweekly", "Biweekly"],
  ["semimonthly", "Twice monthly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["yearly", "Yearly"],
] as const satisfies ReadonlyArray<readonly [RecurringFrequency, string]>;
const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES) as Record<
  RecurringFrequency,
  string
>;
const NO_CATEGORY = "__none__";
const NO_ACCOUNT = "__none__";
const HORIZONS = [7, 30, 90] as const;
type Horizon = (typeof HORIZONS)[number];

function moneyDb(
  client: NonNullable<ReturnType<typeof getSupabaseBrowser>>
): MoneyDb {
  return client as unknown as MoneyDb;
}

function normalizeMinor(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }
  return 0;
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value / 100);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function parseDollars(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized || normalized.includes("-") || !/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }
  const [whole = "0", decimals = ""] = normalized.split(".");
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, "0").slice(0, 2));
  return Number.isSafeInteger(minor) ? minor : null;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? { year, month, day } : null;
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(value: string, days: number) {
  const parts = dateParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day + days);
  return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function dayDifference(start: string, end: string) {
  const a = dateParts(start);
  const b = dateParts(end);
  if (!a || !b) return null;
  return Math.floor(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      86_400_000
  );
}

function compactDate(value: string) {
  const parts = dateParts(value);
  if (!parts) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(parts.year, parts.month - 1, parts.day)
  );
}

function readableDate(value: string) {
  const parts = dateParts(value);
  if (!parts) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parts.year, parts.month - 1, parts.day));
}

function monthRange() {
  const now = new Date();
  return {
    start: formatDate(now.getFullYear(), now.getMonth() + 1, 1),
    next: formatDate(now.getFullYear(), now.getMonth() + 2, 1),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function addMonthsFromAnchor(
  anchor: { year: number; month: number; day: number },
  count: number
) {
  const zeroMonth = anchor.month - 1 + count;
  const year = anchor.year + Math.floor(zeroMonth / 12);
  const monthIndex = ((zeroMonth % 12) + 12) % 12;
  const month = monthIndex + 1;
  return formatDate(year, month, Math.min(anchor.day, daysInMonth(year, month)));
}

function semimonthlyDates(
  anchor: { year: number; month: number; day: number },
  monthOffset: number
) {
  const zeroMonth = anchor.month - 1 + monthOffset;
  const year = anchor.year + Math.floor(zeroMonth / 12);
  const monthIndex = ((zeroMonth % 12) + 12) % 12;
  const month = monthIndex + 1;
  const last = daysInMonth(year, month);
  const firstDay = Math.min(anchor.day, last);
  const secondDay = anchor.day <= 15 ? Math.min(anchor.day + 15, last) : Math.max(1, anchor.day - 15);
  return Array.from(new Set([firstDay, secondDay]))
    .sort((a, b) => a - b)
    .map((day) => formatDate(year, month, day));
}

function occurrences({
  anchorDate,
  frequency,
  endDate,
  rangeStart,
  rangeEnd,
}: {
  anchorDate: string;
  frequency: string;
  endDate?: string | null;
  rangeStart: string;
  rangeEnd: string;
}) {
  const anchor = dateParts(anchorDate);
  const start = dateParts(rangeStart);
  if (!anchor || !start || rangeEnd < rangeStart || (endDate && endDate < rangeStart)) {
    return [] as string[];
  }
  const effectiveEnd = endDate && endDate < rangeEnd ? endDate : rangeEnd;
  if (effectiveEnd < anchorDate) return [] as string[];

  if (frequency === "weekly" || frequency === "biweekly") {
    const interval = frequency === "weekly" ? 7 : 14;
    const diff = dayDifference(anchorDate, rangeStart) ?? 0;
    let periods = diff <= 0 ? 0 : Math.ceil(diff / interval);
    const found: string[] = [];
    let candidate = addDays(anchorDate, periods * interval);
    while (candidate && candidate <= effectiveEnd) {
      if (candidate >= rangeStart && candidate >= anchorDate) found.push(candidate);
      periods += 1;
      candidate = addDays(anchorDate, periods * interval);
    }
    return found;
  }

  if (frequency === "monthly" || frequency === "quarterly" || frequency === "yearly") {
    const interval = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
    const months = (start.year - anchor.year) * 12 + (start.month - anchor.month);
    let periods = Math.max(0, Math.floor(months / interval));
    let candidate = addMonthsFromAnchor(anchor, periods * interval);
    while (candidate < rangeStart) {
      periods += 1;
      candidate = addMonthsFromAnchor(anchor, periods * interval);
    }
    const found: string[] = [];
    while (candidate <= effectiveEnd) {
      if (candidate >= anchorDate) found.push(candidate);
      periods += 1;
      candidate = addMonthsFromAnchor(anchor, periods * interval);
    }
    return found;
  }

  if (frequency === "semimonthly") {
    const months = (start.year - anchor.year) * 12 + (start.month - anchor.month);
    let offset = Math.max(0, months - 1);
    const found: string[] = [];
    while (true) {
      const monthDates = semimonthlyDates(anchor, offset);
      found.push(
        ...monthDates.filter(
          (date) =>
            date >= anchorDate && date >= rangeStart && date <= effectiveEnd
        )
      );
      const last = monthDates[monthDates.length - 1];
      if (!last || last > effectiveEnd) break;
      offset += 1;
    }
    return Array.from(new Set(found)).sort();
  }

  return [] as string[];
}

function nextOccurrence(item: RecurringRow, today: string) {
  if (item.end_date && item.end_date < today) return null;
  const end = item.end_date ?? addDays(today, 370) ?? today;
  return (
    occurrences({
      anchorDate: item.anchor_date,
      frequency: item.frequency,
      endDate: item.end_date,
      rangeStart: today,
      rangeEnd: end,
    })[0] ?? null
  );
}

function normalizeAccountType(value: string | null): AccountType {
  return ACCOUNT_TYPES.some(([type]) => type === value) ? (value as AccountType) : "other";
}

function normalizeFrequency(value: string): RecurringFrequency {
  return FREQUENCIES.some(([frequency]) => frequency === value)
    ? (value as RecurringFrequency)
    : "monthly";
}

async function loadAccounts(userId: string) {
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await moneyDb(client)
    .from("money_accounts")
    .select(
      "id,user_id,name,account_type,balance_minor,currency_code,balance_as_of,source,institution_name,is_active,archived_at,created_at"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load accounts.");
  return (data ?? []).filter((row) => row.user_id === userId);
}

async function loadCategories(userId: string) {
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await moneyDb(client)
    .from("money_categories")
    .select("id,user_id,name,category_type,archived_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load categories.");
  return (data ?? []).filter((row) => row.user_id === userId);
}

async function loadBudgets(userId: string, monthStart: string) {
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await moneyDb(client)
    .from("money_budgets")
    .select("id,user_id,category_id,budget_month,limit_amount_minor,currency_code,created_at")
    .eq("user_id", userId)
    .eq("budget_month", monthStart)
    .eq("currency_code", "USD")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load budgets.");
  return (data ?? []).filter((row) => row.user_id === userId);
}

async function loadRecentTransactions(userId: string) {
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await moneyDb(client)
    .from("money_transactions")
    .select(
      "id,user_id,account_id,category_id,transaction_type,direction,amount_minor,currency_code,transaction_date,description,note,status,created_at,reconciled_to_transaction_id,excluded_from_analytics"
    )
    .eq("user_id", userId)
    .eq("status", "posted")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message || "Unable to load activity.");
  return (data ?? []).filter((row) => row.user_id === userId);
}

async function loadMonthTransactions(userId: string, start: string, next: string) {
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await moneyDb(client)
    .from("money_transactions")
    .select(
      "id,user_id,account_id,category_id,transaction_type,direction,amount_minor,currency_code,transaction_date,description,note,status,created_at,reconciled_to_transaction_id,excluded_from_analytics"
    )
    .eq("user_id", userId)
    .eq("status", "posted")
    .is("reconciled_to_transaction_id", null)
    .eq("excluded_from_analytics", false)
    .gte("transaction_date", start)
    .lt("transaction_date", next)
    .in("transaction_type", ["income", "expense"]);
  if (error) throw new Error(error.message || "Unable to load month activity.");
  return (data ?? []).filter((row) => row.user_id === userId);
}

async function loadRecurring(userId: string) {
  const client = getSupabaseBrowser();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await moneyDb(client)
    .from("money_recurring_items")
    .select(
      "id,user_id,account_id,category_id,name,direction,amount_minor,currency_code,frequency,anchor_date,end_date,is_active,note,created_at"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("anchor_date", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load scheduled money.");
  return (data ?? []).filter((row) => row.user_id === userId);
}

type ProjectionPoint = { date: string; balanceMinor: number; changeMinor: number };
type Projection = {
  startBalanceMinor: number;
  endBalanceMinor: number;
  lowestBalanceMinor: number;
  lowestDate: string;
  inflowMinor: number;
  outflowMinor: number;
  points: ProjectionPoint[];
};

function buildProjection(
  accounts: AccountRow[],
  recurring: RecurringRow[],
  horizon: Horizon,
  today: string
): Projection {
  const end = addDays(today, horizon) ?? today;
  const startBalanceMinor = accounts.reduce(
    (sum, account) => sum + normalizeMinor(account.balance_minor),
    0
  );
  const changes = new Map<string, number>();
  let inflowMinor = 0;
  let outflowMinor = 0;
  const futureStart = addDays(today, 1) ?? today;

  for (const item of recurring) {
    if (item.is_active === false || (item.direction !== "inflow" && item.direction !== "outflow")) {
      continue;
    }
    const amount = Math.abs(normalizeMinor(item.amount_minor));
    if (!amount) continue;
    for (const date of occurrences({
      anchorDate: item.anchor_date,
      frequency: item.frequency,
      endDate: item.end_date,
      rangeStart: futureStart,
      rangeEnd: end,
    })) {
      const signed = item.direction === "inflow" ? amount : -amount;
      changes.set(date, (changes.get(date) ?? 0) + signed);
      if (signed > 0) inflowMinor += amount;
      else outflowMinor += amount;
    }
  }

  let running = startBalanceMinor;
  const points: ProjectionPoint[] = [];
  for (let offset = 0; offset <= horizon; offset += 1) {
    const date = addDays(today, offset) ?? today;
    const changeMinor = changes.get(date) ?? 0;
    running += changeMinor;
    points.push({ date, balanceMinor: running, changeMinor });
  }
  const lowest = points.reduce(
    (candidate, point) => (point.balanceMinor < candidate.balanceMinor ? point : candidate),
    points[0] ?? { date: today, balanceMinor: startBalanceMinor, changeMinor: 0 }
  );
  return {
    startBalanceMinor,
    endBalanceMinor: points[points.length - 1]?.balanceMinor ?? startBalanceMinor,
    lowestBalanceMinor: lowest.balanceMinor,
    lowestDate: lowest.date,
    inflowMinor,
    outflowMinor,
    points,
  };
}

function buildSafeToSpend(accounts: AccountRow[], recurring: RecurringRow[], today: string) {
  const liquidMinor = accounts.reduce((sum, account) => {
    if (!LIQUID_ACCOUNT_TYPES.has(normalizeAccountType(account.account_type))) return sum;
    return sum + normalizeMinor(account.balance_minor);
  }, 0);
  const tomorrow = addDays(today, 1) ?? today;
  const inflows = recurring
    .filter((item) => item.is_active !== false && item.direction === "inflow")
    .map((item) => ({ item, date: nextOccurrence(item, tomorrow) }))
    .filter((entry): entry is { item: RecurringRow; date: string } => Boolean(entry.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextIncomeDate = inflows[0]?.date ?? null;
  const nextIncomeMinor = nextIncomeDate
    ? inflows.reduce(
        (sum, entry) =>
          entry.date === nextIncomeDate ? sum + Math.abs(normalizeMinor(entry.item.amount_minor)) : sum,
        0
      )
    : 0;
  const windowEnd = nextIncomeDate ?? addDays(today, 30) ?? today;
  const committedMinor = recurring
    .filter((item) => item.is_active !== false && item.direction === "outflow")
    .reduce((sum, item) => {
      const count = occurrences({
        anchorDate: item.anchor_date,
        frequency: item.frequency,
        endDate: item.end_date,
        rangeStart: tomorrow,
        rangeEnd: windowEnd,
      }).length;
      return sum + count * Math.abs(normalizeMinor(item.amount_minor));
    }, 0);
  return {
    liquidMinor,
    committedMinor,
    safeMinor: Math.max(0, liquidMinor - committedMinor),
    nextIncomeDate,
    nextIncomeMinor,
    windowEnd,
  };
}

function Sparkline({ points }: { points: ProjectionPoint[] }) {
  const width = 150;
  const height = 40;
  const values = points.map((point) => point.balanceMinor);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const path = points
    .map((point, index) => {
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - ((point.balanceMinor - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = (points[points.length - 1]?.balanceMinor ?? 0) >= (points[0]?.balanceMinor ?? 0);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-32" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke={rising ? "rgba(134,239,172,0.86)" : "rgba(254,202,202,0.82)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ForecastChart({ projection }: { projection: Projection }) {
  const gradientId = useId().replace(/:/g, "");
  const width = 640;
  const height = 170;
  const pad = { top: 12, right: 8, bottom: 28, left: 50 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const values = projection.points.map((point) => point.balanceMinor);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const range = Math.max(1, rawMax - rawMin);
  const min = rawMin - range * 0.08;
  const max = rawMax + range * 0.08;
  const span = Math.max(1, max - min);
  const x = (index: number) =>
    pad.left + (projection.points.length <= 1 ? 0 : index / (projection.points.length - 1)) * chartWidth;
  const y = (value: number) => pad.top + chartHeight - ((value - min) / span) * chartHeight;
  const path = projection.points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.balanceMinor).toFixed(1)}`)
    .join(" ");
  const area = projection.points.length
    ? `${path} L${x(projection.points.length - 1).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} Z`
    : "";
  const negative = projection.lowestBalanceMinor < 0;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="Scheduled balance forecast">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={negative ? "rgba(248,113,113,0.15)" : "rgba(134,239,172,0.12)"} />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.11)" strokeDasharray="4 6" />
      <text x={pad.left - 8} y={y(0) + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="10">$0</text>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={negative ? "rgba(254,202,202,0.9)" : "rgba(244,244,245,0.9)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {[0, projection.points.length - 1].map((index) => {
        const point = projection.points[index];
        return point ? (
          <text key={point.date} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : "end"} fill="rgba(255,255,255,0.38)" fontSize="10">
            {compactDate(point.date)}
          </text>
        ) : null;
      })}
    </svg>
  );
}

type AccountForm = { name: string; type: AccountType; balance: string; institution: string };
type TransactionForm = {
  kind: TransactionKind;
  amount: string;
  description: string;
  accountId: string;
  categoryId: string;
  date: string;
  note: string;
};
type BudgetForm = {
  categoryMode: "existing" | "create";
  categoryId: string;
  categoryName: string;
  limit: string;
};
type ScheduledForm = {
  kind: TransactionKind;
  name: string;
  amount: string;
  frequency: RecurringFrequency;
  date: string;
  accountId: string;
  categoryId: string;
  note: string;
};

function accountForm(account?: AccountRow): AccountForm {
  return account
    ? {
        name: account.name ?? "",
        type: normalizeAccountType(account.account_type),
        balance: (Math.abs(normalizeMinor(account.balance_minor)) / 100).toFixed(2),
        institution: account.institution_name ?? "",
      }
    : { name: "", type: "checking", balance: "", institution: "" };
}

function scheduledForm(item?: RecurringRow): ScheduledForm {
  return item
    ? {
        kind: item.direction === "inflow" ? "income" : "expense",
        name: item.name,
        amount: (Math.abs(normalizeMinor(item.amount_minor)) / 100).toFixed(2),
        frequency: normalizeFrequency(item.frequency),
        date: item.anchor_date,
        accountId: item.account_id ?? NO_ACCOUNT,
        categoryId: item.category_id ?? NO_CATEGORY,
        note: item.note ?? "",
      }
    : {
        kind: "expense",
        name: "",
        amount: "",
        frequency: "monthly",
        date: todayString(),
        accountId: NO_ACCOUNT,
        categoryId: NO_CATEGORY,
        note: "",
      };
}

function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; detail?: string; tone?: "good" | "bad" }>;
}) {
  return (
    <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-white/[0.075] bg-black/20">
      {items.map((item, index) => (
        <div key={item.label} className={cn("min-w-0 px-3 py-3", index > 0 && "border-l border-white/[0.065]")}> 
          <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/38">{item.label}</dt>
          <dd className={cn("mt-1 truncate text-base font-semibold tabular-nums tracking-tight text-white/88 sm:text-lg", item.tone === "good" && "text-emerald-200/85", item.tone === "bad" && "text-red-200/82")}>{item.value}</dd>
          {item.detail ? <dd className="mt-0.5 hidden truncate text-[10px] text-white/32 sm:block">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-6">
      <p className="text-sm font-semibold text-white/80">{title}</p>
      <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">{detail}</p>
    </div>
  );
}

export function MoneyAreaDashboardV2() {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const range = useMemo(() => monthRange(), []);
  const today = todayString();
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<MoneyTab>("budget");
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorKind>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [accountDraft, setAccountDraft] = useState<AccountForm>(() => accountForm());
  const [transactionDraft, setTransactionDraft] = useState<TransactionForm>(() => ({
    kind: "expense",
    amount: "",
    description: "",
    accountId: "",
    categoryId: NO_CATEGORY,
    date: todayString(),
    note: "",
  }));
  const [budgetDraft, setBudgetDraft] = useState<BudgetForm>({
    categoryMode: "create",
    categoryId: "",
    categoryName: "",
    limit: "",
  });
  const [scheduledDraft, setScheduledDraft] = useState<ScheduledForm>(() => scheduledForm());

  useEffect(() => {
    let cancelled = false;
    async function resolveUser() {
      if (!supabase) {
        setAuthError("Supabase is not configured.");
        return;
      }
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) {
        setAuthError(error.message);
        return;
      }
      setUserId(data.user?.id ?? null);
    }
    void resolveUser();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const editorActive = Boolean(editor || editingAccountId || editingBudgetId || editingScheduledId);
    document.body.classList.toggle("fab-panel-active", editorActive);
    return () => document.body.classList.remove("fab-panel-active");
  }, [editor, editingAccountId, editingBudgetId, editingScheduledId]);

  const accountsQuery = useQuery({
    queryKey: ["money-v2", "accounts", userId],
    queryFn: () => loadAccounts(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  const categoriesQuery = useQuery({
    queryKey: ["money-v2", "categories", userId],
    queryFn: () => loadCategories(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  const budgetsQuery = useQuery({
    queryKey: ["money-v2", "budgets", userId, range.start],
    queryFn: () => loadBudgets(userId!, range.start),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  const recentQuery = useQuery({
    queryKey: ["money-v2", "recent", userId],
    queryFn: () => loadRecentTransactions(userId!),
    enabled: Boolean(userId),
    staleTime: 20_000,
  });
  const monthQuery = useQuery({
    queryKey: ["money-v2", "month", userId, range.start],
    queryFn: () => loadMonthTransactions(userId!, range.start, range.next),
    enabled: Boolean(userId),
    staleTime: 20_000,
  });
  const recurringQuery = useQuery({
    queryKey: ["money-v2", "recurring", userId],
    queryFn: () => loadRecurring(userId!),
    enabled: Boolean(userId),
    staleTime: 20_000,
  });

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];
  const recent = recentQuery.data ?? [];
  const monthTransactions = monthQuery.data ?? [];
  const recurring = recurringQuery.data ?? [];
  const expenseCategories = categories.filter(
    (category) => category.category_type === "expense" && !category.archived_at
  );
  const accountNames = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name?.trim() || "Untitled account"])),
    [accounts]
  );
  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name?.trim() || "Untitled category"])),
    [categories]
  );

  const summary = useMemo(() => {
    return accounts.reduce(
      (totals, account) => {
        const balance = normalizeMinor(account.balance_minor);
        const type = normalizeAccountType(account.account_type);
        totals.net += balance;
        if (type === "credit_card") {
          if (balance < 0) {
            totals.debt += Math.abs(balance);
            totals.debtAccounts += 1;
          }
        } else {
          totals.available += balance;
          totals.assetAccounts += 1;
        }
        if (LIQUID_ACCOUNT_TYPES.has(type)) {
          totals.cash += balance;
          totals.cashAccounts += 1;
        }
        return totals;
      },
      { available: 0, cash: 0, debt: 0, net: 0, assetAccounts: 0, cashAccounts: 0, debtAccounts: 0 }
    );
  }, [accounts]);
  const safe = useMemo(() => buildSafeToSpend(accounts, recurring, today), [accounts, recurring, today]);
  const projection = useMemo(
    () => buildProjection(accounts, recurring, horizon, today),
    [accounts, recurring, horizon, today]
  );
  const upcoming = useMemo(
    () =>
      recurring
        .map((item) => ({ item, date: nextOccurrence(item, today) }))
        .filter((entry): entry is { item: RecurringRow; date: string } => Boolean(entry.date))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [recurring, today]
  );
  const monthMetrics = useMemo(
    () =>
      monthTransactions.reduce(
        (totals, transaction) => {
          const amount = Math.abs(normalizeMinor(transaction.amount_minor));
          if (transaction.transaction_type === "income") totals.income += amount;
          if (transaction.transaction_type === "expense") totals.spent += amount;
          totals.net = totals.income - totals.spent;
          return totals;
        },
        { income: 0, spent: 0, net: 0 }
      ),
    [monthTransactions]
  );
  const budgetRows = useMemo(
    () =>
      budgets
        .map((budget) => {
          const category = expenseCategories.find((candidate) => candidate.id === budget.category_id);
          if (!category) return null;
          const limit = normalizeMinor(budget.limit_amount_minor);
          const spent = monthTransactions.reduce((sum, transaction) => {
            const match =
              transaction.transaction_type === "expense" &&
              transaction.category_id === budget.category_id &&
              transaction.status === "posted" &&
              transaction.reconciled_to_transaction_id === null &&
              transaction.excluded_from_analytics !== true;
            return match ? sum + Math.abs(normalizeMinor(transaction.amount_minor)) : sum;
          }, 0);
          return {
            budget,
            name: category.name?.trim() || "Untitled category",
            limit,
            spent,
            left: limit - spent,
            percent: limit > 0 ? spent / limit : 0,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [budgets, expenseCategories, monthTransactions]
  );
  const budgetSummary = useMemo(
    () =>
      budgetRows.reduce(
        (totals, row) => ({
          limit: totals.limit + row.limit,
          spent: totals.spent + row.spent,
          left: totals.left + row.left,
        }),
        { limit: 0, spent: 0, left: 0 }
      ),
    [budgetRows]
  );
  const budgetedCategoryIds = useMemo(
    () => new Set(budgets.map((budget) => budget.category_id)),
    [budgets]
  );
  const availableBudgetCategories = expenseCategories.filter(
    (category) => !budgetedCategoryIds.has(category.id)
  );

  const anyError =
    authError ??
    (accountsQuery.error instanceof Error ? accountsQuery.error.message : null) ??
    (recurringQuery.error instanceof Error ? recurringQuery.error.message : null);

  const invalidate = useCallback(
    async (groups: string[]) => {
      if (!userId) return;
      await Promise.all(
        groups.map((group) =>
          queryClient.invalidateQueries({ queryKey: ["money-v2", group, userId] })
        )
      );
    },
    [queryClient, userId]
  );

  function closeEditors() {
    setEditor(null);
    setEditingAccountId(null);
    setEditingBudgetId(null);
    setEditingScheduledId(null);
    setFormError(null);
  }

  function openAccount(account?: AccountRow) {
    setAccountsOpen(true);
    setEditingAccountId(account?.id ?? null);
    setAccountDraft(accountForm(account));
    setEditor("account");
    setFormError(null);
  }

  function openTransaction() {
    setTransactionDraft({
      kind: "expense",
      amount: "",
      description: "",
      accountId: accounts[0]?.id ?? "",
      categoryId: NO_CATEGORY,
      date: todayString(),
      note: "",
    });
    setEditor("transaction");
    setFormError(null);
  }

  function openBudget(row?: (typeof budgetRows)[number]) {
    if (row) {
      setEditingBudgetId(row.budget.id);
      setBudgetDraft({
        categoryMode: "existing",
        categoryId: row.budget.category_id,
        categoryName: "",
        limit: (row.limit / 100).toFixed(2),
      });
    } else {
      const first = availableBudgetCategories[0];
      setEditingBudgetId(null);
      setBudgetDraft({
        categoryMode: first ? "existing" : "create",
        categoryId: first?.id ?? "",
        categoryName: "",
        limit: "",
      });
    }
    setEditor("budget");
    setFormError(null);
  }

  function openScheduled(item?: RecurringRow) {
    setEditingScheduledId(item?.id ?? null);
    setScheduledDraft(scheduledForm(item));
    setEditor("scheduled");
    setFormError(null);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId || saving) return;
    const name = accountDraft.name.trim();
    const amount = parseDollars(accountDraft.balance);
    if (!name) return setFormError("Add an account name.");
    if (amount === null) return setFormError("Enter a valid current balance.");
    setSaving(true);
    setFormError(null);
    try {
      const payload: AccountMutation = {
        name,
        account_type: accountDraft.type,
        balance_minor:
          accountDraft.type === "credit_card" ? -Math.abs(amount) : Math.abs(amount),
        currency_code: "USD",
        balance_as_of: todayString(),
        institution_name: accountDraft.institution.trim() || null,
      };
      const db = moneyDb(supabase);
      const result = editingAccountId
        ? await db
            .from("money_accounts")
            .update(payload)
            .eq("id", editingAccountId)
            .eq("user_id", userId)
        : await db.from("money_accounts").insert({
            ...payload,
            user_id: userId,
            source: "manual",
            is_active: true,
          });
      if (result.error) throw new Error(result.error.message || "Unable to save account.");
      await invalidate(["accounts"]);
      closeEditors();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save account.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId || saving) return;
    const amount = parseDollars(transactionDraft.amount);
    const description = transactionDraft.description.trim();
    const account = accounts.find((candidate) => candidate.id === transactionDraft.accountId);
    const category =
      transactionDraft.categoryId === NO_CATEGORY
        ? null
        : categories.find(
            (candidate) =>
              candidate.id === transactionDraft.categoryId &&
              candidate.category_type === transactionDraft.kind &&
              !candidate.archived_at
          ) ?? null;
    if (amount === null || amount <= 0) return setFormError("Enter an amount greater than zero.");
    if (!description) return setFormError("Add a description.");
    if (!account) return setFormError("Choose an account.");
    if (transactionDraft.categoryId !== NO_CATEGORY && !category) {
      return setFormError("Choose a matching category or No category.");
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await moneyDb(supabase).rpc("create_manual_money_transaction", {
        p_account_id: account.id,
        p_category_id: category?.id ?? null,
        p_transaction_type: transactionDraft.kind,
        p_direction: transactionDraft.kind === "expense" ? "outflow" : "inflow",
        p_amount_minor: amount,
        p_transaction_date: transactionDraft.date,
        p_description: description,
        p_note: transactionDraft.note.trim() || null,
      });
      if (result.error) throw new Error(result.error.message || "Unable to save transaction.");
      await invalidate(["accounts", "recent", "month"]);
      closeEditors();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save transaction.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId || saving) return;
    const limit = parseDollars(budgetDraft.limit);
    if (limit === null) return setFormError("Enter a valid monthly limit.");
    setSaving(true);
    setFormError(null);
    let createdCategoryId: string | null = null;
    try {
      const db = moneyDb(supabase);
      if (editingBudgetId) {
        const result = await db
          .from("money_budgets")
          .update({ limit_amount_minor: limit })
          .eq("id", editingBudgetId)
          .eq("user_id", userId);
        if (result.error) throw new Error(result.error.message || "Unable to update budget.");
      } else {
        let categoryId = budgetDraft.categoryId;
        if (budgetDraft.categoryMode === "create") {
          const categoryName = budgetDraft.categoryName.trim();
          if (!categoryName) throw new Error("Add a category name.");
          const matching = expenseCategories.find(
            (category) => category.name?.trim().toLowerCase() === categoryName.toLowerCase()
          );
          if (matching) {
            if (budgetedCategoryIds.has(matching.id)) {
              throw new Error("That category already has a budget this month.");
            }
            categoryId = matching.id;
          } else {
            categoryId = crypto.randomUUID();
            createdCategoryId = categoryId;
            const categoryResult = await db.from("money_categories").insert({
              id: categoryId,
              user_id: userId,
              name: categoryName,
              category_type: "expense",
            });
            if (categoryResult.error) {
              throw new Error(categoryResult.error.message || "Unable to create category.");
            }
          }
        }
        if (!categoryId) throw new Error("Choose or create a category.");
        if (budgetedCategoryIds.has(categoryId)) {
          throw new Error("That category already has a budget this month.");
        }
        const budgetResult = await db.from("money_budgets").insert({
          user_id: userId,
          category_id: categoryId,
          budget_month: range.start,
          limit_amount_minor: limit,
          currency_code: "USD",
        });
        if (budgetResult.error) {
          if (createdCategoryId) {
            await db
              .from("money_categories")
              .delete()
              .eq("id", createdCategoryId)
              .eq("user_id", userId);
          }
          throw new Error(budgetResult.error.message || "Unable to create budget.");
        }
      }
      await invalidate(["budgets", "categories"]);
      closeEditors();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save budget.");
    } finally {
      setSaving(false);
    }
  }

  async function saveScheduled(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId || saving) return;
    const amount = parseDollars(scheduledDraft.amount);
    const name = scheduledDraft.name.trim();
    const account =
      scheduledDraft.accountId === NO_ACCOUNT
        ? null
        : accounts.find((candidate) => candidate.id === scheduledDraft.accountId) ?? null;
    const category =
      scheduledDraft.categoryId === NO_CATEGORY
        ? null
        : categories.find(
            (candidate) =>
              candidate.id === scheduledDraft.categoryId &&
              candidate.category_type === scheduledDraft.kind &&
              !candidate.archived_at
          ) ?? null;
    if (!name) return setFormError("Add a name.");
    if (amount === null || amount <= 0) return setFormError("Enter an amount greater than zero.");
    if (scheduledDraft.accountId !== NO_ACCOUNT && !account) return setFormError("Choose a valid account.");
    if (scheduledDraft.categoryId !== NO_CATEGORY && !category) {
      return setFormError("Choose a matching category or No category.");
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: RecurringMutation = {
        account_id: account?.id ?? null,
        category_id: category?.id ?? null,
        name,
        direction: scheduledDraft.kind === "expense" ? "outflow" : "inflow",
        amount_minor: amount,
        currency_code: "USD",
        frequency: scheduledDraft.frequency,
        anchor_date: scheduledDraft.date,
        note: scheduledDraft.note.trim() || null,
      };
      const db = moneyDb(supabase);
      const result = editingScheduledId
        ? await db
            .from("money_recurring_items")
            .update(payload)
            .eq("id", editingScheduledId)
            .eq("user_id", userId)
        : await db.from("money_recurring_items").insert({
            ...payload,
            user_id: userId,
            source: "manual",
            is_active: true,
          });
      if (result.error) throw new Error(result.error.message || "Unable to save scheduled item.");
      await invalidate(["recurring"]);
      closeEditors();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save scheduled item.");
    } finally {
      setSaving(false);
    }
  }

  const panelClass =
    "overflow-hidden rounded-[26px] border border-white/[0.09] bg-[linear-gradient(145deg,#0b0c0f_0%,#08090b_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_45px_-32px_rgba(0,0,0,0.9)]";
  const matchingTransactionCategories = categories.filter(
    (category) => category.category_type === transactionDraft.kind && !category.archived_at
  );
  const matchingScheduledCategories = categories.filter(
    (category) => category.category_type === scheduledDraft.kind && !category.archived_at
  );

  return (
    <div className="space-y-3 pb-3">
      <section className={panelClass} aria-label="Money overview">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/70">Safe to Spend</p>
              <p className="mt-1 truncate text-[clamp(2.35rem,11vw,4rem)] font-semibold tabular-nums tracking-[-0.045em] text-white">
                {money(safe.safeMinor)}
              </p>
              <p className="mt-1 text-xs font-medium text-white/36">
                {safe.nextIncomeDate
                  ? `After scheduled bills through ${compactDate(safe.nextIncomeDate)}`
                  : `After scheduled bills through ${compactDate(safe.windowEnd)}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Select
                value={String(horizon)}
                onValueChange={(value) => setHorizon(Number(value) as Horizon)}
                triggerClassName="h-9 w-[74px] rounded-full border-white/10 bg-white/[0.035] px-3 text-xs font-semibold"
              >
                <SelectContent>
                  {HORIZONS.map((value) => (
                    <SelectItem key={value} value={String(value)}>{value}D</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Sparkline points={projection.points} />
            </div>
          </div>

          <div className="mt-4">
            <MetricStrip
              items={[
                { label: "Cash", value: money(safe.liquidMinor), detail: `${summary.cashAccounts} accounts`, tone: "good" },
                { label: "Debt", value: money(summary.debt), detail: `${summary.debtAccounts} accounts`, tone: summary.debt > 0 ? "bad" : undefined },
                { label: "Net", value: money(summary.net), detail: "Current position" },
              ]}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.055] pt-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/34">Accounts</p>
              <p className="mt-0.5 truncate text-xs text-white/44">
                {accounts.length ? `${accounts.length} active · ${money(summary.available)} available` : "No accounts yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAccountsOpen((open) => !open);
                closeEditors();
              }}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/68 transition hover:bg-white/[0.07] hover:text-white"
            >
              {accountsOpen ? "Hide" : accounts.length ? "Manage" : "Set up"}
            </button>
          </div>
        </div>
      </section>

      {accountsOpen ? (
        <section className={panelClass} aria-label="Money accounts">
          <div className="flex items-center justify-between border-b border-white/[0.065] px-4 py-3">
            <div className="flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-white/42" />
              <h2 className="text-sm font-semibold text-white/82">Accounts</h2>
            </div>
            <button type="button" onClick={() => openAccount()} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
          {editor === "account" ? (
            <form onSubmit={saveAccount} className="border-b border-white/[0.065] bg-black/20 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/64">{editingAccountId ? "Edit account" : "New account"}</p>
                <button type="button" onClick={closeEditors} className="p-1.5 text-white/42"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Account name</Label>
                  <Input autoFocus value={accountDraft.name} onChange={(event) => setAccountDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Main checking" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Type</Label>
                  <Select value={accountDraft.type} onValueChange={(value) => setAccountDraft((draft) => ({ ...draft, type: normalizeAccountType(value) }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]">
                    <SelectContent>{ACCOUNT_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Current balance</Label>
                  <Input inputMode="decimal" value={accountDraft.balance} onChange={(event) => setAccountDraft((draft) => ({ ...draft, balance: event.target.value }))} placeholder="0.00" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Institution</Label>
                  <Input value={accountDraft.institution} onChange={(event) => setAccountDraft((draft) => ({ ...draft, institution: event.target.value }))} placeholder="Optional" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" />
                </div>
              </div>
              {formError ? <p className="mt-3 text-xs text-red-200/80">{formError}</p> : null}
              <button disabled={saving} type="submit" className="mt-3 inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold text-black disabled:opacity-50">
                {saving ? "Saving…" : "Save account"}
              </button>
            </form>
          ) : null}
          {accountsQuery.isPending ? (
            <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/40"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading accounts…</div>
          ) : accounts.length ? (
            <div>{accounts.map((account) => (
              <button key={account.id} type="button" onClick={() => openAccount(account)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.055] px-4 py-3 text-left last:border-0">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white/82">{account.name?.trim() || "Untitled account"}</span><span className="mt-0.5 block truncate text-[11px] text-white/38">{ACCOUNT_TYPE_LABEL[normalizeAccountType(account.account_type)]}{account.institution_name ? ` · ${account.institution_name}` : ""}</span></span>
                <span className="flex items-center gap-2 font-mono text-sm font-semibold tabular-nums text-white/74">{money(normalizeMinor(account.balance_minor))}<PencilLine className="h-3.5 w-3.5 text-white/28" /></span>
              </button>
            ))}</div>
          ) : <EmptyState title="Add your first account" detail="Accounts are the source of truth for the money you actually have and owe." />}
        </section>
      ) : null}

      <section className={panelClass} aria-label="Upcoming scheduled money">
        <div className="flex items-center justify-between border-b border-white/[0.065] px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-white/42" />
            <div><h2 className="text-sm font-semibold text-white/82">Upcoming</h2><p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-white/30">Next scheduled money</p></div>
          </div>
          <button type="button" onClick={() => setTab("forecast")} className="text-xs font-semibold text-white/52">View all</button>
        </div>
        {recurringQuery.isPending ? (
          <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/40"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading scheduled money…</div>
        ) : upcoming.length ? (
          <div>{upcoming.slice(0, 3).map(({ item, date }) => {
            const isOutflow = item.direction === "outflow";
            const days = dayDifference(today, date) ?? 0;
            return (
              <button key={`${item.id}-${date}`} type="button" onClick={() => { setTab("forecast"); openScheduled(item); }} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.055] px-4 py-3 text-left last:border-0">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-full border", isOutflow ? "border-red-300/10 bg-red-300/[0.08] text-red-200/80" : "border-emerald-300/10 bg-emerald-300/[0.08] text-emerald-200/80")}>
                  {isOutflow ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                </span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white/84">{item.name}</span><span className="mt-0.5 block truncate text-[11px] text-white/38">{compactDate(date)}{item.account_id ? ` · ${accountNames[item.account_id] ?? "Unknown account"}` : ""}</span></span>
                <span className="text-right"><span className={cn("block font-mono text-sm font-semibold tabular-nums", isOutflow ? "text-red-200/82" : "text-emerald-200/84")}>{isOutflow ? "−" : "+"}{money(Math.abs(normalizeMinor(item.amount_minor)))}</span><span className="mt-0.5 block text-[10px] text-white/34">{days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span></span>
              </button>
            );
          })}</div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <div><p className="text-sm font-semibold text-white/76">Nothing scheduled yet</p><p className="mt-1 text-xs text-white/38">Add bills or expected income so Safe to Spend and Forecast have context.</p></div>
            <button type="button" onClick={() => { setTab("forecast"); openScheduled(); }} className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/70">Add</button>
          </div>
        )}
      </section>

      <section className={panelClass} aria-label="Money workspace">
        <div className="grid grid-cols-3 border-b border-white/[0.065] p-2">
          {(["activity", "budget", "forecast"] as const).map((value) => (
            <button key={value} type="button" onClick={() => { setTab(value); closeEditors(); }} className={cn("h-10 rounded-full text-xs font-semibold uppercase tracking-[0.08em] transition", tab === value ? "bg-white/[0.08] text-white" : "text-white/42 hover:text-white/70")} aria-pressed={tab === value}>
              {value}
            </button>
          ))}
        </div>

        {tab === "activity" ? (
          <div>
            <div className="flex items-center justify-between px-4 py-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">This month</p><p className="mt-0.5 text-xs text-white/42">What actually happened</p></div>
              <button type="button" disabled={!accounts.length} onClick={openTransaction} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-35"><Plus className="h-3.5 w-3.5" /> Transaction</button>
            </div>
            <div className="px-3 pb-3"><MetricStrip items={[{ label: "Income", value: money(monthMetrics.income), tone: "good" }, { label: "Spent", value: money(monthMetrics.spent), tone: monthMetrics.spent ? "bad" : undefined }, { label: "Net", value: money(monthMetrics.net), tone: monthMetrics.net > 0 ? "good" : monthMetrics.net < 0 ? "bad" : undefined }]} /></div>
            {editor === "transaction" ? (
              <form onSubmit={saveTransaction} className="border-y border-white/[0.065] bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold text-white/64">Add transaction</p><button type="button" onClick={closeEditors} className="p-1.5 text-white/42"><X className="h-4 w-4" /></button></div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1">
                  {(["expense", "income"] as const).map((kind) => <button key={kind} type="button" onClick={() => setTransactionDraft((draft) => ({ ...draft, kind, categoryId: NO_CATEGORY }))} className={cn("h-9 rounded-lg text-xs font-semibold capitalize", transactionDraft.kind === kind ? "bg-white text-black" : "text-white/48")}>{kind}</button>)}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Amount</Label><Input autoFocus inputMode="decimal" value={transactionDraft.amount} onChange={(event) => setTransactionDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono text-lg" /></div>
                  <div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Date</Label><Input type="date" value={transactionDraft.date} onChange={(event) => setTransactionDraft((draft) => ({ ...draft, date: event.target.value }))} className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" /></div>
                  <div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Description</Label><Input value={transactionDraft.description} onChange={(event) => setTransactionDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Gas, groceries, paycheck…" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" /></div>
                  <div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Account</Label><Select value={transactionDraft.accountId} onValueChange={(accountId) => setTransactionDraft((draft) => ({ ...draft, accountId }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]"><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name?.trim() || "Untitled account"}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Category</Label><Select value={transactionDraft.categoryId} onValueChange={(categoryId) => setTransactionDraft((draft) => ({ ...draft, categoryId }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]"><SelectContent><SelectItem value={NO_CATEGORY}>No category</SelectItem>{matchingTransactionCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name?.trim() || "Untitled category"}</SelectItem>)}</SelectContent></Select></div>
                  <div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Note · optional</Label><Textarea value={transactionDraft.note} onChange={(event) => setTransactionDraft((draft) => ({ ...draft, note: event.target.value }))} className="mt-1 min-h-16 rounded-xl border-white/10 bg-white/[0.035]" /></div>
                </div>
                {formError ? <p className="mt-3 text-xs text-red-200/80">{formError}</p> : null}
                <button disabled={saving} type="submit" className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : "Save transaction"}</button>
              </form>
            ) : null}
            {recentQuery.isPending ? <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/40"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading activity…</div> : recent.length ? (
              <div className="border-t border-white/[0.055]">{recent.map((transaction) => {
                const outflow = transaction.direction === "outflow";
                return <div key={transaction.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.055] px-4 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white/82">{transaction.description || "Untitled transaction"}</p><p className="mt-0.5 truncate text-[11px] text-white/38">{readableDate(transaction.transaction_date)} · {accountNames[transaction.account_id] ?? "Unknown account"}{transaction.category_id ? ` · ${categoryNames[transaction.category_id] ?? "Category"}` : ""}</p></div><p className={cn("font-mono text-sm font-semibold tabular-nums", outflow ? "text-red-200/82" : "text-emerald-200/84")}>{outflow ? "−" : "+"}{money(Math.abs(normalizeMinor(transaction.amount_minor)), transaction.currency_code ?? "USD")}</p></div>;
              })}</div>
            ) : <EmptyState title="No activity yet" detail="Log real income and expenses here. These transactions change the selected account balance." />}
          </div>
        ) : null}

        {tab === "budget" ? (
          <div>
            <div className="flex items-center justify-between px-4 py-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Monthly budget</p><p className="mt-0.5 text-xs text-white/42">What you allow yourself to spend</p></div>
              <span className="text-xs font-medium text-white/42">This month</span>
            </div>
            <div className="px-3 pb-3"><MetricStrip items={[{ label: "Budgeted", value: money(budgetSummary.limit) }, { label: "Spent", value: money(budgetSummary.spent), tone: budgetSummary.spent ? "bad" : undefined }, { label: "Left", value: money(budgetSummary.left), tone: budgetSummary.left >= 0 ? "good" : "bad" }]} /></div>
            {editor === "budget" ? (
              <form onSubmit={saveBudget} className="border-y border-white/[0.065] bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold text-white/64">{editingBudgetId ? "Edit monthly limit" : "Add budget category"}</p><button type="button" onClick={closeEditors} className="p-1.5 text-white/42"><X className="h-4 w-4" /></button></div>
                {!editingBudgetId && availableBudgetCategories.length ? <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1"><button type="button" onClick={() => setBudgetDraft((draft) => ({ ...draft, categoryMode: "existing", categoryId: draft.categoryId || availableBudgetCategories[0]?.id || "" }))} className={cn("h-9 rounded-lg text-xs font-semibold", budgetDraft.categoryMode === "existing" ? "bg-white text-black" : "text-white/48")}>Existing</button><button type="button" onClick={() => setBudgetDraft((draft) => ({ ...draft, categoryMode: "create" }))} className={cn("h-9 rounded-lg text-xs font-semibold", budgetDraft.categoryMode === "create" ? "bg-white text-black" : "text-white/48")}>New category</button></div> : null}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {!editingBudgetId && budgetDraft.categoryMode === "existing" && availableBudgetCategories.length ? <div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Category</Label><Select value={budgetDraft.categoryId} onValueChange={(categoryId) => setBudgetDraft((draft) => ({ ...draft, categoryId }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]"><SelectContent>{availableBudgetCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name?.trim() || "Untitled category"}</SelectItem>)}</SelectContent></Select></div> : null}
                  {!editingBudgetId && (budgetDraft.categoryMode === "create" || !availableBudgetCategories.length) ? <div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Category name</Label><Input autoFocus value={budgetDraft.categoryName} onChange={(event) => setBudgetDraft((draft) => ({ ...draft, categoryName: event.target.value }))} placeholder="Food" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" /></div> : null}
                  <div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Monthly limit</Label><Input inputMode="decimal" value={budgetDraft.limit} onChange={(event) => setBudgetDraft((draft) => ({ ...draft, limit: event.target.value }))} placeholder="400.00" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono text-lg" /></div>
                </div>
                {formError ? <p className="mt-3 text-xs text-red-200/80">{formError}</p> : null}
                <button disabled={saving} type="submit" className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : editingBudgetId ? "Save limit" : "Add category"}</button>
              </form>
            ) : null}
            {budgetsQuery.isPending || monthQuery.isPending ? <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/40"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading budget…</div> : budgetRows.length ? (
              <div className="border-t border-white/[0.055]">{budgetRows.map((row, index) => {
                const over = row.left < 0;
                const progress = Math.min(100, Math.max(0, row.percent * 100));
                const progressClass = ["bg-amber-400", "bg-sky-400", "bg-violet-400", "bg-rose-400", "bg-emerald-400"][index % 5];
                return <button key={row.budget.id} type="button" onClick={() => openBudget(row)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-white/[0.055] px-4 py-3 text-left last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white/84">{row.name}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.075]"><span className={cn("block h-full rounded-full", over ? "bg-red-400" : progressClass)} style={{ width: `${progress}%` }} /></div><p className="mt-1.5 text-[11px] tabular-nums text-white/38">{money(row.spent)} of {money(row.limit)}</p></div><div className="flex items-center gap-2"><span className="text-right"><span className={cn("block text-sm font-semibold tabular-nums", over ? "text-red-200/84" : "text-white/76")}>{money(Math.abs(row.left))} {over ? "over" : "left"}</span><span className="mt-0.5 block text-[11px] tabular-nums text-white/34">{Math.round(row.percent * 100)}%</span></span><ChevronRight className="h-4 w-4 text-white/26" /></div></button>;
              })}</div>
            ) : <EmptyState title="Build this month’s budget" detail="Give each spending category a monthly limit. Actual categorized transactions fill the progress bars automatically." />}
            <div className="border-t border-white/[0.055] p-3"><button type="button" onClick={() => openBudget()} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/76 transition hover:bg-white/[0.09]"><Plus className="h-4 w-4" /> Add Category</button></div>
          </div>
        ) : null}

        {tab === "forecast" ? (
          <div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Forecast</p><p className="mt-0.5 text-xs text-white/42">Current balances + scheduled money only</p></div>
              <div className="grid grid-cols-3 rounded-full border border-white/10 bg-white/[0.025] p-1">{HORIZONS.map((value) => <button key={value} type="button" onClick={() => setHorizon(value)} className={cn("h-8 min-w-11 rounded-full px-2 text-[11px] font-semibold", horizon === value ? "bg-white text-black" : "text-white/42")}>{value}d</button>)}</div>
            </div>
            <div className="px-3"><div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.075] bg-black/20"><div className="border-b border-r border-white/[0.065] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Projected</p><p className="mt-1 text-lg font-semibold tabular-nums text-white/84">{money(projection.endBalanceMinor)}</p><p className="mt-0.5 text-[10px] text-white/32">in {horizon} days</p></div><div className="border-b border-white/[0.065] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Lowest</p><p className="mt-1 text-lg font-semibold tabular-nums text-white/84">{money(projection.lowestBalanceMinor)}</p><p className="mt-0.5 text-[10px] text-white/32">{compactDate(projection.lowestDate)}</p></div><div className="border-r border-white/[0.065] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Money in</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-200/82">{money(projection.inflowMinor)}</p></div><div className="p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-white/34">Money out</p><p className="mt-1 text-lg font-semibold tabular-nums text-red-200/80">{money(projection.outflowMinor)}</p></div></div></div>
            <div className="px-3 py-2"><ForecastChart projection={projection} /><p className="px-1 pb-2 text-[11px] leading-4 text-white/34">Forecast does not guess random spending. Add scheduled bills and income below to make this line useful.</p></div>
            <div className="flex items-center justify-between border-t border-white/[0.055] px-4 py-3"><div><p className="text-xs font-semibold text-white/68">Scheduled money</p><p className="mt-0.5 text-[10px] text-white/32">Planning only · does not change balances</p></div><button type="button" onClick={() => openScheduled()} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/70"><Plus className="h-3.5 w-3.5" /> Scheduled</button></div>
            {editor === "scheduled" ? (
              <form onSubmit={saveScheduled} className="border-y border-white/[0.065] bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold text-white/64">{editingScheduledId ? "Edit scheduled money" : "Add scheduled money"}</p><button type="button" onClick={closeEditors} className="p-1.5 text-white/42"><X className="h-4 w-4" /></button></div>
                <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1">{(["expense", "income"] as const).map((kind) => <button key={kind} type="button" onClick={() => setScheduledDraft((draft) => ({ ...draft, kind, categoryId: NO_CATEGORY }))} className={cn("h-9 rounded-lg text-xs font-semibold capitalize", scheduledDraft.kind === kind ? "bg-white text-black" : "text-white/48")}>{kind === "expense" ? "Bill / Expense" : "Income"}</button>)}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Name</Label><Input autoFocus value={scheduledDraft.name} onChange={(event) => setScheduledDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Rent, paycheck, subscription…" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" /></div><div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Amount</Label><Input inputMode="decimal" value={scheduledDraft.amount} onChange={(event) => setScheduledDraft((draft) => ({ ...draft, amount: event.target.value }))} placeholder="0.00" className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035] font-mono" /></div><div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Frequency</Label><Select value={scheduledDraft.frequency} onValueChange={(frequency) => setScheduledDraft((draft) => ({ ...draft, frequency: normalizeFrequency(frequency) }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]"><SelectContent>{FREQUENCIES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">First date</Label><Input type="date" value={scheduledDraft.date} onChange={(event) => setScheduledDraft((draft) => ({ ...draft, date: event.target.value }))} className="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]" /></div><div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Account</Label><Select value={scheduledDraft.accountId} onValueChange={(accountId) => setScheduledDraft((draft) => ({ ...draft, accountId }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]"><SelectContent><SelectItem value={NO_ACCOUNT}>No account</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name?.trim() || "Untitled account"}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Category</Label><Select value={scheduledDraft.categoryId} onValueChange={(categoryId) => setScheduledDraft((draft) => ({ ...draft, categoryId }))} triggerClassName="mt-1 h-11 rounded-xl border-white/10 bg-white/[0.035]"><SelectContent><SelectItem value={NO_CATEGORY}>No category</SelectItem>{matchingScheduledCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name?.trim() || "Untitled category"}</SelectItem>)}</SelectContent></Select></div><div className="sm:col-span-2"><Label className="text-[10px] uppercase tracking-[0.12em] text-white/38">Note · optional</Label><Textarea value={scheduledDraft.note} onChange={(event) => setScheduledDraft((draft) => ({ ...draft, note: event.target.value }))} className="mt-1 min-h-16 rounded-xl border-white/10 bg-white/[0.035]" /></div></div>
                {formError ? <p className="mt-3 text-xs text-red-200/80">{formError}</p> : null}<button disabled={saving} type="submit" className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">{saving ? "Saving…" : editingScheduledId ? "Save scheduled item" : "Add scheduled item"}</button>
              </form>
            ) : null}
            {recurringQuery.isPending ? <div className="flex items-center gap-2 px-4 py-5 text-xs text-white/40"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading scheduled money…</div> : upcoming.length ? <div>{upcoming.map(({ item, date }) => { const outflow = item.direction === "outflow"; return <button key={item.id} type="button" onClick={() => openScheduled(item)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.055] px-4 py-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white/82">{item.name}</span><span className="mt-0.5 block truncate text-[11px] text-white/38">{compactDate(date)} · {FREQUENCY_LABEL[normalizeFrequency(item.frequency)]}{item.account_id ? ` · ${accountNames[item.account_id] ?? "Unknown account"}` : ""}</span></span><span className="flex items-center gap-2"><span className={cn("font-mono text-sm font-semibold tabular-nums", outflow ? "text-red-200/82" : "text-emerald-200/84")}>{outflow ? "−" : "+"}{money(Math.abs(normalizeMinor(item.amount_minor)))}</span><PencilLine className="h-3.5 w-3.5 text-white/28" /></span></button>; })}</div> : <EmptyState title="Nothing scheduled" detail="Add recurring bills and income. Scheduled items affect planning only; they do not create transactions or change account balances." />}
          </div>
        ) : null}
      </section>

      {anyError ? (
        <section className="rounded-2xl border border-red-200/10 bg-red-200/[0.035] px-4 py-3">
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-red-100/76">{anyError}</p><button type="button" onClick={() => { void accountsQuery.refetch(); void recurringQuery.refetch(); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60"><RotateCcw className="h-3.5 w-3.5" /> Retry</button></div>
        </section>
      ) : null}
    </div>
  );
}
