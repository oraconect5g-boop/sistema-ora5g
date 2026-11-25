-- =============================================================================
-- Lote CONNECT-d (24/11/2026; ORA-INV-011, que segue parcial): o estoque de chips da Nogle no sistema, SÓ LEITURA.
--
-- A primeira chamada de verdade à Nogle (24/11, com o "sim, só consultas" do proprietário): o login com a chave de
-- acesso sozinha funcionou (a chave é do tipo "marca": a pergunta P9 respondida) e as rotas de leitura responderam como
-- os exemplos da coleção oficial de 07/11:
--   GET /pdv/listar                      → { pdvs: [{ id, nome, cidade, uf, estoque_minimo_chips, ... }] }
--   GET /pdv/estoque com { id } no corpo → { total, data: [{ id, iccid, data_repasse, tipo }] }
--   GET /linhas/estoque                  → { retorno, mensagem, total, data: [{ id, iccid, tipo, ... }] }
-- O worker lê a Nogle a cada 30 minutos, das 7h às 22h (a escolha do proprietário), e entrega aqui só o necessário
-- (minimização): do PDV, o id, o nome, a cidade, a UF e o estoque mínimo (nunca CPF, CNPJ, contato, endereço ou os
-- usuários do PDV); do chip, o ICCID, o tipo e a data do repasse (nunca o código de ativação, o QR ou o PDF do eSIM).
--   * public.connect_pdvs: os PDVs da rede na Nogle, cada um ligado (ou não) a uma loja física; a ligação é de quem gere
--     a Ora Connect na rede ou as integrações (connect_ligar_pdv) e fica na auditoria;
--   * public.connect_chips_nogle: o estoque VIRGEM de cada PDV e o geral da MVNO (pdv_id nulo), como a última leitura
--     trouxe; cada leitura substitui o estoque do PDV que respondeu (o que falhou fica como estava, com a hora antiga);
--   * public.connect_leituras_nogle: cada leitura, com as contagens e as falhas (a hora da última leitura na tela);
--   * public.connect_worker_gravar_estoque: só o worker (service_role) chama.
-- Quem vê: o dono (connect.gerir na rede) vê tudo; o administrador (integracoes.gerir) vê os PDVs e as contagens, para
-- ligar cada PDV à loja; quem opera a Ora Connect numa loja (connect.operar) vê só o PDV e os chips da loja dela.
-- Nada aqui transfere, ativa ou reserva chip: a transferência pela API (POST /pdv/transferir-chip-*) espera o sim do
-- proprietário a cada operação. O livro de estoque da Ora não muda: a tela mostra o estoque que está na Nogle.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.connect_pdvs (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  pdv_id int not null check (pdv_id > 0),
  nome text not null check (length(trim(nome)) between 1 and 120),
  cidade text check (cidade is null or length(cidade) <= 80),
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  estoque_minimo int check (estoque_minimo is null or estoque_minimo between 0 and 100000),
  unidade_id uuid,
  ativo boolean not null default true,
  visto_em timestamptz not null default now(),
  estoque_lido_em timestamptz,
  fisicos int not null default 0 check (fisicos >= 0),
  esims int not null default 0 check (esims >= 0),
  unique (organizacao_id, pdv_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
comment on table public.connect_pdvs is
  'CONNECT-d: os PDVs da rede na Nogle (só id, nome, cidade, UF e estoque mínimo), cada um ligado ou não a uma loja; '
  'gravados pelo worker, ligados pela connect_ligar_pdv.';
create unique index connect_pdvs_uma_loja on public.connect_pdvs (organizacao_id, unidade_id) where unidade_id is not null;
create index connect_pdvs_unidade on public.connect_pdvs (unidade_id) where unidade_id is not null;

create table public.connect_chips_nogle (
  organizacao_id uuid not null references public.organizacoes (id),
  iccid text not null check (iccid ~ '^89[0-9]{17,18}$'),
  pdv_id int,
  tipo text not null check (tipo in ('fisico', 'esim')),
  -- A data do repasse ao PDV como a Nogle mandou ("2022-03-21 22:31:23.580"): o fuso não é documentado.
  repassado_em timestamp,
  lido_em timestamptz not null default now(),
  primary key (organizacao_id, iccid),
  foreign key (organizacao_id, pdv_id) references public.connect_pdvs (organizacao_id, pdv_id)
);
comment on table public.connect_chips_nogle is
  'CONNECT-d: o estoque virgem de chips na Nogle (pdv_id nulo = o estoque geral da MVNO), como a última leitura trouxe; '
  'sem o código de ativação, o QR ou o PDF do eSIM.';
create index connect_chips_nogle_pdv on public.connect_chips_nogle (organizacao_id, pdv_id);

create table public.connect_leituras_nogle (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  lida_em timestamptz not null default now(),
  pdvs int not null check (pdvs >= 0),
  pdvs_lidos int not null check (pdvs_lidos >= 0),
  mvno_fisicos int check (mvno_fisicos is null or mvno_fisicos >= 0),
  mvno_esims int check (mvno_esims is null or mvno_esims >= 0),
  falhas int not null default 0 check (falhas >= 0)
);
comment on table public.connect_leituras_nogle is
  'CONNECT-d: cada leitura do estoque de chips da Nogle pelo worker (as contagens e as falhas); a MVNO nula = não lida.';
create index connect_leituras_nogle_organizacao on public.connect_leituras_nogle (organizacao_id, lida_em desc);

-- Só a ligação com a loja vai para a auditoria: as leituras a cada 30 minutos mudam as contagens e as horas.
create trigger connect_pdvs_auditar_ligacao after update of unidade_id on public.connect_pdvs
  for each row when (old.unidade_id is distinct from new.unidade_id) execute function privado.auditar_mudanca();

alter table public.connect_pdvs enable row level security;
alter table public.connect_chips_nogle enable row level security;
alter table public.connect_leituras_nogle enable row level security;
revoke all on public.connect_pdvs, public.connect_chips_nogle, public.connect_leituras_nogle from anon, authenticated;
revoke all on sequence public.connect_leituras_nogle_numero_seq from anon, authenticated;
grant select on public.connect_pdvs, public.connect_chips_nogle, public.connect_leituras_nogle to authenticated;
create policy connect_pdvs_ler on public.connect_pdvs for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'))
         or organizacao_id in (select privado.organizacoes_com_permissao('integracoes.gerir'))
         or unidade_id in (select privado.unidades_com_permissao('connect.operar')));
create policy connect_chips_nogle_ler on public.connect_chips_nogle for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'))
         or (organizacao_id, pdv_id) in (select p.organizacao_id, p.pdv_id from public.connect_pdvs p
                                          where p.unidade_id in (select privado.unidades_com_permissao('connect.operar'))));
