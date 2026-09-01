do $$
declare
  duplicate_assignment_count integer;
begin
  select count(*)
  into duplicate_assignment_count
  from (
    select user_id, skill_id
    from public.area_skills
    group by user_id, skill_id
    having count(*) > 1
  ) duplicate_assignments;

  if duplicate_assignment_count > 0 then
    raise exception
      'Cannot enforce one primary Area per Skill: found % user/skill pairs assigned to multiple Areas. Resolve duplicates in public.area_skills before rerunning this migration.',
      duplicate_assignment_count;
  end if;
end $$;

create unique index if not exists area_skills_user_skill_unique
  on public.area_skills (user_id, skill_id);
