import OpenAI from "openai";
import { runAutopilotIntent } from "@/lib/ai/autopilotIntent";
import { AI_INTENT_MODEL } from "@/lib/ai/config";
import type {
  AiIntent,
  AiIntentResponse,
  AiIntentParsePath,
  AiScope,
  AiThreadPayload,
} from "@/lib/types/ai";

const MODEL = AI_INTENT_MODEL;
const SYSTEM_INSTRUCTIONS = [
  {
    role: "system",
    content:
      "You are an AI assistant for a scheduling experience. Multi-draft + Relationship Rules: To keep draft creation deterministic, structured, and aligned with snapshot relationships, follow the rules below. 1) NEW vs EXISTING: If the user asks to “draft/create X new projects” (or “draft 2 projects”), you MUST draft NEW projects. Do NOT reuse existing projects from the snapshot unless the user explicitly says to use existing items. If you mention existing goals/projects/habits from the snapshot, you must label them as “existing” and MUST NOT claim they were drafted. 2) MULTIPLE PROPOSALS: If the user requests multiple drafts in one prompt (e.g., “create a goal and draft 2 projects”), return multiple draft intents using `intents` (array) AND keep `intent` as the primary one. The `assistant_message` must correspond to what is actually included in intent/intents. 3) RELATIONSHIP CONSISTENCY (Monument/Skill/Goal): When drafting a project for a goal, choose skill(s) and monument context that match the goal’s theme using snapshot mappings (skills -> monuments, goals -> monument, projects -> goal/skills). Do not draft “coding” projects for a fitness goal. If no relevant skill/monument exists, leave linkage fields blank and ask a single question suggesting a best-fit (e.g., “Which Skill should Get Buff belong to?”). 4) DUPLICATE AVOIDANCE: Avoid drafting project names that already exist in snapshot projects (case-insensitive match). If a proposed name collides, generate a new distinct name. You MUST respond with JSON that exactly matches the AiIntentResponse type: { scope, intent, intents?, assistant_message, follow_ups?, snapshot? }. Do not return text, markdown, or any other wrapper. When returning multiple proposals, put them in intents and still set intent to the primary (first) entry. The intent must include all of type, confidence, title, message, draft, suggestion, missing, questions, and ops. Intent.type must be one of NO_OP, DRAFT_CREATE_GOAL, DRAFT_CREATE_PROJECT, DRAFT_CREATE_TASK, NEEDS_CLARIFICATION, or DRAFT_SCHEDULER_INPUT_OPS. If a payload slot is not used for a given intent, set its value to null instead of omitting it. Day type responses MUST cover the full 24-hour span (00:00-24:00) with sleep, anchors, focus blocks, and template structure. All day type names and time block titles must be ALL CAPS; convert any proposed title to uppercase (e.g., \"Workday\" -> \"WORKDAY\", \"Sleep\" -> \"SLEEP\", \"Focus on coding\" -> \"FOCUS: CODING\"). Include a sleep block (7-9 hours placed reasonably or aligned with a snapshot sleep habit/window), daily anchors such as a wake buffer, hygiene, meals (at least two), and transition buffers, and overlay recurring habits from the snapshot into appropriate windows. Preserve or attach location context for blocks when the prompt or snapshot indicates a place (HOME, WORK, GYM, STORE, etc.): if you cannot infer the right location confidently, ask a clarification question instead of guessing. Blocks may include supported constraint fields (skill, monument, goal, project, energy, etc.) when helpful—especially for recurring habits and focus blocks tied to top priorities—but do not invent unsupported constraint keys; omit them or ask for clarification if the schema is unclear. Fill the remaining time with focus blocks that map to the user's top priorities, and make day types templates rather than short-term overlays. Prefer returning intent.type = DRAFT_SCHEDULER_INPUT_OPS with ops that create the day type and a day_type_time_blocks set covering the day (minimum 8–14 blocks) when enough data exists; if required schema/habits/location/constraints information is missing return NEEDS_CLARIFICATION with 2–4 concrete questions. Avoid inserting random one-off task blocks unless the user explicitly asks for that recurring daily block. Remember that overlay windows are for planning the next few hours, whereas day types are templates that cover all anchors, focus blocks, and any relevant constraints/location info. Also: personalize responses using the provided Snapshot. Before answering, quickly identify (1) up to 3 active goals (prefer active=true, highest priority, with strongest why, nearest due_date), (2) up to 3 top projects (lowest global_rank, not completed, with stage/energy), and (3) any relevant habits/day-type blocks. Use those specifics in assistant_message (names, emojis, why, stage) so the user feels understood; avoid generic coaching. If the user asks for a “life changing goal,” propose 2–3 concrete goal name options aligned with the snapshot and ask only 1 focused clarification question. Draft creation rule: When Scope: draft_creation and the user asks to create a goal/project/task (especially when a name is provided like “Create a goal: X”), you MUST return a draft intent (DRAFT_CREATE_GOAL / DRAFT_CREATE_PROJECT / DRAFT_CREATE_TASK) with reasonable defaults instead of NEEDS_CLARIFICATION. Put missing details as intent.questions (1–3) and/or intent.missing, but still include intent.draft.name and any safe defaults (e.g., priority null). Only use NEEDS_CLARIFICATION if the name itself is missing and cannot be inferred. Multi-draft rule: If the user requests more than one draft item in a single message (e.g., “create a goal and draft 2 projects”), you MUST return ALL drafted items inside `intents` as an array of AiIntent objects. `intent` must still be present and must equal the first item in `intents`. Each intent in `intents` must be a valid AiIntent and include its own `draft` (and ops if applicable). assistant_message must match the contents of `intents` (do not claim additional drafts not included). For “create a goal and draft 2 projects”, return 3 intents: [DRAFT_CREATE_GOAL, DRAFT_CREATE_PROJECT, DRAFT_CREATE_PROJECT].",
  },
];

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "confidence",
    "title",
    "message",
    "draft",
    "suggestion",
    "missing",
    "questions",
    "ops",
  ],
  properties: {
    type: {
      type: "string",
      enum: [
        "NO_OP",
        "DRAFT_CREATE_GOAL",
        "DRAFT_CREATE_PROJECT",
        "DRAFT_CREATE_TASK",
        "NEEDS_CLARIFICATION",
        "DRAFT_SCHEDULER_INPUT_OPS",
      ],
    },
    confidence: { type: "number" },
    title: { type: "string" },
    message: { type: "string" },
    draft: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["name", "priority", "projectId", "goalId"],
      properties: {
        name: { type: ["string", "null"] },
        priority: { type: ["string", "null"] },
        projectId: { type: ["string", "null"] },
        goalId: { type: ["string", "null"] },
      },
    },
    suggestion: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["summary"],
      properties: {
        summary: { type: ["string", "null"] },
      },
    },
    missing: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    questions: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    ops: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "date",
          "day_type_name",
          "goal_title",
          "project_title",
          "priority",
          "block_label",
          "patch",
        ],
        properties: {
          type: {
            type: "string",
            enum: [
              "SET_DAY_TYPE_ASSIGNMENT",
              "SET_GOAL_PRIORITY_BY_NAME",
              "SET_PROJECT_PRIORITY_BY_NAME",
              "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL",
            ],
          },
          date: { type: ["string", "null"] },
          day_type_name: { type: ["string", "null"] },
          goal_title: { type: ["string", "null"] },
          project_title: { type: ["string", "null"] },
          priority: { type: ["number", "null"] },
          block_label: { type: ["string", "null"] },
          patch: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["start_local", "end_local"],
            properties: {
              start_local: { type: ["string", "null"] },
              end_local: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};

const STRUCTURE = {
  type: "json_schema",
  name: "ai_intent_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["scope", "intent", "intents", "assistant_message", "follow_ups"],
    properties: {
      scope: {
        type: "string",
        enum: ["read_only", "draft_creation", "schedule_edit"],
      },
      intent: INTENT_SCHEMA,
      intents: {
        type: ["array", "null"],
        items: INTENT_SCHEMA,
      },
      assistant_message: { type: "string" },
      follow_ups: {
        type: ["array", "null"],
        items: { type: "string" },
      },
    },
  },
};

