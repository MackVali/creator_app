-- Skills are foundational CREATOR taxonomy and are not plan-limited.

drop trigger if exists trg_enforce_creator_skill_cap
on public.skills;

drop function if exists public.enforce_creator_skill_cap();