create policy connect_leituras_nogle_ler on public.connect_leituras_nogle for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'))
         or organizacao_id in (select privado.organizacoes_com_permissao('integracoes.gerir')));

-- -----------------------------------------------------------------------------
-- A leitura do estoque, gravada pelo worker
-- -----------------------------------------------------------------------------
-- p_leitura = { pdvs: [{ id, nome, cidade, uf, estoque_minimo }], mvno: [{ iccid, tipo }] | null,
--               estoques: [{ pdv, chips: [{ iccid, tipo, repassado_em }] }], falhas }
-- A lista dos PDVs vem sempre (sem ela o worker não grava nada). A MVNO nula e o PDV fora de "estoques" são os que
-- falharam na leitura: o estoque deles fica como estava. O chip que aparece em dois lugares fica no último lido (os PDVs
-- são lidos depois da MVNO).
create or replace function public.connect_worker_gravar_estoque(p_organizacao uuid, p_leitura jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pdvs jsonb := p_leitura -> 'pdvs';
  v_mvno jsonb := p_leitura -> 'mvno';
  v_estoques jsonb := p_leitura -> 'estoques';
  v_falhas int;
  v_estoque jsonb;
  v_pdv int;
  v_lidos int := 0;
  v_numero bigint;
  v_mvno_fisicos int;
  v_mvno_esims int;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  if p_leitura is null or jsonb_typeof(p_leitura) <> 'object'
     or jsonb_typeof(v_pdvs) is distinct from 'array' or jsonb_array_length(v_pdvs) not between 1 and 2000
     or jsonb_typeof(v_estoques) is distinct from 'array' or jsonb_array_length(v_estoques) > 2000
     or (v_mvno is not null and jsonb_typeof(v_mvno) not in ('array', 'null'))
     or coalesce(p_leitura ->> 'falhas', '0') !~ '^[0-9]{1,6}$' then
    raise exception 'Leitura do estoque da Nogle em formato inválido' using errcode = '22023';
  end if;
  v_falhas := coalesce(p_leitura ->> 'falhas', '0')::int;
  if exists (select 1 from jsonb_array_elements(v_pdvs) e
             where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'id', '') !~ '^[1-9][0-9]{0,8}$'
                or length(trim(coalesce(e ->> 'nome', ''))) not between 1 and 120
                or coalesce(trim(e ->> 'uf'), '') !~ '^([A-Z]{2})?$'
                or coalesce(e ->> 'estoque_minimo', '') !~ '^([0-9]{1,5})?$')
     or (select count(distinct e ->> 'id') <> count(*) from jsonb_array_elements(v_pdvs) e) then
    raise exception 'PDV da Nogle em formato inválido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_mvno) = 'array' then v_mvno else '[]'::jsonb end) c
             where jsonb_typeof(c) <> 'object' or coalesce(c ->> 'iccid', '') !~ '^89[0-9]{17,18}$'
                or coalesce(c ->> 'tipo', '') not in ('fisico', 'esim'))
     or exists (select 1 from jsonb_array_elements(v_estoques) e
                where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'pdv', '') !~ '^[1-9][0-9]{0,8}$'
                   or jsonb_typeof(e -> 'chips') is distinct from 'array'
                   or not exists (select 1 from jsonb_array_elements(v_pdvs) p where p ->> 'id' = e ->> 'pdv')
                   or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(e -> 'chips') = 'array' then e -> 'chips' else '[]'::jsonb end) c
                              where jsonb_typeof(c) <> 'object' or coalesce(c ->> 'iccid', '') !~ '^89[0-9]{17,18}$'
                                 or coalesce(c ->> 'tipo', '') not in ('fisico', 'esim')
                                 or coalesce(c ->> 'repassado_em', '') !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?)?$'))
     or (select count(distinct e ->> 'pdv') <> count(*) from jsonb_array_elements(v_estoques) e) then
    raise exception 'Chip da Nogle em formato inválido' using errcode = '22023';
  end if;

  -- Uma leitura por vez na rede.
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_chips_nogle', p_organizacao, 'leitura'));

  -- Os PDVs: o que a Nogle listou fica ativo, com o nome, a cidade, a UF e o estoque mínimo de agora; o que sumiu da
  -- lista fica inativo (a ligação com a loja continua, para voltar como estava).
  insert into public.connect_pdvs (organizacao_id, pdv_id, nome, cidade, uf, estoque_minimo, ativo, visto_em)
  select p_organizacao, (e ->> 'id')::int, left(trim(e ->> 'nome'), 120), left(nullif(trim(e ->> 'cidade'), ''), 80),
         nullif(trim(e ->> 'uf'), ''), nullif(e ->> 'estoque_minimo', '')::int, true, now()
  from jsonb_array_elements(v_pdvs) e
  on conflict (organizacao_id, pdv_id) do update
    set nome = excluded.nome, cidade = excluded.cidade, uf = excluded.uf, estoque_minimo = excluded.estoque_minimo,
        ativo = true, visto_em = excluded.visto_em;
  update public.connect_pdvs p set ativo = false
  where p.organizacao_id = p_organizacao and p.ativo
    and not exists (select 1 from jsonb_array_elements(v_pdvs) e where (e ->> 'id')::int = p.pdv_id);

  -- O estoque geral da MVNO (os chips ainda não repassados a um PDV), quando foi lido.
  if jsonb_typeof(v_mvno) = 'array' then
    delete from public.connect_chips_nogle c where c.organizacao_id = p_organizacao and c.pdv_id is null;
    insert into public.connect_chips_nogle (organizacao_id, iccid, pdv_id, tipo, repassado_em, lido_em)
    select distinct on (c ->> 'iccid') p_organizacao, c ->> 'iccid', null, c ->> 'tipo', null, now()
    from jsonb_array_elements(v_mvno) c
    on conflict (organizacao_id, iccid) do update
      set pdv_id = null, tipo = excluded.tipo, repassado_em = null, lido_em = excluded.lido_em;
    select count(*) filter (where c.tipo = 'fisico'), count(*) filter (where c.tipo = 'esim')
    into v_mvno_fisicos, v_mvno_esims
    from public.connect_chips_nogle c where c.organizacao_id = p_organizacao and c.pdv_id is null;
  end if;

  -- O estoque de cada PDV que respondeu.
  for v_estoque in select e from jsonb_array_elements(v_estoques) e loop
    v_pdv := (v_estoque ->> 'pdv')::int;
    delete from public.connect_chips_nogle c where c.organizacao_id = p_organizacao and c.pdv_id = v_pdv;
    insert into public.connect_chips_nogle (organizacao_id, iccid, pdv_id, tipo, repassado_em, lido_em)
    select distinct on (c ->> 'iccid') p_organizacao, c ->> 'iccid', v_pdv, c ->> 'tipo',
           nullif(c ->> 'repassado_em', '')::timestamp, now()
    from jsonb_array_elements(v_estoque -> 'chips') c
    on conflict (organizacao_id, iccid) do update
      set pdv_id = excluded.pdv_id, tipo = excluded.tipo, repassado_em = excluded.repassado_em, lido_em = excluded.lido_em;
    update public.connect_pdvs p set estoque_lido_em = now() where p.organizacao_id = p_organizacao and p.pdv_id = v_pdv;
    v_lidos := v_lidos + 1;
  end loop;

  -- As contagens de cada PDV, de novo (um chip pode ter passado de um PDV que falhou para outro que respondeu).
  update public.connect_pdvs p
  set fisicos = c.fisicos, esims = c.esims
  from (select pp.pdv_id,
               (count(cc.iccid) filter (where cc.tipo = 'fisico'))::int as fisicos,
               (count(cc.iccid) filter (where cc.tipo = 'esim'))::int as esims
        from public.connect_pdvs pp
        left join public.connect_chips_nogle cc on cc.organizacao_id = pp.organizacao_id and cc.pdv_id = pp.pdv_id
        where pp.organizacao_id = p_organizacao
        group by pp.pdv_id) c
  where p.organizacao_id = p_organizacao and p.pdv_id = c.pdv_id
    and (p.fisicos <> c.fisicos or p.esims <> c.esims);

  insert into public.connect_leituras_nogle (organizacao_id, pdvs, pdvs_lidos, mvno_fisicos, mvno_esims, falhas)
  values (p_organizacao, jsonb_array_length(v_pdvs), v_lidos, v_mvno_fisicos, v_mvno_esims, v_falhas)
  returning numero into v_numero;
  return jsonb_build_object(
    'numero', v_numero,
    'pdvs', jsonb_array_length(v_pdvs),
    'pdvs_lidos', v_lidos,
    'chips', (select count(*) from public.connect_chips_nogle c where c.organizacao_id = p_organizacao),
    'falhas', v_falhas);