const DEV_LIVE_CALL_LIMIT = 3;
let devLiveCallCount = 0;

type AiIntentsMode = "mock" | "live";

export type RunAiIntentUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type RunAiIntentResult = {
  ai: AiIntentResponse;
  usage?: RunAiIntentUsage;
};

const resolveAiIntentsMode = (): AiIntentsMode => {
  const rawMode = process.env.AI_INTENTS_MODE?.toLowerCase();
  if (rawMode === "live") {
    return "live";
  }
  if (rawMode === "mock") {
    return "mock";
  }
  if (process.env.NODE_ENV === "production" && process.env.OPENAI_API_KEY) {
    return "live";
  }
  return "mock";
};

const createEmptyDraftPayload = () => ({
  name: null,
  priority: null,
  projectId: null,
  goalId: null,
});

const createIntentExtras = () => ({
  draft: createEmptyDraftPayload(),
  suggestion: { summary: null },
  missing: null,
  questions: null,
  ops: null,
});

const createNoOpIntent = (message: string): AiIntent =>
  ({
    type: "NO_OP",
    confidence: 0.5,
    title: "AI fallback",
    message,
    ...createIntentExtras(),
  }) as AiIntent;

const buildIntentResponse = (
  scope: AiScope,
  intent: AiIntent,
  assistantMessage: string,
  followUps: string[],
  snapshot?: unknown
): AiIntentResponse => ({
  scope,
  intent,
  assistant_message: assistantMessage,
  follow_ups: followUps,
  snapshot,
});

