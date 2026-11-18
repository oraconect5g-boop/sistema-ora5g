-- =============================================================================
-- Lote REIN-c (achado F18-03 da reanálise do Codex de 18/11/2026, PR #104; ORA-INV-004): na carga do estoque inicial, o
-- físico maior que o disponível vira pendência de reconciliação, sem presumir reserva, trânsito ou erro.
--
-- Até aqui a prévia classificava o acessório com físico 10 e disponível 8 como "entrar", e a aplicação lançava as 10
-- unidades livres: o sistema novo podia liberar para venda o que a origem considerava comprometido. Agora:
--   * a linha fica "conferir" com a pendência 'fisico_maior_que_disponivel' e o motivo;
--   * public.estoque_carga_resolver(carga, resolução, motivo, linha): quem importa ou aprova decide, com o motivo
--     registrado (quem e quando, na linha; o texto, na auditoria da carga): lançar o disponível, lançar o físico
--     (conferido na loja) ou deixar a linha de fora. Só na prévia; dá para mudar a decisão enquanto ela é prévia.
--     Sem o número da linha, resolve de uma vez todas as que ainda não têm resolução, só com as decisões que não
--     liberam o que pode estar comprometido (lançar só o disponível, ou deixar de fora): o físico é linha a linha;
--   * o aparelho e o chip (que entram pela Entrada de estoque, com o IMEI ou o ICCID) com o físico maior que o
--     disponível levam o aviso no motivo, para conferir quais unidades estão comprometidas antes de dar entrada;
--   * public.estoque_carga_aplicar: recusa a carga com pendência sem resolução (OR042) e lança a quantidade resolvida
--     (estoque_carga_linhas.lancar), nunca o físico por padrão;
--   * public.estoque_carga_desfazer: devolve o que a carga lançou;
--   * privado.estoque_carga_totais: os totais da carga num lugar só (a prévia e a resolução), com as pendências.
-- Nenhuma reserva é inventada: a diferença não vira reserva nem trânsito sem evidência (ADR-021, atualizada).
-- As três definições em vigor foram conferidas contra o banco de desenvolvimento (md5 do corpo) antes da cópia.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.estoque_carga_linhas
  add column lancar int,
  add column pendencia text check (pendencia is null or pendencia = 'fisico_maior_que_disponivel'),
  add column resolucao text check (resolucao is null or resolucao in ('disponivel', 'fisico', 'fora')),
  add column resolvido_por uuid references public.perfis_usuario (id),
  add column resolvido_em timestamptz,
  add column motivo_resolucao text check (motivo_resolucao is null or length(trim(motivo_resolucao)) between 3 and 200);
comment on column public.estoque_carga_linhas.lancar is
  'REIN-c: a quantidade que a carga lança na linha "entrar" (o físico, ou o resolvido); nula nas outras.';
-- As linhas que já existiam (nenhuma no ora5g-dev em 18/11) lançam o físico, como antes.
update public.estoque_carga_linhas set lancar = fisico where acao = 'entrar';
alter table public.estoque_carga_linhas drop constraint estoque_carga_linhas_entrar;
alter table public.estoque_carga_linhas add constraint estoque_carga_linhas_entrar
  check (acao <> 'entrar' or (variante_id is not null and lancar > 0 and lancar <= fisico));
alter table public.estoque_carga_linhas add constraint estoque_carga_linhas_resolucao check (
  (resolucao is null) = (resolvido_em is null) and (resolvido_em is null) = (resolvido_por is null)
  and (resolvido_em is null) = (motivo_resolucao is null) and (resolucao is null or pendencia is not null));
create index estoque_carga_linhas_resolvido_por on public.estoque_carga_linhas (resolvido_por);

-- -----------------------------------------------------------------------------
-- Os totais de uma carga (a prévia e a resolução usam os mesmos)
-- -----------------------------------------------------------------------------
create or replace function privado.estoque_carga_totais(p_carga uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'linhas', count(*),
    'entrar', count(*) filter (where l.acao = 'entrar'),
    'unidades_entrar', coalesce(sum(l.lancar) filter (where l.acao = 'entrar'), 0),
    'serializado', count(*) filter (where l.acao = 'serializado'),
    'unidades_serializado', coalesce(sum(l.fisico) filter (where l.acao = 'serializado'), 0),
    'sem_produto', count(*) filter (where l.acao = 'sem_produto'),
    'conferir', count(*) filter (where l.acao = 'conferir'),
    'nada', count(*) filter (where l.acao = 'nada'),
    'a_resolver', count(*) filter (where l.pendencia is not null and l.resolucao is null),
    'resolvidas', count(*) filter (where l.resolucao is not null),
    'fora_do_disponivel', coalesce(sum(l.fisico - l.disponivel) filter (
      where l.disponivel is not null and l.fisico > l.disponivel and l.variante_id is not null
        and l.acao in ('entrar', 'serializado', 'conferir')), 0))
  from public.estoque_carga_linhas l where l.carga_id = p_carga;
$$;
revoke all on function privado.estoque_carga_totais(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A resolução de uma linha com o físico maior que o disponível
-- -----------------------------------------------------------------------------
create or replace function public.estoque_carga_resolver(p_carga uuid, p_resolucao text, p_motivo text, p_numero int default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_carga public.estoque_cargas;
  v_linha public.estoque_carga_linhas;
  v_acao text;
  v_lancar int;
  v_quantas int;
  v_totais jsonb;
begin
  select * into v_carga from public.estoque_cargas c where c.id = p_carga;
  if not found or (v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.executar'))
                   and v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar'))) then
    raise exception 'Sem permissão para resolver a linha da carga' using errcode = '42501';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', v_carga.organizacao_id, 'loja:' || v_carga.unidade_id::text));
  select * into v_carga from public.estoque_cargas c where c.id = p_carga for update;
  if v_carga.situacao <> 'previa' then
    raise exception 'Só a prévia aceita resolução (esta está %)', v_carga.situacao using errcode = '22023';
  end if;
  if p_resolucao is null or p_resolucao not in ('disponivel', 'fisico', 'fora') then
    raise exception 'Resolução desconhecida: o disponível, o físico ou de fora' using errcode = '22023';
  end if;
  if p_numero is null then
    -- Todas as linhas ainda sem resolução, de uma vez, só com as decisões que não liberam o que pode estar
    -- comprometido. Cada linha guarda quem, quando e o motivo; a auditoria da carga, uma linha com a contagem.
    if p_resolucao = 'fisico' then
      raise exception 'O físico se lança linha a linha, conferido na loja' using errcode = '22023';
    end if;
    update public.estoque_carga_linhas l
    set acao = case when p_resolucao = 'disponivel' and l.disponivel > 0 then 'entrar' else 'nada' end,
        lancar = case when p_resolucao = 'disponivel' and l.disponivel > 0 then l.disponivel end,
        resolucao = p_resolucao, resolvido_por = (select auth.uid()), resolvido_em = now(), motivo_resolucao = v_motivo
    where l.carga_id = p_carga and l.pendencia is not null and l.resolucao is null;
    get diagnostics v_quantas = row_count;
    if v_quantas = 0 then
      raise exception 'Não há linha com diferença sem resolução nesta carga' using errcode = '22023';
    end if;
    v_totais := privado.estoque_carga_totais(p_carga);
    perform set_config('ora.motivo', format('Carga nº %s, %s linhas sem resolução, de uma vez: %s. %s', v_carga.numero, v_quantas,
      case p_resolucao when 'disponivel' then 'lançar só o disponível' else 'deixar de fora' end, v_motivo), true);
    update public.estoque_cargas c set totais = v_totais where c.id = p_carga;
    return jsonb_build_object('id', p_carga, 'linhas', v_quantas, 'totais', v_totais);
  end if;
  select * into v_linha from public.estoque_carga_linhas l where l.carga_id = p_carga and l.numero = p_numero for update;
  if not found or v_linha.pendencia is null then
    raise exception 'Esta linha não tem diferença a resolver' using errcode = '22023';
  end if;
  if p_resolucao = 'disponivel' then
    v_acao := case when v_linha.disponivel > 0 then 'entrar' else 'nada' end;
    v_lancar := case when v_linha.disponivel > 0 then v_linha.disponivel end;
  elsif p_resolucao = 'fisico' then
    v_acao := 'entrar';
    v_lancar := v_linha.fisico;
  else
    v_acao := 'nada';
    v_lancar := null;
  end if;
  update public.estoque_carga_linhas l
  set acao = v_acao, lancar = v_lancar, resolucao = p_resolucao, resolvido_por = (select auth.uid()), resolvido_em = now(),
      motivo_resolucao = v_motivo
  where l.carga_id = p_carga and l.numero = p_numero;
  v_totais := privado.estoque_carga_totais(p_carga);
  -- A auditoria da carga guarda cada decisão, com quem decidiu (o gatilho da carga) e o texto.
  perform set_config('ora.motivo', format('Carga nº %s, linha %s (%s): %s. %s', v_carga.numero, v_linha.numero, v_linha.sku,
    case p_resolucao
      when 'disponivel' then format('lançar o disponível (%s de %s)', v_linha.disponivel, v_linha.fisico)
      when 'fisico' then format('lançar o físico (%s), conferido na loja', v_linha.fisico)
      else 'deixar de fora' end, v_motivo), true);
  update public.estoque_cargas c set totais = v_totais where c.id = p_carga;
  return jsonb_build_object('id', p_carga, 'numero', p_numero, 'acao', v_acao, 'lancar', v_lancar, 'totais', v_totais);
end;
$$;
revoke all on function public.estoque_carga_resolver(uuid, text, text, int) from public, anon;
grant execute on function public.estoque_carga_resolver(uuid, text, text, int) to authenticated;

-- -----------------------------------------------------------------------------
-- As três funções da carga em vigor, com a pendência e a quantidade resolvida
-- -----------------------------------------------------------------------------
create or replace function public.estoque_carga_previa(
  p_organizacao uuid, p_unidade uuid, p_arquivo_nome text, p_sha256 text, p_corte timestamptz, p_mapeamento jsonb, p_linhas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade public.unidades;
  v_existente public.estoque_cargas;
  v_aplicada bigint;
  v_id uuid;
  v_numero bigint;
  v_linha jsonb;
  v_n int;
  v_sku text;
  v_fisico int;
  v_disponivel int;
  v_problema text;
  v_variante public.variantes;
  v_produto_ativo boolean;
  v_tipo text;
  v_saldo int;
  v_acao text;
  v_motivo text;
  v_pendencia text;
  v_lancar int;
  v_vistos jsonb := '{}'::jsonb;
  v_totais jsonb;
begin
  if p_organizacao is null or p_organizacao not in (select privado.organizacoes_com_permissao('importacao.executar')) then
    raise exception 'Sem permissão para importar nesta rede' using errcode = '42501';
  end if;
  select * into v_unidade from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao;
  if not found or v_unidade.status <> 'ativa' or v_unidade.tipo not in ('loja_fisica', 'deposito', 'excecao') then
    raise exception 'A carga é para uma loja, um depósito ou o local de exceção ativos desta rede' using errcode = '22023';
  end if;
  if p_arquivo_nome is null or length(btrim(p_arquivo_nome)) not between 1 and 200 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_mapeamento) is distinct from 'object' then
    raise exception 'Dados do arquivo inválidos' using errcode = '22023';
  end if;
  if p_corte is null or p_corte > now() or p_corte < now() - interval '400 days' then
    raise exception 'A data de corte (a posição do arquivo) vem antes de agora e no máximo 400 dias atrás' using errcode = '22023';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 3000 then
    raise exception 'A carga de uma loja leva de 1 a 3.000 linhas' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', p_organizacao, p_sha256 || ':' || p_unidade::text));
  select c.numero into v_aplicada from public.estoque_cargas c
  where c.organizacao_id = p_organizacao and c.unidade_id = p_unidade and c.arquivo_sha256 = p_sha256 and c.situacao = 'aplicada';
  if found then
    raise exception 'Este arquivo já foi aplicado nesta loja (carga nº %)', v_aplicada using errcode = 'OR023';
  end if;
  select * into v_existente from public.estoque_cargas c
  where c.organizacao_id = p_organizacao and c.unidade_id = p_unidade and c.arquivo_sha256 = p_sha256 and c.situacao = 'previa'
    and c.corte = p_corte and c.mapeamento = p_mapeamento
  order by c.criado_em desc limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true, 'totais', v_existente.totais);
  end if;

  perform set_config('ora.motivo', 'Prévia da carga do estoque inicial: ' || btrim(p_arquivo_nome), true);
  insert into public.estoque_cargas (organizacao_id, unidade_id, arquivo_nome, arquivo_sha256, corte, mapeamento, criado_por)
  values (p_organizacao, p_unidade, btrim(p_arquivo_nome), p_sha256, p_corte, p_mapeamento, (select auth.uid()))
  returning id, numero into v_id, v_numero;

  for v_linha in select e from jsonb_array_elements(p_linhas) e loop
    if jsonb_typeof(v_linha) <> 'object' or coalesce(v_linha ->> 'numero', '') !~ '^[0-9]{1,6}$' or (v_linha ->> 'numero')::int < 2
       or (v_linha ? 'fisico' and jsonb_typeof(v_linha -> 'fisico') not in ('number', 'null'))
       or (v_linha ? 'disponivel' and jsonb_typeof(v_linha -> 'disponivel') not in ('number', 'null')) then
      raise exception 'Linha do arquivo em formato inválido' using errcode = '22023';
    end if;
    v_n := (v_linha ->> 'numero')::int;
    v_sku := left(btrim(coalesce(v_linha ->> 'sku', '')), 60);
    v_problema := nullif(left(btrim(coalesce(v_linha ->> 'problema', '')), 200), '');
    if coalesce(v_linha ->> 'fisico', '') !~ '^-?[0-9]{1,7}$' and v_linha ->> 'fisico' is not null then
      raise exception 'Linha %: a quantidade física precisa ser um número inteiro', v_n using errcode = '22023';
    end if;
    if coalesce(v_linha ->> 'disponivel', '') !~ '^-?[0-9]{1,7}$' and v_linha ->> 'disponivel' is not null then
      raise exception 'Linha %: a quantidade disponível precisa ser um número inteiro', v_n using errcode = '22023';
    end if;
    v_fisico := (v_linha ->> 'fisico')::int;
    v_disponivel := (v_linha ->> 'disponivel')::int;
    v_variante := null;
    v_saldo := 0;
    v_acao := 'conferir';
    v_motivo := null;
    v_pendencia := null;
    v_lancar := null;
    if v_problema is not null then
      v_motivo := v_problema;
    elsif v_sku = '' then
      v_motivo := 'Linha sem o código do produto';
    elsif v_vistos ? v_sku then
      v_motivo := format('Código repetido no arquivo (já na linha %s)', v_vistos ->> v_sku);
    else
      select * into v_variante from public.variantes v where v.organizacao_id = p_organizacao and v.sku = v_sku;
      if not found then
        v_acao := 'sem_produto';
        v_motivo := 'O código não está no catálogo: importe o catálogo antes';
      else
        select p.ativo, p.tipo into v_produto_ativo, v_tipo from public.produtos p where p.id = v_variante.produto_id;
        select coalesce(sum(m.quantidade), 0) into v_saldo from public.estoque_movimentos m
        where m.organizacao_id = p_organizacao and m.unidade_id = p_unidade and m.variante_id = v_variante.id and m.ocorrido_em <= p_corte;
        if v_fisico is null then
          v_motivo := 'Sem a quantidade física';
        elsif v_fisico < 0 or v_disponivel < 0 then
          v_motivo := 'Quantidade negativa no arquivo';
        elsif v_disponivel > v_fisico then
          v_motivo := 'O disponível é maior que o físico';
        elsif v_fisico = 0 then
          v_acao := 'nada';
        elsif not v_variante.ativa or not v_produto_ativo then
          v_motivo := 'O produto está inativo no catálogo: reative antes';
        elsif v_tipo not in ('aparelho', 'chip', 'acessorio') then
          v_motivo := 'Este tipo de item não tem estoque';
        elsif v_saldo <> 0 then
          v_motivo := format('A loja já tinha %s no sistema na data de corte: confira antes de lançar', v_saldo);
        elsif v_tipo in ('aparelho', 'chip') then
          v_acao := 'serializado';
          v_motivo := 'Entra pela Entrada de estoque, com o IMEI ou o ICCID de cada unidade';
          if v_disponivel is not null and v_disponivel < v_fisico then
            -- REIN-c: a carga não lança o serializado; o aviso fica para quem der a entrada de cada unidade.
            v_motivo := v_motivo || format('; o físico (%s) é maior que o disponível (%s): confira quais unidades estão '
              'reservadas ou a caminho antes de dar entrada', v_fisico, v_disponivel);
          end if;
        elsif v_disponivel is not null and v_disponivel < v_fisico then
          -- REIN-c (F18-03): a diferença pode estar reservada, a caminho ou com erro; nada se presume. A linha fica
          -- para conferir até a resolução registrada (estoque_carga_resolver), e a carga não se aplica sem ela.
          v_pendencia := 'fisico_maior_que_disponivel';
          v_motivo := format('O físico (%s) é maior que o disponível (%s) na data de corte: a diferença pode estar reservada, '
            'a caminho ou com erro. Resolva antes de aplicar', v_fisico, v_disponivel);
        else
          v_acao := 'entrar';
          v_lancar := v_fisico;
        end if;
      end if;
      v_vistos := v_vistos || jsonb_build_object(v_sku, v_n);
    end if;
    insert into public.estoque_carga_linhas (carga_id, numero, sku, variante_id, fisico, disponivel, saldo_no_corte, acao, motivo, lancar, pendencia)
    values (v_id, v_n, v_sku, v_variante.id, v_fisico, v_disponivel, v_saldo, v_acao, v_motivo, v_lancar, v_pendencia);
  end loop;

  v_totais := privado.estoque_carga_totais(v_id);
  update public.estoque_cargas c set totais = v_totais where c.id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false, 'totais', v_totais);
end;
$$;
revoke all on function public.estoque_carga_previa(uuid, uuid, text, text, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.estoque_carga_previa(uuid, uuid, text, text, timestamptz, jsonb, jsonb) to authenticated;

create or replace function public.estoque_carga_aplicar(p_carga uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_carga public.estoque_cargas;
  v_unidade public.unidades;
  v_outra bigint;
  v_linha public.estoque_carga_linhas;
  v_ativa boolean;
  v_mov bigint;
  v_entradas int := 0;
  v_unidades bigint := 0;
  v_rotulo text;
begin
  select * into v_carga from public.estoque_cargas c where c.id = p_carga;
  if not found or v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Sem permissão para aplicar a carga' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', v_carga.organizacao_id, 'loja:' || v_carga.unidade_id::text));
  select * into v_carga from public.estoque_cargas c where c.id = p_carga for update;
  if v_carga.situacao <> 'previa' then
    raise exception 'Só a prévia pode ser aplicada (esta está %)', v_carga.situacao using errcode = '22023';
  end if;
  if v_carga.criado_por = (select auth.uid()) then
    raise exception 'Quem gerou a prévia não aplica: peça a outra pessoa com a aprovação' using errcode = 'OR024';
  end if;
  select c.numero into v_outra from public.estoque_cargas c
  where c.organizacao_id = v_carga.organizacao_id and c.unidade_id = v_carga.unidade_id and c.situacao = 'aplicada';
  if found then
    raise exception 'A loja já tem uma carga aplicada (nº %): desfaça antes de aplicar outra', v_outra using errcode = 'OR041';
  end if;
  -- REIN-c (F18-03): a diferença entre o físico e o disponível precisa da resolução de cada linha antes (OR042).
  if exists (select 1 from public.estoque_carga_linhas l where l.carga_id = v_carga.id and l.pendencia is not null and l.resolucao is null) then
    raise exception 'Há linhas com o físico maior que o disponível sem resolução: resolva cada uma antes de aplicar' using errcode = 'OR042';
  end if;
  select * into v_unidade from public.unidades u where u.id = v_carga.unidade_id;
  if v_unidade.status <> 'ativa' then
    raise exception 'A loja da carga não está ativa' using errcode = '22023';
  end if;
  v_rotulo := format('Carga inicial nº %s (%s, posição de %s): %s', v_carga.numero, v_carga.arquivo_nome,
    to_char(v_carga.corte at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  for v_linha in select * from public.estoque_carga_linhas l where l.carga_id = v_carga.id and l.acao = 'entrar' order by l.numero loop
    select v.ativa and p.ativo into v_ativa from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = v_linha.variante_id;
    if not coalesce(v_ativa, false) then
      raise exception 'Linha % (%): o produto foi inativado depois da prévia: gere a prévia de novo', v_linha.numero, v_linha.sku using errcode = '22023';
    end if;
    v_mov := privado.lancar_movimento(v_carga.unidade_id, v_linha.variante_id, v_linha.lancar, 'entrada_importacao', null, v_rotulo,
      'estoque_carga', v_carga.id::text, format('estoque_carga:%s:%s', v_carga.id, v_linha.numero), (select auth.uid()));
    update public.estoque_carga_linhas l set movimento_id = v_mov where l.carga_id = v_carga.id and l.numero = v_linha.numero;
    v_entradas := v_entradas + 1;
    v_unidades := v_unidades + v_linha.lancar;
  end loop;
  update public.estoque_cargas c set situacao = 'aplicada', aplicado_por = (select auth.uid()), aplicado_em = now(), motivo = v_motivo
  where c.id = v_carga.id;
  return jsonb_build_object('id', v_carga.id, 'numero', v_carga.numero, 'entradas', v_entradas, 'unidades', v_unidades);
end;
$$;
revoke all on function public.estoque_carga_aplicar(uuid, text) from public, anon;
grant execute on function public.estoque_carga_aplicar(uuid, text) to authenticated;

create or replace function public.estoque_carga_desfazer(p_carga uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_carga public.estoque_cargas;
  v_linha public.estoque_carga_linhas;
  v_livre int;
  v_desfeitas int := 0;
  v_ficaram int := 0;
  v_rotulo text;
begin
  select * into v_carga from public.estoque_cargas c where c.id = p_carga;
  if not found or v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Sem permissão para desfazer a carga' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', v_carga.organizacao_id, 'loja:' || v_carga.unidade_id::text));
  select * into v_carga from public.estoque_cargas c where c.id = p_carga for update;
  if v_carga.situacao <> 'aplicada' then
    raise exception 'Só a carga aplicada pode ser desfeita (esta está %)', v_carga.situacao using errcode = '22023';
  end if;
  v_rotulo := format('Desfazer a carga inicial nº %s: %s', v_carga.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  for v_linha in select * from public.estoque_carga_linhas l
                 where l.carga_id = v_carga.id and l.movimento_id is not null and l.desfeita_em is null order by l.numero desc loop
    -- Só o que está livre na loja volta: o que já foi vendido, reservado ou transferido fica (e é contado).
    select coalesce(s.quantidade - s.reservado, 0) into v_livre from public.estoque_saldos s
    where s.unidade_id = v_carga.unidade_id and s.variante_id = v_linha.variante_id for update;
    -- REIN-c: volta o que a carga lançou (o físico ou o disponível resolvido).
    if coalesce(v_livre, 0) >= coalesce(v_linha.lancar, v_linha.fisico) then
      perform privado.lancar_movimento(v_carga.unidade_id, v_linha.variante_id, -coalesce(v_linha.lancar, v_linha.fisico), 'ajuste', null, v_rotulo,
        'estoque_carga', v_carga.id::text, format('estoque_carga:%s:desfazer:%s', v_carga.id, v_linha.numero), (select auth.uid()));
      update public.estoque_carga_linhas l set desfeita_em = now() where l.carga_id = v_carga.id and l.numero = v_linha.numero;
      v_desfeitas := v_desfeitas + 1;
    else
      v_ficaram := v_ficaram + 1;
    end if;
  end loop;
  update public.estoque_cargas c set situacao = 'desfeita', encerrado_por = (select auth.uid()), encerrado_em = now(), motivo = v_motivo,
    totais = c.totais || jsonb_build_object('desfeitas', v_desfeitas, 'ficaram', v_ficaram)
  where c.id = v_carga.id;
  return jsonb_build_object('id', v_carga.id, 'numero', v_carga.numero, 'desfeitas', v_desfeitas, 'ficaram', v_ficaram);
end;
$$;
revoke all on function public.estoque_carga_desfazer(uuid, text) from public, anon;
grant execute on function public.estoque_carga_desfazer(uuid, text) to authenticated;
