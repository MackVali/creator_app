## 2025-09-27T15:32Z
- assumptions: scheduler remains heuristic first-fit; timezone utilities supply local-day boundaries.
- inferred schemas: tasks need {id,name,priority,stage,duration_min,energy,project_id?,skill_id?,skill_icon?}; windows expose {id,label,energy,start_local,end_local,days,fromPrevDay} per repo usage.
- decisions: implement per-day now clamp, per-task availability clone, RUN_ID+DRY_RUN options, standardized rejection reasons, telemetry trace output.
- open TODOs: confirm persistence columns for run_id & rejected_reason, design TRACE emission path, backfill schema drift logging.
