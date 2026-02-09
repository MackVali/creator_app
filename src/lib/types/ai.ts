export type AiScope = "read_only" | "draft_creation" | "schedule_edit";

export type AiThreadPayload = {
  role: "user" | "assistant";
  content: string;
};

export type AiThreadMessage = AiThreadPayload & {
  ts: number;
};

export const SCHEDULER_PRIORITY_LABELS = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "ULTRA-CRITICAL",
] as const;

export type SchedulerPriorityLabel = (typeof SCHEDULER_PRIORITY_LABELS)[number];

export type AiSchedulerOp =
  | {
      type: "SET_DAY_TYPE_ASSIGNMENT";
      date: string;
      day_type_name: string;
    }
  | {
      type: "SET_GOAL_PRIORITY_BY_NAME";
      goal_title: string;
      priority: number;
    }
  | {
      type: "SET_PROJECT_PRIORITY_BY_NAME";
      project_title: string;
      priority: number;
    }
  | {
      type: "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL";
      day_type_name: string;
      block_label: string;
      patch: {
        start_local?: string;
        end_local?: string;
      };
    }
  | {
      type: "CREATE_DAY_TYPE";
      name: string;
    }
  | {
      type: "CREATE_DAY_TYPE_TIME_BLOCK";
      day_type_name: string;
      label: string;
      start_local: string;
      end_local: string;
      block_type?: "FOCUS" | "PRACTICE" | "BREAK";
      energy?: "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";
      days?: number[];
    };

export type SchedulerOpPreview = {
  type: AiSchedulerOp["type"];
  description: string;
  resolvedId?: string;
  before?: string;
  after?: string;
};

interface BaseIntent {
  confidence: number;
  title: string;
  message: string;
}

export type AiIntent =
  | ({ type: "NO_OP" } & BaseIntent)
  | ({
      type: "DRAFT_CREATE_GOAL";
      draft: { name: string; priority?: string };
    } & BaseIntent)
  | ({
      type: "DRAFT_CREATE_PROJECT";
      draft: { name: string };
    } & BaseIntent)
  | ({
      type: "DRAFT_CREATE_TASK";
      draft: { name: string; projectId?: string };
    } & BaseIntent)
  | ({
      type: "SUGGEST_SCHEDULE_CHANGE";
      suggestion: { summary: string };
    } & BaseIntent)
  | ({
      type: "NEEDS_CLARIFICATION";
      missing: string[];
      questions: string[];
    } & BaseIntent)
  | ({
      type: "DRAFT_SCHEDULER_INPUT_OPS";
      ops: AiSchedulerOp[];
    } & BaseIntent);

export type AiIntentParsePath =
  | "parsed"
  | "json_fallback"
  | "no_op_error"
  | "disabled"
  | "mock"
  | "autopilot"
  | "dev_limit";

export type AiIntentResponse = {
  scope: AiScope;
  intent: AiIntent;
  snapshot?: unknown;
  assistant_message: string;
  follow_ups?: string[];
  _debug?: { parse_path: AiIntentParsePath };
};

export type AiApplyField =
  | "day_type_name"
  | "goal_title"
  | "project_title"
  | "time_block_label";

export type AiApplyCandidate = {
  id: string;
  title: string;
};

export type AiApplySuggestedOverrides = {
  goal_id?: string;
  project_id?: string;
  day_type_id?: string;
  day_type_time_block_id?: string;
};

export type AiApplyErrorResponse = {
  ok: false;
  error_code: "NOT_FOUND" | "AMBIGUOUS_MATCH";
  message: string;
  field: AiApplyField;
  candidates?: AiApplyCandidate[];
  suggested_overrides?: AiApplySuggestedOverrides;
};
