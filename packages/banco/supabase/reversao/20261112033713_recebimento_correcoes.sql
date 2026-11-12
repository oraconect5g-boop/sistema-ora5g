-- Reversão de 20261112033713_recebimento_correcoes (só em banco sem dados reais).
-- Voltam os textos de estoque_registrar_entrada (20261111141337_entrada_estoque) e de validar_movimento
-- (20261109193043_transferencias_e_defeitos); saem as funções de leitura e as auxiliares, o índice, a coluna das
-- reentradas, a restrição da auditoria por custo e a leitura por coluna (volta a leitura da tabela inteira).
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
      return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true);
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
    select * into v_variante from public.variantes v where v.id = (v_linha ->> 'variante')::uuid and v.organizacao_id = v_unidade.organizacao_id and v.ativa;
    if not found then
      raise exception 'Linha %: variação inativa ou de outra rede', v_n using errcode = '22023';
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
        if exists (select 1 from public.itens_serializados i
                   where i.organizacao_id = v_unidade.organizacao_id and v_id in (i.imei, i.imei2, i.iccid)) then
          raise exception 'IMEI/ICCID % já cadastrado: use a transferência, a devolução ou o ajuste, não uma entrada nova', v_id using errcode = '23505';
        end if;
        v_item := privado.registrar_item_serializado(
          p_unidade, v_variante.id,
          case when v_tipo_item = 'aparelho' then v_id end, null,
          case when v_tipo_item = 'chip' then v_id end,
          v_mov, format('entrada:%s:%s', v_entrada, v_id), (select auth.uid()), v_condicao, null);
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
    insert into public.entrada_itens (entrada_id, linha, organizacao_id, variante_id, quantidade, custo_unitario_centavos, condicao, itens)
    values (v_entrada, v_n, v_unidade.organizacao_id, v_variante.id, v_quantidade, v_custo, v_condicao, v_itens);
    v_total := v_total + v_quantidade;
  end loop;

  update public.entradas_estoque e set total_unidades = v_total, total_custo_centavos = case when v_tem_custo then v_total_custo end
  where e.id = v_entrada;
  return jsonb_build_object('id', v_entrada, 'numero', v_numero, 'repetida', false);
end;
$$;

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
      if item.unidade_id <> new.unidade_id and new.tipo not in ('transferencia_entrada', 'devolucao') then
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

drop function if exists public.estoque_entradas(uuid, bigint, int);
drop function if exists public.estoque_entrada(uuid, uuid, bigint);
drop function if exists privado.entrada_em_json(uuid, boolean, boolean);
drop function if exists privado.item_so_teve_recebimentos(uuid);
drop function if exists privado.item_saiu_por_estorno_de_entrada(uuid);
drop index if exists public.entradas_estoque_unidade_numero;

drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (
    (unidade_id is not null and (select public.tem_permissao('auditoria.ver', unidade_id)))
    or (
      unidade_id is null
      and organizacao_id is not null
      and organizacao_id in (select privado.organizacoes_com_permissao('auditoria.ver'))
    )
  );

revoke select on public.entradas_estoque, public.entrada_itens from authenticated;
grant select on public.entradas_estoque, public.entrada_itens to authenticated;
alter table public.entrada_itens drop constraint if exists entrada_itens_reentradas_nos_itens;
alter table public.entrada_itens drop column if exists reentradas;
