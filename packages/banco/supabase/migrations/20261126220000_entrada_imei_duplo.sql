-- Entrada de mercadoria: um aparelho pode ter IMEI principal e secundário, em um único item.
-- identificadores aceita o texto legado ou, só para aparelhos, {imei, imei2}.
-- A unicidade entre colunas continua no índice privado de identificadores, inclusive sob concorrência.

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
              'reentrada', s.id = any (i.reentradas))
              || case when s.imei2 is not null then jsonb_build_object('imei2', s.imei2) else '{}'::jsonb end order by x.ordem)
            from unnest(i.itens) with ordinality x (id, ordem)
            join public.itens_serializados s on s.id = x.id), '[]'::jsonb) end
        ) order by i.linha)
      from public.entrada_itens i
      join public.variantes v on v.id = i.variante_id
      where i.entrada_id = e.id), '[]'::jsonb))
  from public.entradas_estoque e
  where e.id = p_entrada;
$$;

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
  v_serial jsonb;
  v_id text;
  v_imei2 text;
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
      if jsonb_typeof(v_linha -> 'identificadores') is distinct from 'array' then
        raise exception 'Linha % (%): informe o IMEI/ICCID de cada unidade', v_n, v_variante.sku using errcode = '22023';
      end if;
      if jsonb_array_length(v_linha -> 'identificadores') = 0 then
        raise exception 'Linha % (%): informe o IMEI/ICCID de cada unidade', v_n, v_variante.sku using errcode = '22023';
      end if;
      v_quantidade := jsonb_array_length(v_linha -> 'identificadores');
      v_seriais := v_seriais + v_quantidade;
      if v_seriais > 500 then
        raise exception 'Até 500 aparelhos e chips por entrada: divida em mais de uma' using errcode = '22023';
      end if;
      for v_serial in select value from jsonb_array_elements(v_linha -> 'identificadores') loop
        v_imei2 := null;
        if jsonb_typeof(v_serial) = 'string' then
          -- Um texto continua sendo uma unidade, como nos clientes antigos.
          v_id := regexp_replace(v_serial #>> '{}', '[^0-9]', '', 'g');
        elsif v_tipo_item = 'aparelho' and jsonb_typeof(v_serial) = 'object'
             and jsonb_typeof(v_serial -> 'imei') = 'string' and jsonb_typeof(v_serial -> 'imei2') = 'string' then
          v_id := v_serial ->> 'imei';
          v_imei2 := v_serial ->> 'imei2';
          if not privado.imei_valido(v_imei2) then
            raise exception 'Linha % (%): IMEI 2 inválido', v_n, v_variante.sku using errcode = '22023';
          end if;
          if v_id = v_imei2 or v_imei2 = any (v_vistos) then
            raise exception 'IMEI % repetido nesta entrada', v_imei2 using errcode = '22023';
          end if;
          v_vistos := v_vistos || v_imei2;
        else
          raise exception 'Linha % (%): identificador inválido; par IMEI só vale para aparelho', v_n, v_variante.sku using errcode = '22023';
        end if;
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
          if v_imei2 is not null and exists (
            select 1 from privado.identificadores_itens i
            where i.organizacao_id = v_unidade.organizacao_id and i.identificador = v_imei2
          ) then
            raise exception 'IMEI % já cadastrado: confira a identidade original', v_imei2 using errcode = '23505';
          end if;
          v_item := privado.registrar_item_serializado(
            p_unidade, v_variante.id,
            case when v_tipo_item = 'aparelho' then v_id end, v_imei2,
            case when v_tipo_item = 'chip' then v_id end,
            v_mov, format('entrada:%s:%s', v_entrada, v_id), (select auth.uid()), v_condicao, null);
        else
          if v_achado.imei is distinct from v_id and v_achado.iccid is distinct from v_id then
            raise exception 'IMEI % é o segundo IMEI de um aparelho já cadastrado: informe o IMEI principal', v_id using errcode = '23505';
          end if;
          if v_imei2 is not null and v_achado.imei2 is distinct from v_imei2 then
            raise exception 'IMEI % não é o segundo IMEI da identidade cadastrada: confira a etiqueta original', v_imei2 using errcode = '23505';
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
