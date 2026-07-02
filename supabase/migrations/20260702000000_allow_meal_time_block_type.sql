alter table if exists day_type_time_blocks
  drop constraint if exists day_type_time_blocks_block_type_chk;

alter table if exists day_type_time_blocks
  add constraint day_type_time_blocks_block_type_chk
    check (block_type in ('FOCUS','BREAK','MEAL','PRACTICE'));
