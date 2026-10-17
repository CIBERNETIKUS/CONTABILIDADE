-- =====================================================================
-- PEGUE ESTE SCRIPT COMPLETO EN SUPABASE > SQL Editor > New query > Run
-- Antes de ejecutar, cambie SOLO las 3 líneas marcadas con  <<< CAMBIAR
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text, email text, rol text not null default 'usuario' check (rol in ('admin','usuario')),
  creado timestamptz default now());
create table if not exists public.cuentas (codigo text primary key, nombre text not null);
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('venta','compra')), fecha date not null,
  numero text not null, contraparte text not null,
  total numeric(14,2) not null check (total > 0), neto numeric(14,2) not null, iva numeric(14,2) not null,
  creado_por uuid default auth.uid(), creado timestamptz default now(),
  unique (tipo, numero, contraparte));
create table if not exists public.asientos (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid references public.facturas(id), fecha date not null, glosa text, creado timestamptz default now());
create table if not exists public.asiento_lineas (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references public.asientos(id) on delete cascade,
  cuenta text not null references public.cuentas(codigo),
  debe numeric(14,2) not null default 0, haber numeric(14,2) not null default 0);

insert into public.cuentas values
 ('1.1.1','Caja y Bancos'),('1.1.2','IVA Crédito Fiscal'),('2.1.1','IVA Débito Fiscal'),
 ('4.1.1','Ventas'),('5.1.1','Compras y Gastos') on conflict do nothing;

-- Seguridad (RLS): solo usuarios con sesión pueden leer; escribir solo por funciones
alter table public.profiles enable row level security;
alter table public.cuentas enable row level security;
alter table public.facturas enable row level security;
alter table public.asientos enable row level security;
alter table public.asiento_lineas enable row level security;
drop policy if exists leer on public.profiles;       create policy leer on public.profiles for select to authenticated using (true);
drop policy if exists leer on public.cuentas;        create policy leer on public.cuentas for select to authenticated using (true);
drop policy if exists leer on public.facturas;       create policy leer on public.facturas for select to authenticated using (true);
drop policy if exists leer on public.asientos;       create policy leer on public.asientos for select to authenticated using (true);
drop policy if exists leer on public.asiento_lineas; create policy leer on public.asiento_lineas for select to authenticated using (true);

create or replace function public.es_admin() returns boolean language sql security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin') $$;

-- Registra factura + asiento en una sola transacción (IVA 13% incluido en el total)
create or replace function public.registrar_factura(p_tipo text, p_fecha date, p_numero text, p_contraparte text, p_total numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_iva numeric(14,2); v_neto numeric(14,2); v_f uuid; v_a uuid;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  v_iva := round(p_total * 0.13, 2); v_neto := p_total - v_iva;
  insert into facturas (tipo,fecha,numero,contraparte,total,neto,iva) values (p_tipo,p_fecha,p_numero,p_contraparte,p_total,v_neto,v_iva) returning id into v_f;
  insert into asientos (factura_id,fecha,glosa) values (v_f,p_fecha, initcap(p_tipo)||' fact. '||p_numero||' - '||p_contraparte) returning id into v_a;
  if p_tipo = 'venta' then
    insert into asiento_lineas (asiento_id,cuenta,debe,haber) values (v_a,'1.1.1',p_total,0),(v_a,'4.1.1',0,v_neto),(v_a,'2.1.1',0,v_iva);
  else
    insert into asiento_lineas (asiento_id,cuenta,debe,haber) values (v_a,'5.1.1',v_neto,0),(v_a,'1.1.2',v_iva,0),(v_a,'1.1.1',0,p_total);
  end if;
  return v_f;
end $$;

-- Crea usuario (uso interno)
create or replace function public._crear_usuario(p_email text, p_password text, p_nombre text, p_rol text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values ('00000000-0000-0000-0000-000000000000',v_id,'authenticated','authenticated',lower(p_email),crypt(p_password,gen_salt('bf')),now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre',p_nombre), now(),now(),'','','','');
  insert into auth.identities (id,user_id,identity_data,provider,provider_id,last_sign_in_at,created_at,updated_at)
  values (gen_random_uuid(),v_id,jsonb_build_object('sub',v_id::text,'email',lower(p_email)),'email',v_id::text,now(),now(),now());
  insert into public.profiles (id,nombre,email,rol) values (v_id,p_nombre,lower(p_email),p_rol);
  return v_id;
end $$;
revoke all on function public._crear_usuario(text,text,text,text) from public, anon, authenticated;

-- Botón "Crear usuario" de la app (solo administradores)
create or replace function public.admin_crear_usuario(p_email text, p_password text, p_nombre text, p_rol text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede crear usuarios'; end if;
  if length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  return public._crear_usuario(p_email,p_password,p_nombre,p_rol);
end $$;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.registrar_factura(text,date,text,text,numeric) to authenticated;
grant execute on function public.admin_crear_usuario(text,text,text,text) to authenticated;

-- ÚNICO administrador inicial
do $$ begin
  if not exists (select 1 from auth.users where email = lower('admin@miempresa.com')) then   -- <<< CAMBIAR (correo)
    perform public._crear_usuario('admin@miempresa.com', 'CambieEstaClave123', 'Administrador', 'admin'); -- <<< CAMBIAR (correo, contraseña)
  end if;
end $$;
