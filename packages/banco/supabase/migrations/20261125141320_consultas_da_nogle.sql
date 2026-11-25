-- =============================================================================
-- Lote CONNECT-g (25/11/2026; ORA-CONNECT-007 e ORA-CONNECT-009, que seguem parciais): as consultas da Nogle que só leem,
-- pedidas na tela e feitas pelo worker. A decisão D-056 do proprietário (24/11, "só consultas") autoriza; o pedido dele de
-- 25/11 ("nenhuma função da Nogle está disponível") pede as telas da demonstração funcionando: a "Consultar linha" e a
-- "Carteira". O site nunca fala com a Nogle (ADR-005): a pessoa pede, a função grava na fila, o worker do servidor consulta
-- (em poucos segundos) e grava a resposta, já limpa, e a tela mostra.
-- As rotas, da coleção oficial de 07/11 (GET com o corpo, confirmado pela Nogle em 10/11):
--   linha_detalhes   GET /linhas/detalhes          { numero }        a situação da linha, o plano e o titular
--   linha_saldo      GET /linhas/saldo             { linha }         internet (MB), minutos e SMS restantes
--   linha_historico  GET /linhas/historico         { numero }        as recargas da linha
--   linha_consumo    GET /linhas/consumo/dados     { linha, mes, ano } o consumo de internet do mês (bytes por dia)
--   iccid_numero     GET /linhas/numeroPeloIccid   { iccid }         o número da linha de um chip
--   iccid_ativacao   GET /ativacao/detalhar        { iccid }         a ativação de um chip
--   carteira_saldo   GET /saldo/saldo                                o saldo da carteira da Ora na Nogle (só o dono)
-- * public.connect_consultas: cada consulta, de quem pediu (só ela a vê, pela RLS). A resposta pode ter o nome do titular:
--   é apagada depois de 24 horas (fica o registro de quem consultou o quê e quando).
-- * public.connect_consultar: o pedido. A linha e o ICCID, de quem opera a Ora Connect na loja do turno; a carteira, de quem
--   gere a Ora Connect na rede. A mesma chave devolve a mesma consulta (o clique repetido); até 30 por pessoa por hora (OR056).
-- * public.connect_worker_consultas_a_fazer, connect_worker_registrar_resposta_da_consulta e connect_worker_limpar_consultas:
--   só o worker (service_role).
-- Situações: na_fila → consultando → respondida | nao_encontrada | falhou. A consulta que ficou consultando por mais de 2
-- minutos, ou na fila por mais de 10, falha (só lê: a pessoa pede de novo).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.connect_consultas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid not null,
  pedida_por uuid not null references public.perfis_usuario (id),
  chave text not null check (length(trim(chave)) between 1 and 120),
  tipo text not null check (tipo in ('linha_detalhes', 'linha_saldo', 'linha_historico', 'linha_consumo', 'iccid_numero',
    'iccid_ativacao', 'carteira_saldo')),
  parametro text check (parametro is null or parametro ~ '^[0-9]{11,20}$'),
  situacao text not null default 'na_fila'
    check (situacao in ('na_fila', 'consultando', 'respondida', 'nao_encontrada', 'falhou')),
  resposta jsonb check (resposta is null or (jsonb_typeof(resposta) = 'object' and octet_length(resposta::text) <= 20000)),
  mensagem text check (mensagem is null or length(mensagem) <= 300),
  pedida_em timestamptz not null default now(),
  consultando_desde timestamptz,
  respondida_em timestamptz,
  resposta_apagada_em timestamptz,
  unique (organizacao_id, pedida_por, chave),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint connect_consultas_parametro check ((tipo = 'carteira_saldo') = (parametro is null))
);
comment on table public.connect_consultas is
  'CONNECT-g: as consultas da Nogle que só leem (a linha, o chip e a carteira), pedidas na tela e feitas pelo worker; só quem '
  'pediu vê. A resposta é apagada depois de 24 horas.';
