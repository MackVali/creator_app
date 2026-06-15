-- Preview redundant standalone Roadmap Goal rows.
--
-- A row is redundant when the same goal_id also appears in campaign_goals
-- through a CAMPAIGN roadmap_items row in the same roadmap_id for the same user.
select
  standalone_ri.id as redundant_roadmap_item_id,
  standalone_ri.user_id,
  standalone_ri.roadmap_id,
  standalone_ri.goal_id,
  standalone_ri.position as standalone_position,
  campaign_ri.id as campaign_roadmap_item_id,
  campaign_ri.campaign_id,
  campaign_ri.position as campaign_position,
  cg.position as campaign_goal_position
from public.roadmap_items standalone_ri
join public.roadmap_items campaign_ri
  on campaign_ri.user_id = standalone_ri.user_id
 and campaign_ri.roadmap_id = standalone_ri.roadmap_id
 and upper(trim(coalesce(campaign_ri.item_type, ''))) = 'CAMPAIGN'
 and campaign_ri.campaign_id is not null
join public.campaign_goals cg
  on cg.user_id = standalone_ri.user_id
 and cg.campaign_id = campaign_ri.campaign_id
 and cg.goal_id = standalone_ri.goal_id
where upper(trim(coalesce(standalone_ri.item_type, ''))) = 'GOAL'
  and standalone_ri.goal_id is not null
order by
  standalone_ri.user_id,
  standalone_ri.roadmap_id,
  standalone_ri.position,
  standalone_ri.id;

-- Delete redundant standalone Roadmap Goal rows only.
--
-- This does not delete Goals, Projects, Campaigns, or campaign_goals rows.
-- Review the preview query above before running this delete.
with redundant_standalone_items as (
  select distinct standalone_ri.id
  from public.roadmap_items standalone_ri
  join public.roadmap_items campaign_ri
    on campaign_ri.user_id = standalone_ri.user_id
   and campaign_ri.roadmap_id = standalone_ri.roadmap_id
   and upper(trim(coalesce(campaign_ri.item_type, ''))) = 'CAMPAIGN'
   and campaign_ri.campaign_id is not null
  join public.campaign_goals cg
    on cg.user_id = standalone_ri.user_id
   and cg.campaign_id = campaign_ri.campaign_id
   and cg.goal_id = standalone_ri.goal_id
  where upper(trim(coalesce(standalone_ri.item_type, ''))) = 'GOAL'
    and standalone_ri.goal_id is not null
)
delete from public.roadmap_items ri
using redundant_standalone_items redundant
where ri.id = redundant.id;
