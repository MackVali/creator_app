"use client";

import {
  closestCenter,
  DndContext,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Calendar,
  Check,
  CheckSquare,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  Dumbbell,
  Eye,
  EyeOff,
  FileText,
  FilePlus2,
  GripVertical,
  Hash,
  Link,
  List,
  ListChecks,
  Minus,
  MoreHorizontal,
  PencilLine,
  Pin,
  Plus,
  ScanLine,
  Search,
  Settings2,
  ShoppingBasket,
  Star,
  X,
  Table2,
  Tags,
  Trash2,
  Type,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type Dispatch,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon as IconifyIcon } from "@iconify/react";
import { NoteIconPicker, resolveNoteIcon } from "@/components/notes/NoteEditorHeader";
import {
  getDatabaseCreatedAtInitialFormValues,
  isDefaultFitnessDatabaseDefinition,
  isDefaultNutritionDatabaseDefinition,
  isOnHandDatabaseDefinition,
  isLockedStarterDatabase,
  isLockedStarterDatabaseId,
  isLegacyHydrationDatabase,
  isDatabaseCreatedAtField,
  NUTRITION_DATABASE_ID,
  ON_HAND_EXPIRES_ON_FIELD_ID,
  ON_HAND_LOCATION_FIELD_ID,
  ON_HAND_NAME_FIELD_ID,
  ON_HAND_NOTES_FIELD_ID,
  ON_HAND_QUANTITY_FIELD_ID,
  ON_HAND_UNIT_FIELD_ID,
} from "@/lib/skillStarterNotes";
import {
  scanNutritionBarcode,
  type NutritionBarcodeScannerResult,
} from "@/lib/nutrition/barcodeScanner";
import {
  findNutritionEntryFields,
  formatInventoryCountLabel,
  getFoodInventoryMeasurementProfile,
  getFoodPrimaryGroceryDepartment,
  normalizeFoodBarcode,
  normalizeFoodSearchText,
  type FoodBarcodeLookupResult,
  FOOD_BROWSE_DEPARTMENTS,
  type FoodBrowseAisleLabel,
  type FoodBrowseDepartmentLabel,
  type FoodSearchResult,
  type NutritionEntryFields,
} from "@/lib/nutrition/foods";
import { getFoodIcon, type FoodIcon } from "@/lib/nutrition/foodIcons";
import {
  getChefCuisinesWithCounts,
  getChefDishFamiliesForCuisine,
  getChefOptionGroupsForDishFamily,
  getChefRecipesForNode,
  getChefStylesForDishFamily,
  getDefaultChefRecipeOptions,
  resolveChefRecipeIngredients,
  resolveChefRecipeName,
} from "@/lib/nutrition/chefRecipes";
import {
  calculateChefIngredientNutrition,
  calculateResolvedChefRecipeAvailability,
  calculateResolvedChefRecipeNutrition,
  classifyResolvedChefRecipeAvailability,
  formatChefMacroSummary,
  formatChefNutritionNumber,
  resolveChefDishTemplate,
  type ChefAvailabilityTier,
  type ChefResolvedAvailabilityTier,
} from "@/lib/nutrition/chefRecipeNutrition";
import {
  DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON,
  DEFAULT_NUTRITION_RECIPE_ICON,
  type NutritionMealDraft,
} from "@/lib/nutrition/meals";
import type { Json } from "@/types/supabase";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticSnap,
  hapticSoftTick,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import {
  FITNESS_WORKOUT_FOCUS_SESSION_STORAGE_KEY,
  type FitnessWorkoutFocusSessionPayload,
} from "@/lib/focus/fitnessWorkoutFocusSession";
import {
  FITNESS_ROUTINE_GROUPS,
  routinePrescriptionToWorkoutDetail,
  type FitnessRoutineTemplate,
} from "@/lib/fitness/routineTemplates";
import {
  FITNESS_PLAN_TEMPLATES,
  resolveFitnessPlanRoutineSequence,
  type FitnessPlanTemplate,
} from "@/lib/fitness/planTemplates";
import { cn } from "@/lib/utils";

type SlashCommandId =
  | "text"
  | "checklist"
  | "bulletList"
  | "dashList"
  | "subpage"
  | "database"
  | "divider";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
  icon: LucideIcon;
  replacement: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    description: "Clean writing line",
    icon: Type,
    replacement: "",
  },
  {
    id: "checklist",
    label: "Checklist",
    description: "Track a task",
    icon: ListChecks,
    replacement: "- [ ] ",
  },
  {
    id: "bulletList",
    label: "Bullet List",
    description: "Inline bullets",
    icon: List,
    replacement: "• ",
  },
  {
    id: "dashList",
    label: "Dash List",
    description: "Simple dash rows",
    icon: Minus,
    replacement: "- ",
  },
  {
    id: "subpage",
    label: "Subpage",
    description: "Placeholder page",
    icon: FilePlus2,
    replacement: "[Subpage: Untitled]",
  },
  {
    id: "database",
    label: "Database",
    description: "Placeholder table",
    icon: Table2,
    replacement: "[Database: Untitled]",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate sections",
    icon: Minus,
    replacement: "---",
  },
];

const NOTE_SLASH_MENU_OPEN_CLASS = "note-slash-menu-open";
const NOTE_DIVIDER_MARKER = "---";
const NOTE_SUBPAGE_TITLE_FALLBACK = "Untitled";
const NOTE_SUBPAGE_MARKER_REGEX =
  /^\[Subpage:\s*([^\]]+?)\](?:\(creator-subpage:([^)]+)\))?$/;
const NOTE_DATABASE_TITLE_FALLBACK = "Untitled";
const NOTE_DATABASE_DISPLAY_TITLE_FALLBACK = "Untitled Database";
const NOTE_DATABASE_MARKER_REGEX =
  /^\[Database:\s*([^\]]+?)\]\(creator-database:([^)]+)\)$/;
const NOTE_CHECKLIST_MARKER_REGEX = /^-\s+\[([ xX])\](?:\s?(.*))$/;
const NOTE_BULLET_LIST_MARKER_REGEX = /^•(?:\s?(.*))$/;
const NOTE_DASH_LIST_MARKER_REGEX = /^-\s(?!\[[ xX]\])([\s\S]*)$/;

const NOTE_DATABASE_FIELD_TYPES = [
  "text",
  "number",
  "select",
  "photo",
  "rating",
  "longText",
  "date",
  "createdAt",
] as const;

export type NoteDatabaseFieldType = (typeof NOTE_DATABASE_FIELD_TYPES)[number];
export type NoteDatabaseViewType = "table" | "list" | "card";

const NOTE_DATABASE_FIELD_TYPE_LABELS: Record<NoteDatabaseFieldType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  photo: "Photo",
  rating: "Rating",
  longText: "Long text",
  date: "Date",
  createdAt: "Created at",
};

const NOTE_DATABASE_FIELD_TYPE_OPTIONS: Array<{
  type: NoteDatabaseFieldType;
  icon: LucideIcon;
}> = [
  { type: "text", icon: Type },
  { type: "number", icon: Hash },
  { type: "select", icon: List },
  { type: "photo", icon: FileText },
  { type: "rating", icon: Star },
  { type: "longText", icon: FileText },
  { type: "date", icon: Calendar },
  { type: "createdAt", icon: Clock },
];

const NOTE_DATABASE_COMING_SOON_FIELD_TYPE_OPTIONS: Array<{
  label: string;
  icon: LucideIcon;
}> = [
  { label: "Checkbox", icon: CheckSquare },
  { label: "URL", icon: Link },
  { label: "Multi-select", icon: Tags },
];

const NOTE_DATABASE_VIEW_LABELS: Record<NoteDatabaseViewType, string> = {
  table: "Table",
  list: "List",
  card: "Card",
};

const NOTE_DATABASE_VIEW_TYPES: NoteDatabaseViewType[] = ["table", "list", "card"];
const DEFAULT_NOTE_DATABASE_ICON = "lucide:Database";
const NOTE_DATABASE_FULL_TABLE_MIN_VISIBLE_ROWS = 40;
const NOTE_DATABASE_FIELD_DRAG_ID_PREFIX = "database-field:";
const NOTE_DATABASE_FIELD_LONG_PRESS_DELAY_MS = 425;
const NOTE_DATABASE_FIELD_LONG_PRESS_TOLERANCE_PX = 8;
const DEFAULT_DAILY_NUTRITION_GOALS = {
  calories: 2000,
  carbs: 250,
  protein: 150,
  fat: 70,
} as const;
const EMPTY_NUTRITION_TOTALS = {
  calories: 0,
  carbs: 0,
  protein: 0,
  fat: 0,
} satisfies Record<keyof typeof DEFAULT_DAILY_NUTRITION_GOALS, number>;
const NUTRITION_DAY_START_HOUR = 4;
const NUTRITION_MACRO_FIELD_KEYS = ["carbs", "protein", "fat"] as const;
const NUTRITION_FOOD_FIELD_LOOKUP_KEYS = new Set(["food", "foodname", "name"]);
const NUTRITION_BROWSE_ACCORDION_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
} as const;
const DEFAULT_CHEF_CATALOG_ICON = "🍽️";
const CHEF_CATALOG_EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const CHEF_FILTERS = [
  { id: "all", label: "All", tags: [] },
  { id: "available", label: "Available", tags: [] },
  { id: "quick", label: "Quick", tags: ["quick"] },
  { id: "high-protein", label: "High Protein", tags: ["high-protein"] },
  { id: "cheap", label: "Cheap", tags: ["cheap"] },
  { id: "low-effort", label: "Low Effort", tags: ["low-effort"] },
  { id: "meal-prep", label: "Meal Prep", tags: ["meal-prep", "bulk"] },
] as const;
type ChefFilterId = (typeof CHEF_FILTERS)[number]["id"];

function resolveChefCatalogIcon(icon: unknown): string {
  if (typeof icon !== "string") return DEFAULT_CHEF_CATALOG_ICON;
  const normalizedIcon = icon.trim();
  return normalizedIcon && CHEF_CATALOG_EMOJI_PATTERN.test(normalizedIcon)
    ? normalizedIcon
    : DEFAULT_CHEF_CATALOG_ICON;
}
const NUTRITION_FOOD_ACTION_TABS = [
  { id: "search", label: "Search", icon: Search },
  { id: "grocery", label: "Grocery", icon: ShoppingBasket },
  { id: "scan", label: "Scan", icon: ScanLine },
  { id: "favs", label: "Favs", icon: Star },
  { id: "custom", label: "Custom", icon: PencilLine },
  { id: "meals", label: "Meals", icon: Utensils },
  { id: "recipes", label: "Recipes", icon: BookOpen },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "chef", label: "Chef", icon: ChefHat },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
}>;
const GROCERY_EXTRA_FOOD_ACTION_TABS = [
  { id: "meal-plan", label: "Meal Plan", icon: Calendar },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
}>;
const FITNESS_ACTION_TABS = [
  { id: "start", label: "Workout", icon: Dumbbell },
  { id: "exercises", label: "Exercises", icon: ListChecks },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "workout-routines", label: "Routines", icon: Calendar },
  { id: "plans", label: "Plans", icon: List },
  { id: "custom", label: "Custom", icon: PencilLine },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
}>;
type FitnessExerciseSample = {
  name: string;
  movementType: string;
  primaryArea: string;
  equipment: string;
  guidance: string;
  notes: string;
};
type FitnessWorkoutExerciseDetail = {
  sets: string;
  reps: string;
  duration: string;
};
type FitnessWorkoutLogExerciseDetail = FitnessWorkoutExerciseDetail & {
  weight: string;
};
type FitnessPlanSessionLength = number;
type FitnessPlanSetup = {
  goal: string;
  level: string;
  equipment: string;
  daysPerWeek: number;
  sessionLength: FitnessPlanSessionLength;
};
type FitnessMovementGroupSample = {
  label: string;
  icon: LucideIcon;
  subcategories: Array<{
    label: string;
    exercises: string[];
  }>;
};
const FITNESS_EXERCISE_SAMPLES: FitnessExerciseSample[] = [
  {
    name: "Push-up",
    movementType: "Push",
    primaryArea: "Chest, triceps",
    equipment: "Bodyweight",
    guidance: "3-5 sets x 8-20 reps",
    notes: "Keep ribs down and move as one line.",
  },
  {
    name: "Incline Push-up",
    movementType: "Push",
    primaryArea: "Chest, triceps",
    equipment: "Bench or box",
    guidance: "3-4 sets x 8-15 reps",
    notes: "Keep a straight line and lower your chest to the support.",
  },
  {
    name: "Decline Push-up",
    movementType: "Push",
    primaryArea: "Upper chest, shoulders",
    equipment: "Bench or box",
    guidance: "3-4 sets x 6-12 reps",
    notes: "Elevate feet and keep elbows controlled.",
  },
  {
    name: "Bench Press",
    movementType: "Push",
    primaryArea: "Chest, triceps",
    equipment: "Barbell or dumbbells",
    guidance: "3-5 sets x 5-10 reps",
    notes: "Brace, use a stable arch, and press evenly.",
  },
  {
    name: "Incline Bench Press",
    movementType: "Push",
    primaryArea: "Upper chest, shoulders",
    equipment: "Barbell or dumbbells",
    guidance: "3-4 sets x 6-10 reps",
    notes: "Set a moderate incline and press without shrugging.",
  },
  {
    name: "Dumbbell Press",
    movementType: "Push",
    primaryArea: "Chest, triceps",
    equipment: "Dumbbells",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Let each shoulder move naturally and press evenly.",
  },
  {
    name: "Chest Fly",
    movementType: "Push",
    primaryArea: "Chest",
    equipment: "Dumbbells or cable",
    guidance: "2-4 sets x 10-15 reps",
    notes: "Use a soft elbow bend and stop before shoulder strain.",
  },
  {
    name: "Shoulder Press",
    movementType: "Push",
    primaryArea: "Shoulders",
    equipment: "Barbell or dumbbells",
    guidance: "3-4 sets x 6-10 reps",
    notes: "Stack wrists over elbows and avoid overextending.",
  },
  {
    name: "Pike Push-up",
    movementType: "Push",
    primaryArea: "Shoulders, triceps",
    equipment: "Bodyweight",
    guidance: "3-4 sets x 6-12 reps",
    notes: "Press your head toward the floor while keeping hips high.",
  },
  {
    name: "Lateral Raise",
    movementType: "Push",
    primaryArea: "Side delts",
    equipment: "Dumbbells or cable",
    guidance: "2-4 sets x 12-20 reps",
    notes: "Raise with control and keep traps quiet.",
  },
  {
    name: "Front Raise",
    movementType: "Push",
    primaryArea: "Front delts",
    equipment: "Dumbbells or plate",
    guidance: "2-3 sets x 10-15 reps",
    notes: "Lift to shoulder height without leaning back.",
  },
  {
    name: "Arnold Press",
    movementType: "Push",
    primaryArea: "Shoulders",
    equipment: "Dumbbells",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Rotate smoothly and keep the ribs stacked.",
  },
  {
    name: "Dip",
    movementType: "Push",
    primaryArea: "Chest, triceps",
    equipment: "Bars",
    guidance: "3-4 sets x 5-12 reps",
    notes: "Keep shoulders packed and stop before discomfort.",
  },
  {
    name: "Close-Grip Push-up",
    movementType: "Push",
    primaryArea: "Triceps, chest",
    equipment: "Bodyweight",
    guidance: "3-4 sets x 8-15 reps",
    notes: "Keep elbows close and press through the palms.",
  },
  {
    name: "Triceps Extension",
    movementType: "Push",
    primaryArea: "Triceps",
    equipment: "Dumbbell, cable, or band",
    guidance: "2-4 sets x 10-15 reps",
    notes: "Keep upper arms steady and extend fully.",
  },
  {
    name: "Skull Crusher",
    movementType: "Push",
    primaryArea: "Triceps",
    equipment: "EZ bar or dumbbells",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Lower under control and keep elbows from flaring.",
  },
  {
    name: "Pull-up",
    movementType: "Pull",
    primaryArea: "Back, biceps",
    equipment: "Pull-up bar",
    guidance: "3-5 sets x 3-10 reps",
    notes: "Start from a dead hang and pull chest toward the bar.",
  },
  {
    name: "Chin-up",
    movementType: "Pull",
    primaryArea: "Lats, biceps",
    equipment: "Pull-up bar",
    guidance: "3-4 sets x 4-12 reps",
    notes: "Use a supinated grip and control the lower.",
  },
  {
    name: "Inverted Row",
    movementType: "Pull",
    primaryArea: "Back, biceps",
    equipment: "Bar or rings",
    guidance: "3-4 sets x 8-15 reps",
    notes: "Keep the body rigid and pull the chest to the bar.",
  },
  {
    name: "Bent-Over Row",
    movementType: "Pull",
    primaryArea: "Back",
    equipment: "Barbell",
    guidance: "3-5 sets x 6-12 reps",
    notes: "Hinge, brace, and pull elbows toward your hips.",
  },
  {
    name: "Dumbbell Row",
    movementType: "Pull",
    primaryArea: "Lats, upper back",
    equipment: "Dumbbell",
    guidance: "3-4 sets x 8-12 each side",
    notes: "Keep shoulders square and pause at the top.",
  },
  {
    name: "Lat Pulldown",
    movementType: "Pull",
    primaryArea: "Lats, upper back",
    equipment: "Cable machine",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Drive elbows down and avoid leaning too far back.",
  },
  {
    name: "Seated Cable Row",
    movementType: "Pull",
    primaryArea: "Mid back",
    equipment: "Cable machine",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Sit tall and pull handles to the torso.",
  },
  {
    name: "Row",
    movementType: "Pull",
    primaryArea: "Back",
    equipment: "Cable, barbell, or dumbbells",
    guidance: "3-5 sets x 8-12 reps",
    notes: "Pull elbows back and pause briefly at the top.",
  },
  {
    name: "Face Pull",
    movementType: "Pull",
    primaryArea: "Rear delts, upper back",
    equipment: "Cable or band",
    guidance: "2-4 sets x 12-20 reps",
    notes: "Pull toward the face with elbows high.",
  },
  {
    name: "Reverse Fly",
    movementType: "Pull",
    primaryArea: "Rear delts",
    equipment: "Dumbbells or cable",
    guidance: "2-4 sets x 12-20 reps",
    notes: "Open the arms with control and keep shoulders down.",
  },
  {
    name: "Curl",
    movementType: "Pull",
    primaryArea: "Biceps",
    equipment: "Dumbbells or barbell",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Keep elbows near your sides and lower slowly.",
  },
  {
    name: "Hammer Curl",
    movementType: "Pull",
    primaryArea: "Biceps, forearms",
    equipment: "Dumbbells",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Use a neutral grip and avoid swinging.",
  },
  {
    name: "Preacher Curl",
    movementType: "Pull",
    primaryArea: "Biceps",
    equipment: "Preacher bench or machine",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Let the arm pad control the motion.",
  },
  {
    name: "Bodyweight Squat",
    movementType: "Squat",
    primaryArea: "Quads, glutes",
    equipment: "Bodyweight",
    guidance: "3-5 sets x 12-25 reps",
    notes: "Track knees over toes and keep your torso tall.",
  },
  {
    name: "Goblet Squat",
    movementType: "Squat",
    primaryArea: "Quads, glutes",
    equipment: "Dumbbell or kettlebell",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Hold the weight close and sit between your hips.",
  },
  {
    name: "Back Squat",
    movementType: "Squat",
    primaryArea: "Quads, glutes",
    equipment: "Barbell",
    guidance: "3-5 sets x 3-8 reps",
    notes: "Brace hard and keep the bar path balanced.",
  },
  {
    name: "Front Squat",
    movementType: "Squat",
    primaryArea: "Quads, trunk",
    equipment: "Barbell",
    guidance: "3-5 sets x 3-8 reps",
    notes: "Keep elbows high and torso upright.",
  },
  {
    name: "Split Squat",
    movementType: "Single-leg",
    primaryArea: "Quads, glutes",
    equipment: "Bodyweight or dumbbells",
    guidance: "3 sets x 8-12 each side",
    notes: "Drop straight down and drive through the front foot.",
  },
  {
    name: "Forward Lunge",
    movementType: "Single-leg",
    primaryArea: "Quads, glutes",
    equipment: "Bodyweight or dumbbells",
    guidance: "3 sets x 8-12 each side",
    notes: "Step forward with control and push back to stand.",
  },
  {
    name: "Reverse Lunge",
    movementType: "Single-leg",
    primaryArea: "Quads, glutes",
    equipment: "Bodyweight or dumbbells",
    guidance: "3 sets x 8-12 each side",
    notes: "Step back softly and keep the front knee tracking.",
  },
  {
    name: "Walking Lunge",
    movementType: "Single-leg",
    primaryArea: "Quads, glutes",
    equipment: "Bodyweight or dumbbells",
    guidance: "3 sets x 10-20 steps",
    notes: "Use steady strides and stay tall between steps.",
  },
  {
    name: "Lunge",
    movementType: "Single-leg",
    primaryArea: "Quads, glutes",
    equipment: "Bodyweight or dumbbells",
    guidance: "3 sets x 8-12 each side",
    notes: "Use an even stride and drive through the front foot.",
  },
  {
    name: "Deadlift",
    movementType: "Hinge",
    primaryArea: "Posterior chain",
    equipment: "Barbell",
    guidance: "3-5 sets x 3-6 reps",
    notes: "Brace hard and keep the bar close.",
  },
  {
    name: "Romanian Deadlift",
    movementType: "Hinge",
    primaryArea: "Hamstrings, glutes",
    equipment: "Barbell or dumbbells",
    guidance: "3-4 sets x 6-12 reps",
    notes: "Push hips back and keep tension in the hamstrings.",
  },
  {
    name: "Hip Thrust",
    movementType: "Hinge",
    primaryArea: "Glutes",
    equipment: "Barbell or bench",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Tuck ribs down and finish with a strong glute squeeze.",
  },
  {
    name: "Good Morning",
    movementType: "Hinge",
    primaryArea: "Hamstrings, glutes",
    equipment: "Barbell",
    guidance: "3-4 sets x 8-12 reps",
    notes: "Hinge from the hips and keep the spine neutral.",
  },
  {
    name: "Hip Hinge",
    movementType: "Hinge",
    primaryArea: "Hamstrings, glutes",
    equipment: "Bodyweight",
    guidance: "3 sets x 10-15 reps",
    notes: "Push hips back while keeping a neutral spine.",
  },
  {
    name: "Leg Curl",
    movementType: "Hinge",
    primaryArea: "Hamstrings",
    equipment: "Machine",
    guidance: "3-4 sets x 10-15 reps",
    notes: "Curl smoothly and control the return.",
  },
  {
    name: "Nordic Curl",
    movementType: "Hinge",
    primaryArea: "Hamstrings",
    equipment: "Bodyweight",
    guidance: "2-4 sets x 3-8 reps",
    notes: "Lower slowly and use assistance as needed.",
  },
  {
    name: "Calf Raise",
    movementType: "Legs",
    primaryArea: "Calves",
    equipment: "Bodyweight, machine, or dumbbells",
    guidance: "3-5 sets x 10-20 reps",
    notes: "Pause at the top and use a full stretch.",
  },
  {
    name: "Seated Calf Raise",
    movementType: "Legs",
    primaryArea: "Calves",
    equipment: "Machine",
    guidance: "3-5 sets x 12-20 reps",
    notes: "Control the bottom stretch and press through the big toe.",
  },
  {
    name: "Plank",
    movementType: "Core",
    primaryArea: "Abs, trunk",
    equipment: "Bodyweight",
    guidance: "3-4 holds x 30-60 sec",
    notes: "Squeeze glutes and keep breathing steady.",
  },
  {
    name: "Side Plank",
    movementType: "Core",
    primaryArea: "Obliques, trunk",
    equipment: "Bodyweight",
    guidance: "3 holds x 20-45 sec each side",
    notes: "Stack shoulders and hips, then press the floor away.",
  },
  {
    name: "Dead Bug",
    movementType: "Core",
    primaryArea: "Abs, trunk",
    equipment: "Bodyweight",
    guidance: "3 sets x 6-10 each side",
    notes: "Keep low back down while limbs move slowly.",
  },
  {
    name: "Bird Dog",
    movementType: "Core",
    primaryArea: "Trunk, glutes",
    equipment: "Bodyweight",
    guidance: "3 sets x 6-10 each side",
    notes: "Reach long and keep hips square.",
  },
  {
    name: "Crunch",
    movementType: "Core",
    primaryArea: "Abs",
    equipment: "Bodyweight",
    guidance: "3 sets x 12-20 reps",
    notes: "Curl ribs toward hips without pulling on your neck.",
  },
  {
    name: "Sit-up",
    movementType: "Core",
    primaryArea: "Abs, hip flexors",
    equipment: "Bodyweight",
    guidance: "3 sets x 8-15 reps",
    notes: "Rise with control and avoid yanking the neck.",
  },
  {
    name: "Leg Raise",
    movementType: "Core",
    primaryArea: "Abs, hip flexors",
    equipment: "Bodyweight",
    guidance: "3 sets x 8-15 reps",
    notes: "Lower slowly and keep your low back controlled.",
  },
  {
    name: "Hanging Knee Raise",
    movementType: "Core",
    primaryArea: "Abs, hip flexors",
    equipment: "Pull-up bar",
    guidance: "3 sets x 8-12 reps",
    notes: "Tuck pelvis and avoid swinging.",
  },
  {
    name: "Russian Twist",
    movementType: "Core",
    primaryArea: "Obliques",
    equipment: "Bodyweight or medicine ball",
    guidance: "3 sets x 12-20 total reps",
    notes: "Rotate the rib cage while staying tall.",
  },
  {
    name: "Pallof Press",
    movementType: "Core",
    primaryArea: "Obliques, trunk",
    equipment: "Cable or band",
    guidance: "3 sets x 8-12 each side",
    notes: "Press straight out and resist rotation.",
  },
  {
    name: "Wood Chop",
    movementType: "Core",
    primaryArea: "Obliques, trunk",
    equipment: "Cable, band, or medicine ball",
    guidance: "3 sets x 8-12 each side",
    notes: "Rotate through the torso with controlled hips.",
  },
  {
    name: "Burpee",
    movementType: "Conditioning",
    primaryArea: "Full body",
    equipment: "Bodyweight",
    guidance: "4-8 rounds x 20-45 sec",
    notes: "Move smoothly before chasing speed.",
  },
  {
    name: "Mountain Climber",
    movementType: "Conditioning",
    primaryArea: "Full body, core",
    equipment: "Bodyweight",
    guidance: "4-8 rounds x 20-40 sec",
    notes: "Keep shoulders over hands and drive knees rhythmically.",
  },
  {
    name: "Jumping Jack",
    movementType: "Conditioning",
    primaryArea: "Full body, cardio",
    equipment: "Bodyweight",
    guidance: "3-6 rounds x 30-60 sec",
    notes: "Land softly and keep a steady rhythm.",
  },
  {
    name: "Jump Rope",
    movementType: "Conditioning",
    primaryArea: "Cardio, calves",
    equipment: "Jump rope",
    guidance: "5-10 rounds x 30-60 sec",
    notes: "Stay tall and use small wrist turns.",
  },
  {
    name: "High Knees",
    movementType: "Conditioning",
    primaryArea: "Cardio, hip flexors",
    equipment: "Bodyweight",
    guidance: "4-8 rounds x 20-40 sec",
    notes: "Stay springy and drive knees up quickly.",
  },
  {
    name: "Sprint",
    movementType: "Conditioning",
    primaryArea: "Cardio, legs",
    equipment: "Track or open space",
    guidance: "4-10 efforts x 10-30 sec",
    notes: "Build speed gradually and recover fully.",
  },
  {
    name: "Kettlebell Swing",
    movementType: "Power",
    primaryArea: "Posterior chain",
    equipment: "Kettlebell",
    guidance: "4-6 sets x 10-20 reps",
    notes: "Snap the hips and let the bell float.",
  },
  {
    name: "Medicine Ball Slam",
    movementType: "Power",
    primaryArea: "Full body",
    equipment: "Medicine ball",
    guidance: "4-6 sets x 6-12 reps",
    notes: "Reach tall and slam with the whole body.",
  },
  {
    name: "Box Jump",
    movementType: "Power",
    primaryArea: "Legs, power",
    equipment: "Box",
    guidance: "3-5 sets x 3-6 reps",
    notes: "Land quietly and step down between reps.",
  },
  {
    name: "Arm Circles",
    movementType: "Mobility",
    primaryArea: "Shoulders",
    equipment: "Bodyweight",
    guidance: "2 rounds x 20-30 sec each direction",
    notes: "Use smooth circles and keep ribs stacked.",
  },
  {
    name: "Hip Opener",
    movementType: "Mobility",
    primaryArea: "Hips",
    equipment: "Bodyweight",
    guidance: "2-3 rounds x 30-45 sec each side",
    notes: "Move slowly through comfortable ranges.",
  },
  {
    name: "World's Greatest Stretch",
    movementType: "Mobility",
    primaryArea: "Hips, hamstrings, thoracic spine",
    equipment: "Bodyweight",
    guidance: "2 rounds x 4-6 each side",
    notes: "Move from lunge to rotation with slow breathing.",
  },
  {
    name: "Hamstring Stretch",
    movementType: "Mobility",
    primaryArea: "Hamstrings",
    equipment: "Bodyweight",
    guidance: "2-3 holds x 30-60 sec each side",
    notes: "Hinge forward gently and breathe into the stretch.",
  },
  {
    name: "Couch Stretch",
    movementType: "Mobility",
    primaryArea: "Hip flexors, quads",
    equipment: "Wall or bench",
    guidance: "2-3 holds x 30-60 sec each side",
    notes: "Squeeze the glute and keep ribs stacked.",
  },
  {
    name: "Child's Pose",
    movementType: "Mobility",
    primaryArea: "Back, hips",
    equipment: "Bodyweight",
    guidance: "2-3 holds x 30-60 sec",
    notes: "Reach long and breathe into the back.",
  },
  {
    name: "Thoracic Rotation",
    movementType: "Mobility",
    primaryArea: "Upper back",
    equipment: "Bodyweight",
    guidance: "2 rounds x 6-10 each side",
    notes: "Rotate through the upper back without forcing range.",
  },
  {
    name: "Farmer's Carry",
    movementType: "Carry",
    primaryArea: "Grip, trunk",
    equipment: "Dumbbells or kettlebells",
    guidance: "3-5 carries x 20-40 m",
    notes: "Walk tall and keep shoulders packed.",
  },
  {
    name: "Suitcase Carry",
    movementType: "Carry",
    primaryArea: "Obliques, grip",
    equipment: "Dumbbell or kettlebell",
    guidance: "3-5 carries x 20-40 m each side",
    notes: "Resist leaning and walk with even steps.",
  },
  {
    name: "Overhead Carry",
    movementType: "Carry",
    primaryArea: "Shoulders, trunk",
    equipment: "Dumbbell, kettlebell, or plate",
    guidance: "3-5 carries x 10-30 m",
    notes: "Lock in the shoulder and keep ribs down.",
  },
  {
    name: "Dead Hang",
    movementType: "Grip",
    primaryArea: "Grip, shoulders",
    equipment: "Pull-up bar",
    guidance: "3-5 hangs x 15-45 sec",
    notes: "Hang actively and breathe steadily.",
  },
  {
    name: "Plate Pinch",
    movementType: "Grip",
    primaryArea: "Grip, forearms",
    equipment: "Weight plates",
    guidance: "3-5 holds x 15-45 sec",
    notes: "Pinch plates smoothly and keep wrists neutral.",
  },
  {
    name: "Power Clean",
    movementType: "Olympic",
    primaryArea: "Full body, power",
    equipment: "Barbell",
    guidance: "4-6 sets x 2-5 reps",
    notes: "Pull fast and receive with a strong rack.",
  },
  {
    name: "Hang Clean",
    movementType: "Olympic",
    primaryArea: "Full body, power",
    equipment: "Barbell",
    guidance: "4-6 sets x 2-5 reps",
    notes: "Start from the hang and extend through the hips.",
  },
  {
    name: "Push Press",
    movementType: "Olympic",
    primaryArea: "Shoulders, power",
    equipment: "Barbell or dumbbells",
    guidance: "3-5 sets x 3-6 reps",
    notes: "Dip straight down and drive the weight overhead.",
  },
  {
    name: "Broad Jump",
    movementType: "Athletic",
    primaryArea: "Legs, power",
    equipment: "Bodyweight",
    guidance: "3-5 sets x 3-5 reps",
    notes: "Swing arms, jump long, and land softly.",
  },
  {
    name: "Skater Jump",
    movementType: "Athletic",
    primaryArea: "Glutes, lateral power",
    equipment: "Bodyweight",
    guidance: "3-5 sets x 6-10 each side",
    notes: "Push laterally and stick each landing.",
  },
];
const FITNESS_MOVEMENT_GROUP_SAMPLES: FitnessMovementGroupSample[] = [
  {
    label: "Push",
    icon: Dumbbell,
    subcategories: [
      {
        label: "Chest",
        exercises: [
          "Push-up",
          "Incline Push-up",
          "Decline Push-up",
          "Bench Press",
          "Incline Bench Press",
          "Dumbbell Press",
          "Chest Fly",
        ],
      },
      {
        label: "Shoulders",
        exercises: ["Shoulder Press", "Pike Push-up", "Lateral Raise", "Front Raise", "Arnold Press"],
      },
      {
        label: "Triceps",
        exercises: ["Dip", "Close-Grip Push-up", "Triceps Extension", "Skull Crusher"],
      },
    ],
  },
  {
    label: "Pull",
    icon: GripVertical,
    subcategories: [
      {
        label: "Back",
        exercises: [
          "Pull-up",
          "Chin-up",
          "Inverted Row",
          "Bent-Over Row",
          "Dumbbell Row",
          "Lat Pulldown",
          "Seated Cable Row",
          "Row",
        ],
      },
      { label: "Rear Delts", exercises: ["Face Pull", "Reverse Fly"] },
      { label: "Biceps", exercises: ["Curl", "Hammer Curl", "Preacher Curl"] },
    ],
  },
  {
    label: "Legs",
    icon: ListChecks,
    subcategories: [
      {
        label: "Squat",
        exercises: ["Bodyweight Squat", "Goblet Squat", "Back Squat", "Front Squat", "Split Squat"],
      },
      { label: "Lunge", exercises: ["Forward Lunge", "Reverse Lunge", "Walking Lunge", "Lunge"] },
      {
        label: "Hinge",
        exercises: ["Deadlift", "Romanian Deadlift", "Hip Thrust", "Good Morning", "Hip Hinge"],
      },
      { label: "Hamstrings", exercises: ["Leg Curl", "Nordic Curl"] },
      { label: "Calves", exercises: ["Calf Raise", "Seated Calf Raise"] },
    ],
  },
  {
    label: "Core",
    icon: CheckSquare,
    subcategories: [
      { label: "Stability", exercises: ["Plank", "Side Plank", "Dead Bug", "Bird Dog"] },
      { label: "Abs", exercises: ["Crunch", "Sit-up", "Leg Raise", "Hanging Knee Raise"] },
      { label: "Rotation", exercises: ["Russian Twist", "Pallof Press", "Wood Chop"] },
    ],
  },
  {
    label: "Conditioning",
    icon: Clock,
    subcategories: [
      { label: "Full Body", exercises: ["Burpee", "Mountain Climber", "Jumping Jack"] },
      { label: "Cardio", exercises: ["Jump Rope", "High Knees", "Sprint"] },
      { label: "Power", exercises: ["Kettlebell Swing", "Medicine Ball Slam", "Box Jump"] },
    ],
  },
  {
    label: "Mobility",
    icon: Settings2,
    subcategories: [
      { label: "Warmup", exercises: ["Arm Circles", "Hip Opener", "World's Greatest Stretch"] },
      {
        label: "Recovery",
        exercises: ["Hamstring Stretch", "Couch Stretch", "Child's Pose", "Thoracic Rotation"],
      },
    ],
  },
  {
    label: "Carries / Grip",
    icon: GripVertical,
    subcategories: [
      { label: "Carries", exercises: ["Farmer's Carry", "Suitcase Carry", "Overhead Carry"] },
      { label: "Grip", exercises: ["Dead Hang", "Plate Pinch"] },
    ],
  },
  {
    label: "Olympic / Athletic",
    icon: Dumbbell,
    subcategories: [
      { label: "Explosive", exercises: ["Power Clean", "Hang Clean", "Push Press"] },
      { label: "Athletic", exercises: ["Broad Jump", "Skater Jump"] },
    ],
  },
];
const FITNESS_EXERCISE_SAMPLE_BY_NAME = new Map(
  FITNESS_EXERCISE_SAMPLES.map((exercise) => [exercise.name, exercise]),
);
function getFitnessExerciseId(exercise: Pick<FitnessExerciseSample, "name">) {
  return exercise.name;
}

function getFitnessGuidancePart(guidance: string, pattern: RegExp) {
  return guidance.match(pattern)?.[1]?.trim() ?? "";
}

function getExactFitnessGuidanceNumber(value: string) {
  return value.match(/^\s*(\d+)/)?.[1] ?? "";
}

function getInitialFitnessWorkoutExerciseDetail(
  exercise: FitnessExerciseSample,
): FitnessWorkoutExerciseDetail {
  const guidanceSets = getFitnessGuidancePart(
    exercise.guidance,
    /\b(\d+(?:-\d+)?)\s*(?:sets?|holds?|rounds?|carries|hangs?|efforts?)\b/i,
  );
  const guidanceReps = getFitnessGuidancePart(
    exercise.guidance,
    /\bx\s*(\d+(?:-\d+)?(?:\s*(?:each side|each|total reps|steps|reps?))?)/i,
  );
  const guidanceDuration = getFitnessGuidancePart(
    exercise.guidance,
    /\bx\s*(\d+(?:-\d+)?\s*(?:sec|secs|seconds|min|mins|minutes)\b)/i,
  );
  const durationUnit = guidanceDuration.match(
    /\b(sec|secs|seconds|min|mins|minutes)\b/i,
  )?.[1];

  return {
    sets: getExactFitnessGuidanceNumber(guidanceSets) || "1",
    reps: guidanceDuration ? "" : getExactFitnessGuidanceNumber(guidanceReps),
    duration: durationUnit
      ? `${getExactFitnessGuidanceNumber(guidanceDuration)} ${durationUnit}`
      : "",
  };
}

function getFallbackFitnessWorkoutExerciseDetail(): FitnessWorkoutExerciseDetail {
  return { sets: "1", reps: "", duration: "" };
}

function getFitnessWorkoutExerciseDetail(
  exercise: FitnessExerciseSample,
  detailsByExerciseId: Record<string, FitnessWorkoutExerciseDetail>,
) {
  return (
    detailsByExerciseId[getFitnessExerciseId(exercise)] ??
    getFallbackFitnessWorkoutExerciseDetail()
  );
}

function shouldUseFitnessDurationDetail(exercise: FitnessExerciseSample) {
  return Boolean(getInitialFitnessWorkoutExerciseDetail(exercise).duration);
}

function formatFitnessWorkoutExerciseDetail(
  detail: FitnessWorkoutExerciseDetail,
  weight = "",
) {
  const sets = detail.sets.trim();
  const reps = detail.reps.trim();
  const duration = detail.duration.trim();
  const trimmedWeight = weight.trim();
  const formattedSets = sets ? (/\bsets?\b/i.test(sets) ? sets : `${sets} sets`) : null;
  const formattedReps = reps
    ? /\b(?:reps?|steps)\b|\beach(?:\s+side)?\b/i.test(reps)
      ? reps
      : `${reps} reps`
    : null;

  return [
    formattedSets,
    duration || formattedReps,
    trimmedWeight || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
const GROCERY_FOOD_ACTION_TAB_IDS = new Set<NutritionFoodActionTabId>([
  "search",
  "grocery",
  "scan",
  "custom",
  "recipes",
  "chef",
]);
const GROCERY_LOCATION_OPTIONS = [
  { value: "pantry", label: "Pantry" },
  { value: "fridge", label: "Fridge" },
  { value: "freezer", label: "Freezer" },
  { value: "counter", label: "Counter" },
  { value: "other", label: "Other" },
] as const;
const GROCERY_CUSTOM_CALORIES_FIELD_ID = "grocery-custom-calories";
const GROCERY_CUSTOM_CARBS_FIELD_ID = "grocery-custom-carbs";
const GROCERY_CUSTOM_PROTEIN_FIELD_ID = "grocery-custom-protein";
const GROCERY_CUSTOM_FAT_FIELD_ID = "grocery-custom-fat";
const NUTRITION_MEAL_TEMPLATE_ICON_OPTIONS = [
  "🍽️",
  "🥗",
  "🍳",
  "🍔",
  "🍗",
  "🍚",
  "🍜",
  "🥪",
  "🥩",
  "🍣",
  "🥣",
  "🥤",
] as const;
const NOTE_DATABASE_TITLE_FIELD_NAMES = new Set([
  "name",
  "title",
  "meal",
  "meal name",
  "entry",
  "item",
]);

export const NOTE_DIVIDER_LINE_CLASS =
  "h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),rgba(16,185,129,0.16),rgba(255,255,255,0.07),transparent)]";

function DatabaseInlineIcon({ iconKey }: { iconKey?: string | null }) {
  const normalizedIconKey = iconKey?.trim();

  if (!normalizedIconKey || normalizedIconKey.toLowerCase() === "database") {
    return <Table2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  const resolvedIcon = resolveNoteIcon(normalizedIconKey);
  if (resolvedIcon.kind === "lucide") {
    const Icon = resolvedIcon.Icon;
    return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (resolvedIcon.kind === "iconify") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        <IconifyIcon icon={resolvedIcon.icon} className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="text-sm leading-none" aria-hidden="true">
      {resolvedIcon.emoji}
    </span>
  );
}

function NutritionMealTemplateIcon({ icon }: { icon?: string | null }) {
  const resolvedIcon = resolveNoteIcon(icon?.trim() || DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON);

  if (resolvedIcon.kind === "lucide") {
    const Icon = resolvedIcon.Icon;
    return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  if (resolvedIcon.kind === "iconify") {
    return (
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
        <IconifyIcon icon={resolvedIcon.icon} className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span className="text-sm leading-none" aria-hidden="true">
      {resolvedIcon.emoji}
    </span>
  );
}

export type NoteSubpageMarker = {
  title: string;
  subpageId: string | null;
};

export type NoteDatabaseMarker = {
  title: string;
  databaseId: string;
};

export type NoteDatabaseFieldDefinition = {
  id: string;
  name: string;
  type: NoteDatabaseFieldType;
  isTitle?: boolean;
};

export type NoteDatabaseViewDefinition = {
  id: string;
  name: string;
  type: NoteDatabaseViewType;
  visibleFieldIds: string[];
};

export type NoteDatabaseDefinition = {
  id: string;
  title: string;
  titleFieldId?: string;
  fields: NoteDatabaseFieldDefinition[];
  views?: NoteDatabaseViewDefinition[];
  activeViewId?: string;
  pinnedSurface?: "body";
  lockedSystemDatabase?: boolean;
  systemDatabaseKey?: string;
  iconKey?: string;
};

export type NoteDatabaseDefinitions = Record<string, NoteDatabaseDefinition>;

export type NoteDatabaseEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

export type NoteDatabaseEntries = Record<string, NoteDatabaseEntry[]>;

export function isStandaloneNoteDividerLine(line: string) {
  return line.trim() === NOTE_DIVIDER_MARKER;
}

export function parseStandaloneNoteSubpageMarker(line: string): NoteSubpageMarker | null {
  const match = line.trim().match(NOTE_SUBPAGE_MARKER_REGEX);
  if (!match) return null;

  return {
    title: match[1]?.trim() || NOTE_SUBPAGE_TITLE_FALLBACK,
    subpageId: match[2]?.trim() || null,
  };
}

export function parseStandaloneNoteDatabaseMarker(line: string): NoteDatabaseMarker | null {
  const match = line.trim().match(NOTE_DATABASE_MARKER_REGEX);
  if (!match?.[2]) return null;

  return {
    title: match[1]?.trim() || NOTE_DATABASE_TITLE_FALLBACK,
    databaseId: match[2].trim(),
  };
}

let openSlashMenuCount = 0;

type NoteSlashTextareaProps = {
  value: string;
  onValueChange: (value: string) => void;
  databaseDefinitions?: NoteDatabaseDefinitions | null;
  onDatabaseDefinitionsChange?: (databases: NoteDatabaseDefinitions) => void;
  databaseEntries?: NoteDatabaseEntries | null;
  onDatabaseEntriesChange?: (entries: NoteDatabaseEntries) => void;
  onCreateSubpage?: () => Promise<{ id: string; title: string; href?: string } | null>;
  onSubpageCreated?: (
    subpage: { id: string; title: string; href?: string },
    parentContent: string,
  ) => Promise<void> | void;
  onOpenSubpage?: (subpageId: string) => void;
  onOpenDatabase?: (databaseId: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

export type NoteTextFormatCommand = "bold" | "italic" | "underline";

export type NoteSlashTextareaHandle = {
  applyTextFormat: (command: NoteTextFormatCommand) => void;
};

type NoteTextSegment = {
  type: "text";
  text: string;
};

type NoteDividerSegment = {
  type: "divider";
};

type NoteChecklistSegment = {
  type: "checklist";
  checked: boolean;
  text: string;
};

type NoteListSegment = {
  type: "list";
  kind: "bullet" | "dash";
  text: string;
};

type NoteSubpageSegment = NoteSubpageMarker & {
  type: "subpage";
  marker: string;
};

type NoteDatabaseSegment = NoteDatabaseMarker & {
  type: "database";
  marker: string;
};

type NoteSegment =
  | NoteTextSegment
  | NoteDividerSegment
  | NoteChecklistSegment
  | NoteListSegment
  | NoteSubpageSegment
  | NoteDatabaseSegment;

type SlashTrigger = {
  segmentIndex: number;
  triggerIndex: number;
} | null;

type PendingSelection =
  | {
      type: "text";
      segmentIndex: number;
      caretPosition: number;
      selectionEnd?: number;
    }
  | {
      type: "checklist";
      segmentIndex: number;
      caretPosition: number;
      selectionEnd?: number;
    }
  | {
      type: "list";
      segmentIndex: number;
      caretPosition: number;
      selectionEnd?: number;
    }
  | {
      type: "block";
      segmentIndex: number;
    };

type EditableTextSelection = {
  type: "text" | "checklist" | "list";
  segmentId: string;
  segmentIndex: number;
  selectionStart: number;
  selectionEnd: number;
  control: EditableTextControl | null;
};

type EditableTextControl = HTMLDivElement;

type InlineFormatNode =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "format";
      format: NoteTextFormatCommand;
      children: InlineFormatNode[];
    };

const NOTE_TEXT_FORMAT_MARKERS: Record<NoteTextFormatCommand, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["<u>", "</u>"],
};

const NOTE_SEGMENT_DRAG_ID_PREFIX = "note-segment-";
const NOTE_TEXT_ACTION_BAR_SELECTOR = "[data-note-text-action-bar]";

function buildEditableSegmentId(type: EditableTextSelection["type"], segmentIndex: number) {
  return `${type}-${segmentIndex}`;
}

function getClosestElement(target: EventTarget | null) {
  return target instanceof Element ? target : null;
}

function isNoteTextActionBarTarget(target: EventTarget | null) {
  return Boolean(getClosestElement(target)?.closest(NOTE_TEXT_ACTION_BAR_SELECTOR));
}

function getInlineFormatMarkerAt(text: string, index: number): NoteTextFormatCommand | null {
  if (text.startsWith("**", index)) return "bold";
  if (text.startsWith("<u>", index) || text.startsWith("</u>", index)) return "underline";
  if (text[index] === "*" && text[index - 1] !== "*" && text[index + 1] !== "*") {
    return "italic";
  }

  return null;
}

function getInlineFormatMarkerLength(text: string, index: number) {
  if (text.startsWith("**", index)) return 2;
  if (text.startsWith("<u>", index)) return 3;
  if (text.startsWith("</u>", index)) return 4;
  if (text[index] === "*") return 1;
  return 0;
}

function findSingleAsterisk(text: string, startIndex: number) {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] === "*" && text[index - 1] !== "*" && text[index + 1] !== "*") {
      return index;
    }
  }

  return -1;
}

function findNextInlineFormatMatch(text: string, startIndex: number) {
  const candidates: Array<{
    format: NoteTextFormatCommand;
    start: number;
    end: number;
    prefix: string;
    suffix: string;
  }> = [];
  const boldStart = text.indexOf("**", startIndex);
  if (boldStart !== -1) {
    const boldEnd = text.indexOf("**", boldStart + 2);
    if (boldEnd !== -1) {
      candidates.push({
        format: "bold",
        start: boldStart,
        end: boldEnd,
        prefix: "**",
        suffix: "**",
      });
    }
  }

  const underlineStart = text.indexOf("<u>", startIndex);
  if (underlineStart !== -1) {
    const underlineEnd = text.indexOf("</u>", underlineStart + 3);
    if (underlineEnd !== -1) {
      candidates.push({
        format: "underline",
        start: underlineStart,
        end: underlineEnd,
        prefix: "<u>",
        suffix: "</u>",
      });
    }
  }

  const italicStart = findSingleAsterisk(text, startIndex);
  if (italicStart !== -1) {
    const italicEnd = findSingleAsterisk(text, italicStart + 1);
    if (italicEnd !== -1) {
      candidates.push({
        format: "italic",
        start: italicStart,
        end: italicEnd,
        prefix: "*",
        suffix: "*",
      });
    }
  }

  return candidates
    .filter((candidate) => candidate.end > candidate.start)
    .sort((first, second) => first.start - second.start || second.prefix.length - first.prefix.length)[0] ?? null;
}

function parseInlineFormatting(text: string): InlineFormatNode[] {
  const nodes: InlineFormatNode[] = [];
  let index = 0;

  while (index < text.length) {
    const match = findNextInlineFormatMatch(text, index);

    if (!match) {
      nodes.push({ type: "text", text: text.slice(index) });
      break;
    }

    if (match.start > index) {
      nodes.push({ type: "text", text: text.slice(index, match.start) });
    }

    const contentStart = match.start + match.prefix.length;
    const content = text.slice(contentStart, match.end);
    nodes.push({
      type: "format",
      format: match.format,
      children: parseInlineFormatting(content),
    });
    index = match.end + match.suffix.length;
  }

  return nodes;
}

function renderInlineFormattingNodes(nodes: InlineFormatNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    if (node.type === "text") {
      return <Fragment key={key}>{node.text}</Fragment>;
    }

    const className =
      node.format === "bold"
        ? "font-bold"
        : node.format === "italic"
          ? "italic"
          : "underline decoration-white/75 underline-offset-2";

    return (
      <span key={key} data-note-inline-format={node.format} className={className}>
        {renderInlineFormattingNodes(node.children, key)}
      </span>
    );
  });
}

function serializeEditableNodeList(nodes: NodeListOf<ChildNode> | ChildNode[]) {
  let serialized = "";

  Array.from(nodes).forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      serialized += node.textContent ?? "";
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const tagName = node.tagName.toLowerCase();
    if (tagName === "br") {
      serialized += "\n";
      return;
    }

    const isBlock = tagName === "div" || tagName === "p" || tagName === "li";
    if (isBlock && index > 0 && serialized.length > 0 && !serialized.endsWith("\n")) {
      serialized += "\n";
    }

    const childSerialized = serializeEditableNodeList(node.childNodes);
    const format = node.dataset.noteInlineFormat as NoteTextFormatCommand | undefined;
    const markers = format ? NOTE_TEXT_FORMAT_MARKERS[format] : null;

    serialized += markers ? `${markers[0]}${childSerialized}${markers[1]}` : childSerialized;

    if (isBlock && index < nodes.length - 1 && !serialized.endsWith("\n")) {
      serialized += "\n";
    }
  });

  return serialized.replace(/\u00a0/g, " ");
}

function readSerializedEditableText(control: EditableTextControl) {
  return serializeEditableNodeList(control.childNodes);
}

function readPlainEditableNodeList(nodes: NodeListOf<ChildNode> | ChildNode[]) {
  let plainText = "";

  Array.from(nodes).forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      plainText += node.textContent ?? "";
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const tagName = node.tagName.toLowerCase();
    if (tagName === "br") {
      plainText += "\n";
      return;
    }

    const isBlock = tagName === "div" || tagName === "p" || tagName === "li";
    if (isBlock && index > 0 && plainText.length > 0 && !plainText.endsWith("\n")) {
      plainText += "\n";
    }

    plainText += readPlainEditableNodeList(node.childNodes);

    if (isBlock && index < nodes.length - 1 && !plainText.endsWith("\n")) {
      plainText += "\n";
    }
  });

  return plainText.replace(/\u00a0/g, " ");
}

function serializedOffsetFromPlainOffset(serializedText: string, plainOffset: number) {
  const clampedPlainOffset = Math.max(0, plainOffset);
  const openFormats: NoteTextFormatCommand[] = [];
  let currentPlainOffset = 0;
  let index = 0;

  while (index < serializedText.length) {
    const format = getInlineFormatMarkerAt(serializedText, index);
    const markerLength = getInlineFormatMarkerLength(serializedText, index);

    if (format && markerLength > 0) {
      const isClosing = openFormats[openFormats.length - 1] === format;

      if (currentPlainOffset === clampedPlainOffset && isClosing) {
        return index;
      }

      if (isClosing) {
        openFormats.pop();
      } else {
        openFormats.push(format);
      }

      index += markerLength;
      continue;
    }

    if (currentPlainOffset === clampedPlainOffset) {
      return index;
    }

    currentPlainOffset += 1;
    index += 1;
  }

  return serializedText.length;
}

function getPlainTextOffsetInEditable(control: EditableTextControl, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(control);
  range.setEnd(node, offset);
  const fragment = range.cloneContents();
  return readPlainEditableNodeList(Array.from(fragment.childNodes)).length;
}

function getSerializedSelectionFromEditable(
  control: EditableTextControl,
  serializedText: string,
) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return {
      selectionStart: serializedText.length,
      selectionEnd: serializedText.length,
    };
  }

  const range = selection.getRangeAt(0);
  if (
    !control.contains(range.startContainer) ||
    !control.contains(range.endContainer)
  ) {
    return {
      selectionStart: serializedText.length,
      selectionEnd: serializedText.length,
    };
  }

  const plainStart = getPlainTextOffsetInEditable(
    control,
    range.startContainer,
    range.startOffset,
  );
  const plainEnd = getPlainTextOffsetInEditable(control, range.endContainer, range.endOffset);
  const selectionStart = serializedOffsetFromPlainOffset(serializedText, Math.min(plainStart, plainEnd));
  const selectionEnd = serializedOffsetFromPlainOffset(serializedText, Math.max(plainStart, plainEnd));

  return { selectionStart, selectionEnd };
}

function getEditableTextBoundary(control: HTMLElement, plainOffset: number) {
  const clampedPlainOffset = Math.max(0, plainOffset);
  const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;
    const nextOffset = currentOffset + textLength;

    if (clampedPlainOffset <= nextOffset) {
      return {
        node: currentNode,
        offset: Math.max(0, Math.min(clampedPlainOffset - currentOffset, textLength)),
      };
    }

    currentOffset = nextOffset;
    currentNode = walker.nextNode();
  }

  return { node: control, offset: control.childNodes.length };
}

function getSerializedEditableNodeLength(node: ChildNode): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (!(node instanceof HTMLElement)) return 0;
  if (node.tagName.toLowerCase() === "br") return 1;

  const childrenLength = Array.from(node.childNodes).reduce<number>(
    (total, childNode) => total + getSerializedEditableNodeLength(childNode),
    0,
  );
  const format = node.dataset.noteInlineFormat as NoteTextFormatCommand | undefined;
  const markers = format ? NOTE_TEXT_FORMAT_MARKERS[format] : null;

  return childrenLength + (markers ? markers[0].length + markers[1].length : 0);
}

function getSerializedEditableBoundary(
  parent: Node,
  nodes: NodeListOf<ChildNode>,
  serializedOffset: number,
): { node: Node; offset: number } {
  const clampedOffset = Math.max(0, serializedOffset);
  let currentOffset = 0;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;

    const nodeLength = getSerializedEditableNodeLength(node);
    if (clampedOffset > currentOffset + nodeLength) {
      currentOffset += nodeLength;
      continue;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return {
        node,
        offset: Math.max(0, Math.min(clampedOffset - currentOffset, node.textContent?.length ?? 0)),
      };
    }

    if (!(node instanceof HTMLElement)) {
      return { node: parent, offset: index };
    }

    const format = node.dataset.noteInlineFormat as NoteTextFormatCommand | undefined;
    const markers = format ? NOTE_TEXT_FORMAT_MARKERS[format] : null;
    if (!markers) {
      return getSerializedEditableBoundary(
        node,
        node.childNodes,
        clampedOffset - currentOffset,
      );
    }

    const contentStart = currentOffset + markers[0].length;
    const contentEnd =
      contentStart +
      Array.from(node.childNodes).reduce<number>(
        (total, childNode) => total + getSerializedEditableNodeLength(childNode),
        0,
      );

    if (clampedOffset <= contentStart) {
      return getEditableTextBoundary(node, 0);
    }

    if (clampedOffset <= contentEnd) {
      return getSerializedEditableBoundary(node, node.childNodes, clampedOffset - contentStart);
    }

    return { node: parent, offset: index + 1 };
  }

  return { node: parent, offset: nodes.length };
}

function setSerializedSelectionInEditable(
  control: EditableTextControl,
  selectionStart: number,
  selectionEnd: number,
) {
  const startBoundary = getSerializedEditableBoundary(control, control.childNodes, selectionStart);
  const endBoundary = getSerializedEditableBoundary(control, control.childNodes, selectionEnd);
  const range = document.createRange();

  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function buildNoteSegmentDragId(segmentIndex: number) {
  return `${NOTE_SEGMENT_DRAG_ID_PREFIX}${segmentIndex}`;
}

function parseNoteSegmentDragId(id: string | number) {
  const idString = String(id);
  if (!idString.startsWith(NOTE_SEGMENT_DRAG_ID_PREFIX)) return null;

  const index = Number(idString.slice(NOTE_SEGMENT_DRAG_ID_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function buildDatabaseFieldDragId(databaseId: string, fieldId: string) {
  return `${NOTE_DATABASE_FIELD_DRAG_ID_PREFIX}${databaseId}:${fieldId}`;
}

function parseDatabaseFieldDragId(id: string | number) {
  const idString = String(id);
  if (!idString.startsWith(NOTE_DATABASE_FIELD_DRAG_ID_PREFIX)) return null;

  const value = idString.slice(NOTE_DATABASE_FIELD_DRAG_ID_PREFIX.length);
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) return null;

  return {
    databaseId: value.slice(0, separatorIndex),
    fieldId: value.slice(separatorIndex + 1),
  };
}

function getNoteSegmentDragLabel(segment: NoteSegment) {
  if (segment.type === "text") return segment.text.trim() ? "text" : "empty text";
  if (segment.type === "divider") return "divider";
  if (segment.type === "checklist") return "checklist";
  if (segment.type === "list") return segment.kind === "bullet" ? "bullet list" : "dash list";
  if (segment.type === "subpage") return "subpage";
  return "database";
}

function preventTouchScrollWhileDragging(event: TouchEvent) {
  event.preventDefault();
}

type SortableNoteSegmentProps = {
  id: string;
  label: string;
  lockedDragSize: NoteSegmentDragSize | null;
  children: ReactNode;
};

type NoteSegmentDragSize = {
  id: string;
  width: number;
  height: number;
};

function SortableNoteSegment({ id, label, lockedDragSize, children }: SortableNoteSegmentProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [fallbackDragSize, setFallbackDragSize] = useState<NoteSegmentDragSize | null>(null);
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const setSortableNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  const transformStyle = transform ? CSS.Translate.toString(transform) : undefined;
  const activeDragSize =
    isDragging && lockedDragSize?.id === id ? lockedDragSize : fallbackDragSize;
  const style: CSSProperties = {
    ...(transformStyle ? { transform: transformStyle } : undefined),
    transition,
    ...(isDragging && activeDragSize
      ? {
          boxSizing: "border-box",
          height: activeDragSize.height,
          minHeight: activeDragSize.height,
          width: activeDragSize.width,
          willChange: "transform",
        }
      : undefined),
  };

  useLayoutEffect(() => {
    if (!isDragging) {
      setFallbackDragSize(null);
      return;
    }

    if (lockedDragSize?.id === id) {
      setFallbackDragSize(null);
      return;
    }

    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return;

    setFallbackDragSize({
      id,
      width: rect.width,
      height: rect.height,
    });
  }, [id, isDragging, lockedDragSize]);

  return (
    <div
      ref={setSortableNodeRef}
      style={style}
      className={`group/note-sortable relative grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-0 rounded-lg transition-[background-color,box-shadow,opacity] duration-150 sm:grid-cols-[0.875rem_minmax(0,1fr)] ${
        isDragging
          ? "z-30 bg-white/[0.045] shadow-[0_18px_45px_-28px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.08]"
          : "hover:bg-white/[0.012]"
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label} block`}
        className="-ml-2 mt-0.5 flex h-8 w-6 cursor-grab touch-none select-none items-center justify-center rounded-md text-white/18 opacity-60 outline-none transition hover:bg-white/[0.055] hover:text-white/62 hover:opacity-100 active:cursor-grabbing active:bg-white/[0.07] active:text-white/72 active:opacity-100 focus-visible:bg-white/[0.075] focus-visible:text-white/72 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/18 sm:-ml-1 sm:h-6 sm:w-4 sm:opacity-0 sm:group-hover/note-sortable:opacity-100 sm:group-focus-within/note-sortable:opacity-100 [-webkit-touch-callout:none]"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function buildStandaloneLineInsertion(marker: string, beforeSlash: string, afterCommand: string) {
  const currentLineStart = beforeSlash.lastIndexOf("\n") + 1;
  const currentLinePrefix = beforeSlash.slice(currentLineStart);
  const beforeWithoutBlankPrefix =
    currentLinePrefix.trim().length === 0 ? beforeSlash.slice(0, currentLineStart) : beforeSlash;
  const normalizedBefore = beforeWithoutBlankPrefix.replace(/\n{2,}$/, "\n");
  const afterWithoutInlineWhitespace = afterCommand.replace(/^[\t ]*(?=\n|$)/, "");
  const normalizedAfter = afterWithoutInlineWhitespace.replace(/^\n{2,}/, "\n");
  const prefix = normalizedBefore.length > 0 && !normalizedBefore.endsWith("\n") ? "\n" : "";
  const suffix = normalizedAfter.startsWith("\n") ? "" : "\n";
  const insertion = `${prefix}${marker}${suffix}`;
  const nextValue = normalizedBefore + insertion + normalizedAfter;
  const markerStart = normalizedBefore.length + prefix.length;
  const caretPosition = normalizedBefore.length + insertion.length;

  return { caretPosition, markerStart, nextValue };
}

function buildSubpageMarker(subpage: { id?: string | null; title?: string | null }) {
  const title = subpage.title?.trim() || NOTE_SUBPAGE_TITLE_FALLBACK;
  const id = subpage.id?.trim();
  return id ? `[Subpage: ${title}](creator-subpage:${id})` : `[Subpage: ${title}]`;
}

function buildDatabaseMarker(database: { id: string; title?: string | null }) {
  const title = database.title?.trim() || NOTE_DATABASE_TITLE_FALLBACK;
  return `[Database: ${title}](creator-database:${database.id})`;
}

function buildClientDatabaseId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `database-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function buildClientDatabaseFieldId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `field-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function buildDefaultDatabaseTitleFieldId(databaseId: string) {
  return `${databaseId}-title`;
}

function buildDefaultDatabaseViewId(databaseId: string, viewType: NoteDatabaseViewType) {
  return `${databaseId}-${viewType}-view`;
}

function buildClientDatabaseEntryId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function getDatabaseDisplayTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim() ?? "";
  return trimmedTitle.length === 0 || trimmedTitle === NOTE_DATABASE_TITLE_FALLBACK
    ? NOTE_DATABASE_DISPLAY_TITLE_FALLBACK
    : trimmedTitle;
}

function getDatabaseMenuDisplayTitle(
  definition: NoteDatabaseDefinition,
  fallbackTitle?: string | null,
) {
  return isOnHandDatabaseDefinition(definition)
    ? "Grocery"
    : getDatabaseDisplayTitle(definition.title ?? fallbackTitle);
}

function getDatabaseDisplayIconKey(definition: NoteDatabaseDefinition) {
  return isOnHandDatabaseDefinition(definition) ? "🥬" : definition.iconKey;
}

function getNormalizedDatabaseTitle(definition: NoteDatabaseDefinition) {
  const trimmedTitle = definition.title?.trim() ?? "";

  if (isOnHandDatabaseDefinition(definition)) {
    return trimmedTitle.length === 0 ||
      trimmedTitle === NOTE_DATABASE_TITLE_FALLBACK ||
      trimmedTitle.toLowerCase() === "on hand"
      ? "Grocery List"
      : trimmedTitle;
  }

  return trimmedTitle ? trimmedTitle : NOTE_DATABASE_DISPLAY_TITLE_FALLBACK;
}

function getDatabaseFormTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim() ?? "";
  const databaseTitle =
    trimmedTitle.length === 0 ||
    trimmedTitle === NOTE_DATABASE_TITLE_FALLBACK ||
    trimmedTitle === NOTE_DATABASE_DISPLAY_TITLE_FALLBACK
      ? "Database"
      : trimmedTitle;

  return `${databaseTitle} form`;
}

function normalizeDatabaseFieldType(type: unknown): NoteDatabaseFieldType {
  if (typeof type !== "string") return "text";
  const normalizedType = NOTE_DATABASE_FIELD_TYPES.find(
    (fieldType) => fieldType.toLowerCase() === type.toLowerCase(),
  );
  return normalizedType ?? "text";
}

function createDefaultDatabaseTitleField(databaseId: string): NoteDatabaseFieldDefinition {
  return {
    id: buildDefaultDatabaseTitleFieldId(databaseId),
    name: "Name",
    type: "text",
    isTitle: true,
  };
}

function getDefaultDatabaseVisibleFieldIds(fields: NoteDatabaseFieldDefinition[], titleFieldId: string) {
  return [
    titleFieldId,
    ...fields.filter((field) => field.id !== titleFieldId).map((field) => field.id),
  ].slice(0, 5);
}

function createDefaultDatabaseView(
  databaseId: string,
  viewType: NoteDatabaseViewType,
  visibleFieldIds: string[],
): NoteDatabaseViewDefinition {
  return {
    id: buildDefaultDatabaseViewId(databaseId, viewType),
    name: NOTE_DATABASE_VIEW_LABELS[viewType],
    type: viewType,
    visibleFieldIds,
  };
}

function createDefaultDatabaseDefinition(segment: NoteDatabaseSegment): NoteDatabaseDefinition {
  const titleField = createDefaultDatabaseTitleField(segment.databaseId);
  const visibleFieldIds = getDefaultDatabaseVisibleFieldIds([titleField], titleField.id);

  return {
    id: segment.databaseId,
    title: NOTE_DATABASE_DISPLAY_TITLE_FALLBACK,
    titleFieldId: titleField.id,
    fields: [titleField],
    views: NOTE_DATABASE_VIEW_TYPES.map((viewType) =>
      createDefaultDatabaseView(segment.databaseId, viewType, visibleFieldIds),
    ),
    activeViewId: buildDefaultDatabaseViewId(segment.databaseId, "table"),
  };
}

function createDefaultDatabaseField(): NoteDatabaseFieldDefinition {
  return {
    id: buildClientDatabaseFieldId(),
    name: "Untitled field",
    type: "text",
  };
}

function findInferredDatabaseTitleField(fields: NoteDatabaseFieldDefinition[]) {
  const explicitTitleField = fields.find((field) => field.isTitle);
  if (explicitTitleField) return explicitTitleField;

  return fields.find((field) => {
    const normalizedName = field.name.trim().toLowerCase();
    return field.type === "text" && NOTE_DATABASE_TITLE_FIELD_NAMES.has(normalizedName);
  });
}

function normalizeDatabaseVisibleFieldIds(
  visibleFieldIds: unknown,
  fields: NoteDatabaseFieldDefinition[],
  titleFieldId: string,
) {
  const validFieldIds = new Set(fields.map((field) => field.id));
  const existingIds = Array.isArray(visibleFieldIds)
    ? visibleFieldIds.filter((fieldId): fieldId is string => {
        return typeof fieldId === "string" && validFieldIds.has(fieldId);
      })
    : [];
  const orderedIds =
    existingIds.length > 0
      ? [
          titleFieldId,
          ...fields
            .map((field) => field.id)
            .filter((fieldId) => fieldId !== titleFieldId && existingIds.includes(fieldId)),
        ]
      : getDefaultDatabaseVisibleFieldIds(fields, titleFieldId);

  return Array.from(new Set(orderedIds));
}

function normalizeDatabaseDefinition(definition: NoteDatabaseDefinition): NoteDatabaseDefinition {
  const databaseId = definition.id;
  const normalizedFields = (Array.isArray(definition.fields) ? definition.fields : []).map(
    (field) => ({
      ...field,
      id: field.id || buildClientDatabaseFieldId(),
      name: typeof field.name === "string" ? field.name : "Untitled field",
      type: normalizeDatabaseFieldType(field.type),
    }),
  );
  const existingTitleField =
    (definition.titleFieldId
      ? normalizedFields.find((field) => field.id === definition.titleFieldId)
      : null) ?? findInferredDatabaseTitleField(normalizedFields);
  const titleField = existingTitleField ?? createDefaultDatabaseTitleField(databaseId);
  const titleFieldId = titleField.id;
  const hasTitleField = normalizedFields.some((field) => field.id === titleFieldId);
  const fields = (hasTitleField ? normalizedFields : [titleField, ...normalizedFields]).map(
    (field) =>
      field.id === titleFieldId
        ? { ...field, type: "text" as const, isTitle: true }
        : { ...field, isTitle: false },
  );
  const defaultVisibleFieldIds = getDefaultDatabaseVisibleFieldIds(fields, titleFieldId);
  const rawViews = Array.isArray(definition.views) ? definition.views : [];
  const views = NOTE_DATABASE_VIEW_TYPES.map((viewType) => {
    const existingView = rawViews.find((view) => view?.type === viewType);
    return existingView
      ? {
          ...existingView,
          id: existingView.id || buildDefaultDatabaseViewId(databaseId, viewType),
          name: existingView.name?.trim() || NOTE_DATABASE_VIEW_LABELS[viewType],
          type: viewType,
          visibleFieldIds: normalizeDatabaseVisibleFieldIds(
            existingView.visibleFieldIds,
            fields,
            titleFieldId,
          ),
        }
      : createDefaultDatabaseView(databaseId, viewType, defaultVisibleFieldIds);
  });
  const activeView = views.find((view) => view.id === definition.activeViewId) ?? views[0];

  return {
    ...definition,
    id: databaseId,
    title: getNormalizedDatabaseTitle(definition),
    titleFieldId,
    fields,
    views,
    activeViewId: activeView?.id,
  };
}

function normalizeDatabaseDefinitionsForSegments(
  segments: NoteSegment[],
  databaseDefinitions: NoteDatabaseDefinitions | null | undefined,
) {
  const currentDefinitions = databaseDefinitions ?? {};
  const nextDefinitions: NoteDatabaseDefinitions = { ...currentDefinitions };
  let changed = false;

  Object.entries(nextDefinitions).forEach(([databaseId, definition]) => {
    if (isLegacyHydrationDatabase(databaseId, definition)) {
      delete nextDefinitions[databaseId];
      changed = true;
    }
  });

  segments.forEach((segment) => {
    if (segment.type !== "database") return;

    const currentDefinition =
      nextDefinitions[segment.databaseId] ?? createDefaultDatabaseDefinition(segment);
    if (isLegacyHydrationDatabase(segment.databaseId, currentDefinition, segment.title)) {
      return;
    }
    const normalizedDefinition = normalizeDatabaseDefinition(currentDefinition);

    if (JSON.stringify(currentDefinition) !== JSON.stringify(normalizedDefinition)) {
      changed = true;
    }

    if (!nextDefinitions[segment.databaseId]) {
      changed = true;
    }

    nextDefinitions[segment.databaseId] = normalizedDefinition;
  });

  return { changed, definitions: nextDefinitions };
}

export function removeNoteDatabaseSegment({
  content,
  databaseDefinitions,
  databaseEntries,
  databaseId,
  segmentIndex,
}: {
  content: string;
  databaseDefinitions?: NoteDatabaseDefinitions | null;
  databaseEntries?: NoteDatabaseEntries | null;
  databaseId: string;
  segmentIndex?: number;
}) {
  const currentSegments = parseNoteSegments(content);
  const targetSegmentIndex =
    typeof segmentIndex === "number"
      ? segmentIndex
      : currentSegments.findIndex(
          (segment) => segment.type === "database" && segment.databaseId === databaseId,
        );
  const targetSegment = currentSegments[targetSegmentIndex];
  const currentDefinitions = databaseDefinitions ?? {};
  const currentEntries = databaseEntries ?? {};
  const targetDefinition =
    targetSegment?.type === "database" ? currentDefinitions[targetSegment.databaseId] : null;
  const emptyResult = {
    content,
    databaseDefinitions: currentDefinitions,
    databaseEntries: currentEntries,
    databaseId,
    locked: false,
    removed: false,
    segmentIndex: targetSegmentIndex,
    systemDatabaseKey: undefined as string | undefined,
  };

  if (targetSegment?.type !== "database" || targetSegment.databaseId !== databaseId) {
    return emptyResult;
  }

  if (targetDefinition?.lockedSystemDatabase === true) {
    return {
      ...emptyResult,
      locked: true,
      systemDatabaseKey: targetDefinition.systemDatabaseKey,
    };
  }

  const nextDefinitions = { ...currentDefinitions };
  const nextEntries = { ...currentEntries };
  delete nextDefinitions[databaseId];
  delete nextEntries[databaseId];

  return {
    content: serializeNoteSegments(
      currentSegments.filter((_, index) => index !== targetSegmentIndex),
    ),
    databaseDefinitions: nextDefinitions,
    databaseEntries: nextEntries,
    databaseId,
    locked: false,
    removed: true,
    segmentIndex: targetSegmentIndex,
    systemDatabaseKey: targetDefinition?.systemDatabaseKey,
  };
}

function getDatabaseTitleField(definition: NoteDatabaseDefinition) {
  return (
    definition.fields.find((field) => field.id === definition.titleFieldId) ??
    definition.fields.find((field) => field.isTitle) ??
    definition.fields[0] ??
    null
  );
}

function getDatabaseFieldsWithTitleFirst(definition: NoteDatabaseDefinition) {
  const titleField = getDatabaseTitleField(definition);
  if (!titleField) return definition.fields;

  return [
    titleField,
    ...definition.fields.filter((field) => field.id !== titleField.id),
  ];
}

function getActiveDatabaseView(definition: NoteDatabaseDefinition) {
  return (
    definition.views?.find((view) => view.id === definition.activeViewId) ??
    definition.views?.[0] ??
    createDefaultDatabaseView(
      definition.id,
      "table",
      getDefaultDatabaseVisibleFieldIds(definition.fields, definition.titleFieldId ?? ""),
    )
  );
}

function getVisibleDatabaseFields(definition: NoteDatabaseDefinition) {
  const activeView = getActiveDatabaseView(definition);
  const titleField = getDatabaseTitleField(definition);
  const visibleIds = new Set(activeView.visibleFieldIds);
  const visibleFields = getDatabaseFieldsWithTitleFirst(definition).filter(
    (field) => field.id === titleField?.id || visibleIds.has(field.id),
  );

  return visibleFields.length > 0 ? visibleFields : getDatabaseFieldsWithTitleFirst(definition);
}

function getDatabaseDefinitionWithReorderedFields(
  definition: NoteDatabaseDefinition,
  activeFieldId: string,
  overFieldId: string,
) {
  const titleField = getDatabaseTitleField(definition);
  if (activeFieldId === titleField?.id) return definition;

  const fieldsWithTitleFirst = getDatabaseFieldsWithTitleFirst(definition);
  const fromIndex = fieldsWithTitleFirst.findIndex((field) => field.id === activeFieldId);
  const rawToIndex = fieldsWithTitleFirst.findIndex((field) => field.id === overFieldId);
  if (fromIndex < 0 || rawToIndex < 0) return definition;

  const minimumFieldIndex = titleField ? 1 : 0;
  const toIndex = Math.max(rawToIndex, minimumFieldIndex);
  if (fromIndex === toIndex) return definition;

  const fields = arrayMove(fieldsWithTitleFirst, fromIndex, toIndex);
  const fieldIds = fields.map((field) => field.id);
  const currentFieldIds = fieldsWithTitleFirst.map((field) => field.id);
  if (JSON.stringify(fieldIds) === JSON.stringify(currentFieldIds)) return definition;

  return {
    ...definition,
    fields,
    views: definition.views?.map((view) => {
      const visibleIds = new Set(view.visibleFieldIds);

      return {
        ...view,
        visibleFieldIds: fields
          .filter((field) => visibleIds.has(field.id))
          .map((field) => field.id),
      };
    }),
  };
}

function isUsefulDatabaseEntryValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function formatDatabaseEntryValue(value: unknown, fieldType?: NoteDatabaseFieldType) {
  if (!isUsefulDatabaseEntryValue(value)) return "";

  if (fieldType === "rating") {
    return `${value}/5`;
  }

  if (fieldType === "date" && typeof value === "string") {
    const parsedDate = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }

  if (fieldType === "createdAt" && typeof value === "string") {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  return "";
}

function getDatabaseFieldName(field: NoteDatabaseFieldDefinition) {
  return field.name.trim() || (field.isTitle ? "Name" : "Untitled field");
}

type NutritionMacroFieldKey = (typeof NUTRITION_MACRO_FIELD_KEYS)[number];
type NutritionDailyMetricKey = keyof typeof DEFAULT_DAILY_NUTRITION_GOALS;
type NutritionFoodActionTabId =
  | (typeof NUTRITION_FOOD_ACTION_TABS)[number]["id"]
  | (typeof GROCERY_EXTRA_FOOD_ACTION_TABS)[number]["id"];
type FitnessActionTabId = (typeof FITNESS_ACTION_TABS)[number]["id"];
type NutritionFavoriteItemType = "food" | "recipe" | "meal_template";
type NutritionFavoriteTarget = {
  itemType: NutritionFavoriteItemType;
  itemId: string;
  label: string;
};
type NutritionServingUnit = string;
type NutritionServingOption = {
  value: NutritionServingUnit;
  label: string;
};
type NutritionMacroSourceKey = "calories" | "carbs_g" | "protein_g" | "fat_g";
type NutritionSelectedFoodItem = {
  food: FoodSearchResult;
  quantity: number;
  servingUnit: NutritionServingUnit;
  groceryDeduction?: GroceryDeductionDraft | null;
};
type GroceryInventoryUnit =
  | "servings"
  | "package"
  | "g"
  | "kg"
  | "oz"
  | "lb"
  | "ml"
  | "l"
  | "item";
type GrocerySearchDraft = {
  stableKey: string;
  food: FoodSearchResult;
  quantity: string;
  unit: GroceryInventoryUnit;
  status: "idle" | "saving" | "success" | "error";
  message: string | null;
  quantityManuallyEdited: boolean;
};
type FoodDepartmentGroup<T> = {
  key: FoodBrowseDepartmentLabel | "other";
  label: FoodBrowseDepartmentLabel | "Other";
  items: T[];
};

function groupFoodsByBrowseDepartment<T>(
  items: readonly T[],
  getFood: (item: T) => FoodSearchResult,
): FoodDepartmentGroup<T>[] {
  const groupedItems = new Map<FoodDepartmentGroup<T>["key"], T[]>();

  for (const item of items) {
    const department = getFoodPrimaryGroceryDepartment(getFood(item));
    const key = department ?? "other";
    const groupItems = groupedItems.get(key);
    if (groupItems) groupItems.push(item);
    else groupedItems.set(key, [item]);
  }

  const groups: FoodDepartmentGroup<T>[] = [];
  for (const department of FOOD_BROWSE_DEPARTMENTS) {
    const groupItems = groupedItems.get(department.label);
    if (groupItems) {
      groups.push({ key: department.label, label: department.label, items: groupItems });
    }
  }
  const otherItems = groupedItems.get("other");
  if (otherItems) groups.push({ key: "other", label: "Other", items: otherItems });
  return groups;
}
type GrocerySearchInventorySave = {
  canonicalQuantity: number;
  canonicalUnit: GroceryInventoryUnit;
  displayQuantity: number;
  displayUnit: GroceryInventoryUnit;
  conversionSource: string;
  conversionConfidence: "high" | "medium" | "none";
  countUnitKey?: string;
};
type GroceryPackageServingsContext =
  | {
      source: "explicit";
      servingsPerContainer: number;
      servingGrams: number | null;
      packageGrams: number | null;
    }
  | {
      source: "inferred";
      servingsPerContainer: number;
      servingGrams: number;
      packageGrams: number;
    }
  | {
      source: "package_weight";
      servingsPerContainer: null;
      servingGrams: number | null;
      packageGrams: number;
    }
  | {
      source: "unknown";
      servingsPerContainer: null;
      servingGrams: number | null;
      packageGrams: number | null;
    };
type GroceryDeductionDraft = {
  foodResourceId: string;
  currentQuantity: number;
  inventoryUnit: GroceryInventoryUnit;
  amount: string;
};
type NutritionMealTotalsSource = {
  total_calories?: number | string | null;
  total_carbs_g?: number | string | null;
  total_protein_g?: number | string | null;
  total_fat_g?: number | string | null;
};
type NutritionMealItemSource = {
  id: string;
  item_type: "food" | "recipe" | "custom";
  food_id?: string | null;
  recipe_id?: string | null;
  custom_name?: string | null;
  quantity?: number | string | null;
  serving_unit?: string | null;
  serving_grams?: number | string | null;
  snapshot_name?: string | null;
  snapshot_brand_name?: string | null;
  snapshot_calories?: number | string | null;
  snapshot_carbs_g?: number | string | null;
  snapshot_protein_g?: number | string | null;
  snapshot_fat_g?: number | string | null;
  sort_order?: number | null;
};
type NutritionRecipeSearchResult = {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  servings?: number | string | null;
  total_calories?: number | string | null;
  total_carbs_g?: number | string | null;
  total_protein_g?: number | string | null;
  total_fat_g?: number | string | null;
};
type NutritionMealBuilderItem = {
  id: string;
  type: "food" | "recipe";
  food?: FoodSearchResult;
  recipe?: NutritionRecipeSearchResult;
  quantity: number;
  servingUnit: NutritionServingUnit;
};
type NutritionSelectedRecipeItem = {
  recipe: NutritionSavedRecipe;
  quantity: number;
  servingUnit: NutritionServingUnit;
};
type NutritionSavedMeal = NutritionMealTotalsSource & {
  id: string;
  occurred_at?: string | null;
  name?: string | null;
  icon?: string | null;
  meal_items?: NutritionMealItemSource[] | null;
};
type NutritionSavedRecipe = NutritionRecipeSearchResult & {
  recipe_items?: NutritionMealItemSource[] | null;
};
type NutritionAllowedServingUnit =
  | "g"
  | "oz"
  | "lb"
  | "tsp"
  | "tbsp"
  | "cup"
  | "ml"
  | "fl oz"
  | "serving"
  | "container";
type NutritionFoodSearchResponse = {
  foods?: FoodSearchResult[];
  error?: string;
};
type NutritionRecipeSearchResponse = {
  recipes?: NutritionRecipeSearchResult[];
  error?: string;
};
type NutritionFoodBarcodeLookupResponse = FoodBarcodeLookupResult & {
  error?: string;
};
type NutritionMealCreateResponse = {
  meal?: {
    id?: string | null;
  } | null;
  error?: string;
};
type NutritionRecipeCreateResponse = {
  recipe?: NutritionSavedRecipe | null;
  error?: string;
};
type NutritionMealsListResponse = {
  meals?: NutritionSavedMeal[];
  error?: string;
};
type NutritionRecipesListResponse = {
  recipes?: NutritionSavedRecipe[];
  error?: string;
};
type NutritionFavoritesListResponse = {
  favorites?: Array<{
    itemType?: NutritionFavoriteItemType;
    itemId?: string;
  }>;
  error?: string;
};
type FoodResource = {
  id: string;
  food_id: string | null;
  name: string;
  brand_name: string | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  expires_on: string | null;
  notes: string | null;
  status: string;
  metadata?: unknown;
  created_at: string;
  updated_at: string;
  catalog_food?: unknown;
};
type FoodResourcesResponse = {
  foodResources?: unknown;
  foodResource?: FoodResource | null;
  error?: string;
};

function getFoodResourceText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getFoodResourceNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : null;

  return parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeFoodResource(value: unknown, index: number): FoodResource {
  const resource = getRecordMetadata(value);
  const id = getFoodResourceText(resource.id) || `invalid-food-resource-${index}`;

  return {
    id,
    food_id: getFoodResourceText(resource.food_id) || null,
    name: getFoodResourceText(resource.name) || "Grocery item",
    brand_name: getFoodResourceText(resource.brand_name) || null,
    quantity: getFoodResourceNumber(resource.quantity),
    unit: getFoodResourceText(resource.unit) || null,
    location: getFoodResourceText(resource.location) || null,
    expires_on: getFoodResourceText(resource.expires_on) || null,
    notes: getFoodResourceText(resource.notes) || null,
    status: getFoodResourceText(resource.status) || "active",
    metadata: getRecordMetadata(resource.metadata),
    created_at: getFoodResourceText(resource.created_at),
    updated_at: getFoodResourceText(resource.updated_at),
    catalog_food: resource.catalog_food,
  };
}

function getFoodResourcesFromResponse(payload: unknown) {
  const responsePayload = getRecordMetadata(payload);
  if (!Array.isArray(responsePayload.foodResources)) return [];
  return responsePayload.foodResources.map(normalizeFoodResource);
}

function getNutritionFavoriteKey(target: Pick<NutritionFavoriteTarget, "itemType" | "itemId">) {
  return `${target.itemType}:${target.itemId}`;
}

function NutritionFoodIcon({ food }: { food: FoodSearchResult }) {
  const icon = getFoodIcon(food);

  return <NutritionFoodIconSlot icon={icon} fallbackInitial={food.name.charAt(0)} />;
}

const NUTRITION_FOOD_GROUP_FLUENT_ICON_BASE_PATH = "/food-icons/fluent";
const NUTRITION_FOOD_GROUP_FLUENT_ICON_ASSETS = {
  apple: "red-apple.png",
  banana: "banana.png",
  bread: "bread.png",
  broccoli: "broccoli.png",
  cheese: "cheese-wedge.png",
  chicken: "poultry-leg.png",
  egg: "egg.png",
  fish: "fish.png",
  meat: "cut-of-meat.png",
  milk: "glass-of-milk.png",
  peanuts: "peanuts.png",
  rice: "cooked-rice.png",
  shrimp: "shrimp.png",
  spaghetti: "spaghetti.png",
} as const;

type NutritionFoodGroupFluentIconAsset =
  keyof typeof NUTRITION_FOOD_GROUP_FLUENT_ICON_ASSETS;

type NutritionFoodGroupIcon =
  | {
      type: "image";
      src: string;
      alt: string;
      fallbackEmoji: string;
    }
  | {
      type: "emoji";
      emoji: string;
      alt: string;
    };

type NutritionFoodGroupIconRule = {
  keywords: readonly string[];
  asset?: NutritionFoodGroupFluentIconAsset;
  alt: string;
  fallbackEmoji: string;
};

const NUTRITION_FOOD_GROUP_ICON_RULES: readonly NutritionFoodGroupIconRule[] = [
  {
    keywords: ["banana"],
    asset: "banana",
    alt: "Banana",
    fallbackEmoji: "🍌",
  },
  {
    keywords: ["apple", "fruit", "produce"],
    asset: "apple",
    alt: "Fruit",
    fallbackEmoji: "🍎",
  },
  {
    keywords: ["vegetable", "greens", "herb"],
    asset: "broccoli",
    alt: "Vegetables",
    fallbackEmoji: "🥦",
  },
  {
    keywords: ["chicken", "poultry", "turkey"],
    asset: "chicken",
    alt: "Poultry",
    fallbackEmoji: "🍗",
  },
  {
    keywords: ["meat", "beef", "pork", "protein"],
    asset: "meat",
    alt: "Meat",
    fallbackEmoji: "🥩",
  },
  {
    keywords: ["shrimp"],
    asset: "shrimp",
    alt: "Shrimp",
    fallbackEmoji: "🦐",
  },
  {
    keywords: ["seafood", "fish"],
    asset: "fish",
    alt: "Fish",
    fallbackEmoji: "🐟",
  },
  {
    keywords: ["milk", "cream"],
    asset: "milk",
    alt: "Milk",
    fallbackEmoji: "🥛",
  },
  {
    keywords: ["dairy", "cheese", "yogurt", "butter"],
    asset: "cheese",
    alt: "Dairy",
    fallbackEmoji: "🧀",
  },
  {
    keywords: ["egg", "breakfast"],
    asset: "egg",
    alt: "Eggs",
    fallbackEmoji: "🍳",
  },
  {
    keywords: ["rice"],
    asset: "rice",
    alt: "Rice",
    fallbackEmoji: "🍚",
  },
  {
    keywords: ["pasta"],
    asset: "spaghetti",
    alt: "Pasta",
    fallbackEmoji: "🍝",
  },
  {
    keywords: ["grain", "bread", "bakery", "cereal", "tortilla"],
    asset: "bread",
    alt: "Bread",
    fallbackEmoji: "🍞",
  },
  {
    keywords: ["nut", "peanut", "trail mix"],
    asset: "peanuts",
    alt: "Nuts",
    fallbackEmoji: "🥜",
  },
  {
    keywords: ["snack", "chips", "candy", "crackers", "bars"],
    alt: "Snacks",
    fallbackEmoji: "🍿",
  },
  {
    keywords: ["drink", "beverage", "juice", "soda", "water", "coffee", "tea"],
    alt: "Drinks",
    fallbackEmoji: "🥤",
  },
  {
    keywords: ["frozen"],
    alt: "Frozen foods",
    fallbackEmoji: "❄️",
  },
  {
    keywords: ["pantry", "canned", "dry goods", "beans", "legumes"],
    alt: "Pantry",
    fallbackEmoji: "🥫",
  },
  {
    keywords: ["sauce", "condiment", "dressing", "spread", "seasoning", "sweetener"],
    alt: "Condiments",
    fallbackEmoji: "🧂",
  },
  {
    keywords: ["dessert", "sweets", "sweet", "baking"],
    alt: "Desserts",
    fallbackEmoji: "🍪",
  },
  {
    keywords: ["prepared", "ready meal", "restaurant", "fast food", "meal kit"],
    alt: "Prepared foods",
    fallbackEmoji: "🍽️",
  },
];

function getNutritionFoodGroupIcon(label: string): NutritionFoodGroupIcon {
  const normalizedLabel = label.trim().toLowerCase();
  const defaultIcon: NutritionFoodGroupIcon = {
    type: "emoji",
    emoji: "🍽️",
    alt: "Food",
  };
  if (!normalizedLabel) return defaultIcon;

  const matchedRule = NUTRITION_FOOD_GROUP_ICON_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedLabel.includes(keyword)),
  );
  if (!matchedRule) return defaultIcon;

  if (!matchedRule.asset) {
    return {
      type: "emoji",
      emoji: matchedRule.fallbackEmoji,
      alt: matchedRule.alt,
    };
  }

  return {
    type: "image",
    src: `${NUTRITION_FOOD_GROUP_FLUENT_ICON_BASE_PATH}/${
      NUTRITION_FOOD_GROUP_FLUENT_ICON_ASSETS[matchedRule.asset]
    }`,
    alt: matchedRule.alt,
    fallbackEmoji: matchedRule.fallbackEmoji,
  };
}

function NutritionFoodGroupIconSlot({ label }: { label: string }) {
  const icon = getNutritionFoodGroupIcon(label);
  const imageSrc = icon.type === "image" ? icon.src : null;
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [imageSrc]);

  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center leading-none opacity-90"
      aria-hidden="true"
    >
      {imageSrc && !hasImageError ? (
        <Image
          src={imageSrc}
          alt={icon.alt}
          width={22}
          height={22}
          className="h-5 w-5 object-contain"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span className="text-[15px] leading-none">
          {icon.type === "image" ? icon.fallbackEmoji : icon.emoji}
        </span>
      )}
    </span>
  );
}

function NutritionFoodIconSlot({
  icon,
  fallbackInitial,
}: {
  icon: FoodIcon;
  fallbackInitial: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const assetPath = hasImageError ? null : icon.assetPath;
  const initial = fallbackInitial.trim().charAt(0).toUpperCase() || "F";

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.055] bg-black/44 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-hidden="true"
    >
      {assetPath ? (
        <Image
          src={assetPath}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 object-contain"
          onError={() => setHasImageError(true)}
        />
      ) : icon.fallbackEmoji ? (
        <span className="text-[24px] leading-none" aria-hidden="true">
          {icon.fallbackEmoji}
        </span>
      ) : (
        <span className="text-xs font-bold text-white/52" aria-hidden="true">
          {initial}
        </span>
      )}
    </span>
  );
}

function normalizeDatabaseFieldLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getNutritionDailyMetricFieldKey(
  field: NoteDatabaseFieldDefinition,
): NutritionDailyMetricKey | null {
  const normalizedName = normalizeDatabaseFieldLookupKey(getDatabaseFieldName(field));
  const metricKeys = Object.keys(DEFAULT_DAILY_NUTRITION_GOALS) as NutritionDailyMetricKey[];
  const nameMatch = metricKeys.find((key) => normalizedName === key);
  if (nameMatch) return nameMatch;

  const idParts = field.id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return metricKeys.find((key) => idParts.includes(key)) ?? null;
}

function getNutritionMacroFieldKey(field: NoteDatabaseFieldDefinition): NutritionMacroFieldKey | null {
  const metricKey = getNutritionDailyMetricFieldKey(field);
  return metricKey && metricKey !== "calories" ? metricKey : null;
}

function isDefaultNutritionFoodField(field: NoteDatabaseFieldDefinition) {
  const normalizedName = normalizeDatabaseFieldLookupKey(getDatabaseFieldName(field));
  if (NUTRITION_FOOD_FIELD_LOOKUP_KEYS.has(normalizedName)) return true;

  const normalizedId = normalizeDatabaseFieldLookupKey(field.id);
  if (NUTRITION_FOOD_FIELD_LOOKUP_KEYS.has(normalizedId)) return true;

  const idParts = field.id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return idParts.some((idPart) => NUTRITION_FOOD_FIELD_LOOKUP_KEYS.has(idPart));
}

function formatFoodNutritionNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function parseNutritionProgressNumber(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : null;

  if (numericValue === null || !Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return numericValue;
}

function parseNutritionProgressDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  if (typeof value !== "string") return null;

  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)
    ? new Date(`${trimmedValue}T00:00:00`)
    : new Date(trimmedValue);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getFoodSearchResultMeta(food: FoodSearchResult) {
  const calories = formatFoodNutritionNumber(food.calories);
  const carbs = formatFoodNutritionNumber(food.carbs_g);
  const protein = formatFoodNutritionNumber(food.protein_g);
  const fat = formatFoodNutritionNumber(food.fat_g);
  const nutritionParts = [
    calories ? `${calories} cal` : null,
    carbs ? `C ${carbs}g` : null,
    protein ? `P ${protein}g` : null,
    fat ? `F ${fat}g` : null,
  ].filter(Boolean);

  return nutritionParts.join(" • ");
}

function getFoodBrowseNutritionPreview(food: FoodSearchResult) {
  const calories = formatFoodNutritionNumber(food.calories);
  const carbs = formatFoodNutritionNumber(food.carbs_g);
  const nutritionParts = [
    calories ? `${calories} cal` : null,
    carbs ? `${carbs}g carbs` : null,
  ].filter(Boolean);

  return nutritionParts.join(" · ");
}

function getNutritionRecipeSearchResultMeta(recipe: NutritionRecipeSearchResult) {
  const calories = formatFoodNutritionNumber(
    parseNutritionProgressNumber(recipe.total_calories),
  );
  const servings = getPositiveNutritionDraftNumber(recipe.servings, 1);
  const servingLabel =
    servings === 1
      ? "1 serving"
      : `${formatFoodNutritionNumber(servings) ?? servings} servings`;

  return calories ? `${calories} cal · ${servingLabel}` : servingLabel;
}

function getNutritionSavedRecipeIcon(recipe: NutritionRecipeSearchResult) {
  return recipe.icon?.trim() || DEFAULT_NUTRITION_RECIPE_ICON;
}

function getNutritionSavedRecipeItemCount(recipe: NutritionSavedRecipe) {
  return recipe.recipe_items?.length ?? 0;
}

function getNutritionSavedRecipeMeta(recipe: NutritionSavedRecipe) {
  const itemCount = getNutritionSavedRecipeItemCount(recipe);
  const calories = formatFoodNutritionNumber(
    parseNutritionProgressNumber(recipe.total_calories),
  );
  const carbs = formatFoodNutritionNumber(
    parseNutritionProgressNumber(recipe.total_carbs_g),
  );
  const protein = formatFoodNutritionNumber(
    parseNutritionProgressNumber(recipe.total_protein_g),
  );
  const fat = formatFoodNutritionNumber(
    parseNutritionProgressNumber(recipe.total_fat_g),
  );
  const itemLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;
  const nutritionParts = [
    calories ? `${calories} cal` : null,
    carbs ? `C ${carbs}g` : null,
    protein ? `P ${protein}g` : null,
    fat ? `F ${fat}g` : null,
  ].filter(Boolean);

  return [...nutritionParts, itemLabel].join(" · ");
}

function getNutritionFoodSelectionKey(food: FoodSearchResult) {
  return food.id;
}

function normalizeNutritionQuantity(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : 1;

  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(10000, Math.max(0.01, parsed));
}

const NUTRITION_WEIGHT_UNITS = ["g", "oz", "lb"] as const;
const NUTRITION_VOLUME_UNITS = ["tsp", "tbsp", "cup", "ml", "fl oz"] as const;
const NUTRITION_ALLOWED_SERVING_UNITS = [
  ...NUTRITION_WEIGHT_UNITS,
  ...NUTRITION_VOLUME_UNITS,
  "serving",
  "container",
] as const satisfies readonly NutritionAllowedServingUnit[];
const GROCERY_INVENTORY_UNIT_OPTIONS = [
  { value: "servings", label: "servings" },
  { value: "package", label: "package" },
  { value: "g", label: "g" },
  { value: "oz", label: "oz" },
  { value: "item", label: "item" },
] as const satisfies readonly { value: GroceryInventoryUnit; label: string }[];
const NUTRITION_SERVING_UNIT_ALIASES: Record<string, NutritionAllowedServingUnit> = {
  gram: "g",
  grams: "g",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  milliliter: "ml",
  milliliters: "ml",
};
const NUTRITION_VOLUME_UNIT_ML: Record<(typeof NUTRITION_VOLUME_UNITS)[number], number> = {
  tsp: 14.7868 / 3,
  tbsp: 14.7868,
  cup: 14.7868 * 16,
  ml: 1,
  "fl oz": 14.7868 * 2,
};
const GRAMS_PER_OUNCE = 28.3495;

function normalizeGroceryInventoryUnit(value: unknown): GroceryInventoryUnit {
  if (typeof value !== "string") return "package";
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  if (normalized === "serving" || normalized === "servings") return "servings";
  if (normalized === "packages" || normalized === "pkg" || normalized === "pack") {
    return "package";
  }
  if (normalized === "gram" || normalized === "grams") return "g";
  if (normalized === "kilogram" || normalized === "kilograms") return "kg";
  if (normalized === "ounce" || normalized === "ounces") return "oz";
  if (normalized === "pound" || normalized === "pounds" || normalized === "lbs") return "lb";
  if (normalized === "milliliter" || normalized === "milliliters") return "ml";
  if (normalized === "liter" || normalized === "liters" || normalized === "litre" || normalized === "litres") return "l";
  if (normalized === "items" || normalized === "each" || normalized === "ea") return "item";
  if (["kg", "lb", "ml", "l"].includes(normalized)) {
    return normalized as GroceryInventoryUnit;
  }

  return GROCERY_INVENTORY_UNIT_OPTIONS.some((option) => option.value === normalized)
    ? (normalized as GroceryInventoryUnit)
    : "package";
}

function convertGrocerySearchQuantity(
  quantity: number,
  oldUnit: GroceryInventoryUnit,
  newUnit: GroceryInventoryUnit,
) {
  const weightGrams: Partial<Record<GroceryInventoryUnit, number>> = {
    g: 1,
    kg: 1000,
    oz: GRAMS_PER_OUNCE,
    lb: GRAMS_PER_OUNCE * 16,
  };
  const volumeMl: Partial<Record<GroceryInventoryUnit, number>> = { ml: 1, l: 1000 };
  const oldWeight = weightGrams[oldUnit];
  const newWeight = weightGrams[newUnit];
  if (oldWeight && newWeight) return (quantity * oldWeight) / newWeight;

  const oldVolume = volumeMl[oldUnit];
  const newVolume = volumeMl[newUnit];
  if (oldVolume && newVolume) return (quantity * oldVolume) / newVolume;
  return null;
}

function formatGrocerySearchQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  return String(Number(quantity.toFixed(3)));
}

function parseGroceryInventoryNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : null;

  return parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getGroceryMetadataSourceSummary(metadata: Record<string, unknown>) {
  return metadata.source_summary &&
    typeof metadata.source_summary === "object" &&
    !Array.isArray(metadata.source_summary)
    ? (metadata.source_summary as Record<string, unknown>)
    : {};
}

function parseGroceryNetQuantity(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms|g|gram|grams|lb|lbs|pound|pounds|oz|ounce|ounces)\b/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2];
  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") {
    return { quantity: amount * 1000, unit: "g" as const };
  }
  if (unit === "g" || unit === "gram" || unit === "grams") {
    return { quantity: amount, unit: "g" as const };
  }
  if (unit === "lb" || unit === "lbs" || unit === "pound" || unit === "pounds") {
    return { quantity: amount * 16, unit: "oz" as const };
  }
  return { quantity: amount, unit: "oz" as const };
}

function getGroceryWeightGrams(amount: number, unit: "g" | "oz") {
  return unit === "g" ? amount : amount * GRAMS_PER_OUNCE;
}

function parseGroceryProductQuantity(metadata: Record<string, unknown>) {
  const amount =
    parseGroceryInventoryNumber(metadata.product_quantity) ??
    parseGroceryInventoryNumber(metadata.package_quantity);
  if (!amount) return null;

  const unit = normalizeGroceryInventoryUnit(
    metadata.product_quantity_unit ?? metadata.package_quantity_unit,
  );
  if (unit === "g" || unit === "oz") return { quantity: amount, unit };

  return null;
}

function getGroceryMetadataRecords(metadata: Record<string, unknown>) {
  const sourceSummary = getGroceryMetadataSourceSummary(metadata);
  const foodSnapshot =
    metadata.foodSnapshot && typeof metadata.foodSnapshot === "object" && !Array.isArray(metadata.foodSnapshot)
      ? (metadata.foodSnapshot as Record<string, unknown>)
      : {};
  const originalScannedNutrition =
    metadata.originalScannedNutrition &&
    typeof metadata.originalScannedNutrition === "object" &&
    !Array.isArray(metadata.originalScannedNutrition)
      ? (metadata.originalScannedNutrition as Record<string, unknown>)
      : {};

  return [metadata, sourceSummary, foodSnapshot, originalScannedNutrition];
}

function getGroceryServingGramsFromMetadata(metadata: Record<string, unknown>) {
  for (const record of getGroceryMetadataRecords(metadata)) {
    const servingGrams =
      getPositiveNutritionMetadataNumber(record, "serving_grams") ??
      getPositiveNutritionMetadataNumber(record, "servingGrams");
    if (servingGrams) return servingGrams;
  }

  return null;
}

function getGroceryPackageAmount(metadata: Record<string, unknown>) {
  for (const record of getGroceryMetadataRecords(metadata)) {
    const packageAmount =
      parseGroceryProductQuantity(record) ??
      parseGroceryNetQuantity(getTrimmedMetadataString(record, "net_weight")) ??
      parseGroceryNetQuantity(getTrimmedMetadataString(record, "package_weight")) ??
      parseGroceryNetQuantity(getTrimmedMetadataString(record, "quantity"));
    if (packageAmount) return packageAmount;
  }

  return null;
}

function getGroceryPackageGrams(metadata: Record<string, unknown>) {
  const packageAmount = getGroceryPackageAmount(metadata);
  return packageAmount ? getGroceryWeightGrams(packageAmount.quantity, packageAmount.unit) : null;
}

function getGroceryExplicitServingsPerContainer(metadata: Record<string, unknown>) {
  for (const record of getGroceryMetadataRecords(metadata)) {
    const source =
      typeof record.servings_per_container_source === "string"
        ? record.servings_per_container_source
        : typeof record.package_servings_source === "string"
          ? record.package_servings_source
          : null;
    const value =
      getPositiveNutritionMetadataNumber(record, "explicit_servings_per_container") ??
      (source && source !== "inferred"
        ? getPositiveNutritionMetadataNumber(record, "servings_per_container")
        : null) ??
      getPositiveNutritionMetadataNumber(record, "servings_per_package");

    if (value) return value;
  }

  return null;
}

function getGroceryPackageServingsContext(
  metadata: Record<string, unknown>,
): GroceryPackageServingsContext {
  const servingGrams = getGroceryServingGramsFromMetadata(metadata);
  const packageGrams = getGroceryPackageGrams(metadata);
  const explicitServingsPerContainer = getGroceryExplicitServingsPerContainer(metadata);

  if (explicitServingsPerContainer) {
    return {
      source: "explicit",
      servingsPerContainer: explicitServingsPerContainer,
      servingGrams,
      packageGrams,
    };
  }

  if (servingGrams && packageGrams) {
    const formattedServings = formatFoodNutritionNumber(packageGrams / servingGrams);

    return {
      source: "inferred",
      servingsPerContainer:
        formattedServings !== null ? Number(formattedServings) : packageGrams / servingGrams,
      servingGrams,
      packageGrams,
    };
  }

  if (packageGrams) {
    return {
      source: "package_weight",
      servingsPerContainer: null,
      servingGrams,
      packageGrams,
    };
  }

  return {
    source: "unknown",
    servingsPerContainer: null,
    servingGrams,
    packageGrams,
  };
}

function getGroceryDefaultInventoryAmount(food: FoodSearchResult) {
  const measurementProfile = getFoodInventoryMeasurementProfile(food);

  if (measurementProfile) {
    return { quantity: 1, unit: "item" as const };
  }

  const metadata = getRecordMetadata(food.metadata);
  const servingsContext = getGroceryPackageServingsContext(metadata);

  if (
    servingsContext.source === "explicit" ||
    servingsContext.source === "inferred"
  ) {
    return { quantity: servingsContext.servingsPerContainer, unit: "servings" as const };
  }

  const netQuantity = getGroceryPackageAmount(metadata);

  return netQuantity ?? { quantity: 1, unit: "package" as const };
}

function formatGroceryGramValue(grams: number) {
  return formatFoodNutritionNumber(grams) ?? String(Math.round(grams));
}

function getGroceryServingGramHelper(metadata: Record<string, unknown>) {
  const servingGrams = getGroceryServingGramsFromMetadata(metadata);
  return servingGrams ? `1 serving = ${formatGroceryGramValue(servingGrams)}g` : "Serving grams unknown";
}

function getGroceryInventoryGramEquivalent(
  metadata: Record<string, unknown>,
  quantity: number | null,
  unit: GroceryInventoryUnit,
) {
  if (quantity === null) return null;

  const servingsContext = getGroceryPackageServingsContext(metadata);
  const servingGrams = servingsContext.servingGrams;
  const packageGrams = servingsContext.packageGrams;

  if (unit === "servings") {
    return servingGrams
      ? quantity * servingGrams
      : servingsContext.servingsPerContainer && packageGrams
        ? quantity * (packageGrams / servingsContext.servingsPerContainer)
        : null;
  }
  if (unit === "package") {
    return packageGrams ? quantity * packageGrams : null;
  }
  if (unit === "g") return quantity;
  if (unit === "kg") return quantity * 1000;
  if (unit === "oz") return quantity * GRAMS_PER_OUNCE;
  if (unit === "lb") return quantity * GRAMS_PER_OUNCE * 16;

  if (unit === "item") {
    const profile = getRecordMetadata(metadata.inventory_measurement_profile);
    const profileGrams =
      getPositiveNutritionMetadataNumber(profile, "netGramsPerContainer") ??
      getPositiveNutritionMetadataNumber(profile, "gramsPerItem");
    if (profileGrams) return quantity * profileGrams;
    for (const record of getGroceryMetadataRecords(metadata)) {
      const itemGrams =
        getPositiveNutritionMetadataNumber(record, "item_grams") ??
        getPositiveNutritionMetadataNumber(record, "itemGrams") ??
        getPositiveNutritionMetadataNumber(record, "each_grams");
      if (itemGrams) return quantity * itemGrams;
    }
  }

  return null;
}

function getGroceryInventoryQuantityFromGrams(
  metadata: Record<string, unknown>,
  grams: number,
  unit: GroceryInventoryUnit,
) {
  if (unit === "g") return grams;
  if (unit === "kg") return grams / 1000;
  if (unit === "oz") return grams / GRAMS_PER_OUNCE;
  if (unit === "lb") return grams / (GRAMS_PER_OUNCE * 16);
  const context = getGroceryPackageServingsContext(metadata);
  if (unit === "servings") {
    if (context.servingGrams) return grams / context.servingGrams;
    if (context.servingsPerContainer && context.packageGrams) {
      return grams / (context.packageGrams / context.servingsPerContainer);
    }
    return null;
  }
  if (unit === "package" && context.packageGrams) return grams / context.packageGrams;
  if (unit === "item") {
    const oneItemGrams = getGroceryInventoryGramEquivalent(metadata, 1, "item");
    return oneItemGrams ? grams / oneItemGrams : null;
  }
  return null;
}

function convertGroceryInventoryQuantity(
  metadata: Record<string, unknown>,
  quantity: number,
  oldUnit: GroceryInventoryUnit,
  newUnit: GroceryInventoryUnit,
) {
  if (oldUnit === newUnit) return quantity;
  const grams = getGroceryInventoryGramEquivalent(metadata, quantity, oldUnit);
  return grams === null ? null : getGroceryInventoryQuantityFromGrams(metadata, grams, newUnit);
}

function prepareGrocerySearchInventorySave(
  quantityValue: unknown,
  unitValue: unknown,
  food: FoodSearchResult,
): GrocerySearchInventorySave | null {
  const displayQuantity = parseGroceryInventoryNumber(quantityValue);
  if (displayQuantity === null) return null;

  const displayUnit = normalizeGroceryInventoryUnit(unitValue);
  const metadata = getRecordMetadata(food.metadata);
  const measurementProfile = getFoodInventoryMeasurementProfile(food);
  if (displayUnit === "item" && measurementProfile) {
    return {
      canonicalQuantity: displayQuantity,
      canonicalUnit: "item",
      displayQuantity,
      displayUnit,
      conversionSource: "natural_count",
      conversionConfidence: measurementProfile.confidence,
      countUnitKey: measurementProfile.countUnitKey,
    };
  }
  if (measurementProfile) {
    const canonicalCount = convertGroceryInventoryQuantity(
      metadata,
      displayQuantity,
      displayUnit,
      "item",
    );
    if (canonicalCount !== null && Number.isFinite(canonicalCount) && canonicalCount > 0) {
      return {
        canonicalQuantity: Number(canonicalCount.toFixed(6)),
        canonicalUnit: "item",
        displayQuantity,
        displayUnit,
        conversionSource: "container_equivalency",
        conversionConfidence: measurementProfile.confidence,
        countUnitKey: measurementProfile.countUnitKey,
      };
    }
  }
  const canonicalGrams = getGroceryInventoryGramEquivalent(
    metadata,
    displayQuantity,
    displayUnit,
  );

  if (canonicalGrams !== null && Number.isFinite(canonicalGrams) && canonicalGrams > 0) {
    const conversionSource =
      displayUnit === "g"
        ? "entered_grams"
        : displayUnit === "kg" || displayUnit === "oz" || displayUnit === "lb"
          ? "standard_weight_conversion"
          : displayUnit === "servings"
            ? "serving_grams"
            : displayUnit === "package"
              ? "package_net_grams"
              : "item_grams";
    return {
      canonicalQuantity: Number(canonicalGrams.toFixed(3)),
      canonicalUnit: "g",
      displayQuantity,
      displayUnit,
      conversionSource,
      conversionConfidence: displayUnit === "package" ? "medium" : "high",
    };
  }

  return {
    canonicalQuantity: displayQuantity,
    canonicalUnit: displayUnit,
    displayQuantity,
    displayUnit,
    conversionSource: "original_unit_fallback",
    conversionConfidence: "none",
  };
}

function getGroceryInventoryGramHelper(
  metadata: Record<string, unknown>,
  quantity: number | null,
  unit: GroceryInventoryUnit,
  options: { includeQuantity?: boolean; packageUnknownText?: string; unknownText?: string } = {},
) {
  const gramEquivalent = getGroceryInventoryGramEquivalent(metadata, quantity, unit);
  const formattedQuantity =
    quantity !== null ? formatFoodNutritionNumber(quantity) ?? String(quantity) : null;
  const pluralizedUnit =
    unit === "servings"
      ? quantity === 1
        ? "serving"
        : "servings"
      : unit === "package"
        ? quantity === 1
          ? "package"
          : "packages"
        : unit;

  if (gramEquivalent !== null) {
    const gramsLabel = `${formatGroceryGramValue(gramEquivalent)}g`;

    if (unit === "g") return `${gramsLabel} total`;
    if (unit === "oz") {
      return options.includeQuantity && formattedQuantity
        ? `${formattedQuantity}oz ≈ ${gramsLabel} total`
        : `≈ ${gramsLabel} total`;
    }
    if (options.includeQuantity && formattedQuantity) {
      return `${formattedQuantity} ${pluralizedUnit} ≈ ${gramsLabel} total`;
    }
    return unit === "package" ? `≈ ${gramsLabel} total` : `≈ ${gramsLabel}`;
  }

  if (unit === "package" && options.packageUnknownText) return options.packageUnknownText;
  return options.unknownText ?? "Total grams unknown";
}

function getGroceryDeductionGramHelper(
  metadata: Record<string, unknown>,
  quantity: number | null,
  unit: GroceryInventoryUnit,
) {
  const gramEquivalent = getGroceryInventoryGramEquivalent(metadata, quantity, unit);
  if (quantity === null || gramEquivalent === null) return "Gram equivalent unknown";

  const quantityLabel = formatFoodNutritionNumber(quantity) ?? String(quantity);
  const gramsLabel = `${formatGroceryGramValue(gramEquivalent)}g`;

  if (unit === "g") return `Deducting ${gramsLabel}`;
  if (unit === "oz") return `Deducting ${quantityLabel}oz ≈ ${gramsLabel}`;
  if (unit === "servings") {
    return `Deducting ${quantityLabel} ${quantity === 1 ? "serving" : "servings"} ≈ ${gramsLabel}`;
  }
  if (unit === "package") {
    return `Deducting ${quantityLabel} ${quantity === 1 ? "package" : "packages"} ≈ ${gramsLabel}`;
  }

  return "Gram equivalent unknown";
}

function getGroceryScanDetectedInventoryLine(metadata: Record<string, unknown>) {
  const servingsContext = getGroceryPackageServingsContext(metadata);
  const profile = getStoredCountProfile(metadata);
  const containerPrefix = profile ? `Detected ${profile.singularLabel} · ` : "";

  if (servingsContext.source === "explicit") {
    return `${containerPrefix}about ${
      formatFoodNutritionNumber(servingsContext.servingsPerContainer) ??
      servingsContext.servingsPerContainer
    } servings`;
  }

  if (servingsContext.source === "inferred") {
    return `${containerPrefix}Estimated: ${
      formatFoodNutritionNumber(servingsContext.servingsPerContainer) ??
      servingsContext.servingsPerContainer
    } servings from ${formatGroceryGramValue(servingsContext.packageGrams)}g package ÷ ${
      formatGroceryGramValue(servingsContext.servingGrams)
    }g serving`;
  }

  return `${containerPrefix}Package servings not found from barcode`;
}

function formatGroceryRemainingLabel(quantity: number, unit: string) {
  const formattedQuantity = formatFoodNutritionNumber(quantity) ?? String(quantity);
  const normalizedUnit = normalizeGroceryInventoryUnit(unit);

  if (normalizedUnit === "g" || normalizedUnit === "oz") {
    return `${formattedQuantity}${normalizedUnit} left`;
  }

  const unitLabel =
    normalizedUnit === "servings"
      ? quantity === 1
        ? "serving"
        : "servings"
      : normalizedUnit === "package"
        ? quantity === 1
          ? "package"
          : "packages"
        : quantity === 1
          ? "item"
          : "items";

  return `${formattedQuantity} ${unitLabel} left`;
}

function getGroceryNaturalUnitLabel(
  metadata: Record<string, unknown>,
  quantity: number,
  fallbackUnit: string,
) {
  const profile = getStoredCountProfile(metadata);
  return profile ? formatInventoryCountLabel(quantity, profile) : fallbackUnit;
}

function getGroceryInventoryUnitOptions(foodOrMetadata?: FoodSearchResult | Record<string, unknown>) {
  const food = foodOrMetadata && "name" in foodOrMetadata
    ? foodOrMetadata as FoodSearchResult
    : null;
  const metadata = food ? getRecordMetadata(food.metadata) : getRecordMetadata(foodOrMetadata);
  const profile = food ? getFoodInventoryMeasurementProfile(food) : getStoredCountProfile(metadata);
  const hasWeight = Boolean(getGroceryPackageGrams(metadata) || getGroceryInventoryGramEquivalent(metadata, 1, "item"));
  const hasServings = Boolean(getGroceryPackageServingsContext(metadata).servingsPerContainer);
  return GROCERY_INVENTORY_UNIT_OPTIONS.filter((option) => {
    if (profile) {
      if (option.value === "item") return true;
      if (option.value === "g" || option.value === "oz") return hasWeight;
      if (option.value === "servings") return hasServings;
      return false;
    }
    return option.value !== "item";
  }).map((option) =>
    option.value === "item" && profile ? { ...option, label: profile.pluralLabel } : option,
  );
}

function getStoredCountProfile(metadata: Record<string, unknown>) {
  const profile = getRecordMetadata(metadata.inventory_measurement_profile);
  return typeof profile.countUnitKey === "string" && typeof profile.singularLabel === "string" && typeof profile.pluralLabel === "string"
    ? profile as { countUnitKey: string; singularLabel: string; pluralLabel: string }
    : null;
}

function normalizeNutritionServingUnit(
  value: unknown,
  fallback: NutritionAllowedServingUnit = "serving",
) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return fallback;
  const aliased = NUTRITION_SERVING_UNIT_ALIASES[normalized] ?? normalized;

  return NUTRITION_ALLOWED_SERVING_UNITS.includes(aliased as NutritionAllowedServingUnit)
    ? (aliased as NutritionAllowedServingUnit)
    : fallback;
}

function getNutritionServingUnitKey(value: unknown) {
  return normalizeNutritionServingUnit(value);
}

function getRawNutritionServingUnitKey(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;
  const aliased = NUTRITION_SERVING_UNIT_ALIASES[normalized] ?? normalized;

  return NUTRITION_ALLOWED_SERVING_UNITS.includes(aliased as NutritionAllowedServingUnit)
    ? (aliased as NutritionAllowedServingUnit)
    : null;
}

function isNutritionVolumeUnit(
  unit: NutritionAllowedServingUnit | null | undefined,
): unit is (typeof NUTRITION_VOLUME_UNITS)[number] {
  return Boolean(
    unit && NUTRITION_VOLUME_UNITS.includes(unit as (typeof NUTRITION_VOLUME_UNITS)[number]),
  );
}

function hasFoodGramAnchor(food: FoodSearchResult) {
  return Boolean(getPositiveNutritionNumber(food.serving_grams));
}

function hasExplicitFoodServingAnchor(food: FoodSearchResult) {
  const servingSize = getPositiveNutritionNumber(food.serving_size);
  const servingGrams = getPositiveNutritionNumber(food.serving_grams);
  const unit = getRawNutritionServingUnitKey(food.serving_unit);

  if (!servingSize || !servingGrams) return false;
  return !(unit === "g" && servingSize === 100 && servingGrams === 100);
}

function getFoodVolumeAnchor(food: FoodSearchResult) {
  const unit = getRawNutritionServingUnitKey(food.serving_unit);
  const servingSize = getPositiveNutritionNumber(food.serving_size);
  const servingGrams = getPositiveNutritionNumber(food.serving_grams);

  if (!isNutritionVolumeUnit(unit) || !servingSize || !servingGrams) return null;

  return {
    gramsPerMl: servingGrams / (servingSize * NUTRITION_VOLUME_UNIT_ML[unit]),
  };
}

function getFoodServingOptions(food: FoodSearchResult): NutritionServingOption[] {
  const options = new Map<NutritionServingUnit, NutritionServingOption>();
  const defaultUnit = getRawNutritionServingUnitKey(food.serving_unit);
  const volumeAnchor = getFoodVolumeAnchor(food);
  const groceryResource = getGroceryResourceMetadata(food);
  const countProfile = getFoodInventoryMeasurementProfile(food);

  if (groceryResource && (groceryResource.unit === "item" || groceryResource.unit === "package")) {
    options.set("container", {
      value: "container",
      label: countProfile?.singularLabel ?? (groceryResource.unit === "package" ? "package" : "item"),
    });
  }

  if (hasExplicitFoodServingAnchor(food)) {
    options.set("serving", { value: "serving", label: "serving" });
  }

  if (hasFoodGramAnchor(food)) {
    for (const unit of NUTRITION_WEIGHT_UNITS) {
      options.set(unit, { value: unit, label: unit });
    }
  }

  if (volumeAnchor) {
    for (const unit of NUTRITION_VOLUME_UNITS) {
      options.set(unit, { value: unit, label: unit });
    }
  }

  if (defaultUnit && options.has(defaultUnit)) {
    const defaultOption = options.get(defaultUnit);
    options.delete(defaultUnit);
    if (defaultOption) {
      return [defaultOption, ...options.values()];
    }
  }

  return [...options.values()];
}

function getSafeFoodServingUnit(
  food: FoodSearchResult,
  unit: unknown,
): NutritionServingUnit {
  if (unit === "container" && getFoodServingOptions(food).some((option) => option.value === "container")) {
    return "container";
  }
  const normalizedUnit = getRawNutritionServingUnitKey(unit);
  const optionValues = new Set(getFoodServingOptions(food).map((option) => option.value));

  if (normalizedUnit && optionValues.has(normalizedUnit)) return normalizedUnit;
  if (hasFoodGramAnchor(food)) return "g";
  if (hasExplicitFoodServingAnchor(food)) return "serving";
  return normalizedUnit ?? "serving";
}

function getDefaultFoodServingUnit(food: FoodSearchResult) {
  const groceryResource = getGroceryResourceMetadata(food);
  if (groceryResource && (groceryResource.unit === "item" || groceryResource.unit === "package")) {
    return "container";
  }
  if (hasFoodGramAnchor(food)) return "g";

  const defaultUnit = getRawNutritionServingUnitKey(food.serving_unit);
  return getSafeFoodServingUnit(food, defaultUnit ?? "serving");
}

function getDefaultFoodServingAmount(food: FoodSearchResult) {
  const servingUnit = getDefaultFoodServingUnit(food);
  const servingSize = getPositiveNutritionNumber(food.serving_size);

  if (servingUnit === "container") return 1;

  if (servingUnit === "g") {
    return getPositiveNutritionNumber(food.serving_grams) ?? servingSize ?? 1;
  }

  return servingUnit === "serving" ? 1 : servingSize ?? 1;
}

function getGroceryResourceMetadata(food: FoodSearchResult) {
  const metadata = getRecordMetadata(food.metadata);
  const foodResourceId =
    typeof metadata.foodResourceId === "string" && metadata.foodResourceId.trim()
      ? metadata.foodResourceId.trim()
      : null;
  const currentQuantity = parseGroceryInventoryNumber(metadata.foodResourceQuantity);

  if (!foodResourceId || !currentQuantity) return null;

  return {
    foodResourceId,
    currentQuantity,
    unit: normalizeGroceryInventoryUnit(metadata.foodResourceUnit),
  };
}

function getDefaultGroceryDeductionDraft(
  food: FoodSearchResult,
  servingQuantity: number,
  servingUnit: NutritionServingUnit,
): GroceryDeductionDraft | null {
  const groceryResource = getGroceryResourceMetadata(food);
  if (!groceryResource) return null;

  const servingGrams = getPositiveNutritionNumber(food.serving_grams);
  const safeServingUnit = getSafeFoodServingUnit(food, servingUnit);
  const servingMultiplier = safeServingUnit === "container"
    ? getGroceryContainerNutritionResolution(food, servingQuantity).servingMultiplier ?? 0
    : getNutritionServingMultiplier({
        amount: servingQuantity,
        unit: safeServingUnit,
        defaultServingGrams: servingGrams,
        defaultServingSize: getPositiveNutritionNumber(food.serving_size),
        defaultServingUnit: getDefaultFoodServingUnit(food),
        gramsPerMl: getFoodVolumeAnchor(food)?.gramsPerMl,
      });
  const selectedGrams = servingGrams ? servingGrams * servingMultiplier : null;
  let amount = "";

  if (groceryResource.unit === "servings") {
    amount = formatNutritionServingAmount(servingMultiplier);
  } else if (groceryResource.unit === "g" && selectedGrams) {
    amount = formatFoodNutritionNumber(selectedGrams) ?? "";
  } else if (groceryResource.unit === "oz" && selectedGrams) {
    amount = formatFoodNutritionNumber(selectedGrams / GRAMS_PER_OUNCE) ?? "";
  } else if (groceryResource.unit === "package" || groceryResource.unit === "item") {
    const metadata = getRecordMetadata(food.metadata);
    const containerGrams = getGroceryInventoryGramEquivalent(metadata, 1, groceryResource.unit);
    const servingsPerContainer = getGroceryPackageServingsContext(metadata).servingsPerContainer;
    const containerAmount = servingUnit === "container"
      ? servingQuantity
      : selectedGrams && containerGrams
        ? selectedGrams / containerGrams
        : servingsPerContainer
          ? servingMultiplier / servingsPerContainer
          : null;
    if (containerAmount !== null) {
      amount = formatFoodNutritionNumber(containerAmount) ?? String(containerAmount);
    }
  }

  if (!amount) return null;

  return {
    foodResourceId: groceryResource.foodResourceId,
    currentQuantity: groceryResource.currentQuantity,
    inventoryUnit: groceryResource.unit,
    amount,
  };
}

function getRecipeServingOptions(
  recipe: NutritionRecipeSearchResult,
): NutritionServingOption[] {
  void recipe;
  return [{ value: "serving", label: "serving" }];
}

function getNutritionServingMultiplier({
  amount,
  unit,
  defaultServingGrams,
  defaultServingSize,
  defaultServingUnit,
  gramsPerMl,
}: {
  amount: number;
  unit: NutritionServingUnit;
  defaultServingGrams?: number;
  defaultServingSize?: number;
  defaultServingUnit?: string | null;
  gramsPerMl?: number;
}) {
  const normalizedAmount = normalizeNutritionQuantity(amount);
  const unitKey = getNutritionServingUnitKey(unit);
  const defaultUnitKey = getNutritionServingUnitKey(defaultServingUnit);

  if (unitKey === "g") {
    return defaultServingGrams ? normalizedAmount / defaultServingGrams : normalizedAmount;
  }

  if (unitKey === "oz") {
    return defaultServingGrams
      ? (normalizedAmount * 28.3495) / defaultServingGrams
      : normalizedAmount;
  }

  if (unitKey === "lb") {
    return defaultServingGrams
      ? (normalizedAmount * 453.59237) / defaultServingGrams
      : normalizedAmount;
  }

  if (isNutritionVolumeUnit(unitKey) && gramsPerMl && defaultServingGrams) {
    return (
      (normalizedAmount * NUTRITION_VOLUME_UNIT_ML[unitKey] * gramsPerMl) /
      defaultServingGrams
    );
  }

  if (
    unitKey === defaultUnitKey &&
    unitKey !== "serving" &&
    defaultServingSize &&
    defaultServingSize > 0
  ) {
    return normalizedAmount / defaultServingSize;
  }

  return normalizedAmount;
}

function getFoodServingMultiplier(item: NutritionSelectedFoodItem | NutritionMealBuilderItem) {
  if (!item.food) return normalizeNutritionQuantity(item.quantity);
  const safeUnit = getSafeFoodServingUnit(item.food, item.servingUnit);
  if (safeUnit === "container") {
    return getGroceryContainerNutritionResolution(item.food, item.quantity).servingMultiplier ?? 0;
  }
  const volumeAnchor = getFoodVolumeAnchor(item.food);

  return getNutritionServingMultiplier({
    amount: item.quantity,
    unit: safeUnit,
    defaultServingGrams: getPositiveNutritionNumber(item.food.serving_grams),
    defaultServingSize: getPositiveNutritionNumber(item.food.serving_size),
    defaultServingUnit: getDefaultFoodServingUnit(item.food),
    gramsPerMl: volumeAnchor?.gramsPerMl,
  });
}

type GroceryContainerNutritionResolution = {
  servingMultiplier: number | null;
  source:
    | "per_container"
    | "selected_snapshot"
    | "servings_per_container"
    | "container_grams"
    | "grocery_package_direct"
    | "unknown";
  confidence?: "inferred";
  helper: string;
};

type GroceryContainerNutritionSnapshot = Record<NutritionMacroSourceKey, number | null>;

function isContainerNutritionUnit(value: unknown, metadata: Record<string, unknown>) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const profile = getStoredCountProfile(metadata);
  return [
    "container",
    "package",
    "pack",
    "pkg",
    profile?.countUnitKey,
    profile?.singularLabel,
    profile?.pluralLabel,
  ].some((unit) => typeof unit === "string" && unit.toLowerCase() === normalized);
}

function getGroceryContainerNutritionSnapshot(
  food: FoodSearchResult,
): GroceryContainerNutritionSnapshot | null {
  const metadata = getRecordMetadata(food.metadata);
  const records = getGroceryMetadataRecords(metadata);

  for (const record of records) {
    const explicitSnapshot = getRecordMetadata(record.nutrition_per_container);
    if (getOptionalNutritionSnapshotNumber(explicitSnapshot.calories) !== null) {
      return {
        calories: getOptionalNutritionSnapshotNumber(explicitSnapshot.calories),
        carbs_g: getOptionalNutritionSnapshotNumber(explicitSnapshot.carbs_g),
        protein_g: getOptionalNutritionSnapshotNumber(explicitSnapshot.protein_g),
        fat_g: getOptionalNutritionSnapshotNumber(explicitSnapshot.fat_g),
      };
    }
  }

  for (const record of records) {
    const basis = typeof record.nutrition_basis === "string"
      ? record.nutrition_basis.trim().toLowerCase()
      : null;
    const hasExplicitContainerBasis = basis === "per_container" || basis === "container";
    const isLegacyBarcodeContainer =
      (record.source === "open_food_facts" || record.scan_source === "open_food_facts") &&
      isContainerNutritionUnit(record.serving_unit, metadata);
    if (!hasExplicitContainerBasis && !isLegacyBarcodeContainer) continue;

    const basisSnapshot = getRecordMetadata(record.nutrition_per_serving);
    const snapshot = Object.keys(basisSnapshot).length > 0 ? basisSnapshot : record;
    if (getOptionalNutritionSnapshotNumber(snapshot.calories) === null) continue;
    return {
      calories: getOptionalNutritionSnapshotNumber(snapshot.calories),
      carbs_g: getOptionalNutritionSnapshotNumber(snapshot.carbs_g),
      protein_g: getOptionalNutritionSnapshotNumber(snapshot.protein_g),
      fat_g: getOptionalNutritionSnapshotNumber(snapshot.fat_g),
    };
  }

  return null;
}

function hasExplicitPerServingNutritionBasis(food: FoodSearchResult) {
  if (hasExplicitFoodServingAnchor(food)) return true;
  const metadata = getRecordMetadata(food.metadata);
  const groceryResource = getGroceryResourceMetadata(food);
  const hasExplicitServingFields =
    !groceryResource ||
    Boolean(
      getPositiveNutritionMetadataNumber(metadata, "serving_quantity") &&
      getOptionalNutritionMetadataString(metadata, "serving_unit"),
    );
  if (
    hasExplicitServingFields &&
    getRawNutritionServingUnitKey(food.serving_unit) === "serving" &&
    getPositiveNutritionNumber(food.serving_size)
  ) {
    return true;
  }

  return getGroceryMetadataRecords(metadata).some((record) => {
    const basis = typeof record.nutrition_basis === "string"
      ? record.nutrition_basis.trim().toLowerCase()
      : null;
    return basis === "per_serving" || basis === "serving";
  });
}

function getSelectedNutritionFoodPerUnitSnapshot(
  food: FoodSearchResult,
): GroceryContainerNutritionSnapshot | null {
  const explicitContainerSnapshot = getGroceryContainerNutritionSnapshot(food);
  if (explicitContainerSnapshot) return explicitContainerSnapshot;

  const groceryResource = getGroceryResourceMetadata(food);
  if (
    !groceryResource ||
    (groceryResource.unit !== "package" && groceryResource.unit !== "item") ||
    hasExplicitPerServingNutritionBasis(food)
  ) {
    return null;
  }

  const snapshot = {
    calories: getOptionalNutritionSnapshotNumber(food.calories),
    carbs_g: getOptionalNutritionSnapshotNumber(food.carbs_g),
    protein_g: getOptionalNutritionSnapshotNumber(food.protein_g),
    fat_g: getOptionalNutritionSnapshotNumber(food.fat_g),
  };

  return Object.values(snapshot).every((value) => value !== null) ? snapshot : null;
}

function hasExplicitPer100gNutritionBasis(metadata: Record<string, unknown>) {
  return getGroceryMetadataRecords(metadata).some((record) => {
    const basis = getOptionalNutritionMetadataString(record, "nutrition_basis")
      ?.toLowerCase()
      .replace(/[\s_-]+/g, "");
    const dataPer = getOptionalNutritionMetadataString(record, "nutrition_data_per")
      ?.toLowerCase()
      .replace(/[\s_-]+/g, "");
    return basis === "100g" || basis === "per100g" || dataPer === "100g" || dataPer === "per100g";
  });
}

function hasExplicitMultipleServingsPerContainer(metadata: Record<string, unknown>) {
  return getGroceryMetadataRecords(metadata).some((record) =>
    [
      "explicit_servings_per_container",
      "inferred_servings_per_container",
      "servings_per_container",
      "servings_per_package",
    ].some((key) => (getPositiveNutritionMetadataNumber(record, key) ?? 0) > 1),
  );
}

function getGroceryContainerNutritionResolution(
  food: FoodSearchResult,
  selectedContainerCount: number,
): GroceryContainerNutritionResolution {
  const count = normalizeNutritionQuantity(selectedContainerCount);
  const profile = getFoodInventoryMeasurementProfile(food);
  const label = formatInventoryCountLabel(count, profile ?? { singularLabel: "package", pluralLabel: "packages" });
  const quantityLabel = formatFoodNutritionNumber(count) ?? String(count);
  const metadata = getRecordMetadata(food.metadata);
  const perContainer = getGroceryContainerNutritionSnapshot(food);
  const selectedSnapshot = getSelectedNutritionFoodPerUnitSnapshot(food);
  const perServingCalories = getOptionalNutritionSnapshotNumber(food.calories);
  const containerCalories = perContainer?.calories ?? null;
  if (containerCalories !== null) {
    return {
      servingMultiplier:
        perServingCalories && perServingCalories > 0
          ? count * containerCalories / perServingCalories
          : count,
      source: "per_container",
      helper:
        count === 1
          ? `Nutrition for ${quantityLabel} ${label}`
          : `${quantityLabel} ${label} × package nutrition`,
    };
  }

  if (selectedSnapshot) {
    return {
      servingMultiplier: count,
      source: "selected_snapshot",
      helper:
        count === 1
          ? `Nutrition for ${quantityLabel} ${label}`
          : `${quantityLabel} ${label} × package nutrition`,
    };
  }

  const context = getGroceryPackageServingsContext(metadata);
  const servingsPerContainer = context.servingsPerContainer ?? profile?.servingsPerContainer ?? null;
  if (servingsPerContainer) {
    const servings = count * servingsPerContainer;
    return {
      servingMultiplier: servings,
      source: "servings_per_container",
      helper: `${quantityLabel} ${label} × ${formatFoodNutritionNumber(servingsPerContainer) ?? servingsPerContainer} servings = ${formatFoodNutritionNumber(servings) ?? servings} servings`,
    };
  }

  const containerGrams = context.packageGrams ?? profile?.netGramsPerContainer ?? profile?.gramsPerItem ?? null;
  const servingGrams = getPositiveNutritionNumber(food.serving_grams);
  if (containerGrams && servingGrams) {
    const grams = count * containerGrams;
    return {
      servingMultiplier: grams / servingGrams,
      source: "container_grams",
      helper: `${quantityLabel} ${label} ≈ ${formatGroceryGramValue(grams)}g total`,
    };
  }

  const groceryResource = getGroceryResourceMetadata(food);
  const hasFiniteBaseNutrition = [
    food.calories,
    food.carbs_g,
    food.protein_g,
    food.fat_g,
  ].every((value) => getOptionalNutritionSnapshotNumber(value) !== null);
  if (
    groceryResource &&
    (groceryResource.unit === "package" || groceryResource.unit === "item") &&
    hasFiniteBaseNutrition &&
    !hasExplicitPer100gNutritionBasis(metadata) &&
    !hasExplicitMultipleServingsPerContainer(metadata)
  ) {
    return {
      servingMultiplier: count,
      source: "grocery_package_direct",
      confidence: "inferred",
      helper:
        count === 1
          ? `Nutrition for ${quantityLabel} ${label}`
          : `${quantityLabel} ${label} × package nutrition`,
    };
  }

  return {
    servingMultiplier: null,
    source: "unknown",
    helper: `${quantityLabel} ${label} · Container nutrition estimate unavailable`,
  };
}

function getRecipeServingMultiplier(
  item: NutritionMealBuilderItem | NutritionSelectedRecipeItem,
) {
  return normalizeNutritionQuantity(item.quantity);
}

function getNutritionLineValue(baseValue: unknown, multiplier: number) {
  const value = getNutritionSnapshotNumber(baseValue);
  return value * multiplier;
}

function getResolvedFoodNutritionLineValue(
  item: NutritionSelectedFoodItem,
  key: NutritionMacroSourceKey,
) {
  const servingUnit = getSafeFoodServingUnit(item.food, item.servingUnit);
  if (servingUnit === "container") {
    const perUnitValue = getSelectedNutritionFoodPerUnitSnapshot(item.food)?.[key] ?? null;
    if (perUnitValue !== null) return perUnitValue * normalizeNutritionQuantity(item.quantity);
  }

  return getNutritionLineValue(item.food[key], getFoodServingMultiplier(item));
}

function formatNutritionServingAmount(value: number) {
  return formatFoodNutritionNumber(normalizeNutritionQuantity(value)) ?? "1";
}

function formatNutritionServingLabel(amount: number, unit: NutritionServingUnit) {
  return `${formatNutritionServingAmount(amount)} ${unit === "container" ? "container" : normalizeNutritionServingUnit(unit)}`;
}

function getNextWholeNutritionQuantity(quantity: number, step: -1 | 1) {
  const normalizedQuantity = normalizeNutritionQuantity(quantity);
  const nextQuantity =
    step > 0 ? Math.floor(normalizedQuantity) + 1 : Math.ceil(normalizedQuantity) - 1;

  return Math.min(10000, Math.max(1, nextQuantity));
}

function makeNutritionSelectedFoodItem(
  food: FoodSearchResult,
  quantity = getDefaultFoodServingAmount(food),
  servingUnit = getDefaultFoodServingUnit(food),
): NutritionSelectedFoodItem {
  const normalizedQuantity = normalizeNutritionQuantity(quantity);
  const safeServingUnit = getSafeFoodServingUnit(food, servingUnit);

  return {
    food,
    quantity: normalizedQuantity,
    servingUnit: safeServingUnit,
    groceryDeduction: getDefaultGroceryDeductionDraft(
      food,
      normalizedQuantity,
      safeServingUnit,
    ),
  };
}

function sanitizeNutritionSelectedFoodItem(
  item: NutritionSelectedFoodItem,
): NutritionSelectedFoodItem {
  const quantity = normalizeNutritionQuantity(item.quantity);
  const servingUnit = getSafeFoodServingUnit(item.food, item.servingUnit);

  return {
    ...item,
    quantity,
    servingUnit,
    groceryDeduction:
      item.groceryDeduction ??
      getDefaultGroceryDeductionDraft(item.food, quantity, servingUnit),
  };
}

function getNutritionSelectedFoodName(item: NutritionSelectedFoodItem) {
  const defaultAmount = getDefaultFoodServingAmount(item.food);
  const defaultUnit = getDefaultFoodServingUnit(item.food);
  const servingUnit = getSafeFoodServingUnit(item.food, item.servingUnit);

  if (servingUnit === "container") {
    const profile = getFoodInventoryMeasurementProfile(item.food);
    const label = formatInventoryCountLabel(item.quantity, profile ?? { singularLabel: "package", pluralLabel: "packages" });
    return `${formatNutritionServingAmount(item.quantity)} ${label} ${item.food.name}`;
  }

  if (item.quantity === defaultAmount && servingUnit === defaultUnit) {
    return item.food.name;
  }

  return `${formatNutritionServingLabel(item.quantity, servingUnit)} ${item.food.name}`;
}

function getNutritionSelectedFoodQuantityBadgeLabel(item: NutritionSelectedFoodItem) {
  const defaultAmount = getDefaultFoodServingAmount(item.food);
  const defaultUnit = getDefaultFoodServingUnit(item.food);
  const servingUnit = getSafeFoodServingUnit(item.food, item.servingUnit);

  if (servingUnit === "container") {
    const profile = getFoodInventoryMeasurementProfile(item.food);
    const label = formatInventoryCountLabel(item.quantity, profile ?? { singularLabel: "package", pluralLabel: "packages" });
    return `${formatNutritionServingAmount(item.quantity)} ${label}`;
  }
  if (item.quantity === defaultAmount && servingUnit === defaultUnit) return null;
  return formatNutritionServingLabel(item.quantity, servingUnit);
}

function getNutritionMealBuilderItemName(item: NutritionMealBuilderItem) {
  return item.type === "food"
    ? item.food?.name ?? "Food"
    : item.recipe?.name ?? "Recipe";
}

function getNutritionMealBuilderItemBrand(item: NutritionMealBuilderItem) {
  return item.type === "food" ? item.food?.brand_name ?? null : "Recipe";
}

function getNutritionMealBuilderItemUnit(item: NutritionMealBuilderItem) {
  if (item.type === "food" && item.food) {
    return getSafeFoodServingUnit(item.food, item.servingUnit);
  }

  return normalizeNutritionServingUnit(item.servingUnit);
}

function getNutritionMealBuilderItemBaseValue(
  item: NutritionMealBuilderItem,
  key: "calories" | "carbs_g" | "protein_g" | "fat_g",
) {
  if (item.type === "food") {
    return getNutritionSnapshotNumber(item.food?.[key]);
  }

  const recipeKey =
    key === "calories"
      ? "total_calories"
      : key === "carbs_g"
        ? "total_carbs_g"
        : key === "protein_g"
          ? "total_protein_g"
          : "total_fat_g";

  return getNutritionSnapshotNumber(item.recipe?.[recipeKey]);
}

function getNutritionMealBuilderItemLineValue(
  item: NutritionMealBuilderItem,
  key: NutritionMacroSourceKey,
) {
  const multiplier =
    item.type === "food" ? getFoodServingMultiplier(item) : getRecipeServingMultiplier(item);

  return getNutritionMealBuilderItemBaseValue(item, key) * multiplier;
}

function getNutritionMealBuilderTotals(items: NutritionMealBuilderItem[]) {
  return items.reduce<Record<NutritionDailyMetricKey, number>>(
    (totals, item) => {
      totals.calories += getNutritionMealBuilderItemLineValue(item, "calories");
      totals.carbs += getNutritionMealBuilderItemLineValue(item, "carbs_g");
      totals.protein += getNutritionMealBuilderItemLineValue(item, "protein_g");
      totals.fat += getNutritionMealBuilderItemLineValue(item, "fat_g");
      return totals;
    },
    { ...EMPTY_NUTRITION_TOTALS },
  );
}

function makeNutritionMealBuilderFoodItem(food: FoodSearchResult): NutritionMealBuilderItem {
  return {
    id: `food-${food.id}-${buildClientDatabaseEntryId()}`,
    type: "food",
    food,
    quantity: getDefaultFoodServingAmount(food),
    servingUnit: getDefaultFoodServingUnit(food),
  };
}

function makeNutritionMealBuilderRecipeItem(
  recipe: NutritionRecipeSearchResult,
): NutritionMealBuilderItem {
  return {
    id: `recipe-${recipe.id}-${buildClientDatabaseEntryId()}`,
    type: "recipe",
    recipe,
    quantity: 1,
    servingUnit: "serving",
  };
}

function buildNutritionMealTemplateDraftItem(
  item: NutritionMealBuilderItem,
): NutritionMealDraft["items"][number] {
  const quantity = normalizeNutritionQuantity(item.quantity);
  const name = getNutritionMealBuilderItemName(item);
  const brandName = item.type === "food" ? item.food?.brand_name ?? undefined : undefined;
  const servingUnit = getNutritionMealBuilderItemUnit(item);
  const servingGrams =
    item.type === "food" ? getPositiveNutritionNumber(item.food?.serving_grams) : undefined;
  const multiplier =
    item.type === "food" ? getFoodServingMultiplier(item) : getRecipeServingMultiplier(item);
  const snapshot = {
    name,
    displayName: name,
    brandName,
    brand_name: brandName,
    servingUnit,
    serving_unit: servingUnit,
    servingGrams,
    serving_grams: servingGrams,
    calories: getNutritionMealBuilderItemLineValue(item, "calories"),
    carbs_g: getNutritionMealBuilderItemLineValue(item, "carbs_g"),
    protein_g: getNutritionMealBuilderItemLineValue(item, "protein_g"),
    fat_g: getNutritionMealBuilderItemLineValue(item, "fat_g"),
  };

  if (item.type === "recipe" && item.recipe) {
    return {
      type: "recipe",
      recipeId: item.recipe.id,
      quantity,
      servingUnit,
      snapshot,
      metadata: {
        source: "meal-builder-recipe",
        snapshotTotals: "line",
        selectedServing: {
          amount: quantity,
          unit: servingUnit,
          multiplier,
        },
        perServing: {
          calories: getNutritionMealBuilderItemBaseValue(item, "calories"),
          carbs_g: getNutritionMealBuilderItemBaseValue(item, "carbs_g"),
          protein_g: getNutritionMealBuilderItemBaseValue(item, "protein_g"),
          fat_g: getNutritionMealBuilderItemBaseValue(item, "fat_g"),
        },
      },
    };
  }

  if (!item.food) {
    return {
      type: "custom",
      name,
      quantity,
      servingUnit,
      snapshot,
    };
  }

  return {
    type: "food",
    foodId: item.food.id,
    quantity,
    servingUnit,
    servingGrams,
    snapshot,
    metadata: {
      source: item.food.source ?? "foods",
      snapshotTotals: "line",
      selectedServing: {
        amount: quantity,
        unit: servingUnit,
        defaultServingGrams: servingGrams,
        multiplier,
      },
      perServing: {
        calories: getNutritionMealBuilderItemBaseValue(item, "calories"),
        carbs_g: getNutritionMealBuilderItemBaseValue(item, "carbs_g"),
        protein_g: getNutritionMealBuilderItemBaseValue(item, "protein_g"),
        fat_g: getNutritionMealBuilderItemBaseValue(item, "fat_g"),
      },
    },
  };
}

function getNutritionFoodLineValue(
  item: NutritionSelectedFoodItem,
  key: NutritionMacroSourceKey,
) {
  return getOptionalFoodNutritionLineValue(item, key);
}

function getNutritionSelectedFoodLineMeta(item: NutritionSelectedFoodItem) {
  const snapshot = getNutritionSelectedFoodNutrientSnapshot(item);
  const calories = formatFoodNutritionNumber(snapshot.calories);
  const carbs = formatFoodNutritionNumber(snapshot.carbohydrates);
  const protein = formatFoodNutritionNumber(snapshot.protein);
  const fat = formatFoodNutritionNumber(snapshot.fat);
  const nutritionParts = [
    calories ? `${calories} cal` : null,
    carbs ? `C ${carbs}g` : null,
    protein ? `P ${protein}g` : null,
    fat ? `F ${fat}g` : null,
  ].filter(Boolean);

  return nutritionParts.join(" · ");
}

function getNutritionMealBuilderItemLineMeta(item: NutritionMealBuilderItem) {
  const calories =
    formatFoodNutritionNumber(getNutritionMealBuilderItemLineValue(item, "calories")) ?? "0";
  const carbs =
    formatFoodNutritionNumber(getNutritionMealBuilderItemLineValue(item, "carbs_g")) ?? "0";
  const protein =
    formatFoodNutritionNumber(getNutritionMealBuilderItemLineValue(item, "protein_g")) ?? "0";
  const fat =
    formatFoodNutritionNumber(getNutritionMealBuilderItemLineValue(item, "fat_g")) ?? "0";

  return `${calories} cal · C ${carbs}g · P ${protein}g · F ${fat}g`;
}

function getNutritionSelectedRecipeLineMeta(item: NutritionSelectedRecipeItem) {
  const multiplier = getRecipeServingMultiplier(item);
  const calories =
    formatFoodNutritionNumber(getNutritionLineValue(item.recipe.total_calories, multiplier)) ??
    "0";
  const carbs =
    formatFoodNutritionNumber(getNutritionLineValue(item.recipe.total_carbs_g, multiplier)) ??
    "0";
  const protein =
    formatFoodNutritionNumber(getNutritionLineValue(item.recipe.total_protein_g, multiplier)) ??
    "0";
  const fat =
    formatFoodNutritionNumber(getNutritionLineValue(item.recipe.total_fat_g, multiplier)) ??
    "0";

  return `${calories} cal · C ${carbs}g · P ${protein}g · F ${fat}g`;
}

function formatAggregatedNutritionValue(value: number, hasValue: boolean) {
  if (!hasValue) return "";
  return formatFoodNutritionNumber(value) ?? "";
}

function getPositiveNutritionNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function getNutritionSnapshotNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : 0;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getOptionalNutritionSnapshotNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getOptionalFoodNutritionLineValue(
  item: NutritionSelectedFoodItem,
  key: NutritionMacroSourceKey,
) {
  const servingUnit = getSafeFoodServingUnit(item.food, item.servingUnit);
  const value = getOptionalNutritionSnapshotNumber(item.food[key]);
  if (value === null && servingUnit !== "container") {
    return null;
  }

  if (servingUnit === "container") {
    const perUnitSnapshot = getSelectedNutritionFoodPerUnitSnapshot(item.food);
    const hasPerUnitValue = perUnitSnapshot?.[key] !== null && perUnitSnapshot?.[key] !== undefined;
    const resolution = getGroceryContainerNutritionResolution(item.food, item.quantity);

    if (!hasPerUnitValue && resolution.servingMultiplier === null) {
      const selectedQuantity = item.quantity;
      const rawNutrientValue = item.food[key];
      if (
        typeof selectedQuantity === "number" &&
        Number.isFinite(selectedQuantity) &&
        selectedQuantity > 0 &&
        typeof rawNutrientValue === "number" &&
        Number.isFinite(rawNutrientValue)
      ) {
        return rawNutrientValue * selectedQuantity;
      }
      return null;
    }
  }

  return getResolvedFoodNutritionLineValue(item, key);
}

type NutritionSelectedFoodNutrientSnapshot = {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
};

function getNutritionSelectedFoodNutrientSnapshot(
  item: NutritionSelectedFoodItem,
): NutritionSelectedFoodNutrientSnapshot {
  return {
    calories: getOptionalFoodNutritionLineValue(item, "calories"),
    protein: getOptionalFoodNutritionLineValue(item, "protein_g"),
    carbohydrates: getOptionalFoodNutritionLineValue(item, "carbs_g"),
    fat: getOptionalFoodNutritionLineValue(item, "fat_g"),
  };
}

function aggregateSelectedNutritionFoodSnapshots(items: NutritionSelectedFoodItem[]) {
  return items.reduce<Record<NutritionDailyMetricKey, number>>(
    (totals, item) => {
      const snapshot = getNutritionSelectedFoodNutrientSnapshot(item);
      totals.calories += snapshot.calories ?? 0;
      totals.protein += snapshot.protein ?? 0;
      totals.carbs += snapshot.carbohydrates ?? 0;
      totals.fat += snapshot.fat ?? 0;
      return totals;
    },
    { ...EMPTY_NUTRITION_TOTALS },
  );
}

function formatOptionalFoodNutritionLineValue(
  item: NutritionSelectedFoodItem,
  key: NutritionMacroSourceKey,
) {
  const value = getOptionalFoodNutritionLineValue(item, key);
  return value === null ? "" : (formatFoodNutritionNumber(value) ?? "");
}

function getRecordMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getTrimmedMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getGroceryScanPackageLine(metadata: Record<string, unknown>) {
  const servingGrams = getGroceryServingGramsFromMetadata(metadata);
  const servingSizeText =
    getTrimmedMetadataString(metadata, "serving_size_text") ??
    getGroceryMetadataRecords(metadata)
      .map((record) => getTrimmedMetadataString(record, "serving_size"))
      .find(Boolean);
  const servingLabel = servingGrams
    ? `${formatFoodNutritionNumber(servingGrams) ?? servingGrams}g serving`
    : servingSizeText
      ? `${servingSizeText} serving`
      : null;
  const servingsContext = getGroceryPackageServingsContext(metadata);
  const servingsLabel = servingsContext.servingsPerContainer
    ? `about ${formatFoodNutritionNumber(servingsContext.servingsPerContainer) ?? servingsContext.servingsPerContainer} servings`
    : null;
  const netWeight =
    getGroceryMetadataRecords(metadata)
      .map(
        (record) =>
          getTrimmedMetadataString(record, "net_weight") ??
          getTrimmedMetadataString(record, "quantity"),
      )
      .find(Boolean) ??
    (servingsContext.packageGrams
      ? `${formatGroceryGramValue(servingsContext.packageGrams)}g package`
      : null);

  return [netWeight, servingsLabel, servingLabel].filter(Boolean).join(" · ");
}

function toFoodFamilyTitle(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deriveFoodFamilyName(name: unknown, brandName?: unknown) {
  if (typeof name !== "string" || !name.trim()) return null;

  let normalized = normalizeFoodSearchText(name);
  const normalizedBrand =
    typeof brandName === "string" ? normalizeFoodSearchText(brandName) : "";

  if (normalizedBrand) {
    const escapedBrand = escapeRegExp(normalizedBrand);
    normalized = normalized
      .replace(new RegExp(`^${escapedBrand}\\s+`), "")
      .replace(new RegExp(`\\s+${escapedBrand}$`), "")
      .trim();
  }

  const knownFamilies = [
    "peanut butter",
    "powdered peanut butter",
    "almond butter",
    "cashew butter",
  ];
  const knownFamily = knownFamilies.find((family) => normalized.includes(family));
  if (knownFamily) {
    return knownFamily === "powdered peanut butter"
      ? "Peanut Butter"
      : toFoodFamilyTitle(knownFamily);
  }

  const withoutDescriptors = normalized
    .replace(
      /\b(creamy|crunchy|natural|organic|classic|original|smooth|reduced fat|low fat|powdered|no sugar added|unsweetened|salted|unsalted)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return withoutDescriptors ? toFoodFamilyTitle(withoutDescriptors) : null;
}

function getFoodFamilyFromMetadataOrName(
  metadata: Record<string, unknown>,
  name: unknown,
  brandName?: unknown,
) {
  return (
    getTrimmedMetadataString(metadata, "food_family") ??
    getTrimmedMetadataString(metadata, "canonical_food_name") ??
    deriveFoodFamilyName(name, brandName)
  );
}

function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function getNutritionLocalDayWindow(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setHours(NUTRITION_DAY_START_HOUR, 0, 0, 0);

  if (referenceDate < start) {
    start.setDate(start.getDate() - 1);
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
}

function aggregateNutritionMealTotals(meals: NutritionMealTotalsSource[]) {
  return meals.reduce<Record<NutritionDailyMetricKey, number>>(
    (totals, meal) => {
      totals.calories += parseNutritionProgressNumber(meal.total_calories);
      totals.carbs += parseNutritionProgressNumber(meal.total_carbs_g);
      totals.protein += parseNutritionProgressNumber(meal.total_protein_g);
      totals.fat += parseNutritionProgressNumber(meal.total_fat_g);
      return totals;
    },
    { ...EMPTY_NUTRITION_TOTALS },
  );
}

function aggregateNutritionDraftTotals({
  values,
  caloriesField,
  macroFields,
}: {
  values: Record<string, unknown>;
  caloriesField: NoteDatabaseFieldDefinition | null;
  macroFields: NoteDatabaseFieldDefinition[];
}) {
  const totals: Record<NutritionDailyMetricKey, number> = { ...EMPTY_NUTRITION_TOTALS };

  if (caloriesField) {
    totals.calories = parseNutritionProgressNumber(values[caloriesField.id]);
  }

  for (const field of macroFields) {
    const macroKey = getNutritionMacroFieldKey(field);
    if (!macroKey) continue;
    totals[macroKey] = parseNutritionProgressNumber(values[field.id]);
  }

  return totals;
}

function NutritionDailyProgressBars({
  savedTotals,
  previewTotals,
  error,
  isAnimatedIn,
  shouldReduceMotion,
  className = "",
}: {
  savedTotals: Record<NutritionDailyMetricKey, number>;
  previewTotals: Record<NutritionDailyMetricKey, number>;
  error?: string | null;
  isAnimatedIn: boolean;
  shouldReduceMotion: boolean | null;
  className?: string;
}) {
  function renderNutritionProgressBar({
    label,
    savedValue,
    previewValue,
    target,
    unit = "",
    size,
  }: {
    label: string;
    savedValue: number;
    previewValue: number;
    target: number;
    unit?: string;
    size: "large" | "small";
  }) {
    const savedPercent =
      target > 0 ? Math.min(100, Math.max(0, (savedValue / target) * 100)) : 0;
    const previewPercent =
      target > 0
        ? Math.min(
            Math.max(0, (previewValue / target) * 100),
            Math.max(0, 100 - savedPercent),
          )
        : 0;
    const displayValue = savedValue + previewValue;
    const displayedSavedPercent = isAnimatedIn ? savedPercent : 0;
    const displayedPreviewPercent = isAnimatedIn ? previewPercent : 0;
    const formattedValue = formatFoodNutritionNumber(displayValue) ?? "0";
    const formattedTarget = formatFoodNutritionNumber(target) ?? String(target);
    const progressValue = `${formattedValue}${unit} / ${formattedTarget}${unit}`;
    const barHeightClassName = size === "large" ? "h-3" : "h-2";
    const labelClassName =
      size === "large"
        ? "text-sm font-semibold text-white/82"
        : "text-[11px] font-semibold text-white/64";
    const valueClassName =
      size === "large"
        ? "text-xs font-semibold text-white/52"
        : "text-[10px] font-semibold text-white/42";
    const fillTransitionClassName = shouldReduceMotion
      ? ""
      : "transition-[width] duration-700 ease-out";
    const savedSegmentRadiusClassName = previewPercent > 0 ? "rounded-l-full" : "rounded-full";
    const previewSegmentRadiusClassName = savedPercent > 0 ? "rounded-r-full" : "rounded-full";

    return (
      <div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className={labelClassName}>{label}</span>
          <span className={`${valueClassName} shrink-0 tabular-nums`}>{progressValue}</span>
        </div>
        <div
          className={`relative mt-1.5 overflow-hidden rounded-full border border-white/[0.045] bg-black/36 shadow-[inset_0_1px_1px_rgba(255,255,255,0.07),inset_0_-1px_2px_rgba(0,0,0,0.55)] ${barHeightClassName}`}
          role="meter"
          aria-label={`${label} daily intake`}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(displayValue, target)}
        >
          <div className="flex h-full w-full overflow-hidden rounded-full" aria-hidden="true">
            <div
              className={`h-full shrink-0 bg-[#858585] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] ${savedSegmentRadiusClassName} ${fillTransitionClassName}`}
              style={{ width: `${displayedSavedPercent}%` }}
            />
            <div
              className={`h-full shrink-0 bg-[#5a5a5a] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${previewSegmentRadiusClassName} ${fillTransitionClassName}`}
              style={{ width: `${displayedPreviewPercent}%` }}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.12]"
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2.5 px-1 pb-2.5 ${className}`}>
      {renderNutritionProgressBar({
        label: "Calories",
        savedValue: savedTotals.calories,
        previewValue: previewTotals.calories,
        target: DEFAULT_DAILY_NUTRITION_GOALS.calories,
        size: "large",
      })}
      <div className="grid grid-cols-3 gap-1.5">
        {NUTRITION_MACRO_FIELD_KEYS.map((macroKey) => (
          <div key={macroKey} className="min-w-0 rounded-lg bg-white/[0.035] px-2 py-2">
            {renderNutritionProgressBar({
              label: macroKey === "carbs" ? "Carbs" : macroKey === "protein" ? "Protein" : "Fat",
              savedValue: savedTotals[macroKey],
              previewValue: previewTotals[macroKey],
              target: DEFAULT_DAILY_NUTRITION_GOALS[macroKey],
              unit: "g",
              size: "small",
            })}
          </div>
        ))}
      </div>
      {error ? <p className="text-[11px] font-medium text-red-200/68">{error}</p> : null}
    </div>
  );
}

function getNutritionMealOccurredAt(
  fields: NoteDatabaseFieldDefinition[],
  values: Record<string, unknown>,
  fallbackIso: string,
) {
  const createdAtField = fields.find(isDatabaseCreatedAtField);
  const dateFields = fields.filter((field) => field.type === "date");
  const whenDateField =
    dateFields.find((field) => {
      const lookupKey = normalizeDatabaseFieldLookupKey(getDatabaseFieldName(field));
      return (
        lookupKey === "when" ||
        lookupKey === "date" ||
        lookupKey === "time" ||
        lookupKey === "occurredat"
      );
    }) ?? dateFields[0];
  const candidateFields = [createdAtField, whenDateField].filter(
    (field): field is NoteDatabaseFieldDefinition => Boolean(field),
  );

  for (const field of candidateFields) {
    const parsedDate = parseNutritionProgressDate(values[field.id]);
    if (parsedDate) return parsedDate.toISOString();
  }

  return fallbackIso;
}

function buildFoodNutritionMealItem(
  item: NutritionSelectedFoodItem,
): NutritionMealDraft["items"][number] {
  const { food } = item;
  const quantity = normalizeNutritionQuantity(item.quantity);
  const servingUnit = getSafeFoodServingUnit(food, item.servingUnit);
  const servingGrams = getPositiveNutritionNumber(food.serving_grams);
  const multiplier = getFoodServingMultiplier(item);
  const nutrientSnapshot = getNutritionSelectedFoodNutrientSnapshot(item);
  const calories = nutrientSnapshot.calories ?? 0;
  const carbs = nutrientSnapshot.carbohydrates ?? 0;
  const protein = nutrientSnapshot.protein ?? 0;
  const fat = nutrientSnapshot.fat ?? 0;
  const metadata =
    food.metadata && typeof food.metadata === "object" && !Array.isArray(food.metadata)
      ? (food.metadata as Record<string, unknown>)
      : {};
  const grocerySource =
    typeof metadata.source === "string" && metadata.source.startsWith("grocery");
  const metadataSource = typeof metadata.source === "string" ? metadata.source : "foods";
  const catalogFoodId =
    typeof metadata.catalogFoodId === "string" && metadata.catalogFoodId.trim()
      ? metadata.catalogFoodId.trim()
      : food.source === "grocery_resource"
        ? null
        : food.id;
  const mealItemMetadata: Json = {
    ...metadata,
    source: food.source ?? metadataSource,
    snapshotTotals: "line",
    selectedServing: {
      amount: quantity,
      unit: servingUnit,
      defaultServingGrams: servingGrams,
      multiplier,
    },
    perServing: {
      calories: getNutritionSnapshotNumber(food.calories),
      carbs_g: getNutritionSnapshotNumber(food.carbs_g),
      protein_g: getNutritionSnapshotNumber(food.protein_g),
      fat_g: getNutritionSnapshotNumber(food.fat_g),
    },
  };
  const snapshot = {
    name: food.name,
    displayName: food.name,
    brandName: food.brand_name ?? undefined,
    brand_name: food.brand_name ?? undefined,
    servingSize: food.serving_size ?? undefined,
    serving_size: food.serving_size ?? undefined,
    servingUnit,
    serving_unit: servingUnit,
    servingGrams,
    serving_grams: servingGrams,
    calories,
    carbs_g: carbs,
    protein_g: protein,
    fat_g: fat,
  };

  if (grocerySource && !catalogFoodId) {
    return {
      type: "custom" as const,
      name: food.name,
      quantity,
      servingUnit,
      servingGrams,
      snapshot,
      metadata: mealItemMetadata,
    } satisfies NutritionMealDraft["items"][number];
  }

  return {
    type: "food" as const,
    foodId: catalogFoodId ?? food.id,
    quantity,
    servingUnit,
    servingGrams,
    snapshot,
    metadata: mealItemMetadata,
  } satisfies NutritionMealDraft["items"][number];
}

function buildGroceryFoodResourceMetadata(item: NutritionSelectedFoodItem) {
  const { food } = item;
  const sourceMetadata = getRecordMetadata(food.metadata);
  const inventoryMeasurementProfile = getFoodInventoryMeasurementProfile(food);
  const quantity = normalizeNutritionQuantity(item.quantity);
  const servingUnit = getSafeFoodServingUnit(food, item.servingUnit);
  const servingGrams = getPositiveNutritionNumber(food.serving_grams);
  const multiplier = getFoodServingMultiplier(item);
  const lineCalories = getOptionalFoodNutritionLineValue(item, "calories");
  const lineCarbs = getOptionalFoodNutritionLineValue(item, "carbs_g");
  const lineProtein = getOptionalFoodNutritionLineValue(item, "protein_g");
  const lineFat = getOptionalFoodNutritionLineValue(item, "fat_g");
  const foodFamily = getFoodFamilyFromMetadataOrName(
    sourceMetadata,
    food.name,
    food.brand_name,
  );
  const containerNutrition = getGroceryContainerNutritionSnapshot(food);
  const sourceOriginalScannedNutrition = getRecordMetadata(
    sourceMetadata.originalScannedNutrition,
  );
  const originalScannedNutrition = {
    ...sourceOriginalScannedNutrition,
    serving_quantity: quantity,
    serving_unit: sourceOriginalScannedNutrition.serving_unit ?? servingUnit,
    serving_grams: servingGrams,
    calories: getOptionalNutritionSnapshotNumber(food.calories),
    carbs_g: getOptionalNutritionSnapshotNumber(food.carbs_g),
    protein_g: getOptionalNutritionSnapshotNumber(food.protein_g),
    fat_g: getOptionalNutritionSnapshotNumber(food.fat_g),
  };

  return {
    ...sourceMetadata,
    browse_department: food.browse_department ?? sourceMetadata.browse_department,
    browse_aisle: food.browse_aisle ?? sourceMetadata.browse_aisle,
    ...(inventoryMeasurementProfile ? { inventory_measurement_profile: inventoryMeasurementProfile } : {}),
    source: "grocery-food-selection",
    catalogSource: food.source ?? "foods",
    food_family: foodFamily ?? undefined,
    canonical_food_name: foodFamily ?? undefined,
    serving_quantity: quantity,
    serving_unit: servingUnit,
    serving_grams: servingGrams,
    calories: lineCalories ?? undefined,
    carbs_g: lineCarbs ?? undefined,
    protein_g: lineProtein ?? undefined,
    fat_g: lineFat ?? undefined,
    ...(containerNutrition
      ? {
          nutrition_basis: "per_container",
          nutrition_per_container: containerNutrition,
          nutrition_per_container_source: "barcode_snapshot",
          nutrition_per_container_confidence: "high",
        }
      : {}),
    selectedServing: {
      amount: quantity,
      unit: servingUnit,
      defaultServingGrams: servingGrams,
      multiplier,
    },
    foodSnapshot: {
      id: food.id,
      name: food.name,
      brandName: food.brand_name ?? undefined,
      brand_name: food.brand_name ?? undefined,
      servingSize: food.serving_size ?? undefined,
      serving_size: food.serving_size ?? undefined,
      servingUnit,
      serving_unit: servingUnit,
      servingGrams,
      serving_grams: servingGrams,
      calories: lineCalories,
      carbs_g: lineCarbs,
      protein_g: lineProtein,
      fat_g: lineFat,
    },
    perServing: {
      calories: getNutritionSnapshotNumber(food.calories),
      carbs_g: getNutritionSnapshotNumber(food.carbs_g),
      protein_g: getNutritionSnapshotNumber(food.protein_g),
      fat_g: getNutritionSnapshotNumber(food.fat_g),
    },
    originalScannedProductName:
      getTrimmedMetadataString(sourceMetadata, "originalScannedProductName") ?? food.name,
    originalScannedBrandName:
      getTrimmedMetadataString(sourceMetadata, "originalScannedBrandName") ??
      food.brand_name ??
      undefined,
    originalScannedNutrition,
  };
}

function getSortedNutritionMealItems(meal: NutritionSavedMeal) {
  return [...(meal.meal_items ?? [])].sort((a, b) => {
    const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return a.id.localeCompare(b.id);
  });
}

function getNutritionMealItemName(item: NutritionMealItemSource) {
  return item.snapshot_name?.trim() || item.custom_name?.trim() || "Food";
}

function getNutritionSavedMealDisplayName(meal: NutritionSavedMeal) {
  if (meal.name?.trim()) return meal.name.trim();

  const itemNames = getSortedNutritionMealItems(meal)
    .slice(0, 3)
    .map(getNutritionMealItemName)
    .filter(Boolean);

  return itemNames.length > 0 ? itemNames.join(", ") : "Saved meal";
}

function getNutritionSavedMealIcon(meal: NutritionSavedMeal) {
  return meal.icon?.trim() || DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON;
}

function getNutritionSavedMealTimeLabel(meal: NutritionSavedMeal) {
  if (!meal.occurred_at) return "Reusable meal";

  const date = new Date(meal.occurred_at);
  if (Number.isNaN(date.getTime())) return "Recent";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getNutritionSavedMealMeta(meal: NutritionSavedMeal) {
  const itemCount = meal.meal_items?.length ?? 0;
  const calories = formatFoodNutritionNumber(
    parseNutritionProgressNumber(meal.total_calories),
  );
  const itemLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;

  return calories ? `${calories} cal · ${itemLabel}` : itemLabel;
}

function getPositiveNutritionDraftNumber(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : fallback;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildCopiedNutritionMealItem(
  item: NutritionMealItemSource,
): NutritionMealDraft["items"][number] {
  const snapshotName = getNutritionMealItemName(item);
  const quantity = getPositiveNutritionDraftNumber(item.quantity, 1);
  const servingGrams = getPositiveNutritionDraftNumber(item.serving_grams, 0) || undefined;
  const snapshot = {
    name: snapshotName,
    displayName: snapshotName,
    brandName: item.snapshot_brand_name ?? undefined,
    brand_name: item.snapshot_brand_name ?? undefined,
    servingUnit: item.serving_unit ?? undefined,
    serving_unit: item.serving_unit ?? undefined,
    servingGrams,
    serving_grams: servingGrams,
    calories: parseNutritionProgressNumber(item.snapshot_calories),
    carbs_g: parseNutritionProgressNumber(item.snapshot_carbs_g),
    protein_g: parseNutritionProgressNumber(item.snapshot_protein_g),
    fat_g: parseNutritionProgressNumber(item.snapshot_fat_g),
  };
  const metadata = {
    source: "reused-meal",
    sourceMealItemId: item.id,
    snapshotTotals: "line",
  };

  if (item.item_type === "food" && item.food_id) {
    return {
      type: "food",
      foodId: item.food_id,
      quantity,
      servingUnit: item.serving_unit ?? undefined,
      servingGrams,
      snapshot,
      metadata,
    };
  }

  if (item.item_type === "recipe" && item.recipe_id) {
    return {
      type: "recipe",
      recipeId: item.recipe_id,
      quantity,
      servingUnit: item.serving_unit ?? undefined,
      servingGrams,
      snapshot,
      metadata,
    };
  }

  return {
    type: "custom",
    name: item.custom_name?.trim() || snapshotName,
    quantity,
    servingUnit: item.serving_unit ?? undefined,
    servingGrams,
    snapshot,
    metadata,
  };
}

function buildSelectedNutritionRecipeMealItem(
  item: NutritionSelectedRecipeItem,
): NutritionMealDraft["items"][number] {
  const { recipe } = item;
  const name = recipe.name.trim() || "Recipe";
  const quantity = normalizeNutritionQuantity(item.quantity);
  const servingUnit = normalizeNutritionServingUnit(item.servingUnit);
  const multiplier = getRecipeServingMultiplier(item);

  return {
    type: "recipe",
    recipeId: recipe.id,
    quantity,
    servingUnit,
    snapshot: {
      name,
      displayName: name,
      servingUnit,
      serving_unit: servingUnit,
      calories: getNutritionLineValue(recipe.total_calories, multiplier),
      carbs_g: getNutritionLineValue(recipe.total_carbs_g, multiplier),
      protein_g: getNutritionLineValue(recipe.total_protein_g, multiplier),
      fat_g: getNutritionLineValue(recipe.total_fat_g, multiplier),
    },
    metadata: {
      source: "saved-recipe",
      snapshotTotals: "line",
      selectedServing: {
        amount: quantity,
        unit: servingUnit,
        multiplier,
      },
      itemCount: getNutritionSavedRecipeItemCount(recipe),
    },
  };
}

function getNutritionMealName(values: Record<string, unknown>, fields: NutritionEntryFields) {
  const nameValue = fields.foodField ? values[fields.foodField.id] : null;
  if (typeof nameValue === "string" && nameValue.trim()) return nameValue.trim();
  return "Nutrition entry";
}

function buildNutritionMealDraft({
  databaseDefinition,
  databaseFields,
  selectedFoods,
  selectedMeal,
  selectedRecipe,
  selectedAction,
  values,
  entryId,
  now,
}: {
  databaseDefinition: NoteDatabaseDefinition;
  databaseFields: NoteDatabaseFieldDefinition[];
  selectedFoods: NutritionSelectedFoodItem[];
  selectedMeal: NutritionSavedMeal | null;
  selectedRecipe: NutritionSelectedRecipeItem | null;
  selectedAction: NutritionFoodActionTabId;
  values: Record<string, unknown>;
  entryId: string;
  now: string;
}): NutritionMealDraft | null {
  if (!isDefaultNutritionDatabaseDefinition(databaseDefinition)) return null;

  const fields = findNutritionEntryFields(databaseDefinition);
  let items: NutritionMealDraft["items"] = [];

  if (selectedAction === "search" || selectedAction === "grocery") {
    items = selectedFoods.map(buildFoodNutritionMealItem);
  } else if (selectedAction === "scan") {
    items = selectedFoods.map(buildFoodNutritionMealItem);
  } else if ((selectedAction === "meals" || selectedAction === "recent") && selectedMeal) {
    items = getSortedNutritionMealItems(selectedMeal).map(buildCopiedNutritionMealItem);
  } else if (selectedAction === "recipes" && selectedRecipe) {
    items = [buildSelectedNutritionRecipeMealItem(selectedRecipe)];
  } else if (selectedAction === "custom") {
    const name = getNutritionMealName(values, fields);
    items = [
      {
        type: "custom",
        name,
        quantity: 1,
        snapshot: {
          name,
          calories: getNutritionSnapshotNumber(
            fields.caloriesField ? values[fields.caloriesField.id] : 0,
          ),
          carbs_g: getNutritionSnapshotNumber(
            fields.carbsField ? values[fields.carbsField.id] : 0,
          ),
          protein_g: getNutritionSnapshotNumber(
            fields.proteinField ? values[fields.proteinField.id] : 0,
          ),
          fat_g: getNutritionSnapshotNumber(
            fields.fatField ? values[fields.fatField.id] : 0,
          ),
        },
      },
    ];
  }

  if (items.length === 0) return null;

  return {
    occurredAt: getNutritionMealOccurredAt(databaseFields, values, now),
    timezone: getLocalTimezone(),
    name: getNutritionMealName(values, fields),
    sourceNoteEntryId: entryId,
    metadata: {
      source: "note-database-entry",
      databaseId: databaseDefinition.id,
      ...((selectedAction === "meals" || selectedAction === "recent") && selectedMeal
        ? { reusedMealId: selectedMeal.id }
        : {}),
      ...(selectedAction === "recipes" && selectedRecipe
        ? { reusedRecipeId: selectedRecipe.recipe.id }
        : {}),
    },
    items,
  };
}

async function createNutritionMeal(draft: NutritionMealDraft) {
  const response = await fetch("/api/nutrition/meals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draft),
  });
  const payload = (await response.json()) as NutritionMealCreateResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to create nutrition meal.");
  }

  const mealId = payload.meal?.id;
  if (!mealId) {
    throw new Error("Nutrition meal API did not return a meal id.");
  }

  return mealId;
}

async function depleteGroceryFromNutritionItems(items: NutritionSelectedFoodItem[]) {
  for (const item of items) {
    const deduction = item.groceryDeduction;
    if (!deduction) continue;

    const amount = parseGroceryInventoryNumber(deduction.amount);
    if (!amount) continue;

    const remainingQuantity = Math.max(0, deduction.currentQuantity - amount);

    try {
      const response = await fetch("/api/food-resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deduction.foodResourceId,
          action: "setQuantity",
          quantity: remainingQuantity,
          unit: deduction.inventoryUnit,
        }),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update Grocery quantity.");
      }
    } catch (error) {
      console.error("Failed to deplete Grocery after Nutrition save", {
        error,
        foodResourceId: deduction.foodResourceId,
      });
    }
  }
}

async function createNutritionMealTemplate(draft: {
  name: string;
  icon: string;
  items: NutritionMealDraft["items"];
}) {
  const response = await fetch("/api/nutrition/meal-templates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: draft.name,
      icon: draft.icon,
      items: draft.items,
      metadata: {
        source: "nutrition-meal-builder",
      },
    }),
  });
  const payload = (await response.json()) as NutritionMealCreateResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to create meal.");
  }

  return payload.meal ?? null;
}

async function createNutritionRecipe(draft: {
  name: string;
  icon: string;
  items: NutritionMealDraft["items"];
}) {
  const response = await fetch("/api/nutrition/recipes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: draft.name,
      icon: draft.icon,
      items: draft.items,
      metadata: {
        source: "nutrition-recipe-builder",
      },
    }),
  });
  const payload = (await response.json()) as NutritionRecipeCreateResponse;

  if (!response.ok) {
    throw new Error(payload.error || "Unable to create recipe.");
  }

  return payload.recipe ?? null;
}

function mapSelectedNutritionFoodsToEntryValues(
  items: NutritionSelectedFoodItem[],
  databaseDefinition: NoteDatabaseDefinition | null | undefined,
) {
  if (databaseDefinition && isOnHandDatabaseDefinition(databaseDefinition)) {
    const item = items[0] ?? null;
    if (!item) {
      return {
        [ON_HAND_NAME_FIELD_ID]: "",
        [ON_HAND_QUANTITY_FIELD_ID]: "",
        [ON_HAND_UNIT_FIELD_ID]: "",
        food_id: "",
        brand_name: "",
        metadata: {},
      };
    }

    return {
      [ON_HAND_NAME_FIELD_ID]: item.food.name,
      [ON_HAND_QUANTITY_FIELD_ID]: formatNutritionServingAmount(
        getGroceryDefaultInventoryAmount(item.food).quantity,
      ),
      [ON_HAND_UNIT_FIELD_ID]: getGroceryDefaultInventoryAmount(item.food).unit,
      [GROCERY_CUSTOM_CALORIES_FIELD_ID]: formatOptionalFoodNutritionLineValue(
        item,
        "calories",
      ),
      [GROCERY_CUSTOM_CARBS_FIELD_ID]: formatOptionalFoodNutritionLineValue(item, "carbs_g"),
      [GROCERY_CUSTOM_PROTEIN_FIELD_ID]: formatOptionalFoodNutritionLineValue(
        item,
        "protein_g",
      ),
      [GROCERY_CUSTOM_FAT_FIELD_ID]: formatOptionalFoodNutritionLineValue(item, "fat_g"),
      food_id: item.food.id,
      brand_name: item.food.brand_name ?? "",
      metadata: buildGroceryFoodResourceMetadata(item),
    };
  }

  const { foodField, caloriesField, carbsField, proteinField, fatField } =
    findNutritionEntryFields(databaseDefinition);
  const values: Record<string, string> = {};
  const totals = {
    calories: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
  } satisfies Record<NutritionDailyMetricKey, number>;
  const hasMetricValue: Record<NutritionDailyMetricKey, boolean> = {
    calories: false,
    carbs: false,
    protein: false,
    fat: false,
  };

  for (const item of items) {
    const snapshot = getNutritionSelectedFoodNutrientSnapshot(item);
    const calories = snapshot.calories;
    const carbs = snapshot.carbohydrates;
    const protein = snapshot.protein;
    const fat = snapshot.fat;

    if (calories !== null) {
      totals.calories += calories;
      hasMetricValue.calories = true;
    }
    if (carbs !== null) {
      totals.carbs += carbs;
      hasMetricValue.carbs = true;
    }
    if (protein !== null) {
      totals.protein += protein;
      hasMetricValue.protein = true;
    }
    if (fat !== null) {
      totals.fat += fat;
      hasMetricValue.fat = true;
    }
  }

  if (foodField) {
    values[foodField.id] = items.map(getNutritionSelectedFoodName).join(", ");
  }
  if (caloriesField) {
    values[caloriesField.id] = formatAggregatedNutritionValue(
      totals.calories,
      hasMetricValue.calories,
    );
  }
  if (carbsField) {
    values[carbsField.id] = formatAggregatedNutritionValue(totals.carbs, hasMetricValue.carbs);
  }
  if (proteinField) {
    values[proteinField.id] = formatAggregatedNutritionValue(
      totals.protein,
      hasMetricValue.protein,
    );
  }
  if (fatField) {
    values[fatField.id] = formatAggregatedNutritionValue(totals.fat, hasMetricValue.fat);
  }

  return values;
}

function mapNutritionSavedMealToEntryValues(
  meal: NutritionSavedMeal,
  databaseDefinition: NoteDatabaseDefinition | null | undefined,
) {
  const { foodField, caloriesField, carbsField, proteinField, fatField } =
    findNutritionEntryFields(databaseDefinition);
  const values: Record<string, string> = {};

  if (foodField) {
    values[foodField.id] = getNutritionSavedMealDisplayName(meal);
  }
  if (caloriesField) {
    values[caloriesField.id] =
      formatFoodNutritionNumber(parseNutritionProgressNumber(meal.total_calories)) ?? "";
  }
  if (carbsField) {
    values[carbsField.id] =
      formatFoodNutritionNumber(parseNutritionProgressNumber(meal.total_carbs_g)) ?? "";
  }
  if (proteinField) {
    values[proteinField.id] =
      formatFoodNutritionNumber(parseNutritionProgressNumber(meal.total_protein_g)) ?? "";
  }
  if (fatField) {
    values[fatField.id] =
      formatFoodNutritionNumber(parseNutritionProgressNumber(meal.total_fat_g)) ?? "";
  }

  return values;
}

function mapNutritionSavedRecipeToEntryValues(
  item: NutritionSelectedRecipeItem,
  databaseDefinition: NoteDatabaseDefinition | null | undefined,
) {
  const { recipe } = item;
  const { foodField, caloriesField, carbsField, proteinField, fatField } =
    findNutritionEntryFields(databaseDefinition);
  const values: Record<string, string> = {};
  const multiplier = getRecipeServingMultiplier(item);

  if (foodField) {
    values[foodField.id] = recipe.name;
  }
  if (caloriesField) {
    values[caloriesField.id] =
      formatFoodNutritionNumber(getNutritionLineValue(recipe.total_calories, multiplier)) ??
      "";
  }
  if (carbsField) {
    values[carbsField.id] =
      formatFoodNutritionNumber(getNutritionLineValue(recipe.total_carbs_g, multiplier)) ??
      "";
  }
  if (proteinField) {
    values[proteinField.id] =
      formatFoodNutritionNumber(getNutritionLineValue(recipe.total_protein_g, multiplier)) ??
      "";
  }
  if (fatField) {
    values[fatField.id] =
      formatFoodNutritionNumber(getNutritionLineValue(recipe.total_fat_g, multiplier)) ??
      "";
  }

  return values;
}

function getDatabaseEntryTitle(entry: NoteDatabaseEntry, definition: NoteDatabaseDefinition) {
  const titleField = getDatabaseTitleField(definition);
  if (!titleField) return "Untitled";

  return formatDatabaseEntryValue(entry.values[titleField.id], titleField.type) || "Untitled";
}

function getDatabaseEntryProperties(
  entry: NoteDatabaseEntry,
  definition: NoteDatabaseDefinition,
  limit?: number,
) {
  const titleField = getDatabaseTitleField(definition);
  const properties = getVisibleDatabaseFields(definition)
    .filter((field) => field.id !== titleField?.id)
    .map((field) => ({
      field,
      value: formatDatabaseEntryValue(entry.values[field.id], field.type),
    }));

  return typeof limit === "number" ? properties.slice(0, limit) : properties;
}

function getDatabaseEntryFieldValue(
  field: NoteDatabaseFieldDefinition,
  rawValue: string,
): unknown {
  const trimmedValue = rawValue.trim();

  if (field.type === "number") {
    if (trimmedValue.length === 0) return null;
    const numericValue = Number(trimmedValue);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  if (field.type === "rating") {
    if (trimmedValue.length === 0) return null;
    const numericValue = Number(trimmedValue);
    if (Number.isNaN(numericValue)) return null;
    return Math.min(5, Math.max(1, numericValue));
  }

  if (field.type === "photo") {
    return null;
  }

  return rawValue;
}

function getDatabaseEntryInitialFormValues(
  definition: NoteDatabaseDefinition,
  openedAt: string,
  entry?: NoteDatabaseEntry | null,
) {
  if (entry) {
    return {
      ...entry.values,
      ...Object.fromEntries(
        definition.fields.map((field) => {
          const value = entry.values[field.id];
          return [field.id, value == null ? "" : String(value)];
        }),
      ),
    };
  }

  return getDatabaseCreatedAtInitialFormValues(definition, openedAt);
}

function mapFoodResourceToDatabaseEntry(resource: FoodResource): NoteDatabaseEntry {
  const metadata =
    resource.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
      ? (resource.metadata as Record<string, unknown>)
      : {};

  return {
    id: resource.id,
    createdAt: resource.created_at,
    updatedAt: resource.updated_at,
    values: {
      [ON_HAND_NAME_FIELD_ID]: resource.name,
      [ON_HAND_QUANTITY_FIELD_ID]: resource.quantity,
      [ON_HAND_UNIT_FIELD_ID]: resource.unit,
      [ON_HAND_LOCATION_FIELD_ID]: resource.location,
      [ON_HAND_EXPIRES_ON_FIELD_ID]: resource.expires_on,
      [ON_HAND_NOTES_FIELD_ID]: resource.notes,
      [GROCERY_CUSTOM_CALORIES_FIELD_ID]: metadata.calories ?? "",
      [GROCERY_CUSTOM_CARBS_FIELD_ID]: metadata.carbs_g ?? "",
      [GROCERY_CUSTOM_PROTEIN_FIELD_ID]: metadata.protein_g ?? "",
      [GROCERY_CUSTOM_FAT_FIELD_ID]: metadata.fat_g ?? "",
      food_id: resource.food_id,
      brand_name: resource.brand_name,
      metadata: resource.metadata,
      status: resource.status,
    },
  };
}

function getFoodResourceMetadata(resource: FoodResource) {
  return resource.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
    ? (resource.metadata as Record<string, unknown>)
    : {};
}

type GroceryResourceDisplayAmount = {
  displayQuantity: number | null;
  displayUnit: string;
  displayText: string;
  secondaryText?: string;
};

function formatGroceryDisplayQuantity(quantity: number) {
  return String(Number(quantity.toFixed(1)));
}

function formatGroceryDisplayText(quantity: number, unit: string) {
  const formattedQuantity = formatGroceryDisplayQuantity(quantity);
  const normalizedUnit = unit.trim().toLowerCase();

  if (["g", "kg", "oz", "lb", "ml", "l"].includes(normalizedUnit)) {
    return normalizedUnit === "g"
      ? `${formattedQuantity}g`
      : `${formattedQuantity} ${unit.trim()}`;
  }

  const unitLabel =
    quantity === 1
      ? unit.trim().replace(/s$/i, "")
      : unit.trim();
  return `${formattedQuantity} ${unitLabel}`;
}

function getGroceryResourceDisplayAmount(resource: FoodResource): GroceryResourceDisplayAmount {
  const metadata = getFoodResourceMetadata(resource);
  const metadataAmounts = [
    [metadata.display_quantity, metadata.display_unit],
    [metadata.acquired_quantity, metadata.acquired_unit],
  ] as const;

  for (const [quantityValue, unitValue] of metadataAmounts) {
    const displayQuantity = getFoodResourceNumber(quantityValue);
    const displayUnit = getFoodResourceText(unitValue);
    if (displayQuantity !== null && displayUnit) {
      const countProfile = getStoredCountProfile(metadata);
      if (["item", "package"].includes(resource.unit?.toLowerCase() ?? "") && countProfile) {
        const canonicalQuantity = getFoodResourceNumber(resource.quantity) ?? displayQuantity;
        const label = formatInventoryCountLabel(canonicalQuantity, countProfile);
        return {
          displayQuantity: canonicalQuantity,
          displayUnit: label,
          displayText: `${formatGroceryDisplayQuantity(canonicalQuantity)} ${label}`,
        };
      }
      return {
        displayQuantity,
        displayUnit,
        displayText: formatGroceryDisplayText(displayQuantity, displayUnit),
      };
    }
  }

  const storedQuantity = getFoodResourceNumber(resource.quantity);
  const storedUnit = getFoodResourceText(resource.unit);
  if (storedQuantity === null || !storedUnit) {
    return {
      displayQuantity: storedQuantity,
      displayUnit: storedUnit,
      displayText:
        storedQuantity !== null
          ? formatGroceryDisplayQuantity(storedQuantity)
          : storedUnit,
    };
  }

  if (storedUnit.toLowerCase() === "g") {
    if (storedQuantity >= GRAMS_PER_OUNCE * 16) {
      const displayQuantity = storedQuantity / (GRAMS_PER_OUNCE * 16);
      return {
        displayQuantity,
        displayUnit: "lb",
        displayText: formatGroceryDisplayText(displayQuantity, "lb"),
      };
    }

    if (storedQuantity >= GRAMS_PER_OUNCE) {
      const displayQuantity = storedQuantity / GRAMS_PER_OUNCE;
      return {
        displayQuantity,
        displayUnit: "oz",
        displayText: formatGroceryDisplayText(displayQuantity, "oz"),
      };
    }
  }

  if (storedUnit.toLowerCase() === "item" || storedUnit.toLowerCase() === "package") {
    const countProfile = getStoredCountProfile(metadata);
    if (countProfile) {
      const label = formatInventoryCountLabel(storedQuantity, countProfile);
      return {
        displayQuantity: storedQuantity,
        displayUnit: label,
        displayText: `${formatGroceryDisplayQuantity(storedQuantity)} ${label}`,
      };
    }
  }

  return {
    displayQuantity: storedQuantity,
    displayUnit: storedUnit,
    displayText: formatGroceryDisplayText(storedQuantity, storedUnit),
  };
}

function getGroceryResourceFoodIcon(resource: FoodResource): FoodIcon {
  const metadata = getFoodResourceMetadata(resource);
  const iconMetadata = getRecordMetadata(metadata.icon);
  const storedEmoji = [
    metadata.food_emoji,
    metadata.emoji,
    iconMetadata.emoji,
    metadata.food_icon,
    typeof metadata.icon === "string" ? metadata.icon : null,
  ].find(
    (value): value is string =>
      typeof value === "string" && /\p{Extended_Pictographic}/u.test(value.trim()),
  );

  if (storedEmoji) {
    return {
      assetPath: null,
      fallbackEmoji: storedEmoji.trim(),
      label: resource.name || "Food",
    };
  }

  const iconName = getOptionalNutritionMetadataString(iconMetadata, "name");
  const candidates = [
    iconName,
    getOptionalNutritionMetadataString(metadata, "food_icon"),
    getOptionalNutritionMetadataString(metadata, "food_family"),
    getOptionalNutritionMetadataString(metadata, "canonical_food_name"),
    resource.name,
    getOptionalNutritionMetadataString(metadata, "category"),
    getOptionalNutritionMetadataString(metadata, "food_category"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolvedIcon = getFoodIcon({ name: resource.name, normalized_name: candidate });
    if (resolvedIcon.assetPath || resolvedIcon.fallbackEmoji !== "🍽️") return resolvedIcon;
  }

  return getFoodIcon({ name: resource.name });
}

function getOptionalNutritionMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = getNutritionSnapshotNumber(metadata[key]);
  return value ?? null;
}

function getPositiveNutritionMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = getNutritionSnapshotNumber(metadata[key]);
  return value !== null && value > 0 ? value : null;
}

function getOptionalNutritionMetadataString(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapFoodResourceToFoodSearchResult(resource: FoodResource): FoodSearchResult {
  const metadata = getFoodResourceMetadata(resource);
  const catalogFood = getRecordMetadata(resource.catalog_food);
  const catalogMetadata = getRecordMetadata(catalogFood.metadata);
  const servingQuantity =
    getPositiveNutritionMetadataNumber(metadata, "serving_quantity") ??
    1;
  const servingUnit =
    getOptionalNutritionMetadataString(metadata, "serving_unit") ??
    "serving";
  const source =
    resource.food_id || metadata.source === "grocery-food-selection"
      ? "grocery_resource"
      : "grocery_custom";
  const foodMetadata = {
    ...metadata,
    source,
    catalogFoodId: resource.food_id,
    foodResourceId: resource.id,
    foodResourceStatus: resource.status,
    foodResourceLocation: resource.location,
    foodResourceQuantity: resource.quantity,
    foodResourceUnit: resource.unit,
  } as FoodSearchResult["metadata"];

  return {
    id: `grocery-resource-${resource.id}`,
    name: resource.name || getFoodResourceText(catalogFood.name),
    normalized_name: getFoodResourceText(catalogFood.normalized_name) || null,
    brand_name: resource.brand_name || getFoodResourceText(catalogFood.brand_name) || null,
    source,
    serving_size: servingQuantity,
    serving_unit: servingUnit,
    serving_grams: getPositiveNutritionMetadataNumber(metadata, "serving_grams"),
    calories: getOptionalNutritionMetadataNumber(metadata, "calories"),
    carbs_g: getOptionalNutritionMetadataNumber(metadata, "carbs_g"),
    protein_g: getOptionalNutritionMetadataNumber(metadata, "protein_g"),
    fat_g: getOptionalNutritionMetadataNumber(metadata, "fat_g"),
    catalog_metadata: catalogMetadata,
    metadata: foodMetadata,
  };
}

function getCorrectedGroceryNutritionMetadata(entryValues: Record<string, unknown>) {
  const baseMetadata = getRecordMetadata(entryValues.metadata);
  const name = entryValues[ON_HAND_NAME_FIELD_ID];
  const brandName = entryValues.brand_name;
  const servingQuantity =
    getPositiveNutritionMetadataNumber(baseMetadata, "serving_quantity") ?? 1;
  const servingUnit =
    getOptionalNutritionMetadataString(baseMetadata, "serving_unit") ?? "serving";
  const inventoryQuantity =
    parseGroceryInventoryNumber(entryValues[ON_HAND_QUANTITY_FIELD_ID]) ?? null;
  const inventoryUnit = normalizeGroceryInventoryUnit(entryValues[ON_HAND_UNIT_FIELD_ID]);
  const hasCaloriesInput = Object.prototype.hasOwnProperty.call(
    entryValues,
    GROCERY_CUSTOM_CALORIES_FIELD_ID,
  );
  const hasCarbsInput = Object.prototype.hasOwnProperty.call(
    entryValues,
    GROCERY_CUSTOM_CARBS_FIELD_ID,
  );
  const hasProteinInput = Object.prototype.hasOwnProperty.call(
    entryValues,
    GROCERY_CUSTOM_PROTEIN_FIELD_ID,
  );
  const hasFatInput = Object.prototype.hasOwnProperty.call(
    entryValues,
    GROCERY_CUSTOM_FAT_FIELD_ID,
  );
  const calories = getOptionalNutritionSnapshotNumber(
    hasCaloriesInput ? entryValues[GROCERY_CUSTOM_CALORIES_FIELD_ID] : baseMetadata.calories,
  );
  const carbsG = getOptionalNutritionSnapshotNumber(
    hasCarbsInput ? entryValues[GROCERY_CUSTOM_CARBS_FIELD_ID] : baseMetadata.carbs_g,
  );
  const proteinG = getOptionalNutritionSnapshotNumber(
    hasProteinInput ? entryValues[GROCERY_CUSTOM_PROTEIN_FIELD_ID] : baseMetadata.protein_g,
  );
  const fatG = getOptionalNutritionSnapshotNumber(
    hasFatInput ? entryValues[GROCERY_CUSTOM_FAT_FIELD_ID] : baseMetadata.fat_g,
  );
  const foodFamily = getFoodFamilyFromMetadataOrName(baseMetadata, name, brandName);
  const correctedNutrition = {
    serving_quantity: servingQuantity,
    serving_unit: servingUnit,
    calories,
    carbs_g: carbsG,
    protein_g: proteinG,
    fat_g: fatG,
  };
  const metadata: Record<string, unknown> = {
    ...baseMetadata,
    food_family: foodFamily ?? undefined,
    canonical_food_name: foodFamily ?? undefined,
    serving_quantity: servingQuantity,
    serving_unit: servingUnit,
    inventory_quantity: inventoryQuantity ?? undefined,
    inventory_unit: inventoryUnit,
    calories: calories ?? undefined,
    carbs_g: carbsG ?? undefined,
    protein_g: proteinG ?? undefined,
    fat_g: fatG ?? undefined,
    correctedNutrition,
  };

  for (const key of ["calories", "carbs_g", "protein_g", "fat_g"] as const) {
    if (metadata[key] === undefined) {
      delete metadata[key];
    }
  }

  return metadata;
}

function mapOnHandEntryToFoodResourcePayload(entry: NoteDatabaseEntry) {
  const metadata = getCorrectedGroceryNutritionMetadata(entry.values);

  return {
    id: entry.id,
    food_id: typeof entry.values.food_id === "string" ? entry.values.food_id : null,
    brand_name:
      typeof entry.values.brand_name === "string" ? entry.values.brand_name : null,
    name: entry.values[ON_HAND_NAME_FIELD_ID],
    quantity: entry.values[ON_HAND_QUANTITY_FIELD_ID],
    unit: entry.values[ON_HAND_UNIT_FIELD_ID],
    location: entry.values[ON_HAND_LOCATION_FIELD_ID],
    expires_on: entry.values[ON_HAND_EXPIRES_ON_FIELD_ID],
    notes: entry.values[ON_HAND_NOTES_FIELD_ID],
    metadata,
  };
}

function getGroceryCustomMetadata(entryValues: Record<string, unknown>) {
  const metadata: Record<string, unknown> = {
    ...getRecordMetadata(entryValues.metadata),
  };
  const calories = getOptionalNutritionSnapshotNumber(
    entryValues[GROCERY_CUSTOM_CALORIES_FIELD_ID],
  );
  const carbsG = getOptionalNutritionSnapshotNumber(
    entryValues[GROCERY_CUSTOM_CARBS_FIELD_ID],
  );
  const proteinG = getOptionalNutritionSnapshotNumber(
    entryValues[GROCERY_CUSTOM_PROTEIN_FIELD_ID],
  );
  const fatG = getOptionalNutritionSnapshotNumber(entryValues[GROCERY_CUSTOM_FAT_FIELD_ID]);
  const servingQuantity =
    getPositiveNutritionMetadataNumber(entryValues, "serving_quantity") ?? 1;
  const servingUnit = getOptionalNutritionMetadataString(entryValues, "serving_unit") ?? "serving";
  const inventoryQuantity =
    parseGroceryInventoryNumber(entryValues[ON_HAND_QUANTITY_FIELD_ID]) ?? null;
  const inventoryUnit = normalizeGroceryInventoryUnit(entryValues[ON_HAND_UNIT_FIELD_ID]);
  const foodFamily = getFoodFamilyFromMetadataOrName(
    metadata,
    entryValues[ON_HAND_NAME_FIELD_ID],
    entryValues.brand_name,
  );

  metadata.source = "grocery_custom";
  metadata.food_family = foodFamily ?? undefined;
  metadata.canonical_food_name = foodFamily ?? undefined;
  metadata.serving_quantity = servingQuantity;
  metadata.serving_unit = servingUnit;
  metadata.inventory_quantity = inventoryQuantity ?? undefined;
  metadata.inventory_unit = inventoryUnit;
  if (calories !== null) metadata.calories = calories;
  if (carbsG !== null) metadata.carbs_g = carbsG;
  if (proteinG !== null) metadata.protein_g = proteinG;
  if (fatG !== null) metadata.fat_g = fatG;

  return metadata;
}

function formatDatabaseCreatedAtMetadata(openedAt: string) {
  const parsedDate = new Date(openedAt);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const datePart = parsedDate.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
  const timePart = parsedDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart} at ${timePart}`;
}

function SortableDatabaseFieldHeader({
  databaseId,
  field,
  isReorderable,
  onFieldHeaderClick,
  shouldSuppressClick,
}: {
  databaseId: string;
  field: NoteDatabaseFieldDefinition;
  isReorderable: boolean;
  onFieldHeaderClick?: (field: NoteDatabaseFieldDefinition) => void;
  shouldSuppressClick: () => boolean;
}) {
  const canOpenFieldEditor = Boolean(onFieldHeaderClick);
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: buildDatabaseFieldDragId(databaseId, field.id),
    disabled: !isReorderable,
  });
  const style: CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      scope="col"
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-r border-white/[0.08] bg-[#08090a]/98 p-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42 backdrop-blur ${
        isDragging ? "z-20 opacity-80 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.95)]" : ""
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...(isReorderable ? attributes : {})}
        {...(isReorderable ? listeners : {})}
        onClick={(event) => {
          if (shouldSuppressClick()) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          onFieldHeaderClick?.(field);
        }}
        disabled={!canOpenFieldEditor}
        aria-label={
          canOpenFieldEditor
            ? `Edit field ${getDatabaseFieldName(field)}`
            : getDatabaseFieldName(field)
        }
        title={isReorderable ? "Hold to reorder" : canOpenFieldEditor ? "Edit field" : undefined}
        className={`block h-full w-full select-none px-2 py-1.5 text-left outline-none transition focus-visible:bg-white/[0.06] focus-visible:text-white/78 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-200/30 [-webkit-touch-callout:none] ${
          canOpenFieldEditor
            ? "cursor-pointer hover:bg-white/[0.045] hover:text-white/68 active:cursor-grabbing"
            : "cursor-default text-white/42"
        }`}
      >
        <span className="block">{getDatabaseFieldName(field)}</span>
      </button>
    </th>
  );
}

function NoteDatabaseEntriesView({
  activeView,
  definition,
  entries,
  onAddField,
  onArchiveEntry,
  onEditEntry,
  onFieldHeaderClick,
  onFieldOrderChange,
  size = "compact",
  titleField,
  visibleFields,
}: {
  activeView: NoteDatabaseViewDefinition;
  definition: NoteDatabaseDefinition;
  entries: NoteDatabaseEntry[];
  onAddField?: () => void;
  onArchiveEntry?: (entry: NoteDatabaseEntry) => void;
  onEditEntry?: (entry: NoteDatabaseEntry) => void;
  onFieldHeaderClick?: (field: NoteDatabaseFieldDefinition) => void;
  onFieldOrderChange?: (activeFieldId: string, overFieldId: string) => void;
  size?: "compact" | "full";
  titleField: NoteDatabaseFieldDefinition | null;
  visibleFields: NoteDatabaseFieldDefinition[];
}) {
  const isFull = size === "full";
  const canReorderFields = Boolean(onFieldOrderChange);
  const hasEntryActions = Boolean(onEditEntry || onArchiveEntry);
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(new Set());
  const suppressFieldHeaderClickRef = useRef(false);
  const fieldDragSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: NOTE_DATABASE_FIELD_LONG_PRESS_DELAY_MS,
        tolerance: NOTE_DATABASE_FIELD_LONG_PRESS_TOLERANCE_PX,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: NOTE_DATABASE_FIELD_LONG_PRESS_DELAY_MS,
        tolerance: NOTE_DATABASE_FIELD_LONG_PRESS_TOLERANCE_PX,
      },
    }),
  );
  const sortableFieldIds = useMemo(
    () => visibleFields.map((field) => buildDatabaseFieldDragId(definition.id, field.id)),
    [definition.id, visibleFields],
  );

  function releaseSuppressedFieldHeaderClick() {
    window.setTimeout(() => {
      suppressFieldHeaderClickRef.current = false;
    }, 0);
  }

  function handleFieldDragStart() {
    suppressFieldHeaderClickRef.current = true;
  }

  function handleFieldDragCancel() {
    releaseSuppressedFieldHeaderClick();
  }

  function handleFieldDragEnd(event: DragEndEvent) {
    if (!canReorderFields) {
      releaseSuppressedFieldHeaderClick();
      return;
    }

    const activeField = parseDatabaseFieldDragId(event.active.id);
    const overField = event.over ? parseDatabaseFieldDragId(event.over.id) : null;

    if (
      activeField &&
      overField &&
      activeField.databaseId === definition.id &&
      overField.databaseId === definition.id &&
      activeField.fieldId !== overField.fieldId
    ) {
      onFieldOrderChange?.(activeField.fieldId, overField.fieldId);
    }

    releaseSuppressedFieldHeaderClick();
  }

  function toggleExpandedEntry(entryId: string) {
    setExpandedEntryIds((currentEntryIds) => {
      const nextEntryIds = new Set(currentEntryIds);
      if (nextEntryIds.has(entryId)) {
        nextEntryIds.delete(entryId);
      } else {
        nextEntryIds.add(entryId);
      }

      return nextEntryIds;
    });
  }

  if (activeView.type === "table") {
    if (isFull) {
      const placeholderRowCount = Math.max(
        0,
        NOTE_DATABASE_FULL_TABLE_MIN_VISIBLE_ROWS - entries.length,
      );
      const fullTableCellClassName =
        "h-8 whitespace-nowrap border-b border-r border-white/[0.055] px-2 py-1 align-middle text-xs leading-5 last:border-r-0";

      return (
        <div className="h-full min-h-[36rem] w-full overflow-auto bg-transparent">
          <DndContext
            sensors={fieldDragSensors}
            collisionDetection={closestCenter}
            onDragStart={handleFieldDragStart}
            onDragCancel={handleFieldDragCancel}
            onDragEnd={handleFieldDragEnd}
          >
            <SortableContext items={sortableFieldIds} strategy={horizontalListSortingStrategy}>
              <table className="w-max min-w-max table-auto border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    {visibleFields.map((field) => (
                      <SortableDatabaseFieldHeader
                        key={field.id}
                        databaseId={definition.id}
                        field={field}
                        isReorderable={canReorderFields}
                        onFieldHeaderClick={onFieldHeaderClick}
                        shouldSuppressClick={() => suppressFieldHeaderClickRef.current}
                      />
                    ))}
                    {onAddField ? (
                      <th
                        scope="col"
                        className="sticky top-0 z-10 w-10 border-b border-white/[0.08] bg-[#08090a]/98 p-0 text-white/38 backdrop-blur"
                      >
                        <button
                          type="button"
                          onClick={onAddField}
                          aria-label="Add field"
                          title="Add field"
                          className="flex h-full min-h-8 w-full items-center justify-center outline-none transition hover:bg-white/[0.045] hover:text-white/68 focus-visible:bg-white/[0.06] focus-visible:text-white/78 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-emerald-200/30"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </th>
                    ) : null}
                    {hasEntryActions ? (
                      <th
                        scope="col"
                        className="sticky top-0 z-10 w-20 border-b border-white/[0.08] bg-[#08090a]/98 px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30 backdrop-blur"
                      >
                        Actions
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="group">
                      {visibleFields.map((field) => {
                        const isTitleField = field.id === titleField?.id;
                        const value = formatDatabaseEntryValue(entry.values[field.id], field.type);

                        return (
                          <td
                            key={field.id}
                            className={`${fullTableCellClassName} group-hover:bg-white/[0.025] ${
                              isTitleField
                                ? "font-semibold text-white/88"
                                : value
                                  ? "font-medium text-white/62"
                                  : "font-medium text-white/30"
                            }`}
                          >
                            <span className="block">
                              {isTitleField
                                ? getDatabaseEntryTitle(entry, definition)
                                : value || "Empty"}
                            </span>
                          </td>
                        );
                      })}
                      {onAddField ? (
                        <td
                          aria-hidden="true"
                          className={`${fullTableCellClassName} group-hover:bg-white/[0.025]`}
                        />
                      ) : null}
                      {hasEntryActions ? (
                        <td className={`${fullTableCellClassName} group-hover:bg-white/[0.025]`}>
                          <div className="flex justify-end gap-1">
                            {onEditEntry ? (
                              <button
                                type="button"
                                aria-label={`Edit ${getDatabaseEntryTitle(entry, definition)}`}
                                onClick={() => onEditEntry(entry)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/44 outline-none transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/24"
                              >
                                <PencilLine className="h-3 w-3" />
                              </button>
                            ) : null}
                            {onArchiveEntry ? (
                              <button
                                type="button"
                                aria-label={`Archive ${getDatabaseEntryTitle(entry, definition)}`}
                                onClick={() => onArchiveEntry(entry)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/44 outline-none transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/24"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {Array.from({ length: placeholderRowCount }, (_, placeholderRowIndex) => (
                    <tr
                      key={`placeholder-${placeholderRowIndex}`}
                      aria-hidden="true"
                      className="pointer-events-none"
                    >
                      {visibleFields.map((field) => (
                        <td
                          key={field.id}
                          className={`${fullTableCellClassName} text-white/0`}
                        />
                      ))}
                      {onAddField ? (
                        <td
                          aria-hidden="true"
                          className={`${fullTableCellClassName} text-white/0`}
                        />
                      ) : null}
                      {hasEntryActions ? (
                        <td
                          aria-hidden="true"
                          className={`${fullTableCellClassName} text-white/0`}
                        />
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <p className="border-y border-dashed border-white/[0.055] bg-transparent px-0 py-2 text-xs font-medium text-white/34">
          No entries yet
        </p>
      );
    }

    const titleColumnClassName = isFull
      ? "min-w-[18rem] flex-[1.35_0_18rem] font-semibold"
      : "w-40 font-semibold";
    const propertyColumnClassName = isFull
      ? "min-w-[14rem] flex-[1_0_14rem] font-medium"
      : "w-32 font-medium";

    return (
      <div className="w-full overflow-x-auto border-y border-white/[0.055] bg-transparent">
        <div className="min-w-[30rem] divide-y divide-white/[0.05]">
          <div
            className="flex items-center gap-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30"
          >
            {visibleFields.map((field) => (
              <span
                key={field.id}
                className={`shrink-0 truncate ${
                  field.id === titleField?.id ? titleColumnClassName : propertyColumnClassName
                }`}
              >
                {getDatabaseFieldName(field)}
              </span>
            ))}
          </div>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 py-1.5 text-xs transition hover:bg-white/[0.018]"
            >
              {visibleFields.map((field) => {
                const isTitleField = field.id === titleField?.id;
                const value = formatDatabaseEntryValue(entry.values[field.id], field.type);

                return (
                  <span
                    key={field.id}
                    className={`shrink-0 truncate ${
                      isTitleField ? titleColumnClassName : propertyColumnClassName
                    } ${
                      isTitleField
                        ? "text-white/82"
                        : value
                          ? "text-white/58"
                          : "text-white/24"
                    }`}
                  >
                    {isTitleField ? getDatabaseEntryTitle(entry, definition) : value || "Empty"}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (entries.length > 0 && activeView.type === "list") {
    if (isFull) {
      return (
        <div className="divide-y divide-white/[0.075] border-y border-white/[0.07]">
          {entries.map((entry) => {
            const properties = getDatabaseEntryProperties(entry, definition);
            const previewProperties = properties.filter(({ value }) => value).slice(0, 3);
            const isExpanded = expandedEntryIds.has(entry.id);

            return (
              <div key={entry.id} className="group">
                <button
                  type="button"
                  onClick={() => toggleExpandedEntry(entry.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-3 px-1 py-3 text-left outline-none transition hover:bg-white/[0.025] focus-visible:bg-white/[0.035] sm:px-2"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] text-white/42 transition ${
                      isExpanded ? "rotate-90 text-white/70" : ""
                    }`}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/88 sm:text-[15px]">
                      {getDatabaseEntryTitle(entry, definition)}
                    </span>
                    {previewProperties.length > 0 ? (
                      <span className="mt-0.5 block truncate text-xs font-medium text-white/38">
                        {previewProperties
                          .map(({ field, value }) => `${getDatabaseFieldName(field)}: ${value}`)
                          .join(" · ")}
                      </span>
                    ) : properties.length > 0 ? (
                      <span className="mt-0.5 block truncate text-xs font-medium text-white/28">
                        {properties.length} field{properties.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                  {hasEntryActions ? (
                    <span className="flex shrink-0 items-center gap-1">
                      {onEditEntry ? (
                        <button
                          type="button"
                          aria-label={`Edit ${getDatabaseEntryTitle(entry, definition)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditEntry(entry);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:ring-1 focus-visible:ring-white/24"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {onArchiveEntry ? (
                        <button
                          type="button"
                          aria-label={`Archive ${getDatabaseEntryTitle(entry, definition)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onArchiveEntry(entry);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:ring-1 focus-visible:ring-white/24"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </button>

                {isExpanded ? (
                  <div className="pb-4 pl-11 pr-1 sm:pl-12 sm:pr-2">
                    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleFields.map((field) => {
                        const isTitleField = field.id === titleField?.id;
                        const value = isTitleField
                          ? getDatabaseEntryTitle(entry, definition)
                          : formatDatabaseEntryValue(entry.values[field.id], field.type);

                        return (
                          <div
                            key={field.id}
                            className="min-w-0 border-l border-white/[0.08] bg-white/[0.025] px-3 py-2"
                          >
                            <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                              {getDatabaseFieldName(field)}
                            </dt>
                            <dd
                              className={`mt-1 truncate text-sm font-medium ${
                                value ? "text-white/78" : "text-white/28"
                              }`}
                            >
                              {value || "Empty"}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="divide-y divide-white/[0.05] border-y border-white/[0.055]">
        {entries.map((entry) => {
          const properties = getDatabaseEntryProperties(entry, definition);

          return (
            <div
              key={entry.id}
              className="py-1.5 transition hover:bg-white/[0.018]"
            >
              <p
                className="truncate text-xs font-semibold leading-4 text-white/82"
              >
                {getDatabaseEntryTitle(entry, definition)}
              </p>
              {properties.length > 0 ? (
                <p className="mt-0.5 truncate text-[11px] font-medium leading-4 text-white/38">
                  {properties
                    .map(({ field, value }) => {
                      return `${getDatabaseFieldName(field)}: ${value || "Empty"}`;
                    })
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (entries.length > 0 && activeView.type === "card") {
    if (isFull) {
      return (
        <div className="-mx-1 grid grid-cols-3 gap-1.5 px-1 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {entries.map((entry) => {
            const properties = getDatabaseEntryProperties(entry, definition);
            const filledProperties = properties.filter(({ value }) => value);
            const visibleProperties = filledProperties.slice(0, 2);
            const hiddenPropertyCount = Math.max(0, filledProperties.length - visibleProperties.length);

            return (
              <article
                key={entry.id}
                className="goal-card group relative flex aspect-[5/6] min-h-[86px] transform-gpu flex-col overflow-hidden rounded-xl border border-black/70 bg-[radial-gradient(circle_at_0%_0%,rgba(82,82,91,0.20),transparent_58%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(20,20,23,0.96)_48%,rgba(50,50,57,0.72)_100%)] p-2 text-white shadow-[0_18px_34px_-28px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.065),inset_0_-14px_22px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300/35 hover:brightness-110 active:translate-y-px active:scale-[0.99] sm:min-h-[104px] sm:rounded-2xl sm:p-2.5"
              >
                <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.055),transparent_60%)]" />
                <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/28 to-transparent" />
                <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-between gap-1.5 text-center">
                  <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
                    <p
                      className="line-clamp-3 w-full min-w-0 break-words px-0.5 text-center text-[9px] font-semibold leading-tight text-white whitespace-normal sm:text-[11px]"
                      style={{ hyphens: "auto" }}
                    >
                      {getDatabaseEntryTitle(entry, definition)}
                    </p>
                  </div>

                  <div className="flex w-full min-w-0 flex-col items-end justify-end gap-1">
                    {visibleProperties.length > 0 ? (
                      visibleProperties.map(({ field, value }) => (
                        <span
                          key={field.id}
                          className="flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.055] px-1.5 py-[2px] text-[7px] font-semibold leading-none text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:px-2 sm:py-[3px] sm:text-[8px]"
                        >
                          <span className="max-w-[2.5rem] truncate text-white/38 sm:max-w-[3.5rem]">
                            {getDatabaseFieldName(field)}
                          </span>
                          <span className="max-w-[3rem] truncate text-white/78 sm:max-w-[4.75rem]">
                            {value}
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="text-[8px] font-medium leading-none text-white/30 sm:text-[9px]">
                        No details
                      </span>
                    )}
                    {hiddenPropertyCount > 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-1.5 py-[2px] text-[7px] font-semibold leading-none text-white/42 sm:py-[3px] sm:text-[8px]">
                        +{hiddenPropertyCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-1.5 border-y border-white/[0.055] py-1.5 sm:grid-cols-2">
        {entries.map((entry) => {
          const properties = getDatabaseEntryProperties(entry, definition);

          return (
            <div
              key={entry.id}
              className="min-w-0 border-l border-white/[0.055] bg-white/[0.012] px-2 py-1.5 transition hover:bg-white/[0.025]"
            >
              <p className="truncate text-xs font-semibold leading-4 text-white/84">
                {getDatabaseEntryTitle(entry, definition)}
              </p>
              <div className="mt-1 space-y-0.5">
                {properties.map(({ field, value }) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between gap-2 text-[11px] font-medium leading-4"
                  >
                    <span className="truncate text-white/34">{getDatabaseFieldName(field)}</span>
                    <span
                      className={`max-w-[55%] truncate ${
                        value ? "text-white/70" : "text-white/26"
                      }`}
                    >
                      {value || "Empty"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <p
      className={`border-dashed border-white/[0.08] bg-black/12 font-medium text-white/34 ${
        isFull
          ? "rounded-md border px-3 py-8 text-center text-sm"
          : "border-y bg-transparent px-0 py-2 text-xs"
      }`}
    >
      No entries yet
    </p>
  );
}

function NoteDatabaseFieldEditSheet({
  canRemoveField,
  field,
  mode = "edit",
  onClose,
  onConfirmCreate,
  onFieldNameChange,
  onFieldTypeChange,
  onRemoveField,
}: {
  canRemoveField: boolean;
  field: NoteDatabaseFieldDefinition;
  mode?: "edit" | "create";
  onClose: () => void;
  onConfirmCreate?: () => void;
  onFieldNameChange: (name: string) => void;
  onFieldTypeChange: (type: NoteDatabaseFieldType) => void;
  onRemoveField: () => void;
}) {
  const isCreating = mode === "create";
  const removeFieldTitle = canRemoveField
    ? "Remove field"
    : "Title field cannot be removed";
  const sheetTitle = isCreating ? "Add field" : "Edit field";

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior;

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        void hapticSnap();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden overscroll-contain bg-black/58 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-database-field-edit-title"
      onWheel={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
      onTouchMove={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void hapticSnap();
          onClose();
        }
      }}
    >
      <div className="animate-in slide-in-from-bottom-6 fade-in-0 flex max-h-[88vh] min-h-[66vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.04] border-b-0 bg-[#090909] shadow-[0_-24px_80px_-32px_rgba(0,0,0,1)] duration-200 sm:mb-4 sm:min-h-0 sm:rounded-[30px] sm:border-b">
        <div className="relative border-b border-white/[0.04] px-4 pb-4 pt-3">
          <div
            className="mx-auto h-1 w-11 rounded-full bg-white/22"
            aria-hidden="true"
          />
          <h2
            id="note-database-field-edit-title"
            className="mt-4 text-center text-base font-semibold leading-6 text-white"
          >
            {sheetTitle}
          </h2>
          <button
            type="button"
            onClick={() => {
              void hapticSnap();
              onClose();
            }}
            aria-label={`Close ${sheetTitle.toLowerCase()} sheet`}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white/82 focus-visible:bg-white/[0.08] focus-visible:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
          <div className="flex items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Field name</span>
              <input
                value={field.name}
                onChange={(event) => onFieldNameChange(event.target.value)}
                placeholder="Field name"
                aria-label="Field name"
                className="h-12 w-full rounded-2xl border border-white/[0.04] bg-white/[0.065] px-4 text-base font-semibold text-white outline-none transition placeholder:text-white/28 selection:bg-emerald-300/25 hover:border-white/[0.06] focus-visible:border-white/[0.1]"
              />
            </label>
            {isCreating ? null : (
              <button
                type="button"
                aria-label={removeFieldTitle}
                title={removeFieldTitle}
                onClick={onRemoveField}
                disabled={!canRemoveField}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/32 outline-none transition hover:bg-white/[0.055] hover:text-red-200/70 focus-visible:bg-white/[0.07] focus-visible:text-red-100 disabled:cursor-not-allowed disabled:text-white/14 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="mt-6">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
              Type
            </p>
            <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.035]">
              {NOTE_DATABASE_FIELD_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = field.type === option.type;
                const isLockedTitleType = Boolean(field.isTitle && option.type !== "text");

                return (
                  <button
                    key={option.type}
                    type="button"
                    disabled={isLockedTitleType}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (!isSelected) {
                        void hapticSoftTick();
                        onFieldTypeChange(option.type);
                      }
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 border-b border-white/[0.04] px-4 text-left outline-none transition last:border-b-0 ${
                      isLockedTitleType
                        ? "cursor-not-allowed text-white/24"
                        : "text-white/74 hover:bg-white/[0.035] hover:text-white/88 focus-visible:bg-white/[0.035] focus-visible:text-white/90"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.04] bg-black/22 text-current">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {NOTE_DATABASE_FIELD_TYPE_LABELS[option.type]}
                    </span>
                    {isSelected ? (
                      <Check
                        className="ml-auto h-4 w-4 shrink-0 text-white/38"
                        aria-hidden="true"
                      />
                    ) : isLockedTitleType ? (
                      <span className="shrink-0 text-[11px] font-semibold text-white/28">
                        Title stays Text
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02]">
              {NOTE_DATABASE_COMING_SOON_FIELD_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;

                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled
                    className="flex min-h-12 w-full cursor-not-allowed items-center gap-3 border-b border-white/[0.04] px-4 text-left text-white/24 last:border-b-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.04] bg-black/18">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {option.label}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-white/26">
                      Coming soon
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {isCreating ? (
          <div className="flex gap-2 border-t border-white/[0.04] p-3">
            <button
              type="button"
              onClick={() => {
                void hapticSnap();
                onClose();
              }}
              className="flex h-11 flex-1 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.035] text-sm font-semibold text-white/62 outline-none transition hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/18"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void hapticComplete();
                onConfirmCreate?.();
              }}
              className="flex h-11 flex-1 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.1] text-sm font-semibold text-white/88 outline-none transition hover:border-white/[0.12] hover:bg-white/[0.14] hover:text-white focus-visible:ring-1 focus-visible:ring-white/24"
            >
              Add field
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function serializeSegment(segment: NoteSegment) {
  if (segment.type === "text") return segment.text;
  if (segment.type === "divider") return NOTE_DIVIDER_MARKER;
  if (segment.type === "checklist") return `- [${segment.checked ? "x" : " "}] ${segment.text}`;
  if (segment.type === "list") return `${segment.kind === "bullet" ? "•" : "-"} ${segment.text}`;
  return segment.marker;
}

function parseStandaloneNoteChecklistMarker(line: string): NoteChecklistSegment | null {
  const match = line.match(NOTE_CHECKLIST_MARKER_REGEX);
  if (!match) return null;

  return {
    type: "checklist",
    checked: match[1]?.toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseStandaloneNoteListMarker(line: string): NoteListSegment | null {
  const bulletMatch = line.match(NOTE_BULLET_LIST_MARKER_REGEX);
  if (bulletMatch) {
    return {
      type: "list",
      kind: "bullet",
      text: bulletMatch[1] ?? "",
    };
  }

  const dashMatch = line.match(NOTE_DASH_LIST_MARKER_REGEX);
  if (!dashMatch) return null;

  return {
    type: "list",
    kind: "dash",
    text: dashMatch[1] ?? "",
  };
}

function parseNoteSegments(content: string): NoteSegment[] {
  const nextSegments: NoteSegment[] = [];
  const textLines: string[] = [];

  function flushText() {
    if (textLines.length === 0) return;
    nextSegments.push({ type: "text", text: textLines.join("\n") });
    textLines.length = 0;
  }

  content.split("\n").forEach((line) => {
    if (isStandaloneNoteDividerLine(line)) {
      flushText();
      nextSegments.push({ type: "divider" });
      return;
    }

    const subpageMarker = parseStandaloneNoteSubpageMarker(line);
    if (subpageMarker) {
      flushText();
      nextSegments.push({
        type: "subpage",
        marker: buildSubpageMarker(subpageMarker),
        ...subpageMarker,
      });
      return;
    }

    const databaseMarker = parseStandaloneNoteDatabaseMarker(line);
    if (databaseMarker) {
      flushText();
      if (
        isLegacyHydrationDatabase(
          databaseMarker.databaseId,
          null,
          databaseMarker.title,
        )
      ) {
        return;
      }
      nextSegments.push({
        type: "database",
        marker: buildDatabaseMarker({
          id: databaseMarker.databaseId,
          title: databaseMarker.title,
        }),
        ...databaseMarker,
      });
      return;
    }

    const checklistMarker = parseStandaloneNoteChecklistMarker(line);
    if (checklistMarker) {
      flushText();
      nextSegments.push(checklistMarker);
      return;
    }

    const listMarker = parseStandaloneNoteListMarker(line);
    if (listMarker) {
      flushText();
      nextSegments.push(listMarker);
      return;
    }

    textLines.push(line);
  });

  flushText();

  if (nextSegments.length === 0 || nextSegments[nextSegments.length - 1]?.type !== "text") {
    nextSegments.push({ type: "text", text: "" });
  }

  return nextSegments;
}

function serializeNoteSegments(nextSegments: NoteSegment[]) {
  return nextSegments.map(serializeSegment).join("\n");
}

function getSegmentStartOffsets(nextSegments: NoteSegment[]) {
  let offset = 0;
  return nextSegments.map((segment, index) => {
    const segmentOffset = offset;
    offset += serializeSegment(segment).length;
    if (index < nextSegments.length - 1) {
      offset += 1;
    }
    return segmentOffset;
  });
}

function findTextSelectionForCaret(nextSegments: NoteSegment[], caretOffset: number) {
  const offsets = getSegmentStartOffsets(nextSegments);
  let previousTextIndex: number | null = null;

  for (let index = 0; index < nextSegments.length; index += 1) {
    const segment = nextSegments[index];
    const start = offsets[index] ?? 0;
    const end = start + serializeSegment(segment).length;

    if (segment.type !== "text") {
      continue;
    }

    if (caretOffset >= start && caretOffset <= end) {
      return { type: "text" as const, segmentIndex: index, caretPosition: caretOffset - start };
    }

    if (start > caretOffset) {
      return { type: "text" as const, segmentIndex: index, caretPosition: 0 };
    }

    previousTextIndex = index;
  }

  if (previousTextIndex !== null) {
    const previousText = nextSegments[previousTextIndex];
    return {
      type: "text" as const,
      segmentIndex: previousTextIndex,
      caretPosition: previousText.type === "text" ? previousText.text.length : 0,
    };
  }

  return null;
}

function findChecklistSelectionForCaret(nextSegments: NoteSegment[], caretOffset: number) {
  const offsets = getSegmentStartOffsets(nextSegments);

  for (let index = 0; index < nextSegments.length; index += 1) {
    const segment = nextSegments[index];
    if (segment.type !== "checklist") continue;

    const start = offsets[index] ?? 0;
    const markerLength = segment.checked ? "- [x] ".length : "- [ ] ".length;
    const end = start + serializeSegment(segment).length;

    if (caretOffset >= start && caretOffset <= end) {
      return {
        type: "checklist" as const,
        segmentIndex: index,
        caretPosition: Math.max(0, caretOffset - start - markerLength),
      };
    }
  }

  return null;
}

function findListSelectionForCaret(nextSegments: NoteSegment[], caretOffset: number) {
  const offsets = getSegmentStartOffsets(nextSegments);

  for (let index = 0; index < nextSegments.length; index += 1) {
    const segment = nextSegments[index];
    if (segment.type !== "list") continue;

    const start = offsets[index] ?? 0;
    const markerLength = `${segment.kind === "bullet" ? "•" : "-"} `.length;
    const end = start + serializeSegment(segment).length;

    if (caretOffset >= start && caretOffset <= end) {
      return {
        type: "list" as const,
        segmentIndex: index,
        caretPosition: Math.max(0, caretOffset - start - markerLength),
      };
    }
  }

  return null;
}

export function NoteDatabaseEntrySheet({
  databaseDefinition,
  initialEntry,
  onClose,
  onSaveEntry,
  overlayClassName,
  submitLabel = "Save entry",
}: {
  databaseDefinition: NoteDatabaseDefinition;
  entries?: NoteDatabaseEntry[];
  initialEntry?: NoteDatabaseEntry | null;
  onClose: () => void;
  onSaveEntry: (entry: NoteDatabaseEntry) => void | Promise<void>;
  overlayClassName?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [openedAt] = useState(() => new Date().toISOString());
  const [entryFormValues, setEntryFormValues] = useState<Record<string, unknown>>(() =>
    getDatabaseEntryInitialFormValues(databaseDefinition, openedAt, initialEntry),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedNutritionFoodAction, setSelectedNutritionFoodAction] =
    useState<NutritionFoodActionTabId>("search");
  const [openChefCuisineId, setOpenChefCuisineId] = useState<string | null>(null);
  const [openChefDishFamilyKey, setOpenChefDishFamilyKey] = useState<string | null>(null);
  const [selectedChefStyleId, setSelectedChefStyleId] = useState<string | null>(null);
  const [selectedChefOptions, setSelectedChefOptions] = useState<Record<string, string>>({});
  const [selectedChefFilter, setSelectedChefFilter] = useState<ChefFilterId>("all");
  const [chefAvailableRevealLevel, setChefAvailableRevealLevel] = useState<0 | 1 | 2>(0);
  const [expandedChefRecipeId, setExpandedChefRecipeId] = useState<string | null>(null);
  const [selectedFitnessAction, setSelectedFitnessAction] =
    useState<FitnessActionTabId>("start");
  const [selectedFitnessWorkoutExercises, setSelectedFitnessWorkoutExercises] = useState<
    FitnessExerciseSample[]
  >([]);
  const [selectedFitnessRoutineName, setSelectedFitnessRoutineName] = useState<string | null>(
    null,
  );
  const [selectedFitnessPlanName, setSelectedFitnessPlanName] = useState<string | null>(
    null,
  );
  const [selectedFitnessPlanSetup, setSelectedFitnessPlanSetup] = useState<
    Partial<FitnessPlanSetup>
  >({});
  const [fitnessWorkoutExerciseDetailsById, setFitnessWorkoutExerciseDetailsById] = useState<
    Record<string, FitnessWorkoutExerciseDetail>
  >({});
  const [isFitnessWorkoutReviewOpen, setIsFitnessWorkoutReviewOpen] = useState(false);
  const [fitnessWorkoutLogDetailsById, setFitnessWorkoutLogDetailsById] = useState<
    Record<string, FitnessWorkoutLogExerciseDetail>
  >({});
  const [favoriteFitnessExerciseIds, setFavoriteFitnessExerciseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFitnessRoutineGroups, setExpandedFitnessRoutineGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedFitnessMovementGroups, setExpandedFitnessMovementGroups] = useState<
    Set<string>
  >(() => new Set());
  const [expandedFitnessSubcategories, setExpandedFitnessSubcategories] = useState<
    Set<string>
  >(() => new Set());
  const [openNutritionBrowseDepartment, setOpenNutritionBrowseDepartment] =
    useState<FoodBrowseDepartmentLabel | null>(null);
  const [openNutritionBrowseAisle, setOpenNutritionBrowseAisle] =
    useState<FoodBrowseAisleLabel | null>(null);
  const [collapsedStagedFoodGroups, setCollapsedStagedFoodGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedGroceryResourceGroups, setCollapsedGroceryResourceGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedNutritionGroceryGroups, setCollapsedNutritionGroceryGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedNutritionFoods, setSelectedNutritionFoods] = useState<
    NutritionSelectedFoodItem[]
  >([]);
  const [selectedNutritionFood, setSelectedNutritionFood] =
    useState<NutritionSelectedFoodItem | null>(null);
  const [selectedNutritionMeal, setSelectedNutritionMeal] =
    useState<NutritionSavedMeal | null>(null);
  const [selectedNutritionMealSource, setSelectedNutritionMealSource] = useState<
    "meal_template" | "logged_meal" | null
  >(null);
  const [selectedNutritionRecipe, setSelectedNutritionRecipe] =
    useState<NutritionSelectedRecipeItem | null>(null);
  const [nutritionFavoriteKeys, setNutritionFavoriteKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingNutritionFavoriteKeys, setPendingNutritionFavoriteKeys] = useState<
    Set<string>
  >(() => new Set());
  const [nutritionDailySavedTotals, setNutritionDailySavedTotals] =
    useState<Record<NutritionDailyMetricKey, number>>({ ...EMPTY_NUTRITION_TOTALS });
  const [nutritionDailyTotalsError, setNutritionDailyTotalsError] = useState<string | null>(
    null,
  );
  const [nutritionProgressAnimationKey, setNutritionProgressAnimationKey] = useState(0);
  const [isNutritionProgressAnimatedIn, setIsNutritionProgressAnimatedIn] = useState(false);
  const [nutritionFoodSearchQuery, setNutritionFoodSearchQuery] = useState("");
  const [nutritionFoodSearchResults, setNutritionFoodSearchResults] = useState<
    FoodSearchResult[]
  >([]);
  const [isNutritionFoodSearchLoading, setIsNutritionFoodSearchLoading] = useState(false);
  const [nutritionFoodSearchError, setNutritionFoodSearchError] = useState<string | null>(
    null,
  );
  const [nutritionFoodBrowseResults, setNutritionFoodBrowseResults] = useState<
    FoodSearchResult[]
  >([]);
  const [isNutritionFoodBrowseLoading, setIsNutritionFoodBrowseLoading] = useState(false);
  const [nutritionFoodBrowseError, setNutritionFoodBrowseError] = useState<string | null>(
    null,
  );
  const [nutritionGroceryFoods, setNutritionGroceryFoods] = useState<FoodSearchResult[]>(
    [],
  );
  const [isNutritionGroceryLoading, setIsNutritionGroceryLoading] = useState(false);
  const [nutritionGroceryError, setNutritionGroceryError] = useState<string | null>(
    null,
  );
  const [groceryResourceItems, setGroceryResourceItems] = useState<FoodResource[]>([]);
  const [isGroceryResourcesLoading, setIsGroceryResourcesLoading] = useState(false);
  const [groceryResourcesError, setGroceryResourcesError] = useState<string | null>(
    null,
  );
  const chefAvailabilityCatalog = useMemo(() => {
    const recipeTiers = new Map<string, ChefResolvedAvailabilityTier>();
    const recipeIdsByFamilyAndTier = new Map<string, Set<string>>();
    const availableOptionIdsByGroup = new Map<string, Set<string>>();
    const tierCounts: Record<Exclude<ChefAvailabilityTier, "unavailable">, number> = { ready: 0, needs_one: 0, needs_two: 0 };

    getChefCuisinesWithCounts().forEach((cuisine) => {
      getChefDishFamiliesForCuisine(cuisine.id).forEach((dishFamily) => {
        const familyKey = `${cuisine.id}:${dishFamily.id}`;
        const optionGroups = getChefOptionGroupsForDishFamily(cuisine.id, dishFamily.id);
        const recipes = getChefRecipesForNode({ cuisineId: cuisine.id, dishFamilyId: dishFamily.id });
        const selectedOptions = Object.fromEntries(optionGroups.map((group) => [group.id, selectedChefOptions[group.id] ?? group.defaultOptionId]));
        recipes.forEach((recipe) => {
          const classification = classifyResolvedChefRecipeAvailability(recipe, { ...getDefaultChefRecipeOptions(recipe), ...selectedOptions }, groceryResourceItems);
          recipeTiers.set(recipe.id, classification);
          if (classification.tier === "unavailable") return;
          const tierKey = `${familyKey}:${classification.tier}`;
          if (!recipeIdsByFamilyAndTier.has(tierKey)) recipeIdsByFamilyAndTier.set(tierKey, new Set());
          recipeIdsByFamilyAndTier.get(tierKey)?.add(recipe.id);
          tierCounts[classification.tier] += 1;
        });

        optionGroups.forEach((group) => {
          const availableOptionIds = new Set(group.options.filter((option) => recipes.some((recipe) => classifyResolvedChefRecipeAvailability(recipe, { ...getDefaultChefRecipeOptions(recipe), ...selectedOptions, [group.id]: option.id }, groceryResourceItems).tier !== "unavailable")).map((option) => option.id));
          availableOptionIdsByGroup.set(group.id, availableOptionIds);
        });
      });
    });

    return { recipeTiers, recipeIdsByFamilyAndTier, availableOptionIdsByGroup, tierCounts };
  }, [groceryResourceItems, selectedChefOptions]);
  const [openGroceryResourceMenuId, setOpenGroceryResourceMenuId] = useState<string | null>(
    null,
  );
  const [editingGroceryResourceId, setEditingGroceryResourceId] = useState<string | null>(
    null,
  );
  const [groceryResourceEditDraft, setGroceryResourceEditDraft] = useState<{
    quantity: string;
    unit: GroceryInventoryUnit;
  }>({ quantity: "", unit: "package" });
  const [savingGroceryResourceActionId, setSavingGroceryResourceActionId] = useState<
    string | null
  >(null);
  const [groceryResourceActionError, setGroceryResourceActionError] = useState<
    string | null
  >(null);
  const [grocerySearchDrafts, setGrocerySearchDrafts] = useState<
    Record<string, GrocerySearchDraft>
  >({});
  const grocerySearchSavingIdsRef = useRef(new Set<string>());
  const isDatabaseEntrySubmittingRef = useRef(false);
  const [nutritionSavedMeals, setNutritionSavedMeals] = useState<NutritionSavedMeal[]>([]);
  const [isNutritionSavedMealsLoading, setIsNutritionSavedMealsLoading] = useState(false);
  const [nutritionSavedMealsError, setNutritionSavedMealsError] = useState<string | null>(
    null,
  );
  const [nutritionMealTemplates, setNutritionMealTemplates] = useState<NutritionSavedMeal[]>([]);
  const [isNutritionMealTemplatesLoading, setIsNutritionMealTemplatesLoading] =
    useState(false);
  const [nutritionMealTemplatesError, setNutritionMealTemplatesError] = useState<
    string | null
  >(null);
  const [nutritionRecipes, setNutritionRecipes] = useState<NutritionSavedRecipe[]>([]);
  const [isNutritionRecipesLoading, setIsNutritionRecipesLoading] = useState(false);
  const [nutritionRecipesError, setNutritionRecipesError] = useState<string | null>(
    null,
  );
  const [isNutritionMealBuilderOpen, setIsNutritionMealBuilderOpen] = useState(false);
  const [nutritionMealBuilderName, setNutritionMealBuilderName] = useState("");
  const [nutritionMealBuilderIcon, setNutritionMealBuilderIcon] = useState(
    DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON,
  );
  const [isNutritionMealBuilderIconPickerOpen, setIsNutritionMealBuilderIconPickerOpen] =
    useState(false);
  const [nutritionMealBuilderItems, setNutritionMealBuilderItems] = useState<
    NutritionMealBuilderItem[]
  >([]);
  const [nutritionMealBuilderSearchQuery, setNutritionMealBuilderSearchQuery] =
    useState("");
  const [nutritionMealBuilderFoodResults, setNutritionMealBuilderFoodResults] = useState<
    FoodSearchResult[]
  >([]);
  const [nutritionMealBuilderRecipeResults, setNutritionMealBuilderRecipeResults] =
    useState<NutritionRecipeSearchResult[]>([]);
  const [isNutritionMealBuilderSearchLoading, setIsNutritionMealBuilderSearchLoading] =
    useState(false);
  const [nutritionMealBuilderSearchError, setNutritionMealBuilderSearchError] = useState<
    string | null
  >(null);
  const [isNutritionMealBuilderSaving, setIsNutritionMealBuilderSaving] = useState(false);
  const [nutritionMealBuilderSaveError, setNutritionMealBuilderSaveError] = useState<
    string | null
  >(null);
  const [isNutritionRecipeBuilderOpen, setIsNutritionRecipeBuilderOpen] =
    useState(false);
  const [nutritionRecipeBuilderName, setNutritionRecipeBuilderName] = useState("");
  const [nutritionRecipeBuilderIcon, setNutritionRecipeBuilderIcon] = useState(
    DEFAULT_NUTRITION_RECIPE_ICON,
  );
  const [
    isNutritionRecipeBuilderIconPickerOpen,
    setIsNutritionRecipeBuilderIconPickerOpen,
  ] = useState(false);
  const [nutritionRecipeBuilderItems, setNutritionRecipeBuilderItems] = useState<
    NutritionMealBuilderItem[]
  >([]);
  const [nutritionRecipeBuilderSearchQuery, setNutritionRecipeBuilderSearchQuery] =
    useState("");
  const [nutritionRecipeBuilderFoodResults, setNutritionRecipeBuilderFoodResults] =
    useState<FoodSearchResult[]>([]);
  const [isNutritionRecipeBuilderSearchLoading, setIsNutritionRecipeBuilderSearchLoading] =
    useState(false);
  const [nutritionRecipeBuilderSearchError, setNutritionRecipeBuilderSearchError] =
    useState<string | null>(null);
  const [isNutritionRecipeBuilderSaving, setIsNutritionRecipeBuilderSaving] =
    useState(false);
  const [nutritionRecipeBuilderSaveError, setNutritionRecipeBuilderSaveError] =
    useState<string | null>(null);
  const [nutritionBarcodeValue, setNutritionBarcodeValue] = useState("");
  const [isNutritionBarcodeScannerLoading, setIsNutritionBarcodeScannerLoading] =
    useState(false);
  const [isNutritionBarcodeLookupLoading, setIsNutritionBarcodeLookupLoading] =
    useState(false);
  const nutritionBarcodeScannerLoadingRef = useRef(false);
  const nutritionBarcodeLookupLoadingRef = useRef(false);
  const [nutritionBarcodeLookupStatus, setNutritionBarcodeLookupStatus] = useState<
    string | null
  >(null);
  const [nutritionBarcodeLookupError, setNutritionBarcodeLookupError] = useState<
    string | null
  >(null);
  const [expandedGroceryInventoryField, setExpandedGroceryInventoryField] = useState<
    "expires" | "location" | null
  >(null);
  const [openNutritionServingUnitMenu, setOpenNutritionServingUnitMenu] = useState<{
    id: string;
    top: number;
    right: number;
  } | null>(null);
  const nutritionFoodActionTabRefs = useRef<
    Partial<Record<NutritionFoodActionTabId, HTMLButtonElement | null>>
  >({});
  const fitnessActionTabRefs = useRef<
    Partial<Record<FitnessActionTabId, HTMLButtonElement | null>>
  >({});
  const nutritionMealBuilderIconPickerRef = useRef<HTMLDivElement | null>(null);
  const nutritionRecipeBuilderIconPickerRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceNutritionMotion = useReducedMotion();
  const nutritionBrowseAccordionTransition = shouldReduceNutritionMotion
    ? { duration: 0 }
    : NUTRITION_BROWSE_ACCORDION_TRANSITION;
  const databaseFields = getDatabaseFieldsWithTitleFirst(databaseDefinition);
  const editableDatabaseFields = databaseFields.filter((field) => !isDatabaseCreatedAtField(field));
  const createdAtFields = databaseFields.filter(isDatabaseCreatedAtField);
  const createdAtValue =
    createdAtFields.length > 0 ? entryFormValues[createdAtFields[0].id] : null;
  const createdAtMetadataTime =
    createdAtFields.length > 0
      ? formatDatabaseCreatedAtMetadata(
          typeof createdAtValue === "string" ? createdAtValue : openedAt,
        )
      : "";
  const databaseFormTitle = getDatabaseFormTitle(databaseDefinition.title);
  const isDefaultNutritionDatabase = isDefaultNutritionDatabaseDefinition(databaseDefinition);
  const isDefaultFitnessDatabase = isDefaultFitnessDatabaseDefinition(databaseDefinition);
  const isGroceryDatabase = isOnHandDatabaseDefinition(databaseDefinition);
  const isFoodSearchDatabase = isDefaultNutritionDatabase || isGroceryDatabase;
  const shouldShowFitnessEntryFields =
    !isDefaultFitnessDatabase || selectedFitnessAction === "custom";
  const shouldShowEntryFooter =
    !isDefaultFitnessDatabase || selectedFitnessAction === "custom";
  const isNutritionSearchMode =
    isFoodSearchDatabase && selectedNutritionFoodAction === "search";
  const shouldHideNutritionEntryFields =
    isDefaultNutritionDatabase && selectedNutritionFoodAction !== "custom";
  const hiddenGroceryFoodSearchFieldIds = new Set<string>(
    isGroceryDatabase
      ? [
          ON_HAND_QUANTITY_FIELD_ID,
          ON_HAND_UNIT_FIELD_ID,
          ON_HAND_LOCATION_FIELD_ID,
          ON_HAND_EXPIRES_ON_FIELD_ID,
          ON_HAND_NOTES_FIELD_ID,
        ]
      : [],
  );
  const visibleFoodActionTabs = isGroceryDatabase
    ? [
        ...NUTRITION_FOOD_ACTION_TABS.filter((tab) =>
          GROCERY_FOOD_ACTION_TAB_IDS.has(tab.id),
        ),
        ...GROCERY_EXTRA_FOOD_ACTION_TABS,
      ]
    : NUTRITION_FOOD_ACTION_TABS;
  const nutritionMacroFields = isDefaultNutritionDatabase
    ? NUTRITION_MACRO_FIELD_KEYS.map((macroKey) =>
        editableDatabaseFields.find((field) => getNutritionMacroFieldKey(field) === macroKey),
      ).filter((field): field is NoteDatabaseFieldDefinition => Boolean(field))
    : [];
  const shouldRenderNutritionMacroGrid =
    isDefaultNutritionDatabase && nutritionMacroFields.length === NUTRITION_MACRO_FIELD_KEYS.length;
  const nutritionMacroFieldIds = new Set(nutritionMacroFields.map((field) => field.id));
  const firstNutritionMacroFieldIndex = shouldRenderNutritionMacroGrid
    ? Math.min(...nutritionMacroFields.map((macroField) => editableDatabaseFields.indexOf(macroField)))
    : -1;
  const nutritionCaloriesField = isDefaultNutritionDatabase
    ? editableDatabaseFields.find(
        (field) => getNutritionDailyMetricFieldKey(field) === "calories",
      ) ?? null
    : null;
  const shouldRenderNutritionDailyProgress =
    isDefaultNutritionDatabase &&
    Boolean(nutritionCaloriesField) &&
    nutritionMacroFields.length === NUTRITION_MACRO_FIELD_KEYS.length;
  const nutritionFoodField = isDefaultNutritionDatabase
    ? editableDatabaseFields.find(isDefaultNutritionFoodField) ?? null
    : null;
  const groceryFoodField = isGroceryDatabase
    ? editableDatabaseFields.find((field) => field.id === ON_HAND_NAME_FIELD_ID) ?? null
    : null;
  const groceryExpirationField = isGroceryDatabase
    ? editableDatabaseFields.find((field) => field.id === ON_HAND_EXPIRES_ON_FIELD_ID) ?? null
    : null;
  const groceryLocationField = isGroceryDatabase
    ? editableDatabaseFields.find((field) => field.id === ON_HAND_LOCATION_FIELD_ID) ?? null
    : null;
  const normalizedNutritionFoodSearchValue = normalizeFoodSearchText(
    nutritionFoodSearchQuery,
  );
  const normalizedNutritionMealBuilderSearchValue = normalizeFoodSearchText(
    nutritionMealBuilderSearchQuery,
  );
  const normalizedNutritionRecipeBuilderSearchValue = normalizeFoodSearchText(
    nutritionRecipeBuilderSearchQuery,
  );
  const nutritionMealBuilderTotals = useMemo(
    () => getNutritionMealBuilderTotals(nutritionMealBuilderItems),
    [nutritionMealBuilderItems],
  );
  const nutritionRecipeBuilderTotals = useMemo(
    () => getNutritionMealBuilderTotals(nutritionRecipeBuilderItems),
    [nutritionRecipeBuilderItems],
  );
  const nutritionLocalDayWindow = useMemo(
    () => getNutritionLocalDayWindow(new Date(openedAt)),
    [openedAt],
  );
  const selectedNutritionFoodIds = useMemo(
    () => new Set(selectedNutritionFoods.map((item) => getNutritionFoodSelectionKey(item.food))),
    [selectedNutritionFoods],
  );
  const selectedNutritionFavoriteTargets = useMemo<NutritionFavoriteTarget[]>(() => {
    const targets: NutritionFavoriteTarget[] = [];
    const selectedFoodItems = selectedNutritionFoods;

    selectedFoodItems.forEach((item) => {
      if (item.food.source?.startsWith("grocery")) return;

      targets.push({
        itemType: "food",
        itemId: item.food.id,
        label: item.food.name,
      });
    });

    if (selectedNutritionRecipe) {
      targets.push({
        itemType: "recipe",
        itemId: selectedNutritionRecipe.recipe.id,
        label: selectedNutritionRecipe.recipe.name,
      });
    }

    if (selectedNutritionMeal && selectedNutritionMealSource === "meal_template") {
      targets.push({
        itemType: "meal_template",
        itemId: selectedNutritionMeal.id,
        label: getNutritionSavedMealDisplayName(selectedNutritionMeal),
      });
    }

    return targets;
  }, [
    selectedNutritionFoodAction,
    selectedNutritionFoods,
    selectedNutritionMeal,
    selectedNutritionMealSource,
    selectedNutritionRecipe,
  ]);
  const selectedNutritionFavoriteTargetKey = useMemo(
    () =>
      selectedNutritionFavoriteTargets
        .map(getNutritionFavoriteKey)
        .sort()
        .join("|"),
    [selectedNutritionFavoriteTargets],
  );
  useEffect(() => {
    if (
      !isNutritionMealBuilderIconPickerOpen &&
      !isNutritionRecipeBuilderIconPickerOpen &&
      !openNutritionServingUnitMenu
    ) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (
        isNutritionMealBuilderIconPickerOpen &&
        !nutritionMealBuilderIconPickerRef.current?.contains(event.target as Node)
      ) {
        setIsNutritionMealBuilderIconPickerOpen(false);
      }
      if (
        isNutritionRecipeBuilderIconPickerOpen &&
        !nutritionRecipeBuilderIconPickerRef.current?.contains(event.target as Node)
      ) {
        setIsNutritionRecipeBuilderIconPickerOpen(false);
      }
      if (openNutritionServingUnitMenu && !target.closest("[data-nutrition-serving-picker]")) {
        setOpenNutritionServingUnitMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [
    isNutritionMealBuilderIconPickerOpen,
    isNutritionRecipeBuilderIconPickerOpen,
    openNutritionServingUnitMenu,
  ]);
  const nutritionDailyProgress = shouldRenderNutritionDailyProgress
    ? nutritionDailySavedTotals
    : EMPTY_NUTRITION_TOTALS;
  const nutritionDailyPreviewTotals = shouldRenderNutritionDailyProgress
    ? selectedNutritionFoods.length > 0
      ? aggregateSelectedNutritionFoodSnapshots(selectedNutritionFoods)
      : aggregateNutritionDraftTotals({
          values: entryFormValues,
          caloriesField: nutritionCaloriesField,
          macroFields: nutritionMacroFields,
        })
    : EMPTY_NUTRITION_TOTALS;
  const refreshNutritionDailyTotals = useCallback(async () => {
    if (!shouldRenderNutritionDailyProgress) {
      setNutritionDailySavedTotals({ ...EMPTY_NUTRITION_TOTALS });
      setNutritionDailyTotalsError(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        start: nutritionLocalDayWindow.start.toISOString(),
        end: nutritionLocalDayWindow.end.toISOString(),
        limit: "100",
      });
      const response = await fetch(`/api/nutrition/meals?${params.toString()}`);
      const payload = (await response.json()) as NutritionMealsListResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load nutrition meals.");
      }

      setNutritionDailySavedTotals(aggregateNutritionMealTotals(payload.meals ?? []));
      setNutritionDailyTotalsError(null);
      setNutritionProgressAnimationKey((currentKey) => currentKey + 1);
    } catch (error) {
      console.error("Failed to load nutrition daily totals", { error });
      setNutritionDailyTotalsError("Saved daily totals are unavailable right now.");
    }
  }, [
    nutritionLocalDayWindow.end,
    nutritionLocalDayWindow.start,
    shouldRenderNutritionDailyProgress,
  ]);
  function updateEntryFormValue(fieldId: string, value: string) {
    setEntryFormValues((current) => ({ ...current, [fieldId]: value }));
  }

  useEffect(() => {
    void refreshNutritionDailyTotals();
  }, [refreshNutritionDailyTotals]);

  useEffect(() => {
    if (!isDefaultNutritionDatabase || selectedNutritionFavoriteTargets.length === 0) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    const selectedTargets = selectedNutritionFavoriteTargets;
    const selectedTargetKeys = new Set(selectedTargets.map(getNutritionFavoriteKey));

    Array.from(new Set(selectedTargets.map((target) => target.itemId))).forEach((itemId) => {
      params.append("itemId", itemId);
    });

    fetch(`/api/nutrition/favorites?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as NutritionFavoritesListResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load favorites.");
        }

        const loadedKeys = new Set(
          (payload.favorites ?? [])
            .filter(
              (favorite): favorite is {
                itemType: NutritionFavoriteItemType;
                itemId: string;
              } => Boolean(favorite.itemType && favorite.itemId),
            )
            .map(getNutritionFavoriteKey),
        );

        setNutritionFavoriteKeys((currentKeys) => {
          const nextKeys = new Set(currentKeys);
          selectedTargetKeys.forEach((key) => nextKeys.delete(key));
          loadedKeys.forEach((key) => {
            if (selectedTargetKeys.has(key)) {
              nextKeys.add(key);
            }
          });
          return nextKeys;
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load nutrition favorites", { error });
      });

    return () => {
      controller.abort();
    };
  }, [
    isDefaultNutritionDatabase,
    selectedNutritionFavoriteTargetKey,
    selectedNutritionFavoriteTargets,
  ]);

  useLayoutEffect(() => {
    if (!shouldRenderNutritionDailyProgress) {
      setIsNutritionProgressAnimatedIn(false);
      return;
    }

    if (shouldReduceNutritionMotion) {
      setIsNutritionProgressAnimatedIn(true);
      return;
    }

    setIsNutritionProgressAnimatedIn(false);
    const frameId = window.requestAnimationFrame(() => {
      setIsNutritionProgressAnimatedIn(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    nutritionProgressAnimationKey,
    shouldReduceNutritionMotion,
    shouldRenderNutritionDailyProgress,
  ]);

  useEffect(() => {
    if (
      !isFoodSearchDatabase ||
      selectedNutritionFoodAction !== "search" ||
      normalizedNutritionFoodSearchValue.length < 2
    ) {
      setNutritionFoodSearchResults([]);
      setIsNutritionFoodSearchLoading(false);
      setNutritionFoodSearchError(null);
      return;
    }

    const controller = new AbortController();
    const searchTimeout = window.setTimeout(() => {
      setIsNutritionFoodSearchLoading(true);
      setNutritionFoodSearchError(null);

      const params = new URLSearchParams({
        q: nutritionFoodSearchQuery,
        limit: "8",
      });

      fetch(`/api/nutrition/foods/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as NutritionFoodSearchResponse;

          if (!response.ok) {
            throw new Error(payload.error || "Unable to search foods.");
          }

          setNutritionFoodSearchResults(payload.foods ?? []);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("Failed to search nutrition foods", { error });
          setNutritionFoodSearchResults([]);
          setNutritionFoodSearchError("Food search is unavailable right now.");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsNutritionFoodSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(searchTimeout);
      controller.abort();
    };
  }, [
    isFoodSearchDatabase,
    normalizedNutritionFoodSearchValue,
    nutritionFoodSearchQuery,
    selectedNutritionFoodAction,
  ]);

  useEffect(() => {
    if (
      !isNutritionSearchMode ||
      !openNutritionBrowseDepartment ||
      !openNutritionBrowseAisle
    ) {
      setNutritionFoodBrowseResults([]);
      setIsNutritionFoodBrowseLoading(false);
      setNutritionFoodBrowseError(null);
      return;
    }

    const controller = new AbortController();
    setIsNutritionFoodBrowseLoading(true);
    setNutritionFoodBrowseError(null);

    const params = new URLSearchParams({
      mode: "browse",
      department: openNutritionBrowseDepartment,
      aisle: openNutritionBrowseAisle,
      limit: "25",
    });

    fetch(`/api/nutrition/foods/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as NutritionFoodSearchResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to browse foods.");
        }

        setNutritionFoodBrowseResults(payload.foods ?? []);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to browse nutrition foods", { error });
        setNutritionFoodBrowseResults([]);
        setNutritionFoodBrowseError("Food browse is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsNutritionFoodBrowseLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    isNutritionSearchMode,
    openNutritionBrowseAisle,
    openNutritionBrowseDepartment,
  ]);

  useEffect(() => {
    if (!isDefaultNutritionDatabase || selectedNutritionFoodAction !== "grocery") {
      setNutritionGroceryFoods([]);
      setIsNutritionGroceryLoading(false);
      setNutritionGroceryError(null);
      return;
    }

    const controller = new AbortController();
    setIsNutritionGroceryLoading(true);
    setNutritionGroceryError(null);

    fetch("/api/food-resources?status=active&limit=200", {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as FoodResourcesResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load Grocery.");
        }

        setNutritionGroceryFoods(
          getFoodResourcesFromResponse(payload).map(mapFoodResourceToFoodSearchResult),
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load nutrition Grocery foods", { error });
        setNutritionGroceryFoods([]);
        setNutritionGroceryError("Grocery is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsNutritionGroceryLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isDefaultNutritionDatabase, selectedNutritionFoodAction]);

  useEffect(() => {
    const shouldLoadChefResources = selectedNutritionFoodAction === "chef" &&
      (isGroceryDatabase || isDefaultNutritionDatabase);
    const shouldLoadGroceryResources = isGroceryDatabase &&
      (selectedNutritionFoodAction === "grocery" ||
        selectedNutritionFoodAction === "search");
    if (!shouldLoadChefResources && !shouldLoadGroceryResources) {
      setGroceryResourceItems([]);
      setIsGroceryResourcesLoading(false);
      setGroceryResourcesError(null);
      return;
    }

    const controller = new AbortController();
    setIsGroceryResourcesLoading(true);
    setGroceryResourcesError(null);

    fetch("/api/food-resources?status=active&limit=200", {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as FoodResourcesResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load Grocery List.");
        }

        setGroceryResourceItems(getFoodResourcesFromResponse(payload));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load Grocery List resources for Grocery tab", { error });
        setGroceryResourceItems([]);
        setGroceryResourcesError("Grocery List is unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsGroceryResourcesLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isDefaultNutritionDatabase, isGroceryDatabase, selectedNutritionFoodAction]);

  useEffect(() => {
    if (!isDefaultNutritionDatabase || selectedNutritionFoodAction !== "recent") {
      setIsNutritionSavedMealsLoading(false);
      setNutritionSavedMealsError(null);
      return;
    }

    const controller = new AbortController();
    setIsNutritionSavedMealsLoading(true);
    setNutritionSavedMealsError(null);

    const params = new URLSearchParams({ limit: "20" });

    fetch(`/api/nutrition/meals?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as NutritionMealsListResponse;

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load nutrition meals.");
        }

        setNutritionSavedMeals(payload.meals ?? []);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load saved nutrition meals", { error });
        setNutritionSavedMeals([]);
        setNutritionSavedMealsError("Saved meals are unavailable right now.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsNutritionSavedMealsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isDefaultNutritionDatabase, selectedNutritionFoodAction]);

  const refreshNutritionMealTemplates = useCallback(async () => {
    if (!isDefaultNutritionDatabase) {
      setNutritionMealTemplates([]);
      setIsNutritionMealTemplatesLoading(false);
      setNutritionMealTemplatesError(null);
      return;
    }

    const params = new URLSearchParams({ limit: "50" });
    setIsNutritionMealTemplatesLoading(true);
    setNutritionMealTemplatesError(null);

    try {
      const response = await fetch(`/api/nutrition/meal-templates?${params.toString()}`);
      const payload = (await response.json()) as NutritionMealsListResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load meals.");
      }

      setNutritionMealTemplates(payload.meals ?? []);
    } catch (error) {
      console.error("Failed to load reusable nutrition meals", { error });
      setNutritionMealTemplates([]);
      setNutritionMealTemplatesError("Meals are unavailable right now.");
    } finally {
      setIsNutritionMealTemplatesLoading(false);
    }
  }, [isDefaultNutritionDatabase]);

  useEffect(() => {
    if (!isDefaultNutritionDatabase || selectedNutritionFoodAction !== "meals") {
      setIsNutritionMealTemplatesLoading(false);
      setNutritionMealTemplatesError(null);
      return;
    }

    void refreshNutritionMealTemplates();
  }, [
    isDefaultNutritionDatabase,
    refreshNutritionMealTemplates,
    selectedNutritionFoodAction,
  ]);

  const refreshNutritionRecipes = useCallback(async () => {
    if (!isDefaultNutritionDatabase) {
      setNutritionRecipes([]);
      setIsNutritionRecipesLoading(false);
      setNutritionRecipesError(null);
      return;
    }

    const params = new URLSearchParams({ limit: "50" });
    setIsNutritionRecipesLoading(true);
    setNutritionRecipesError(null);

    try {
      const response = await fetch(`/api/nutrition/recipes?${params.toString()}`);
      const payload = (await response.json()) as NutritionRecipesListResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load recipes.");
      }

      setNutritionRecipes(payload.recipes ?? []);
    } catch (error) {
      console.error("Failed to load nutrition recipes", { error });
      setNutritionRecipes([]);
      setNutritionRecipesError("Recipes are unavailable right now.");
    } finally {
      setIsNutritionRecipesLoading(false);
    }
  }, [isDefaultNutritionDatabase]);

  useEffect(() => {
    if (!isDefaultNutritionDatabase || selectedNutritionFoodAction !== "recipes") {
      setIsNutritionRecipesLoading(false);
      setNutritionRecipesError(null);
      return;
    }

    void refreshNutritionRecipes();
  }, [
    isDefaultNutritionDatabase,
    refreshNutritionRecipes,
    selectedNutritionFoodAction,
  ]);

  useEffect(() => {
    if (
      !isDefaultNutritionDatabase ||
      !isNutritionMealBuilderOpen ||
      normalizedNutritionMealBuilderSearchValue.length < 2
    ) {
      setNutritionMealBuilderFoodResults([]);
      setNutritionMealBuilderRecipeResults([]);
      setIsNutritionMealBuilderSearchLoading(false);
      setNutritionMealBuilderSearchError(null);
      return;
    }

    const controller = new AbortController();
    const searchTimeout = window.setTimeout(() => {
      setIsNutritionMealBuilderSearchLoading(true);
      setNutritionMealBuilderSearchError(null);

      const params = new URLSearchParams({
        q: nutritionMealBuilderSearchQuery,
        limit: "6",
      });

      Promise.all([
        fetch(`/api/nutrition/foods/search?${params.toString()}`, {
          signal: controller.signal,
        }),
        fetch(`/api/nutrition/recipes/search?${params.toString()}`, {
          signal: controller.signal,
        }),
      ])
        .then(async ([foodsResponse, recipesResponse]) => {
          const foodsPayload = (await foodsResponse.json()) as NutritionFoodSearchResponse;
          const recipesPayload =
            (await recipesResponse.json()) as NutritionRecipeSearchResponse;

          if (!foodsResponse.ok) {
            throw new Error(foodsPayload.error || "Unable to search foods.");
          }
          if (!recipesResponse.ok) {
            throw new Error(recipesPayload.error || "Unable to search recipes.");
          }

          setNutritionMealBuilderFoodResults(foodsPayload.foods ?? []);
          setNutritionMealBuilderRecipeResults(recipesPayload.recipes ?? []);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("Failed to search meal builder items", { error });
          setNutritionMealBuilderFoodResults([]);
          setNutritionMealBuilderRecipeResults([]);
          setNutritionMealBuilderSearchError("Search is unavailable right now.");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsNutritionMealBuilderSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(searchTimeout);
      controller.abort();
    };
  }, [
    isDefaultNutritionDatabase,
    isNutritionMealBuilderOpen,
    normalizedNutritionMealBuilderSearchValue,
    nutritionMealBuilderSearchQuery,
  ]);

  useEffect(() => {
    if (
      !isDefaultNutritionDatabase ||
      !isNutritionRecipeBuilderOpen ||
      normalizedNutritionRecipeBuilderSearchValue.length < 2
    ) {
      setNutritionRecipeBuilderFoodResults([]);
      setIsNutritionRecipeBuilderSearchLoading(false);
      setNutritionRecipeBuilderSearchError(null);
      return;
    }

    const controller = new AbortController();
    const searchTimeout = window.setTimeout(() => {
      setIsNutritionRecipeBuilderSearchLoading(true);
      setNutritionRecipeBuilderSearchError(null);

      const params = new URLSearchParams({
        q: nutritionRecipeBuilderSearchQuery,
        limit: "6",
      });

      fetch(`/api/nutrition/foods/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as NutritionFoodSearchResponse;

          if (!response.ok) {
            throw new Error(payload.error || "Unable to search foods.");
          }

          setNutritionRecipeBuilderFoodResults(payload.foods ?? []);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("Failed to search recipe builder foods", { error });
          setNutritionRecipeBuilderFoodResults([]);
          setNutritionRecipeBuilderSearchError("Food search is unavailable right now.");
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsNutritionRecipeBuilderSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(searchTimeout);
      controller.abort();
    };
  }, [
    isDefaultNutritionDatabase,
    isNutritionRecipeBuilderOpen,
    normalizedNutritionRecipeBuilderSearchValue,
    nutritionRecipeBuilderSearchQuery,
  ]);

  function selectNutritionFoodAction(tabId: NutritionFoodActionTabId) {
    if (!visibleFoodActionTabs.some((tab) => tab.id === tabId)) return;

    setSelectedNutritionFoodAction(tabId);
    nutritionFoodActionTabRefs.current[tabId]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }

  function selectNutritionFoodActionByOffset(offset: -1 | 1) {
    const currentIndex = visibleFoodActionTabs.findIndex(
      (tab) => tab.id === selectedNutritionFoodAction,
    );
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeCurrentIndex + offset + visibleFoodActionTabs.length) %
      visibleFoodActionTabs.length;
    selectNutritionFoodAction(visibleFoodActionTabs[nextIndex].id);
  }

  function selectFitnessAction(tabId: FitnessActionTabId) {
    setSelectedFitnessAction(tabId);
    fitnessActionTabRefs.current[tabId]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }

  function selectFitnessActionByOffset(offset: -1 | 1) {
    const currentIndex = FITNESS_ACTION_TABS.findIndex(
      (tab) => tab.id === selectedFitnessAction,
    );
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeCurrentIndex + offset + FITNESS_ACTION_TABS.length) %
      FITNESS_ACTION_TABS.length;
    selectFitnessAction(FITNESS_ACTION_TABS[nextIndex].id);
  }

  function getFitnessEntryFieldId(fieldName: string) {
    const normalizedFieldName = fieldName.trim().toLowerCase();
    return (
      editableDatabaseFields.find(
        (field) => getDatabaseFieldName(field).trim().toLowerCase() === normalizedFieldName,
      )?.id ?? null
    );
  }

  function getCurrentFitnessWorkoutName() {
    return selectedFitnessRoutineName ?? "Custom Workout";
  }

  function buildFitnessWorkoutLogDetail(
    exercise: FitnessExerciseSample,
  ): FitnessWorkoutLogExerciseDetail {
    const detail = getFitnessWorkoutExerciseDetail(
      exercise,
      fitnessWorkoutExerciseDetailsById,
    );

    return {
      sets: detail.sets,
      reps: detail.reps,
      duration: detail.duration,
      weight: "",
    };
  }

  function shouldShowFitnessWeightField(exercise: FitnessExerciseSample) {
    const searchableText = [
      exercise.name,
      exercise.movementType,
      exercise.primaryArea,
      exercise.equipment,
    ]
      .join(" ")
      .toLowerCase();
    const bodyweightPattern =
      /\b(bodyweight|calisthenics|mobility|core|conditioning|plank|burpee|push-up|pull-up|chin-up|dip|lunge)\b/;

    return !bodyweightPattern.test(searchableText);
  }

  function getFitnessWorkoutLogDetail(exercise: FitnessExerciseSample) {
    return (
      fitnessWorkoutLogDetailsById[getFitnessExerciseId(exercise)] ??
      buildFitnessWorkoutLogDetail(exercise)
    );
  }

  function updateFitnessWorkoutLogDetail(
    exercise: FitnessExerciseSample,
    key: keyof FitnessWorkoutLogExerciseDetail,
    value: string,
  ) {
    const exerciseId = getFitnessExerciseId(exercise);

    if (key !== "weight") {
      updateFitnessWorkoutExerciseDetail(exercise, key, value);
    }

    setFitnessWorkoutLogDetailsById((currentDetails) => ({
      ...currentDetails,
      [exerciseId]: {
        ...(currentDetails[exerciseId] ?? buildFitnessWorkoutLogDetail(exercise)),
        [key]: value,
      },
    }));
  }

  function buildFitnessWorkoutEntryValues(
    workoutName: string,
    detailsByExerciseId: Record<string, FitnessWorkoutLogExerciseDetail>,
  ) {
    const nameFieldId = getFitnessEntryFieldId("Name");
    const workoutFieldId = getFitnessEntryFieldId("Workout");
    const guidanceFieldId = getFitnessEntryFieldId("Sets/Reps or Duration");
    const notesFieldId = getFitnessEntryFieldId("Notes");
    const nextValues: Record<string, string> = {};
    const workoutLines = selectedFitnessWorkoutExercises.map((exercise) => exercise.name);
    const detailLines = selectedFitnessWorkoutExercises.map((exercise) => {
      const detail =
        detailsByExerciseId[getFitnessExerciseId(exercise)] ??
        buildFitnessWorkoutLogDetail(exercise);
      const sets = detail.sets.trim();
      const reps = detail.reps.trim();
      const duration = detail.duration.trim();

      if (duration) {
        return [exercise.name, sets ? `${sets} sets` : null, duration]
          .filter(Boolean)
          .join(": ");
      }

      return [exercise.name, sets ? `${sets} sets` : null, reps ? `${reps} reps` : null]
        .filter(Boolean)
        .join(": ");
    });
    const weightLines = selectedFitnessWorkoutExercises
      .map((exercise) => {
        const weight =
          detailsByExerciseId[getFitnessExerciseId(exercise)]?.weight.trim() ?? "";

        return weight ? `${exercise.name}: ${weight}` : null;
      })
      .filter((line): line is string => Boolean(line));
    const existingNotes = notesFieldId
      ? typeof entryFormValues[notesFieldId] === "string"
        ? entryFormValues[notesFieldId].trim()
        : ""
      : "";
    const notesLines = [
      weightLines.length > 0 ? `Weights:\n${weightLines.join("\n")}` : null,
      existingNotes,
    ].filter(Boolean);

    if (nameFieldId) nextValues[nameFieldId] = workoutName;
    if (workoutFieldId) nextValues[workoutFieldId] = workoutLines.join("\n");
    if (guidanceFieldId) nextValues[guidanceFieldId] = detailLines.join("\n");
    if (notesFieldId) nextValues[notesFieldId] = notesLines.join("\n\n");

    return nextValues;
  }

  function toggleFitnessWorkoutExercise(exercise: FitnessExerciseSample) {
    const exerciseId = getFitnessExerciseId(exercise);
    const isSelected = selectedFitnessWorkoutExercises.some(
      (selectedExercise) => getFitnessExerciseId(selectedExercise) === exerciseId,
    );

    if (isSelected) {
      setSelectedFitnessWorkoutExercises((currentExercises) =>
        currentExercises.filter(
          (selectedExercise) => getFitnessExerciseId(selectedExercise) !== exerciseId,
        ),
      );
      if (selectedFitnessWorkoutExercises.length <= 1) {
        setSelectedFitnessRoutineName(null);
        setIsFitnessWorkoutReviewOpen(false);
      }
      setFitnessWorkoutExerciseDetailsById((currentDetails) => {
        const nextDetails = { ...currentDetails };
        delete nextDetails[exerciseId];
        return nextDetails;
      });
      void hapticSnap();
      return;
    }

    setSelectedFitnessWorkoutExercises((currentExercises) => [...currentExercises, exercise]);
    setFitnessWorkoutExerciseDetailsById((currentDetails) => {
      if (currentDetails[exerciseId]) return currentDetails;

      return {
        ...currentDetails,
        [exerciseId]: getInitialFitnessWorkoutExerciseDetail(exercise),
      };
    });
    void hapticSoftTick();
  }

  function toggleFavoriteFitnessExercise(exerciseId: string) {
    setFavoriteFitnessExerciseIds((currentExerciseIds) => {
      const nextExerciseIds = new Set(currentExerciseIds);

      if (nextExerciseIds.has(exerciseId)) {
        nextExerciseIds.delete(exerciseId);
      } else {
        nextExerciseIds.add(exerciseId);
      }

      return nextExerciseIds;
    });
    void hapticSoftTick();
  }

  function removeFitnessWorkoutExercise(exerciseName: string) {
    const exerciseId = exerciseName;

    setSelectedFitnessWorkoutExercises((currentExercises) =>
      currentExercises.filter((exercise) => getFitnessExerciseId(exercise) !== exerciseId),
    );
    if (selectedFitnessWorkoutExercises.length <= 1) {
      setSelectedFitnessRoutineName(null);
      setIsFitnessWorkoutReviewOpen(false);
    }
    setFitnessWorkoutExerciseDetailsById((currentDetails) => {
      const nextDetails = { ...currentDetails };
      delete nextDetails[exerciseId];
      return nextDetails;
    });
    void hapticSnap();
  }

  function clearFitnessWorkoutExercises() {
    setSelectedFitnessWorkoutExercises([]);
    setSelectedFitnessRoutineName(null);
    setFitnessWorkoutExerciseDetailsById({});
    setFitnessWorkoutLogDetailsById({});
    setIsFitnessWorkoutReviewOpen(false);
    void hapticSnap();
  }


  function loadFitnessRoutineTemplate(
    routine: FitnessRoutineTemplate,
    workoutName = routine.title,
  ) {
    const routineExercises = routine.exercises.map((prescription) => {
      const exercise = FITNESS_EXERCISE_SAMPLE_BY_NAME.get(prescription.name);

      if (!exercise) {
        throw new Error(`Routine exercise is missing from fitness seeds: ${prescription.name}`);
      }

      return exercise;
    });
    const routineDetails = routine.exercises.reduce<
      Record<string, FitnessWorkoutExerciseDetail>
    >((details, prescription) => {
      details[prescription.name] = routinePrescriptionToWorkoutDetail(prescription);
      return details;
    }, {});

    setSelectedFitnessWorkoutExercises(routineExercises);
    setFitnessWorkoutExerciseDetailsById(routineDetails);
    setFitnessWorkoutLogDetailsById({});
    setSelectedFitnessRoutineName(workoutName);
    setIsFitnessWorkoutReviewOpen(false);
    selectFitnessAction("start");
    void hapticSoftTick();
  }

  function selectFitnessRoutine(routine: FitnessRoutineTemplate) {
    loadFitnessRoutineTemplate(routine);
  }

  function startFitnessPlan(plan: FitnessPlanTemplate) {
    setSelectedFitnessPlanName(plan.id);
    setSelectedFitnessPlanSetup({});
    void hapticSoftTick();
  }

  function updateSelectedFitnessPlanSetup<T extends keyof FitnessPlanSetup>(
    key: T,
    value: FitnessPlanSetup[T],
  ) {
    setSelectedFitnessPlanSetup((currentSetup) => ({
      ...currentSetup,
      [key]: value,
    }));
    void hapticSoftTick();
  }

  function isFitnessPlanSetupReady(
    setup: Partial<FitnessPlanSetup>,
  ): setup is FitnessPlanSetup {
    return Boolean(
      setup.goal &&
        setup.level &&
        setup.equipment &&
        setup.daysPerWeek &&
        setup.sessionLength,
    );
  }

  function loadFirstFitnessPlanWorkout(plan: FitnessPlanTemplate) {
    if (!isFitnessPlanSetupReady(selectedFitnessPlanSetup)) return;

    const firstRoutine = resolveFitnessPlanRoutineSequence(plan)[0];

    if (!firstRoutine) return;

    loadFitnessRoutineTemplate(firstRoutine, `${plan.title} · ${firstRoutine.title}`);
  }

  function updateFitnessWorkoutExerciseDetail(
    exercise: FitnessExerciseSample,
    key: keyof FitnessWorkoutExerciseDetail,
    value: string,
  ) {
    const exerciseId = getFitnessExerciseId(exercise);

    setFitnessWorkoutExerciseDetailsById((currentDetails) => {
      const currentDetail =
        currentDetails[exerciseId] ?? getFallbackFitnessWorkoutExerciseDetail();

      return {
        ...currentDetails,
        [exerciseId]: {
          ...currentDetail,
          [key]: value,
        },
      };
    });

    setFitnessWorkoutLogDetailsById((currentDetails) => {
      const currentDetail = currentDetails[exerciseId];

      if (!currentDetail) return currentDetails;

      return {
        ...currentDetails,
        [exerciseId]: {
          ...currentDetail,
          [key]: value,
        },
      };
    });
  }

  function getPositiveFitnessDetailValue(value: string) {
    const parsedValue = Number.parseInt(value, 10);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;
  }

  function bumpFitnessWorkoutExerciseDetail(
    exercise: FitnessExerciseSample,
    key: "sets" | "reps",
    offset: -1 | 1,
  ) {
    const currentDetail = getFitnessWorkoutExerciseDetail(
      exercise,
      fitnessWorkoutExerciseDetailsById,
    );
    const nextValue = Math.max(
      1,
      getPositiveFitnessDetailValue(currentDetail[key]) + offset,
    );

    updateFitnessWorkoutExerciseDetail(exercise, key, String(nextValue));
    void hapticSoftTick();
  }

  function renderFitnessDetailStepper(
    exercise: FitnessExerciseSample,
    key: "sets" | "reps",
    label: string,
    value: number,
  ) {
    return (
      <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-white/[0.07] bg-black/28">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/36">
          {label}
        </span>
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()} for ${exercise.name}`}
          onClick={() => bumpFitnessWorkoutExerciseDetail(exercise, key, -1)}
          className="flex h-8 w-7 items-center justify-center border-l border-white/[0.055] text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:bg-white/[0.08] focus-visible:text-white"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="flex h-8 w-7 items-center justify-center border-l border-white/[0.055] text-xs font-semibold tabular-nums text-white/82">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()} for ${exercise.name}`}
          onClick={() => bumpFitnessWorkoutExerciseDetail(exercise, key, 1)}
          className="flex h-8 w-7 items-center justify-center border-l border-white/[0.055] text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white/78 focus-visible:bg-white/[0.08] focus-visible:text-white"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function reviewSelectedFitnessWorkout() {
    if (selectedFitnessWorkoutExercises.length === 0) return;

    setFitnessWorkoutLogDetailsById((currentDetails) => {
      const nextDetails = { ...currentDetails };

      selectedFitnessWorkoutExercises.forEach((exercise) => {
        const exerciseId = getFitnessExerciseId(exercise);

        if (!nextDetails[exerciseId]) {
          nextDetails[exerciseId] = buildFitnessWorkoutLogDetail(exercise);
        }
      });

      return nextDetails;
    });
    setIsFitnessWorkoutReviewOpen(true);
    void hapticSoftTick();
  }

  function startSelectedFitnessWorkout() {
    if (selectedFitnessWorkoutExercises.length === 0) return;

    const payload: FitnessWorkoutFocusSessionPayload = {
      source: "fitness",
      workoutName: getCurrentFitnessWorkoutName(),
      createdAt: new Date().toISOString(),
      exercises: selectedFitnessWorkoutExercises.map((exercise) => {
        const detail = getFitnessWorkoutExerciseDetail(
          exercise,
          fitnessWorkoutExerciseDetailsById,
        );

        return {
          id: getFitnessExerciseId(exercise),
          name: exercise.name,
          sets: detail.sets,
          reps: detail.reps,
          duration: detail.duration,
          weight:
            fitnessWorkoutLogDetailsById[getFitnessExerciseId(exercise)]?.weight,
        };
      }),
    };

    try {
      window.sessionStorage.setItem(
        FITNESS_WORKOUT_FOCUS_SESSION_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // Route navigation still opens Focus Pomo when sessionStorage is unavailable.
    }

    void hapticSoftTick();
    router.push("/focus-pomo");
  }

  function logReviewedFitnessWorkout() {
    if (selectedFitnessWorkoutExercises.length === 0) return;

    const workoutName = getCurrentFitnessWorkoutName();
    const nextDetailsByExerciseId = selectedFitnessWorkoutExercises.reduce<
      Record<string, FitnessWorkoutLogExerciseDetail>
    >((nextDetails, exercise) => {
      const exerciseId = getFitnessExerciseId(exercise);
      nextDetails[exerciseId] = getFitnessWorkoutLogDetail(exercise);
      return nextDetails;
    }, {});
    const nextValues = buildFitnessWorkoutEntryValues(
      workoutName,
      nextDetailsByExerciseId,
    );

    if (Object.keys(nextValues).length > 0) {
      const nextFormValues = { ...entryFormValues, ...nextValues };
      setEntryFormValues(nextFormValues);
      setSubmitError(null);
      void saveDatabaseEntry(nextFormValues);
    }
  }

  function applyNutritionFoodSelection(nextFoods: NutritionSelectedFoodItem[]) {
    const sanitizedFoods = nextFoods.map(sanitizeNutritionSelectedFoodItem);
    const mappedValues = mapSelectedNutritionFoodsToEntryValues(
      sanitizedFoods,
      databaseDefinition,
    );
    setSelectedNutritionFoods(sanitizedFoods);
    setSelectedNutritionFood(null);
    setSelectedNutritionMeal(null);
    setSelectedNutritionMealSource(null);
    setSelectedNutritionRecipe(null);
    setEntryFormValues((current) => ({ ...current, ...mappedValues }));
    setSubmitError(null);
  }

  function toggleNutritionFoodSelection(food: FoodSearchResult) {
    if (isGroceryDatabase) {
      const foodKey = getNutritionFoodSelectionKey(food);
      const nextFoods = selectedNutritionFoodIds.has(foodKey)
        ? []
        : [makeNutritionSelectedFoodItem(food)];

      applyNutritionFoodSelection(nextFoods);
      return;
    }

    const foodKey = getNutritionFoodSelectionKey(food);
    const nextFoods = selectedNutritionFoodIds.has(foodKey)
      ? selectedNutritionFoods.filter(
          (selectedFood) => getNutritionFoodSelectionKey(selectedFood.food) !== foodKey,
        )
      : [...selectedNutritionFoods, makeNutritionSelectedFoodItem(food)];

    applyNutritionFoodSelection(nextFoods);
  }

  function removeNutritionSelectedFood(food: FoodSearchResult) {
    const foodKey = getNutritionFoodSelectionKey(food);

    if (selectedNutritionFood?.food.id === foodKey) {
      setSelectedNutritionFood(null);
      setSelectedNutritionMealSource(null);
      setEntryFormValues((current) => ({
        ...current,
        ...mapSelectedNutritionFoodsToEntryValues([], databaseDefinition),
      }));
      setSubmitError(null);
      return;
    }

    applyNutritionFoodSelection(
      selectedNutritionFoods.filter(
        (selectedFood) => getNutritionFoodSelectionKey(selectedFood.food) !== foodKey,
      ),
    );
  }

  function updateNutritionSelectedFoodServing(
    food: FoodSearchResult,
    quantity: number,
    servingUnit?: NutritionServingUnit,
  ) {
    const foodKey = getNutritionFoodSelectionKey(food);
    const nextQuantity = normalizeNutritionQuantity(quantity);
    const nextServingUnit = getSafeFoodServingUnit(
      food,
      servingUnit ??
        selectedNutritionFood?.servingUnit ??
        getSelectedNutritionFoodItem(food)?.servingUnit ??
        getDefaultFoodServingUnit(food),
    );

    if (selectedNutritionFood?.food.id === foodKey) {
      const nextItem = {
        ...selectedNutritionFood,
        quantity: nextQuantity,
        servingUnit: nextServingUnit,
        groceryDeduction: getDefaultGroceryDeductionDraft(
          food,
          nextQuantity,
          nextServingUnit,
        ),
      };
      setSelectedNutritionFood(nextItem);
      setEntryFormValues((current) => ({
        ...current,
        ...mapSelectedNutritionFoodsToEntryValues([nextItem], databaseDefinition),
      }));
      setSubmitError(null);
      return;
    }

    const nextFoods = selectedNutritionFoods.map((selectedFood) =>
      getNutritionFoodSelectionKey(selectedFood.food) === foodKey
        ? {
            ...selectedFood,
            quantity: nextQuantity,
            servingUnit: nextServingUnit,
            groceryDeduction: getDefaultGroceryDeductionDraft(
              food,
              nextQuantity,
              nextServingUnit,
            ),
          }
        : selectedFood,
    );
    applyNutritionFoodSelection(nextFoods);
  }

  function getSelectedNutritionFoodItem(food: FoodSearchResult) {
    const foodKey = getNutritionFoodSelectionKey(food);
    return (
      selectedNutritionFoods.find(
        (selectedFood) => getNutritionFoodSelectionKey(selectedFood.food) === foodKey,
      ) ?? null
    );
  }

  function stageScannedFood(food: FoodSearchResult) {
    if (isGroceryDatabase) {
      const draftKey = getGrocerySearchDraftKey(food);
      if (!draftKey) return false;
      const defaultInventory = getGroceryDefaultInventoryAmount(food);
      setGrocerySearchDrafts((currentDrafts) =>
        currentDrafts[draftKey]
          ? currentDrafts
          : {
              ...currentDrafts,
              [draftKey]: {
                stableKey: draftKey,
                food,
                quantity: formatGrocerySearchQuantity(defaultInventory.quantity),
                unit: defaultInventory.unit,
                status: "idle",
                message: null,
                quantityManuallyEdited: false,
              },
            },
      );
      return true;
    }

    const foodKey = getNutritionFoodSelectionKey(food);
    const nextItem = makeNutritionSelectedFoodItem(food);
    setSelectedNutritionFoods((currentFoods) => {
      if (
        currentFoods.some(
          (item) => getNutritionFoodSelectionKey(item.food) === foodKey,
        )
      ) {
        return currentFoods;
      }
      return [...currentFoods, nextItem];
    });
    const nextFoodsForEntry = selectedNutritionFoods.some(
      (item) => getNutritionFoodSelectionKey(item.food) === foodKey,
    )
      ? selectedNutritionFoods
      : [...selectedNutritionFoods, nextItem];
    setEntryFormValues((current) => ({
      ...current,
      ...mapSelectedNutritionFoodsToEntryValues(nextFoodsForEntry, databaseDefinition),
    }));
    setSelectedNutritionFood(null);
    setSelectedNutritionMeal(null);
    setSelectedNutritionMealSource(null);
    setSelectedNutritionRecipe(null);
    setSubmitError(null);
    return true;
  }

  function selectNutritionSavedMeal(
    meal: NutritionSavedMeal,
    source: "meal_template" | "logged_meal",
  ) {
    const mappedValues = mapNutritionSavedMealToEntryValues(meal, databaseDefinition);
    setSelectedNutritionFoods([]);
    setSelectedNutritionFood(null);
    setSelectedNutritionMeal(meal);
    setSelectedNutritionMealSource(source);
    setSelectedNutritionRecipe(null);
    setEntryFormValues((current) => ({ ...current, ...mappedValues }));
    setSubmitError(null);
  }

  function selectNutritionSavedRecipe(recipe: NutritionSavedRecipe) {
    const nextItem: NutritionSelectedRecipeItem = {
      recipe,
      quantity: 1,
      servingUnit: "serving",
    };
    const mappedValues = mapNutritionSavedRecipeToEntryValues(nextItem, databaseDefinition);
    setSelectedNutritionFoods([]);
    setSelectedNutritionFood(null);
    setSelectedNutritionMeal(null);
    setSelectedNutritionMealSource(null);
    setSelectedNutritionRecipe(nextItem);
    setEntryFormValues((current) => ({ ...current, ...mappedValues }));
    setSubmitError(null);
  }

  function updateNutritionSelectedRecipeServing(
    quantity: number,
    servingUnit = selectedNutritionRecipe?.servingUnit ?? "serving",
  ) {
    if (!selectedNutritionRecipe) return;

    const nextItem: NutritionSelectedRecipeItem = {
      ...selectedNutritionRecipe,
      quantity: normalizeNutritionQuantity(quantity),
      servingUnit: normalizeNutritionServingUnit(servingUnit),
    };
    setSelectedNutritionRecipe(nextItem);
    setEntryFormValues((current) => ({
      ...current,
      ...mapNutritionSavedRecipeToEntryValues(nextItem, databaseDefinition),
    }));
    setSubmitError(null);
  }

  function openNutritionMealBuilder() {
    setNutritionMealBuilderName("");
    setNutritionMealBuilderIcon(DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON);
    setIsNutritionMealBuilderIconPickerOpen(false);
    setNutritionMealBuilderItems([]);
    setNutritionMealBuilderSearchQuery("");
    setNutritionMealBuilderFoodResults([]);
    setNutritionMealBuilderRecipeResults([]);
    setNutritionMealBuilderSearchError(null);
    setNutritionMealBuilderSaveError(null);
    setIsNutritionMealBuilderOpen(true);
  }

  function closeNutritionMealBuilder() {
    setIsNutritionMealBuilderOpen(false);
    setIsNutritionMealBuilderIconPickerOpen(false);
    setNutritionMealBuilderSearchError(null);
    setNutritionMealBuilderSaveError(null);
  }

  function openNutritionRecipeBuilder() {
    setNutritionRecipeBuilderName("");
    setNutritionRecipeBuilderIcon(DEFAULT_NUTRITION_RECIPE_ICON);
    setIsNutritionRecipeBuilderIconPickerOpen(false);
    setNutritionRecipeBuilderItems([]);
    setNutritionRecipeBuilderSearchQuery("");
    setNutritionRecipeBuilderFoodResults([]);
    setNutritionRecipeBuilderSearchError(null);
    setNutritionRecipeBuilderSaveError(null);
    setIsNutritionRecipeBuilderOpen(true);
  }

  function closeNutritionRecipeBuilder() {
    setIsNutritionRecipeBuilderOpen(false);
    setIsNutritionRecipeBuilderIconPickerOpen(false);
    setNutritionRecipeBuilderSearchError(null);
    setNutritionRecipeBuilderSaveError(null);
  }

  function addNutritionMealBuilderFood(food: FoodSearchResult) {
    setNutritionMealBuilderItems((currentItems) => [
      ...currentItems,
      makeNutritionMealBuilderFoodItem(food),
    ]);
    setNutritionMealBuilderSearchQuery("");
    setNutritionMealBuilderFoodResults([]);
    setNutritionMealBuilderRecipeResults([]);
    setNutritionMealBuilderSearchError(null);
  }

  function addNutritionMealBuilderRecipe(recipe: NutritionRecipeSearchResult) {
    setNutritionMealBuilderItems((currentItems) => [
      ...currentItems,
      makeNutritionMealBuilderRecipeItem(recipe),
    ]);
    setNutritionMealBuilderSearchQuery("");
    setNutritionMealBuilderFoodResults([]);
    setNutritionMealBuilderRecipeResults([]);
    setNutritionMealBuilderSearchError(null);
  }

  function removeNutritionMealBuilderItem(itemId: string) {
    setNutritionMealBuilderItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function addNutritionRecipeBuilderFood(food: FoodSearchResult) {
    setNutritionRecipeBuilderItems((currentItems) => [
      ...currentItems,
      makeNutritionMealBuilderFoodItem(food),
    ]);
    setNutritionRecipeBuilderSearchQuery("");
    setNutritionRecipeBuilderFoodResults([]);
    setNutritionRecipeBuilderSearchError(null);
  }

  function removeNutritionRecipeBuilderItem(itemId: string) {
    setNutritionRecipeBuilderItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function updateNutritionMealBuilderItemServing(
    itemId: string,
    quantity: number,
    servingUnit?: NutritionServingUnit,
  ) {
    const nextQuantity = normalizeNutritionQuantity(quantity);
    setNutritionMealBuilderItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: nextQuantity,
              servingUnit:
                item.type === "food" && item.food
                  ? getSafeFoodServingUnit(item.food, servingUnit ?? item.servingUnit)
                  : normalizeNutritionServingUnit(servingUnit ?? item.servingUnit),
            }
          : item,
      ),
    );
  }

  function updateNutritionRecipeBuilderItemServing(
    itemId: string,
    quantity: number,
    servingUnit?: NutritionServingUnit,
  ) {
    const nextQuantity = normalizeNutritionQuantity(quantity);
    setNutritionRecipeBuilderItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: nextQuantity,
              servingUnit:
                item.type === "food" && item.food
                  ? getSafeFoodServingUnit(item.food, servingUnit ?? item.servingUnit)
                  : normalizeNutritionServingUnit(servingUnit ?? item.servingUnit),
            }
          : item,
      ),
    );
  }

  async function saveNutritionMealBuilder() {
    if (isNutritionMealBuilderSaving) return;

    const name = nutritionMealBuilderName.trim();
    if (!name) {
      void hapticWarningPattern();
      setNutritionMealBuilderSaveError("Name this meal first.");
      return;
    }
    if (nutritionMealBuilderItems.length === 0) {
      void hapticWarningPattern();
      setNutritionMealBuilderSaveError("Add at least one food or recipe.");
      return;
    }

    setIsNutritionMealBuilderSaving(true);
    setNutritionMealBuilderSaveError(null);

    try {
      await createNutritionMealTemplate({
        name,
        icon: nutritionMealBuilderIcon,
        items: nutritionMealBuilderItems.map(buildNutritionMealTemplateDraftItem),
      });
      closeNutritionMealBuilder();
      await refreshNutritionMealTemplates();
      void hapticComplete();
    } catch (error) {
      console.error("Failed to create reusable nutrition meal", { error });
      void hapticErrorPattern();
      setNutritionMealBuilderSaveError("Unable to save this meal right now.");
    } finally {
      setIsNutritionMealBuilderSaving(false);
    }
  }

  async function saveNutritionRecipeBuilder() {
    if (isNutritionRecipeBuilderSaving) return;

    const name = nutritionRecipeBuilderName.trim();
    if (!name) {
      void hapticWarningPattern();
      setNutritionRecipeBuilderSaveError("Name this recipe first.");
      return;
    }
    if (nutritionRecipeBuilderItems.length === 0) {
      void hapticWarningPattern();
      setNutritionRecipeBuilderSaveError("Add at least one food.");
      return;
    }

    setIsNutritionRecipeBuilderSaving(true);
    setNutritionRecipeBuilderSaveError(null);

    try {
      await createNutritionRecipe({
        name,
        icon: nutritionRecipeBuilderIcon,
        items: nutritionRecipeBuilderItems.map(buildNutritionMealTemplateDraftItem),
      });
      closeNutritionRecipeBuilder();
      await refreshNutritionRecipes();
      void hapticComplete();
    } catch (error) {
      console.error("Failed to create nutrition recipe", { error });
      void hapticErrorPattern();
      setNutritionRecipeBuilderSaveError("Unable to save this recipe right now.");
    } finally {
      setIsNutritionRecipeBuilderSaving(false);
    }
  }

  async function lookupNutritionBarcode(barcodeValue = nutritionBarcodeValue) {
    if (isNutritionBarcodeLookupLoading || nutritionBarcodeLookupLoadingRef.current) return;

    const normalizedBarcode = normalizeFoodBarcode(barcodeValue);
    if (!normalizedBarcode) {
      void hapticWarningPattern();
      setNutritionBarcodeLookupStatus("Enter a barcode.");
      setNutritionBarcodeLookupError(null);
      return;
    }

    nutritionBarcodeLookupLoadingRef.current = true;
    setIsNutritionBarcodeLookupLoading(true);
    setNutritionBarcodeLookupStatus(null);
    setNutritionBarcodeLookupError(null);

    try {
      const params = new URLSearchParams({ barcode: normalizedBarcode });
      if (isGroceryDatabase) {
        params.set("context", "grocery");
      }
      const response = await fetch(`/api/nutrition/foods/barcode?${params.toString()}`);
      const payload = (await response.json()) as NutritionFoodBarcodeLookupResponse;

      if (payload.status === "rate_limited") {
        setNutritionBarcodeLookupStatus("Too many barcode lookups. Try again in a bit.");
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error || "Unable to look up barcode.");
      }

      if (payload.food) {
        const foodForSelection: FoodSearchResult = isGroceryDatabase
          ? {
              ...payload.food,
              metadata: {
                ...getRecordMetadata(payload.food.metadata),
                barcode: normalizedBarcode,
                scan_source: payload.source,
                scan_status: payload.status,
                originalScannedProductName: payload.food.name,
                originalScannedBrandName: payload.food.brand_name ?? undefined,
                sourceProductName:
                  getTrimmedMetadataString(
                    getRecordMetadata(payload.food.metadata),
                    "source_product_name",
                  ) ?? payload.food.name,
                sourceBrandName:
                  getTrimmedMetadataString(
                    getRecordMetadata(payload.food.metadata),
                    "source_brand_name",
                  ) ??
                  payload.food.brand_name ??
                  undefined,
                originalScannedNutrition: {
                  serving_size: payload.food.serving_size,
                  serving_unit: payload.food.serving_unit,
                  serving_grams: payload.food.serving_grams,
                  calories: payload.food.calories,
                  carbs_g: payload.food.carbs_g,
                  protein_g: payload.food.protein_g,
                  fat_g: payload.food.fat_g,
                },
              },
            }
          : payload.food;

        stageScannedFood(foodForSelection);
        setNutritionBarcodeValue("");
        setNutritionBarcodeLookupStatus(
          payload.status === "created"
            ? isGroceryDatabase
              ? "Staged from foods catalog. Scan another or save Grocery List."
              : "Staged from foods catalog. Scan another or save entry."
            : isGroceryDatabase
              ? "Staged. Scan another or save Grocery List."
              : "Staged. Scan another or save entry.",
        );
        return;
      }

      const messageByStatus: Record<FoodBarcodeLookupResult["status"], string> = {
        found: "Found in foods catalog.",
        created: "Added from Open Food Facts.",
        not_found: "Product not found",
        invalid_barcode: "Enter a valid barcode.",
        missing_nutrition: "Nutrition data is incomplete for this product.",
        invalid_nutrition: "Nutrition data is incomplete for this product.",
        external_error: "Barcode lookup is unavailable right now.",
        rate_limited: "Too many barcode lookups. Try again in a bit.",
      };
      setNutritionBarcodeLookupStatus(messageByStatus[payload.status]);
    } catch (error) {
      console.error("Failed to look up nutrition barcode", { error });
      void hapticErrorPattern();
      setNutritionBarcodeLookupError("Barcode lookup is unavailable right now.");
    } finally {
      nutritionBarcodeLookupLoadingRef.current = false;
      setIsNutritionBarcodeLookupLoading(false);
    }
  }

  async function scanAndLookupNutritionBarcode() {
    if (
      isNutritionBarcodeScannerLoading ||
      isNutritionBarcodeLookupLoading ||
      nutritionBarcodeScannerLoadingRef.current ||
      nutritionBarcodeLookupLoadingRef.current
    ) return;

    nutritionBarcodeScannerLoadingRef.current = true;
    setIsNutritionBarcodeScannerLoading(true);
    setNutritionBarcodeLookupStatus(null);
    setNutritionBarcodeLookupError(null);

    try {
      const result: NutritionBarcodeScannerResult = await scanNutritionBarcode();

      if (result.status === "cancelled") {
        void hapticSnap();
        return;
      }

      if (result.status !== "scanned") {
        void hapticWarningPattern();
        setNutritionBarcodeLookupStatus(result.message);
        return;
      }

      setNutritionBarcodeValue(result.barcode);
      await lookupNutritionBarcode(result.barcode);
    } finally {
      nutritionBarcodeScannerLoadingRef.current = false;
      setIsNutritionBarcodeScannerLoading(false);
    }
  }

  function renderDatabaseEntryField(
    field: NoteDatabaseFieldDefinition,
    options: { compact?: boolean } = {},
  ) {
    const fieldName = getDatabaseFieldName(field);
    const rawFieldValue = entryFormValues[field.id];
    const fieldValue =
      typeof rawFieldValue === "string"
        ? rawFieldValue
        : rawFieldValue == null
          ? ""
          : String(rawFieldValue);
    const nutritionMacroFieldKey =
      field.type === "number" &&
      (isDefaultNutritionDatabase ||
        field.id === GROCERY_CUSTOM_CARBS_FIELD_ID ||
        field.id === GROCERY_CUSTOM_PROTEIN_FIELD_ID ||
        field.id === GROCERY_CUSTOM_FAT_FIELD_ID)
        ? getNutritionMacroFieldKey(field)
        : null;
    const fieldTypeDisplayLabel = nutritionMacroFieldKey ? "GRAMS" : NOTE_DATABASE_FIELD_TYPE_LABELS[field.type];
    const numberFieldPlaceholder = nutritionMacroFieldKey ? "0g" : fieldName;
    const displayFieldName =
      isGroceryDatabase &&
      field.id === ON_HAND_NAME_FIELD_ID &&
      selectedNutritionFoodAction !== "custom"
        ? "Grocery item"
        : fieldName;
    const inputClassName = options.compact
      ? "mt-1.5 w-full rounded-lg border border-white/[0.04] bg-white/[0.045] px-2 py-2 text-sm text-white outline-none transition placeholder:text-white/24 selection:bg-white/[0.18] hover:border-white/[0.07] hover:bg-white/[0.055] focus-visible:border-white/[0.12] focus-visible:bg-white/[0.06]"
      : "mt-2 w-full rounded-lg border border-white/[0.04] bg-white/[0.045] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/24 selection:bg-white/[0.18] hover:border-white/[0.07] hover:bg-white/[0.055] focus-visible:border-white/[0.12] focus-visible:bg-white/[0.06]";

    return (
      <label key={field.id} className={options.compact ? "block min-w-0" : "block"}>
        <span className="flex items-center justify-between gap-2 text-xs font-semibold text-white/60">
          <span className="min-w-0 truncate">
            {field.isTitle ? displayFieldName : fieldName}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {field.isTitle ? (
              <span className="rounded-full border border-white/[0.05] bg-black/22 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/48">
                {fieldName}
              </span>
            ) : null}
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">
              {fieldTypeDisplayLabel}
            </span>
          </span>
        </span>
        {field.type === "longText" ? (
          <textarea
            value={fieldValue}
            onChange={(event) => updateEntryFormValue(field.id, event.target.value)}
            rows={4}
            className={`${inputClassName} resize-none`}
            placeholder={fieldName}
          />
        ) : field.type === "number" ? (
          <input
            type="number"
            value={fieldValue}
            onChange={(event) => updateEntryFormValue(field.id, event.target.value)}
            className={inputClassName}
            placeholder={numberFieldPlaceholder}
          />
        ) : field.type === "rating" ? (
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={fieldValue}
            onChange={(event) => updateEntryFormValue(field.id, event.target.value)}
            className={inputClassName}
            placeholder="1-5"
          />
        ) : field.type === "date" ? (
          <input
            type="date"
            value={fieldValue}
            onChange={(event) => updateEntryFormValue(field.id, event.target.value)}
            className={inputClassName}
          />
        ) : field.type === "photo" ? (
          <input
            disabled
            readOnly
            value=""
            className={`${inputClassName} cursor-not-allowed text-white/28`}
            placeholder="Photo field coming later"
          />
        ) : isGroceryDatabase && field.id === ON_HAND_LOCATION_FIELD_ID ? (
          <select
            value={fieldValue || "other"}
            onChange={(event) => updateEntryFormValue(field.id, event.target.value)}
            className={inputClassName}
          >
            {GROCERY_LOCATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={fieldValue}
            onChange={(event) => updateEntryFormValue(field.id, event.target.value)}
            className={inputClassName}
            placeholder={field.type === "select" ? "Select value" : fieldName}
          />
        )}
      </label>
    );
  }

  function renderNutritionFoodActionTabs() {
    return (
      <div className="relative -mx-1">
        <button
          type="button"
          aria-label={isGroceryDatabase ? "Previous Grocery tab" : "Previous Nutrition tab"}
          onClick={(event) => {
            event.preventDefault();
            selectNutritionFoodActionByOffset(-1);
          }}
          className="absolute left-0 top-0 z-10 flex h-11 w-4 items-center justify-center bg-black/42 text-white/34 outline-none transition hover:text-white/58 focus-visible:text-white/76 focus-visible:ring-1 focus-visible:ring-white/14"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden="true" />
        </button>
        <div className="overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1.5 pb-1">
            {visibleFoodActionTabs.map((tab) => {
              const Icon = tab.icon;
              const isSelected = selectedNutritionFoodAction === tab.id;

              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    nutritionFoodActionTabRefs.current[tab.id] = node;
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectNutritionFoodAction(tab.id)}
                  className={`flex h-11 w-[50px] shrink-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-none outline-none transition ${
                    isSelected
                      ? "text-white/88"
                      : "text-white/42 hover:text-white/68"
                  } focus-visible:text-white/80 focus-visible:ring-1 focus-visible:ring-white/16`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          aria-label={isGroceryDatabase ? "Next Grocery tab" : "Next Nutrition tab"}
          onClick={(event) => {
            event.preventDefault();
            selectNutritionFoodActionByOffset(1);
          }}
          className="absolute right-0 top-0 z-10 flex h-11 w-4 items-center justify-center bg-black/42 text-white/34 outline-none transition hover:text-white/58 focus-visible:text-white/76 focus-visible:ring-1 focus-visible:ring-white/14"
        >
          <ChevronRight className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderFitnessActionTabs() {
    return (
      <div className="relative -mx-1">
        <button
          type="button"
          aria-label="Previous Fitness tab"
          onClick={(event) => {
            event.preventDefault();
            selectFitnessActionByOffset(-1);
          }}
          className="absolute left-0 top-0 z-10 flex h-11 w-4 items-center justify-center bg-black/42 text-white/34 outline-none transition hover:text-white/58 focus-visible:text-white/76 focus-visible:ring-1 focus-visible:ring-white/14"
        >
          <ChevronLeft className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden="true" />
        </button>
        <div className="overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1 pb-1">
            {FITNESS_ACTION_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = selectedFitnessAction === tab.id;

              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    fitnessActionTabRefs.current[tab.id] = node;
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectFitnessAction(tab.id)}
                  className={`flex h-11 min-w-[3rem] shrink-0 flex-col items-center justify-center gap-0.5 px-2 text-[10px] font-semibold leading-none outline-none transition ${
                    isSelected
                      ? "text-white/88"
                      : "text-white/42 hover:text-white/68"
                  } focus-visible:text-white/80 focus-visible:ring-1 focus-visible:ring-white/16`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="whitespace-nowrap text-center leading-[1.05]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          aria-label="Next Fitness tab"
          onClick={(event) => {
            event.preventDefault();
            selectFitnessActionByOffset(1);
          }}
          className="absolute right-0 top-0 z-10 flex h-11 w-4 items-center justify-center bg-black/42 text-white/34 outline-none transition hover:text-white/58 focus-visible:text-white/76 focus-visible:ring-1 focus-visible:ring-white/14"
        >
          <ChevronRight className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderFitnessExerciseBrowser() {
    return (
      <div className="mt-3 space-y-2">
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090909]">
          {selectedFitnessWorkoutExercises.length > 0 ? (
            <div className="flex min-h-9 items-center gap-2 border-b border-white/[0.055] bg-white/[0.035] px-3 text-xs font-semibold text-white/62">
              <Check className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {selectedFitnessWorkoutExercises.length} selected
              </span>
              <span className="shrink-0 text-white/34">· Current workout</span>
            </div>
          ) : null}
          {FITNESS_MOVEMENT_GROUP_SAMPLES.map((movementGroup) => {
            const isGroupOpen = expandedFitnessMovementGroups.has(movementGroup.label);
            const isFirstGroup =
              movementGroup.label === FITNESS_MOVEMENT_GROUP_SAMPLES[0]?.label;
            const movementExerciseCount = movementGroup.subcategories.reduce(
              (count, subcategory) => count + subcategory.exercises.length,
              0,
            );
            const MovementIcon = movementGroup.icon;

            return (
              <Fragment key={movementGroup.label}>
                <button
                  type="button"
                  aria-expanded={isGroupOpen}
                  onClick={() => {
                    setExpandedFitnessMovementGroups((currentGroups) => {
                      const nextGroups = new Set(currentGroups);

                      if (nextGroups.has(movementGroup.label)) {
                        nextGroups.delete(movementGroup.label);
                      } else {
                        nextGroups.add(movementGroup.label);
                      }

                      return nextGroups;
                    });
                    setExpandedFitnessSubcategories((currentSubcategories) => {
                      const nextSubcategories = new Set(currentSubcategories);
                      const subcategoryPrefix = `${movementGroup.label}::`;

                      currentSubcategories.forEach((subcategoryKey) => {
                        if (subcategoryKey.startsWith(subcategoryPrefix)) {
                          nextSubcategories.delete(subcategoryKey);
                        }
                      });

                      return nextSubcategories;
                    });
                  }}
                  className={`flex h-11 w-full items-center gap-3 border-t px-3 text-left outline-none transition ${
                    selectedFitnessWorkoutExercises.length > 0 || !isFirstGroup
                      ? "border-white/[0.055]"
                      : "border-transparent"
                  } ${
                    isGroupOpen
                      ? "bg-white/[0.035] text-white/90"
                      : "text-white/62 hover:bg-white/[0.026] hover:text-white/82"
                  } focus-visible:bg-white/[0.06]`}
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 stroke-[1.65] transition ${
                      isGroupOpen ? "rotate-90 text-white/58" : "text-white/32"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.055] bg-white/[0.045] text-white/58">
                      <MovementIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 truncate">{movementGroup.label}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-white/[0.05] bg-white/[0.035] px-2 py-0.5 text-[11px] font-semibold text-white/38">
                    {movementExerciseCount}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isGroupOpen ? (
                    <motion.div
                      key={`${movementGroup.label}-fitness-subcategories`}
                      initial={{ height: 0, opacity: 0, y: -2 }}
                      animate={{ height: "auto", opacity: 1, y: 0 }}
                      exit={{ height: 0, opacity: 0, y: -2 }}
                      transition={nutritionBrowseAccordionTransition}
                      className="overflow-hidden"
                    >
                      {movementGroup.subcategories.map((subcategory) => {
                        const exercises = subcategory.exercises
                          .map((exerciseName) => FITNESS_EXERCISE_SAMPLE_BY_NAME.get(exerciseName))
                          .filter(
                            (exercise): exercise is FitnessExerciseSample => Boolean(exercise),
                          );
                        const subcategoryKey = `${movementGroup.label}::${subcategory.label}`;
                        const isSubcategoryOpen =
                          expandedFitnessSubcategories.has(subcategoryKey);

                        return (
                          <div key={`${movementGroup.label}-${subcategory.label}`}>
                            <button
                              type="button"
                              aria-expanded={isSubcategoryOpen}
                              onClick={() =>
                                setExpandedFitnessSubcategories((currentSubcategories) => {
                                  const nextSubcategories = new Set(currentSubcategories);

                                  if (nextSubcategories.has(subcategoryKey)) {
                                    nextSubcategories.delete(subcategoryKey);
                                  } else {
                                    nextSubcategories.add(subcategoryKey);
                                  }

                                  return nextSubcategories;
                                })
                              }
                              className={`flex h-9 w-full items-center justify-between gap-3 border-t border-white/[0.045] pl-10 pr-3 text-left outline-none transition ${
                                isSubcategoryOpen
                                  ? "bg-white/[0.032] text-white/78"
                                  : "bg-white/[0.018] text-white/56 hover:bg-white/[0.026] hover:text-white/74"
                              } focus-visible:bg-white/[0.05]`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <ChevronRight
                                  className={`h-3.5 w-3.5 shrink-0 stroke-[1.7] transition ${
                                    isSubcategoryOpen
                                      ? "rotate-90 text-white/54"
                                      : "text-white/28"
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 truncate text-xs font-semibold">
                                  {subcategory.label}
                                </span>
                              </span>
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/26">
                                {exercises.length}
                              </span>
                            </button>
                            <AnimatePresence initial={false}>
                              {isSubcategoryOpen ? (
                                <motion.div
                                  key={`${subcategoryKey}-fitness-exercises`}
                                  initial={{ height: 0, opacity: 0, y: -2 }}
                                  animate={{ height: "auto", opacity: 1, y: 0 }}
                                  exit={{ height: 0, opacity: 0, y: -2 }}
                                  transition={nutritionBrowseAccordionTransition}
                                  className="overflow-hidden"
                                >
                                  {exercises.map((exercise) => {
                                    const isSelected = selectedFitnessWorkoutExercises.some(
                                      (selectedExercise) =>
                                        selectedExercise.name === exercise.name,
                                    );
                                    const isFavorite = favoriteFitnessExerciseIds.has(
                                      exercise.name,
                                    );

                                    return (
                                      <div
                                        key={exercise.name}
                                        className={`flex min-h-14 w-full items-center gap-2.5 border-t border-white/[0.04] px-3 py-2 text-left transition ${
                                          isSelected
                                            ? "bg-white/[0.07] shadow-[inset_3px_0_0_rgba(255,255,255,0.68)]"
                                            : "hover:bg-white/[0.022]"
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          aria-label={
                                            isFavorite
                                              ? `Remove ${exercise.name} from favorites`
                                              : `Add ${exercise.name} to favorites`
                                          }
                                          aria-pressed={isFavorite}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            toggleFavoriteFitnessExercise(exercise.name);
                                          }}
                                          className={`flex h-8 w-7 shrink-0 items-center justify-center outline-none transition focus-visible:ring-1 focus-visible:ring-white/16 ${
                                            isFavorite
                                              ? "text-[#f8d36b]"
                                              : "text-white/42 hover:text-white/78"
                                          }`}
                                        >
                                          <Star
                                            className={`h-4 w-4 ${
                                              isFavorite ? "fill-current" : ""
                                            }`}
                                            aria-hidden="true"
                                          />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                          <span className="flex min-w-0 items-center gap-1.5">
                                            {isSelected ? (
                                              <Check
                                                className="h-3.5 w-3.5 shrink-0 text-white/68"
                                                aria-hidden="true"
                                              />
                                            ) : null}
                                            <span className="block truncate text-sm font-semibold text-white/84">
                                              {exercise.name}
                                            </span>
                                          </span>
                                          <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                                            {exercise.movementType} · {exercise.equipment} ·{" "}
                                            {exercise.primaryArea}
                                          </span>
                                          {isSelected
                                            ? renderFitnessWorkoutDetailControls(exercise)
                                            : null}
                                        </div>
                                        <button
                                          type="button"
                                          aria-label={
                                            isSelected
                                              ? `Remove ${exercise.name} from current workout`
                                              : `Add ${exercise.name} to current workout`
                                          }
                                          aria-pressed={isSelected}
                                          onClick={() => toggleFitnessWorkoutExercise(exercise)}
                                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border outline-none transition focus-visible:ring-1 focus-visible:ring-white/16 ${
                                            isSelected
                                              ? "border-white/[0.14] bg-white/[0.12] text-white/82 hover:border-white/[0.2] hover:bg-white/[0.16] hover:text-white"
                                              : "border-white/[0.08] bg-white/[0.08] text-white/76 hover:border-white/[0.14] hover:bg-white/[0.13] hover:text-white"
                                          }`}
                                        >
                                          {isSelected ? (
                                            <Check className="h-4 w-4" aria-hidden="true" />
                                          ) : (
                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                          )}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  function renderFitnessFavoritesBrowser() {
    const favoriteExercises = FITNESS_EXERCISE_SAMPLES.filter((exercise) =>
      favoriteFitnessExerciseIds.has(exercise.name),
    );

    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/82">Favorites</p>
            <p className="mt-0.5 text-xs font-medium text-white/38">

            </p>
          </div>
        </div>
        {favoriteExercises.length > 0 ? (
          <div className="space-y-1.5">
            {favoriteExercises.map((exercise) => {
              const isSelected = selectedFitnessWorkoutExercises.some(
                (selectedExercise) => selectedExercise.name === exercise.name,
              );

              return (
                <div
                  key={exercise.name}
                  className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
                    isSelected
                      ? "border-white/[0.11] bg-white/[0.065]"
                      : "border-white/[0.055] bg-black/42"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Remove ${exercise.name} from favorites`}
                    aria-pressed={true}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavoriteFitnessExercise(exercise.name);
                    }}
                    className="flex h-8 w-7 shrink-0 items-center justify-center text-[#f8d36b] outline-none transition hover:text-[#f8d36b]/85 focus-visible:ring-1 focus-visible:ring-white/16"
                  >
                    <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/84">
                      {exercise.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-white/40">
                      {exercise.movementType} · {exercise.equipment} · {exercise.primaryArea}
                    </p>
                    {isSelected ? renderFitnessWorkoutDetailControls(exercise) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={
                      isSelected
                        ? `Remove ${exercise.name} from current workout`
                        : `Add ${exercise.name} to current workout`
                    }
                    aria-pressed={isSelected}
                    onClick={() => toggleFitnessWorkoutExercise(exercise)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border outline-none transition focus-visible:ring-1 focus-visible:ring-white/16 ${
                      isSelected
                        ? "border-white/[0.14] bg-white/[0.12] text-white/82 hover:border-white/[0.2] hover:bg-white/[0.16] hover:text-white"
                        : "border-white/[0.08] bg-white/[0.08] text-white/76 hover:border-white/[0.14] hover:bg-white/[0.13] hover:text-white"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/34 px-3 py-3 text-xs font-medium text-white/42">
            No favorite exercises yet. Star exercises from the Exercises tab.
          </div>
        )}
      </div>
    );
  }

  function renderFitnessCustomIntro() {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/42 p-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.055] text-white/62">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/82">Custom fitness log</p>
            <p className="mt-1 text-xs font-medium leading-5 text-white/42">
              Review selected exercises or enter a manual workout before saving.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function renderFitnessRoutineBrowser() {
    return (
      <div className="mt-3 space-y-2">
        <div className="px-1">
          <p className="text-sm font-semibold text-white/82">Routines</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090909]">
          {FITNESS_ROUTINE_GROUPS.map((routineGroup, groupIndex) => {
            const isGroupOpen = expandedFitnessRoutineGroups.has(routineGroup.id);

            return (
              <Fragment key={routineGroup.id}>
                <button
                  type="button"
                  aria-expanded={isGroupOpen}
                  onClick={() => {
                    setExpandedFitnessRoutineGroups((currentGroups) => {
                      const nextGroups = new Set(currentGroups);
                      if (nextGroups.has(routineGroup.id)) nextGroups.delete(routineGroup.id);
                      else nextGroups.add(routineGroup.id);
                      return nextGroups;
                    });
                  }}
                  className={`flex h-11 w-full items-center gap-3 px-3 text-left outline-none transition ${
                    groupIndex > 0 ? "border-t border-white/[0.055]" : ""
                  } ${
                    isGroupOpen
                      ? "bg-white/[0.035] text-white/90"
                      : "text-white/62 hover:bg-white/[0.026] hover:text-white/82"
                  } focus-visible:bg-white/[0.06]`}
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 stroke-[1.65] transition ${
                      isGroupOpen ? "rotate-90 text-white/58" : "text-white/32"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {routineGroup.title}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-white/38">
                    {routineGroup.routines.length} routines
                  </span>
                </button>
                {isGroupOpen ? (
                  <div className="space-y-2 border-t border-white/[0.045] bg-black/20 p-2">
                    {routineGroup.routines.map((routine) => (
                      <div
                        key={routine.id}
                        className="rounded-xl border border-white/[0.055] bg-black/42 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white/86">{routine.title}</p>
                            <p className="mt-1 text-xs font-medium text-white/42">
                              {routine.goal} · {routine.equipment} · {routine.durationMinutes} min
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => selectFitnessRoutine(routine)}
                            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.07] px-2.5 text-xs font-semibold text-white/72 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.11] hover:text-white/90 focus-visible:ring-1 focus-visible:ring-white/16"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Use
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  function renderFitnessPlanBrowser() {
    const selectedFitnessPlan = FITNESS_PLAN_TEMPLATES.find(
      (plan) => plan.id === selectedFitnessPlanName,
    );
    const isSelectedFitnessPlanReady = isFitnessPlanSetupReady(selectedFitnessPlanSetup);
    const selectedFitnessPlanSessions =
      selectedFitnessPlan && isSelectedFitnessPlanReady
        ? resolveFitnessPlanRoutineSequence(selectedFitnessPlan)
        : [];

    function formatFitnessPlanLabel(value: string) {
      return value
        .split(" ")
        .map((word) => (word === "/" ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
        .join(" ");
    }

    function getFitnessPlanDaysLabel(daysPerWeek: number[]) {
      const firstDay = daysPerWeek[0];
      const lastDay = daysPerWeek[daysPerWeek.length - 1];

      if (!firstDay) return "Days/week";
      if (firstDay === lastDay) return `${firstDay} days/week`;

      return `${firstDay}-${lastDay} days/week`;
    }

    function renderFitnessPlanOptionButton<T extends string | number>(
      label: string,
      value: T,
      selectedValue: T | undefined,
      onSelect: (value: T) => void,
    ) {
      const isSelected = selectedValue === value;

      return (
        <button
          key={String(value)}
          type="button"
          onClick={() => onSelect(value)}
          className={cn(
            "flex h-8 items-center justify-center rounded-lg border px-2.5 text-[11px] font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-white/18",
            isSelected
              ? "border-emerald-200/[0.26] bg-emerald-200/[0.14] text-emerald-50/88"
              : "border-white/[0.06] bg-black/24 text-white/52 hover:border-white/[0.11] hover:bg-white/[0.055] hover:text-white/78",
          )}
        >
          {label}
        </button>
      );
    }

    function renderFitnessPlanOptionGroup(children: ReactNode, label: string) {
      return (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/38">
            {label}
          </p>
          <div className="flex flex-wrap gap-1.5">{children}</div>
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        <div className="px-1">
          <p className="text-sm font-semibold text-white/82">Plans</p>
          <p className="mt-0.5 text-xs font-medium text-white/38">
            Indefinite training systems personalized into local workout cycles.
          </p>
        </div>
        {selectedFitnessPlan ? (
          <div className="rounded-xl border border-emerald-300/[0.18] bg-emerald-300/[0.07] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100/48">
                  Plan setup
                </p>
                <p className="mt-1 text-sm font-semibold text-white/88">
                  {selectedFitnessPlan.title}
                </p>
                <p className="mt-1 text-xs font-medium text-white/46">
                  {selectedFitnessPlan.description}
                </p>
              </div>
              {isSelectedFitnessPlanReady ? (
                <span className="shrink-0 rounded-full border border-emerald-200/[0.16] bg-emerald-200/[0.1] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-50/58">
                  Ready
                </span>
              ) : null}
            </div>
            <div className="mt-3 space-y-3">
              {renderFitnessPlanOptionGroup(
                [selectedFitnessPlan.goal].map((goal) =>
                  renderFitnessPlanOptionButton(
                    formatFitnessPlanLabel(goal),
                    goal,
                    selectedFitnessPlanSetup.goal,
                    (value) => updateSelectedFitnessPlanSetup("goal", value),
                  ),
                ),
                "Goal",
              )}
              {renderFitnessPlanOptionGroup(
                [selectedFitnessPlan.level].map((level) =>
                  renderFitnessPlanOptionButton(
                    formatFitnessPlanLabel(level),
                    level,
                    selectedFitnessPlanSetup.level,
                    (value) => updateSelectedFitnessPlanSetup("level", value),
                  ),
                ),
                "Level",
              )}
              {renderFitnessPlanOptionGroup(
                [selectedFitnessPlan.equipment].map((equipment) =>
                  renderFitnessPlanOptionButton(
                    formatFitnessPlanLabel(equipment),
                    equipment,
                    selectedFitnessPlanSetup.equipment,
                    (value) => updateSelectedFitnessPlanSetup("equipment", value),
                  ),
                ),
                "Equipment",
              )}
              {renderFitnessPlanOptionGroup(
                selectedFitnessPlan.daysPerWeekOptions.map((daysPerWeek) =>
                  renderFitnessPlanOptionButton(
                    `${daysPerWeek} days/week`,
                    daysPerWeek,
                    selectedFitnessPlanSetup.daysPerWeek,
                    (value) => updateSelectedFitnessPlanSetup("daysPerWeek", value),
                  ),
                ),
                "Days/week",
              )}
              {renderFitnessPlanOptionGroup(
                selectedFitnessPlan.sessionLengthOptions.map((sessionLength) =>
                  renderFitnessPlanOptionButton(
                    `${sessionLength} min`,
                    sessionLength,
                    selectedFitnessPlanSetup.sessionLength,
                    (value) => updateSelectedFitnessPlanSetup("sessionLength", value),
                  ),
                ),
                "Session length",
              )}
            </div>
            <p className="mt-3 rounded-lg border border-white/[0.055] bg-black/18 px-2.5 py-2 text-[11px] font-medium leading-5 text-white/44">
              Routines repeat in order as the plan&apos;s workout cycle.
            </p>
            {isSelectedFitnessPlanReady ? (
              <div className="mt-3 rounded-lg border border-white/[0.055] bg-black/24 p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/82">
                      {selectedFitnessPlan.title}
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-5 text-white/42">
                      {formatFitnessPlanLabel(selectedFitnessPlanSetup.goal)} ·{" "}
                      {formatFitnessPlanLabel(selectedFitnessPlanSetup.level)} ·{" "}
                      {formatFitnessPlanLabel(selectedFitnessPlanSetup.equipment)} ·{" "}
                      {selectedFitnessPlanSetup.daysPerWeek} days/week ·{" "}
                      {selectedFitnessPlanSetup.sessionLength} min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadFirstFitnessPlanWorkout(selectedFitnessPlan)}
                    className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200/[0.18] bg-emerald-200/[0.12] px-2.5 text-xs font-semibold text-emerald-50/82 outline-none transition hover:border-emerald-100/[0.28] hover:bg-emerald-200/[0.17] hover:text-white focus-visible:ring-1 focus-visible:ring-emerald-100/24"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Load first workout
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {selectedFitnessPlanSessions.map((routine, sessionIndex) => (
                    <div
                      key={`${selectedFitnessPlan.id}-${routine.id}-${sessionIndex}`}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.03] px-2.5 py-2"
                    >
                      <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[11px] font-semibold text-white/58">
                        {sessionIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white/66">
                          Session {sessionIndex + 1}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-white/34">
                          {routine.title}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          {FITNESS_PLAN_TEMPLATES.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl border border-white/[0.055] bg-black/42 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white/86">{plan.title}</p>
                  <p className="mt-1 text-xs font-medium text-white/42">
                    {plan.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startFitnessPlan(plan)}
                  className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.07] px-2.5 text-xs font-semibold text-white/72 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.11] hover:text-white/90 focus-visible:ring-1 focus-visible:ring-white/16"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Start Plan
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-white/[0.05] bg-white/[0.035] px-2 py-1 text-[11px] font-medium leading-none text-white/50">
                  {formatFitnessPlanLabel(plan.equipment)}
                </span>
                <span className="rounded-full border border-white/[0.05] bg-white/[0.035] px-2 py-1 text-[11px] font-medium leading-none text-white/50">
                  {formatFitnessPlanLabel(plan.level)}
                </span>
                <span className="rounded-full border border-white/[0.05] bg-white/[0.035] px-2 py-1 text-[11px] font-medium leading-none text-white/50">
                  {getFitnessPlanDaysLabel([...plan.daysPerWeekOptions])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderFitnessWorkoutDetailControls(exercise: FitnessExerciseSample) {
    const detail = getFitnessWorkoutExerciseDetail(
      exercise,
      fitnessWorkoutExerciseDetailsById,
    );
    const sets = getPositiveFitnessDetailValue(detail.sets);
    const reps = getPositiveFitnessDetailValue(detail.reps);

    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {renderFitnessDetailStepper(exercise, "sets", "Sets", sets)}
        {renderFitnessDetailStepper(exercise, "reps", "Reps", reps)}
      </div>
    );
  }

  function renderFitnessWorkoutReviewContent() {
    const currentWorkoutName = getCurrentFitnessWorkoutName();

    return (
      <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/42 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/82">{currentWorkoutName}</p>
            <p className="mt-0.5 text-xs font-medium text-white/38">
              {selectedFitnessWorkoutExercises.length} selected
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsFitnessWorkoutReviewOpen(false);
              void hapticSnap();
            }}
            className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.045] px-2.5 py-1.5 text-xs font-semibold text-white/58 outline-none transition hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/16"
          >
            Back to Workout
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {selectedFitnessWorkoutExercises.map((exercise) => {
            const detail = getFitnessWorkoutLogDetail(exercise);
            const usesDuration = shouldUseFitnessDurationDetail(exercise);
            const showWeight = shouldShowFitnessWeightField(exercise);

            return (
              <div
                key={exercise.name}
                className="rounded-lg border border-white/[0.045] bg-white/[0.035] p-2.5"
              >
                <p className="truncate text-xs font-semibold text-white/80">
                  {exercise.name}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/32">
                      Sets
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={detail.sets}
                      onChange={(event) =>
                        updateFitnessWorkoutLogDetail(exercise, "sets", event.target.value)
                      }
                      className="h-9 w-full rounded-lg border border-white/[0.06] bg-black/30 px-2 text-xs font-semibold text-white/82 outline-none transition placeholder:text-white/24 focus-visible:border-white/[0.15] focus-visible:ring-1 focus-visible:ring-white/12"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/32">
                      {usesDuration ? "Duration" : "Reps"}
                    </span>
                    <input
                      type="text"
                      value={usesDuration ? detail.duration : detail.reps}
                      onChange={(event) =>
                        updateFitnessWorkoutLogDetail(
                          exercise,
                          usesDuration ? "duration" : "reps",
                          event.target.value,
                        )
                      }
                      className="h-9 w-full rounded-lg border border-white/[0.06] bg-black/30 px-2 text-xs font-semibold text-white/82 outline-none transition placeholder:text-white/24 focus-visible:border-white/[0.15] focus-visible:ring-1 focus-visible:ring-white/12"
                    />
                  </label>
                  {showWeight ? (
                    <label className="min-w-0 sm:col-span-2">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/32">
                        Weight
                      </span>
                      <input
                        type="text"
                        value={detail.weight}
                        onChange={(event) =>
                          updateFitnessWorkoutLogDetail(
                            exercise,
                            "weight",
                            event.target.value,
                          )
                        }
                        placeholder="Optional"
                        className="h-9 w-full rounded-lg border border-white/[0.06] bg-black/30 px-2 text-xs font-semibold text-white/82 outline-none transition placeholder:text-white/24 focus-visible:border-white/[0.15] focus-visible:ring-1 focus-visible:ring-white/12"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={logReviewedFitnessWorkout}
          disabled={isSubmitting || selectedFitnessWorkoutExercises.length === 0}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.13] px-3 text-sm font-semibold text-white/88 outline-none transition hover:border-white/[0.16] hover:bg-white/[0.17] focus-visible:ring-1 focus-visible:ring-white/16 disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:bg-white/[0.025] disabled:text-white/28"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? "Saving..." : "Log workout"}
        </button>
      </div>
    );
  }

  function renderFitnessStartContent() {
    const hasSelectedWorkoutExercises = selectedFitnessWorkoutExercises.length > 0;
    const currentWorkoutName = getCurrentFitnessWorkoutName();

    if (isFitnessWorkoutReviewOpen && hasSelectedWorkoutExercises) {
      return renderFitnessWorkoutReviewContent();
    }

    return (
      <div className="mt-3">
        <div className="rounded-xl border border-white/[0.055] bg-black/42 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.055] text-white/62">
                <Dumbbell className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/82">Current Workout</p>
                {hasSelectedWorkoutExercises ? (
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="min-w-0 truncate text-xs font-semibold text-white/58">
                      {currentWorkoutName}
                    </p>
                    <p className="text-xs font-medium text-white/34">
                      {selectedFitnessWorkoutExercises.length} selected
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            {hasSelectedWorkoutExercises ? (
              <button
                type="button"
                onClick={clearFitnessWorkoutExercises}
                className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.045] px-2.5 py-1.5 text-xs font-semibold text-white/58 outline-none transition hover:border-white/[0.1] hover:bg-white/[0.08] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/16"
              >
                Clear
              </button>
            ) : null}
          </div>

          {hasSelectedWorkoutExercises ? (
            <div className="mt-3 space-y-1.5">
              {selectedFitnessWorkoutExercises.map((exercise) => {
                const detail = getFitnessWorkoutExerciseDetail(
                  exercise,
                  fitnessWorkoutExerciseDetailsById,
                );
                const weight =
                  fitnessWorkoutLogDetailsById[
                    getFitnessExerciseId(exercise)
                  ]?.weight ?? "";
                const metadata = formatFitnessWorkoutExerciseDetail(
                  detail,
                  weight,
                );

                return (
                  <div
                    key={exercise.name}
                    className="rounded-lg border border-white/[0.045] bg-white/[0.035] px-2.5 py-2"
                  >
                    <div className="flex min-h-8 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white/78">
                          {exercise.name}
                        </p>
                        {metadata ? (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-white/36">
                            {metadata}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${exercise.name} from current workout`}
                        onClick={() => removeFitnessWorkoutExercise(exercise.name)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-white/[0.06] bg-white/[0.025] px-3 py-3 text-center text-xs font-medium leading-5 text-white/40">
              Build this workout from Exercises, Favorites, or Routines.
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => selectFitnessAction("exercises")}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.045] px-1.5 text-[11px] font-semibold text-white/64 outline-none transition hover:border-white/[0.11] hover:bg-white/[0.08] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/16"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Exercises
            </button>
            <button
              type="button"
              onClick={() => selectFitnessAction("favorites")}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.045] px-1.5 text-[11px] font-semibold text-white/64 outline-none transition hover:border-white/[0.11] hover:bg-white/[0.08] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/16"
            >
              <Star className="h-4 w-4" aria-hidden="true" />
              Favorites
            </button>
            <button
              type="button"
              onClick={() => selectFitnessAction("workout-routines")}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.045] px-1.5 text-[11px] font-semibold text-white/64 outline-none transition hover:border-white/[0.11] hover:bg-white/[0.08] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/16"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Routines
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={startSelectedFitnessWorkout}
              disabled={!hasSelectedWorkoutExercises}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.42] bg-white/70 px-2 text-xs font-semibold text-zinc-900 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(0,0,0,0.12)] outline-none backdrop-blur-xl transition hover:border-white/[0.58] hover:bg-white/80 hover:text-black active:bg-white/65 focus-visible:ring-1 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.06] disabled:text-white/28 disabled:shadow-none"
            >
              <Dumbbell className="h-4 w-4" aria-hidden="true" />
              Start
            </button>
            <button
              type="button"
              onClick={reviewSelectedFitnessWorkout}
              disabled={!hasSelectedWorkoutExercises}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.14] bg-zinc-800/72 px-2 text-xs font-semibold text-white/88 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(0,0,0,0.32)] outline-none backdrop-blur-xl transition hover:border-white/[0.2] hover:bg-zinc-700/78 hover:text-white active:bg-zinc-800/82 focus-visible:ring-1 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:bg-white/[0.025] disabled:text-white/28 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Review &amp; log
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderFitnessTabContent() {
    return (
      <div>
        {renderFitnessActionTabs()}
        {selectedFitnessAction === "start" ? (
          renderFitnessStartContent()
        ) : selectedFitnessAction === "exercises" ? (
          renderFitnessExerciseBrowser()
        ) : selectedFitnessAction === "favorites" ? (
          renderFitnessFavoritesBrowser()
        ) : selectedFitnessAction === "custom" ? (
          renderFitnessCustomIntro()
        ) : selectedFitnessAction === "workout-routines" ? (
          renderFitnessRoutineBrowser()
        ) : selectedFitnessAction === "plans" ? (
          renderFitnessPlanBrowser()
        ) : null}
      </div>
    );
  }

  function renderNutritionDailyProgress() {
    if (!shouldRenderNutritionDailyProgress) return null;

    return (
      <NutritionDailyProgressBars
        savedTotals={nutritionDailyProgress}
        previewTotals={nutritionDailyPreviewTotals}
        error={nutritionDailyTotalsError}
        isAnimatedIn={isNutritionProgressAnimatedIn}
        shouldReduceMotion={shouldReduceNutritionMotion}
      />
    );
  }

  function renderNutritionServingSelector({
    id,
    label,
    amount,
    unit,
    options,
    onChange,
    compact = false,
    stopPropagation = false,
  }: {
    id: string;
    label: string;
    amount: number;
    unit: NutritionServingUnit;
    options: NutritionServingOption[];
    onChange: (nextAmount: number, nextUnit: NutritionServingUnit) => void;
    compact?: boolean;
    stopPropagation?: boolean;
  }) {
    const heightClassName = "h-8";
    const buttonSizeClassName = "h-8 w-7";
    const amountWidthClassName = compact ? "w-8" : "w-9";
    const safeOptions =
      options.length > 0 ? options : [{ value: "serving", label: "serving" }];
    const requestedUnit = normalizeNutritionServingUnit(unit);
    const normalizedUnit = safeOptions.some((option) => option.value === requestedUnit)
      ? requestedUnit
      : safeOptions[0].value;
    const menuId = `nutrition-serving-unit-${id}`;
    const isUnitMenuOpen = openNutritionServingUnitMenu?.id === menuId;
    const unitMenuPosition = isUnitMenuOpen ? openNutritionServingUnitMenu : null;

    return (
      <div
        data-nutrition-serving-picker
        className="relative flex max-w-[8.75rem] shrink-0 items-center rounded-lg border border-white/[0.07] bg-black/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      >
        <button
          type="button"
          aria-label={`Decrease ${label} amount`}
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            onChange(getNextWholeNutritionQuantity(amount, -1), normalizedUnit);
          }}
          className={`flex ${buttonSizeClassName} items-center justify-center text-white/48 outline-none transition hover:bg-white/[0.07] hover:text-white/80 focus-visible:bg-white/[0.08] focus-visible:text-white`}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={formatNutritionServingAmount(amount)}
          onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
          onChange={(event) => onChange(Number(event.target.value), normalizedUnit)}
          aria-label={`${label} amount`}
          className={`${heightClassName} ${amountWidthClassName} border-x border-white/[0.055] bg-transparent px-0.5 text-center text-xs font-semibold tabular-nums text-white/84 outline-none`}
        />
        <div className="relative border-r border-white/[0.055]">
          <button
            type="button"
            aria-label={`${label} unit`}
            aria-expanded={isUnitMenuOpen}
            aria-controls={menuId}
            onClick={(event) => {
              if (stopPropagation) event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              const menuHeight = Math.min(224, safeOptions.length * 32 + 8);
              const shouldOpenAbove = rect.bottom + menuHeight + 8 > window.innerHeight;
              const top = shouldOpenAbove
                ? Math.max(8, rect.top - menuHeight - 5)
                : rect.bottom + 5;

              setOpenNutritionServingUnitMenu((currentMenu) =>
                currentMenu?.id === menuId
                  ? null
                  : {
                      id: menuId,
                      top,
                      right: Math.max(8, window.innerWidth - rect.right),
                    },
              );
            }}
            className={`${heightClassName} min-w-7 max-w-[3.2rem] truncate bg-[#101010] px-1.5 text-center text-xs font-semibold text-white/72 outline-none transition hover:bg-white/[0.07] focus-visible:bg-white/[0.08]`}
          >
            {normalizedUnit}
          </button>
        </div>
        {unitMenuPosition && typeof document !== "undefined"
          ? createPortal(
              <div
                id={menuId}
                data-nutrition-serving-picker
                role="menu"
                className="fixed z-[80] max-h-56 min-w-[4.5rem] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#101010] py-1 shadow-[0_16px_32px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.045)]"
                style={{
                  top: unitMenuPosition.top,
                  right: unitMenuPosition.right,
                }}
                onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
              >
                {safeOptions.map((option) => {
                  const isSelected = option.value === normalizedUnit;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={(event) => {
                        if (stopPropagation) event.stopPropagation();
                        onChange(amount, option.value);
                        setOpenNutritionServingUnitMenu(null);
                      }}
                      className={`flex h-8 w-full items-center justify-between gap-2 px-2.5 text-left text-xs font-semibold outline-none transition ${
                        isSelected
                          ? "bg-white/[0.08] text-white/86"
                          : "text-white/58 hover:bg-white/[0.055] hover:text-white/78 focus-visible:bg-white/[0.07] focus-visible:text-white/84"
                      }`}
                    >
                      <span>{option.label}</span>
                      {isSelected ? (
                        <Check className="h-3 w-3 text-white/58" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
        <button
          type="button"
          aria-label={`Increase ${label} amount`}
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            onChange(getNextWholeNutritionQuantity(amount, 1), normalizedUnit);
          }}
          className={`flex ${buttonSizeClassName} items-center justify-center text-white/48 outline-none transition hover:bg-white/[0.07] hover:text-white/80 focus-visible:bg-white/[0.08] focus-visible:text-white`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderNutritionFoodQuantityControl(item: NutritionSelectedFoodItem) {
    return renderNutritionServingSelector({
      id: `food-${item.food.id}`,
      label: item.food.name,
      amount: item.quantity,
      unit: getSafeFoodServingUnit(item.food, item.servingUnit),
      options: getFoodServingOptions(item.food),
      onChange: (amount, servingUnit) =>
        updateNutritionSelectedFoodServing(item.food, amount, servingUnit),
      compact: true,
      stopPropagation: true,
    });
  }

  function renderNutritionGroceryDeductionControl(item: NutritionSelectedFoodItem) {
    const deduction = item.groceryDeduction;
    if (!deduction) return null;

    const remainingPreview = parseGroceryInventoryNumber(deduction.amount);
    const nextRemaining =
      remainingPreview === null
        ? null
        : Math.max(0, deduction.currentQuantity - remainingPreview);
    const deductionGramHelper = getGroceryDeductionGramHelper(
      getRecordMetadata(item.food.metadata),
      remainingPreview,
      deduction.inventoryUnit,
    );
    const deductionUnitLabel = getGroceryNaturalUnitLabel(
      getRecordMetadata(item.food.metadata),
      remainingPreview ?? 2,
      deduction.inventoryUnit,
    );

    return (
      <div className="mt-2 block min-w-0 rounded-lg border border-white/[0.045] bg-white/[0.025] px-2 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold text-white/42">
            Deduct from Grocery
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-white/72">
            {deduction.amount}
          </span>
          <span className="shrink-0 text-xs font-semibold text-white/58">
            {deductionUnitLabel}
          </span>
          {nextRemaining !== null ? (
            <span className="min-w-0 truncate text-[11px] font-medium text-white/34">
              {formatFoodNutritionNumber(nextRemaining) ?? nextRemaining} left
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[11px] font-medium text-white/38">
          {deductionGramHelper}
        </span>
      </div>
    );
  }

  function renderGrocerySelectedFoodDetail(item: NutritionSelectedFoodItem) {
    const { food } = item;
    const isGrocerySearchContext =
      isGroceryDatabase && selectedNutritionFoodAction === "search";
    const shouldRenderEditableServingPicker = !isGrocerySearchContext;
    const groceryNameValue =
      typeof entryFormValues[ON_HAND_NAME_FIELD_ID] === "string"
        ? entryFormValues[ON_HAND_NAME_FIELD_ID]
        : food.name;
    const groceryBrandValue =
      typeof entryFormValues.brand_name === "string"
        ? entryFormValues.brand_name
        : food.brand_name ?? "";
    const metadata = getRecordMetadata(food.metadata);
    const packageLine = getGroceryScanPackageLine(metadata);
    const detectedInventoryLine = getGroceryScanDetectedInventoryLine(metadata);
    const nutritionInputClassName =
      "mt-1.5 h-9 w-full rounded-lg border border-white/[0.055] bg-black/28 px-2.5 text-sm font-semibold tabular-nums text-white outline-none transition placeholder:text-white/26 selection:bg-white/[0.18] hover:border-white/[0.09] hover:bg-black/34 focus-visible:border-white/[0.14] focus-visible:bg-black/38 focus-visible:ring-1 focus-visible:ring-white/12";
    const textInputClassName =
      "mt-1.5 h-9 w-full rounded-lg border border-white/[0.055] bg-black/28 px-2.5 text-sm font-semibold text-white outline-none transition placeholder:text-white/26 selection:bg-white/[0.18] hover:border-white/[0.09] hover:bg-black/34 focus-visible:border-white/[0.14] focus-visible:bg-black/38 focus-visible:ring-1 focus-visible:ring-white/12";
    const macroFields: Array<{
      id: string;
      label: string;
      placeholder: string;
    }> = [
      { id: GROCERY_CUSTOM_CARBS_FIELD_ID, label: "Carbs", placeholder: "g" },
      { id: GROCERY_CUSTOM_PROTEIN_FIELD_ID, label: "Protein", placeholder: "g" },
      { id: GROCERY_CUSTOM_FAT_FIELD_ID, label: "Fat", placeholder: "g" },
    ];

    return (
      <div
        key={food.id}
        className="w-full rounded-xl border border-white/[0.07] bg-black/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
      >
        <div className="flex w-full items-start gap-3">
          <NutritionFoodIcon food={food} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug text-white/88">
              {food.name}
            </span>
            {food.brand_name || food.source === "open_food_facts" ? (
              <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
                {[food.brand_name, food.source === "open_food_facts" ? "Barcode scan" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
            {packageLine ? (
              <span className="mt-0.5 block truncate text-[11px] font-semibold text-white/48">
                {packageLine}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            aria-label={`Remove ${food.name}`}
            onClick={() => removeNutritionSelectedFood(food)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
              Food
            </span>
            <input
              type="text"
              value={groceryNameValue}
              onChange={(event) =>
                updateEntryFormValue(ON_HAND_NAME_FIELD_ID, event.target.value)
              }
              className={textInputClassName}
              placeholder="Food name"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
              Brand
            </span>
            <input
              type="text"
              value={groceryBrandValue}
              onChange={(event) => updateEntryFormValue("brand_name", event.target.value)}
              className={textInputClassName}
              placeholder="Brand"
            />
          </label>
        </div>

        <div className="mt-3 rounded-lg border border-white/[0.055] bg-white/[0.035] px-3 py-2.5">
          <div className="grid grid-cols-1 gap-2">
            <label className="block min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
                Calories
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={
                  typeof entryFormValues[GROCERY_CUSTOM_CALORIES_FIELD_ID] === "string"
                    ? entryFormValues[GROCERY_CUSTOM_CALORIES_FIELD_ID]
                    : ""
                }
                onChange={(event) =>
                  updateEntryFormValue(GROCERY_CUSTOM_CALORIES_FIELD_ID, event.target.value)
                }
                className={nutritionInputClassName}
                placeholder="Calories"
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {macroFields.map((macro) => {
              const macroValue = entryFormValues[macro.id];

              return (
                <label
                  key={macro.id}
                  className="block min-w-0 rounded-lg bg-black/24 px-2 py-1.5"
                >
                  <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/32">
                    {macro.label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={typeof macroValue === "string" ? macroValue : ""}
                    onChange={(event) => updateEntryFormValue(macro.id, event.target.value)}
                    className="mt-1 h-8 w-full rounded-md border border-white/[0.045] bg-white/[0.035] px-2 text-sm font-semibold tabular-nums text-white outline-none transition placeholder:text-white/24 selection:bg-white/[0.18] hover:border-white/[0.08] hover:bg-white/[0.05] focus-visible:border-white/[0.13] focus-visible:bg-white/[0.06]"
                    placeholder={macro.placeholder}
                  />
                </label>
              );
            })}
          </div>
        </div>

        {shouldRenderEditableServingPicker ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-white/52">Serving</span>
            {renderNutritionFoodQuantityControl(item)}
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold text-white/52">Nutrition per serving</p>
        )}
        <p className="mt-1 text-[11px] font-medium text-white/38">
          {getGroceryServingGramHelper(metadata)}
        </p>
        {renderGroceryInventoryControls(metadata, detectedInventoryLine, food)}
      </div>
    );
  }

  function renderGroceryInventoryControls(
    sourceMetadata: Record<string, unknown> = getRecordMetadata(entryFormValues.metadata),
    detectedInventoryLine?: string,
    food?: FoodSearchResult,
  ) {
    if (!isGroceryDatabase) {
      return null;
    }

    const quantityValue = entryFormValues[ON_HAND_QUANTITY_FIELD_ID];
    const unitValue = entryFormValues[ON_HAND_UNIT_FIELD_ID];
    const amountValue =
      typeof quantityValue === "number"
        ? formatFoodNutritionNumber(quantityValue) ?? String(quantityValue)
        : typeof quantityValue === "string"
          ? quantityValue
          : "";
    const inventoryUnit = normalizeGroceryInventoryUnit(unitValue);
    const parsedAmount = parseGroceryInventoryNumber(amountValue);
    const gramHelperLine = getGroceryInventoryGramHelper(
      sourceMetadata,
      parsedAmount,
      inventoryUnit,
      { includeQuantity: true },
    );
    const expiresValue =
      typeof entryFormValues[ON_HAND_EXPIRES_ON_FIELD_ID] === "string"
        ? entryFormValues[ON_HAND_EXPIRES_ON_FIELD_ID]
        : "";
    const locationValue =
      typeof entryFormValues[ON_HAND_LOCATION_FIELD_ID] === "string"
        ? entryFormValues[ON_HAND_LOCATION_FIELD_ID]
        : "";
    const locationLabel =
      GROCERY_LOCATION_OPTIONS.find((option) => option.value === locationValue)?.label ??
      (locationValue ? locationValue : "");
    const inventoryChipClassName =
      "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.045] px-2.5 text-xs font-semibold text-white/64 outline-none transition hover:border-white/[0.11] hover:bg-white/[0.07] hover:text-white/84 focus-visible:ring-1 focus-visible:ring-white/16";
    const compactInputClassName =
      "h-8 min-w-0 rounded-lg border border-white/[0.055] bg-black/28 px-2.5 text-xs font-semibold text-white outline-none transition placeholder:text-white/26 selection:bg-white/[0.18] hover:border-white/[0.09] hover:bg-black/34 focus-visible:border-white/[0.14] focus-visible:bg-black/38 focus-visible:ring-1 focus-visible:ring-white/12";

    const toggleInventoryField = (field: "expires" | "location") => {
      void hapticSoftTick();
      setExpandedGroceryInventoryField((currentField) =>
        currentField === field ? null : field,
      );
    };

    return (
      <div className="mt-3 border-t border-white/[0.055] pt-3">
        <div className="mb-2 rounded-lg border border-white/[0.045] bg-white/[0.025] px-2 py-2">
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
              Amount on hand
            </span>
            {detectedInventoryLine ? (
              <span className="min-w-0 truncate text-[11px] font-semibold text-white/40">
                {detectedInventoryLine}
              </span>
            ) : null}
          </div>
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold text-white/46">
              You have
            </span>
            <input
              type="number"
              min={0.01}
              step="any"
              value={amountValue}
              onChange={(event) =>
                updateEntryFormValue(ON_HAND_QUANTITY_FIELD_ID, event.target.value)
              }
              className={`${compactInputClassName} w-24 tabular-nums`}
            />
            <select
              value={inventoryUnit}
              onChange={(event) =>
                updateEntryFormValue(ON_HAND_UNIT_FIELD_ID, event.target.value)
              }
              className={`${compactInputClassName} flex-1`}
            >
              {getGroceryInventoryUnitOptions(food).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1.5 text-[11px] font-medium text-white/38">{gramHelperLine}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {groceryExpirationField ? (
            <button
              type="button"
              aria-expanded={expandedGroceryInventoryField === "expires"}
              onClick={() => toggleInventoryField("expires")}
              className={inventoryChipClassName}
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {expiresValue
                  ? `Expires ${formatDatabaseEntryValue(expiresValue, "date")}`
                  : "Expires"}
              </span>
            </button>
          ) : null}
          {groceryLocationField ? (
            <button
              type="button"
              aria-expanded={expandedGroceryInventoryField === "location"}
              onClick={() => toggleInventoryField("location")}
              className={inventoryChipClassName}
            >
              <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{locationLabel || "Location"}</span>
            </button>
          ) : null}
        </div>

        {expandedGroceryInventoryField === "expires" && groceryExpirationField ? (
          <label className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.045] bg-white/[0.025] px-2 py-1.5">
            <span className="shrink-0 text-[11px] font-semibold text-white/42">
              Expires
            </span>
            <input
              type="date"
              value={expiresValue}
              onChange={(event) =>
                updateEntryFormValue(ON_HAND_EXPIRES_ON_FIELD_ID, event.target.value)
              }
              className={`${compactInputClassName} flex-1`}
            />
          </label>
        ) : null}

        {expandedGroceryInventoryField === "location" && groceryLocationField ? (
          <label className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.045] bg-white/[0.025] px-2 py-1.5">
            <span className="shrink-0 text-[11px] font-semibold text-white/42">
              Location
            </span>
            <select
              value={locationValue}
              onChange={(event) =>
                updateEntryFormValue(ON_HAND_LOCATION_FIELD_ID, event.target.value)
              }
              className={`${compactInputClassName} flex-1`}
            >
              <option value="">Location</option>
              {GROCERY_LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    );
  }

  function renderGroceryCustomFoodFields() {
    if (!groceryFoodField) return null;

    const caloriesField: NoteDatabaseFieldDefinition = {
      id: GROCERY_CUSTOM_CALORIES_FIELD_ID,
      name: "Calories",
      type: "number",
    };
    const macroFields: NoteDatabaseFieldDefinition[] = [
      { id: GROCERY_CUSTOM_CARBS_FIELD_ID, name: "Carbs", type: "number" },
      { id: GROCERY_CUSTOM_PROTEIN_FIELD_ID, name: "Protein", type: "number" },
      { id: GROCERY_CUSTOM_FAT_FIELD_ID, name: "Fat", type: "number" },
    ];
    const inventoryFields = [
      groceryExpirationField,
      groceryLocationField,
    ].filter((field): field is NoteDatabaseFieldDefinition => Boolean(field));

    return (
      <div className="mt-3 space-y-3">
        {renderDatabaseEntryField({ ...groceryFoodField, name: "Food" })}
        {renderDatabaseEntryField(caloriesField)}
        <div className="grid grid-cols-3 gap-2">
          {macroFields.map((macroField) => (
            <div key={macroField.id} className="min-w-0">
              {renderDatabaseEntryField(macroField, { compact: true })}
            </div>
          ))}
        </div>
        {inventoryFields.length > 0 ? renderGroceryInventoryControls() : null}
      </div>
    );
  }

  function renderNutritionMealBuilderQuantityControl(item: NutritionMealBuilderItem) {
    return renderNutritionServingSelector({
      id: `meal-builder-${item.id}`,
      label: getNutritionMealBuilderItemName(item),
      amount: item.quantity,
      unit: getNutritionMealBuilderItemUnit(item),
      options:
        item.type === "food" && item.food
          ? getFoodServingOptions(item.food)
          : item.recipe
            ? getRecipeServingOptions(item.recipe)
            : [{ value: "serving", label: "serving" }],
      onChange: (amount, servingUnit) =>
        updateNutritionMealBuilderItemServing(item.id, amount, servingUnit),
      compact: true,
    });
  }

  function renderNutritionRecipeBuilderQuantityControl(item: NutritionMealBuilderItem) {
    return renderNutritionServingSelector({
      id: `recipe-builder-${item.id}`,
      label: getNutritionMealBuilderItemName(item),
      amount: item.quantity,
      unit: getNutritionMealBuilderItemUnit(item),
      options: item.food
        ? getFoodServingOptions(item.food)
        : [{ value: "serving", label: "serving" }],
      onChange: (amount, servingUnit) =>
        updateNutritionRecipeBuilderItemServing(item.id, amount, servingUnit),
      compact: true,
    });
  }

  async function toggleNutritionFavorite(target: NutritionFavoriteTarget) {
    const favoriteKey = getNutritionFavoriteKey(target);
    const isFavorite = nutritionFavoriteKeys.has(favoriteKey);

    setNutritionFavoriteKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (isFavorite) {
        nextKeys.delete(favoriteKey);
      } else {
        nextKeys.add(favoriteKey);
      }
      return nextKeys;
    });
    setPendingNutritionFavoriteKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      nextKeys.add(favoriteKey);
      return nextKeys;
    });

    try {
      const response = await fetch("/api/nutrition/favorites", {
        method: isFavorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType: target.itemType,
          itemId: target.itemId,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update favorite.");
      }
    } catch (error) {
      console.error("Failed to update nutrition favorite", { error });
      setNutritionFavoriteKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        if (isFavorite) {
          nextKeys.add(favoriteKey);
        } else {
          nextKeys.delete(favoriteKey);
        }
        return nextKeys;
      });
    } finally {
      setPendingNutritionFavoriteKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        nextKeys.delete(favoriteKey);
        return nextKeys;
      });
    }
  }

  function renderNutritionFavoriteButton(target: NutritionFavoriteTarget | null) {
    if (!target) return null;

    const favoriteKey = getNutritionFavoriteKey(target);
    const isFavorite = nutritionFavoriteKeys.has(favoriteKey);
    const isPending = pendingNutritionFavoriteKeys.has(favoriteKey);

    return (
      <button
        type="button"
        aria-label={
          isFavorite
            ? `Remove ${target.label} from favorites`
            : `Add ${target.label} to favorites`
        }
        aria-pressed={isFavorite}
        disabled={isPending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void toggleNutritionFavorite(target);
        }}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md outline-none transition ${
          isFavorite
            ? "text-[#f1d58a]/90 hover:bg-white/[0.065] hover:text-[#f6df9d]"
            : "text-white/26 hover:bg-white/[0.055] hover:text-white/58"
        } disabled:opacity-55 focus-visible:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-white/18`}
      >
        <Star
          className="h-3.5 w-3.5 stroke-[1.65]"
          fill={isFavorite ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
    );
  }

  function getActiveGroceryResourcesForFood(food: FoodSearchResult) {
    const foodName = food.name.trim().toLocaleLowerCase();
    const brandName = (food.brand_name ?? "").trim().toLocaleLowerCase();
    return groceryResourceItems.filter((resource) => {
      if (resource.status !== "active") return false;
      if (resource.food_id && resource.food_id === food.id) return true;
      const metadata = getFoodResourceMetadata(resource);
      const snapshot = getRecordMetadata(metadata.foodSnapshot);
      if (snapshot.id === food.id) return true;
      return (
        (resource.name ?? "").trim().toLocaleLowerCase() === foodName &&
        (resource.brand_name ?? "").trim().toLocaleLowerCase() === brandName
      );
    });
  }

  function getGrocerySearchDraftKey(food: FoodSearchResult) {
    const foodId = typeof food.id === "string" ? food.id.trim() : "";
    if (foodId) return `food:${foodId}`;

    const metadata =
      food.metadata && typeof food.metadata === "object" && !Array.isArray(food.metadata)
        ? (food.metadata as Record<string, unknown>)
        : {};
    const barcode =
      typeof metadata.barcode === "string" ? normalizeFoodBarcode(metadata.barcode) : "";
    if (barcode) return `barcode:${barcode}`;

    const canonicalName =
      typeof metadata.canonical_food_name === "string"
        ? metadata.canonical_food_name.trim().toLocaleLowerCase()
        : "";
    const foodName = typeof food.name === "string" ? food.name.trim().toLocaleLowerCase() : "";
    const brandName =
      typeof food.brand_name === "string"
        ? food.brand_name.trim().toLocaleLowerCase()
        : "";
    const fallbackName = canonicalName || foodName;
    return fallbackName ? `name:${fallbackName}:${brandName}` : null;
  }

  function getCompatibleGrocerySearchResource(food: FoodSearchResult, save: GrocerySearchInventorySave) {
    return getActiveGroceryResourcesForFood(food).find((resource) => {
      const resourceUnit = getFoodResourceText(resource.unit);
      const resourceQuantity = getFoodResourceNumber(resource.quantity);
      if (!resourceUnit || resourceQuantity === null) return false;
      const normalizedResourceUnit = normalizeGroceryInventoryUnit(resourceUnit);
      if (save.canonicalUnit === "item") {
        const storedProfile = getStoredCountProfile(getFoodResourceMetadata(resource));
        return normalizedResourceUnit === "item" && Boolean(save.countUnitKey) && storedProfile?.countUnitKey === save.countUnitKey;
      }
      if (save.canonicalUnit !== "g") return normalizedResourceUnit === save.canonicalUnit;
      return ["g", "kg", "oz", "lb"].includes(normalizedResourceUnit);
    });
  }

  function toggleGrocerySearchFood(food: FoodSearchResult) {
    const draftKey = getGrocerySearchDraftKey(food);
    if (!draftKey) return;
    const defaultInventory = getGroceryDefaultInventoryAmount(food);
    setGrocerySearchDrafts((currentDrafts) => {
      if (currentDrafts[draftKey]) {
        if (
          currentDrafts[draftKey].status === "saving" ||
          currentDrafts[draftKey].status === "success"
        ) {
          return currentDrafts;
        }
        const remainingDrafts = { ...currentDrafts };
        delete remainingDrafts[draftKey];
        return remainingDrafts;
      }
      return {
        ...currentDrafts,
        [draftKey]: {
          stableKey: draftKey,
          food,
          quantity: formatGrocerySearchQuantity(defaultInventory.quantity),
          unit: defaultInventory.unit,
          status: "idle",
          message: null,
          quantityManuallyEdited: false,
        },
      };
    });
    setExpandedGroceryInventoryField(null);
    void hapticSoftTick();
  }

  function updateGrocerySearchDraft(
    foodId: string,
    changes: Partial<Pick<GrocerySearchDraft, "quantity" | "unit" | "quantityManuallyEdited">>,
  ) {
    setGrocerySearchDrafts((currentDrafts) => {
      const draft = currentDrafts[foodId];
      if (!draft || draft.status === "saving" || draft.status === "success") {
        return currentDrafts;
      }
      return {
        ...currentDrafts,
        [foodId]: { ...draft, ...changes, status: "idle", message: null },
      };
    });
  }

  function changeGrocerySearchDraftUnit(foodId: string, unit: GroceryInventoryUnit) {
    setGrocerySearchDrafts((currentDrafts) => {
      const draft = currentDrafts[foodId];
      if (
        !draft ||
        draft.status === "saving" ||
        draft.status === "success" ||
        draft.unit === unit
      ) {
        return currentDrafts;
      }

      const currentQuantity = parseGroceryInventoryNumber(draft.quantity);
      const convertedQuantity = currentQuantity
        ? convertGroceryInventoryQuantity(
            getRecordMetadata(draft.food.metadata),
            currentQuantity,
            draft.unit,
            unit,
          ) ?? convertGrocerySearchQuantity(currentQuantity, draft.unit, unit)
        : null;
      if (convertedQuantity === null) return currentDrafts;
      const quantity = formatGrocerySearchQuantity(convertedQuantity);

      return {
        ...currentDrafts,
        [foodId]: {
          ...draft,
          quantity,
          unit,
          quantityManuallyEdited: draft.quantityManuallyEdited,
          status: "idle",
          message: null,
        },
      };
    });
  }

  async function saveGrocerySearchFood(draftKey: string) {
    const draft = grocerySearchDrafts[draftKey];
    if (!draft || draft.status === "saving" || grocerySearchSavingIdsRef.current.has(draftKey)) {
      return false;
    }

    const { food } = draft;
    const inventorySave = prepareGrocerySearchInventorySave(draft.quantity, draft.unit, food);
    if (!inventorySave) {
      setGrocerySearchDrafts((currentDrafts) => ({
        ...currentDrafts,
        [draftKey]: {
          ...currentDrafts[draftKey],
          status: "error",
          message: "Add an amount.",
        },
      }));
      void hapticErrorPattern();
      return false;
    }

    const compatibleResource = getCompatibleGrocerySearchResource(food, inventorySave);
    grocerySearchSavingIdsRef.current.add(draftKey);
    setGrocerySearchDrafts((currentDrafts) => ({
      ...currentDrafts,
      [draftKey]: { ...currentDrafts[draftKey], status: "saving", message: null },
    }));

    try {
      const selectedItem = makeNutritionSelectedFoodItem(food);
      const measurementProfile = getFoodInventoryMeasurementProfile(food);
      const metadata = {
        ...buildGroceryFoodResourceMetadata(selectedItem),
        inventory_quantity: inventorySave.canonicalQuantity,
        inventory_unit: inventorySave.canonicalUnit,
        acquired_quantity: inventorySave.displayQuantity,
        acquired_unit: inventorySave.displayUnit,
        display_quantity: inventorySave.displayQuantity,
        display_unit:
          inventorySave.displayUnit === "item" && measurementProfile
            ? measurementProfile.pluralLabel
            : inventorySave.displayUnit,
        canonical_quantity_g:
          inventorySave.canonicalUnit === "g" ? inventorySave.canonicalQuantity : undefined,
        inventory_quantity_source: inventorySave.conversionSource,
        inventory_conversion_confidence: inventorySave.conversionConfidence,
        ...(inventorySave.countUnitKey && measurementProfile
          ? { inventory_measurement_profile: measurementProfile }
          : {}),
      };
      const existingQuantity = compatibleResource
        ? getFoodResourceNumber(compatibleResource.quantity)
        : null;
      const existingGrams = compatibleResource && existingQuantity !== null
        ? getGroceryInventoryGramEquivalent(
            getFoodResourceMetadata(compatibleResource),
            existingQuantity,
            normalizeGroceryInventoryUnit(compatibleResource.unit),
          )
        : null;
      const response = await fetch("/api/food-resources", {
        method: compatibleResource ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          compatibleResource
            ? {
                id: compatibleResource.id,
                action: "setQuantity",
                food_id: compatibleResource.food_id === null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(food.id)
                  ? food.id
                  : undefined,
                quantity:
                  inventorySave.canonicalUnit === "g" && existingGrams !== null
                    ? existingGrams + inventorySave.canonicalQuantity
                    : (existingQuantity ?? 0) + inventorySave.canonicalQuantity,
                unit: inventorySave.canonicalUnit,
                metadata: {
                  ...getFoodResourceMetadata(compatibleResource),
                  ...metadata,
                  display_quantity: (existingQuantity ?? 0) + inventorySave.canonicalQuantity,
                  display_unit:
                    inventorySave.canonicalUnit === "item" && measurementProfile
                      ? measurementProfile.pluralLabel
                      : inventorySave.canonicalUnit,
                },
              }
            : {
                food_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(food.id)
                  ? food.id
                  : null,
                brand_name: food.brand_name ?? null,
                name: food.name,
                quantity: inventorySave.canonicalQuantity,
                unit: inventorySave.canonicalUnit,
                location: null,
                expires_on: null,
                notes: null,
                metadata,
              },
        ),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok || !payload.foodResource) {
        throw new Error(payload.error || "Unable to add this grocery.");
      }

      const savedResource = normalizeFoodResource(payload.foodResource, 0);
      setGroceryResourceItems((currentItems) =>
        compatibleResource
          ? currentItems.map((resource) =>
              resource.id === compatibleResource.id ? savedResource : resource,
            )
          : [savedResource, ...currentItems],
      );
      setGrocerySearchDrafts((currentDrafts) => ({
        ...currentDrafts,
        [draftKey]: {
          ...currentDrafts[draftKey],
          quantity: "",
          quantityManuallyEdited: false,
          status: "success",
          message: compatibleResource ? "Updated existing Grocery amount." : "Added to Grocery.",
        },
      }));
      void hapticComplete();
      return true;
    } catch (error) {
      console.error("Failed to add Grocery search result", { error, foodId: food.id });
      setGrocerySearchDrafts((currentDrafts) => ({
        ...currentDrafts,
        [draftKey]: {
          ...currentDrafts[draftKey],
          status: "error",
          message: "Unable to add this grocery right now.",
        },
      }));
      void hapticErrorPattern();
      return false;
    } finally {
      grocerySearchSavingIdsRef.current.delete(draftKey);
    }
  }

  function renderGrocerySearchDraftRow(
    draft: GrocerySearchDraft,
    options: { showSaveButton?: boolean } = {},
  ) {
    const { showSaveButton = true } = options;
    const { food, stableKey } = draft;
    const activeResources = getActiveGroceryResourcesForFood(food);
    const previewSave = prepareGrocerySearchInventorySave(draft.quantity, draft.unit, food);
    const compatibleResource = previewSave
      ? getCompatibleGrocerySearchResource(food, previewSave)
      : undefined;
    const existingResource = compatibleResource ?? activeResources[0] ?? null;
    const existingQuantity = existingResource
      ? getFoodResourceNumber(existingResource.quantity)
      : null;
    const existingUnit = existingResource ? getFoodResourceText(existingResource.unit) : "";
    const existingAmount =
      existingQuantity !== null && existingUnit
        ? `${formatFoodNutritionNumber(existingQuantity) ?? existingQuantity}${
            ["g", "kg", "oz", "lb", "ml", "l"].includes(existingUnit.toLowerCase())
              ? ""
              : " "
          }${existingUnit}`
        : null;

    return (
      <div className="border-t border-white/[0.045] bg-white/[0.025] px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3 text-[11px] font-semibold">
          <p className="shrink-0 uppercase tracking-[0.12em] text-white/42">Add amount</p>
          {existingAmount ? (
            <p className="truncate text-right text-white/48">
              Already have: {existingAmount}
            </p>
          ) : null}
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <input
            type="number"
            min={0}
            step="any"
            value={draft.quantity}
            disabled={draft.status === "saving" || draft.status === "success"}
            onChange={(event) =>
              updateGrocerySearchDraft(stableKey, {
                quantity: event.target.value,
                quantityManuallyEdited: true,
              })
            }
            className="h-9 w-24 rounded-lg border border-white/[0.065] bg-black/32 px-2.5 text-sm font-semibold tabular-nums text-white outline-none transition focus-visible:border-white/[0.16] focus-visible:ring-1 focus-visible:ring-white/12"
            aria-label="Add amount"
          />
          <select
            value={draft.unit}
            disabled={draft.status === "saving" || draft.status === "success"}
            onChange={(event) =>
              changeGrocerySearchDraftUnit(
                stableKey,
                event.target.value as GroceryInventoryUnit,
              )
            }
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.065] bg-[#101010] px-2.5 text-xs font-semibold text-white/78 outline-none transition focus-visible:border-white/[0.16] focus-visible:ring-1 focus-visible:ring-white/12"
            aria-label="Inventory unit"
          >
            {getGroceryInventoryUnitOptions(food).map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === "item"
                  ? getFoodInventoryMeasurementProfile(food)?.pluralLabel ?? option.label
                  : option.label}
              </option>
            ))}
          </select>
          {showSaveButton ? (
            <button
              type="button"
              onClick={() => void saveGrocerySearchFood(stableKey)}
              disabled={
                draft.status === "saving" ||
                draft.status === "success" ||
                isGroceryResourcesLoading
              }
              className="h-9 shrink-0 rounded-lg border border-zinc-50/28 bg-zinc-200/82 px-3 text-xs font-bold text-zinc-950 outline-none transition hover:bg-zinc-100 focus-visible:ring-1 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {draft.status === "saving"
                ? "Adding..."
                : isGroceryResourcesLoading
                  ? "Checking..."
                  : draft.status === "success"
                    ? "Added"
                    : "Add"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => toggleGrocerySearchFood(food)}
            disabled={draft.status === "saving" || draft.status === "success"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.065] text-white/48 outline-none transition hover:bg-white/[0.06] hover:text-white/78 focus-visible:ring-1 focus-visible:ring-white/14 disabled:opacity-40"
            aria-label={`Remove ${food.name || "grocery"} from selected groceries`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {draft.message ? (
          <p
            className={`mt-1.5 text-[11px] font-medium ${
              draft.status === "success" ? "text-emerald-100/68" : "text-red-200/72"
            }`}
          >
            {draft.message}
          </p>
        ) : null}
      </div>
    );
  }

  function renderNutritionFoodResultList({
    foods,
    isLoading,
    error,
    loadingLabel,
    emptyLabel,
  }: {
    foods: FoodSearchResult[];
    isLoading: boolean;
    error: string | null;
    loadingLabel: string;
    emptyLabel: string;
  }) {
    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
        {isLoading ? (
          <p className="px-3 py-2.5 text-xs font-medium text-white/42">{loadingLabel}</p>
        ) : error ? (
          <p className="px-3 py-2.5 text-xs font-medium text-red-200/72">{error}</p>
        ) : foods.length > 0 ? (
          <div className="divide-y divide-white/[0.045]">
            {foods.map((food) => {
              const meta = getFoodSearchResultMeta(food);
              const selectedItem = getSelectedNutritionFoodItem(food);
              const isGrocerySearchResult =
                isGroceryDatabase && selectedNutritionFoodAction === "search";
              const groceryDraftKey = isGrocerySearchResult
                ? getGrocerySearchDraftKey(food)
                : null;
              const isSelected = isGrocerySearchResult
                ? Boolean(groceryDraftKey && grocerySearchDrafts[groceryDraftKey])
                : Boolean(selectedItem);
              const displayMeta = selectedItem
                ? isGroceryDatabase
                  ? food.brand_name
                  : getNutritionSelectedFoodLineMeta(selectedItem)
                : meta;
              const subline =
                selectedItem && displayMeta
                  ? [food.brand_name, displayMeta].filter(Boolean).join(" · ")
                  : food.brand_name;

              return (
                <div
                  key={food.id}
                  className={
                    isSelected
                      ? "bg-white/[0.045] shadow-[inset_3px_0_0_rgba(255,255,255,0.62)]"
                      : ""
                  }
                >
                  <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.045]">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        isGrocerySearchResult
                          ? toggleGrocerySearchFood(food)
                          : toggleNutritionFoodSelection(food)
                      }
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-white/12"
                    >
                      <NutritionFoodIcon food={food} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {isSelected && !isGrocerySearchResult ? (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-white/76"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="block truncate text-sm font-semibold text-white/84">
                            {food.name}
                          </span>
                        </span>
                        {subline ? (
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                            {subline}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {!isGrocerySearchResult && selectedItem ? (
                      renderNutritionFoodQuantityControl(selectedItem)
                    ) : !isGrocerySearchResult && meta ? (
                      <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                        {meta}
                      </span>
                    ) : isSelected ? (
                      <Check
                        className="h-4 w-4 shrink-0 text-emerald-100/82"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-3 py-2.5 text-xs font-medium text-white/38">{emptyLabel}</p>
        )}
      </div>
    );
  }

  function getNutritionGroceryFoodDetails(food: FoodSearchResult) {
    const metadata =
      food.metadata && typeof food.metadata === "object" && !Array.isArray(food.metadata)
        ? (food.metadata as Record<string, unknown>)
        : {};
    const quantity =
      typeof metadata.foodResourceQuantity === "number" &&
      Number.isFinite(metadata.foodResourceQuantity) &&
      metadata.foodResourceQuantity >= 0
        ? metadata.foodResourceQuantity
        : null;
    const unit =
      typeof metadata.foodResourceUnit === "string" && metadata.foodResourceUnit.trim()
        ? metadata.foodResourceUnit.trim()
        : null;
    const location =
      typeof metadata.foodResourceLocation === "string" &&
      metadata.foodResourceLocation.trim()
        ? metadata.foodResourceLocation.trim()
        : null;
    const quantityLabel =
      quantity !== null && unit
        ? formatGroceryRemainingLabel(quantity, unit)
        : quantity !== null
          ? `${formatFoodNutritionNumber(quantity) ?? quantity} left`
          : unit;
    const gramHelper =
      quantity !== null && unit
        ? getGroceryInventoryGramHelper(
            metadata,
            quantity,
            normalizeGroceryInventoryUnit(unit),
            {
              packageUnknownText: "servings unknown",
              unknownText: "grams unknown",
            },
          )
        : null;

    return [food.brand_name, quantityLabel, gramHelper, location].filter(Boolean).join(" · ");
  }

  function renderNutritionGroceryContent() {
    const groceryFoodGroups = groupFoodsByBrowseDepartment(
      nutritionGroceryFoods,
      (food) => food,
    );

    return (
      <div className="mt-2">
        {renderSelectedNutritionFoods()}
        <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
          {isNutritionGroceryLoading ? (
            <p className="px-3 py-2.5 text-xs font-medium text-white/42">
              Loading Grocery...
            </p>
          ) : nutritionGroceryError ? (
            <p className="px-3 py-2.5 text-xs font-medium text-red-200/72">
              {nutritionGroceryError}
            </p>
          ) : nutritionGroceryFoods.length > 0 ? (
            <div className="p-1.5">
              {renderFoodDepartmentGroups(
                groceryFoodGroups,
                (food) => food.id,
                (food) => {
                const selectedItem = getSelectedNutritionFoodItem(food);
                const isSelected = Boolean(selectedItem);
                const details = getNutritionGroceryFoodDetails(food);
                const nutritionMeta = selectedItem
                  ? getNutritionSelectedFoodLineMeta(selectedItem)
                  : getFoodSearchResultMeta(food);

                return (
                  <div
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left outline-none transition ${
                      isSelected
                        ? "bg-white/[0.07] shadow-[inset_3px_0_0_rgba(255,255,255,0.7)]"
                        : "hover:bg-white/[0.045]"
                    } focus-visible:bg-white/[0.06]`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleNutritionFoodSelection(food)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
                    >
                      <NutritionFoodIcon food={food} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {isSelected ? (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-white/76"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="block truncate text-sm font-semibold text-white/84">
                            {food.name}
                          </span>
                        </span>
                        {details || nutritionMeta ? (
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                            {[details, nutritionMeta].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {selectedItem ? (
                      renderNutritionFoodQuantityControl(selectedItem)
                    ) : nutritionMeta ? (
                      <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                        {nutritionMeta}
                      </span>
                    ) : null}
                  </div>
                );
                },
                collapsedNutritionGroceryGroups,
                setCollapsedNutritionGroceryGroups,
              )}
            </div>
          ) : (
            <p className="px-3 py-2.5 text-xs font-medium text-white/38">
              No active Grocery foods yet.
            </p>
          )}
        </div>
      </div>
    );
  }

  function getGroceryResourceMetadataNumber(resource: FoodResource, key: NutritionMacroSourceKey) {
    const metadata = getFoodResourceMetadata(resource);
    const directValue = getNutritionSnapshotNumber(metadata[key]);
    if (directValue !== null) return directValue;

    const foodSnapshot =
      metadata.foodSnapshot && typeof metadata.foodSnapshot === "object" && !Array.isArray(metadata.foodSnapshot)
        ? (metadata.foodSnapshot as Record<string, unknown>)
        : null;

    return getNutritionSnapshotNumber(foodSnapshot?.[key]);
  }

  function getGroceryResourceNutritionMeta(resource: FoodResource) {
    const calories = getGroceryResourceMetadataNumber(resource, "calories");
    const carbs = getGroceryResourceMetadataNumber(resource, "carbs_g");
    const protein = getGroceryResourceMetadataNumber(resource, "protein_g");
    const fat = getGroceryResourceMetadataNumber(resource, "fat_g");
    const parts: string[] = [];

    if (calories !== null) {
      parts.push(`${formatFoodNutritionNumber(calories) ?? calories} cal`);
    }
    if (carbs !== null) parts.push(`${formatFoodNutritionNumber(carbs) ?? carbs}g C`);
    if (protein !== null) {
      parts.push(`${formatFoodNutritionNumber(protein) ?? protein}g P`);
    }
    if (fat !== null) parts.push(`${formatFoodNutritionNumber(fat) ?? fat}g F`);

    return parts.join(" · ");
  }

  function getGroceryResourceDetailParts(resource: FoodResource) {
    const quantity = getGroceryResourceDisplayAmount(resource).displayText;
    const brandName = getFoodResourceText(resource.brand_name);
    const location = getFoodResourceText(resource.location);
    const expiresOn = getFoodResourceText(resource.expires_on);
    const expires = expiresOn
      ? `Expires ${formatDatabaseEntryValue(expiresOn, "date")}`
      : "";

    return [brandName, quantity, location, expires].filter(Boolean);
  }

  function getGroceryResourceDraftQuantity(resource: FoodResource) {
    const quantity = getFoodResourceNumber(resource.quantity);
    return quantity !== null
      ? formatFoodNutritionNumber(quantity) ?? String(quantity)
      : "";
  }

  function parseGroceryResourceDraftQuantity(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const parsed = Number(trimmedValue);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function startEditingGroceryResource(resource: FoodResource) {
    setOpenGroceryResourceMenuId(null);
    setGroceryResourceActionError(null);
    setEditingGroceryResourceId(resource.id);
    setGroceryResourceEditDraft({
      quantity: getGroceryResourceDraftQuantity(resource),
      unit: normalizeGroceryInventoryUnit(resource.unit),
    });
  }

  function cancelEditingGroceryResource() {
    setEditingGroceryResourceId(null);
    setGroceryResourceActionError(null);
  }

  async function saveGroceryResourceQuantity(resource: FoodResource) {
    const quantity = parseGroceryResourceDraftQuantity(groceryResourceEditDraft.quantity);

    if (quantity === null) {
      setGroceryResourceActionError("Enter a quantity of 0 or more.");
      void hapticErrorPattern();
      return;
    }

    setSavingGroceryResourceActionId(resource.id);
    setGroceryResourceActionError(null);

    try {
      const existingMetadata = getFoodResourceMetadata(resource);
      const countProfile = getStoredCountProfile(existingMetadata);
      const storedUnit = normalizeGroceryInventoryUnit(resource.unit);
      const canonicalQuantity = convertGroceryInventoryQuantity(
        existingMetadata,
        quantity,
        groceryResourceEditDraft.unit,
        storedUnit,
      );
      if (canonicalQuantity === null) {
        setGroceryResourceActionError("That unit cannot be converted reliably.");
        return;
      }
      const response = await fetch("/api/food-resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resource.id,
          action: "setQuantity",
          quantity: Number(canonicalQuantity.toFixed(6)),
          unit: storedUnit,
          metadata: {
            ...existingMetadata,
            display_quantity: Number(canonicalQuantity.toFixed(6)),
            display_unit:
              storedUnit === "item" && countProfile
                ? formatInventoryCountLabel(canonicalQuantity, countProfile)
                : storedUnit,
            inventory_quantity: Number(canonicalQuantity.toFixed(6)),
            inventory_unit: storedUnit,
            last_edit_display_quantity: quantity,
            last_edit_display_unit: groceryResourceEditDraft.unit,
          },
        }),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok || !payload.foodResource) {
        throw new Error(payload.error || "Unable to update Grocery quantity.");
      }

      setGroceryResourceItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === resource.id ? payload.foodResource! : currentItem,
        ),
      );
      setEditingGroceryResourceId(null);
      void hapticComplete();
    } catch (error) {
      console.error("Failed to update Grocery List quantity", { error });
      setGroceryResourceActionError("Unable to update that item right now.");
      void hapticErrorPattern();
    } finally {
      setSavingGroceryResourceActionId(null);
    }
  }

  async function expireGroceryResource(resource: FoodResource) {
    setOpenGroceryResourceMenuId(null);
    setEditingGroceryResourceId(null);
    setSavingGroceryResourceActionId(resource.id);
    setGroceryResourceActionError(null);

    try {
      const response = await fetch("/api/food-resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resource.id,
          action: "setStatus",
          status: "discarded",
          metadata: {
            ...getFoodResourceMetadata(resource),
            expired_manually_at: new Date().toISOString(),
            expired_from_grocery_menu: true,
          },
        }),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to expire Grocery item.");
      }

      setGroceryResourceItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== resource.id),
      );
      void hapticComplete();
    } catch (error) {
      console.error("Failed to expire Grocery List item", { error });
      setGroceryResourceActionError("Unable to expire that item right now.");
      void hapticErrorPattern();
    } finally {
      setSavingGroceryResourceActionId(null);
    }
  }

  function renderGroceryResourcesContent() {
    const groceryResourceGroups = groupFoodsByBrowseDepartment(
      groceryResourceItems,
      mapFoodResourceToFoodSearchResult,
    );

    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
        {isGroceryResourcesLoading ? (
          <p className="px-3 py-2.5 text-xs font-medium text-white/42">
            Loading groceries...
          </p>
        ) : groceryResourcesError ? (
          <p className="px-3 py-2.5 text-xs font-medium text-red-200/72">
            {groceryResourcesError}
          </p>
        ) : groceryResourceItems.length > 0 ? (
          <div className="p-1.5">
            {groceryResourceActionError ? (
              <p className="px-3 py-2.5 text-xs font-medium text-red-200/72">
                {groceryResourceActionError}
              </p>
            ) : null}
            {renderFoodDepartmentGroups(
              groceryResourceGroups,
              (resource) => resource.id,
              (resource) => {
              const detailLine = getGroceryResourceDetailParts(resource).join(" · ");
              const nutritionMeta = getGroceryResourceNutritionMeta(resource);
              const isMenuOpen = openGroceryResourceMenuId === resource.id;
              const isEditing = editingGroceryResourceId === resource.id;
              const isSaving = savingGroceryResourceActionId === resource.id;
              const editQuantity = parseGroceryResourceDraftQuantity(
                groceryResourceEditDraft.quantity,
              );
              const editGramHelper = getGroceryInventoryGramHelper(
                getFoodResourceMetadata(resource),
                editQuantity,
                groceryResourceEditDraft.unit,
                {
                  packageUnknownText: "servings unknown",
                  unknownText: "grams unknown",
                },
              );

              return (
                <div className="relative">
                  <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <NutritionFoodIconSlot
                        icon={getGroceryResourceFoodIcon(resource)}
                        fallbackInitial={resource.name.charAt(0)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white/84">
                          {resource.name}
                        </span>
                        {detailLine ? (
                          <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                            {detailLine}
                          </span>
                        ) : null}
                        {nutritionMeta ? (
                          <span className="mt-0.5 block truncate text-[11px] font-semibold text-white/46">
                            {nutritionMeta}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {resource.location ? (
                        <span className="hidden shrink-0 rounded-full border border-white/[0.055] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40 sm:inline-flex">
                          {resource.location}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Actions for ${resource.name}`}
                        aria-expanded={isMenuOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          setGroceryResourceActionError(null);
                          setOpenGroceryResourceMenuId((currentId) =>
                            currentId === resource.id ? null : resource.id,
                          );
                        }}
                        disabled={isSaving}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.045] text-white/52 outline-none transition hover:border-white/14 hover:bg-white/[0.075] hover:text-white/76 focus-visible:ring-1 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {isMenuOpen ? (
                    <div className="mx-3 mb-3 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-zinc-950/72 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingGroceryResource(resource);
                        }}
                        disabled={isSaving}
                        className="flex h-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.045] px-2.5 text-xs font-semibold text-white/72 outline-none transition hover:bg-white/[0.075] hover:text-white focus-visible:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void expireGroceryResource(resource);
                        }}
                        disabled={isSaving}
                        className="flex h-9 items-center justify-center rounded-lg border border-red-300/[0.16] bg-red-500/[0.08] px-2.5 text-xs font-bold text-red-200 outline-none transition hover:bg-red-500/[0.14] hover:text-red-100 focus-visible:bg-red-500/[0.16] focus-visible:ring-1 focus-visible:ring-red-200/24 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Expire
                      </button>
                    </div>
                  ) : null}
                  {isEditing ? (
                    <div className="mx-3 mb-3 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
                        <label className="min-w-0">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">
                            Amount
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={groceryResourceEditDraft.quantity}
                            onChange={(event) =>
                              setGroceryResourceEditDraft((currentDraft) => ({
                                ...currentDraft,
                                quantity: event.target.value,
                              }))
                            }
                            className="h-9 w-full rounded-lg border border-white/[0.07] bg-black/32 px-2.5 text-sm font-semibold text-white/82 outline-none transition placeholder:text-white/24 focus:border-white/18 focus:bg-black/42 focus:ring-1 focus:ring-white/12"
                          />
                        </label>
                        <label className="min-w-0">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">
                            Unit
                          </span>
                          <select
                            value={groceryResourceEditDraft.unit}
                            onChange={(event) => {
                              const nextUnit = normalizeGroceryInventoryUnit(event.target.value);
                              setGroceryResourceEditDraft((currentDraft) => {
                                const currentQuantity = parseGroceryResourceDraftQuantity(currentDraft.quantity);
                                const converted = currentQuantity === null
                                  ? null
                                  : convertGroceryInventoryQuantity(
                                      getFoodResourceMetadata(resource),
                                      currentQuantity,
                                      currentDraft.unit,
                                      nextUnit,
                                    );
                                return converted === null
                                  ? currentDraft
                                  : {
                                      quantity: formatGrocerySearchQuantity(converted),
                                      unit: nextUnit,
                                    };
                              });
                            }}
                            className="h-9 w-full rounded-lg border border-white/[0.07] bg-black/32 px-2 text-sm font-semibold text-white/82 outline-none transition focus:border-white/18 focus:bg-black/42 focus:ring-1 focus:ring-white/12"
                          >
                            {getGroceryInventoryUnitOptions(getFoodResourceMetadata(resource)).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value === "item"
                                  ? getStoredCountProfile(getFoodResourceMetadata(resource))?.pluralLabel ?? option.label
                                  : option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="mt-1.5 text-[11px] font-medium text-white/38">
                        {editGramHelper}
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEditingGroceryResource}
                          disabled={isSaving}
                          className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 text-xs font-semibold text-white/54 outline-none transition hover:bg-white/[0.065] hover:text-white/74 focus-visible:ring-1 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveGroceryResourceQuantity(resource)}
                          disabled={isSaving}
                          className="h-8 rounded-lg border border-zinc-50/28 bg-zinc-200/82 px-3 text-xs font-bold text-zinc-950 outline-none transition hover:bg-zinc-100 focus-visible:ring-1 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
              },
              collapsedGroceryResourceGroups,
              setCollapsedGroceryResourceGroups,
            )}
          </div>
        ) : (
          <div className="px-3 py-5 text-center">
            <ShoppingBasket
              className="mx-auto h-5 w-5 text-white/28"
              aria-hidden="true"
            />
            <p className="mt-2 text-xs font-semibold text-white/48">
              No active groceries yet.
            </p>
            <p className="mt-1 text-[11px] font-medium text-white/30">
              Added Grocery List items will show here.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderFoodDepartmentGroups<T>(
    groups: FoodDepartmentGroup<T>[],
    getRowKey: (item: T) => string,
    renderRow: (item: T) => ReactNode,
    collapsedGroups: Set<string> = collapsedStagedFoodGroups,
    setCollapsedGroups: Dispatch<SetStateAction<Set<string>>> = setCollapsedStagedFoodGroups,
  ) {
    return (
      <div className="space-y-1.5">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          return (
            <section
              key={group.key}
              className="overflow-hidden rounded-lg border border-white/[0.055] bg-black/18"
            >
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsedGroups((currentGroups) => {
                    const nextGroups = new Set(currentGroups);
                    if (nextGroups.has(group.key)) nextGroups.delete(group.key);
                    else nextGroups.add(group.key);
                    return nextGroups;
                  })
                }
                className="flex min-h-9 w-full items-center gap-2 px-2.5 py-2 text-left outline-none transition hover:bg-white/[0.035] focus-visible:bg-white/[0.045] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/12"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-white/36 transition-transform ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/68">
                  {group.label}
                </span>
                <span className="shrink-0 rounded-full bg-white/[0.055] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/48">
                  {group.items.length}
                </span>
              </button>
              {!isCollapsed ? (
                <div className="space-y-1.5 border-t border-white/[0.045] p-1.5">
                  {group.items.map((item) => (
                    <div key={getRowKey(item)}>{renderRow(item)}</div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  }

  function renderSelectedNutritionFoods() {
    if (isGroceryDatabase) {
      const stagedDrafts = Object.values(grocerySearchDrafts);
      if (stagedDrafts.length === 0) return null;
      const stagedGroups = groupFoodsByBrowseDepartment(
        stagedDrafts,
        (draft) => draft.food,
      );

      return (
        <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Selected
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-white/46">
              {stagedDrafts.length}
            </span>
          </div>
          {renderFoodDepartmentGroups(
            stagedGroups,
            (draft) => draft.stableKey,
            (draft) => (
              <div className="overflow-hidden rounded-lg border border-white/[0.055] bg-black/28">
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <NutritionFoodIcon food={draft.food} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/84">
                      {draft.food.name}
                    </span>
                    {draft.food.brand_name ? (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                        {draft.food.brand_name}
                      </span>
                    ) : null}
                  </span>
                </div>
                {renderGrocerySearchDraftRow(draft, { showSaveButton: false })}
              </div>
            ),
          )}
        </div>
      );
    }

    const selectedItems = selectedNutritionFoods;

    if (selectedItems.length === 0) return null;
    const stagedGroups = groupFoodsByBrowseDepartment(
      selectedItems,
      (item) => item.food,
    );

    return (
      <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
            Selected
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-white/46">
            {selectedItems.length}
          </span>
        </div>
        {renderFoodDepartmentGroups(
          stagedGroups,
          (item) => getNutritionFoodSelectionKey(item.food),
          (item) => {
            const { food } = item;
            if (isGroceryDatabase) {
              return renderGrocerySelectedFoodDetail(item);
            }

            const meta = isGroceryDatabase ? food.brand_name : getNutritionSelectedFoodLineMeta(item);
            const quantityBadgeLabel = getNutritionSelectedFoodQuantityBadgeLabel(item);
            const isScannedSelection = selectedNutritionFoodAction === "scan";
            const groceryServingGramHelper = selectedNutritionFoodAction === "grocery"
              ? item.servingUnit === "container"
                ? getGroceryContainerNutritionResolution(food, item.quantity).helper
                : getGroceryServingGramHelper(getRecordMetadata(food.metadata))
              : null;
            const favoriteTarget: NutritionFavoriteTarget | null =
              food.source?.startsWith("grocery")
                ? null
                : {
                    itemType: "food",
                    itemId: food.id,
                    label: food.name,
                  };

            if (isScannedSelection) {
              return (
                <div
                  key={food.id}
                  className="w-full rounded-lg border border-white/[0.055] bg-black/28 px-2.5 py-2.5"
                >
                  <div className="flex w-full items-start gap-2">
                    {isGroceryDatabase ? null : renderNutritionFavoriteButton(favoriteTarget)}
                    <NutritionFoodIcon food={food} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug text-white/86">
                        {food.name}
                      </span>
                      {meta ? (
                        <span className="mt-1 block text-[11px] font-medium leading-snug text-white/40">
                          {meta}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${food.name}`}
                      onClick={() => removeNutritionSelectedFood(food)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 flex w-full justify-start pl-16">
                    {renderNutritionFoodQuantityControl(item)}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={food.id}
                className="w-full rounded-lg border border-white/[0.055] bg-black/28 px-2 py-2"
              >
                <div className="flex w-full items-center gap-2">
                  {isGroceryDatabase ? null : renderNutritionFavoriteButton(favoriteTarget)}
                  <NutritionFoodIcon food={food} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="block truncate text-sm font-semibold text-white/84">
                        {food.name}
                      </span>
                      {quantityBadgeLabel ? (
                        <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.055] px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-white/62 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
                          {quantityBadgeLabel}
                        </span>
                      ) : null}
                    </span>
                    {meta ? (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
                        {meta}
                      </span>
                    ) : null}
                    {groceryServingGramHelper ? (
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                        {groceryServingGramHelper}
                      </span>
                    ) : null}
                  </span>
                  <div className="hidden sm:block">
                    {renderNutritionFoodQuantityControl(item)}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${food.name}`}
                    onClick={() => removeNutritionSelectedFood(food)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2 sm:hidden">{renderNutritionFoodQuantityControl(item)}</div>
                {selectedNutritionFoodAction === "grocery"
                  ? renderNutritionGroceryDeductionControl(item)
                  : null}
              </div>
            );
          },
        )}
      </div>
    );
  }

  function clearSelectedNutritionMeal() {
    setSelectedNutritionMeal(null);
    setSelectedNutritionMealSource(null);
    setEntryFormValues((current) => ({
      ...current,
      ...mapSelectedNutritionFoodsToEntryValues([], databaseDefinition),
    }));
    setSubmitError(null);
  }

  function clearSelectedNutritionRecipe() {
    setSelectedNutritionRecipe(null);
    setEntryFormValues((current) => ({
      ...current,
      ...mapSelectedNutritionFoodsToEntryValues([], databaseDefinition),
    }));
    setSubmitError(null);
  }

  function renderSelectedNutritionMeal() {
    if (!selectedNutritionMeal) return null;
    const favoriteTarget: NutritionFavoriteTarget | null =
      selectedNutritionMealSource === "meal_template"
        ? {
            itemType: "meal_template",
            itemId: selectedNutritionMeal.id,
            label: getNutritionSavedMealDisplayName(selectedNutritionMeal),
          }
        : null;

    return (
      <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
            Selected meal
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-white/46">
            {getNutritionSavedMealMeta(selectedNutritionMeal)}
          </span>
        </div>
        <div className="flex w-full items-center gap-2 rounded-lg border border-white/[0.055] bg-black/28 px-2 py-2">
          {renderNutritionFavoriteButton(favoriteTarget)}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.055] bg-black/44 text-white/64 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <Utensils className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white/84">
              {getNutritionSavedMealDisplayName(selectedNutritionMeal)}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
              {getNutritionSavedMealTimeLabel(selectedNutritionMeal)}
            </span>
          </span>
          <button
            type="button"
            aria-label="Remove selected meal"
            onClick={clearSelectedNutritionMeal}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  function renderSelectedNutritionRecipe() {
    if (!selectedNutritionRecipe) return null;
    const { recipe } = selectedNutritionRecipe;
    const lineMeta = getNutritionSelectedRecipeLineMeta(selectedNutritionRecipe);
    const favoriteTarget: NutritionFavoriteTarget = {
      itemType: "recipe",
      itemId: recipe.id,
      label: recipe.name,
    };

    return (
      <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
            Selected recipe
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-white/46">
            {lineMeta}
          </span>
        </div>
        <div className="flex w-full items-center gap-2 rounded-lg border border-white/[0.055] bg-black/28 px-2 py-2">
          {renderNutritionFavoriteButton(favoriteTarget)}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.055] bg-black/44 text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <NutritionMealTemplateIcon
              icon={getNutritionSavedRecipeIcon(recipe)}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white/84">
              {recipe.name}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
              {lineMeta} · {formatNutritionServingLabel(
                selectedNutritionRecipe.quantity,
                selectedNutritionRecipe.servingUnit,
              )}
            </span>
          </span>
          {renderNutritionServingSelector({
            id: `selected-recipe-${recipe.id}`,
            label: recipe.name,
            amount: selectedNutritionRecipe.quantity,
            unit: selectedNutritionRecipe.servingUnit,
            options: getRecipeServingOptions(recipe),
            onChange: updateNutritionSelectedRecipeServing,
            compact: true,
          })}
          <button
            type="button"
            aria-label="Remove selected recipe"
            onClick={clearSelectedNutritionRecipe}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/42 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // Saved recipe behavior stays intact for the future Recipes surface even though V1
  // intentionally presents that tab as a placeholder.
  void [
    getNutritionSavedRecipeMeta,
    nutritionRecipes,
    isNutritionRecipesLoading,
    nutritionRecipesError,
    selectNutritionSavedRecipe,
    openNutritionRecipeBuilder,
    renderSelectedNutritionRecipe,
  ];

  function renderNutritionMealBuilderSearchResults() {
    const hasResults =
      nutritionMealBuilderFoodResults.length > 0 ||
      nutritionMealBuilderRecipeResults.length > 0;

    if (normalizedNutritionMealBuilderSearchValue.length < 2) return null;

    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
        {isNutritionMealBuilderSearchLoading ? (
          <p className="px-3 py-2.5 text-xs font-medium text-white/42">Searching...</p>
        ) : nutritionMealBuilderSearchError ? (
          <p className="px-3 py-2.5 text-xs font-medium text-red-200/72">
            {nutritionMealBuilderSearchError}
          </p>
        ) : hasResults ? (
          <div className="divide-y divide-white/[0.045]">
            {nutritionMealBuilderFoodResults.map((food) => (
              <button
                key={`food-${food.id}`}
                type="button"
                onClick={() => addNutritionMealBuilderFood(food)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition hover:bg-white/[0.045] focus-visible:bg-white/[0.06]"
              >
                <NutritionFoodIcon food={food} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.045] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/42">
                      Food
                    </span>
                    <span className="block truncate text-sm font-semibold text-white/84">
                      {food.name}
                    </span>
                  </span>
                  {food.brand_name ? (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                      {food.brand_name}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                  {getFoodSearchResultMeta(food)}
                </span>
              </button>
            ))}
            {nutritionMealBuilderRecipeResults.map((recipe) => (
              <button
                key={`recipe-${recipe.id}`}
                type="button"
                onClick={() => addNutritionMealBuilderRecipe(recipe)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition hover:bg-white/[0.045] focus-visible:bg-white/[0.06]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.055] bg-black/44 text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.045] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/42">
                      Recipe
                    </span>
                    <span className="block truncate text-sm font-semibold text-white/84">
                      {recipe.name}
                    </span>
                  </span>
                  {recipe.description ? (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                      {recipe.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                  {getNutritionRecipeSearchResultMeta(recipe)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-2.5 text-xs font-medium text-white/38">
            No foods or recipes found.
          </p>
        )}
      </div>
    );
  }

  function renderNutritionRecipeBuilderSearchResults() {
    if (normalizedNutritionRecipeBuilderSearchValue.length < 2) return null;

    return (
      <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
        {isNutritionRecipeBuilderSearchLoading ? (
          <p className="px-3 py-2.5 text-xs font-medium text-white/42">Searching...</p>
        ) : nutritionRecipeBuilderSearchError ? (
          <p className="px-3 py-2.5 text-xs font-medium text-red-200/72">
            {nutritionRecipeBuilderSearchError}
          </p>
        ) : nutritionRecipeBuilderFoodResults.length > 0 ? (
          <div className="divide-y divide-white/[0.045]">
            {nutritionRecipeBuilderFoodResults.map((food) => (
              <button
                key={`recipe-food-${food.id}`}
                type="button"
                onClick={() => addNutritionRecipeBuilderFood(food)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition hover:bg-white/[0.045] focus-visible:bg-white/[0.06]"
              >
                <NutritionFoodIcon food={food} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white/84">
                    {food.name}
                  </span>
                  {food.brand_name ? (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                      {food.brand_name}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                  {getFoodSearchResultMeta(food)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-2.5 text-xs font-medium text-white/38">
            No foods found.
          </p>
        )}
      </div>
    );
  }

  function renderNutritionMealBuilderIconSelector() {
    return (
      <div ref={nutritionMealBuilderIconPickerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() =>
            setIsNutritionMealBuilderIconPickerOpen((current) => !current)
          }
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.075] bg-black/46 text-sm leading-none text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] outline-none transition hover:border-white/[0.13] hover:bg-white/[0.055] focus-visible:border-white/[0.18] focus-visible:ring-1 focus-visible:ring-white/16"
          aria-label="Choose meal icon"
          aria-expanded={isNutritionMealBuilderIconPickerOpen}
        >
          <NutritionMealTemplateIcon icon={nutritionMealBuilderIcon} />
        </button>

        {isNutritionMealBuilderIconPickerOpen ? (
          <div className="absolute left-0 top-9 z-50 grid w-[8.5rem] grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-[#090909]/96 p-1.5 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            {NUTRITION_MEAL_TEMPLATE_ICON_OPTIONS.map((icon) => {
              const isSelected = nutritionMealBuilderIcon === icon;

              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => {
                    setNutritionMealBuilderIcon(icon);
                    setIsNutritionMealBuilderIconPickerOpen(false);
                    setNutritionMealBuilderSaveError(null);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border text-sm leading-none outline-none transition ${
                    isSelected
                      ? "border-white/[0.18] bg-white/[0.11] text-white"
                      : "border-white/[0.055] bg-white/[0.035] text-white/76 hover:border-white/[0.11] hover:bg-white/[0.07]"
                  } focus-visible:border-white/[0.2] focus-visible:bg-white/[0.09]`}
                  aria-label={`Use ${icon} meal icon`}
                >
                  {icon}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  function renderNutritionRecipeBuilderIconSelector() {
    return (
      <div ref={nutritionRecipeBuilderIconPickerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() =>
            setIsNutritionRecipeBuilderIconPickerOpen((current) => !current)
          }
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.075] bg-black/46 text-sm leading-none text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] outline-none transition hover:border-white/[0.13] hover:bg-white/[0.055] focus-visible:border-white/[0.18] focus-visible:ring-1 focus-visible:ring-white/16"
          aria-label="Choose recipe icon"
          aria-expanded={isNutritionRecipeBuilderIconPickerOpen}
        >
          <NutritionMealTemplateIcon icon={nutritionRecipeBuilderIcon} />
        </button>

        {isNutritionRecipeBuilderIconPickerOpen ? (
          <div className="absolute left-0 top-9 z-50 grid w-[8.5rem] grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-[#090909]/96 p-1.5 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            {NUTRITION_MEAL_TEMPLATE_ICON_OPTIONS.map((icon) => {
              const isSelected = nutritionRecipeBuilderIcon === icon;

              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => {
                    setNutritionRecipeBuilderIcon(icon);
                    setIsNutritionRecipeBuilderIconPickerOpen(false);
                    setNutritionRecipeBuilderSaveError(null);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border text-sm leading-none outline-none transition ${
                    isSelected
                      ? "border-white/[0.18] bg-white/[0.11] text-white"
                      : "border-white/[0.055] bg-white/[0.035] text-white/76 hover:border-white/[0.11] hover:bg-white/[0.07]"
                  } focus-visible:border-white/[0.2] focus-visible:bg-white/[0.09]`}
                  aria-label={`Use ${icon} recipe icon`}
                >
                  {icon}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  function renderNutritionMealBuilder() {
    const calories = formatFoodNutritionNumber(nutritionMealBuilderTotals.calories) ?? "0";
    const carbs = formatFoodNutritionNumber(nutritionMealBuilderTotals.carbs) ?? "0";
    const protein = formatFoodNutritionNumber(nutritionMealBuilderTotals.protein) ?? "0";
    const fat = formatFoodNutritionNumber(nutritionMealBuilderTotals.fat) ?? "0";

    return (
      <div className="mt-3 rounded-2xl border border-white/[0.065] bg-[#080808] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={closeNutritionMealBuilder}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.045] text-white/62 outline-none transition hover:border-white/[0.1] hover:bg-white/[0.07] hover:text-white/86 focus-visible:ring-1 focus-visible:ring-white/16"
            aria-label="Close meal builder"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white/84">Meal Builder</p>
            <p className="truncate text-[11px] font-medium text-white/38">
              {calories} cal · C {carbs}g · P {protein}g · F {fat}g
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveNutritionMealBuilder()}
            disabled={isNutritionMealBuilderSaving}
            className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.12] px-3 text-xs font-semibold text-white/84 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-1 focus-visible:ring-white/16"
          >
            {isNutritionMealBuilderSaving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mt-3">
          <span className="text-xs font-semibold text-white/46">Meal name</span>
          <span className="mt-2 flex items-center gap-2">
            {renderNutritionMealBuilderIconSelector()}
            <input
              type="text"
              value={nutritionMealBuilderName}
              onChange={(event) => {
                setNutritionMealBuilderName(event.target.value);
                setNutritionMealBuilderSaveError(null);
              }}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/[0.055] bg-white/[0.045] px-3 text-sm font-medium text-white outline-none transition placeholder:text-white/26 selection:bg-white/[0.18] hover:border-white/[0.08] hover:bg-white/[0.055] focus-visible:border-white/[0.14] focus-visible:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/10"
              placeholder="Meal name"
              aria-label="Meal name"
            />
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
          <div className="flex min-h-9 items-center justify-between gap-2 border-b border-white/[0.045] px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Items
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-white/44">
              {nutritionMealBuilderItems.length}
            </span>
          </div>
          {nutritionMealBuilderItems.length > 0 ? (
            <div className="divide-y divide-white/[0.045]">
              {nutritionMealBuilderItems.map((item) => {
                const itemName = getNutritionMealBuilderItemName(item);
                const itemBrand = getNutritionMealBuilderItemBrand(item);
                const lineMeta = getNutritionMealBuilderItemLineMeta(item);

                return (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white/84">
                        {itemName}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                        {itemBrand ? `${itemBrand} · ` : ""}
                        {lineMeta}
                      </span>
                    </span>
                    {renderNutritionMealBuilderQuantityControl(item)}
                    <button
                      type="button"
                      aria-label={`Remove ${itemName}`}
                      onClick={() => removeNutritionMealBuilderItem(item.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/38 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-3 text-xs font-medium text-white/38">
              Search below to add foods or recipes.
            </p>
          )}
        </div>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36"
            aria-hidden="true"
          />
          <input
            type="text"
            value={nutritionMealBuilderSearchQuery}
            onChange={(event) => setNutritionMealBuilderSearchQuery(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.055] bg-black/42 pl-10 pr-3 text-sm font-medium text-white outline-none transition placeholder:text-white/28 selection:bg-white/[0.18] hover:border-white/[0.09] hover:bg-black/48 focus-visible:border-white/[0.16] focus-visible:bg-black/54 focus-visible:ring-1 focus-visible:ring-white/12"
            placeholder="Search foods and recipes..."
            aria-label="Search foods and recipes"
          />
        </div>
        {renderNutritionMealBuilderSearchResults()}
        {nutritionMealBuilderSaveError ? (
          <p className="mt-2 text-xs font-medium text-red-200/72">
            {nutritionMealBuilderSaveError}
          </p>
        ) : null}
      </div>
    );
  }

  function renderNutritionRecipeBuilder() {
    const calories = formatFoodNutritionNumber(nutritionRecipeBuilderTotals.calories) ?? "0";
    const carbs = formatFoodNutritionNumber(nutritionRecipeBuilderTotals.carbs) ?? "0";
    const protein = formatFoodNutritionNumber(nutritionRecipeBuilderTotals.protein) ?? "0";
    const fat = formatFoodNutritionNumber(nutritionRecipeBuilderTotals.fat) ?? "0";

    return (
      <div className="mt-3 rounded-2xl border border-white/[0.065] bg-[#080808] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={closeNutritionRecipeBuilder}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.045] text-white/62 outline-none transition hover:border-white/[0.1] hover:bg-white/[0.07] hover:text-white/86 focus-visible:ring-1 focus-visible:ring-white/16"
            aria-label="Close recipe builder"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white/84">Recipe Builder</p>
            <p className="truncate text-[11px] font-medium text-white/38">
              {calories} cal · C {carbs}g · P {protein}g · F {fat}g
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveNutritionRecipeBuilder()}
            disabled={isNutritionRecipeBuilderSaving}
            className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.12] px-3 text-xs font-semibold text-white/84 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-1 focus-visible:ring-white/16"
          >
            {isNutritionRecipeBuilderSaving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="mt-3">
          <span className="text-xs font-semibold text-white/46">Recipe name</span>
          <span className="mt-2 flex items-center gap-2">
            {renderNutritionRecipeBuilderIconSelector()}
            <input
              type="text"
              value={nutritionRecipeBuilderName}
              onChange={(event) => {
                setNutritionRecipeBuilderName(event.target.value);
                setNutritionRecipeBuilderSaveError(null);
              }}
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/[0.055] bg-white/[0.045] px-3 text-sm font-medium text-white outline-none transition placeholder:text-white/26 selection:bg-white/[0.18] hover:border-white/[0.08] hover:bg-white/[0.055] focus-visible:border-white/[0.14] focus-visible:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/10"
              placeholder="Recipe name"
              aria-label="Recipe name"
            />
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.055] bg-black/36">
          <div className="flex min-h-9 items-center justify-between gap-2 border-b border-white/[0.045] px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
              Foods
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-white/44">
              {nutritionRecipeBuilderItems.length}
            </span>
          </div>
          {nutritionRecipeBuilderItems.length > 0 ? (
            <div className="divide-y divide-white/[0.045]">
              {nutritionRecipeBuilderItems.map((item) => {
                const itemName = getNutritionMealBuilderItemName(item);
                const lineMeta = getNutritionMealBuilderItemLineMeta(item);

                return (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white/84">
                        {itemName}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                        {lineMeta}
                      </span>
                    </span>
                    {renderNutritionRecipeBuilderQuantityControl(item)}
                    <button
                      type="button"
                      aria-label={`Remove ${itemName}`}
                      onClick={() => removeNutritionRecipeBuilderItem(item.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/38 outline-none transition hover:bg-white/[0.07] hover:text-white/76 focus-visible:bg-white/[0.08] focus-visible:text-white"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-3 text-xs font-medium text-white/38">
              Search below to add foods.
            </p>
          )}
        </div>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36"
            aria-hidden="true"
          />
          <input
            type="text"
            value={nutritionRecipeBuilderSearchQuery}
            onChange={(event) => setNutritionRecipeBuilderSearchQuery(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.055] bg-black/42 pl-10 pr-3 text-sm font-medium text-white outline-none transition placeholder:text-white/28 selection:bg-white/[0.18] hover:border-white/[0.09] hover:bg-black/48 focus-visible:border-white/[0.16] focus-visible:bg-black/54 focus-visible:ring-1 focus-visible:ring-white/12"
            placeholder="Search foods..."
            aria-label="Search foods"
          />
        </div>
        {renderNutritionRecipeBuilderSearchResults()}
        {nutritionRecipeBuilderSaveError ? (
          <p className="mt-2 text-xs font-medium text-red-200/72">
            {nutritionRecipeBuilderSaveError}
          </p>
        ) : null}
      </div>
    );
  }

  function renderNutritionReusableMealsContent() {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/42 p-2.5">
        {renderSelectedNutritionMeal()}
        <div className={selectedNutritionMeal ? "mt-2 space-y-1.5" : "space-y-1.5"}>
          <button
            type="button"
            onClick={openNutritionMealBuilder}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-white/[0.105] bg-white/[0.026] px-2.5 py-2.5 text-left outline-none transition hover:border-white/[0.16] hover:bg-white/[0.045] focus-visible:border-white/[0.18] focus-visible:bg-white/[0.06]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-black/44 text-white/64 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white/84">
                Create meal
              </span>
              <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
                Build a reusable meal row
              </span>
            </span>
          </button>

          {isNutritionMealTemplatesLoading ? (
            <p className="px-2 py-2 text-xs font-medium text-white/42">Loading meals...</p>
          ) : nutritionMealTemplatesError ? (
            <p className="px-2 py-2 text-xs font-medium text-red-200/72">
              {nutritionMealTemplatesError}
            </p>
          ) : nutritionMealTemplates.length > 0 ? (
            nutritionMealTemplates.map((meal) => {
              const isSelected = selectedNutritionMeal?.id === meal.id;
              const hasReusableItems = (meal.meal_items?.length ?? 0) > 0;

              return (
                <button
                  key={meal.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!hasReusableItems}
                  onClick={() => selectNutritionSavedMeal(meal, "meal_template")}
                  className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2.5 text-left outline-none transition ${
                    isSelected
                      ? "border-white/[0.14] bg-white/[0.08] shadow-[inset_3px_0_0_rgba(255,255,255,0.66)]"
                      : "border-white/[0.055] bg-white/[0.026] hover:border-white/[0.09] hover:bg-white/[0.045]"
                  } disabled:cursor-not-allowed disabled:opacity-42 focus-visible:border-white/[0.15] focus-visible:bg-white/[0.06]`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.055] bg-black/44 text-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <NutritionMealTemplateIcon icon={getNutritionSavedMealIcon(meal)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/84">
                      {getNutritionSavedMealDisplayName(meal)}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
                      {getNutritionSavedMealMeta(meal)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                    {formatFoodNutritionNumber(
                      parseNutritionProgressNumber(meal.total_calories),
                    ) ?? "0"}{" "}
                    cal
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-2 text-xs font-medium text-white/38">
              Create reusable meals for one-tap logging.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderNutritionSavedMealsContent() {
    return (
      <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/42 p-2.5">
        {renderSelectedNutritionMeal()}
        <div className={selectedNutritionMeal ? "mt-2 space-y-1.5" : "space-y-1.5"}>
          {isNutritionSavedMealsLoading ? (
            <p className="px-2 py-2 text-xs font-medium text-white/42">
              Loading recent meals...
            </p>
          ) : nutritionSavedMealsError ? (
            <p className="px-2 py-2 text-xs font-medium text-red-200/72">
              {nutritionSavedMealsError}
            </p>
          ) : nutritionSavedMeals.length > 0 ? (
            nutritionSavedMeals.map((meal) => {
              const isSelected = selectedNutritionMeal?.id === meal.id;
              const hasReusableItems = (meal.meal_items?.length ?? 0) > 0;

              return (
                <button
                  key={meal.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!hasReusableItems}
                  onClick={() => selectNutritionSavedMeal(meal, "logged_meal")}
                  className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2.5 text-left outline-none transition ${
                    isSelected
                      ? "border-white/[0.14] bg-white/[0.08] shadow-[inset_3px_0_0_rgba(255,255,255,0.66)]"
                      : "border-white/[0.055] bg-white/[0.026] hover:border-white/[0.09] hover:bg-white/[0.045]"
                  } disabled:cursor-not-allowed disabled:opacity-42 focus-visible:border-white/[0.15] focus-visible:bg-white/[0.06]`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.055] bg-black/44 text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    {isSelected ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Utensils className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/84">
                      {getNutritionSavedMealDisplayName(meal)}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-white/40">
                      {getNutritionSavedMealTimeLabel(meal)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] font-semibold text-white/46">
                    {hasReusableItems ? getNutritionSavedMealMeta(meal) : "No items"}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-2 text-xs font-medium text-white/38">
              Saved meals will appear here after you log one.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderChefCatalog() {
    const showAvailableChefRecipesOnly = selectedChefFilter === "available";
    const visibleAvailableTiers: ChefAvailabilityTier[] = ["ready", ...(chefAvailableRevealLevel >= 1 ? ["needs_one" as const] : []), ...(chefAvailableRevealLevel >= 2 ? ["needs_two" as const] : [])];
    const selectedFilter = CHEF_FILTERS.find((filter) => filter.id === selectedChefFilter) ?? CHEF_FILTERS[0];
    const recipeMatchesSelectedFilter = (recipe: ReturnType<typeof getChefRecipesForNode>[number]) => {
      if (selectedFilter.tags.length === 0) return true;
      const resolvedOptionTags = getChefOptionGroupsForDishFamily(recipe.cuisineId, recipe.dishFamilyId)
        .filter((group) => recipe.optionGroupIds?.includes(group.id))
        .flatMap((group) => {
          const selectedOptionId = selectedChefOptions[group.id] ?? group.defaultOptionId;
          return group.options.find((option) => option.id === selectedOptionId)?.tags ?? [];
        });
      return selectedFilter.tags.some((tag) => recipe.tags.includes(tag) || resolvedOptionTags.includes(tag));
    };
    const familyHasMatches = (cuisineId: string, dishFamilyId: string) => {
      const familyKey = `${cuisineId}:${dishFamilyId}`;
      if (showAvailableChefRecipesOnly) return visibleAvailableTiers.some((tier) => (chefAvailabilityCatalog.recipeIdsByFamilyAndTier.get(`${familyKey}:${tier}`)?.size ?? 0) > 0);
      return getChefRecipesForNode({ cuisineId, dishFamilyId }).some(recipeMatchesSelectedFilter);
    };
    const cuisines = getChefCuisinesWithCounts().filter((cuisine) =>
      getChefDishFamiliesForCuisine(cuisine.id).some((family) => familyHasMatches(cuisine.id, family.id)),
    );
    const contextLabel = isGroceryDatabase
      ? "Use this as a grocery idea."
      : "Use this as a meal idea.";

    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/42">
        <div className="border-b border-white/[0.055] p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/68">
              <ChefHat className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/86">Chef ideas</p>
              <p className="truncate text-[11px] font-medium text-white/40">
                Simple recipes for whatever sounds good
              </p>
            </div>
          </div>
          <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CHEF_FILTERS.map((filter) => {
              const isSelected = selectedChefFilter === filter.id;
              return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedChefFilter(filter.id);
                  if (filter.id === "available" && selectedChefFilter !== "available") setChefAvailableRevealLevel(0);
                  setExpandedChefRecipeId(null);
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold outline-none transition ${
                  isSelected
                    ? "border-white/[0.18] bg-white/[0.12] text-white/88"
                    : "border-white/[0.06] bg-white/[0.035] text-white/46 hover:bg-white/[0.06]"
                }`}
              >
                {filter.label}
              </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {showAvailableChefRecipesOnly && isGroceryResourcesLoading ? <p className="px-4 py-5 text-xs font-medium text-white/40">Checking your groceries…</p> : null}
          {showAvailableChefRecipesOnly && !isGroceryResourcesLoading && chefAvailabilityCatalog.tierCounts.ready === 0 ? (
            <div className="px-4 py-5">
              <p className="text-sm font-semibold text-white/72">{chefAvailabilityCatalog.tierCounts.needs_one > 0 || chefAvailabilityCatalog.tierCounts.needs_two > 0 ? "No complete meals yet." : "Add groceries to unlock available meals."}</p>
              {chefAvailabilityCatalog.tierCounts.needs_one === 0 && chefAvailabilityCatalog.tierCounts.needs_two === 0 ? <p className="mt-1 text-[11px] leading-4 text-white/38">Try basics like chicken, eggs, tortillas, rice, pasta, cheese, beans, or bread.</p> : null}
            </div>
          ) : null}
          {!showAvailableChefRecipesOnly && selectedChefFilter !== "all" && cuisines.length === 0 ? (
            <p className="px-4 py-5 text-xs font-medium text-white/40">No meals match this filter yet.</p>
          ) : null}
          {!isGroceryResourcesLoading || !showAvailableChefRecipesOnly ? cuisines.map((cuisine) => {
            const isCuisineOpen = openChefCuisineId === cuisine.id;
            return (
              <section key={cuisine.id}>
                <button
                  type="button"
                  aria-expanded={isCuisineOpen}
                  onClick={() => {
                    setOpenChefCuisineId(isCuisineOpen ? null : cuisine.id);
                    setOpenChefDishFamilyKey(null);
                    setSelectedChefStyleId(null);
                    setExpandedChefRecipeId(null);
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none transition hover:bg-white/[0.035] focus-visible:bg-white/[0.05]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.065] bg-white/[0.035] text-[15px] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]" aria-hidden="true">
                    {resolveChefCatalogIcon(cuisine.icon)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/84">
                      {cuisine.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-white/38">
                      {cuisine.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/36">{cuisine.recipeCount}</span>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-white/34 transition-transform ${isCuisineOpen ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {isCuisineOpen ? (
                  <div className="border-t border-white/[0.045] bg-white/[0.018] px-2 py-2">
                    {getChefDishFamiliesForCuisine(cuisine.id).filter((dishFamily) => familyHasMatches(cuisine.id, dishFamily.id)).map((dishFamily) => {
                      const familyKey = `${cuisine.id}:${dishFamily.id}`;
                      const isFamilyOpen = openChefDishFamilyKey === familyKey;
                      const optionGroups = isFamilyOpen ? getChefOptionGroupsForDishFamily(cuisine.id, dishFamily.id) : [];
                      const styles = isFamilyOpen && optionGroups.length === 0 ? getChefStylesForDishFamily(cuisine.id, dishFamily.id) : [];
                      const recipes = isFamilyOpen ? getChefRecipesForNode({ cuisineId: cuisine.id, dishFamilyId: dishFamily.id, styleId: selectedChefStyleId ?? undefined }).filter((recipe) => recipeMatchesSelectedFilter(recipe) && (!showAvailableChefRecipesOnly || visibleAvailableTiers.includes(chefAvailabilityCatalog.recipeTiers.get(recipe.id)?.tier ?? "unavailable"))).sort((a, b) => {
                        if (!showAvailableChefRecipesOnly) return 0;
                        const left = chefAvailabilityCatalog.recipeTiers.get(a.id);
                        const right = chefAvailabilityCatalog.recipeTiers.get(b.id);
                        if (!left || !right) return 0;
                        const tierOrder = { ready: 0, needs_one: 1, needs_two: 2, unavailable: 3 };
                        if (left.tier !== right.tier) return tierOrder[left.tier] - tierOrder[right.tier];
                        if (left.tier === "ready") return Number(left.quantityUncertain) - Number(right.quantityUncertain) || right.matchConfidence - left.matchConfidence;
                        return right.satisfiedRequiredSlots - left.satisfiedRequiredSlots || right.anchorMatchStrength - left.anchorMatchStrength || right.matchConfidence - left.matchConfidence || Number(left.quantityUncertain) - Number(right.quantityUncertain) || left.missingRequiredSlots.length - right.missingRequiredSlots.length || left.missingExtrasCount - right.missingExtrasCount;
                      }) : [];
                      return (
                        <div key={familyKey} className="overflow-hidden rounded-xl border border-white/[0.05] bg-black/30 [&+&]:mt-1.5">
                          <button type="button" aria-expanded={isFamilyOpen} onClick={() => {
                            setOpenChefDishFamilyKey(isFamilyOpen ? null : familyKey);
                            setSelectedChefStyleId(null);
                            setExpandedChefRecipeId(null);
                          }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition hover:bg-white/[0.035] focus-visible:bg-white/[0.05]">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.055] bg-white/[0.03] text-[13px] leading-none" aria-hidden="true">
                              {resolveChefCatalogIcon(dishFamily.icon)}
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-semibold text-white/74">{dishFamily.label}</span>
                            <span className="text-[10px] font-semibold tabular-nums text-white/32">{dishFamily.recipeCount}</span>
                            <ChevronRight className={`h-3.5 w-3.5 text-white/30 transition-transform ${isFamilyOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                          </button>
                          {isFamilyOpen ? (
                            <div className="border-t border-white/[0.045] p-2">
                              {optionGroups.map((optionGroup) => (
                                <div key={optionGroup.id} className="mb-2">
                                  <p className="mb-1 px-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/28">{optionGroup.label}</p>
                                  <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {optionGroup.options.map((chefOption) => {
                                      const selectedOptionId = selectedChefOptions[optionGroup.id] ?? optionGroup.defaultOptionId;
                                      const isSelected = selectedOptionId === chefOption.id;
                                      const isOptionAvailable = chefAvailabilityCatalog.availableOptionIdsByGroup.get(optionGroup.id)?.has(chefOption.id) ?? false;
                                      return <button key={chefOption.id} type="button" aria-pressed={isSelected} onClick={() => { setSelectedChefOptions((current) => ({ ...current, [optionGroup.id]: chefOption.id })); setExpandedChefRecipeId(null); }} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${isSelected ? "border-white/[0.16] bg-white/[0.1] text-white/80" : showAvailableChefRecipesOnly && !isOptionAvailable ? "border-white/[0.035] text-white/20" : "border-white/[0.05] text-white/38"}`}>{chefOption.shortLabel ?? chefOption.label}</button>;
                                    })}
                                  </div>
                                </div>
                              ))}
                              {styles.length > 0 ? (
                                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                  <button type="button" aria-pressed={!selectedChefStyleId} onClick={() => { setSelectedChefStyleId(null); setExpandedChefRecipeId(null); }} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${!selectedChefStyleId ? "border-white/[0.16] bg-white/[0.1] text-white/80" : "border-white/[0.05] text-white/38"}`}>All</button>
                                  {styles.map((chefStyle) => <button key={chefStyle.id} type="button" aria-pressed={selectedChefStyleId === chefStyle.id} onClick={() => { setSelectedChefStyleId(chefStyle.id); setExpandedChefRecipeId(null); }} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${selectedChefStyleId === chefStyle.id ? "border-white/[0.16] bg-white/[0.1] text-white/80" : "border-white/[0.05] text-white/38"}`}>{chefStyle.label}</button>)}
                                </div>
                              ) : null}
                              <div className="space-y-1.5">
                                {recipes.length > 0 ? recipes.map((recipe, recipeIndex) => {
                                  const isExpanded = expandedChefRecipeId === recipe.id;
                                  const familyOptions = Object.fromEntries(optionGroups.map((group) => [group.id, selectedChefOptions[group.id] ?? group.defaultOptionId]));
                                  const recipeOptions = { ...getDefaultChefRecipeOptions(recipe), ...familyOptions };
                                  const resolvedBuild = recipe.dishTemplate ? resolveChefDishTemplate(recipe, selectedChefOptions, groceryResourceItems) : null;
                                  const resolvedIngredients = resolvedBuild?.ingredients ?? resolveChefRecipeIngredients(recipe, recipeOptions);
                                  const resolvedName = resolvedBuild?.title ?? resolveChefRecipeName(recipe, recipeOptions);
                                  const nutrition = resolvedBuild?.nutrition ?? calculateResolvedChefRecipeNutrition(recipe, recipeOptions);
                                  const availability = resolvedBuild?.availability ?? calculateResolvedChefRecipeAvailability(recipe, recipeOptions, groceryResourceItems);
                                  const tierInfo = chefAvailabilityCatalog.recipeTiers.get(recipe.id);
                                  const previousTier = recipeIndex > 0 ? chefAvailabilityCatalog.recipeTiers.get(recipes[recipeIndex - 1].id)?.tier : null;
                                  return (
                                    <Fragment key={recipe.id}>
                                    {showAvailableChefRecipesOnly && tierInfo?.tier !== "ready" && tierInfo?.tier !== previousTier ? <p className="px-1 pt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/36">{tierInfo.tier === "needs_one" ? "Need 1 ingredient" : "Need 2 ingredients"}</p> : null}
                                    <article className="overflow-hidden rounded-lg border border-white/[0.045] bg-white/[0.025]">
                                      <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedChefRecipeId(isExpanded ? null : recipe.id)} className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left outline-none hover:bg-white/[0.035] focus-visible:bg-white/[0.05]">
                                        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white/78">{resolvedName}</span><span className="mt-0.5 block text-[10px] font-medium text-white/34">{recipe.timeMinutes} min · {recipe.difficulty}</span>{(tierInfo?.tier !== "ready" ? tierInfo?.compactSummary : resolvedBuild?.compactSummary) ? <span className="mt-0.5 block truncate text-[10px] font-medium text-white/42">{tierInfo?.tier !== "ready" ? tierInfo?.compactSummary : resolvedBuild?.compactSummary}</span> : null}</span>
                                        <span className="hidden shrink-0 rounded-full border border-white/[0.06] bg-black/30 px-2 py-1 text-[9px] font-semibold text-white/48 min-[360px]:inline">{formatChefMacroSummary(nutrition)}</span>
                                        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform ${isExpanded ? "rotate-90" : ""}`} aria-hidden="true" />
                                      </button>
                                      {isExpanded ? (
                                        <div className="border-t border-white/[0.045] px-2.5 pb-2.5 pt-2">
                                          <div className="flex flex-wrap gap-1">{recipe.tags.map((tag) => <span key={tag} className="rounded-full border border-white/[0.05] bg-black/25 px-2 py-0.5 text-[9px] font-semibold text-white/40">{tag}</span>)}</div>
                                          <p className="mt-2 text-xs leading-5 text-white/48">{recipe.shortDescription}</p>
                                          {resolvedBuild ? <div className="mt-2.5 space-y-2">{resolvedBuild.slots.map((slot) => <div key={slot.slotId}><p className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">{slot.label}{slot.role === "structural" ? " · required" : ""}</p><div className="flex flex-wrap gap-1">{slot.availableCandidates.map((candidate) => { const optionKey = `${recipe.id}:${slot.slotId}`; const selectedIds = (selectedChefOptions[optionKey] ?? slot.selected.map((item) => item.id).join(",")).split(",").filter(Boolean); const isSelected = selectedIds.includes(candidate.id); return <button key={candidate.id} type="button" aria-pressed={isSelected} onClick={() => setSelectedChefOptions((current) => { const currentIds = (current[optionKey] ?? slot.selected.map((item) => item.id).join(",")).split(",").filter(Boolean); const nextIds = slot.role === "structural" || slot.availableCandidates.length === 1 ? [candidate.id] : currentIds.includes(candidate.id) ? currentIds.filter((id) => id !== candidate.id) : [...currentIds, candidate.id]; return { ...current, [optionKey]: nextIds.join(",") }; })} className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${isSelected ? "border-white/[0.16] bg-white/[0.1] text-white/78" : "border-white/[0.05] text-white/38"}`}>{candidate.label}</button>; })}{slot.availableCandidates.length === 0 ? <span className="text-[10px] text-white/28">No matching groceries</span> : null}</div></div>)}</div> : null}
                                          <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-xl border border-white/[0.055] bg-black/30 p-1.5">
                                            {[{ label: "Calories", value: formatChefNutritionNumber(nutrition.calories) }, { label: "Protein", value: `${formatChefNutritionNumber(nutrition.protein_g)}g` }, { label: "Carbs", value: `${formatChefNutritionNumber(nutrition.carbs_g)}g` }, { label: "Fat", value: `${formatChefNutritionNumber(nutrition.fat_g)}g` }].map((macro) => <div key={macro.label} className="rounded-lg bg-white/[0.035] px-1 py-2 text-center"><span className="block text-xs font-bold tabular-nums text-white/78">{macro.value}</span><span className="mt-0.5 block text-[8px] font-bold uppercase tracking-wide text-white/28">{macro.label}</span></div>)}
                                          </div>
                                          <div className="mt-2 rounded-lg border border-white/[0.04] bg-black/25 px-2.5 py-2 text-[10px] font-medium text-white/46">
                                            <p>{resolvedBuild ? resolvedBuild.state.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase()) : availability.summary}</p>
                                            {(resolvedBuild?.missingRequiredSlots ?? availability.missingIngredientNames).length > 0 ? <p className="mt-0.5 text-white/34">Missing required: {(resolvedBuild?.missingRequiredSlots ?? availability.missingIngredientNames).join(", ")}</p> : null}
                                          </div>
                                          {resolvedBuild && resolvedBuild.missingExtras.length > 0 ? <div className="mt-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">Missing extras</p><p className="mt-0.5 text-[11px] text-white/42">{resolvedBuild.missingExtras.join(", ")}</p></div> : null}
                                          <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white/30">Ingredients</p>
                                          <ul className="mt-1 space-y-1">{resolvedIngredients.map((item) => { const itemNutrition = calculateChefIngredientNutrition(item); const itemAvailability = availability.ingredients[item.id]; const availabilityLabel = itemAvailability?.availability === "have" ? "Have" : itemAvailability?.availability === "partial" ? "Partial" : itemAvailability?.availability === "unknown" ? "Unknown" : "Missing"; return <li key={`${recipe.id}-${item.id}`} className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2 py-1.5"><span className="text-sm" aria-hidden="true">{item.icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-white/62">{item.quantity} {item.unit} {item.name}</span>{!itemNutrition.unknownNutrition ? <span className="block text-[9px] font-medium text-white/28">{formatChefNutritionNumber(itemNutrition.calories)} cal · {formatChefNutritionNumber(itemNutrition.protein_g)}g protein{itemNutrition.estimated ? " · est." : ""}</span> : <span className="block text-[9px] font-medium text-white/24">Nutrition unknown</span>}</span><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${availabilityLabel === "Have" ? "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-100/65" : "border-white/[0.055] bg-black/25 text-white/38"}`}>{availabilityLabel}</span></li>; })}</ul>
                                          <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-white/30">Steps</p>
                                          <ol className="mt-1 space-y-1 text-xs leading-5 text-white/50">{(resolvedBuild?.steps ?? recipe.steps).map((step, index) => <li key={`${recipe.id}-step-${index}`} className="flex gap-2"><span className="text-white/25">{index + 1}.</span><span>{step}</span></li>)}</ol>
                                          <p className="mt-2.5 rounded-lg border border-white/[0.04] bg-black/25 px-2.5 py-2 text-[11px] font-medium text-white/42">{contextLabel}</p>
                                        </div>
                                      ) : null}
                                    </article></Fragment>
                                  );
                                }) : <p className="px-2 py-3 text-xs font-medium text-white/36">{showAvailableChefRecipesOnly && optionGroups.length > 0 ? "Nothing available for this build." : "No meals match this filter yet."}</p>}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          }) : null}
          {showAvailableChefRecipesOnly && !isGroceryResourcesLoading && chefAvailableRevealLevel === 0 && chefAvailabilityCatalog.tierCounts.needs_one > 0 ? <button type="button" onClick={() => setChefAvailableRevealLevel(1)} className="w-full px-4 py-3 text-left text-xs font-semibold text-white/62 hover:bg-white/[0.035]">See meals needing 1 ingredient · {chefAvailabilityCatalog.tierCounts.needs_one}</button> : null}
          {showAvailableChefRecipesOnly && !isGroceryResourcesLoading && chefAvailableRevealLevel === 0 && chefAvailabilityCatalog.tierCounts.needs_one === 0 && chefAvailabilityCatalog.tierCounts.needs_two > 0 ? <button type="button" onClick={() => setChefAvailableRevealLevel(2)} className="w-full px-4 py-3 text-left text-xs font-semibold text-white/62 hover:bg-white/[0.035]">See meals needing 2 ingredients · {chefAvailabilityCatalog.tierCounts.needs_two}</button> : null}
          {showAvailableChefRecipesOnly && !isGroceryResourcesLoading && chefAvailableRevealLevel === 1 && chefAvailabilityCatalog.tierCounts.needs_two > 0 ? <button type="button" onClick={() => setChefAvailableRevealLevel(2)} className="w-full px-4 py-3 text-left text-xs font-semibold text-white/62 hover:bg-white/[0.035]">See meals needing 2 ingredients · {chefAvailabilityCatalog.tierCounts.needs_two}</button> : null}
        </div>
      </div>
    );
  }

  function renderGroceryPlanningPlaceholder(
    tab: Extract<NutritionFoodActionTabId, "recipes" | "chef" | "meal-plan">,
  ) {
    const content = {
      recipes: {
        icon: BookOpen,
        title: "Recipes",
        body: "Saved and custom recipes will live here later. Browse menu ideas in Chef.",
      },
      chef: {
        icon: ChefHat,
        title: "Chef",
        body: "Chef help for cooking from available groceries will live here later.",
      },
      "meal-plan": {
        icon: Calendar,
        title: "Meal Plan",
        body: "Plan meals from Grocery List items here later.",
      },
    }[tab];
    const Icon = content.icon;

    return (
      <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/42 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.045] text-white/66 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/84">{content.title}</p>
            <p className="mt-1 text-xs font-medium leading-5 text-white/42">
              {content.body}
            </p>
          </div>
        </div>
      </div>
    );
  }

  function renderNutritionFoodBrowseContent() {
    const browseSelectedCount = isGroceryDatabase
      ? Object.keys(grocerySearchDrafts).length
      : selectedNutritionFoods.length;

    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#090909]">
        {browseSelectedCount > 0 ? (
          <div className="flex min-h-9 items-center gap-2 border-b border-white/[0.055] bg-white/[0.035] px-3 text-xs font-semibold text-white/62">
            <Check className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {browseSelectedCount} selected
            </span>
            <span className="shrink-0 text-white/34">· Search and Browse</span>
          </div>
        ) : null}

        <div>
          {FOOD_BROWSE_DEPARTMENTS.map((department) => {
            const isDepartmentOpen = openNutritionBrowseDepartment === department.label;
            const isFirstDepartment = department.label === FOOD_BROWSE_DEPARTMENTS[0].label;

            return (
              <Fragment key={department.label}>
                <button
                  type="button"
                  aria-expanded={isDepartmentOpen}
                  onClick={() => {
                    setOpenNutritionBrowseDepartment((currentDepartment) =>
                      currentDepartment === department.label ? null : department.label,
                    );
                    setOpenNutritionBrowseAisle(null);
                  }}
                  className={`flex h-11 w-full items-center gap-3 border-t px-3 text-left outline-none transition ${
                    browseSelectedCount > 0 || !isFirstDepartment
                      ? "border-white/[0.055]"
                      : "border-transparent"
                  } ${
                    isDepartmentOpen
                      ? "bg-white/[0.035] text-white/90"
                      : "text-white/62 hover:bg-white/[0.026] hover:text-white/82"
                  } focus-visible:bg-white/[0.06]`}
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 stroke-[1.65] transition ${
                      isDepartmentOpen ? "rotate-90 text-white/58" : "text-white/32"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold">
                    <NutritionFoodGroupIconSlot label={department.label} />
                    <span className="min-w-0 truncate">{department.label}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-white/28">
                    {department.aisles.length}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isDepartmentOpen ? (
                    <motion.div
                      key={`${department.label}-aisles`}
                      initial={{ height: 0, opacity: 0, y: -2 }}
                      animate={{ height: "auto", opacity: 1, y: 0 }}
                      exit={{ height: 0, opacity: 0, y: -2 }}
                      transition={nutritionBrowseAccordionTransition}
                      className="overflow-hidden"
                    >
                      {department.aisles.map((aisle) => {
                        const isAisleOpen = openNutritionBrowseAisle === aisle;

                        return (
                          <Fragment key={aisle}>
                            <button
                              type="button"
                              aria-expanded={isAisleOpen}
                              onClick={() => {
                                setOpenNutritionBrowseDepartment(department.label);
                                setOpenNutritionBrowseAisle((currentAisle) =>
                                  currentAisle === aisle ? null : aisle,
                                );
                              }}
                              className={`flex h-10 w-full items-center gap-2.5 border-t border-white/[0.045] py-0 pl-7 pr-3 text-left outline-none transition ${
                                isAisleOpen
                                  ? "bg-white/[0.026] text-white/76"
                                  : "text-white/44 hover:bg-white/[0.022] hover:text-white/66"
                              } focus-visible:bg-white/[0.055]`}
                            >
                              <ChevronRight
                                className={`h-3.5 w-3.5 shrink-0 stroke-[1.65] transition ${
                                  isAisleOpen ? "rotate-90 text-white/50" : "text-white/26"
                                }`}
                                aria-hidden="true"
                              />
                              <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs font-semibold">
                                <NutritionFoodGroupIconSlot label={aisle} />
                                <span className="min-w-0 truncate">{aisle}</span>
                              </span>
                            </button>

                            <AnimatePresence initial={false}>
                              {isAisleOpen ? (
                                <motion.div
                                  key={`${department.label}-${aisle}-foods`}
                                  initial={{ height: 0, opacity: 0, y: -2 }}
                                  animate={{ height: "auto", opacity: 1, y: 0 }}
                                  exit={{ height: 0, opacity: 0, y: -2 }}
                                  transition={nutritionBrowseAccordionTransition}
                                  className="overflow-hidden"
                                >
                                  {isNutritionFoodBrowseLoading ? (
                                    <p className="border-t border-white/[0.045] px-12 py-2.5 text-xs font-medium text-white/40">
                                      Loading foods...
                                    </p>
                                  ) : nutritionFoodBrowseError ? (
                                    <p className="border-t border-white/[0.045] px-12 py-2.5 text-xs font-medium text-red-200/72">
                                      {nutritionFoodBrowseError}
                                    </p>
                                  ) : nutritionFoodBrowseResults.length > 0 ? (
                                    nutritionFoodBrowseResults.map((food) => {
                                      const selectedItem = getSelectedNutritionFoodItem(food);
                                      const groceryDraftKey = isGroceryDatabase
                                        ? getGrocerySearchDraftKey(food)
                                        : null;
                                      const isSelected = isGroceryDatabase
                                        ? Boolean(
                                            groceryDraftKey &&
                                              grocerySearchDrafts[groceryDraftKey],
                                          )
                                        : Boolean(selectedItem);
                                      const nutritionPreview =
                                        selectedItem
                                          ? isGroceryDatabase
                                            ? food.brand_name
                                            : getNutritionSelectedFoodLineMeta(selectedItem)
                                          : isGroceryDatabase
                                            ? food.brand_name
                                            : getFoodBrowseNutritionPreview(food);

                                      return (
                                        <div
                                          key={food.id}
                                          className={`border-t border-white/[0.04] transition ${
                                            isSelected
                                              ? "bg-white/[0.07] shadow-[inset_3px_0_0_rgba(255,255,255,0.68)]"
                                              : "hover:bg-white/[0.022]"
                                          } focus-visible:bg-white/[0.055]`}
                                        >
                                          <div className="flex w-full items-center gap-3 py-2.5 pl-12 pr-3 text-left">
                                            <button
                                              type="button"
                                              aria-pressed={isSelected}
                                              onClick={() =>
                                                isGroceryDatabase
                                                  ? toggleGrocerySearchFood(food)
                                                  : toggleNutritionFoodSelection(food)
                                              }
                                              className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
                                            >
                                              <NutritionFoodIcon food={food} />
                                              <span className="min-w-0 flex-1">
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                  {isSelected && !isGroceryDatabase ? (
                                                    <Check
                                                      className="h-3.5 w-3.5 shrink-0 text-white/68"
                                                      aria-hidden="true"
                                                    />
                                                  ) : null}
                                                  <span className="block truncate text-sm font-semibold text-white/84">
                                                    {food.name}
                                                  </span>
                                                </span>
                                                <span className="mt-0.5 block truncate text-[11px] font-medium text-white/38">
                                                  {nutritionPreview ||
                                                    (isGroceryDatabase
                                                      ? "Catalog item"
                                                      : "Nutrition details unavailable")}
                                                </span>
                                              </span>
                                            </button>
                                            {!isGroceryDatabase && selectedItem ? (
                                              renderNutritionFoodQuantityControl(selectedItem)
                                            ) : isSelected ? (
                                              <Check
                                                className="h-4 w-4 shrink-0 text-emerald-100/82"
                                                aria-hidden="true"
                                              />
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <p className="border-t border-white/[0.045] px-12 py-2.5 text-xs font-medium text-white/34">
                                      No foods here yet.
                                    </p>
                                  )}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </Fragment>
                        );
                      })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  function renderNutritionFoodSearchField(field: NoteDatabaseFieldDefinition) {
    const normalizedBarcodeValue = normalizeFoodBarcode(nutritionBarcodeValue);
    const isGroceryMode = isGroceryDatabase;
    const searchPlaceholder = isGroceryMode ? "Search groceries..." : "Search foods...";

    return (
      <div key={field.id} className="block">
        {renderNutritionDailyProgress()}
        {isNutritionMealBuilderOpen ? (
          renderNutritionMealBuilder()
        ) : isNutritionRecipeBuilderOpen ? (
          renderNutritionRecipeBuilder()
        ) : (
          <>
            {renderNutritionFoodActionTabs()}

            {selectedNutritionFoodAction === "custom" ? (
              isGroceryMode ? (
                renderGroceryCustomFoodFields()
              ) : (
                <div className="mt-3">{renderDatabaseEntryField(field)}</div>
              )
            ) : selectedNutritionFoodAction === "scan" ? (
              <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/42 p-3">
            <button
              type="button"
              onClick={() => void scanAndLookupNutritionBarcode()}
              disabled={isNutritionBarcodeScannerLoading || isNutritionBarcodeLookupLoading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.13] px-3 text-sm font-semibold text-white/88 outline-none transition hover:border-white/[0.16] hover:bg-white/[0.17] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-1 focus-visible:ring-white/16"
            >
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              {isNutritionBarcodeScannerLoading
                ? isNutritionBarcodeLookupLoading
                  ? "Looking up..."
                  : "Scanning..."
                : "Scan barcode"}
            </button>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-white/46">Manual barcode</span>
              <div className="relative mt-2">
                <ScanLine
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={nutritionBarcodeValue}
                  onChange={(event) => {
                    setNutritionBarcodeValue(event.target.value);
                    setNutritionBarcodeLookupStatus(null);
                    setNutritionBarcodeLookupError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void lookupNutritionBarcode();
                    }
                  }}
                  className="h-11 w-full rounded-lg border border-white/[0.05] bg-white/[0.045] pl-10 pr-3 text-sm font-medium text-white outline-none transition placeholder:text-white/26 selection:bg-white/[0.18] hover:border-white/[0.08] hover:bg-white/[0.055] focus-visible:border-white/[0.14] focus-visible:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/10"
                  placeholder="Enter barcode"
                  aria-label="Barcode"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => void lookupNutritionBarcode()}
              disabled={isNutritionBarcodeLookupLoading || !normalizedBarcodeValue}
              className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.075] px-3 text-xs font-semibold text-white/78 outline-none transition hover:border-white/[0.1] hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-white/14"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              {isNutritionBarcodeLookupLoading ? "Looking up..." : "Lookup barcode"}
            </button>
            {nutritionBarcodeLookupError ? (
              <p className="mt-2 text-xs font-medium text-red-200/72">
                {nutritionBarcodeLookupError}
              </p>
            ) : nutritionBarcodeLookupStatus ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-white/42">
                  {nutritionBarcodeLookupStatus}
                </p>
                {isGroceryMode &&
                nutritionBarcodeLookupStatus === "Product not found" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEntryFormValues((current) => ({
                        ...current,
                        [ON_HAND_QUANTITY_FIELD_ID]: 1,
                        [ON_HAND_UNIT_FIELD_ID]: "package",
                        metadata: {
                          ...getRecordMetadata(current.metadata),
                          barcode: normalizedBarcodeValue,
                          scan_status: "not_found",
                          scan_source: "manual_fallback",
                        },
                      }));
                      setSelectedNutritionFoodAction("custom");
                      setNutritionBarcodeLookupStatus(null);
                    }}
                    className="inline-flex h-8 items-center rounded-lg border border-white/[0.07] bg-white/[0.07] px-2.5 text-xs font-semibold text-white/76 outline-none transition hover:bg-white/[0.11] focus-visible:ring-1 focus-visible:ring-white/16"
                  >
                    Add manually
                  </button>
                ) : null}
              </div>
            ) : null}
            {renderSelectedNutritionFoods()}
          </div>
        ) : selectedNutritionFoodAction === "grocery" ? (
          isGroceryMode ? renderGroceryResourcesContent() : renderNutritionGroceryContent()
        ) : selectedNutritionFoodAction === "meals" ? (
          renderNutritionReusableMealsContent()
        ) : selectedNutritionFoodAction === "recent" ? (
          renderNutritionSavedMealsContent()
        ) : selectedNutritionFoodAction === "recipes" ? (
          renderGroceryPlanningPlaceholder("recipes")
        ) : selectedNutritionFoodAction === "chef" ? (
          renderChefCatalog()
        ) : selectedNutritionFoodAction === "meal-plan" && isGroceryMode ? (
          renderGroceryPlanningPlaceholder("meal-plan")
        ) : (
          <>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36"
                aria-hidden="true"
              />
              <input
                type="text"
                value={nutritionFoodSearchQuery}
                onChange={(event) => setNutritionFoodSearchQuery(event.target.value)}
                className="h-12 w-full rounded-xl border border-white/[0.055] bg-black/42 pl-10 pr-3 text-[15px] font-medium text-white outline-none transition placeholder:text-white/28 selection:bg-white/[0.18] hover:border-white/[0.09] hover:bg-black/48 focus-visible:border-white/[0.16] focus-visible:bg-black/54 focus-visible:ring-1 focus-visible:ring-white/12"
                placeholder={searchPlaceholder}
                aria-label="Food"
              />
            </div>
            {renderSelectedNutritionFoods()}
            {selectedNutritionFoodAction === "search" &&
            normalizedNutritionFoodSearchValue.length >= 2 ? (
              renderNutritionFoodResultList({
                foods: nutritionFoodSearchResults,
                isLoading: isNutritionFoodSearchLoading,
                error: nutritionFoodSearchError,
                loadingLabel: "Searching...",
                emptyLabel: isGroceryMode ? "No groceries found." : "No foods found.",
              })
            ) : null}
            {selectedNutritionFoodAction === "search" ? renderNutritionFoodBrowseContent() : null}
          </>
        )}
          </>
        )}
      </div>
    );
  }

  async function saveDatabaseEntry(formValuesOverride?: Record<string, unknown>) {
    if (isSubmitting || isDatabaseEntrySubmittingRef.current) return;
    isDatabaseEntrySubmittingRef.current = true;

    const formValues = formValuesOverride ?? entryFormValues;
    const now = new Date().toISOString();
    const entryId = initialEntry?.id ?? buildClientDatabaseEntryId();
    const values = databaseFields.reduce<Record<string, unknown>>(
      (nextValues, field) => {
        const rawFieldValue = formValues[field.id];
        const rawValue =
          typeof rawFieldValue === "string"
            ? rawFieldValue
            : rawFieldValue == null
              ? ""
              : String(rawFieldValue);
        const value = getDatabaseEntryFieldValue(field, rawValue);

        if (isUsefulDatabaseEntryValue(value)) {
          nextValues[field.id] = value;
        }

        return nextValues;
      },
      {},
    );

    if (isGroceryDatabase) {
      const foodId = formValues.food_id;
      const brandName = formValues.brand_name;

      delete values[ON_HAND_NOTES_FIELD_ID];

      if (
        selectedNutritionFoodAction === "custom" &&
        !isUsefulDatabaseEntryValue(values[ON_HAND_QUANTITY_FIELD_ID])
      ) {
        values[ON_HAND_QUANTITY_FIELD_ID] = 1;
      }
      if (
        selectedNutritionFoodAction === "custom" &&
        !isUsefulDatabaseEntryValue(values[ON_HAND_UNIT_FIELD_ID])
      ) {
        values[ON_HAND_UNIT_FIELD_ID] = "package";
      }
      if (typeof foodId === "string" && foodId.trim()) {
        values.food_id = foodId;
      }
      if (typeof brandName === "string" && brandName.trim()) {
        values.brand_name = brandName;
      }
      if (selectedNutritionFoodAction === "custom") {
        values.metadata = getGroceryCustomMetadata(formValues);
      } else {
        values[GROCERY_CUSTOM_CALORIES_FIELD_ID] =
          formValues[GROCERY_CUSTOM_CALORIES_FIELD_ID] ?? "";
        values[GROCERY_CUSTOM_CARBS_FIELD_ID] =
          formValues[GROCERY_CUSTOM_CARBS_FIELD_ID] ?? "";
        values[GROCERY_CUSTOM_PROTEIN_FIELD_ID] =
          formValues[GROCERY_CUSTOM_PROTEIN_FIELD_ID] ?? "";
        values[GROCERY_CUSTOM_FAT_FIELD_ID] =
          formValues[GROCERY_CUSTOM_FAT_FIELD_ID] ?? "";
        values.metadata = getCorrectedGroceryNutritionMetadata({
          ...formValues,
          ...values,
        });
      }
    }

    const nextEntry: NoteDatabaseEntry = {
      id: entryId,
      createdAt: initialEntry?.createdAt ?? now,
      updatedAt: now,
      values,
    };
    const nutritionMealDraft = buildNutritionMealDraft({
      databaseDefinition,
      databaseFields,
      selectedFoods: selectedNutritionFoods,
      selectedMeal: selectedNutritionMeal,
      selectedRecipe: selectedNutritionRecipe,
      selectedAction: selectedNutritionFoodAction,
      values,
      entryId,
      now,
    });

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (isGroceryDatabase && selectedNutritionFoodAction === "scan") {
        const stagedDraftKeys = Object.keys(grocerySearchDrafts).filter(
          (draftKey) => grocerySearchDrafts[draftKey]?.status !== "success",
        );
        if (stagedDraftKeys.length === 0) {
          setSubmitError("Scan at least one grocery before saving.");
          return;
        }

        const results = [];
        for (const draftKey of stagedDraftKeys) {
          results.push(await saveGrocerySearchFood(draftKey));
        }
        if (results.some((wasSaved) => !wasSaved)) {
          setSubmitError("Some groceries could not be added. Check their amounts and try again.");
          return;
        }

        void hapticComplete();
        onClose();
        return;
      }

      let entryToSave = nextEntry;

      if (nutritionMealDraft) {
        try {
          const nutritionMealId = await createNutritionMeal(nutritionMealDraft);
          if (selectedNutritionFoodAction === "grocery") {
            await depleteGroceryFromNutritionItems(selectedNutritionFoods);
          }
          await refreshNutritionDailyTotals();
          entryToSave = {
            ...nextEntry,
            values: {
              ...nextEntry.values,
              nutritionMealId,
            },
          };
        } catch (mealError) {
          console.error("Failed to create nutrition meal", {
            error: mealError,
            databaseId: databaseDefinition.id,
            entryId: nextEntry.id,
          });
          await onSaveEntry(nextEntry);
          void hapticErrorPattern();
          setSubmitError("Saved note entry, but the meal record could not be created.");
          return;
        }
      }

      await onSaveEntry(entryToSave);
      void hapticComplete();
      onClose();
    } catch (error) {
      console.error("Failed to save database entry", { error, databaseId: databaseDefinition.id });
      void hapticErrorPattern();
      setSubmitError("Unable to save entry right now.");
    } finally {
      isDatabaseEntrySubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center overflow-hidden overscroll-contain bg-black/58 p-3 backdrop-blur-sm sm:p-6 ${
        overlayClassName ?? ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-database-entry-form-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void hapticSnap();
          onClose();
        }
      }}
    >
      <div className="animate-in fade-in-0 zoom-in-95 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[30px] border border-white/[0.04] bg-[#090909] shadow-[0_24px_80px_-32px_rgba(0,0,0,1)] duration-200">
        <div className="relative border-b border-white/[0.04] px-4 py-4">
          <h2
            id="note-database-entry-form-title"
            className="truncate px-10 text-center text-base font-semibold leading-6 text-white"
          >
            {databaseFormTitle}
          </h2>
          <button
            type="button"
            aria-label="Close entry form"
            onClick={() => {
              void hapticSnap();
              onClose();
            }}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white/82 focus-visible:bg-white/[0.08] focus-visible:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 ${
            isDefaultNutritionDatabase || isDefaultFitnessDatabase ? "pt-2" : "pt-4"
          } [-webkit-overflow-scrolling:touch]`}
        >
          {databaseFields.length > 0 ? (
            <div className="space-y-4">
              {isDefaultFitnessDatabase ? renderFitnessTabContent() : null}
              {editableDatabaseFields.map((field, fieldIndex) => {
                if (!shouldShowFitnessEntryFields) {
                  return null;
                }

                if (nutritionFoodField?.id === field.id || groceryFoodField?.id === field.id) {
                  return renderNutritionFoodSearchField(field);
                }

                if (shouldHideNutritionEntryFields) {
                  return null;
                }

                if (hiddenGroceryFoodSearchFieldIds.has(field.id)) {
                  return null;
                }

                if (shouldRenderNutritionMacroGrid && nutritionMacroFieldIds.has(field.id)) {
                  if (fieldIndex !== firstNutritionMacroFieldIndex) return null;

                  return (
                    <div key="nutrition-macro-fields" className="grid grid-cols-3 gap-2">
                      {nutritionMacroFields.map((macroField) => (
                        <div key={macroField.id} className="min-w-0">
                          {renderDatabaseEntryField(macroField, { compact: true })}
                        </div>
                      ))}
                    </div>
                  );
                }

                return renderDatabaseEntryField(field);
              })}
              {createdAtMetadataTime && shouldShowFitnessEntryFields ? (
                <p className="!mt-1 px-1 text-center text-[10px] font-medium leading-none text-white/36">
                  {createdAtMetadataTime}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.025] px-3 py-6 text-center text-sm text-white/42">
              Add fields in the builder before creating entries.
            </div>
          )}
        </div>

        {submitError ? (
          <p className="border-t border-white/[0.04] px-4 pt-3 text-center text-xs font-medium text-red-200/78">
            {submitError}
          </p>
        ) : null}

        {shouldShowEntryFooter &&
        !(isGroceryDatabase && selectedNutritionFoodAction === "search") ? (
          <div
            className={`border-t border-white/[0.04] p-3 sm:p-4 ${
              isDefaultNutritionDatabase ? "flex" : "flex gap-2"
            }`}
          >
            {!isDefaultNutritionDatabase ? (
              <button
                type="button"
                onClick={() => {
                  void hapticSnap();
                  onClose();
                }}
                disabled={isSubmitting}
                className="flex h-11 flex-1 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.035] text-sm font-semibold text-white/62 outline-none transition hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-white/82 focus-visible:ring-1 focus-visible:ring-white/18 disabled:cursor-not-allowed disabled:text-white/28"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              disabled={databaseFields.length === 0 || isSubmitting}
              onClick={() => {
                void saveDatabaseEntry();
              }}
              className={
                isDefaultNutritionDatabase
                  ? "flex h-11 w-full items-center justify-center rounded-2xl border border-zinc-50/35 bg-zinc-200/72 px-5 text-sm font-semibold text-zinc-950 shadow-[0_12px_28px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.46),inset_0_-1px_0_rgba(113,113,122,0.16)] outline-none backdrop-blur-xl transition hover:border-white/45 hover:bg-zinc-200/84 active:bg-zinc-300/78 focus-visible:ring-1 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:opacity-45"
                  : "flex h-11 flex-1 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.1] text-sm font-semibold text-white/88 outline-none transition hover:border-white/[0.12] hover:bg-white/[0.14] hover:text-white focus-visible:ring-1 focus-visible:ring-white/24 disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:bg-white/[0.025] disabled:text-white/28"
              }
            >
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NoteDatabaseFocusedView({
  autosaveLabel = "Autosaved",
  databaseDefinitions,
  databaseEntries,
  databaseId,
  openEntrySheetKey,
  noteContent,
  noteTitle,
  onBack,
  onDatabaseDefinitionsChange,
  onDatabaseEntriesChange,
  onDeleteDatabase,
}: {
  autosaveLabel?: string;
  databaseDefinitions?: NoteDatabaseDefinitions | null;
  databaseEntries?: NoteDatabaseEntries | null;
  databaseId: string;
  openEntrySheetKey?: string | null;
  noteContent: string;
  noteTitle?: string;
  onBack: () => void;
  onDatabaseDefinitionsChange?: (databases: NoteDatabaseDefinitions) => void;
  onDatabaseEntriesChange?: (entries: NoteDatabaseEntries) => void;
  onDeleteDatabase?: () => void | Promise<void>;
}) {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isEntrySheetOpen, setIsEntrySheetOpen] = useState(false);
  const [entrySheetKey, setEntrySheetKey] = useState(0);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [draftField, setDraftField] = useState<NoteDatabaseFieldDefinition | null>(null);
  const [nutritionDailySavedTotals, setNutritionDailySavedTotals] =
    useState<Record<NutritionDailyMetricKey, number>>({ ...EMPTY_NUTRITION_TOTALS });
  const [nutritionDailyTotalsError, setNutritionDailyTotalsError] = useState<string | null>(
    null,
  );
  const [nutritionProgressAnimationKey, setNutritionProgressAnimationKey] = useState(0);
  const [isNutritionProgressAnimatedIn, setIsNutritionProgressAnimatedIn] = useState(false);
  const [nutritionDailyProgressRefreshKey, setNutritionDailyProgressRefreshKey] = useState(0);
  const [externalDatabaseEntries, setExternalDatabaseEntries] = useState<NoteDatabaseEntry[]>(
    [],
  );
  const [externalDatabaseError, setExternalDatabaseError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<NoteDatabaseEntry | null>(null);
  const shouldReduceNutritionMotion = useReducedMotion();
  const lastOpenEntrySheetKeyRef = useRef<string | null>(null);
  const segments = useMemo(() => parseNoteSegments(noteContent), [noteContent]);
  const databaseSegment = useMemo(
    () =>
      segments.find(
        (segment): segment is NoteDatabaseSegment =>
          segment.type === "database" && segment.databaseId === databaseId,
      ) ?? null,
    [databaseId, segments],
  );
  const normalizedDatabaseDefinitions = useMemo(
    () => normalizeDatabaseDefinitionsForSegments(segments, databaseDefinitions).definitions,
    [databaseDefinitions, segments],
  );
  const databaseDefinition = databaseSegment
    ? (() => {
        const storedDefinition = databaseDefinitions?.[databaseId];
        if (isLegacyHydrationDatabase(databaseId, storedDefinition, databaseSegment.title)) {
          return null;
        }
        const definition =
          normalizedDatabaseDefinitions[databaseId] ??
          createDefaultDatabaseDefinition(databaseSegment);
        return isLegacyHydrationDatabase(databaseId, definition, databaseSegment.title)
          ? null
          : definition;
      })()
    : null;
  const databaseFields = databaseDefinition
    ? getDatabaseFieldsWithTitleFirst(databaseDefinition)
    : [];
  const activeDatabaseView = databaseDefinition ? getActiveDatabaseView(databaseDefinition) : null;
  const visibleFields = databaseDefinition ? getVisibleDatabaseFields(databaseDefinition) : [];
  const titleField = databaseDefinition ? getDatabaseTitleField(databaseDefinition) : null;
  const displayTitle = getDatabaseDisplayTitle(databaseDefinition?.title ?? databaseSegment?.title);
  const parentNoteTitle = noteTitle?.trim() || "Note";
  const isStarterDatabaseSchemaLocked = isLockedStarterDatabase(databaseDefinition);
  const isDefaultNutritionDatabase = databaseDefinition
    ? isDefaultNutritionDatabaseDefinition(databaseDefinition)
    : false;
  const isOnHandDatabase = databaseDefinition
    ? isOnHandDatabaseDefinition(databaseDefinition)
    : false;
  const storedEntries = databaseEntries?.[databaseId] ?? [];
  const entries = isOnHandDatabase ? externalDatabaseEntries : storedEntries;
  const shouldRenderNutritionDailyProgress =
    isDefaultNutritionDatabase && Boolean(activeDatabaseView);
  const nutritionLocalDayWindow = useMemo(() => getNutritionLocalDayWindow(), []);
  const editingField =
    editingFieldId && databaseDefinition
      ? (databaseFields.find((field) => field.id === editingFieldId) ?? null)
      : null;
  const refreshNutritionDailyTotals = useCallback(async () => {
    if (!shouldRenderNutritionDailyProgress) {
      setNutritionDailySavedTotals({ ...EMPTY_NUTRITION_TOTALS });
      setNutritionDailyTotalsError(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        start: nutritionLocalDayWindow.start.toISOString(),
        end: nutritionLocalDayWindow.end.toISOString(),
        limit: "100",
      });
      const response = await fetch(`/api/nutrition/meals?${params.toString()}`);
      const payload = (await response.json()) as NutritionMealsListResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load nutrition meals.");
      }

      setNutritionDailySavedTotals(aggregateNutritionMealTotals(payload.meals ?? []));
      setNutritionDailyTotalsError(null);
      setNutritionProgressAnimationKey((currentKey) => currentKey + 1);
    } catch (error) {
      console.error("Failed to load nutrition daily totals", { error });
      setNutritionDailyTotalsError("Saved daily totals are unavailable right now.");
    }
  }, [
    nutritionLocalDayWindow.end,
    nutritionLocalDayWindow.start,
    shouldRenderNutritionDailyProgress,
  ]);
  const refreshOnHandEntries = useCallback(async () => {
    if (!isOnHandDatabase) {
      setExternalDatabaseEntries([]);
      setExternalDatabaseError(null);
      return;
    }

    try {
      const response = await fetch("/api/food-resources?status=active&limit=200");
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load Grocery List.");
      }

      setExternalDatabaseEntries(
        getFoodResourcesFromResponse(payload).map(mapFoodResourceToDatabaseEntry),
      );
      setExternalDatabaseError(null);
    } catch (error) {
      console.error("Failed to load Grocery List food resources", { error });
      setExternalDatabaseError("Grocery List is unavailable right now.");
    }
  }, [isOnHandDatabase]);

  useEffect(() => {
    const { changed, definitions } = normalizeDatabaseDefinitionsForSegments(
      segments,
      databaseDefinitions,
    );

    if (changed) {
      onDatabaseDefinitionsChange?.(definitions);
    }
  }, [databaseDefinitions, onDatabaseDefinitionsChange, segments]);

  useEffect(() => {
    void refreshNutritionDailyTotals();
  }, [nutritionDailyProgressRefreshKey, refreshNutritionDailyTotals]);

  useEffect(() => {
    void refreshOnHandEntries();
  }, [refreshOnHandEntries]);

  useLayoutEffect(() => {
    if (!shouldRenderNutritionDailyProgress) {
      setIsNutritionProgressAnimatedIn(false);
      return;
    }

    if (shouldReduceNutritionMotion) {
      setIsNutritionProgressAnimatedIn(true);
      return;
    }

    setIsNutritionProgressAnimatedIn(false);
    const frameId = window.requestAnimationFrame(() => {
      setIsNutritionProgressAnimatedIn(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    nutritionProgressAnimationKey,
    shouldReduceNutritionMotion,
    shouldRenderNutritionDailyProgress,
  ]);

  useEffect(() => {
    if (!editingFieldId || !databaseDefinition) return;

    const stillExists = databaseDefinition.fields.some((field) => field.id === editingFieldId);
    if (!stillExists) {
      setEditingFieldId(null);
    }
  }, [databaseDefinition, editingFieldId]);

  useEffect(() => {
    if (!isStarterDatabaseSchemaLocked) return;

    setIsBuilderOpen(false);
    setEditingFieldId(null);
    setDraftField(null);
  }, [isStarterDatabaseSchemaLocked]);

  useEffect(() => {
    if (
      !openEntrySheetKey ||
      lastOpenEntrySheetKeyRef.current === openEntrySheetKey ||
      !databaseDefinition
    ) {
      return;
    }

    lastOpenEntrySheetKeyRef.current = openEntrySheetKey;
    setEntrySheetKey((currentKey) => currentKey + 1);
    setIsEntrySheetOpen(true);
  }, [databaseDefinition, openEntrySheetKey]);

  function updateDatabaseDefinition(
    getNextDefinition: (currentDefinition: NoteDatabaseDefinition) => NoteDatabaseDefinition,
  ) {
    if (!databaseSegment) return;

    const currentDefinition =
      normalizedDatabaseDefinitions[databaseId] ?? createDefaultDatabaseDefinition(databaseSegment);
    const nextDefinition = normalizeDatabaseDefinition(getNextDefinition(currentDefinition));

    onDatabaseDefinitionsChange?.({
      ...normalizedDatabaseDefinitions,
      [databaseId]: nextDefinition,
    });
  }

  function updateDatabaseTitle(title: string) {
    if (isStarterDatabaseSchemaLocked) return;

    updateDatabaseDefinition((currentDefinition) => ({
      ...currentDefinition,
      title,
    }));
  }

  function updateDatabaseIcon(iconKey: string) {
    updateDatabaseDefinition((currentDefinition) => ({
      ...currentDefinition,
      iconKey: iconKey.trim() || DEFAULT_NOTE_DATABASE_ICON,
    }));
  }

  function toggleDatabaseBodyPin() {
    void hapticSoftTick();
    updateDatabaseDefinition((currentDefinition) => {
      if (currentDefinition.pinnedSurface === "body") {
        const nextDefinition = { ...currentDefinition };
        delete nextDefinition.pinnedSurface;
        return nextDefinition;
      }

      return {
        ...currentDefinition,
        pinnedSurface: "body",
      };
    });
  }

  function updateDatabaseActiveView(viewType: NoteDatabaseViewType) {
    if (activeDatabaseView?.type !== viewType) {
      void hapticSoftTick();
    }

    updateDatabaseDefinition((currentDefinition) => {
      const activeView = currentDefinition.views?.find((view) => view.type === viewType);
      return {
        ...currentDefinition,
        activeViewId:
          activeView?.id ?? buildDefaultDatabaseViewId(currentDefinition.id, viewType),
      };
    });
  }

  function insertDatabaseField(field: NoteDatabaseFieldDefinition) {
    if (isStarterDatabaseSchemaLocked) return;

    updateDatabaseDefinition((currentDefinition) => {
      const nextField: NoteDatabaseFieldDefinition = {
        ...field,
        name: field.name.trim() || "Untitled field",
        isTitle: false,
      };

      return {
        ...currentDefinition,
        fields: [...currentDefinition.fields, nextField],
        views: currentDefinition.views?.map((view) => ({
          ...view,
          visibleFieldIds: Array.from(new Set([...view.visibleFieldIds, nextField.id])),
        })),
      };
    });
  }

  function openNewDatabaseFieldSheet() {
    if (isStarterDatabaseSchemaLocked) return;

    setEditingFieldId(null);
    setDraftField({
      ...createDefaultDatabaseField(),
      name: "",
    });
  }

  function updateDraftField(
    updates: Partial<Pick<NoteDatabaseFieldDefinition, "name" | "type">>,
  ) {
    setDraftField((currentField) =>
      currentField ? { ...currentField, ...updates } : currentField,
    );
  }

  function confirmDraftField() {
    if (!draftField) return;

    insertDatabaseField(draftField);
    setDraftField(null);
  }

  function updateDatabaseField(
    fieldId: string,
    updates: Partial<Pick<NoteDatabaseFieldDefinition, "name" | "type">>,
  ) {
    if (isStarterDatabaseSchemaLocked) return;

    updateDatabaseDefinition((currentDefinition) => ({
      ...currentDefinition,
      fields: currentDefinition.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    }));
  }

  function reorderDatabaseFields(activeFieldId: string, overFieldId: string) {
    if (isStarterDatabaseSchemaLocked) return;

    updateDatabaseDefinition((currentDefinition) =>
      getDatabaseDefinitionWithReorderedFields(currentDefinition, activeFieldId, overFieldId),
    );
  }

  function removeDatabaseField(fieldId: string) {
    if (isStarterDatabaseSchemaLocked) return;

    updateDatabaseDefinition((currentDefinition) => {
      if (fieldId === currentDefinition.titleFieldId) return currentDefinition;

      return {
        ...currentDefinition,
        fields: currentDefinition.fields.filter((field) => field.id !== fieldId),
        views: currentDefinition.views?.map((view) => ({
          ...view,
          visibleFieldIds: view.visibleFieldIds.filter(
            (visibleFieldId) => visibleFieldId !== fieldId,
          ),
        })),
      };
    });
  }

  function updateDatabaseViewFieldVisibility(
    viewId: string,
    fieldId: string,
    isVisible: boolean,
  ) {
    if (isStarterDatabaseSchemaLocked) return;

    updateDatabaseDefinition((currentDefinition) => {
      const currentTitleField = getDatabaseTitleField(currentDefinition);
      if (!currentTitleField || (fieldId === currentTitleField.id && !isVisible)) {
        return currentDefinition;
      }

      const fieldsWithTitleFirst = getDatabaseFieldsWithTitleFirst(currentDefinition);

      return {
        ...currentDefinition,
        views: currentDefinition.views?.map((view) => {
          if (view.id !== viewId) return view;

          const visibleIds = new Set(view.visibleFieldIds);
          if (isVisible) {
            visibleIds.add(fieldId);
          } else {
            visibleIds.delete(fieldId);
          }
          visibleIds.add(currentTitleField.id);

          return {
            ...view,
            visibleFieldIds: fieldsWithTitleFirst
              .filter((field) => field.id === currentTitleField.id || visibleIds.has(field.id))
              .map((field) => field.id),
          };
        }),
      };
    });
  }

  function openDatabaseEntrySheet() {
    setEditingEntry(null);
    setEntrySheetKey((currentKey) => currentKey + 1);
    setIsEntrySheetOpen(true);
  }

  function closeDatabaseEntrySheet() {
    setIsEntrySheetOpen(false);
    setEditingEntry(null);
  }

  async function saveDatabaseEntry(nextEntry: NoteDatabaseEntry) {
    if (!databaseDefinition) return;

    if (isOnHandDatabase) {
      const isEditing = externalDatabaseEntries.some((entry) => entry.id === nextEntry.id);
      const response = await fetch("/api/food-resources", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapOnHandEntryToFoodResourcePayload(nextEntry)),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok || !payload.foodResource) {
        throw new Error(payload.error || "Unable to save Grocery List item.");
      }

      await refreshOnHandEntries();
      return;
    }

    const currentEntries = databaseEntries ?? {};

    onDatabaseEntriesChange?.({
      ...currentEntries,
      [databaseDefinition.id]: [...(currentEntries[databaseDefinition.id] ?? []), nextEntry],
    });

    if (isDefaultNutritionDatabase) {
      setNutritionDailyProgressRefreshKey((currentKey) => currentKey + 1);
    }
  }

  function editDatabaseEntry(entry: NoteDatabaseEntry) {
    setEditingEntry(entry);
    setEntrySheetKey((currentKey) => currentKey + 1);
    setIsEntrySheetOpen(true);
  }

  async function archiveDatabaseEntry(entry: NoteDatabaseEntry) {
    if (!isOnHandDatabase) return;

    try {
      const response = await fetch("/api/food-resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, action: "archive" }),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to archive Grocery List item.");
      }

      await refreshOnHandEntries();
      void hapticComplete();
    } catch (error) {
      console.error("Failed to archive Grocery List food resource", { error });
      setExternalDatabaseError("Unable to archive that item right now.");
      void hapticErrorPattern();
    }
  }

  if (!databaseSegment || !databaseDefinition || !activeDatabaseView) {
    return (
      <section className="flex min-h-full w-full flex-1 flex-col text-white">
        <div className="flex h-6 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              void hapticSnap();
              onBack();
            }}
            aria-label="Back"
            className="-ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.055] hover:text-white/76 focus-visible:ring-1 focus-visible:ring-white/24"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="min-w-0 truncate text-xs font-medium leading-none text-white/38">
            {parentNoteTitle}
          </p>
          <p className="ml-auto text-[11px] font-medium leading-none text-white/38">
            {autosaveLabel}
          </p>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-white/[0.1] bg-white/[0.025] px-3 py-8 text-center text-sm text-white/42">
          Database not found in this note.
        </div>
      </section>
    );
  }

  const isPinned =
    databaseDefinition.lockedSystemDatabase === true ||
    databaseDefinition.pinnedSurface === "body";
  const canDeleteDatabase =
    databaseDefinition.lockedSystemDatabase !== true && Boolean(onDeleteDatabase);

  async function deleteDatabase() {
    if (!canDeleteDatabase) return;

    setIsBuilderOpen(false);
    await onDeleteDatabase?.();
    void hapticComplete();
  }

  return (
    <section className="flex min-h-full w-full flex-1 flex-col text-white">
      <div className="flex h-6 items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            void hapticSnap();
            onBack();
          }}
          aria-label="Back"
          className="-ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.055] hover:text-white/76 focus-visible:ring-1 focus-visible:ring-white/24"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="min-w-0 truncate text-xs font-medium leading-none text-white/38">
          {parentNoteTitle}
        </p>
        <p className="ml-auto text-[11px] font-medium leading-none text-white/38">
          {autosaveLabel}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-4 border-b border-white/[0.07] pb-4">
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <NoteIconPicker
            icon={getDatabaseDisplayIconKey(databaseDefinition) || DEFAULT_NOTE_DATABASE_ICON}
            onIconChange={updateDatabaseIcon}
            ariaLabel="Change database icon"
            customInputAriaLabel="Custom database icon"
          />
          <h1 className="min-w-0 truncate text-2xl font-semibold leading-8 text-white sm:text-3xl">
            {displayTitle}
          </h1>
          <button
            type="button"
            onClick={toggleDatabaseBodyPin}
            disabled={databaseDefinition.lockedSystemDatabase === true}
            aria-pressed={isPinned}
            aria-label={
              databaseDefinition.lockedSystemDatabase === true
                ? "System database pinned"
                : databaseDefinition.pinnedSurface === "body"
                  ? "Unpin from stomach menu"
                  : "Pin to stomach menu"
            }
            title={
              databaseDefinition.lockedSystemDatabase === true
                ? "This system database is locked."
                : databaseDefinition.pinnedSurface === "body"
                  ? "Unpin from stomach menu"
                  : "Pin to stomach menu"
            }
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full outline-none transition focus-visible:ring-1 focus-visible:ring-white/35 disabled:cursor-not-allowed ${
              isPinned
                ? "bg-white/[0.12] text-white/86 hover:bg-white/[0.16] hover:text-white disabled:text-white/42 disabled:hover:bg-white/[0.12]"
                : "bg-transparent text-white/42 hover:bg-white/[0.06] hover:text-white/72"
            }`}
          >
            <Pin className="h-4 w-4" fill={isPinned ? "currentColor" : "none"} />
          </button>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex h-9 rounded-full border border-white/[0.08] bg-black/24 p-0.5">
            {NOTE_DATABASE_VIEW_TYPES.map((viewType) => (
              <button
                key={viewType}
                type="button"
                onClick={() => updateDatabaseActiveView(viewType)}
                aria-pressed={activeDatabaseView.type === viewType}
                className={`rounded-full px-2.5 text-[11px] font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-emerald-200/35 ${
                  activeDatabaseView.type === viewType
                    ? "bg-white/[0.1] text-white/88"
                    : "text-white/42 hover:bg-white/[0.055] hover:text-white/68"
                }`}
              >
                {NOTE_DATABASE_VIEW_LABELS[viewType]}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isStarterDatabaseSchemaLocked ? null : (
              <button
                type="button"
                onClick={() => setIsBuilderOpen(true)}
                aria-label="Builder"
                title="Builder"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-white/66 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white/86 focus-visible:ring-1 focus-visible:ring-white/24"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={openDatabaseEntrySheet}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.12] bg-zinc-700 px-3.5 text-xs font-semibold text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_18px_-14px_rgba(0,0,0,0.95)] outline-none transition hover:border-white/[0.16] hover:bg-zinc-600 hover:text-white focus-visible:ring-1 focus-visible:ring-white/24"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>
      </div>

      <div
        className={
          activeDatabaseView.type === "table"
            ? "mt-5 min-h-0 flex-1 overflow-hidden"
            : "mt-5 min-h-0 flex-1 overflow-visible"
        }
      >
        {shouldRenderNutritionDailyProgress ? (
          <div className="max-w-3xl px-2 pb-3 pt-1">
            <NutritionDailyProgressBars
              savedTotals={nutritionDailySavedTotals}
              previewTotals={EMPTY_NUTRITION_TOTALS}
              error={nutritionDailyTotalsError}
              isAnimatedIn={isNutritionProgressAnimatedIn}
              shouldReduceMotion={shouldReduceNutritionMotion}
            />
          </div>
        ) : null}
        {externalDatabaseError ? (
          <p className="px-2 pb-3 text-xs font-medium text-red-200/78">
            {externalDatabaseError}
          </p>
        ) : null}
        <NoteDatabaseEntriesView
          activeView={activeDatabaseView}
          definition={databaseDefinition}
          entries={entries}
          onAddField={isStarterDatabaseSchemaLocked ? undefined : openNewDatabaseFieldSheet}
          onArchiveEntry={isOnHandDatabase ? archiveDatabaseEntry : undefined}
          onEditEntry={isOnHandDatabase ? editDatabaseEntry : undefined}
          onFieldHeaderClick={
            isStarterDatabaseSchemaLocked ? undefined : (field) => setEditingFieldId(field.id)
          }
          onFieldOrderChange={isStarterDatabaseSchemaLocked ? undefined : reorderDatabaseFields}
          size="full"
          titleField={titleField}
          visibleFields={visibleFields}
        />
      </div>

      {!isStarterDatabaseSchemaLocked && draftField ? (
        <NoteDatabaseFieldEditSheet
          canRemoveField={false}
          field={draftField}
          mode="create"
          onClose={() => setDraftField(null)}
          onConfirmCreate={confirmDraftField}
          onFieldNameChange={(name) => updateDraftField({ name })}
          onFieldTypeChange={(type) => updateDraftField({ type })}
          onRemoveField={() => setDraftField(null)}
        />
      ) : !isStarterDatabaseSchemaLocked && editingField ? (
        <NoteDatabaseFieldEditSheet
          canRemoveField={
            editingField.id !== databaseDefinition.titleFieldId && editingField.isTitle !== true
          }
          field={editingField}
          onClose={() => setEditingFieldId(null)}
          onFieldNameChange={(name) => updateDatabaseField(editingField.id, { name })}
          onFieldTypeChange={(type) => updateDatabaseField(editingField.id, { type })}
          onRemoveField={() => {
            removeDatabaseField(editingField.id);
            setEditingFieldId(null);
          }}
        />
      ) : null}

      {isEntrySheetOpen ? (
        <NoteDatabaseEntrySheet
          key={entrySheetKey}
          databaseDefinition={databaseDefinition}
          entries={entries}
          initialEntry={editingEntry}
          onClose={closeDatabaseEntrySheet}
          onSaveEntry={saveDatabaseEntry}
          submitLabel={
            isOnHandDatabase
              ? editingEntry
                ? "Save grocery"
                : "Add grocery"
              : editingEntry
                ? "Save changes"
                : "Save entry"
          }
        />
      ) : null}

      {isBuilderOpen && !isStarterDatabaseSchemaLocked ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden overscroll-contain bg-black/58 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Database builder for ${displayTitle}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              void hapticSnap();
              setIsBuilderOpen(false);
            }
          }}
        >
          <div className="animate-in slide-in-from-bottom-6 fade-in-0 flex max-h-[88vh] min-h-[66vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.04] border-b-0 bg-[#090909] shadow-[0_-24px_80px_-32px_rgba(0,0,0,1)] duration-200 sm:mb-4 sm:min-h-0 sm:rounded-[30px] sm:border-b">
            <div className="relative border-b border-white/[0.04] px-4 pb-4 pt-3">
              <div
                className="mx-auto h-1 w-11 rounded-full bg-white/22"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-center text-base font-semibold leading-6 text-white">
                Database builder
              </h2>
              <button
                type="button"
                aria-label="Close database builder"
                onClick={() => {
                  void hapticSnap();
                  setIsBuilderOpen(false);
                }}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white/82 focus-visible:bg-white/[0.08] focus-visible:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
              <label className="block">
                <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                  Database title
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <input
                    value={databaseDefinition.title}
                    onChange={(event) => updateDatabaseTitle(event.target.value)}
                    placeholder={NOTE_DATABASE_DISPLAY_TITLE_FALLBACK}
                    className="h-12 min-w-0 flex-1 rounded-2xl border border-white/[0.04] bg-white/[0.065] px-4 text-base font-semibold text-white outline-none transition placeholder:text-white/28 selection:bg-emerald-300/25 hover:border-white/[0.06] focus-visible:border-white/[0.1]"
                    aria-label="Database title"
                  />
                  <button
                    type="button"
                    onClick={toggleDatabaseBodyPin}
                    disabled={databaseDefinition.lockedSystemDatabase === true}
                    aria-pressed={isPinned}
                    aria-label={
                      databaseDefinition.lockedSystemDatabase === true
                        ? "System database pinned"
                        : databaseDefinition.pinnedSurface === "body"
                          ? "Unpin from stomach menu"
                          : "Pin to stomach menu"
                    }
                    title={
                      databaseDefinition.lockedSystemDatabase === true
                        ? "This system database is locked."
                        : databaseDefinition.pinnedSurface === "body"
                          ? "Unpin from stomach menu"
                          : "Pin to stomach menu"
                    }
                    className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl outline-none transition focus-visible:ring-1 focus-visible:ring-white/35 disabled:cursor-not-allowed ${
                      isPinned
                        ? "bg-white/[0.12] text-white/86 hover:bg-white/[0.16] hover:text-white disabled:text-white/42 disabled:hover:bg-white/[0.12]"
                        : "bg-white/[0.045] text-white/42 hover:bg-white/[0.065] hover:text-white/68"
                    }`}
                  >
                    <Pin className="h-4 w-4" fill={isPinned ? "currentColor" : "none"} />
                  </button>
                </span>
              </label>

              <div className="mt-6">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                  Fields
                </p>
                {databaseFields.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.035]">
                    {databaseFields.map((field) => {
                      const isTitleField = field.id === databaseDefinition.titleFieldId;
                      const isFieldVisible =
                        isTitleField ||
                        Boolean(activeDatabaseView.visibleFieldIds.includes(field.id));
                      const activeViewLabel = NOTE_DATABASE_VIEW_LABELS[activeDatabaseView.type];

                      return (
                        <div
                          key={field.id}
                          className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-white/[0.04] px-3 py-2.5 last:border-b-0"
                        >
                          <span
                            className="flex h-8 w-5 items-center justify-center text-white/22"
                            aria-hidden="true"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <input
                            value={field.name}
                            onChange={(event) =>
                              updateDatabaseField(field.id, { name: event.target.value })
                            }
                            placeholder="Field name"
                            className="min-w-0 border-0 bg-transparent p-0 text-sm font-semibold leading-6 text-white/82 outline-none placeholder:text-white/24 selection:bg-emerald-300/25"
                            aria-label="Field name"
                          />
                          {isTitleField ? (
                            <span className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.05] bg-black/22 px-2 text-xs font-semibold text-white/62">
                              Title
                              <span className="text-white/28">Text</span>
                            </span>
                          ) : (
                            <select
                              value={field.type}
                              onChange={(event) =>
                                updateDatabaseField(field.id, {
                                  type: event.target.value as NoteDatabaseFieldType,
                                })
                              }
                              className="h-8 max-w-[8rem] rounded-full border border-white/[0.05] bg-black/22 px-2 text-xs font-semibold text-white/62 outline-none transition hover:border-white/[0.08] hover:text-white/78 focus-visible:border-white/[0.12]"
                              aria-label="Field type"
                            >
                              {NOTE_DATABASE_FIELD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {NOTE_DATABASE_FIELD_TYPE_LABELS[type]}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            aria-label={
                              isTitleField
                                ? `Title field stays visible in ${activeViewLabel}`
                                : `${isFieldVisible ? "Hide" : "Show"} field ${
                                    field.name || "Untitled field"
                                  } in ${activeViewLabel}`
                            }
                            onClick={() =>
                              updateDatabaseViewFieldVisibility(
                                activeDatabaseView.id,
                                field.id,
                                !isFieldVisible,
                              )
                            }
                            disabled={isTitleField}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg outline-none transition focus-visible:bg-white/[0.07] focus-visible:text-white ${
                              isFieldVisible
                                ? "text-white/58 hover:bg-white/[0.055] hover:text-white/82"
                                : "text-white/24 hover:bg-white/[0.055] hover:text-white/58"
                            } disabled:cursor-not-allowed disabled:text-white/24 disabled:hover:bg-transparent`}
                          >
                            {isFieldVisible ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove field ${field.name || "Untitled field"}`}
                            onClick={() => removeDatabaseField(field.id)}
                            disabled={isTitleField}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/32 outline-none transition hover:bg-white/[0.055] hover:text-white/70 focus-visible:bg-white/[0.07] focus-visible:text-white disabled:cursor-not-allowed disabled:text-white/14 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.025] px-4 py-8 text-center text-sm font-medium text-white/38">
                    Add fields to shape this database block.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/[0.04] p-3">
              <button
                type="button"
                onClick={openNewDatabaseFieldSheet}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.06] text-sm font-semibold text-white/76 outline-none transition hover:border-white/[0.08] hover:bg-white/[0.085] hover:text-white/90 focus-visible:ring-1 focus-visible:ring-white/18"
              >
                <Plus className="h-4 w-4" />
                Add Field
              </button>
              <button
                type="button"
                onClick={() => void deleteDatabase()}
                disabled={!canDeleteDatabase}
                aria-label={
                  databaseDefinition.lockedSystemDatabase === true
                    ? "System database cannot be deleted"
                    : `Delete database ${displayTitle}`
                }
                title={
                  databaseDefinition.lockedSystemDatabase === true
                    ? "This system database is locked."
                    : `Delete database ${displayTitle}`
                }
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-red-300/[0.1] bg-red-950/[0.08] text-sm font-semibold text-red-100/58 outline-none transition hover:border-red-300/[0.16] hover:bg-red-950/[0.14] hover:text-red-100/78 focus-visible:ring-1 focus-visible:ring-red-100/18 disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.025] disabled:text-white/26 disabled:hover:bg-white/[0.025]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {databaseDefinition.lockedSystemDatabase === true ? "System DB locked" : "Delete DB"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export const NoteSlashTextarea = forwardRef<NoteSlashTextareaHandle, NoteSlashTextareaProps>(
function NoteSlashTextarea({
  value,
  onValueChange,
  databaseDefinitions,
  onDatabaseDefinitionsChange,
  databaseEntries,
  onDatabaseEntriesChange,
  onCreateSubpage,
  onSubpageCreated,
  onOpenSubpage,
  onOpenDatabase,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: NoteSlashTextareaProps, ref) {
  const textareaRefs = useRef(new Map<number, EditableTextControl>());
  const lineInputRefs = useRef(new Map<number, EditableTextControl>());
  const blockButtonRefs = useRef(new Map<number, HTMLButtonElement>());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeTextSelectionRef = useRef<EditableTextSelection | null>(null);
  const [slashTrigger, setSlashTrigger] = useState<SlashTrigger>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [activeDatabaseId, setActiveDatabaseId] = useState<string | null>(null);
  const [activeEntryDatabaseId, setActiveEntryDatabaseId] = useState<string | null>(null);
  const [externalDatabaseEntries, setExternalDatabaseEntries] = useState<NoteDatabaseEntry[]>([]);
  const [externalDatabaseError, setExternalDatabaseError] = useState<string | null>(null);
  const [activeSegmentDragId, setActiveSegmentDragId] = useState<string | null>(null);
  const [activeSegmentDragSize, setActiveSegmentDragSize] = useState<NoteSegmentDragSize | null>(
    null,
  );
  const isMenuOpen = slashTrigger !== null;
  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 220,
        tolerance: 8,
      },
    }),
  );

  const segments = useMemo(() => parseNoteSegments(value), [value]);
  const segmentDragIds = useMemo(
    () => segments.map((_, index) => buildNoteSegmentDragId(index)),
    [segments],
  );
  const normalizedDatabaseDefinitions = useMemo(
    () => normalizeDatabaseDefinitionsForSegments(segments, databaseDefinitions).definitions,
    [databaseDefinitions, segments],
  );
  const nutritionDatabaseId = useMemo(() => {
    return segments.find((segment): segment is NoteDatabaseSegment => {
      if (segment.type !== "database") return false;
      const definition = normalizedDatabaseDefinitions[segment.databaseId];
      return (
        segment.databaseId === NUTRITION_DATABASE_ID ||
        definition?.systemDatabaseKey?.trim().toLowerCase() === "nutrition" ||
        getDatabaseMenuDisplayTitle(
          definition ?? createDefaultDatabaseDefinition(segment),
          segment.title,
        ) === "Nutrition"
      );
    })?.databaseId ?? null;
  }, [normalizedDatabaseDefinitions, segments]);

  useEffect(() => {
    const isHydrationDatabaseId = (databaseId: string | null) => {
      if (databaseId === null) return false;

      const definition =
        databaseDefinitions?.[databaseId] ?? normalizedDatabaseDefinitions[databaseId];
      const segment = segments.find(
        (segment): segment is NoteDatabaseSegment =>
          segment.type === "database" && segment.databaseId === databaseId,
      );
      return isLegacyHydrationDatabase(databaseId, definition, segment?.title);
    };

    if (isHydrationDatabaseId(activeDatabaseId)) {
      setActiveDatabaseId(nutritionDatabaseId);
    }
    if (isHydrationDatabaseId(activeEntryDatabaseId)) {
      setActiveEntryDatabaseId(nutritionDatabaseId);
    }
  }, [
    activeDatabaseId,
    activeEntryDatabaseId,
    databaseDefinitions,
    normalizedDatabaseDefinitions,
    nutritionDatabaseId,
    segments,
  ]);
  const activeDatabaseSegment = useMemo(
    () =>
      activeDatabaseId
        ? segments.find(
            (segment): segment is NoteDatabaseSegment =>
              segment.type === "database" && segment.databaseId === activeDatabaseId,
          ) ?? null
        : null,
    [activeDatabaseId, segments],
  );
  const activeDatabaseDefinition =
    activeDatabaseId && activeDatabaseSegment
      ? (() => {
          const storedDefinition = databaseDefinitions?.[activeDatabaseId];
          if (
            isLegacyHydrationDatabase(
              activeDatabaseId,
              storedDefinition,
              activeDatabaseSegment.title,
            )
          ) {
            return null;
          }
          const definition =
            normalizedDatabaseDefinitions[activeDatabaseId] ??
            createDefaultDatabaseDefinition(activeDatabaseSegment);
          return isLegacyHydrationDatabase(
            activeDatabaseId,
            definition,
            activeDatabaseSegment.title,
          )
            ? null
            : definition;
        })()
      : null;
  const activeEntryDatabaseSegment = useMemo(
    () =>
      activeEntryDatabaseId
        ? segments.find(
            (segment): segment is NoteDatabaseSegment =>
              segment.type === "database" && segment.databaseId === activeEntryDatabaseId,
          ) ?? null
        : null,
    [activeEntryDatabaseId, segments],
  );
  const activeEntryDatabaseDefinition =
    activeEntryDatabaseId && activeEntryDatabaseSegment
      ? (() => {
          const storedDefinition = databaseDefinitions?.[activeEntryDatabaseId];
          if (
            isLegacyHydrationDatabase(
              activeEntryDatabaseId,
              storedDefinition,
              activeEntryDatabaseSegment.title,
            )
          ) {
            return null;
          }
          const definition =
            normalizedDatabaseDefinitions[activeEntryDatabaseId] ??
            createDefaultDatabaseDefinition(activeEntryDatabaseSegment);
          return isLegacyHydrationDatabase(
            activeEntryDatabaseId,
            definition,
            activeEntryDatabaseSegment.title,
          )
            ? null
            : definition;
        })()
      : null;
  const hasOnHandDatabase = useMemo(
    () =>
      segments.some((segment) => {
        if (segment.type !== "database") return false;

        const definition =
          normalizedDatabaseDefinitions[segment.databaseId] ??
          createDefaultDatabaseDefinition(segment);

        return isOnHandDatabaseDefinition(definition);
      }),
    [normalizedDatabaseDefinitions, segments],
  );
  const activeDatabaseFields = activeDatabaseDefinition
    ? getDatabaseFieldsWithTitleFirst(activeDatabaseDefinition)
    : [];
  const activeDatabaseView = activeDatabaseDefinition
    ? getActiveDatabaseView(activeDatabaseDefinition)
    : null;
  const isActiveStarterDatabaseSchemaLocked = isLockedStarterDatabase(activeDatabaseDefinition);

  const rememberEditableSelection = useCallback(
    (
      type: EditableTextSelection["type"],
      segmentIndex: number,
      control: EditableTextControl,
    ) => {
      const segment = segments[segmentIndex];
      const serializedText =
        segment?.type === type && "text" in segment ? segment.text : readSerializedEditableText(control);
      const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(
        control,
        serializedText,
      );

      const nextSelection = {
        type,
        segmentId: buildEditableSegmentId(type, segmentIndex),
        segmentIndex,
        selectionStart: Math.min(selectionStart, selectionEnd),
        selectionEnd: Math.max(selectionStart, selectionEnd),
        control,
      };

      activeTextSelectionRef.current = nextSelection;
      return nextSelection;
    },
    [segments],
  );

  const getEditableSelectionFromControl = useCallback(
    (control: EditableTextControl): EditableTextSelection | null => {
      for (const [segmentIndex, textarea] of textareaRefs.current.entries()) {
        if (textarea !== control) continue;
        const segment = segments[segmentIndex];
        if (segment?.type !== "text") return null;
        const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(
          textarea,
          segment.text,
        );

        return {
          type: "text",
          segmentId: buildEditableSegmentId("text", segmentIndex),
          segmentIndex,
          selectionStart,
          selectionEnd,
          control: textarea,
        };
      }

      for (const [segmentIndex, input] of lineInputRefs.current.entries()) {
        if (input !== control) continue;

        const segment = segments[segmentIndex];
        if (segment?.type !== "checklist" && segment?.type !== "list") {
          return null;
        }
        const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(
          input,
          segment.text,
        );

        return {
          type: segment.type,
          segmentId: buildEditableSegmentId(segment.type, segmentIndex),
          segmentIndex,
          selectionStart,
          selectionEnd,
          control: input,
        };
      }

      return null;
    },
    [segments],
  );

  const getLiveEditableSelection = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLDivElement) {
      const activeControlSelection = getEditableSelectionFromControl(activeElement);
      if (activeControlSelection) return activeControlSelection;
    }

    if (activeElement && rootRef.current?.contains(activeElement)) {
      return null;
    }

    const cachedSelection = activeTextSelectionRef.current;
    if (!cachedSelection?.control?.isConnected) return null;

    const currentControlSelection = getEditableSelectionFromControl(cachedSelection.control);
    if (!currentControlSelection) return null;

    return {
      ...currentControlSelection,
      selectionStart: cachedSelection.selectionStart,
      selectionEnd: cachedSelection.selectionEnd,
    };
  }, [getEditableSelectionFromControl]);

  const applyTextFormat = useCallback(
    (command: NoteTextFormatCommand) => {
      const liveSelection = getLiveEditableSelection();
      if (!liveSelection) return;

      const segment = segments[liveSelection.segmentIndex];
      if (segment?.type !== liveSelection.type) return;

      liveSelection.control?.focus({ preventScroll: true });

      const [prefix, suffix] = NOTE_TEXT_FORMAT_MARKERS[command];
      const selectionStart = Math.max(
        0,
        Math.min(liveSelection.selectionStart, segment.text.length),
      );
      const selectionEnd = Math.max(
        selectionStart,
        Math.min(liveSelection.selectionEnd, segment.text.length),
      );
      if (selectionStart === selectionEnd) {
        if (liveSelection.control) {
          setSerializedSelectionInEditable(
            liveSelection.control,
            selectionStart,
            selectionEnd,
          );
        }
        return;
      }

      const selectedText = segment.text.slice(selectionStart, selectionEnd);
      const nextText =
        segment.text.slice(0, selectionStart) +
        prefix +
        selectedText +
        suffix +
        segment.text.slice(selectionEnd);
      const nextSegments = segments.map((currentSegment, index) =>
        index === liveSelection.segmentIndex && currentSegment.type === liveSelection.type
          ? { ...currentSegment, text: nextText }
          : currentSegment,
      );
      const nextCaretPosition = selectionStart + prefix.length + selectedText.length + suffix.length;
      const nextSelection: PendingSelection = {
        type: liveSelection.type,
        segmentIndex: liveSelection.segmentIndex,
        caretPosition: nextCaretPosition,
      };

      if (liveSelection.control) {
        setSerializedSelectionInEditable(
          liveSelection.control,
          selectionStart,
          selectionEnd,
        );
      }
      activeTextSelectionRef.current = {
        type: liveSelection.type,
        segmentId: liveSelection.segmentId,
        segmentIndex: liveSelection.segmentIndex,
        selectionStart: nextCaretPosition,
        selectionEnd: nextCaretPosition,
        control: liveSelection.control,
      };
      onValueChange(serializeNoteSegments(nextSegments));
      setPendingSelection(nextSelection);
      setSlashTrigger(null);
      setSelectedCommandIndex(0);
    },
    [getLiveEditableSelection, onValueChange, segments],
  );

  useImperativeHandle(
    ref,
    () => ({
      applyTextFormat,
    }),
    [applyTextFormat],
  );

  useEffect(() => {
    function keepOrClearEditableSelection(event: PointerEvent | FocusEvent) {
      if (isNoteTextActionBarTarget(event.target)) return;

      const target = event.target;
      if (target instanceof Element) {
        const editableTarget = target.closest("[data-note-editable-segment-id]");
        if (editableTarget instanceof HTMLDivElement && getEditableSelectionFromControl(editableTarget)) {
          return;
        }
      }

      activeTextSelectionRef.current = null;
    }

    document.addEventListener("pointerdown", keepOrClearEditableSelection, true);
    document.addEventListener("focusin", keepOrClearEditableSelection, true);

    return () => {
      document.removeEventListener("pointerdown", keepOrClearEditableSelection, true);
      document.removeEventListener("focusin", keepOrClearEditableSelection, true);
    };
  }, [getEditableSelectionFromControl]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const roots = [document.documentElement, document.body];
    openSlashMenuCount += 1;
    roots.forEach((root) => root.classList.add(NOTE_SLASH_MENU_OPEN_CLASS));

    return () => {
      openSlashMenuCount = Math.max(0, openSlashMenuCount - 1);

      if (openSlashMenuCount === 0) {
        roots.forEach((root) => root.classList.remove(NOTE_SLASH_MENU_OPEN_CLASS));
      }
    };
  }, [isMenuOpen]);

  const refreshOnHandEntries = useCallback(async () => {
    if (!hasOnHandDatabase) {
      setExternalDatabaseEntries([]);
      setExternalDatabaseError(null);
      return;
    }

    try {
      const response = await fetch("/api/food-resources?status=active&limit=200");
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load Grocery List.");
      }

      setExternalDatabaseEntries(
        getFoodResourcesFromResponse(payload).map(mapFoodResourceToDatabaseEntry),
      );
      setExternalDatabaseError(null);
    } catch (error) {
      console.error("Failed to load Grocery List food resources", { error });
      setExternalDatabaseError("Grocery List is unavailable right now.");
    }
  }, [hasOnHandDatabase]);

  useEffect(() => {
    void refreshOnHandEntries();
  }, [refreshOnHandEntries]);

  useEffect(() => {
    if (!activeSegmentDragId) return;

    const { body, documentElement } = document;
    const bodyStyle = body.style as CSSStyleDeclaration & {
      webkitTouchCallout: string;
      webkitUserSelect: string;
    };
    const previousBodyUserSelect = bodyStyle.userSelect;
    const previousBodyWebkitUserSelect = bodyStyle.webkitUserSelect;
    const previousBodyWebkitTouchCallout = bodyStyle.webkitTouchCallout;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    bodyStyle.userSelect = "none";
    bodyStyle.webkitUserSelect = "none";
    bodyStyle.webkitTouchCallout = "none";
    documentElement.style.overscrollBehavior = "none";
    window.addEventListener("touchmove", preventTouchScrollWhileDragging, {
      passive: false,
    });

    return () => {
      bodyStyle.userSelect = previousBodyUserSelect;
      bodyStyle.webkitUserSelect = previousBodyWebkitUserSelect;
      bodyStyle.webkitTouchCallout = previousBodyWebkitTouchCallout;
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
      window.removeEventListener("touchmove", preventTouchScrollWhileDragging);
    };
  }, [activeSegmentDragId]);

  useLayoutEffect(() => {
    if (pendingSelection === null) return;

    if (pendingSelection.type === "block") {
      const button = blockButtonRefs.current.get(pendingSelection.segmentIndex);
      if (!button) return;

      button.focus();
      setPendingSelection(null);
      return;
    }

    if (pendingSelection.type === "checklist" || pendingSelection.type === "list") {
      const input = lineInputRefs.current.get(pendingSelection.segmentIndex);
      const segment = segments[pendingSelection.segmentIndex];
      if (!input) return;
      if (segment?.type !== pendingSelection.type) return;

      input.focus();
      setSerializedSelectionInEditable(
        input,
        pendingSelection.caretPosition,
        pendingSelection.selectionEnd ?? pendingSelection.caretPosition,
      );
      setPendingSelection(null);
      return;
    }

    const textarea = textareaRefs.current.get(pendingSelection.segmentIndex);
    const segment = segments[pendingSelection.segmentIndex];
    if (!textarea) return;
    if (segment?.type !== "text") return;

    textarea.focus();
    setSerializedSelectionInEditable(
      textarea,
      pendingSelection.caretPosition,
      pendingSelection.selectionEnd ?? pendingSelection.caretPosition,
    );
    setPendingSelection(null);
  }, [pendingSelection, segments, value]);

  useEffect(() => {
    if (!slashTrigger) return;

    const segment = segments[slashTrigger.segmentIndex];
    if (segment?.type !== "text" || segment.text[slashTrigger.triggerIndex] !== "/") {
      setSlashTrigger(null);
    }
  }, [segments, slashTrigger]);

  useEffect(() => {
    const { changed, definitions } = normalizeDatabaseDefinitionsForSegments(
      segments,
      databaseDefinitions,
    );

    if (changed) {
      onDatabaseDefinitionsChange?.(definitions);
    }
  }, [databaseDefinitions, onDatabaseDefinitionsChange, segments]);

  useEffect(() => {
    if (activeDatabaseId) {
      const databaseStillExists = segments.some(
        (segment) => segment.type === "database" && segment.databaseId === activeDatabaseId,
      );

      if (!databaseStillExists) {
        setActiveDatabaseId(null);
      }
    }

    if (isActiveStarterDatabaseSchemaLocked) {
      setActiveDatabaseId(null);
    }

    if (activeEntryDatabaseId) {
      const entryDatabaseStillExists = segments.some(
        (segment) => segment.type === "database" && segment.databaseId === activeEntryDatabaseId,
      );

      if (!entryDatabaseStillExists) {
        setActiveEntryDatabaseId(null);
      }
    }

  }, [activeDatabaseId, activeEntryDatabaseId, isActiveStarterDatabaseSchemaLocked, segments]);

  function closeMenu() {
    setSlashTrigger(null);
    setSelectedCommandIndex(0);
  }

  function syncSlashTrigger(segmentIndex: number, nextText: string, caretPosition: number) {
    if (nextText[caretPosition - 1] === "/") {
      setSlashTrigger({ segmentIndex, triggerIndex: caretPosition - 1 });
      setSelectedCommandIndex(0);
      return;
    }

    if (slashTrigger?.segmentIndex === segmentIndex) {
      const slashWasDeleted = nextText[slashTrigger.triggerIndex] !== "/";
      const caretMovedBeforeTrigger = caretPosition <= slashTrigger.triggerIndex;

      if (slashWasDeleted || caretMovedBeforeTrigger) {
        closeMenu();
      }
    }
  }

  function updateTextSegment(segmentIndex: number, nextText: string) {
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex && segment.type === "text"
        ? { type: "text" as const, text: nextText }
        : segment,
    );
    onValueChange(serializeNoteSegments(nextSegments));
  }

  function getSelectionAtSegmentEnd(
    nextSegments: NoteSegment[],
    segmentIndex: number,
  ): PendingSelection | null {
    const segment = nextSegments[segmentIndex];
    if (!segment) return null;

    if (segment.type === "text") {
      return {
        type: "text",
        segmentIndex,
        caretPosition: segment.text.length,
      };
    }

    if (segment.type === "checklist") {
      return {
        type: "checklist",
        segmentIndex,
        caretPosition: segment.text.length,
      };
    }

    if (segment.type === "list") {
      return {
        type: "list",
        segmentIndex,
        caretPosition: segment.text.length,
      };
    }

    return {
      type: "block",
      segmentIndex,
    };
  }

  function getSelectionAtSegmentStart(
    nextSegments: NoteSegment[],
    segmentIndex: number,
  ): PendingSelection | null {
    const segment = nextSegments[segmentIndex];
    if (!segment) return null;

    if (segment.type === "text") {
      return {
        type: "text",
        segmentIndex,
        caretPosition: 0,
      };
    }

    if (segment.type === "checklist") {
      return {
        type: "checklist",
        segmentIndex,
        caretPosition: 0,
      };
    }

    if (segment.type === "list") {
      return {
        type: "list",
        segmentIndex,
        caretPosition: 0,
      };
    }

    return {
      type: "block",
      segmentIndex,
    };
  }

  function findNearestEditableSelection(nextSegments: NoteSegment[], targetIndex: number) {
    for (let index = Math.min(targetIndex, nextSegments.length - 1); index >= 0; index -= 1) {
      const selection = getSelectionAtSegmentEnd(nextSegments, index);
      if (selection?.type !== "block") return selection;
    }

    for (let index = targetIndex; index < nextSegments.length; index += 1) {
      const selection = getSelectionAtSegmentEnd(nextSegments, index);
      if (selection?.type !== "block") return selection;
    }

    return null;
  }

  function removeTextLineFromSegment(
    nextSegments: NoteSegment[],
    segmentIndex: number,
    lineStart: number,
    lineEnd: number,
  ) {
    const segment = nextSegments[segmentIndex];
    if (segment?.type !== "text") return nextSegments;

    if (segment.text.length === 0) {
      return nextSegments.length > 1
        ? nextSegments.filter((_, index) => index !== segmentIndex)
        : nextSegments;
    }

    const removeStart = lineStart;
    const removeEnd = lineEnd < segment.text.length ? lineEnd + 1 : lineEnd;
    const nextText = segment.text.slice(0, removeStart) + segment.text.slice(removeEnd);

    return nextSegments.map((currentSegment, index) =>
      index === segmentIndex && currentSegment.type === "text"
        ? { type: "text" as const, text: nextText }
        : currentSegment,
    );
  }

  function commitSegments(
    nextSegments: NoteSegment[],
    nextSelection: PendingSelection | null,
  ) {
    const nextValue = serializeNoteSegments(nextSegments);
    onValueChange(nextValue);

    if (nextSelection) {
      setPendingSelection(nextSelection);
    }
  }

  function removeSegment(segmentIndex: number) {
    const removedSegment = segments[segmentIndex];

    if (removedSegment?.type === "database") {
      const removal = removeNoteDatabaseSegment({
        content: value,
        databaseDefinitions,
        databaseEntries,
        databaseId: removedSegment.databaseId,
        segmentIndex,
      });

      if (removal.locked) {
        console.warn("This system database is locked.", {
          databaseId: removal.databaseId,
          systemDatabaseKey: removal.systemDatabaseKey,
        });
        return;
      }

      if (!removal.removed) return;

      const parsedNextSegments = parseNoteSegments(removal.content);
      onValueChange(removal.content);
      onDatabaseDefinitionsChange?.(removal.databaseDefinitions);
      onDatabaseEntriesChange?.(removal.databaseEntries);
      setPendingSelection(findNearestEditableSelection(parsedNextSegments, segmentIndex));
      return;
    }

    const nextSegments = segments.filter((_, index) => index !== segmentIndex);
    const nextValue = serializeNoteSegments(nextSegments);
    const parsedNextSegments = parseNoteSegments(nextValue);
    onValueChange(nextValue);

    setPendingSelection(findNearestEditableSelection(parsedNextSegments, segmentIndex));
  }

  function updateChecklistSegment(
    segmentIndex: number,
    nextChecklist: Partial<Pick<NoteChecklistSegment, "checked" | "text">>,
  ) {
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex && segment.type === "checklist"
        ? { ...segment, ...nextChecklist }
        : segment,
    );
    onValueChange(serializeNoteSegments(nextSegments));
  }

  function updateListSegment(
    segmentIndex: number,
    nextListItem: Partial<Pick<NoteListSegment, "text">>,
  ) {
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex && segment.type === "list"
        ? { ...segment, ...nextListItem }
        : segment,
    );
    onValueChange(serializeNoteSegments(nextSegments));
  }

  function exitInlineRow(segmentIndex: number) {
    const segmentStart = getSegmentStartOffsets(segments)[segmentIndex] ?? 0;
    const nextSegments = segments.map((segment, index) =>
      index === segmentIndex ? { type: "text" as const, text: "" } : segment,
    );
    const nextValue = serializeNoteSegments(nextSegments);
    const parsedNextSegments = parseNoteSegments(nextValue);

    onValueChange(nextValue);
    setPendingSelection(findTextSelectionForCaret(parsedNextSegments, segmentStart));
  }

  function splitInlineRow(
    segmentIndex: number,
    selectionStart: number,
    selectionEnd: number,
  ) {
    const segment = segments[segmentIndex];
    if (segment?.type !== "checklist" && segment?.type !== "list") return;

    if (segment.text.trim().length === 0) {
      exitInlineRow(segmentIndex);
      return;
    }

    const nextText = segment.text.slice(0, selectionStart);
    const insertedText = segment.text.slice(selectionEnd);
    const insertedSegment =
      segment.type === "checklist"
        ? ({
            type: "checklist",
            checked: false,
            text: insertedText,
          } satisfies NoteChecklistSegment)
        : ({
            type: "list",
            kind: segment.kind,
            text: insertedText,
          } satisfies NoteListSegment);

    const nextSegments = segments.map((currentSegment, index) =>
      index === segmentIndex ? { ...segment, text: nextText } : currentSegment,
    );
    nextSegments.splice(segmentIndex + 1, 0, insertedSegment);
    onValueChange(serializeNoteSegments(nextSegments));
    setPendingSelection({
      type: insertedSegment.type,
      segmentIndex: segmentIndex + 1,
      caretPosition: 0,
    });
  }

  function getTextLineBounds(text: string, caretPosition: number) {
    const lineStart = text.lastIndexOf("\n", Math.max(0, caretPosition - 1)) + 1;
    const nextLineBreak = text.indexOf("\n", caretPosition);
    const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;

    return {
      lineStart,
      lineEnd,
      lineText: text.slice(lineStart, lineEnd),
    };
  }

  function handleEmptyTextLineBackspace(
    event: KeyboardEvent<EditableTextControl>,
    segmentIndex: number,
  ) {
    if (event.key !== "Backspace" || event.nativeEvent.isComposing) return false;

    const segment = segments[segmentIndex];
    if (segment?.type !== "text") return false;

    const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(
      event.currentTarget,
      segment.text,
    );
    if (selectionStart !== selectionEnd) return false;

    const { lineStart, lineEnd, lineText } = getTextLineBounds(segment.text, selectionStart);
    const previousSegmentIndex = segmentIndex - 1;
    if (lineText.length > 0 || lineStart > 0) return false;

    event.preventDefault();
    closeMenu();

    if (previousSegmentIndex < 0) {
      const hasLaterBodyContent = segment.text.length > 0 || segments.length > 1;

      if (!hasLaterBodyContent) {
        setPendingSelection({
          type: "text",
          segmentIndex,
          caretPosition: 0,
        });
        return true;
      }

      const nextSegments = removeTextLineFromSegment(
        [...segments],
        segmentIndex,
        lineStart,
        lineEnd,
      );
      const parsedNextSegments = parseNoteSegments(serializeNoteSegments(nextSegments));
      commitSegments(
        nextSegments,
        getSelectionAtSegmentStart(parsedNextSegments, 0) ??
          findNearestEditableSelection(parsedNextSegments, 0),
      );
      return true;
    }

    const previousSegment = segments[previousSegmentIndex];
    let nextSegments = removeTextLineFromSegment([...segments], segmentIndex, lineStart, lineEnd);

    if (
      (previousSegment?.type === "checklist" || previousSegment?.type === "list") &&
      previousSegment.text.trim().length === 0
    ) {
      nextSegments = nextSegments.filter((_, index) => index !== previousSegmentIndex);
      const parsedNextSegments = parseNoteSegments(serializeNoteSegments(nextSegments));
      const previousRowIndex = Math.max(0, previousSegmentIndex - 1);
      commitSegments(
        nextSegments,
        getSelectionAtSegmentEnd(parsedNextSegments, previousRowIndex) ??
          findNearestEditableSelection(parsedNextSegments, previousRowIndex),
      );
      return true;
    }

    const parsedNextSegments = parseNoteSegments(serializeNoteSegments(nextSegments));
    const nextSelection =
      getSelectionAtSegmentEnd(parsedNextSegments, previousSegmentIndex) ??
      findNearestEditableSelection(parsedNextSegments, previousSegmentIndex);

    commitSegments(nextSegments, nextSelection);
    return true;
  }

  function openSubpage(subpageId: string | null) {
    if (!subpageId) return;
    onOpenSubpage?.(subpageId);
  }

  function updateDatabaseDefinition(
    databaseId: string,
    getNextDefinition: (currentDefinition: NoteDatabaseDefinition) => NoteDatabaseDefinition,
  ) {
    const databaseSegment = segments.find(
      (segment): segment is NoteDatabaseSegment =>
        segment.type === "database" && segment.databaseId === databaseId,
    );
    if (!databaseSegment) return;

    const currentDefinitions = normalizedDatabaseDefinitions;
    const currentDefinition =
      currentDefinitions[databaseId] ?? createDefaultDatabaseDefinition(databaseSegment);
    const nextDefinition = normalizeDatabaseDefinition(getNextDefinition(currentDefinition));

    onDatabaseDefinitionsChange?.({
      ...currentDefinitions,
      [databaseId]: nextDefinition,
    });
  }

  function openDatabase(segment: NoteDatabaseSegment) {
    const storedDefinition = databaseDefinitions?.[segment.databaseId];
    if (isLegacyHydrationDatabase(segment.databaseId, storedDefinition, segment.title)) return;
    const currentDefinition =
      normalizedDatabaseDefinitions[segment.databaseId] ??
      createDefaultDatabaseDefinition(segment);

    if (isLegacyHydrationDatabase(segment.databaseId, currentDefinition, segment.title)) return;

    if (!databaseDefinitions?.[segment.databaseId]) {
      updateDatabaseDefinition(segment.databaseId, (currentDefinition) => currentDefinition);
    }

    if (onOpenDatabase) {
      void onOpenDatabase(segment.databaseId);
      return;
    }

    if (isLockedStarterDatabase(currentDefinition)) return;

    setActiveDatabaseId(segment.databaseId);
  }

  function deleteDatabaseById(databaseId: string) {
    const removal = removeNoteDatabaseSegment({
      content: value,
      databaseDefinitions,
      databaseEntries,
      databaseId,
    });

    if (removal.locked) {
      console.warn("This system database is locked.", {
        databaseId: removal.databaseId,
        systemDatabaseKey: removal.systemDatabaseKey,
      });
      return;
    }

    if (!removal.removed) return;

    const parsedNextSegments = parseNoteSegments(removal.content);
    onValueChange(removal.content);
    onDatabaseDefinitionsChange?.(removal.databaseDefinitions);
    onDatabaseEntriesChange?.(removal.databaseEntries);
    setActiveDatabaseId(null);

    if (activeEntryDatabaseId === databaseId) {
      setActiveEntryDatabaseId(null);
    }

    setPendingSelection(findNearestEditableSelection(parsedNextSegments, removal.segmentIndex));
  }

  function openDatabaseEntrySheet(segment: NoteDatabaseSegment) {
    const storedDefinition = databaseDefinitions?.[segment.databaseId];
    if (isLegacyHydrationDatabase(segment.databaseId, storedDefinition, segment.title)) return;
    const definition =
      normalizedDatabaseDefinitions[segment.databaseId] ??
      createDefaultDatabaseDefinition(segment);
    if (isLegacyHydrationDatabase(segment.databaseId, definition, segment.title)) return;

    setActiveEntryDatabaseId(segment.databaseId);

    if (!databaseDefinitions?.[segment.databaseId]) {
      updateDatabaseDefinition(segment.databaseId, (currentDefinition) => currentDefinition);
    }
  }

  function closeDatabaseEntrySheet() {
    setActiveEntryDatabaseId(null);
  }

  async function saveDatabaseEntry(nextEntry: NoteDatabaseEntry) {
    if (!activeEntryDatabaseDefinition) return;

    if (isOnHandDatabaseDefinition(activeEntryDatabaseDefinition)) {
      const response = await fetch("/api/food-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapOnHandEntryToFoodResourcePayload(nextEntry)),
      });
      const payload = (await response.json()) as FoodResourcesResponse;

      if (!response.ok || !payload.foodResource) {
        throw new Error(payload.error || "Unable to save Grocery List item.");
      }

      await refreshOnHandEntries();
      return;
    }

    const currentEntries = databaseEntries ?? {};

    onDatabaseEntriesChange?.({
      ...currentEntries,
      [activeEntryDatabaseDefinition.id]: [
        ...(currentEntries[activeEntryDatabaseDefinition.id] ?? []),
        nextEntry,
      ],
    });
    void hapticComplete();
  }

  function updateDatabaseTitle(databaseId: string, title: string) {
    if (isLockedStarterDatabaseId(databaseId)) return;

    updateDatabaseDefinition(databaseId, (currentDefinition) => ({
      ...currentDefinition,
      title,
    }));
  }

  function toggleDatabaseBodyPin(databaseId: string) {
    void hapticSoftTick();
    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      if (currentDefinition.pinnedSurface === "body") {
        const nextDefinition = { ...currentDefinition };
        delete nextDefinition.pinnedSurface;
        return nextDefinition;
      }

      return {
        ...currentDefinition,
        pinnedSurface: "body",
      };
    });
  }

  function addDatabaseField(databaseId: string) {
    if (isLockedStarterDatabaseId(databaseId)) return;

    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      const nextField = createDefaultDatabaseField();

      return {
        ...currentDefinition,
        fields: [...currentDefinition.fields, nextField],
        views: currentDefinition.views?.map((view) => ({
          ...view,
          visibleFieldIds: Array.from(new Set([...view.visibleFieldIds, nextField.id])),
        })),
      };
    });
  }

  function updateDatabaseField(
    databaseId: string,
    fieldId: string,
    updates: Partial<Pick<NoteDatabaseFieldDefinition, "name" | "type">>,
  ) {
    if (isLockedStarterDatabaseId(databaseId)) return;

    updateDatabaseDefinition(databaseId, (currentDefinition) => ({
      ...currentDefinition,
      fields: currentDefinition.fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field,
      ),
    }));
  }

  function removeDatabaseField(databaseId: string, fieldId: string) {
    if (isLockedStarterDatabaseId(databaseId)) return;

    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      if (fieldId === currentDefinition.titleFieldId) return currentDefinition;

      return {
        ...currentDefinition,
        fields: currentDefinition.fields.filter((field) => field.id !== fieldId),
        views: currentDefinition.views?.map((view) => ({
          ...view,
          visibleFieldIds: view.visibleFieldIds.filter(
            (visibleFieldId) => visibleFieldId !== fieldId,
          ),
        })),
      };
    });
  }

  function updateDatabaseActiveView(databaseId: string, viewType: NoteDatabaseViewType) {
    const currentViewType =
      normalizedDatabaseDefinitions[databaseId]?.views?.find(
        (view) => view.id === normalizedDatabaseDefinitions[databaseId]?.activeViewId,
      )?.type ?? NOTE_DATABASE_VIEW_TYPES[0];
    if (currentViewType !== viewType) {
      void hapticSoftTick();
    }

    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      const activeView = currentDefinition.views?.find((view) => view.type === viewType);
      return {
        ...currentDefinition,
        activeViewId:
          activeView?.id ?? buildDefaultDatabaseViewId(currentDefinition.id, viewType),
      };
    });
  }

  function updateDatabaseViewFieldVisibility(
    databaseId: string,
    viewId: string,
    fieldId: string,
    isVisible: boolean,
  ) {
    if (isLockedStarterDatabaseId(databaseId)) return;

    updateDatabaseDefinition(databaseId, (currentDefinition) => {
      const titleField = getDatabaseTitleField(currentDefinition);
      if (!titleField || (fieldId === titleField.id && !isVisible)) return currentDefinition;

      const fieldsWithTitleFirst = getDatabaseFieldsWithTitleFirst(currentDefinition);

      return {
        ...currentDefinition,
        views: currentDefinition.views?.map((view) => {
          if (view.id !== viewId) return view;

          const visibleIds = new Set(view.visibleFieldIds);
          if (isVisible) {
            visibleIds.add(fieldId);
          } else {
            visibleIds.delete(fieldId);
          }
          visibleIds.add(titleField.id);

          return {
            ...view,
            visibleFieldIds: fieldsWithTitleFirst
              .filter((field) => field.id === titleField.id || visibleIds.has(field.id))
              .map((field) => field.id),
          };
        }),
      };
    });
  }

  async function applyCommand(command: SlashCommand) {
    if (!slashTrigger) return;

    const activeSegment = segments[slashTrigger.segmentIndex];
    if (activeSegment?.type !== "text") return;

    let replacement = command.replacement;
    let createdSubpage: { id: string; title: string; href?: string } | null = null;
    let createdDatabaseDefinition: NoteDatabaseDefinition | null = null;

    if (command.id === "subpage" && onCreateSubpage) {
      try {
        const subpage = await onCreateSubpage();
        if (!subpage) return;
        createdSubpage = subpage;
        replacement = buildSubpageMarker(subpage);
      } catch (error) {
        console.error("Failed to create subpage note", { error });
        return;
      }
    }

    if (command.id === "database") {
      const databaseId = buildClientDatabaseId();
      replacement = buildDatabaseMarker({ id: databaseId });
      createdDatabaseDefinition = createDefaultDatabaseDefinition({
        type: "database",
        marker: replacement,
        title: NOTE_DATABASE_TITLE_FALLBACK,
        databaseId,
      });
    }

    const shouldInsertStandaloneLine = [
      "checklist",
      "bulletList",
      "dashList",
      "divider",
      "subpage",
      "database",
    ].includes(command.id);
    const editableControl = textareaRefs.current.get(slashTrigger.segmentIndex);
    const liveSelection = editableControl
      ? getSerializedSelectionFromEditable(editableControl, activeSegment.text)
      : null;
    const selectionEnd = liveSelection?.selectionEnd ?? slashTrigger.triggerIndex + 1;
    const replacementEnd = Math.max(selectionEnd, slashTrigger.triggerIndex + 1);
    const before = activeSegment.text.slice(0, slashTrigger.triggerIndex);
    const after = activeSegment.text.slice(replacementEnd);
    const {
      caretPosition,
      markerStart,
      nextValue: nextText,
    } = shouldInsertStandaloneLine
      ? buildStandaloneLineInsertion(replacement, before, after)
      : {
          caretPosition: slashTrigger.triggerIndex + replacement.length,
          markerStart: slashTrigger.triggerIndex,
          nextValue: before + replacement + after,
        };

    const activeSegmentStart = getSegmentStartOffsets(segments)[slashTrigger.segmentIndex] ?? 0;
    const nextSegments = segments.map((segment, index) =>
      index === slashTrigger.segmentIndex && segment.type === "text"
        ? { type: "text" as const, text: nextText }
        : segment,
    );
    const nextValue = serializeNoteSegments(nextSegments);
    const parsedNextSegments = parseNoteSegments(nextValue);
    const nextSelection =
      command.id === "checklist"
        ? findChecklistSelectionForCaret(parsedNextSegments, activeSegmentStart + markerStart)
        : command.id === "bulletList" || command.id === "dashList"
          ? findListSelectionForCaret(parsedNextSegments, activeSegmentStart + markerStart)
        : findTextSelectionForCaret(parsedNextSegments, activeSegmentStart + caretPosition);

    onValueChange(nextValue);
    if (createdDatabaseDefinition) {
      onDatabaseDefinitionsChange?.({
        ...normalizedDatabaseDefinitions,
        [createdDatabaseDefinition.id]: createdDatabaseDefinition,
      });
    }
    setPendingSelection(
      nextSelection ?? {
        type: "text",
        segmentIndex: slashTrigger.segmentIndex,
        caretPosition,
      },
    );
    closeMenu();

    if (createdSubpage) {
      await onSubpageCreated?.(createdSubpage, nextValue);
    }
  }

  function handleTextKeyDown(event: KeyboardEvent<EditableTextControl>, segmentIndex: number) {
    if (handleEmptyTextLineBackspace(event, segmentIndex)) {
      return;
    }

    if (!isMenuOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedCommandIndex((current) => (current + 1) % SLASH_COMMANDS.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedCommandIndex(
        (current) => (current - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void applyCommand(SLASH_COMMANDS[selectedCommandIndex]);
    }
  }

  function handleBlockKeyDown(event: KeyboardEvent<HTMLButtonElement>, segmentIndex: number) {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    event.preventDefault();
    if (segments[segmentIndex]?.type === "subpage") return;
    removeSegment(segmentIndex);
  }

  function handleInlineRowKeyDown(
    event: KeyboardEvent<EditableTextControl>,
    segmentIndex: number,
  ) {
    const segment = segments[segmentIndex];
    if (segment?.type !== "checklist" && segment?.type !== "list") return;

    if (event.key === "Backspace" || event.key === "Delete") {
      const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(
        event.currentTarget,
        segment.text,
      );
      const isEmptyRow = segment.text.length === 0;
      const isCollapsedAtStart = selectionStart === 0 && selectionEnd === 0;

      if (isEmptyRow && isCollapsedAtStart) {
        event.preventDefault();
        exitInlineRow(segmentIndex);
      }

      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(
      event.currentTarget,
      segment.text,
    );
    splitInlineRow(
      segmentIndex,
      selectionStart,
      selectionEnd,
    );
  }

  function handleEditableTextInput(
    type: EditableTextSelection["type"],
    segmentIndex: number,
    control: EditableTextControl,
  ) {
    const nextText = readSerializedEditableText(control);
    const { selectionStart, selectionEnd } = getSerializedSelectionFromEditable(control, nextText);

    if (type === "text") {
      updateTextSegment(segmentIndex, nextText);
      syncSlashTrigger(segmentIndex, nextText, selectionStart);
    } else if (type === "checklist") {
      updateChecklistSegment(segmentIndex, { text: nextText });
    } else {
      updateListSegment(segmentIndex, { text: nextText });
    }

    activeTextSelectionRef.current = {
      type,
      segmentId: buildEditableSegmentId(type, segmentIndex),
      segmentIndex,
      selectionStart,
      selectionEnd,
      control,
    };
    setPendingSelection({
      type,
      segmentIndex,
      caretPosition: selectionStart,
      selectionEnd,
    });
  }

  function renderEditableTextControl(
    type: EditableTextSelection["type"],
    segmentIndex: number,
    text: string,
    options: {
      placeholder?: string;
      className: string;
      ariaLabel?: string;
      ariaControls?: string;
      multiline?: boolean;
    },
  ) {
    const editableId = buildEditableSegmentId(type, segmentIndex);

    return (
      <div
        key={`${segmentIndex}-${type}`}
        ref={(node) => {
          const refs = type === "text" ? textareaRefs : lineInputRefs;
          if (node) {
            refs.current.set(segmentIndex, node);
          } else {
            refs.current.delete(segmentIndex);
          }
        }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        spellCheck
        data-note-editable-segment-id={editableId}
        data-placeholder={options.placeholder}
        aria-label={options.ariaLabel}
        aria-controls={options.ariaControls}
        aria-multiline={options.multiline ?? false}
        onInput={(event) => handleEditableTextInput(type, segmentIndex, event.currentTarget)}
        onKeyDown={(event) =>
          type === "text"
            ? handleTextKeyDown(event, segmentIndex)
            : handleInlineRowKeyDown(event, segmentIndex)
        }
        onKeyUp={(event) => rememberEditableSelection(type, segmentIndex, event.currentTarget)}
        onFocus={(event) => rememberEditableSelection(type, segmentIndex, event.currentTarget)}
        onClick={(event) => rememberEditableSelection(type, segmentIndex, event.currentTarget)}
        onPointerUp={(event) => rememberEditableSelection(type, segmentIndex, event.currentTarget)}
        onSelect={(event) => {
          const nextSelection = rememberEditableSelection(type, segmentIndex, event.currentTarget);
          if (type === "text" && nextSelection) {
            syncSlashTrigger(segmentIndex, text, nextSelection.selectionStart);
          }
        }}
        onBlur={type === "text" ? closeMenu : undefined}
        className={`${options.className} whitespace-pre-wrap break-words empty:before:pointer-events-none empty:before:text-white/28 empty:before:content-[attr(data-placeholder)]`}
      >
        {renderInlineFormattingNodes(parseInlineFormatting(text), editableId)}
      </div>
    );
  }

  function handleSegmentDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    const activeRect = event.active.rect.current.initial;

    closeMenu();
    setActiveSegmentDragId(activeId);
    setActiveSegmentDragSize(
      activeRect
        ? {
            id: activeId,
            width: activeRect.width,
            height: activeRect.height,
          }
        : null,
    );
  }

  function handleSegmentDragCancel() {
    setActiveSegmentDragId(null);
    setActiveSegmentDragSize(null);
  }

  function handleSegmentDragEnd(event: DragEndEvent) {
    setActiveSegmentDragId(null);
    setActiveSegmentDragSize(null);

    const fromIndex = parseNoteSegmentDragId(event.active.id);
    const toIndex = event.over ? parseNoteSegmentDragId(event.over.id) : null;
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return;
    if (!segments[fromIndex] || !segments[toIndex]) return;

    const nextSegments = arrayMove(segments, fromIndex, toIndex);
    const nextValue = serializeNoteSegments(nextSegments);
    const parsedNextSegments = parseNoteSegments(nextValue);
    const targetSelection = getSelectionAtSegmentStart(parsedNextSegments, toIndex);

    onValueChange(nextValue);
    setPendingSelection(
      targetSelection?.type === "block"
        ? findNearestEditableSelection(parsedNextSegments, toIndex) ?? targetSelection
        : targetSelection ?? findNearestEditableSelection(parsedNextSegments, toIndex),
    );
  }

  function renderSortableSegment(index: number, segment: NoteSegment, children: ReactNode) {
    return (
      <SortableNoteSegment
        key={segmentDragIds[index]}
        id={segmentDragIds[index] ?? buildNoteSegmentDragId(index)}
        label={getNoteSegmentDragLabel(segment)}
        lockedDragSize={activeSegmentDragSize}
      >
        {children}
      </SortableNoteSegment>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`${className ?? ""} relative flex flex-col gap-1 overflow-visible`}
      aria-label={ariaLabel}
    >
      <DndContext
        sensors={dragSensors}
        collisionDetection={closestCenter}
        onDragStart={handleSegmentDragStart}
        onDragCancel={handleSegmentDragCancel}
        onDragEnd={handleSegmentDragEnd}
      >
        <SortableContext items={segmentDragIds} strategy={verticalListSortingStrategy}>
          {segments.map((segment, index) => {
            if (segment.type === "divider") {
              return renderSortableSegment(
                index,
                segment,
            <div key={`${index}-divider`} className="flex min-h-7 items-center py-1">
              <button
                type="button"
                ref={(node) => {
                  if (node) {
                    blockButtonRefs.current.set(index, node);
                  } else {
                    blockButtonRefs.current.delete(index);
                  }
                }}
                aria-label="Divider block. Press Backspace or Delete to remove."
                onKeyDown={(event) => handleBlockKeyDown(event, index)}
                className="group flex h-5 w-full items-center rounded-md outline-none focus-visible:bg-white/[0.035]"
              >
                <span className={NOTE_DIVIDER_LINE_CLASS} />
              </button>
            </div>,
              );
            }

            if (segment.type === "checklist") {
              return renderSortableSegment(
                index,
                segment,
            <div key={`${index}-checklist`} className="group flex min-h-7 items-center gap-2 py-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={segment.checked}
                onClick={() => updateChecklistSegment(index, { checked: !segment.checked })}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border outline-none transition ${
                  segment.checked
                    ? "border-white/18 bg-white/38 text-black/80 hover:bg-white/45 focus-visible:ring-1 focus-visible:ring-white/28"
                    : "border-white/18 bg-black text-transparent hover:border-white/26 focus-visible:ring-1 focus-visible:ring-white/26"
                }`}
                aria-label={
                  segment.checked
                    ? "Mark checklist item incomplete"
                    : "Mark checklist item complete"
                }
              >
                <X className="h-3 w-3 stroke-[2.4]" />
              </button>
              {renderEditableTextControl("checklist", index, segment.text, {
                placeholder: "Item text",
                className: `min-h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-base leading-7 outline-none selection:bg-emerald-300/25 selection:text-white ${
                  segment.checked ? "text-white/58" : "text-white"
                }`,
                ariaLabel: "Checklist item text",
              })}
            </div>,
              );
            }

            if (segment.type === "list") {
              return renderSortableSegment(
                index,
                segment,
            <div key={`${index}-list`} className="group flex min-h-7 items-center gap-2 py-0">
              <span
                className="flex h-7 w-[18px] shrink-0 items-center justify-center text-base font-semibold leading-7 text-white/72"
                aria-hidden="true"
              >
                {segment.kind === "bullet" ? "•" : "-"}
              </span>
              {renderEditableTextControl("list", index, segment.text, {
                placeholder: "List item",
                className: "min-h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-base leading-7 text-white outline-none selection:bg-emerald-300/25 selection:text-white",
                ariaLabel:
                  segment.kind === "bullet" ? "Bullet list item text" : "Dash list item text",
              })}
            </div>,
              );
            }

            if (segment.type === "subpage") {
              const canOpenSubpage = Boolean(segment.subpageId && onOpenSubpage);

              return renderSortableSegment(
                index,
                segment,
            <div key={`${index}-subpage`} className="flex min-h-9 items-center py-1">
              <div className="group flex w-full max-w-[28rem] items-center gap-1">
                <button
                  type="button"
                  ref={(node) => {
                    if (node) {
                      blockButtonRefs.current.set(index, node);
                    } else {
                      blockButtonRefs.current.delete(index);
                    }
                  }}
                  aria-disabled={!canOpenSubpage}
                  tabIndex={canOpenSubpage ? undefined : -1}
                  aria-label={
                    canOpenSubpage ? `Open subpage ${segment.title}` : `Subpage ${segment.title}`
                  }
                  onClick={() => openSubpage(segment.subpageId)}
                  onKeyDown={(event) => handleBlockKeyDown(event, index)}
                  className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.045] px-2 text-left text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus-visible:border-emerald-300/35 focus-visible:bg-white/[0.075] ${
                    canOpenSubpage
                      ? "cursor-pointer hover:border-emerald-300/20 hover:bg-white/[0.075] active:scale-[0.995]"
                      : "cursor-default"
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/25 text-white/55">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium leading-4">
                      {segment.title}
                    </span>
                    <span className="block truncate text-[10px] font-medium leading-3 text-white/32">
                      Subpage
                    </span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove subpage block ${segment.title}`}
                  onClick={() => removeSegment(index)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/35 opacity-100 outline-none transition hover:bg-white/[0.07] hover:text-white/70 focus-visible:bg-white/[0.07] focus-visible:text-white/75 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>,
              );
            }

            if (segment.type === "database") {
              const storedDefinition = databaseDefinitions?.[segment.databaseId];
              if (
                isLegacyHydrationDatabase(
                  segment.databaseId,
                  storedDefinition,
                  segment.title,
                )
              ) {
                return null;
              }
              const definition =
                normalizedDatabaseDefinitions[segment.databaseId] ??
                createDefaultDatabaseDefinition(segment);
              const displayTitle = getDatabaseMenuDisplayTitle(definition, segment.title);
              if (isLegacyHydrationDatabase(segment.databaseId, definition, segment.title)) {
                return null;
              }

              const isLockedSystemDatabase = definition.lockedSystemDatabase === true;
              const isStarterDatabaseSchemaLocked = isLockedStarterDatabase(definition);
              const canOpenDatabase = !isStarterDatabaseSchemaLocked || Boolean(onOpenDatabase);
              const isOnHandDatabase = isOnHandDatabaseDefinition(definition);
              const entries = isOnHandDatabase
                ? externalDatabaseEntries
                : databaseEntries?.[segment.databaseId] ?? [];
              const activeView = getActiveDatabaseView(definition);
              const visibleFields = getVisibleDatabaseFields(definition);
              const titleField = getDatabaseTitleField(definition);

              return renderSortableSegment(
                index,
                segment,
            <div key={`${index}-database`} className="flex min-h-[4.25rem] items-center py-1.5">
              <div className="group flex w-full max-w-[42rem] items-center gap-1">
                <div className="min-w-0 flex-1 border-y border-white/[0.055] bg-transparent py-2.5 text-white/90">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/38">
                      <DatabaseInlineIcon iconKey={getDatabaseDisplayIconKey(definition)} />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <p className="truncate text-sm font-semibold leading-4 text-white/86">
                        {displayTitle}
                      </p>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">
                        {NOTE_DATABASE_VIEW_LABELS[activeView.type]}
                      </span>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDatabaseEntrySheet(segment)}
                        className="flex h-7 items-center justify-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.025] px-2 text-xs font-semibold text-white/70 outline-none transition hover:border-white/[0.11] hover:bg-white/[0.045] hover:text-white/84 focus-visible:ring-1 focus-visible:ring-white/20"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                      {canOpenDatabase ? (
                        <button
                          type="button"
                          aria-label={
                            isLockedSystemDatabase
                              ? `Open locked system database ${displayTitle}.`
                              : `Open database ${displayTitle}. Press Backspace or Delete to remove.`
                          }
                          title={
                            isLockedSystemDatabase
                              ? "This system database is locked."
                              : undefined
                          }
                          ref={(node) => {
                            if (node) {
                              blockButtonRefs.current.set(index, node);
                            } else {
                              blockButtonRefs.current.delete(index);
                            }
                          }}
                          onClick={() => openDatabase(segment)}
                          onKeyDown={(event) => handleBlockKeyDown(event, index)}
                          className="flex h-7 items-center justify-center rounded-md border border-white/[0.06] bg-transparent px-2 text-xs font-semibold text-white/56 outline-none transition hover:border-white/[0.1] hover:bg-white/[0.035] hover:text-white/78 focus-visible:border-white/[0.18] focus-visible:bg-white/[0.045]"
                        >
                          Open
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2">
                    {isOnHandDatabase && externalDatabaseError ? (
                      <p className="pb-2 text-xs font-medium text-red-200/78">
                        {externalDatabaseError}
                      </p>
                    ) : null}
                    <NoteDatabaseEntriesView
                      activeView={activeView}
                      definition={definition}
                      entries={entries}
                      titleField={titleField}
                      visibleFields={visibleFields}
                    />
                  </div>
                </div>
              </div>
            </div>,
              );
            }

            return renderSortableSegment(
              index,
              segment,
              renderEditableTextControl("text", index, segment.text, {
                placeholder: segments.length === 1 ? placeholder : undefined,
                className:
                  "min-h-7 w-full border-0 bg-transparent p-0 text-base leading-7 text-white outline-none caret-white selection:bg-emerald-300/25 selection:text-white",
                ariaLabel,
                ariaControls: isMenuOpen ? "note-slash-command-menu" : undefined,
                multiline: true,
              }),
            );
          })}
        </SortableContext>
      </DndContext>

      {isMenuOpen ? (
        <div
          id="note-slash-command-menu"
          role="listbox"
          aria-label="Slash commands"
          className="note-slash-command-menu fixed inset-x-4 z-[60] overflow-y-auto overscroll-contain rounded-[22px] border border-white/10 bg-[#090909]/95 p-1.5 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl md:absolute md:left-0 md:right-auto md:w-80 md:overflow-hidden"
        >
          {SLASH_COMMANDS.map((command, index) => {
            const Icon = command.icon;
            const isSelected = index === selectedCommandIndex;

            return (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onPointerDown={(event) => {
                  event.preventDefault();
                  void applyCommand(command);
                }}
                onMouseEnter={() => setSelectedCommandIndex(index)}
                className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                  isSelected
                    ? "bg-emerald-400/15 text-emerald-100"
                    : "text-white/82 hover:bg-white/8"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border ${
                    isSelected
                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                      : "border-white/10 bg-white/[0.04] text-white/45"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{command.label}</span>
                  <span className="block truncate text-xs leading-4 text-white/42">
                    {command.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {activeEntryDatabaseDefinition ? (
        <NoteDatabaseEntrySheet
          databaseDefinition={activeEntryDatabaseDefinition}
          entries={
            isOnHandDatabaseDefinition(activeEntryDatabaseDefinition)
              ? externalDatabaseEntries
              : databaseEntries?.[activeEntryDatabaseDefinition.id]
          }
          onClose={closeDatabaseEntrySheet}
          onSaveEntry={saveDatabaseEntry}
          submitLabel={
            isOnHandDatabaseDefinition(activeEntryDatabaseDefinition)
              ? "Add grocery"
              : "Save entry"
          }
        />
      ) : null}

      {activeDatabaseDefinition && !isActiveStarterDatabaseSchemaLocked ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden overscroll-contain bg-black/58 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Database builder for ${getDatabaseDisplayTitle(activeDatabaseDefinition.title)}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              void hapticSnap();
              setActiveDatabaseId(null);
            }
          }}
        >
          <div className="animate-in slide-in-from-bottom-6 fade-in-0 flex max-h-[88vh] min-h-[66vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[30px] border border-white/[0.04] border-b-0 bg-[#090909] shadow-[0_-24px_80px_-32px_rgba(0,0,0,1)] duration-200 sm:mb-4 sm:min-h-0 sm:rounded-[30px] sm:border-b">
            <div className="relative border-b border-white/[0.04] px-4 pb-4 pt-3">
              <div
                className="mx-auto h-1 w-11 rounded-full bg-white/22"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-center text-base font-semibold leading-6 text-white">
                Database builder
              </h2>
              <button
                type="button"
                aria-label="Close database builder"
                onClick={() => {
                  void hapticSnap();
                  setActiveDatabaseId(null);
                }}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/46 outline-none transition hover:bg-white/[0.07] hover:text-white/82 focus-visible:bg-white/[0.08] focus-visible:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
              <label className="block">
                <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                  Database title
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <input
                    value={activeDatabaseDefinition.title}
                    onChange={(event) =>
                      updateDatabaseTitle(activeDatabaseDefinition.id, event.target.value)
                    }
                    placeholder={NOTE_DATABASE_DISPLAY_TITLE_FALLBACK}
                    className="h-12 min-w-0 flex-1 rounded-2xl border border-white/[0.04] bg-white/[0.065] px-4 text-base font-semibold text-white outline-none transition placeholder:text-white/28 selection:bg-emerald-300/25 hover:border-white/[0.06] focus-visible:border-white/[0.1]"
                    aria-label="Database title"
                  />
                  <button
                    type="button"
                    onClick={() => toggleDatabaseBodyPin(activeDatabaseDefinition.id)}
                    disabled={activeDatabaseDefinition.lockedSystemDatabase === true}
                    aria-pressed={
                      activeDatabaseDefinition.lockedSystemDatabase === true ||
                      activeDatabaseDefinition.pinnedSurface === "body"
                    }
                    aria-label={
                      activeDatabaseDefinition.lockedSystemDatabase === true
                        ? "System database pinned"
                        : activeDatabaseDefinition.pinnedSurface === "body"
                          ? "Unpin from stomach menu"
                          : "Pin to stomach menu"
                    }
                    title={
                      activeDatabaseDefinition.lockedSystemDatabase === true
                        ? "This system database is locked."
                        : activeDatabaseDefinition.pinnedSurface === "body"
                          ? "Unpin from stomach menu"
                          : "Pin to stomach menu"
                    }
                    className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl outline-none transition focus-visible:ring-1 focus-visible:ring-white/35 disabled:cursor-not-allowed ${
                      activeDatabaseDefinition.lockedSystemDatabase === true ||
                      activeDatabaseDefinition.pinnedSurface === "body"
                        ? "bg-white/[0.12] text-white/86 hover:bg-white/[0.16] hover:text-white disabled:text-white/42 disabled:hover:bg-white/[0.12]"
                        : "bg-white/[0.045] text-white/42 hover:bg-white/[0.065] hover:text-white/68"
                    }`}
                  >
                    <Pin
                      className="h-4 w-4"
                      fill={
                        activeDatabaseDefinition.lockedSystemDatabase === true ||
                        activeDatabaseDefinition.pinnedSurface === "body"
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </span>
              </label>

              <div className="mt-4 rounded-2xl border border-white/[0.04] bg-white/[0.035] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 rounded-full border border-white/[0.04] bg-black/22 p-0.5">
                    {NOTE_DATABASE_VIEW_TYPES.map((viewType) => (
                      <button
                        key={viewType}
                        type="button"
                        onClick={() => updateDatabaseActiveView(activeDatabaseDefinition.id, viewType)}
                        aria-pressed={activeDatabaseView?.type === viewType}
                        className={`rounded-full px-2.5 text-[11px] font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-white/18 ${
                          activeDatabaseView?.type === viewType
                            ? "bg-white/[0.09] text-white/84"
                            : "text-white/42 hover:bg-white/[0.045] hover:text-white/66"
                        }`}
                      >
                        {NOTE_DATABASE_VIEW_LABELS[viewType]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">
                  Fields
                </p>
                {activeDatabaseFields.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.035]">
                    {activeDatabaseFields.map((field) => {
                      const isTitleField = field.id === activeDatabaseDefinition.titleFieldId;
                      const isFieldVisible =
                        isTitleField ||
                        Boolean(activeDatabaseView?.visibleFieldIds.includes(field.id));
                      const activeViewLabel = activeDatabaseView
                        ? NOTE_DATABASE_VIEW_LABELS[activeDatabaseView.type]
                        : "active view";

                      return (
                        <div
                          key={field.id}
                          className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-white/[0.04] px-3 py-2.5 last:border-b-0"
                        >
                          <span
                            className="flex h-8 w-5 items-center justify-center text-white/22"
                            aria-hidden="true"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <input
                            value={field.name}
                            onChange={(event) =>
                              updateDatabaseField(activeDatabaseDefinition.id, field.id, {
                                name: event.target.value,
                              })
                            }
                            placeholder="Field name"
                            className="min-w-0 border-0 bg-transparent p-0 text-sm font-semibold leading-6 text-white/82 outline-none placeholder:text-white/24 selection:bg-emerald-300/25"
                            aria-label="Field name"
                          />
                          {isTitleField ? (
                            <span className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.05] bg-black/22 px-2 text-xs font-semibold text-white/62">
                              Title
                              <span className="text-white/28">Text</span>
                            </span>
                          ) : (
                            <select
                              value={field.type}
                              onChange={(event) =>
                                updateDatabaseField(activeDatabaseDefinition.id, field.id, {
                                  type: event.target.value as NoteDatabaseFieldType,
                                })
                              }
                              className="h-8 max-w-[8rem] rounded-full border border-white/[0.05] bg-black/22 px-2 text-xs font-semibold text-white/62 outline-none transition hover:border-white/[0.08] hover:text-white/78 focus-visible:border-white/[0.12]"
                              aria-label="Field type"
                            >
                              {NOTE_DATABASE_FIELD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {NOTE_DATABASE_FIELD_TYPE_LABELS[type]}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            aria-label={
                              isTitleField
                                ? `Title field stays visible in ${activeViewLabel}`
                                : `${isFieldVisible ? "Hide" : "Show"} field ${
                                    field.name || "Untitled field"
                                  } in ${activeViewLabel}`
                            }
                            onClick={() => {
                              if (!activeDatabaseView) return;

                              updateDatabaseViewFieldVisibility(
                                activeDatabaseDefinition.id,
                                activeDatabaseView.id,
                                field.id,
                                !isFieldVisible,
                              );
                            }}
                            disabled={isTitleField || !activeDatabaseView}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg outline-none transition focus-visible:bg-white/[0.07] focus-visible:text-white ${
                              isFieldVisible
                                ? "text-white/58 hover:bg-white/[0.055] hover:text-white/82"
                                : "text-white/24 hover:bg-white/[0.055] hover:text-white/58"
                            } disabled:cursor-not-allowed disabled:text-white/24 disabled:hover:bg-transparent`}
                          >
                            {isFieldVisible ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove field ${field.name || "Untitled field"}`}
                            onClick={() => removeDatabaseField(activeDatabaseDefinition.id, field.id)}
                            disabled={isTitleField}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/32 outline-none transition hover:bg-white/[0.055] hover:text-white/70 focus-visible:bg-white/[0.07] focus-visible:text-white disabled:cursor-not-allowed disabled:text-white/14 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.025] px-4 py-8 text-center text-sm font-medium text-white/38">
                    Add fields to shape this database block.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/[0.04] p-3">
              <button
                type="button"
                onClick={() => addDatabaseField(activeDatabaseDefinition.id)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.06] text-sm font-semibold text-white/76 outline-none transition hover:border-white/[0.08] hover:bg-white/[0.085] hover:text-white/90 focus-visible:ring-1 focus-visible:ring-white/18"
              >
                <Plus className="h-4 w-4" />
                Add Field
              </button>
              <button
                type="button"
                onClick={() => deleteDatabaseById(activeDatabaseDefinition.id)}
                disabled={activeDatabaseDefinition.lockedSystemDatabase === true}
                aria-label={
                  activeDatabaseDefinition.lockedSystemDatabase === true
                    ? "System database cannot be deleted"
                    : `Delete database ${getDatabaseDisplayTitle(activeDatabaseDefinition.title)}`
                }
                title={
                  activeDatabaseDefinition.lockedSystemDatabase === true
                    ? "This system database is locked."
                    : `Delete database ${getDatabaseDisplayTitle(activeDatabaseDefinition.title)}`
                }
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-red-300/[0.1] bg-red-950/[0.08] text-sm font-semibold text-red-100/58 outline-none transition hover:border-red-300/[0.16] hover:bg-red-950/[0.14] hover:text-red-100/78 focus-visible:ring-1 focus-visible:ring-red-100/18 disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:bg-white/[0.025] disabled:text-white/26 disabled:hover:bg-white/[0.025]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {activeDatabaseDefinition.lockedSystemDatabase === true
                  ? "System DB locked"
                  : "Delete DB"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

NoteSlashTextarea.displayName = "NoteSlashTextarea";
