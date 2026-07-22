"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, LoaderCircle, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMealPlanDay } from "@/hooks/useMealPlanDay";
import { statusLabel, type MealPlanSurface } from "@/lib/nutrition/mealPlans";
import type { FoodSearchResult } from "@/lib/nutrition/foods";
import { NutritionTargetPanel } from "@/components/nutrition/NutritionTargetPanel";

type TemplateChoice = { id: string; name: string; total_calories?: number | string | null; meal_items?: unknown[] };
type GroceryChoice = { id: string; food_id: string | null; name: string; quantity: number | null; unit: string | null };

export function SharedMealPlanPanel({ surface, creatorDayDate }: { surface: MealPlanSurface; creatorDayDate?: string | null }) {
  const { plan, isLoading, error, loggingItemId, refresh, addItem, updateItem, removeItem, logItem } = useMealPlanDay(surface, creatorDayDate);
  const [query, setQuery] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const [foods, setFoods] = useState<FoodSearchResult[]>([]);
  const [templates, setTemplates] = useState<TemplateChoice[]>([]);
  const [groceries, setGroceries] = useState<GroceryChoice[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/nutrition/meal-templates?limit=50", { signal: controller.signal }).then((response) => response.json().then((payload) => response.ok ? payload.meals ?? [] : Promise.reject(new Error(payload.error)))),
      surface === "grocery" ? fetch("/api/food-resources?status=active&limit=200", { signal: controller.signal }).then((response) => response.json().then((payload) => response.ok ? payload.foodResources ?? [] : Promise.reject(new Error(payload.error)))) : Promise.resolve([]),
    ]).then(([mealRows, groceryRows]) => { setTemplates(mealRows); setGroceries(groceryRows); setPickerError(null); }).catch((reason) => { if (!controller.signal.aborted) setPickerError(reason instanceof Error ? reason.message : "Planner choices are unavailable."); });
    return () => controller.abort();
  }, [surface]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) { setFoods([]); return; }
    const controller = new AbortController();
    fetch(`/api/nutrition/foods/search?q=${encodeURIComponent(normalized)}&limit=8`, { signal: controller.signal })
      .then((response) => response.json().then((payload) => response.ok ? setFoods(payload.foods ?? []) : Promise.reject(new Error(payload.error))))
      .catch((reason) => { if (!controller.signal.aborted) setPickerError(reason instanceof Error ? reason.message : "Food search is unavailable."); });
    return () => controller.abort();
  }, [query]);

  async function add(key: string, selection: { foodId?: string; mealTemplateId?: string; foodResourceId?: string; manualLabel?: string }) {
    setPendingChoice(key);
    const added = await addItem(selection);
    if (added) { setQuery(""); setManualLabel(""); setFoods([]); }
    setPendingChoice(null);
  }

  return <section className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090909]" aria-label="Meal Plan">
    <header className="flex items-center gap-3 border-b border-white/[0.055] px-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/66"><Calendar className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-white/88">Meal Plan</h3><p className="text-[11px] font-medium text-white/38">{plan ? `${plan.creator_day_date} · ${plan.items.length} ${plan.items.length === 1 ? "item" : "items"}` : creatorDayDate ?? "Current Creator day"}</p></div></header>
    {surface === "nutrition" ? <NutritionTargetPanel creatorDayDate={creatorDayDate} /> : null}
    {isLoading ? <div className="flex items-center gap-2 px-4 py-8 text-xs text-white/44"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading Meal Plan…</div> : null}
    {!isLoading && error ? <div className="p-4"><p className="text-xs text-red-200/80">{error}</p><button type="button" onClick={() => void refresh()} className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/70"><RotateCcw className="h-3.5 w-3.5" /> Retry</button></div> : null}
    {!isLoading && !error && plan ? <div>
      {plan.items.length === 0 ? <div className="px-4 py-5"><p className="text-sm font-semibold text-white/72">No meals planned</p><p className="mt-1 text-xs leading-5 text-white/40">Choose a saved meal, food, or manual item. Planning does not log or remove it from Grocery.</p></div> : <ul className="divide-y divide-white/[0.05]">{plan.items.map((item) => <li key={item.id} className="p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white/82">{item.label}</p><p className="mt-0.5 text-[11px] text-white/38">{item.servings} serving{item.servings === 1 ? "" : "s"} · {statusLabel(item.status)}</p>{item.nutrition_snapshot.loggable ? <p className="mt-1 text-[11px] text-white/34">{Math.round(item.nutrition_snapshot.calories * item.servings)} kcal · {Math.round(item.nutrition_snapshot.protein_g * item.servings)}g protein</p> : <p className="mt-1 text-[11px] text-white/34">Manual item · no Nutrition contents</p>}</div><button type="button" aria-label={`Remove ${item.label}`} onClick={() => void removeItem(item.id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/38 hover:bg-white/5 hover:text-white/70"><Trash2 className="h-4 w-4" /></button></div><div className="mt-2 flex flex-wrap items-center gap-2"><label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.07] px-2 text-[11px] text-white/44">Servings<input aria-label={`Servings for ${item.label}`} type="number" min="0.1" step="0.1" defaultValue={item.servings} onBlur={(event) => { const value = Number(event.target.value); if (value > 0 && value !== item.servings) void updateItem(item.id, { servings: value }); }} className="w-12 bg-transparent text-white/72 outline-none" /></label><select aria-label={`Meal type for ${item.label}`} value={item.meal_type ?? ""} onChange={(event) => void updateItem(item.id, { mealType: event.target.value || null })} className="min-h-10 rounded-lg border border-white/[0.07] bg-black px-2 text-[11px] text-white/62"><option value="">Any meal</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select><input aria-label={`Planned time for ${item.label}`} type="time" value={item.planned_time ?? ""} onChange={(event) => void updateItem(item.id, { plannedTime: event.target.value || null })} className="min-h-10 rounded-lg border border-white/[0.07] bg-black px-2 text-[11px] text-white/62" />{item.status === "planned" ? <><button type="button" onClick={() => void updateItem(item.id, { status: "skipped" })} className="min-h-10 rounded-lg border border-white/[0.07] px-3 text-[11px] font-semibold text-white/52">Mark skipped</button>{item.nutrition_snapshot.loggable ? <button type="button" disabled={loggingItemId === item.id} onClick={() => void logItem(item.id)} className={`min-h-10 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50 ${surface === "nutrition" ? "bg-white text-black" : "border border-white/[0.1] text-white/78"}`}>{loggingItemId === item.id ? "Logging…" : "Log through Nutrition"}</button> : null}</> : null}{item.status === "partially_logged" ? <button type="button" disabled={loggingItemId === item.id} onClick={() => void logItem(item.id)} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-[11px] font-semibold text-white/72 disabled:opacity-50">{loggingItemId === item.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}{loggingItemId === item.id ? "Retrying…" : "Retry Grocery"}</button> : null}{item.status === "logged" ? <span className="flex min-h-10 items-center gap-1 text-[11px] font-semibold text-emerald-300/70"><Check className="h-3.5 w-3.5" /> Logged</span> : null}</div></li>)}</ul>}
      <div className="space-y-2 border-t border-white/[0.055] p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">Add to plan</p>{templates.filter((meal) => (meal.meal_items?.length ?? 0) > 0).slice(0, 5).map((meal) => <button key={meal.id} type="button" disabled={pendingChoice !== null} onClick={() => void add(`meal:${meal.id}`, { mealTemplateId: meal.id })} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.07] px-3 text-left text-xs font-semibold text-white/72"><Plus className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{meal.name}</span><span className="text-white/34">{Math.round(Number(meal.total_calories ?? 0))} cal</span></button>)}{surface === "grocery" ? groceries.filter((item) => item.food_id && item.quantity && item.unit).slice(0, 8).map((item) => <button key={item.id} type="button" disabled={pendingChoice !== null} onClick={() => void add(`grocery:${item.id}`, { foodId: item.food_id!, foodResourceId: item.id })} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.07] px-3 text-left text-xs font-semibold text-white/72"><Plus className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-white/34">{item.quantity} {item.unit}</span></button>) : null}<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search individual foods" className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/40 pl-9 pr-3 text-sm text-white/82 outline-none placeholder:text-white/28" /></div>{foods.map((food) => <button key={food.id} type="button" disabled={pendingChoice !== null} onClick={() => void add(`food:${food.id}`, { foodId: food.id })} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.07] px-3 text-left text-xs font-semibold text-white/72"><Plus className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{food.name}</span><span className="text-white/34">{Math.round(Number(food.calories ?? 0))} cal</span></button>)}<div className="flex gap-2"><input value={manualLabel} onChange={(event) => setManualLabel(event.target.value)} maxLength={160} placeholder="Add a manual item" aria-label="Manual item" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/40 px-3 text-sm text-white/82 outline-none placeholder:text-white/28" /><button type="button" disabled={pendingChoice !== null || !manualLabel.trim()} onClick={() => void add(`manual:${manualLabel.trim()}`, { manualLabel: manualLabel.trim() })} className="flex min-h-11 items-center gap-1 rounded-xl border border-white/[0.08] px-3 text-xs font-semibold text-white/72 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button></div>{pickerError ? <p className="text-xs text-red-200/72">{pickerError}</p> : null}</div>
    </div> : null}
  </section>;
}
