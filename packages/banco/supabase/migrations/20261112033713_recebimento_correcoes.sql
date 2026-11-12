-- =============================================================================
-- Correções do recebimento (lote R1: achados REV-NOV-001, REV-NOV-004, REV-NOV-005 e REV-NOV-009 da revisão
-- integral de 11/11/2026; ORA-INV-009, ORA-INV-004, ORA-CAT-008)
--
--   * Custo só com custo.ver: as colunas de custo do recebimento (e o resumo do conteúdo) deixam de ser
--     legíveis direto pela tabela; o custo sai só pelas funções de leitura, e só para quem tem custo.ver na
--     loja. A imagem do cabeçalho da entrada na auditoria segue a mesma regra.
--   * Histórico completo: estoque_entradas pagina todas as entradas da loja e estoque_entrada abre uma
--     entrada pelo id ou pelo número, com os IMEI/ICCID e a posição de cada um hoje.
--   * Reentrada auditada: o IMEI/ICCID cuja última saída foi o estorno do recebimento volta pela entrada
--     (mesma identidade, sem apagar nem duplicar, sem reescrever o livro), na loja certa e, enquanto só teve
--     recebimentos, na variação certa. Vendido, em transferência, no estoque ou baixado por outro motivo: recusa.
--   * Recebimento e inativação: a entrada exige produto ativo e segura a variação e o produto até o fim
--     (for share); a inativação espera e passa a ver o estoque que entrou.
-- estoque_registrar_entrada recriada a partir do texto aplicado em 20261111141337_entrada_estoque e
-- validar_movimento a partir de 20261109193043_transferencias_e_defeitos, com as mudanças marcadas "R1".
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Custo do recebimento fora da leitura direta (REV-NOV-001) e a marca da reentrada na linha
-- -----------------------------------------------------------------------------

-- Quais itens da linha voltaram por reentrada (subconjunto de itens).
alter table public.entrada_itens add column reentradas uuid[] not null default '{}';
alter table public.entrada_itens add constraint entrada_itens_reentradas_nos_itens check (reentradas <@ itens);

-- A leitura direta fica só com as colunas sem custo. total_custo_centavos, custo_unitario_centavos, conteudo
-- (resumo do envio, que inclui os custos) e chave saem do alcance da API para todos: o custo sai pelas funções
-- da seção 4, que conferem custo.ver na loja. As políticas de leitura continuam valendo sobre as linhas.
revoke select on public.entradas_estoque, public.entrada_itens from authenticated;
grant select (id, numero, organizacao_id, unidade_id, tipo, fornecedor_id, documento, situacao, total_unidades, criado_por, criado_em, estornado_por, estornado_em, motivo_estorno)
  on public.entradas_estoque to authenticated;
grant select (entrada_id, linha, organizacao_id, variante_id, quantidade, condicao, itens, reentradas)
  on public.entrada_itens to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Auditoria: a imagem do cabeçalho da entrada só para quem vê custo (REV-NOV-001)
-- -----------------------------------------------------------------------------

-- A auditoria automática guarda a linha inteira de entradas_estoque (custo total e resumo do conteúdo). Quem
-- tem auditoria.ver sem custo.ver deixa de ler essas linhas; nenhum papel padrão fica nessa situação hoje.
drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (
    (
      (unidade_id is not null and (select public.tem_permissao('auditoria.ver', unidade_id)))
      or (
        unidade_id is null
        and organizacao_id is not null
        and organizacao_id in (select privado.organizacoes_com_permissao('auditoria.ver'))
      )
    )
    and (
      alvo_tipo is distinct from 'entradas_estoque'
      or (unidade_id is not null and (select public.tem_permissao('custo.ver', unidade_id)))
    )
  );

-- -----------------------------------------------------------------------------
-- 3. O que o livro diz da identidade (REV-NOV-004)
-- -----------------------------------------------------------------------------

-- O último lançamento do item no livro foi o estorno do recebimento?
create or replace function privado.item_saiu_por_estorno_de_entrada(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select m.tipo = 'ajuste' and m.quantidade = -1 and m.referencia_tipo is not distinct from 'estorno_entrada'
    from public.estoque_movimentos m
    where m.item_serializado_id = p_item
    order by m.id desc
    limit 1), false);
