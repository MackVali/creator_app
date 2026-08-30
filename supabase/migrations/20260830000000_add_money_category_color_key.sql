alter table public.money_categories
  add column if not exists color_key text not null default 'gray';

alter table public.money_categories
  drop constraint if exists money_categories_color_key_check;

alter table public.money_categories
  add constraint money_categories_color_key_check
  check (color_key in (
    'gray', 'red', 'orange', 'amber', 'lime', 'green',
    'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink'
  ));
