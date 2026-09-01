alter table public.monuments
add column if not exists area_id text;

alter table public.monuments
drop constraint if exists monuments_area_id_fkey;

alter table public.monuments
add constraint monuments_area_id_fkey
foreign key (area_id)
references public.areas(id)
on delete set null;

create index if not exists monuments_user_area_idx
on public.monuments(user_id, area_id);
