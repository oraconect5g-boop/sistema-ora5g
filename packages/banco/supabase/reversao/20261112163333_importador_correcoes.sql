-- Reversão de 20261112163333_importador_correcoes (só em banco sem dados reais).
-- Voltam os textos de trocar_preco_geral, importacao_catalogo_previa, importacao_aplicar (dois argumentos) e
-- importacao_desfazer aplicados em 20261111135906_importacao_catalogo; saem a aplicação com a versão conferida,
-- as funções auxiliares, os índices sem diferença de maiúsculas e os das identidades e as colunas
-- da comparação, das identidades e do resultado do desfazer.
-- Os nomes que a reconciliação mudou (duplicados que só diferiam por maiúsculas) ficam como estão: são dados.
-- preco_definir volta ao texto aplicado em 20261111133804_precos_e_campanhas (mudança agendada medida pelo
-- início da transação).
drop function if exists public.importacao_aplicar(uuid, text, integer);
drop function if exists privado.importacao_recomparar(uuid);
drop function if exists privado.importacao_comparar(uuid, jsonb);
drop function if exists privado.importacao_totais(uuid);
drop function if exists privado.importacao_conferir_travas(uuid, text);
drop function if exists privado.custo_vigente(uuid);
drop function if exists privado.reconciliar_identidades_do_catalogo();
drop function if exists privado.trocar_preco_geral(uuid, uuid, bigint, text);

create or replace function privado.trocar_preco_geral(p_organizacao uuid, p_variante uuid, p_valor bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_aberto public.precos;
  v_agora timestamptz := clock_timestamp();
begin
  perform privado.travar_preco(p_organizacao, p_variante, null, 'loja');
  if exists (select 1 from public.precos p where p.variante_id = p_variante and p.unidade_id is null and p.canal = 'loja'
               and p.origem <> 'campanha' and p.cancelado_em is null and p.inicio > v_agora) then
    raise exception 'Há mudança de preço agendada para uma das variações: cancele antes de importar' using errcode = 'OR022';
  end if;
  v_aberto := privado.preco_geral_aberto(p_variante);
  if v_aberto.id is not null then
    if v_aberto.valor_centavos = p_valor then
      return;
    end if;
    if v_aberto.inicio >= v_agora then
      raise exception 'Outro preço começou neste mesmo instante: tente de novo' using errcode = '40001';
    end if;
    update public.precos p set fim = v_agora where p.id = v_aberto.id;
  end if;
  if p_valor is not null then
    insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, criado_por, motivo)
    values (p_organizacao, p_variante, null, 'loja', p_valor, v_agora, 'importacao', (select auth.uid()), p_motivo);
  end if;
end;
$$;

