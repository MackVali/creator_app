import OpenAI from "openai";
import { runAutopilotIntent } from "@/lib/ai/autopilotIntent";
import type {
  AiIntent,
  AiIntentResponse,
  AiIntentParsePath,
  AiScope,
  AiThreadPayload,
} from "@/lib/types/ai";

const MODEL = "gpt-4.1-mini";
const SYSTEM_INSTRUCTIONS = [
  {
    role: "system",
    content:
      "You are an AI assistant for a scheduling experience. You MUST respond with JSON that exactly matches the AiIntentResponse type: { scope, intent, assistant_message, follow_ups?, snapshot? }. Do not return text, markdown, or any other wrapper. The intent must include all of type, confidence, title, message, draft, suggestion, missing, questions, and ops. Intent.type must be one of NO_OP, DRAFT_CREATE_GOAL, DRAFT_CREATE_PROJECT, DRAFT_CREATE_TASK, NEEDS_CLARIFICATION, or DRAFT_SCHEDULER_INPUT_OPS. If a payload slot is not used for a given intent, set its value to null instead of omitting it. Day type responses MUST cover the full 24-hour span (00:00-24:00) with sleep, anchors, focus blocks, and template structure. All day type names and time block titles must be ALL CAPS; convert any proposed title to uppercase (e.g., \"Workday\" -> \"WORKDAY\", \"Sleep\" -> \"SLEEP\", \"Focus on coding\" -> \"FOCUS: CODING\"). Include a sleep block (7-9 hours placed reasonably or aligned with a snapshot sleep habit/window), daily anchors such as a wake buffer, hygiene, meals (at least two), and transition buffers, and overlay recurring habits from the snapshot into appropriate windows. Preserve or attach location context for blocks when the prompt or snapshot indicates a place (HOME, WORK, GYM, STORE, etc.): if you cannot infer the right location confidently, ask a clarification question instead of guessing. Blocks may include supported constraint fields (skill, monument, goal, project, energy, etc.) when helpful—especially for recurring habits and focus blocks tied to top priorities—but do not invent unsupported constraint keys; omit them or ask for clarification if the schema is unclear. Fill the remaining time with focus blocks that map to the user's top priorities, and make day types templates rather than short-term overlays. Prefer returning intent.type = DRAFT_SCHEDULER_INPUT_OPS with ops that create the day type and a day_type_time_blocks set covering the day (minimum 8–14 blocks) when enough data exists; if required schema/habits/location/constraints information is missing return NEEDS_CLARIFICATION with 2-4 concrete questions. Avoid inserting random one-off task blocks unless the user explicitly asks for that recurring daily block. Remember that overlay windows are for planning the next few hours, whereas day types are templates that cover all anchors, focus blocks, and any relevant constraints/location info.",
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
    required: ["scope", "intent", "assistant_message", "follow_ups"],
    properties: {
      scope: {
        type: "string",
        enum: ["read_only", "draft_creation", "schedule_edit"],
      },
      intent: INTENT_SCHEMA,
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

const resolveAiIntentsMode = (): AiIntentsMode => {
  const rawMode = process.env.AI_INTENTS_MODE?.toLowerCase();
  if (rawMode === "live") {
    return "live";
  }
  if (rawMode === "mock") {
    return "mock";
  }
  return process.env.NODE_ENV === "production" ? "live" : "mock";
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

export async function runAiIntent(args: {
  prompt: string;
  scope: AiScope;
  snapshot?: unknown;
  thread?: AiThreadPayload[];
}): Promise<AiIntentResponse> {
  const mode = resolveAiIntentsMode();
  const aiEnabled = process.env.AI_INTENTS_ENABLED === "true";
  const isProduction = process.env.NODE_ENV === "production";
  const attachDebug = (
    payload: AiIntentResponse,
    parsePath: AiIntentParsePath
  ): AiIntentResponse => {
    if (isProduction) {
      return payload;
    }
    return {
      ...payload,
      _debug: { parse_path: parsePath },
    };
  };

  if (!aiEnabled) {
    return attachDebug(
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
    return attachDebug(autopilotResponse, "autopilot");
  }

  const isDevLive = !isProduction && mode === "live";
  if (isDevLive && devLiveCallCount >= DEV_LIVE_CALL_LIMIT) {
    return attachDebug(
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

    const response = await client.responses.create({
      model: MODEL,
      store: false,
      input: messages,
      text: {
        format: STRUCTURE,
      },
    });

    if (response.output_parsed) {
      return attachDebug(
        { ...(response.output_parsed as AiIntentResponse), snapshot: args.snapshot },
        "parsed"
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
        return attachDebug(
          { ...parsed, snapshot: args.snapshot },
          "json_fallback"
        );
      } catch {
        // fall through to stub
      }
    }
  } catch (error) {
    console.error("AI intent adapter error", error);
  }

  const fallbackMessage = "Model integration pending.";
  return attachDebug(
    createNoOpResponse(args.scope, fallbackMessage, args.snapshot),
    "no_op_error"
  );
}