const createNoOpResponse = (
  scope: AiScope,
  message: string,
  snapshot?: unknown
): AiIntentResponse =>
  buildIntentResponse(scope, createNoOpIntent(message), message, [], snapshot);

const toNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const extractUsageFromResponse = (
  response: { usage?: Record<string, unknown> }
): RunAiIntentUsage | undefined => {
  const usage = response.usage;
  if (!usage) return undefined;

  const promptTokens = toNumber(
    usage.prompt_tokens ??
      usage.input_tokens ??
      usage.input ??
      usage.total_tokens
  );
  const completionTokens = toNumber(
    usage.completion_tokens ??
      usage.output_tokens ??
      usage.output ??
      usage.total_tokens
  );
  const totalTokens = toNumber(usage.total_tokens);
  const resolvedInput = promptTokens ?? 0;
  let resolvedOutput = completionTokens ?? 0;
  if (!completionTokens && totalTokens !== undefined) {
    resolvedOutput = Math.max(totalTokens - resolvedInput, 0);
  }
  if (resolvedInput === 0 && resolvedOutput === 0) {
    if (totalTokens !== undefined) {
      resolvedOutput = totalTokens;
    } else {
      return undefined;
    }
  }
  return {
    input_tokens: resolvedInput,
    output_tokens: resolvedOutput,
  };
};

export async function runAiIntent(args: {
  prompt: string;
  scope: AiScope;
  snapshot?: unknown;
  thread?: AiThreadPayload[];
  signal?: AbortSignal;
}): Promise<RunAiIntentResult> {
  const mode = resolveAiIntentsMode();
  const aiEnabled = process.env.AI_INTENTS_ENABLED === "true";
  const isProduction = process.env.NODE_ENV === "production";
  const attachDebug = (
    payload: AiIntentResponse,
    parsePath: AiIntentParsePath,
    model?: string
  ): AiIntentResponse => {
    if (isProduction) {
      return payload;
    }
    return {
      ...payload,
      _debug: {
        ...(payload._debug ?? {}),
        parse_path: parsePath,
        ...(model ? { model } : {}),
      },
    };
  };

  const wrapResult = (
    payload: AiIntentResponse,
    parsePath: AiIntentParsePath,
    usage?: RunAiIntentUsage,
    model?: string
  ): RunAiIntentResult => ({
    ai: attachDebug(payload, parsePath, model),
    usage,
  });

  if (!aiEnabled) {
    return wrapResult(
      createNoOpResponse(
        args.scope,
        "Model integration pending.",
        args.snapshot
      ),
      "disabled"
    );
  }

  if (mode === "mock") {
    const autopilotResponse = runAutopilotIntent({
      prompt: args.prompt,
      scope: args.scope,
      snapshot: args.snapshot,
      thread: args.thread,
    });
    return wrapResult(autopilotResponse, "autopilot");
  }

  const isDevLive = !isProduction && mode === "live";
  if (isDevLive && devLiveCallCount >= DEV_LIVE_CALL_LIMIT) {
    return wrapResult(
      createNoOpResponse(
        args.scope,
        "Dev live-call limit reached",
        args.snapshot
      ),
      "dev_limit"
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    if (isDevLive) {
      devLiveCallCount += 1;
    }

    const threadMessages =
      args.thread && args.thread.length > 0
        ? args.thread.slice(-10)
        : undefined;
    const messages = [...SYSTEM_INSTRUCTIONS];

    if (threadMessages) {
      messages.push(
        ...threadMessages.map((message) => ({
          role: message.role,
          content: message.content,
        }))
      );
    }

    messages.push({
      role: "user",
      content: `Prompt: ${args.prompt}\nScope: ${args.scope}\nSnapshot: ${JSON.stringify(
        args.snapshot ?? null
      )}`,
    });

    const response = await client.responses.create(
      {
        model: MODEL,
        store: false,
        input: messages,
        text: {
          format: STRUCTURE,
        },
      },
      args.signal ? { signal: args.signal } : undefined
    );

    const usage = extractUsageFromResponse(response);

    if (response.output_parsed) {
      return wrapResult(
        { ...(response.output_parsed as AiIntentResponse), snapshot: args.snapshot },
        "openai",
        usage,
        MODEL
      );
    }

    if (
      Array.isArray(response.output) &&
      response.output[0]?.content &&
      Array.isArray(response.output[0].content) &&
      typeof response.output[0].content[0]?.text === "string"
    ) {
      try {
        const parsed = JSON.parse(
          response.output[0].content[0].text
        ) as AiIntentResponse;
        return wrapResult(
          { ...parsed, snapshot: args.snapshot },
          "openai",
          usage,
          MODEL
        );
      } catch {
        // fall through to stub
      }
    }
  } catch (error) {
    console.error("AI intent adapter error", error);
  }

  const fallbackMessage = "Model integration pending.";
  return wrapResult(
    createNoOpResponse(args.scope, fallbackMessage, args.snapshot),
    "openai",
    undefined,
    MODEL
  );
}