create index connect_consultas_organizacao on public.connect_consultas (organizacao_id, pedida_em);
create index connect_consultas_fila on public.connect_consultas (organizacao_id, pedida_em)
  where situacao in ('na_fila', 'consultando');
create index connect_consultas_pedida_por on public.connect_consultas (pedida_por, pedida_em desc);
create index connect_consultas_unidade on public.connect_consultas (unidade_id, organizacao_id);
create index connect_consultas_com_resposta on public.connect_consultas (respondida_em) where resposta is not null;

alter table public.connect_consultas enable row level security;
revoke all on public.connect_consultas from anon, authenticated;
grant select on public.connect_consultas to authenticated;
create policy connect_consultas_ler on public.connect_consultas for select to authenticated
  using (pedida_por = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- O pedido, pela tela
-- -----------------------------------------------------------------------------
create or replace function public.connect_consultar(p_tipo text, p_chave text, p_parametro text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_org uuid;
  v_param text := nullif(regexp_replace(coalesce(p_parametro, ''), '[^0-9]', '', 'g'), '');
  v_existente public.connect_consultas;
  v_id uuid;
begin
  if v_usuario is null or v_unidade is null then
    raise exception 'Entre no sistema e escolha a loja do turno' using errcode = '42501';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = v_unidade;
  if p_tipo is null or p_tipo not in ('linha_detalhes', 'linha_saldo', 'linha_historico', 'linha_consumo', 'iccid_numero',
                                      'iccid_ativacao', 'carteira_saldo') then
    raise exception 'Consulta desconhecida' using errcode = '22023';
  end if;
  if p_tipo = 'carteira_saldo' then
    if v_org is null or v_org not in (select privado.organizacoes_com_permissao('connect.gerir')) then
      raise exception 'O saldo da carteira é de quem gere a Ora Connect na rede' using errcode = '42501';
    end if;
    if v_param is not null then
      raise exception 'O saldo da carteira não leva linha nem ICCID' using errcode = '22023';
    end if;
  else
    if not (select public.tem_permissao('connect.operar', v_unidade)) then
      raise exception 'Consultar linha e chip é de quem opera a Ora Connect nesta loja' using errcode = '42501';
    end if;
    if p_tipo like 'linha\_%' and not privado.linha_valida(v_param) then
      raise exception 'Linha: 11 dígitos com DDD' using errcode = '22023';
    end if;
    if p_tipo like 'iccid\_%' and (v_param is null or not privado.iccid_valido(v_param)) then
      raise exception 'ICCID inválido: confira os dígitos impressos no chip' using errcode = '22023';
    end if;
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave da consulta inválida' using errcode = '22023';
  end if;

  -- O clique repetido (a mesma chave) devolve a mesma consulta; com outro conteúdo, OR004.
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_consultas', v_org, v_usuario::text || ':' || p_chave));
  select c.* into v_existente from public.connect_consultas c
  where c.organizacao_id = v_org and c.pedida_por = v_usuario and c.chave = p_chave;
  if found then
    if v_existente.tipo <> p_tipo or v_existente.parametro is distinct from v_param then
      raise exception 'Chave de idempotência já usada em outra consulta' using errcode = 'OR004';
    end if;
    return v_existente.id;
  end if;
  -- As consultas não mudam nada, mas a Nogle não é para varredura: até 30 por pessoa por hora.
  if (select count(*) from public.connect_consultas c
      where c.pedida_por = v_usuario and c.pedida_em > now() - interval '1 hour') >= 30 then
    raise exception 'Muitas consultas na última hora: espere um pouco' using errcode = 'OR056';
  end if;
  insert into public.connect_consultas (organizacao_id, unidade_id, pedida_por, chave, tipo, parametro)
  values (v_org, v_unidade, v_usuario, p_chave, p_tipo, v_param)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.connect_consultar(text, text, text) from public, anon;
grant execute on function public.connect_consultar(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- O worker (service_role)
-- -----------------------------------------------------------------------------
-- Pega até p_limite consultas da fila (a mais antiga primeiro) e marca como consultando; duas execuções não pegam a mesma.
create or replace function public.connect_worker_consultas_a_fazer(p_organizacao uuid, p_limite int)
returns table (consulta_id uuid, tipo text, parametro text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  return query
  with fila as (
    select c.id from public.connect_consultas c
    where c.organizacao_id = p_organizacao and c.situacao = 'na_fila'
    order by c.pedida_em, c.id
    limit greatest(1, least(coalesce(p_limite, 5), 20))
    for update skip locked)
  update public.connect_consultas c set situacao = 'consultando', consultando_desde = now()
  from fila where c.id = fila.id
  returning c.id, c.tipo, c.parametro;
end;
$$;
revoke all on function public.connect_worker_consultas_a_fazer(uuid, int) from public, anon, authenticated;
grant execute on function public.connect_worker_consultas_a_fazer(uuid, int) to service_role;

-- A resposta, já limpa pelo worker (só os campos que a tela mostra): respondida, nao_encontrada ou falhou.
create or replace function public.connect_worker_registrar_resposta_da_consulta(p_consulta uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_situacao text := p_resultado ->> 'situacao';
  v_resposta jsonb := p_resultado -> 'resposta';
  v_mensagem text := nullif(left(trim(coalesce(p_resultado ->> 'mensagem', '')), 300), '');
  v_feita text;
begin
  if v_situacao is null or v_situacao not in ('respondida', 'nao_encontrada', 'falhou') then
    raise exception 'Situação da consulta inválida' using errcode = '22023';
  end if;
  if v_resposta is not null and (jsonb_typeof(v_resposta) <> 'object' or octet_length(v_resposta::text) > 20000) then
    raise exception 'Resposta da consulta fora da forma' using errcode = '22023';
  end if;
  update public.connect_consultas c
  set situacao = v_situacao, resposta = case when v_situacao = 'respondida' then v_resposta end, mensagem = v_mensagem,
      respondida_em = now()
  where c.id = p_consulta and c.situacao = 'consultando'
  returning c.situacao into v_feita;
  -- A que já venceu (falhou por tempo) não muda: a pessoa já pediu de novo.
  return coalesce(v_feita, 'ignorada');
end;
$$;
revoke all on function public.connect_worker_registrar_resposta_da_consulta(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_registrar_resposta_da_consulta(uuid, jsonb) to service_role;

-- Uma vez por execução do worker: vence o que parou (consultando há mais de 2 minutos, ou na fila há mais de 10) e apaga a
-- resposta de mais de 24 horas (o nome do titular não fica guardado; fica o registro de quem consultou o quê e quando).
create or replace function public.connect_worker_limpar_consultas(p_organizacao uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vencidas int;
  v_na_fila int;
  v_apagadas int;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  update public.connect_consultas c
  set situacao = 'falhou', mensagem = 'A consulta não terminou: peça de novo.', respondida_em = now()
  where c.organizacao_id = p_organizacao and c.situacao = 'consultando' and c.consultando_desde < now() - interval '2 minutes';
  get diagnostics v_vencidas = row_count;
  update public.connect_consultas c
  set situacao = 'falhou', mensagem = 'O servidor não consultou a tempo: peça de novo.', respondida_em = now()
  where c.organizacao_id = p_organizacao and c.situacao = 'na_fila' and c.pedida_em < now() - interval '10 minutes';
  get diagnostics v_na_fila = row_count;
  update public.connect_consultas c
  set resposta = null, resposta_apagada_em = now()
  where c.organizacao_id = p_organizacao and c.resposta is not null and c.respondida_em < now() - interval '24 hours';
  get diagnostics v_apagadas = row_count;
  return jsonb_build_object('vencidas', v_vencidas + v_na_fila, 'apagadas', v_apagadas);
end;
$$;
revoke all on function public.connect_worker_limpar_consultas(uuid) from public, anon, authenticated;
grant execute on function public.connect_worker_limpar_consultas(uuid) to service_role;