end;
$$;
revoke all on function public.connect_worker_gravar_estoque(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_gravar_estoque(uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- A ligação do PDV da Nogle com a loja, pela tela
-- -----------------------------------------------------------------------------
-- p_unidade nula (ou ausente) desliga. Só quem gere a Ora Connect na rede (o dono) ou as integrações (o administrador); só loja
-- física da mesma rede; uma loja, um PDV (OR051). A mudança fica na auditoria, com o motivo.
create or replace function public.connect_ligar_pdv(p_pdv int, p_unidade uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pdv public.connect_pdvs;
  v_unidade public.unidades;
  v_outro int;
begin
  select p.* into v_pdv from public.connect_pdvs p
  where p.pdv_id = p_pdv
    and (p.organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'))
         or p.organizacao_id in (select privado.organizacoes_com_permissao('integracoes.gerir')))
  for update;
  if not found then
    raise exception 'Sem permissão para ligar este PDV da Nogle, ou PDV desconhecido' using errcode = '42501';
  end if;
  if p_unidade is not null then
    select u.* into v_unidade from public.unidades u where u.id = p_unidade and u.organizacao_id = v_pdv.organizacao_id;
    if not found or v_unidade.tipo <> 'loja_fisica' then
      raise exception 'Só uma loja física da rede se liga a um PDV da Nogle' using errcode = '22023';
    end if;
    select p.pdv_id into v_outro from public.connect_pdvs p
    where p.organizacao_id = v_pdv.organizacao_id and p.unidade_id = p_unidade and p.pdv_id <> p_pdv;
    if found then
      raise exception 'Essa loja já está ligada ao PDV % da Nogle: desligue aquele antes', v_outro using errcode = 'OR051';
    end if;
  end if;
  if v_pdv.unidade_id is not distinct from p_unidade then
    return jsonb_build_object('pdv', p_pdv, 'unidade', p_unidade, 'mudou', false);
  end if;
  perform set_config('ora.motivo', case when p_unidade is null
    then format('PDV %s da Nogle (%s) desligado da loja', p_pdv, v_pdv.nome)
    else format('PDV %s da Nogle (%s) ligado à loja %s', p_pdv, v_pdv.nome, v_unidade.nome) end, true);
  update public.connect_pdvs p set unidade_id = p_unidade where p.id = v_pdv.id;
  return jsonb_build_object('pdv', p_pdv, 'unidade', p_unidade, 'mudou', true);
end;
$$;
revoke all on function public.connect_ligar_pdv(int, uuid) from public, anon;
grant execute on function public.connect_ligar_pdv(int, uuid) to authenticated;