$$;
revoke all on function privado.item_saiu_por_estorno_de_entrada(uuid) from public, anon, authenticated;

-- A identidade só teve recebimentos e estornos de recebimento: nenhuma venda, reserva, transferência, operação
-- Connect, nem contagem aberta que a liste. Só nesse caso a reentrada pode corrigir a variação.
create or replace function privado.item_so_teve_recebimentos(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
           select 1 from public.estoque_movimentos m
           where m.item_serializado_id = p_item
             and not ((m.quantidade = 1 and m.tipo in ('entrada_compra', 'entrada_importacao'))
                   or (m.quantidade = -1 and m.tipo = 'ajuste' and m.referencia_tipo is not distinct from 'estorno_entrada')))
     and not exists (select 1 from public.venda_itens v where v.item_serializado_id = p_item)
     and not exists (select 1 from public.estoque_reservas r where r.item_serializado_id = p_item)
     and not exists (select 1 from public.transferencia_itens t where t.item_serializado_id = p_item)
     and not exists (select 1 from public.connect_operacoes c where c.item_serializado_id = p_item)
     and not exists (select 1 from public.inventario_itens x join public.inventarios n on n.id = x.inventario_id
                     where n.situacao in ('em_contagem', 'enviado') and p_item = any (x.sistema_itens));
$$;
revoke all on function privado.item_so_teve_recebimentos(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Leitura das entradas: histórico paginado e detalhe, com custo só para custo.ver (REV-NOV-001, REV-NOV-009)
-- -----------------------------------------------------------------------------

create index entradas_estoque_unidade_numero on public.entradas_estoque (unidade_id, numero desc);

-- Uma entrada em JSON. Sem custo.ver o custo vem nulo (nunca zero). No detalhe, cada IMEI/ICCID traz a posição
-- de hoje (ou "outra_loja", sem dizer qual) e cada linha de acessório traz o saldo livre de hoje na loja.
create or replace function privado.entrada_em_json(p_entrada uuid, p_ve_custo boolean, p_detalhe boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'numero', e.numero, 'tipo', e.tipo, 'documento', e.documento, 'situacao', e.situacao,
    'total_unidades', e.total_unidades,
    'total_custo', case when p_ve_custo then e.total_custo_centavos end,
    'criado_em', e.criado_em,
    'criado_por', (select p.nome from public.perfis_usuario p where p.id = e.criado_por),
    'estornado_em', e.estornado_em,
    'estornado_por', (select p.nome from public.perfis_usuario p where p.id = e.estornado_por),
    'motivo_estorno', e.motivo_estorno,
    'fornecedor', (select f.nome from public.fornecedores f where f.id = e.fornecedor_id),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linha', i.linha, 'sku', v.sku, 'nome', v.nome, 'quantidade', i.quantidade, 'condicao', i.condicao,
        'custo_unitario', case when p_ve_custo then i.custo_unitario_centavos end,
        'reentradas', cardinality(i.reentradas),
        'saldo_livre', case when p_detalhe and cardinality(i.itens) = 0 then coalesce((
            select s.quantidade - s.reservado from public.estoque_saldos s
            where s.unidade_id = e.unidade_id and s.variante_id = i.variante_id), 0) end,
        'identificadores', case when p_detalhe then coalesce((
            select jsonb_agg(jsonb_build_object(
              'identificador', coalesce(s.imei, s.iccid),
              'situacao', case when s.unidade_id = e.unidade_id then s.situacao else 'outra_loja' end,
              'livre', s.em_estoque and s.unidade_id = e.unidade_id and s.situacao = 'disponivel',
              'reentrada', s.id = any (i.reentradas)) order by x.ordem)
            from unnest(i.itens) with ordinality x (id, ordem)
            join public.itens_serializados s on s.id = x.id), '[]'::jsonb) end
        ) order by i.linha)
      from public.entrada_itens i
      join public.variantes v on v.id = i.variante_id
      where i.entrada_id = e.id), '[]'::jsonb))
  from public.entradas_estoque e
  where e.id = p_entrada;
