-- Run this entire script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default 'APAN member',
  bio text not null default '',
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.yaar_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(from_id,to_id), check(from_id <> to_id)
);

create table if not exists public.yaars (
  user_id uuid not null references public.profiles(id) on delete cascade,
  yaar_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,yaar_id), check(user_id <> yaar_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(length(body) between 1 and 4000),
  created_at timestamptz not null default now(), check(sender_id <> receiver_id)
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  caption text not null default '',
  song_title text,
  created_at timestamptz not null default now()
);

create table if not exists public.instants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text,
  text text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz generated always as (created_at + interval '24 hours') stored
);

alter table public.profiles enable row level security;
alter table public.yaar_requests enable row level security;
alter table public.yaars enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.instants enable row level security;

create policy "authenticated users can discover profiles" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "users create own profile" on public.profiles for insert to authenticated with check (id=auth.uid());

create policy "request participants can read" on public.yaar_requests for select to authenticated using (from_id=auth.uid() or to_id=auth.uid());
create policy "send own requests" on public.yaar_requests for insert to authenticated with check (from_id=auth.uid());
create policy "participants can delete requests" on public.yaar_requests for delete to authenticated using (from_id=auth.uid() or to_id=auth.uid());

create policy "users read own yaar links" on public.yaars for select to authenticated using (user_id=auth.uid());
create policy "users read messages in own conversations" on public.messages for select to authenticated using (sender_id=auth.uid() or receiver_id=auth.uid());
create policy "send messages to accepted yaars" on public.messages for insert to authenticated with check (
 sender_id=auth.uid() and exists(select 1 from public.yaars y where y.user_id=auth.uid() and y.yaar_id=receiver_id)
);
create policy "owners manage memories" on public.memories for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "owners manage instants" on public.instants for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Accepting a request creates the mutual Yaar relationship atomically.
create or replace function public.accept_yaar_request(request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare req public.yaar_requests;
begin
 select * into req from public.yaar_requests where id=request_id and to_id=auth.uid();
 if not found then raise exception 'Request not found or not addressed to you'; end if;
 insert into public.yaars(user_id,yaar_id) values(req.from_id,req.to_id),(req.to_id,req.from_id) on conflict do nothing;
 delete from public.yaar_requests where id=req.id;
end; $$;
revoke all on function public.accept_yaar_request(uuid) from public;
grant execute on function public.accept_yaar_request(uuid) to authenticated;

-- Private media bucket. Files are not publicly accessible; app creates signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('apan-media','apan-media',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict(id) do nothing;
create policy "users upload to own folder" on storage.objects for insert to authenticated with check(bucket_id='apan-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users read own media" on storage.objects for select to authenticated using(bucket_id='apan-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users delete own media" on storage.objects for delete to authenticated using(bucket_id='apan-media' and (storage.foldername(name))[1]=auth.uid()::text);
