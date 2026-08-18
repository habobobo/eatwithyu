-- 在 Supabase Dashboard → SQL Editor 中执行本文件。
-- 执行前把 REPLACE_WITH_A_LONG_RANDOM_TOKEN 替换成至少 32 位的随机密钥。
-- 这个密钥只放进编辑链接的 #edit= 后面，不要写入 GitHub 文件。

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.shared_maps (
  id text primary key,
  title text not null,
  data jsonb not null default '{"places":[],"categories":[],"icons":[]}'::jsonb,
  editor_token_hash text not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.shared_maps enable row level security;

drop policy if exists "shared maps are publicly readable" on public.shared_maps;
create policy "shared maps are publicly readable"
  on public.shared_maps
  for select
  to anon, authenticated
  using (true);

revoke all on table public.shared_maps from anon, authenticated;
grant select (id, title, data, version, updated_at)
  on table public.shared_maps
  to anon, authenticated;

create or replace function public.save_shared_map(
  p_map_id text,
  p_editor_token text,
  p_data jsonb,
  p_expected_version bigint default null
)
returns table(version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_map public.shared_maps%rowtype;
begin
  select * into v_map
  from public.shared_maps
  where id = p_map_id
  for update;

  if not found then
    raise exception '共享地图不存在';
  end if;

  if p_editor_token is null
     or length(p_editor_token) < 24
     or extensions.crypt(p_editor_token, v_map.editor_token_hash) <> v_map.editor_token_hash then
    raise exception '编辑密钥无效' using errcode = '42501';
  end if;

  if p_expected_version is not null and v_map.version <> p_expected_version then
    raise exception '地图版本冲突，请刷新后重试' using errcode = '40001';
  end if;

  update public.shared_maps
  set data = p_data,
      version = v_map.version + 1,
      updated_at = now()
  where id = p_map_id
  returning shared_maps.version, shared_maps.updated_at
  into version, updated_at;

  return next;
end;
$$;

revoke all on function public.save_shared_map(text, text, jsonb, bigint) from public;
grant execute on function public.save_shared_map(text, text, jsonb, bigint)
  to anon, authenticated;

do $$
declare
  v_editor_token text := 'REPLACE_WITH_A_LONG_RANDOM_TOKEN';
begin
  if v_editor_token = 'REPLACE_WITH_A_LONG_RANDOM_TOKEN' or length(v_editor_token) < 32 then
    raise exception '请先把编辑密钥占位符替换成至少 32 位的随机密钥';
  end if;

  insert into public.shared_maps (id, title, data, editor_token_hash)
  values (
    'beijing',
    '在北京吃饭',
    '{"places":[],"categories":[],"icons":[]}'::jsonb,
    extensions.crypt(v_editor_token, extensions.gen_salt('bf'))
  )
  on conflict (id) do update
  set title = excluded.title,
      editor_token_hash = excluded.editor_token_hash,
      updated_at = now();
end;
$$;

-- 如需让旧编辑链接失效，在 SQL Editor 中执行：
-- update public.shared_maps
-- set editor_token_hash = extensions.crypt('新的随机密钥', extensions.gen_salt('bf'))
-- where id = 'beijing';
