alter table public.money_recurring_items
  add column if not exists icon_key text not null default 'arrow';

alter table public.money_recurring_items
  drop constraint if exists money_recurring_items_icon_key_check;

alter table public.money_recurring_items
  add constraint money_recurring_items_icon_key_check
  check (icon_key in (
    'arrow',
    'home',
    'wifi',
    'phone',
    'car',
    'fuel',
    'shopping-cart',
    'utensils',
    'zap',
    'droplets',
    'credit-card',
    'receipt',
    'heart-pulse',
    'briefcase',
    'piggy-bank',
    'music'
  ));
