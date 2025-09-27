## 2025-09-27T15:32Z
- assumptions: scheduler remains heuristic first-fit; timezone utilities supply local-day boundaries.
- inferred schemas: tasks need {id,name,priority,stage,duration_min,energy,project_id?,skill_id?,skill_icon?}; windows expose {id,label,energy,start_local,end_local,days,fromPrevDay} per repo usage.
- decisions: implement per-day now clamp, per-task availability clone, RUN_ID+DRY_RUN options, standardized rejection reasons, telemetry trace output.
- open TODOs: confirm persistence columns for run_id & rejected_reason, design TRACE emission path, backfill schema drift logging.
## 2025-09-27T19:59Z
- assumptions: CLI runs in production contexts with only production deps; scheduler UI relies on API unaffected.
- decisions: promote `tsx` to runtime dependency so the scheduler CLI works when dev deps are pruned.
- open TODOs: monitor trace file persistence behavior in serverless deploys; revisit schema-drift tolerant fetches.
## 2025-09-28T20:15Z
- observations: per-request trace logging incurred heavy payloads and synchronous file writes, stalling scheduler responses.
- decisions: gate trace capture behind explicit `collectTrace` requests, disable file persistence by default, and pass-through CLI opt-in to avoid UI hangs.
- open TODOs: revisit lightweight trace summaries for UI without full candidate dumps.
## 2025-09-27T21:19Z
- observations: scheduler API stalled when Supabase rejected cross-tenant fetches; added explicit user filters to repo queries.
- decisions: thread `userId` through scheduler backlog reads so task/project fetches respect RLS while keeping shared hooks unchanged via optional parameters.
- open TODOs: evaluate whether scheduler meta hooks should also accept explicit user contexts for SSR paths.