create or replace function public.importacao_catalogo_previa(
  p_organizacao uuid, p_arquivo_nome text, p_sha256 text, p_mapeamento jsonb, p_linhas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existente public.importacoes;
  v_id uuid;
  v_numero bigint;
  v_linha jsonb;
  v_n int;
  v_erros text[];
  v_acao text;
  v_dif jsonb;
  v_variante public.variantes;
  v_tipo_atual text;
  v_sku text; v_nome text; v_produto text; v_tipo text; v_categoria text; v_marca text;
  v_codigo text; v_cor text; v_capacidade text; v_preco bigint; v_custo bigint;
  v_preco_atual bigint; v_custo_atual bigint;
  v_skus jsonb := '{}'::jsonb;
  v_codigos jsonb := '{}'::jsonb;
  v_totais jsonb;
  v_conflito text;
begin
  if p_organizacao is null or p_organizacao not in (select privado.organizacoes_com_permissao('importacao.executar')) then
    raise exception 'Sem permissão para importar nesta rede' using errcode = '42501';
  end if;
  if p_arquivo_nome is null or length(trim(p_arquivo_nome)) not between 1 and 200 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_mapeamento) is distinct from 'object' then
    raise exception 'Dados do arquivo inválidos' using errcode = '22023';
  end if;
  -- Até 2.000 linhas por arquivo: a prévia e a aplicação cabem com folga no limite de 8 s por chamada da API
  -- (medido: 3.000 linhas aplicadas em 3 s num PostgreSQL 17 local). Planilha maior vai em partes.
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 2000 then
    raise exception 'O arquivo precisa ter de 1 a 2.000 linhas' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('importacoes', p_organizacao, p_sha256));
  select * into v_existente from public.importacoes i
  where i.organizacao_id = p_organizacao and i.tipo = 'catalogo' and i.arquivo_sha256 = p_sha256 and i.situacao = 'aplicada';
  if found then
    raise exception 'Este arquivo já foi aplicado (importação nº %)', v_existente.numero using errcode = 'OR023';
  end if;
  select * into v_existente from public.importacoes i
  where i.organizacao_id = p_organizacao and i.tipo = 'catalogo' and i.arquivo_sha256 = p_sha256 and i.situacao = 'previa'
    and i.mapeamento = p_mapeamento
  order by i.criado_em desc limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true, 'totais', v_existente.totais);
  end if;

  perform set_config('ora.motivo', 'Prévia de importação do arquivo ' || trim(p_arquivo_nome), true);
  insert into public.importacoes (organizacao_id, arquivo_nome, arquivo_sha256, mapeamento, criado_por)
  values (p_organizacao, trim(p_arquivo_nome), p_sha256, p_mapeamento, (select auth.uid()))
  returning id, numero into v_id, v_numero;

  for v_linha in select e from jsonb_array_elements(p_linhas) e loop
    if jsonb_typeof(v_linha) <> 'object' or coalesce(v_linha ->> 'numero', '') !~ '^[0-9]{1,6}$' or (v_linha ->> 'numero')::int < 2 then
      raise exception 'Linha do arquivo em formato inválido' using errcode = '22023';
    end if;
    v_n := (v_linha ->> 'numero')::int;
    v_erros := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(v_linha -> 'erros') = 'array' then v_linha -> 'erros' else '[]'::jsonb end)), '{}');
    v_sku := trim(coalesce(v_linha ->> 'sku', ''));
    v_nome := regexp_replace(trim(coalesce(v_linha ->> 'nome', '')), '\s+', ' ', 'g');
    v_produto := coalesce(nullif(regexp_replace(trim(coalesce(v_linha ->> 'produto', '')), '\s+', ' ', 'g'), ''), v_nome);
    v_tipo := v_linha ->> 'tipo';
    v_categoria := regexp_replace(trim(coalesce(v_linha ->> 'categoria', '')), '\s+', ' ', 'g');
    v_marca := nullif(regexp_replace(trim(coalesce(v_linha ->> 'marca', '')), '\s+', ' ', 'g'), '');
    v_codigo := nullif(regexp_replace(coalesce(v_linha ->> 'codigo_barras', ''), '\s', '', 'g'), '');
    v_cor := nullif(trim(coalesce(v_linha ->> 'cor', '')), '');
    v_capacidade := nullif(trim(coalesce(v_linha ->> 'capacidade', '')), '');
    v_preco := null;
    v_custo := null;

    if v_sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$' then
      v_erros := v_erros || 'SKU ausente ou inválido (letras, números, ponto, hífen, barra ou sublinhado, até 60)'::text;
    elsif v_skus ? lower(v_sku) then
      v_erros := v_erros || format('SKU repetido no arquivo (já na linha %s)', v_skus ->> lower(v_sku));
    else
      v_skus := v_skus || jsonb_build_object(lower(v_sku), v_n);
    end if;
    if length(v_nome) = 0 or length(v_nome) > 160 then
      v_erros := v_erros || 'Nome ausente ou longo demais (até 160)'::text;
    end if;
    if length(v_produto) > 120 then
      v_erros := v_erros || 'Nome do produto longo demais (até 120)'::text;
    end if;
    if v_tipo is null or v_tipo not in ('aparelho', 'acessorio', 'chip', 'ativacao', 'portabilidade', 'recarga', 'servico') then
      if not exists (select 1 from unnest(v_erros) x where x like 'Tipo desconhecido%') then
        v_erros := v_erros || 'Tipo ausente ou inválido'::text;
      end if;
    end if;
    if length(v_categoria) = 0 or length(v_categoria) > 60 then
      v_erros := v_erros || 'Categoria ausente ou longa demais (até 60)'::text;
    end if;
    if length(coalesce(v_marca, '')) > 60 or length(coalesce(v_cor, '')) > 40 or length(coalesce(v_capacidade, '')) > 40 then
      v_erros := v_erros || 'Marca (até 60), cor ou capacidade (até 40) longas demais'::text;
    end if;
    if v_codigo is not null then
      if v_codigo !~ '^[0-9]{8,14}$' then
        v_erros := v_erros || 'Código de barras inválido (8 a 14 dígitos)'::text;
      elsif v_codigos ? v_codigo then
        v_erros := v_erros || format('Código de barras repetido no arquivo (já na linha %s)', v_codigos ->> v_codigo);
      else
        v_codigos := v_codigos || jsonb_build_object(v_codigo, v_n);
      end if;
    end if;
    if v_linha ? 'preco' and jsonb_typeof(v_linha -> 'preco') <> 'null' then
      if jsonb_typeof(v_linha -> 'preco') <> 'number' or (v_linha ->> 'preco') !~ '^[0-9]{1,9}$' or (v_linha ->> 'preco')::bigint > 100000000 then
        v_erros := v_erros || 'Preço inválido'::text;
      else
        v_preco := (v_linha ->> 'preco')::bigint;
      end if;
    end if;
    if v_linha ? 'custo' and jsonb_typeof(v_linha -> 'custo') <> 'null' then
      if jsonb_typeof(v_linha -> 'custo') <> 'number' or (v_linha ->> 'custo') !~ '^[0-9]{1,9}$' or (v_linha ->> 'custo')::bigint > 100000000 then
        v_erros := v_erros || 'Custo inválido'::text;
      else
        v_custo := (v_linha ->> 'custo')::bigint;
      end if;
    end if;

    v_dif := '{}'::jsonb;
    v_variante := null;
    if v_sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$' then
      select * into v_variante from public.variantes v where v.organizacao_id = p_organizacao and lower(v.sku) = lower(v_sku);
    end if;
    if v_variante.id is null then
      v_acao := 'criar';
      if v_codigo is not null then
        select v.sku into v_conflito from public.variantes v where v.organizacao_id = p_organizacao and v.codigo_barras = v_codigo;
        if v_conflito is not null then
          v_erros := v_erros || format('Código de barras já está no SKU %s', v_conflito);
        end if;
        v_conflito := null;
      end if;
    else
      select p.tipo into v_tipo_atual from public.produtos p where p.id = v_variante.produto_id;
      if v_tipo is not null and v_tipo_atual <> v_tipo then
        v_erros := v_erros || format('O SKU já existe como %s: o tipo não muda pela importação', v_tipo_atual);
      end if;
      if v_codigo is not null then
        select v.sku into v_conflito from public.variantes v
        where v.organizacao_id = p_organizacao and v.codigo_barras = v_codigo and v.id <> v_variante.id;
        if v_conflito is not null then
          v_erros := v_erros || format('Código de barras já está no SKU %s', v_conflito);
        end if;
        v_conflito := null;
      end if;
      if v_nome <> '' and v_variante.nome <> v_nome then v_dif := v_dif || jsonb_build_object('nome', jsonb_build_array(v_variante.nome, v_nome)); end if;
      if v_cor is not null and v_variante.cor is distinct from v_cor then v_dif := v_dif || jsonb_build_object('cor', jsonb_build_array(v_variante.cor, v_cor)); end if;
      if v_capacidade is not null and v_variante.capacidade is distinct from v_capacidade then
        v_dif := v_dif || jsonb_build_object('capacidade', jsonb_build_array(v_variante.capacidade, v_capacidade));
      end if;
      if v_codigo is not null and v_variante.codigo_barras is distinct from v_codigo then
        v_dif := v_dif || jsonb_build_object('codigo_barras', jsonb_build_array(v_variante.codigo_barras, v_codigo));
      end if;
      if v_preco is not null then
        v_preco_atual := (privado.preco_geral_aberto(v_variante.id)).valor_centavos;
        if v_preco_atual is distinct from v_preco then v_dif := v_dif || jsonb_build_object('preco', jsonb_build_array(v_preco_atual, v_preco)); end if;
      end if;
      if v_custo is not null then
        v_custo_atual := privado.custo_atual(v_variante.id);
        if v_custo_atual is distinct from v_custo then v_dif := v_dif || jsonb_build_object('custo', jsonb_build_array(v_custo_atual, v_custo)); end if;
      end if;
      v_acao := case when v_dif = '{}'::jsonb then 'sem_mudanca' else 'atualizar' end;
    end if;
    if cardinality(v_erros) > 0 then
      v_acao := 'erro';
    end if;

    insert into public.importacao_linhas (importacao_id, numero, dados, acao, erros, diferencas, variante_id)
    values (v_id, v_n, jsonb_build_object(
        'sku', nullif(v_sku, ''), 'nome', nullif(v_nome, ''), 'produto', nullif(v_produto, ''), 'tipo', v_tipo,
        'categoria', nullif(v_categoria, ''), 'marca', v_marca, 'codigo_barras', v_codigo, 'cor', v_cor, 'capacidade', v_capacidade,
        'preco', v_preco, 'custo', v_custo),
      v_acao, v_erros, v_dif, v_variante.id);
  end loop;

  select jsonb_build_object(
      'linhas', count(*),
      'criar', count(*) filter (where l.acao = 'criar'),
      'atualizar', count(*) filter (where l.acao = 'atualizar'),
      'sem_mudanca', count(*) filter (where l.acao = 'sem_mudanca'),
      'erro', count(*) filter (where l.acao = 'erro'),
      'categorias_novas', (select count(distinct lower(x.dados ->> 'categoria')) from public.importacao_linhas x
                           where x.importacao_id = v_id and x.acao = 'criar'
                             and not exists (select 1 from public.categorias c where c.organizacao_id = p_organizacao and lower(c.nome) = lower(x.dados ->> 'categoria'))),
      'marcas_novas', (select count(distinct lower(x.dados ->> 'marca')) from public.importacao_linhas x
                       where x.importacao_id = v_id and x.acao = 'criar' and x.dados ->> 'marca' is not null
                         and not exists (select 1 from public.marcas m where m.organizacao_id = p_organizacao and lower(m.nome) = lower(x.dados ->> 'marca'))))
    into v_totais
  from public.importacao_linhas l where l.importacao_id = v_id;
  update public.importacoes i set totais = v_totais where i.id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false, 'totais', v_totais);