$$;
revoke all on function privado.entrada_em_json(uuid, boolean, boolean) from public, anon, authenticated;

-- Histórico da loja, da mais nova para a mais antiga. p_antes = número da última entrada já vista (a página
-- seguinte começa logo abaixo dele); "proxima" vem nulo quando acabou.
create or replace function public.estoque_entradas(p_unidade uuid, p_antes bigint default null, p_limite int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite int := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_ve_custo boolean;
  v_ids uuid[];
  v_numeros bigint[];
begin
  if p_unidade is null or not coalesce(public.tem_permissao('estoque.consultar', p_unidade), false) then
    raise exception 'Sem permissão para ver as entradas desta loja' using errcode = '42501';
  end if;
  if p_antes is not null and p_antes < 1 then
    raise exception 'Página inválida' using errcode = '22023';
  end if;
  v_ve_custo := coalesce(public.tem_permissao('custo.ver', p_unidade), false);
  select array_agg(x.id order by x.numero desc), array_agg(x.numero order by x.numero desc) into v_ids, v_numeros
  from (select e.id, e.numero from public.entradas_estoque e
        where e.unidade_id = p_unidade and (p_antes is null or e.numero < p_antes)
        order by e.numero desc
        limit v_limite + 1) x;
  return jsonb_build_object(
    've_custo', v_ve_custo,
    'total', (select count(*) from public.entradas_estoque e where e.unidade_id = p_unidade),
    'entradas', coalesce((select jsonb_agg(privado.entrada_em_json(t.id, v_ve_custo, false) order by t.ordem)
                          from unnest(v_ids[1:v_limite]) with ordinality t (id, ordem)), '[]'::jsonb),
    'proxima', case when coalesce(cardinality(v_ids), 0) > v_limite then v_numeros[v_limite] end);
end;
$$;

-- Uma entrada da loja, pelo id ou pelo número (um dos dois), com os IMEI/ICCID e a posição de hoje.
create or replace function public.estoque_entrada(p_unidade uuid, p_entrada uuid, p_numero bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ve_custo boolean;
begin
  if p_unidade is null or not coalesce(public.tem_permissao('estoque.consultar', p_unidade), false) then
    raise exception 'Sem permissão para ver as entradas desta loja' using errcode = '42501';
  end if;
  if (p_entrada is null) = (p_numero is null) then
    raise exception 'Informe a entrada ou o número dela' using errcode = '22023';
  end if;
  select e.id into v_id from public.entradas_estoque e
  where e.unidade_id = p_unidade and (e.id = p_entrada or e.numero = p_numero);
  if not found then
    raise exception 'Entrada não encontrada nesta loja' using errcode = 'P0002';
  end if;
  v_ve_custo := coalesce(public.tem_permissao('custo.ver', p_unidade), false);
  return privado.entrada_em_json(v_id, v_ve_custo, true) || jsonb_build_object('ve_custo', v_ve_custo);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Livro: a reentrada depois do estorno pode corrigir a loja (REV-NOV-004)
-- -----------------------------------------------------------------------------

create or replace function privado.validar_movimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tipo text := privado.tipo_da_variante(new.variante_id);
  item public.itens_serializados;
begin
  if tipo in ('aparelho', 'chip') then
    if new.item_serializado_id is null then
      raise exception 'Aparelho e chip movimentam pelo IMEI/ICCID' using errcode = '23514';
    end if;
    -- Trava do item: duas entradas (ou saídas) simultâneas do mesmo aparelho esperam uma pela
    -- outra, e a segunda vê a posição já mudada pela primeira.
    select * into item from public.itens_serializados i where i.id = new.item_serializado_id for update;
    if not found or item.variante_id <> new.variante_id or item.organizacao_id <> new.organizacao_id then
      raise exception 'O item não é desta variação' using errcode = '23514';
    end if;
    if new.quantidade = 1 then
      if item.em_estoque then
        raise exception 'Este IMEI/ICCID já está no estoque: a entrada não conta duas vezes' using errcode = 'OR005';
      end if;
      if item.unidade_id <> new.unidade_id and new.tipo not in ('transferencia_entrada', 'devolucao')
         -- R1 (REV-NOV-004): a reentrada de uma identidade cuja última saída foi o estorno do recebimento pode
         -- corrigir a loja (o gatilho roda antes de gravar: o último lançamento visível ainda é o estorno).
         and not (new.referencia_tipo is not distinct from 'reentrada' and new.tipo in ('entrada_compra', 'entrada_importacao')
                  and privado.item_saiu_por_estorno_de_entrada(item.id)) then
        raise exception 'O item não está nesta loja' using errcode = '23514';
      end if;
      update public.itens_serializados
      set em_estoque = true, unidade_id = new.unidade_id, situacao = 'disponivel'
      where id = item.id;
    else
      if not item.em_estoque or item.unidade_id <> new.unidade_id then
        raise exception 'Este IMEI/ICCID não está no estoque desta loja' using errcode = 'OR005';
      end if;
      -- Item reservado só sai pela venda ou pela transferência que consumiu a reserva (nunca com
      -- reserva ativa). Transferência: ADR-007 (#60).
      if item.situacao = 'reservado' and (new.tipo not in ('venda', 'transferencia_saida') or exists (
           select 1 from public.estoque_reservas r
           where r.item_serializado_id = item.id and r.situacao = 'ativa')) then
        raise exception 'Este IMEI/ICCID está reservado: encerre a reserva antes' using errcode = 'OR002';
      end if;
      update public.itens_serializados
      set em_estoque = false,
          situacao = case new.tipo when 'venda' then 'vendido' when 'transferencia_saida' then 'em_transito' else 'baixado' end
      where id = item.id;
    end if;
  elsif tipo = 'acessorio' then
    if new.item_serializado_id is not null then
      raise exception 'Acessório movimenta por quantidade' using errcode = '23514';
    end if;
  else
    raise exception 'Este tipo de item não tem estoque' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Entrada: produto ativo, travas com o catálogo e reentrada da identidade estornada (REV-NOV-004, REV-NOV-005)
-- -----------------------------------------------------------------------------

create or replace function public.estoque_registrar_entrada(
  p_unidade uuid, p_tipo text, p_fornecedor uuid, p_documento text, p_itens jsonb, p_chave text, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_unidade public.unidades;
  v_documento text := nullif(trim(coalesce(p_documento, '')), '');
  v_conteudo text;
  v_existente public.entradas_estoque;
  v_entrada uuid;
  v_numero bigint;
  v_linha jsonb;
  v_n int := 0;
  v_variante public.variantes;
  v_tipo_item text;
  v_quantidade int;
  v_custo bigint;
  v_condicao text;
  v_ids text[];
  v_id text;
  v_item uuid;
  v_itens uuid[];
  v_vistos text[] := '{}';
  v_total int := 0;
  v_total_custo bigint := 0;
  v_tem_custo boolean := false;
  v_mov text := case p_tipo when 'compra' then 'entrada_compra' else 'entrada_importacao' end;
  v_seriais int := 0;
  -- R1 (REV-NOV-004): identidade já cadastrada que volta pela entrada.
  v_achado public.itens_serializados;
  v_reentradas uuid[];
  v_total_reentradas int := 0;
begin
  select * into v_unidade from public.unidades u where u.id = p_unidade;
  if not found or not public.tem_permissao('estoque.receber', p_unidade) then
    raise exception 'Sem permissão para registrar entrada nesta loja' using errcode = '42501';
  end if;
  if v_unidade.status <> 'ativa' or v_unidade.tipo not in ('loja_fisica', 'deposito') then
    raise exception 'Entrada só em loja física ou depósito ativos' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('compra', 'carga_inicial') then
    raise exception 'Tipo de entrada inválido: compra ou carga inicial' using errcode = '22023';
  end if;
  if p_tipo = 'compra' and not exists (select 1 from public.fornecedores f where f.id = p_fornecedor and f.organizacao_id = v_unidade.organizacao_id and f.ativo) then
    raise exception 'Escolha um fornecedor ativo desta rede' using errcode = '22023';
  end if;
  if p_tipo = 'carga_inicial' and p_fornecedor is not null then
    raise exception 'Carga inicial não tem fornecedor' using errcode = '22023';
  end if;
  if v_documento is not null and length(v_documento) > 60 then
    raise exception 'Documento longo demais (até 60)' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 200 then
    raise exception 'A entrada precisa ter de 1 a 200 linhas' using errcode = '22023';
  end if;

  v_conteudo := md5(jsonb_build_array(p_unidade, p_tipo, p_fornecedor, v_documento, p_itens)::text);
  perform pg_advisory_xact_lock(privado.trava_da_chave('entradas_estoque', v_unidade.organizacao_id, p_chave));
  select * into v_existente from public.entradas_estoque e where e.organizacao_id = v_unidade.organizacao_id and e.chave = trim(p_chave);
  if found then
    if v_existente.conteudo = v_conteudo then
      -- R1: a repetição devolve as mesmas reentradas da primeira vez.
      return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true,
        'reentradas', (select coalesce(sum(cardinality(i.reentradas)), 0) from public.entrada_itens i where i.entrada_id = v_existente.id));
    end if;
    raise exception 'Chave do formulário já usada em outra entrada' using errcode = 'OR004';
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  insert into public.entradas_estoque (organizacao_id, unidade_id, tipo, fornecedor_id, documento, chave, conteudo, total_unidades, criado_por)
  values (v_unidade.organizacao_id, p_unidade, p_tipo, p_fornecedor, v_documento, trim(p_chave), v_conteudo, 1, (select auth.uid()))
  returning id, numero into v_entrada, v_numero;

  for v_linha in select e from jsonb_array_elements(p_itens) e loop
    v_n := v_n + 1;
    if jsonb_typeof(v_linha) <> 'object' or coalesce(v_linha ->> 'variante', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'Linha %: variação inválida', v_n using errcode = '22023';
    end if;
    -- R1 (REV-NOV-005): a variação e o produto ficam travados (for share) até o fim da entrada; a inativação
    -- (for update no catálogo) espera e já vê o estoque que entrou; se ela chegou antes, a entrada relê e recusa.
    select * into v_variante from public.variantes v where v.id = (v_linha ->> 'variante')::uuid and v.organizacao_id = v_unidade.organizacao_id and v.ativa for share;
    if not found then
      raise exception 'Linha %: variação inativa ou de outra rede', v_n using errcode = '22023';
    end if;
    perform 1 from public.produtos p where p.id = v_variante.produto_id and p.ativo for share;
    if not found then
      raise exception 'Linha % (%): o produto está inativo no catálogo: reative antes de receber', v_n, v_variante.sku using errcode = '22023';
    end if;
    v_tipo_item := privado.tipo_da_variante(v_variante.id);
    if v_tipo_item not in ('aparelho', 'chip', 'acessorio') then
      raise exception 'Linha % (%): este tipo de item não tem estoque', v_n, v_variante.sku using errcode = '22023';
    end if;
    v_condicao := coalesce(nullif(v_linha ->> 'condicao', ''), 'novo');
    if v_condicao not in ('novo', 'seminovo', 'avariado') then
      raise exception 'Linha %: condição inválida (novo, seminovo ou avariado)', v_n using errcode = '22023';
    end if;
    v_custo := null;
    if v_linha ? 'custo' and jsonb_typeof(v_linha -> 'custo') <> 'null' then
      if jsonb_typeof(v_linha -> 'custo') <> 'number' or (v_linha ->> 'custo') !~ '^[0-9]{1,9}$' or (v_linha ->> 'custo')::bigint > 100000000 then
        raise exception 'Linha %: custo inválido', v_n using errcode = '22023';
      end if;
      v_custo := (v_linha ->> 'custo')::bigint;
    end if;
    v_itens := '{}';
    v_reentradas := '{}'; -- R1
    if v_tipo_item in ('aparelho', 'chip') then
      if jsonb_typeof(v_linha -> 'identificadores') is distinct from 'array' or jsonb_array_length(v_linha -> 'identificadores') = 0 then
        raise exception 'Linha % (%): informe o IMEI/ICCID de cada unidade', v_n, v_variante.sku using errcode = '22023';
      end if;
      v_ids := array(select regexp_replace(x, '[^0-9]', '', 'g') from jsonb_array_elements_text(v_linha -> 'identificadores') x);
      v_seriais := v_seriais + cardinality(v_ids);
      if v_seriais > 500 then
        raise exception 'Até 500 aparelhos e chips por entrada: divida em mais de uma' using errcode = '22023';
      end if;
      v_quantidade := cardinality(v_ids);
      foreach v_id in array v_ids loop
        if v_id = any (v_vistos) then
          raise exception 'IMEI/ICCID % repetido nesta entrada', v_id using errcode = '22023';
        end if;
        v_vistos := v_vistos || v_id;
        if v_tipo_item = 'aparelho' and not privado.imei_valido(v_id) then
          raise exception 'Linha % (%): IMEI inválido: %', v_n, v_variante.sku, v_id using errcode = '22023';
        end if;
        if v_tipo_item = 'chip' and not privado.iccid_valido(v_id) then
          raise exception 'Linha % (%): ICCID inválido: %', v_n, v_variante.sku, v_id using errcode = '22023';
        end if;
        -- R1 (REV-NOV-004): a identidade já cadastrada só volta por esta entrada quando a última saída dela foi o
        -- estorno do recebimento. A linha do item fica travada até o fim: duas entradas do mesmo IMEI/ICCID
        -- esperam uma pela outra, e a segunda já vê o item de volta ao estoque.
        select i.* into v_achado from public.itens_serializados i
        where i.organizacao_id = v_unidade.organizacao_id and v_id in (i.imei, i.imei2, i.iccid)
        for update;
        if not found then
          v_item := privado.registrar_item_serializado(
            p_unidade, v_variante.id,
            case when v_tipo_item = 'aparelho' then v_id end, null,
            case when v_tipo_item = 'chip' then v_id end,
            v_mov, format('entrada:%s:%s', v_entrada, v_id), (select auth.uid()), v_condicao, null);
        else
          if v_achado.imei is distinct from v_id and v_achado.iccid is distinct from v_id then
            raise exception 'IMEI % é o segundo IMEI de um aparelho já cadastrado: informe o IMEI principal', v_id using errcode = '23505';
          end if;
          if v_achado.em_estoque and v_achado.unidade_id = p_unidade then
            raise exception 'IMEI/ICCID % já está no estoque desta loja: não precisa de entrada nova', v_id using errcode = '23505';
          end if;
          if v_achado.em_estoque then
            raise exception 'IMEI/ICCID % já está no estoque de outra loja: use a transferência, não uma entrada nova', v_id using errcode = '23505';
          end if;
          if v_achado.situacao = 'vendido' then
            raise exception 'IMEI/ICCID % já foi vendido: a volta ao estoque é pela devolução da venda', v_id using errcode = '23505';
          end if;
          if v_achado.situacao = 'em_transito' then
            raise exception 'IMEI/ICCID % está em transferência: conclua o recebimento da transferência', v_id using errcode = '23505';
          end if;
          if v_achado.situacao <> 'baixado' then
            raise exception 'IMEI/ICCID % já cadastrado: use a transferência, a devolução ou o ajuste, não uma entrada nova', v_id using errcode = '23505';
          end if;
          if not privado.item_saiu_por_estorno_de_entrada(v_achado.id) then
            raise exception 'IMEI/ICCID % foi baixado por ajuste ou perda: a entrada não desfaz essa baixa', v_id using errcode = '23505';
          end if;
          -- A variação só é corrigida enquanto a identidade não tem outra história além de recebimentos.
          if v_achado.variante_id <> v_variante.id and not privado.item_so_teve_recebimentos(v_achado.id) then
            raise exception 'IMEI/ICCID % já tem histórico (ou está em contagem aberta) em outra variação: receba na variação original (SKU %)',
              v_id, (select v.sku from public.variantes v where v.id = v_achado.variante_id) using errcode = '23505';
          end if;
          -- Mesma identidade: nada é apagado nem duplicado; o livro ganha um lançamento novo (o estorno fica).
          update public.itens_serializados i set variante_id = v_variante.id, condicao = v_condicao
          where i.id = v_achado.id and (i.variante_id <> v_variante.id or i.condicao <> v_condicao);
          perform privado.lancar_movimento(p_unidade, v_variante.id, 1, v_mov, v_achado.id, v_motivo, 'reentrada', v_entrada::text,
            format('entrada:%s:%s', v_entrada, v_id), (select auth.uid()));
          insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, antes, depois, motivo, origem)
          values ((select auth.uid()), p_unidade, v_unidade.organizacao_id, 'estoque.item_reentrada', 'itens_serializados', v_achado.id::text,
                  jsonb_build_object('variante_id', v_achado.variante_id, 'unidade_id', v_achado.unidade_id, 'condicao', v_achado.condicao, 'situacao', v_achado.situacao),
                  jsonb_build_object('variante_id', v_variante.id, 'unidade_id', p_unidade, 'condicao', v_condicao, 'situacao', 'disponivel',
                                     'entrada_id', v_entrada, 'entrada_numero', v_numero),
                  v_motivo, 'aplicacao');
          v_item := v_achado.id;
          v_reentradas := v_reentradas || v_item;
          v_total_reentradas := v_total_reentradas + 1;
        end if;
        v_itens := v_itens || v_item;
      end loop;
    else
      if v_linha ? 'identificadores' and jsonb_typeof(v_linha -> 'identificadores') = 'array' and jsonb_array_length(v_linha -> 'identificadores') > 0 then
        raise exception 'Linha % (%): acessório entra por quantidade, sem IMEI/ICCID', v_n, v_variante.sku using errcode = '22023';
      end if;
      if coalesce(v_linha ->> 'quantidade', '') !~ '^[0-9]{1,5}$' or (v_linha ->> 'quantidade')::int not between 1 and 10000 then
        raise exception 'Linha % (%): quantidade inválida (1 a 10.000)', v_n, v_variante.sku using errcode = '22023';
      end if;
      v_quantidade := (v_linha ->> 'quantidade')::int;
      if v_condicao <> 'novo' then
        raise exception 'Linha % (%): acessório entra como novo (avaria vai pela perda)', v_n, v_variante.sku using errcode = '22023';
      end if;
      perform privado.lancar_movimento(p_unidade, v_variante.id, v_quantidade, v_mov, null, v_motivo, 'entrada', v_entrada::text,
        format('entrada:%s:%s', v_entrada, v_n), (select auth.uid()));
    end if;
    -- Custo de entrada: vira o custo atual da variação (a venda já feita guarda o dela).
    if v_custo is not null then
      v_tem_custo := true;
      v_total_custo := v_total_custo + v_custo * v_quantidade;
      if privado.custo_atual(v_variante.id) is distinct from v_custo then
        insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
        values (v_unidade.organizacao_id, v_variante.id, v_custo, clock_timestamp(), 'entrada', format('entrada:%s:%s', v_numero, v_n), (select auth.uid()));
      end if;
    end if;
    insert into public.entrada_itens (entrada_id, linha, organizacao_id, variante_id, quantidade, custo_unitario_centavos, condicao, itens, reentradas)
    values (v_entrada, v_n, v_unidade.organizacao_id, v_variante.id, v_quantidade, v_custo, v_condicao, v_itens, v_reentradas); -- R1: reentradas
    v_total := v_total + v_quantidade;
  end loop;

  update public.entradas_estoque e set total_unidades = v_total, total_custo_centavos = case when v_tem_custo then v_total_custo end
  where e.id = v_entrada;
  return jsonb_build_object('id', v_entrada, 'numero', v_numero, 'repetida', false, 'reentradas', v_total_reentradas); -- R1
end;
$$;

revoke all on function public.estoque_entradas(uuid, bigint, int), public.estoque_entrada(uuid, uuid, bigint) from public, anon;
grant execute on function public.estoque_entradas(uuid, bigint, int), public.estoque_entrada(uuid, uuid, bigint) to authenticated;