end;
$$;

create or replace function public.importacao_aplicar(p_importacao uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_imp public.importacoes;
  v_linha public.importacao_linhas;
  v_d jsonb;
  v_categoria uuid;
  v_marca uuid;
  v_produto uuid;
  v_variante public.variantes;
  v_antes jsonb;
  v_depois jsonb;
  v_preco_antes bigint;
  v_custo_antes bigint;
  v_rotulo text;
begin
  select * into v_imp from public.importacoes i where i.id = p_importacao for update;
  if not found or v_imp.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Importação não encontrada para você' using errcode = 'P0002';
  end if;
  if v_imp.situacao = 'aplicada' then
    return jsonb_build_object('repetida', true, 'totais', v_imp.totais);
  end if;
  if v_imp.situacao <> 'previa' then
    raise exception 'Esta importação já foi encerrada (%)', v_imp.situacao using errcode = '22023';
  end if;
  if v_imp.criado_por = (select auth.uid()) then
    raise exception 'Quem gerou a prévia não aprova: outra pessoa confere e aplica' using errcode = 'OR024';
  end if;
  if exists (select 1 from public.importacao_linhas l where l.importacao_id = v_imp.id and l.acao = 'erro') then
    raise exception 'A prévia tem linhas com erro: corrija o arquivo e gere outra prévia' using errcode = '22023';
  end if;
  if exists (select 1 from public.importacoes i where i.organizacao_id = v_imp.organizacao_id and i.tipo = v_imp.tipo
               and i.arquivo_sha256 = v_imp.arquivo_sha256 and i.situacao = 'aplicada') then
    raise exception 'Este arquivo já foi aplicado' using errcode = 'OR023';
  end if;

  v_rotulo := format('Importação nº %s: %s', v_imp.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  for v_linha in select * from public.importacao_linhas l where l.importacao_id = v_imp.id and l.acao in ('criar', 'atualizar') order by l.numero loop
    v_d := v_linha.dados;
    if v_linha.acao = 'criar' then
      -- Categoria e marca pelo nome (sem diferença de maiúsculas); as que faltam nascem com a política de desconto desligada.
      select c.id into v_categoria from public.categorias c where c.organizacao_id = v_imp.organizacao_id and lower(c.nome) = lower(v_d ->> 'categoria');
      if v_categoria is null then
        insert into public.categorias (organizacao_id, nome) values (v_imp.organizacao_id, v_d ->> 'categoria') returning id into v_categoria;
      end if;
      v_marca := null;
      if v_d ->> 'marca' is not null then
        select m.id into v_marca from public.marcas m where m.organizacao_id = v_imp.organizacao_id and lower(m.nome) = lower(v_d ->> 'marca');
        if v_marca is null then
          insert into public.marcas (organizacao_id, nome) values (v_imp.organizacao_id, v_d ->> 'marca') returning id into v_marca;
        end if;
      end if;
      -- Produto (modelo) pelo nome e tipo: as cores e capacidades do mesmo modelo ficam juntas.
      select p.id into v_produto from public.produtos p
      where p.organizacao_id = v_imp.organizacao_id and lower(p.nome) = lower(v_d ->> 'produto') and p.tipo = v_d ->> 'tipo' and p.ativo
      order by p.criado_em limit 1;
      if v_produto is null then
        insert into public.produtos (organizacao_id, tipo, nome, categoria_id, marca_id)
        values (v_imp.organizacao_id, v_d ->> 'tipo', v_d ->> 'produto', v_categoria, v_marca) returning id into v_produto;
      end if;
      if exists (select 1 from public.variantes v where v.organizacao_id = v_imp.organizacao_id and lower(v.sku) = lower(v_d ->> 'sku')) then
        raise exception 'O SKU % foi cadastrado depois da prévia: gere outra prévia', v_d ->> 'sku' using errcode = '23505';
      end if;
      insert into public.variantes (organizacao_id, produto_id, sku, nome, cor, capacidade, codigo_barras)
      values (v_imp.organizacao_id, v_produto, v_d ->> 'sku', v_d ->> 'nome', v_d ->> 'cor', v_d ->> 'capacidade', v_d ->> 'codigo_barras')
      returning * into v_variante;
      v_antes := null;
      v_preco_antes := null;
      v_custo_antes := null;
    else
      select * into v_variante from public.variantes v where v.id = v_linha.variante_id for update;
      v_preco_antes := (privado.preco_geral_aberto(v_variante.id)).valor_centavos;
      v_custo_antes := privado.custo_atual(v_variante.id);
      v_antes := jsonb_build_object('nome', v_variante.nome, 'cor', v_variante.cor, 'capacidade', v_variante.capacidade,
        'codigo_barras', v_variante.codigo_barras, 'preco', v_preco_antes, 'custo', v_custo_antes);
      update public.variantes v set
        nome = coalesce(v_d ->> 'nome', v.nome),
        cor = coalesce(v_d ->> 'cor', v.cor),
        capacidade = coalesce(v_d ->> 'capacidade', v.capacidade),
        codigo_barras = coalesce(v_d ->> 'codigo_barras', v.codigo_barras)
      where v.id = v_variante.id
      returning * into v_variante;
    end if;
    if v_d ->> 'preco' is not null and (v_d ->> 'preco')::bigint is distinct from v_preco_antes then
      perform privado.trocar_preco_geral(v_imp.organizacao_id, v_variante.id, (v_d ->> 'preco')::bigint, v_rotulo);
    end if;
    if v_d ->> 'custo' is not null and (v_d ->> 'custo')::bigint is distinct from v_custo_antes then
      insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
      values (v_imp.organizacao_id, v_variante.id, (v_d ->> 'custo')::bigint, clock_timestamp(), 'importacao',
              format('importacao:%s:%s', v_imp.numero, v_linha.numero), (select auth.uid()));
    end if;
    v_depois := jsonb_build_object('nome', v_variante.nome, 'cor', v_variante.cor, 'capacidade', v_variante.capacidade,
      'codigo_barras', v_variante.codigo_barras,
      'preco', coalesce((v_d ->> 'preco')::bigint, v_preco_antes), 'custo', coalesce((v_d ->> 'custo')::bigint, v_custo_antes));
    update public.importacao_linhas l set variante_id = v_variante.id, antes = v_antes, depois = v_depois
    where l.importacao_id = v_imp.id and l.numero = v_linha.numero;
  end loop;

  update public.importacoes i set situacao = 'aplicada', aplicado_por = (select auth.uid()), aplicado_em = now(), motivo = v_motivo
  where i.id = v_imp.id;
  return jsonb_build_object('repetida', false, 'totais', v_imp.totais);
end;
$$;

create or replace function public.importacao_desfazer(p_importacao uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_imp public.importacoes;
  v_linha public.importacao_linhas;
  v_variante public.variantes;
  v_desfeitas int := 0;
  v_mantidas int := 0;
  v_mudou boolean;
  v_campo text;
  v_rotulo text;
  v_preco_atual public.precos;
begin
  select * into v_imp from public.importacoes i where i.id = p_importacao for update;
  if not found or v_imp.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Importação não encontrada para você' using errcode = 'P0002';
  end if;
  if v_imp.situacao = 'desfeita' then
    return jsonb_build_object('repetida', true);
  end if;
  if v_imp.situacao <> 'aplicada' then
    raise exception 'Só se desfaz importação aplicada' using errcode = '22023';
  end if;
  v_rotulo := format('Desfaz a importação nº %s: %s', v_imp.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);

  for v_linha in select * from public.importacao_linhas l where l.importacao_id = v_imp.id and l.depois is not null order by l.numero desc loop
    select * into v_variante from public.variantes v where v.id = v_linha.variante_id for update;
    v_mudou := false;
    v_preco_atual := privado.preco_geral_aberto(v_variante.id);
    if v_linha.antes is null then
      -- Criada pela importação: sai de circulação se ninguém usou; o preço que ela abriu é fechado.
      if not privado.variante_usada(v_variante.id) then
        if v_preco_atual.id is not null and v_preco_atual.origem = 'importacao' then
          perform privado.trocar_preco_geral(v_imp.organizacao_id, v_variante.id, null, v_rotulo);
        end if;
        update public.variantes v set ativa = false where v.id = v_variante.id and v.ativa;
        v_mudou := true;
      end if;
    else
      -- Atualizada: volta cada campo que ainda está como a importação deixou.
      foreach v_campo in array array['nome', 'cor', 'capacidade', 'codigo_barras'] loop
        if (to_jsonb(v_variante) -> v_campo) is not distinct from (v_linha.depois -> v_campo)
           and (v_linha.antes -> v_campo) is distinct from (v_linha.depois -> v_campo) then
          if v_campo = 'codigo_barras' and v_linha.antes ->> 'codigo_barras' is not null and exists (
               select 1 from public.variantes x where x.organizacao_id = v_imp.organizacao_id
                 and x.codigo_barras = v_linha.antes ->> 'codigo_barras' and x.id <> v_variante.id) then
            continue;
          end if;
          execute format('update public.variantes set %I = $1 where id = $2', v_campo) using v_linha.antes ->> v_campo, v_variante.id;
          v_mudou := true;
        end if;
      end loop;
      if (v_linha.antes -> 'preco') is distinct from (v_linha.depois -> 'preco')
         and v_preco_atual.valor_centavos is not distinct from (v_linha.depois ->> 'preco')::bigint then
        perform privado.trocar_preco_geral(v_imp.organizacao_id, v_variante.id, (v_linha.antes ->> 'preco')::bigint, v_rotulo);
        v_mudou := true;
      end if;
      if (v_linha.antes -> 'custo') is distinct from (v_linha.depois -> 'custo') and v_linha.antes ->> 'custo' is not null
         and privado.custo_atual(v_variante.id) is not distinct from (v_linha.depois ->> 'custo')::bigint then
        insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
        values (v_imp.organizacao_id, v_variante.id, (v_linha.antes ->> 'custo')::bigint, clock_timestamp(), 'manual',
                format('desfaz:importacao:%s:%s', v_imp.numero, v_linha.numero), (select auth.uid()));
        v_mudou := true;
      end if;
    end if;
    if v_mudou then v_desfeitas := v_desfeitas + 1; else v_mantidas := v_mantidas + 1; end if;
  end loop;

  update public.importacoes i set situacao = 'desfeita', encerrado_por = (select auth.uid()), encerrado_em = now(), motivo = v_motivo
  where i.id = v_imp.id;
  return jsonb_build_object('repetida', false, 'desfeitas', v_desfeitas, 'mantidas', v_mantidas);
end;
$$;

revoke all on function privado.trocar_preco_geral(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.importacao_aplicar(uuid, text) from public, anon;
grant execute on function public.importacao_aplicar(uuid, text) to authenticated;

drop index if exists public.importacao_linhas_custo;
drop index if exists public.importacao_linhas_preco;
drop index if exists public.produtos_nome_normalizado;
drop index if exists public.variantes_sku_normalizado;
drop index if exists public.marcas_nome_normalizado;
drop index if exists public.categorias_nome_normalizado;

alter table public.importacao_linhas
  drop column if exists desfeito,
  drop column if exists auditoria_id,
  drop column if exists custo_id,
  drop column if exists preco_id,
  drop column if exists base,
  drop column if exists erros_arquivo;
alter table public.importacoes
  drop column if exists desfazer,
  drop column if exists comparado_em,
  drop column if exists comparacao;

create or replace function public.preco_definir(
  p_variante uuid, p_unidade uuid, p_canal text, p_valor bigint, p_inicio timestamptz, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_organizacao uuid;
  v_inicio timestamptz;
  v_aberto public.precos;
  v_tem_aberto boolean;
  v_agendado public.precos;
  v_id uuid;
begin
  select v.organizacao_id into v_organizacao from public.variantes v where v.id = p_variante and v.ativa;
  if v_organizacao is null or not privado.pode_alterar_preco(v_organizacao, p_unidade) then
    raise exception 'Variação não encontrada ou sem permissão para alterar este preço' using errcode = 'P0002';
  end if;
  if p_canal is null or p_canal not in ('loja', 'online') then
    raise exception 'Canal inválido' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 0 or p_valor > 100000000 then
    raise exception 'Preço inválido (de R$ 0,00 a R$ 1.000.000,00)' using errcode = '22023';
  end if;
  if p_inicio is not null and p_inicio < now() - interval '5 minutes' then
    raise exception 'O preço novo vale de agora em diante: a vigência não começa no passado' using errcode = '22023';
  end if;
  v_inicio := greatest(coalesce(p_inicio, now()), now());
  perform privado.travar_preco(v_organizacao, p_variante, p_unidade, p_canal);

  select * into v_agendado from public.precos p
  where p.variante_id = p_variante and p.unidade_id is not distinct from p_unidade and p.canal = p_canal
    and p.origem <> 'campanha' and p.cancelado_em is null and p.inicio > now()
  order by p.inicio desc limit 1;
  if found then
    if v_agendado.valor_centavos = p_valor and v_agendado.inicio = v_inicio then
      return jsonb_build_object('id', v_agendado.id, 'repetida', true);
    end if;
    raise exception 'Já há mudança de preço agendada para %: cancele antes de agendar outra',
      to_char(v_agendado.inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') using errcode = 'OR022';
  end if;

  select * into v_aberto from public.precos p
  where p.variante_id = p_variante and p.unidade_id is not distinct from p_unidade and p.canal = p_canal
    and p.origem <> 'campanha' and p.cancelado_em is null and p.fim is null
  for update;
  -- Guardado agora: o "perform" abaixo muda o FOUND.
  v_tem_aberto := found;
  if v_tem_aberto and v_aberto.valor_centavos = p_valor then
    return jsonb_build_object('id', v_aberto.id, 'repetida', true);
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  if v_tem_aberto then
    if v_aberto.inicio >= v_inicio then
      raise exception 'Outro preço começou neste mesmo instante: tente de novo' using errcode = '40001';
    end if;
    update public.precos p set fim = v_inicio where p.id = v_aberto.id;
  end if;
  insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, criado_por, motivo)
  values (v_organizacao, p_variante, p_unidade, p_canal, p_valor, v_inicio, 'manual', (select auth.uid()), v_motivo)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;
