-- =============================================================================
-- Correções do importador do catálogo (lote R2: achados REV-NOV-002, REV-NOV-006, REV-NOV-007 e REV-NOV-008 e a
-- observação REV-NOV-003 da revisão integral de 11/11/2026; ORA-CAT-006, ORA-CAT-007)
--
--   * Identidade normalizada: categoria, marca e SKU passam a ser únicos sem diferença de maiúsculas também
--     no banco (índices sobre lower), para qualquer escritor. Duplicatas que existirem são só RENOMEADAS
--     ("(duplicada 2)", "-DUP2"), com auditoria: nada é apagado e nenhum vínculo muda.
--   * Protocolo de travas comum: aplicar e desfazer pegam, nesta ordem, a trava da rede para importações, a
--     linha da importação, as travas consultivas do cadastro (nomes de categoria e marca das linhas a criar e
--     preço geral das variações cujo preço muda) e só então as linhas das variações a atualizar (for no key
--     update, em ordem de id). São as mesmas travas do cadastro manual, do preço manual e da entrada.
--   * Prévia desatualizada: cada linha guarda o estado do cadastro com que foi comparada (base) e a importação
--     guarda a versão da comparação. Aplicar exige a versão conferida e refaz a comparação sob as travas: se
--     qualquer linha mudou (inclusive as "sem mudança"), nada é aplicado, a comparação nova fica gravada e a
--     conferência recomeça. A aplicação grava só as diferenças conferidas.
--   * Desfazer por identidade: a aplicação guarda o preço e o custo que criou e o último evento de auditoria da
--     variação. Desfazer só volta o que ainda é do lote: preço e custo vigentes que são as próprias linhas do
--     lote, campos sem alteração posterior (mesmo que tenham voltado ao mesmo valor) e variação criada sem uso
--     e sem trabalho posterior. O resultado diz, por linha, o que voltou e o que ficou, e por quê.
--   * Conferência integral: os totais saem de uma função só e as linhas passam a ser lidas por página pela
--     tela (a leitura direta já era por RLS); nada muda na permissão.
--   * Teto de travas: prévia e aplicação recusam o arquivo que exigiria mais de 2.500 travas consultivas
--     (categorias e marcas diferentes nas linhas a criar mais variações com preço a mudar).
--   * Preço manual que esperou a importação: o preço que o lote (ou outro preço manual) acabou de gravar não é
--     mais confundido com mudança agendada; quem esperou recebe "tente de novo" em vez de "cancele o agendado".
-- importacao_catalogo_previa, importacao_aplicar e importacao_desfazer recriadas a partir do texto aplicado em
-- 20261111135906_importacao_catalogo, e preco_definir a partir de 20261111133804_precos_e_campanhas, com as
-- mudanças marcadas "R2".
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Identidade normalizada de categoria, marca e SKU (REV-NOV-006)
-- -----------------------------------------------------------------------------

-- Renomeia o que for duplicado sem diferença de maiúsculas: fica com o nome a linha mais antiga; as demais
-- ganham um sufixo livre. Nada é apagado, nenhum produto muda de categoria ou marca e a política de desconto
-- de cada categoria continua nela. A auditoria automática registra cada troca com o motivo abaixo. Fica no
-- banco (sem acesso pela API) para a prova: o teste cria as duplicatas, chama e confere.
create or replace function privado.reconciliar_identidades_do_catalogo()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_linha record;
  v_n int;
  v_sufixo text;
  v_novo text;
  v_categorias int := 0;
  v_marcas int := 0;
  v_variantes int := 0;
begin
  perform set_config('ora.motivo', 'Reconciliação de nomes equivalentes (R2)', true);

  for v_linha in
    select d.id, d.organizacao_id, d.nome
    from (select c.id, c.organizacao_id, c.nome,
                 row_number() over (partition by c.organizacao_id, lower(c.nome) order by c.criado_em, c.id) as ordem
          from public.categorias c) d
    where d.ordem > 1
    order by d.organizacao_id, lower(d.nome), d.ordem
  loop
    v_n := 1;
    loop
      v_n := v_n + 1;
      v_sufixo := format(' (duplicada %s)', v_n);
      v_novo := rtrim(left(v_linha.nome, 60 - length(v_sufixo))) || v_sufixo;
      exit when not exists (select 1 from public.categorias c where c.organizacao_id = v_linha.organizacao_id and lower(c.nome) = lower(v_novo));
    end loop;
    update public.categorias c set nome = v_novo where c.id = v_linha.id;
    v_categorias := v_categorias + 1;
  end loop;

  for v_linha in
    select d.id, d.organizacao_id, d.nome
    from (select m.id, m.organizacao_id, m.nome,
                 row_number() over (partition by m.organizacao_id, lower(m.nome) order by m.criado_em, m.id) as ordem
          from public.marcas m) d
    where d.ordem > 1
    order by d.organizacao_id, lower(d.nome), d.ordem
  loop
    v_n := 1;
    loop
      v_n := v_n + 1;
      v_sufixo := format(' (duplicada %s)', v_n);
      v_novo := rtrim(left(v_linha.nome, 60 - length(v_sufixo))) || v_sufixo;
      exit when not exists (select 1 from public.marcas m where m.organizacao_id = v_linha.organizacao_id and lower(m.nome) = lower(v_novo));
    end loop;
    update public.marcas m set nome = v_novo where m.id = v_linha.id;
    v_marcas := v_marcas + 1;
  end loop;

  for v_linha in
    select d.id, d.organizacao_id, d.sku
    from (select v.id, v.organizacao_id, v.sku,
                 row_number() over (partition by v.organizacao_id, lower(v.sku) order by v.criado_em, v.id) as ordem
          from public.variantes v) d
    where d.ordem > 1
    order by d.organizacao_id, lower(d.sku), d.ordem
  loop
    v_n := 1;
    loop
      v_n := v_n + 1;
      v_sufixo := '-DUP' || v_n;
      v_novo := left(v_linha.sku, 60 - length(v_sufixo)) || v_sufixo;
      exit when not exists (select 1 from public.variantes v where v.organizacao_id = v_linha.organizacao_id and lower(v.sku) = lower(v_novo));
    end loop;
    update public.variantes v set sku = v_novo where v.id = v_linha.id;
    v_variantes := v_variantes + 1;
  end loop;

  return jsonb_build_object('categorias', v_categorias, 'marcas', v_marcas, 'variantes', v_variantes);
end;
$$;

select privado.reconciliar_identidades_do_catalogo();

-- A unicidade que o cadastro manual já conferia sob trava passa a valer no banco, para qualquer escritor.
create unique index categorias_nome_normalizado on public.categorias (organizacao_id, lower(nome));
create unique index marcas_nome_normalizado on public.marcas (organizacao_id, lower(nome));
create unique index variantes_sku_normalizado on public.variantes (organizacao_id, lower(sku));
-- O importador procura o modelo pelo nome a cada linha a criar: com 2.000 linhas, a busca precisa de índice.
create index produtos_nome_normalizado on public.produtos (organizacao_id, lower(nome));

-- -----------------------------------------------------------------------------
-- 2. O que a prévia e a aplicação passam a guardar (REV-NOV-002, REV-NOV-007)
-- -----------------------------------------------------------------------------

-- comparacao: versão da comparação com o cadastro (sobe quando a comparação refeita dá outro resultado);
-- comparado_em: quando foi refeita; desfazer: resultado do desfazer (linhas desfeitas, parciais e mantidas).
alter table public.importacoes
  add column comparacao int not null default 1 check (comparacao >= 1),
  add column comparado_em timestamptz,
  add column desfazer jsonb;

-- erros_arquivo: os erros que só dependem do arquivo (os do cadastro são recalculados a cada comparação);
-- base: o estado do cadastro com que a linha foi comparada; preco_id, custo_id e auditoria_id: o preço e o
-- custo que a aplicação criou e o último evento de auditoria da variação ao aplicar; desfeito: o que o
-- desfazer voltou e o que manteve nesta linha.
alter table public.importacao_linhas
  add column erros_arquivo text[] not null default '{}',
  add column base jsonb,
  add column preco_id uuid references public.precos (id),
  add column custo_id uuid references public.custos (id),
  add column auditoria_id bigint,
  add column desfeito jsonb;

create index importacao_linhas_preco on public.importacao_linhas (preco_id);
create index importacao_linhas_custo on public.importacao_linhas (custo_id);
-- A aplicação marca o último evento de auditoria de cada variação e o desfazer procura os posteriores: as duas
-- leituras entram pelo índice que já existe, auditoria_alvo (alvo_tipo, alvo_id, ocorrido_em), e só olham os
-- eventos daquela variação.

-- Importações que já existem. Os erros do arquivo são os erros gravados menos os dois que dependem do cadastro;
-- a base fica nula, e por isso a primeira tentativa de aplicar uma prévia antiga refaz a comparação e pede nova
-- conferência. Nas aplicadas, o preço e o custo do lote são achados pelo motivo e pela referência que a
-- aplicação gravou; sem achar, ficam nulos e o desfazer mantém o valor (nunca volta o que não sabe ser do lote).
update public.importacao_linhas l
set erros_arquivo = coalesce((select array_agg(e.erro order by e.ordem)
                              from unnest(l.erros) with ordinality as e (erro, ordem)
                              where e.erro not like 'Código de barras já está no SKU %' and e.erro not like 'O SKU já existe como %'), '{}')
where cardinality(l.erros) > 0;

update public.importacao_linhas l
set preco_id = (select p.id from public.precos p
                where p.variante_id = l.variante_id and p.unidade_id is null and p.canal = 'loja' and p.origem = 'importacao'
                  and p.motivo like format('Importação nº %s: %%', i.numero)
                order by p.inicio desc, p.id limit 1),
    custo_id = (select c.id from public.custos c
                where c.variante_id = l.variante_id and c.origem = 'importacao'
                  and c.referencia = format('importacao:%s:%s', i.numero, l.numero)
                order by c.inicio desc, c.id limit 1),
    auditoria_id = coalesce((select max(a.id) from public.auditoria a
                             where a.alvo_tipo = 'variantes' and a.alvo_id = l.variante_id::text
                               and a.motivo like format('Importação nº %s: %%', i.numero)), 0)
from public.importacoes i
where i.id = l.importacao_id and i.situacao in ('aplicada', 'desfeita') and l.depois is not null;

-- -----------------------------------------------------------------------------
-- 3. Auxiliares: custo vigente, troca de preço que devolve a linha criada, totais e comparação
-- -----------------------------------------------------------------------------

-- O custo vigente com a linha inteira: o desfazer precisa saber SE a linha vigente é a do lote. O desempate
-- por id deixa a escolha determinística. custo_atual (só o valor) continua como está: a entrada a usa.
create or replace function privado.custo_vigente(p_variante uuid)
returns public.custos
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.custos c where c.variante_id = p_variante order by c.inicio desc, c.criado_em desc, c.id desc limit 1;
$$;

-- A mesma troca do preço geral de 20261111135906, agora devolvendo o id do preço que criou (nulo quando o
-- valor já era o pedido ou quando só fechou): é a identidade que o desfazer confere. O tipo devolvido muda,
-- por isso a função é removida e criada de novo; o corpo é o aplicado, com as mudanças marcadas "R2".
drop function privado.trocar_preco_geral(uuid, uuid, bigint, text);
create function privado.trocar_preco_geral(p_organizacao uuid, p_variante uuid, p_valor bigint, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_aberto public.precos;
  v_agora timestamptz := clock_timestamp();
  v_id uuid; -- R2
begin
  perform privado.travar_preco(p_organizacao, p_variante, null, 'loja');
  if exists (select 1 from public.precos p where p.variante_id = p_variante and p.unidade_id is null and p.canal = 'loja'
               and p.origem <> 'campanha' and p.cancelado_em is null and p.inicio > v_agora) then
    raise exception 'Há mudança de preço agendada para uma das variações: cancele antes de importar' using errcode = 'OR022';
  end if;
  v_aberto := privado.preco_geral_aberto(p_variante);
  if v_aberto.id is not null then
    if v_aberto.valor_centavos = p_valor then
      return null; -- R2
    end if;
    if v_aberto.inicio >= v_agora then
      raise exception 'Outro preço começou neste mesmo instante: tente de novo' using errcode = '40001';
    end if;
    update public.precos p set fim = v_agora where p.id = v_aberto.id;
  end if;
  if p_valor is not null then
    insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, criado_por, motivo)
    values (p_organizacao, p_variante, null, 'loja', p_valor, v_agora, 'importacao', (select auth.uid()), p_motivo)
    returning id into v_id; -- R2
  end if;
  return v_id; -- R2
end;
$$;

-- Os totais do lote num lugar só (prévia, comparação refeita e tela). Categoria e marca "novas" saem da base
-- gravada em cada linha: é o que a pessoa confere.
create or replace function privado.importacao_totais(p_importacao uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'linhas', count(*),
      'criar', count(*) filter (where l.acao = 'criar'),
      'atualizar', count(*) filter (where l.acao = 'atualizar'),
      'sem_mudanca', count(*) filter (where l.acao = 'sem_mudanca'),
      'erro', count(*) filter (where l.acao = 'erro'),
      'categorias_novas', count(distinct lower(l.dados ->> 'categoria'))
                            filter (where l.acao = 'criar' and l.base ->> 'categoria_id' is null),
      'marcas_novas', count(distinct lower(l.dados ->> 'marca'))
                        filter (where l.acao = 'criar' and l.dados ->> 'marca' is not null and l.base ->> 'marca_id' is null))
  from public.importacao_linhas l where l.importacao_id = p_importacao;
$$;

-- O teto de travas consultivas de uma aplicação. Além da trava da rede, a aplicação pega uma por nome de
-- categoria e uma por nome de marca das linhas a criar (as chaves do cadastro manual) e uma por variação cujo
-- preço muda (a chave do preço manual). A tabela de travas do banco é uma só para todas as sessões: no
-- ora5g-dev ela guarda 4.800 objetos (max_locks_per_transaction 64 x 75 processos), e 2.700 travas numa
-- transação foram conferidas lá em 12/11/2026. Sem teto, 2.000 linhas a criar, cada uma com a sua categoria
-- e a sua marca, pediriam 4.000. Com o teto de 2.500:
--   * as 2.000 linhas de um arquivo, todas com preço a mudar, passam sempre (2.000 travas, como no desfazer);
--   * só é recusado o arquivo cujas linhas a criar trazem mais de 500 nomes de categoria e marca diferentes
--     (quase sempre coluna trocada no envio); a saída é dividir a planilha, e cada parte é uma importação.
-- A mensagem vem de quem chama: a prévia fala do arquivo e a aplicação fala da prévia.
create or replace function privado.importacao_conferir_travas(p_importacao uuid, p_mensagem text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(distinct lower(l.dados ->> 'categoria')) filter (where l.acao = 'criar')
           + count(distinct lower(l.dados ->> 'marca')) filter (where l.acao = 'criar')
           + count(*) filter (where l.acao = 'atualizar' and l.diferencas ? 'preco')
      from public.importacao_linhas l where l.importacao_id = p_importacao) > 2500 then
    raise exception using message = p_mensagem, errcode = '22023';
  end if;
end;
$$;

-- Compara uma linha do arquivo (já normalizada, como a prévia grava em "dados") com o cadastro de agora.
-- Devolve a variação achada pelo SKU, a ação sem olhar os erros do arquivo (criar, atualizar ou sem_mudanca),
-- os erros que dependem do cadastro, as diferenças e a BASE: o estado do cadastro que entrou na comparação.
--   * SKU que não existe: a base diz a categoria, a marca e o modelo que seriam usados (nulo = seria criado);
--   * SKU que existe: a base guarda só o que o arquivo traz (nome; cor, capacidade e código de barras quando
--     vêm; preço geral e custo vigentes, com o id da linha, quando vêm).
-- A prévia grava a base; aplicar compara de novo sob as travas e só segue se nada mudou. As regras e os textos
-- são os da prévia de 20261111135906; é nova a recusa de modelo novo em categoria inativa (o cadastro manual
-- já exigia categoria ativa).
create or replace function privado.importacao_comparar(
  p_organizacao uuid, p_dados jsonb,
  out o_variante uuid, out o_acao text, out o_erros text[], out o_diferencas jsonb, out o_base jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sku text := coalesce(p_dados ->> 'sku', '');
  v_nome text := p_dados ->> 'nome';
  v_tipo text := p_dados ->> 'tipo';
  v_codigo text := p_dados ->> 'codigo_barras';
  v_cor text := p_dados ->> 'cor';
  v_capacidade text := p_dados ->> 'capacidade';
  v_preco bigint := (p_dados ->> 'preco')::bigint;
  v_custo bigint := (p_dados ->> 'custo')::bigint;
  v_variante public.variantes;
  v_categoria public.categorias;
  v_marca uuid;
  v_produto uuid;
  v_tipo_atual text;
  v_conflito text;
  v_preco_atual public.precos;
  v_custo_atual public.custos;
begin
  o_erros := '{}';
  o_diferencas := '{}'::jsonb;
  if v_sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$' then
    select * into v_variante from public.variantes v where v.organizacao_id = p_organizacao and lower(v.sku) = lower(v_sku);
  end if;

  if v_variante.id is null then
    o_acao := 'criar';
    if v_codigo is not null then
      select v.sku into v_conflito from public.variantes v where v.organizacao_id = p_organizacao and v.codigo_barras = v_codigo;
      if v_conflito is not null then
        o_erros := o_erros || format('Código de barras já está no SKU %s', v_conflito);
      end if;
    end if;
    select * into v_categoria from public.categorias c
    where c.organizacao_id = p_organizacao and lower(c.nome) = lower(p_dados ->> 'categoria');
    if p_dados ->> 'marca' is not null then
      select m.id into v_marca from public.marcas m where m.organizacao_id = p_organizacao and lower(m.nome) = lower(p_dados ->> 'marca');
    end if;
    -- O modelo é o ativo mais antigo com este nome e tipo; o id desempata. A aplicação procura igual.
    select p.id into v_produto from public.produtos p
    where p.organizacao_id = p_organizacao and lower(p.nome) = lower(p_dados ->> 'produto') and p.tipo = v_tipo and p.ativo
    order by p.criado_em, p.id limit 1;
    if v_produto is null and v_categoria.id is not null and not v_categoria.ativa then
      o_erros := o_erros || format('A categoria %s está inativa: reative no cadastro antes de importar', v_categoria.nome);
    end if;
    o_base := jsonb_build_object('categoria_id', v_categoria.id, 'marca_id', v_marca, 'produto_id', v_produto);
    return;
  end if;

  o_variante := v_variante.id;
  select p.tipo into v_tipo_atual from public.produtos p where p.id = v_variante.produto_id;
  if v_tipo is not null and v_tipo_atual <> v_tipo then
    o_erros := o_erros || format('O SKU já existe como %s: o tipo não muda pela importação', v_tipo_atual);
  end if;
  if v_codigo is not null then
    select v.sku into v_conflito from public.variantes v
    where v.organizacao_id = p_organizacao and v.codigo_barras = v_codigo and v.id <> v_variante.id;
    if v_conflito is not null then
      o_erros := o_erros || format('Código de barras já está no SKU %s', v_conflito);
    end if;
  end if;
  o_base := jsonb_build_object('nome', v_variante.nome);
  if v_nome is not null and v_variante.nome <> v_nome then
    o_diferencas := o_diferencas || jsonb_build_object('nome', jsonb_build_array(v_variante.nome, v_nome));
  end if;
  if v_cor is not null then
    o_base := o_base || jsonb_build_object('cor', v_variante.cor);
    if v_variante.cor is distinct from v_cor then
      o_diferencas := o_diferencas || jsonb_build_object('cor', jsonb_build_array(v_variante.cor, v_cor));
    end if;
  end if;
  if v_capacidade is not null then
    o_base := o_base || jsonb_build_object('capacidade', v_variante.capacidade);
    if v_variante.capacidade is distinct from v_capacidade then
      o_diferencas := o_diferencas || jsonb_build_object('capacidade', jsonb_build_array(v_variante.capacidade, v_capacidade));
    end if;
  end if;
  if v_codigo is not null then
    o_base := o_base || jsonb_build_object('codigo_barras', v_variante.codigo_barras);
    if v_variante.codigo_barras is distinct from v_codigo then
      o_diferencas := o_diferencas || jsonb_build_object('codigo_barras', jsonb_build_array(v_variante.codigo_barras, v_codigo));
    end if;
  end if;
  if v_preco is not null then
    v_preco_atual := privado.preco_geral_aberto(v_variante.id);
    o_base := o_base || jsonb_build_object('preco', v_preco_atual.valor_centavos, 'preco_id', v_preco_atual.id);
    if v_preco_atual.valor_centavos is distinct from v_preco then
      o_diferencas := o_diferencas || jsonb_build_object('preco', jsonb_build_array(v_preco_atual.valor_centavos, v_preco));
    end if;
  end if;
  if v_custo is not null then
    v_custo_atual := privado.custo_vigente(v_variante.id);
    o_base := o_base || jsonb_build_object('custo', v_custo_atual.valor_centavos, 'custo_id', v_custo_atual.id);
    if v_custo_atual.valor_centavos is distinct from v_custo then
      o_diferencas := o_diferencas || jsonb_build_object('custo', jsonb_build_array(v_custo_atual.valor_centavos, v_custo));
    end if;
  end if;
  o_acao := case when o_diferencas = '{}'::jsonb then 'sem_mudanca' else 'atualizar' end;
end;
$$;

-- Refaz a comparação de uma prévia com o cadastro de agora e grava só as linhas que mudaram. Se alguma mudou,
-- os totais são refeitos e a prévia ganha outro número de comparação: quem conferiu a anterior confere de novo
-- antes de aplicar. Prévia gravada antes desta migration (sem base) é refeita uma vez. Quem chama já tem a
-- linha da importação travada.
create or replace function privado.importacao_recomparar(p_importacao uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organizacao uuid;
  v_mudadas int;
begin
  select i.organizacao_id into v_organizacao from public.importacoes i where i.id = p_importacao;
  if v_organizacao is null then
    return false;
  end if;
  with nova as (
    select l.numero, c.o_variante, c.o_diferencas, c.o_base, l.erros_arquivo || c.o_erros as erros,
           case when cardinality(l.erros_arquivo || c.o_erros) > 0 then 'erro' else c.o_acao end as acao
    from public.importacao_linhas l
    cross join lateral privado.importacao_comparar(v_organizacao, l.dados) c
    where l.importacao_id = p_importacao
  )
  update public.importacao_linhas l
  set acao = n.acao, erros = n.erros, diferencas = n.o_diferencas, variante_id = n.o_variante, base = n.o_base
  from nova n
  where l.importacao_id = p_importacao and l.numero = n.numero
    and (l.base is null or l.acao <> n.acao or l.erros <> n.erros or l.diferencas <> n.o_diferencas
         or l.variante_id is distinct from n.o_variante or l.base <> n.o_base);
  get diagnostics v_mudadas = row_count;
  if v_mudadas = 0 then
    return false;
  end if;
  perform set_config('ora.motivo', 'Comparação da prévia refeita: o cadastro mudou depois dela', true);
  update public.importacoes i
  set totais = privado.importacao_totais(p_importacao), comparacao = i.comparacao + 1, comparado_em = now()
  where i.id = p_importacao;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Prévia: a comparação com o cadastro sai para privado.importacao_comparar
-- -----------------------------------------------------------------------------
-- R2 (REV-NOV-002): cada linha guarda os erros do arquivo separados dos que dependem do cadastro e a base da
-- comparação. Reenviar o mesmo arquivo com o mesmo mapeamento refaz a comparação da prévia que já existe
-- ("atualizada" diz se alguma linha mudou) em vez de devolver a antiga como estava. A validação do arquivo
-- não mudou.
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
  v_aplicada bigint; -- R2
  v_id uuid;
  v_numero bigint;
  v_linha jsonb;
  v_n int;
  v_erros text[];
  v_sku text; v_nome text; v_produto text; v_tipo text; v_categoria text; v_marca text;
  v_codigo text; v_cor text; v_capacidade text; v_preco bigint; v_custo bigint;
  v_skus jsonb := '{}'::jsonb;
  v_codigos jsonb := '{}'::jsonb;
  v_totais jsonb;
  v_dados jsonb; -- R2
  v_comp record; -- R2
  v_atualizada boolean; -- R2
  v_demais constant text := 'O arquivo traz categorias e marcas diferentes demais para uma importação só: divida a planilha em partes'; -- R2
begin
  if p_organizacao is null or p_organizacao not in (select privado.organizacoes_com_permissao('importacao.executar')) then
    raise exception 'Sem permissão para importar nesta rede' using errcode = '42501';
  end if;
  if p_arquivo_nome is null or length(trim(p_arquivo_nome)) not between 1 and 200 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_mapeamento) is distinct from 'object' then
    raise exception 'Dados do arquivo inválidos' using errcode = '22023';
  end if;
  -- Até 2.000 linhas por arquivo: cada chamada cabe com folga no limite de 8 s da API. R2, medido com 2.000
  -- linhas num PostgreSQL 17 local (concorrencia.test.ts): prévia 0,4 s, aplicação 1,1 s e desfazer 1,7 s no
  -- pior caso (tudo muda: nome, cor, código de barras, preço e custo). Planilha maior vai em partes.
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 2000 then
    raise exception 'O arquivo precisa ter de 1 a 2.000 linhas' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('importacoes', p_organizacao, p_sha256));
  -- R2: a prévia que já existe é lida primeiro e com a linha travada. Quem chega durante uma aplicação espera
  -- por ela e, na leitura seguinte, já encontra o arquivo aplicado.
  select * into v_existente from public.importacoes i
  where i.organizacao_id = p_organizacao and i.tipo = 'catalogo' and i.arquivo_sha256 = p_sha256 and i.situacao = 'previa'
    and i.mapeamento = p_mapeamento
  order by i.criado_em desc limit 1
  for update;
  select i.numero into v_aplicada from public.importacoes i
  where i.organizacao_id = p_organizacao and i.tipo = 'catalogo' and i.arquivo_sha256 = p_sha256 and i.situacao = 'aplicada';
  if found then
    raise exception 'Este arquivo já foi aplicado (importação nº %)', v_aplicada using errcode = 'OR023';
  end if;
  if v_existente.id is not null then
    -- R2: a prévia repetida volta comparada com o cadastro de agora.
    v_atualizada := privado.importacao_recomparar(v_existente.id);
    perform privado.importacao_conferir_travas(v_existente.id, v_demais);
    select i.totais into v_totais from public.importacoes i where i.id = v_existente.id;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true,
                              'atualizada', v_atualizada, 'totais', v_totais);
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

    -- R2: o que depende do cadastro (SKU que já existe, código de barras em outro SKU, diferenças) é comparado
    -- por privado.importacao_comparar, a mesma função que aplicar chama de novo sob as travas.
    v_dados := jsonb_build_object(
        'sku', nullif(v_sku, ''), 'nome', nullif(v_nome, ''), 'produto', nullif(v_produto, ''), 'tipo', v_tipo,
        'categoria', nullif(v_categoria, ''), 'marca', v_marca, 'codigo_barras', v_codigo, 'cor', v_cor, 'capacidade', v_capacidade,
        'preco', v_preco, 'custo', v_custo);
    select * into v_comp from privado.importacao_comparar(p_organizacao, v_dados);
    insert into public.importacao_linhas (importacao_id, numero, dados, acao, erros_arquivo, erros, diferencas, variante_id, base)
    values (v_id, v_n, v_dados, case when cardinality(v_erros || v_comp.o_erros) > 0 then 'erro' else v_comp.o_acao end,
            v_erros, v_erros || v_comp.o_erros, v_comp.o_diferencas, v_comp.o_variante, v_comp.o_base);
  end loop;

  -- R2: prévia que a aplicação não conseguiria travar não é gravada (ver privado.importacao_conferir_travas).
  perform privado.importacao_conferir_travas(v_id, v_demais);
  v_totais := privado.importacao_totais(v_id); -- R2
  update public.importacoes i set totais = v_totais where i.id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false, 'atualizada', false, 'totais', v_totais);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Aplicação: versão conferida, travas comuns e comparação refeita antes de gravar (REV-NOV-002, REV-NOV-006)
-- -----------------------------------------------------------------------------
-- A assinatura ganha a versão da comparação que a pessoa conferiu. A função de dois argumentos sai: ninguém
-- aplica sem dizer o que conferiu. Respostas:
--   * repetida: a importação já estava aplicada (nada é feito de novo);
--   * atualizada: nada foi aplicado, porque a comparação conferida não é mais a vigente (outra pessoa a refez
--     ou o cadastro mudou e ela foi refeita agora). A comparação nova fica gravada: conferir e aplicar de novo;
--   * nenhuma das duas: aplicada agora.
drop function public.importacao_aplicar(uuid, text);
create function public.importacao_aplicar(p_importacao uuid, p_motivo text, p_comparacao int)
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
  v_chave text; -- R2
  v_alvo uuid; -- R2
  v_ativa boolean; -- R2
  v_novos uuid[] := '{}'; -- R2: categorias, marcas e modelos que este lote criou
  v_preco_id uuid; -- R2
  v_custo_id uuid; -- R2
  v_mudou constant text := 'O cadastro mudou enquanto a importação era aplicada: tente de novo'; -- R2
begin
  -- R2: a permissão é conferida antes de qualquer trava; depois vêm a trava da rede (aplicar e desfazer da mesma
  -- rede não se cruzam) e só então a linha da importação.
  select * into v_imp from public.importacoes i where i.id = p_importacao;
  if not found or v_imp.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Importação não encontrada para você' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('importacoes', v_imp.organizacao_id, 'catalogo'));
  select * into v_imp from public.importacoes i where i.id = p_importacao for update;
  if v_imp.situacao = 'aplicada' then
    return jsonb_build_object('repetida', true, 'atualizada', false, 'comparacao', v_imp.comparacao, 'totais', v_imp.totais);
  end if;
  if v_imp.situacao <> 'previa' then
    raise exception 'Esta importação já foi encerrada (%)', v_imp.situacao using errcode = '22023';
  end if;
  if v_imp.criado_por = (select auth.uid()) then
    raise exception 'Quem gerou a prévia não aprova: outra pessoa confere e aplica' using errcode = 'OR024';
  end if;
  if exists (select 1 from public.importacoes i where i.organizacao_id = v_imp.organizacao_id and i.tipo = v_imp.tipo
               and i.arquivo_sha256 = v_imp.arquivo_sha256 and i.situacao = 'aplicada') then
    raise exception 'Este arquivo já foi aplicado' using errcode = 'OR023';
  end if;
  -- R2: sem a versão conferida não se aplica; versão antiga volta para a conferência sem gravar nada.
  if p_comparacao is null then
    raise exception 'Informe a comparação conferida' using errcode = '22023';
  end if;
  if p_comparacao <> v_imp.comparacao then
    return jsonb_build_object('repetida', false, 'atualizada', true, 'comparacao', v_imp.comparacao, 'totais', v_imp.totais);
  end if;
  -- R2: o teto de travas é conferido antes de pegar a primeira (a prévia já recusa; aqui vale para a comparação
  -- que foi refeita depois dela).
  perform privado.importacao_conferir_travas(v_imp.id,
    'A prévia traz categorias e marcas diferentes demais para uma importação só: divida a planilha em partes');

  -- R2: travas do cadastro, sempre na mesma ordem. Nomes de categoria e de marca das linhas a criar (as mesmas
  -- chaves do cadastro manual), preço geral das variações cujo preço muda (a mesma trava do preço manual) e,
  -- por último, as linhas das variações a atualizar, em ordem de id.
  for v_chave in select distinct lower(l.dados ->> 'categoria') from public.importacao_linhas l
                 where l.importacao_id = v_imp.id and l.acao = 'criar' and l.dados ->> 'categoria' is not null order by 1 loop
    perform pg_advisory_xact_lock(privado.trava_da_chave('categorias', v_imp.organizacao_id, v_chave));
  end loop;
  for v_chave in select distinct lower(l.dados ->> 'marca') from public.importacao_linhas l
                 where l.importacao_id = v_imp.id and l.acao = 'criar' and l.dados ->> 'marca' is not null order by 1 loop
    perform pg_advisory_xact_lock(privado.trava_da_chave('marcas', v_imp.organizacao_id, v_chave));
  end loop;
  for v_alvo in select l.variante_id from public.importacao_linhas l
                where l.importacao_id = v_imp.id and l.acao = 'atualizar' and l.diferencas ? 'preco' order by l.variante_id loop
    perform privado.travar_preco(v_imp.organizacao_id, v_alvo, null, 'loja');
  end loop;
  perform 1 from public.variantes v
  where v.id in (select l.variante_id from public.importacao_linhas l where l.importacao_id = v_imp.id and l.acao = 'atualizar')
  order by v.id
  for no key update;

  -- R2: com tudo travado, a comparação é refeita linha a linha (também as "sem mudança"). Qualquer diferença
  -- em relação ao que foi conferido devolve a prévia para a conferência, já com a comparação nova gravada.
  if privado.importacao_recomparar(v_imp.id) then
    select * into v_imp from public.importacoes i where i.id = v_imp.id;
    return jsonb_build_object('repetida', false, 'atualizada', true, 'comparacao', v_imp.comparacao, 'totais', v_imp.totais);
  end if;
  if exists (select 1 from public.importacao_linhas l where l.importacao_id = v_imp.id and l.acao = 'erro') then
    raise exception 'A prévia tem linhas com erro: corrija o arquivo e gere outra prévia' using errcode = '22023';
  end if;

  v_rotulo := format('Importação nº %s: %s', v_imp.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  for v_linha in select * from public.importacao_linhas l where l.importacao_id = v_imp.id and l.acao in ('criar', 'atualizar') order by l.numero loop
    v_d := v_linha.dados;
    v_preco_id := null;
    v_custo_id := null;
    if v_linha.acao = 'criar' then
      -- Categoria e marca pelo nome (sem diferença de maiúsculas); as que faltam nascem com a política de desconto desligada.
      -- R2: a linha achada fica travada (for share) e tem de ser a da comparação conferida ou uma criada por este
      -- lote; se não for, o cadastro mudou no meio do caminho e nada é aplicado.
      select c.id, c.ativa into v_categoria, v_ativa from public.categorias c
      where c.organizacao_id = v_imp.organizacao_id and lower(c.nome) = lower(v_d ->> 'categoria')
      for share;
      if v_categoria is distinct from (v_linha.base ->> 'categoria_id')::uuid and (v_categoria is null or not (v_categoria = any (v_novos))) then
        raise exception using message = v_mudou, errcode = '40001';
      end if;
      if v_categoria is null then
        insert into public.categorias (organizacao_id, nome) values (v_imp.organizacao_id, v_d ->> 'categoria') returning id into v_categoria;
        v_novos := v_novos || v_categoria;
        v_ativa := true;
      end if;
      v_marca := null;
      if v_d ->> 'marca' is not null then
        select m.id into v_marca from public.marcas m
        where m.organizacao_id = v_imp.organizacao_id and lower(m.nome) = lower(v_d ->> 'marca')
        for share;
        if v_marca is distinct from (v_linha.base ->> 'marca_id')::uuid and (v_marca is null or not (v_marca = any (v_novos))) then
          raise exception using message = v_mudou, errcode = '40001';
        end if;
        if v_marca is null then
          insert into public.marcas (organizacao_id, nome) values (v_imp.organizacao_id, v_d ->> 'marca') returning id into v_marca;
          v_novos := v_novos || v_marca;
        end if;
      end if;
      -- Produto (modelo) pelo nome e tipo: as cores e capacidades do mesmo modelo ficam juntas.
      select p.id into v_produto from public.produtos p
      where p.organizacao_id = v_imp.organizacao_id and lower(p.nome) = lower(v_d ->> 'produto') and p.tipo = v_d ->> 'tipo' and p.ativo
      order by p.criado_em, p.id limit 1
      for share;
      if v_produto is distinct from (v_linha.base ->> 'produto_id')::uuid and (v_produto is null or not (v_produto = any (v_novos))) then
        raise exception using message = v_mudou, errcode = '40001';
      end if;
      if v_produto is null then
        if not v_ativa then -- R2: a categoria foi inativada depois da comparação
          raise exception using message = v_mudou, errcode = '40001';
        end if;
        insert into public.produtos (organizacao_id, tipo, nome, categoria_id, marca_id)
        values (v_imp.organizacao_id, v_d ->> 'tipo', v_d ->> 'produto', v_categoria, v_marca) returning id into v_produto;
        v_novos := v_novos || v_produto;
      end if;
      if exists (select 1 from public.variantes v where v.organizacao_id = v_imp.organizacao_id and lower(v.sku) = lower(v_d ->> 'sku')) then
        raise exception using message = v_mudou, errcode = '40001'; -- R2: o SKU nasceu depois da comparação
      end if;
      insert into public.variantes (organizacao_id, produto_id, sku, nome, cor, capacidade, codigo_barras)
      values (v_imp.organizacao_id, v_produto, v_d ->> 'sku', v_d ->> 'nome', v_d ->> 'cor', v_d ->> 'capacidade', v_d ->> 'codigo_barras')
      returning * into v_variante;
      v_antes := null;
      v_preco_antes := null;
      v_custo_antes := null;
      if v_d ->> 'preco' is not null then
        -- R2: a variação nasceu nesta transação e ninguém mais a vê: o preço entra direto, sem a trava do preço
        -- (um arquivo de 2.000 SKUs novos não ocupa 2.000 travas).
        insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, criado_por, motivo)
        values (v_imp.organizacao_id, v_variante.id, null, 'loja', (v_d ->> 'preco')::bigint, clock_timestamp(), 'importacao',
                (select auth.uid()), v_rotulo)
        returning id into v_preco_id;
      end if;
    else
      -- R2: a linha da variação está travada desde antes da comparação refeita; só entram as diferenças conferidas.
      select * into v_variante from public.variantes v where v.id = v_linha.variante_id;
      v_preco_antes := (privado.preco_geral_aberto(v_variante.id)).valor_centavos;
      v_custo_antes := (privado.custo_vigente(v_variante.id)).valor_centavos;
      v_antes := jsonb_build_object('nome', v_variante.nome, 'cor', v_variante.cor, 'capacidade', v_variante.capacidade,
        'codigo_barras', v_variante.codigo_barras, 'preco', v_preco_antes, 'custo', v_custo_antes);
      if v_linha.diferencas ?| array['nome', 'cor', 'capacidade', 'codigo_barras'] then
        update public.variantes v set
          nome = case when v_linha.diferencas ? 'nome' then v_d ->> 'nome' else v.nome end,
          cor = case when v_linha.diferencas ? 'cor' then v_d ->> 'cor' else v.cor end,
          capacidade = case when v_linha.diferencas ? 'capacidade' then v_d ->> 'capacidade' else v.capacidade end,
          codigo_barras = case when v_linha.diferencas ? 'codigo_barras' then v_d ->> 'codigo_barras' else v.codigo_barras end
        where v.id = v_variante.id
        returning * into v_variante;
      end if;
      if v_linha.diferencas ? 'preco' then
        v_preco_id := privado.trocar_preco_geral(v_imp.organizacao_id, v_variante.id, (v_d ->> 'preco')::bigint, v_rotulo);
      end if;
    end if;
    if v_d ->> 'custo' is not null and (v_linha.acao = 'criar' or v_linha.diferencas ? 'custo') then
      insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
      values (v_imp.organizacao_id, v_variante.id, (v_d ->> 'custo')::bigint, clock_timestamp(), 'importacao',
              format('importacao:%s:%s', v_imp.numero, v_linha.numero), (select auth.uid()))
      returning id into v_custo_id;
    end if;
    v_depois := jsonb_build_object('nome', v_variante.nome, 'cor', v_variante.cor, 'capacidade', v_variante.capacidade,
      'codigo_barras', v_variante.codigo_barras,
      'preco', case when v_preco_id is not null then (v_d ->> 'preco')::bigint else v_preco_antes end,
      'custo', case when v_custo_id is not null then (v_d ->> 'custo')::bigint else v_custo_antes end);
    -- R2: a linha guarda a identidade do que o lote criou (preço e custo) e o último evento de auditoria da
    -- variação neste instante: é com isso que o desfazer separa o que é do lote do que veio depois.
    update public.importacao_linhas l
    set variante_id = v_variante.id, antes = v_antes, depois = v_depois, preco_id = v_preco_id, custo_id = v_custo_id,
        auditoria_id = coalesce((select max(a.id) from public.auditoria a
                                 where a.alvo_tipo = 'variantes' and a.alvo_id = v_variante.id::text), 0)
    where l.importacao_id = v_imp.id and l.numero = v_linha.numero;
  end loop;

  update public.importacoes i set situacao = 'aplicada', aplicado_por = (select auth.uid()), aplicado_em = now(), motivo = v_motivo
  where i.id = v_imp.id;
  return jsonb_build_object('repetida', false, 'atualizada', false, 'comparacao', v_imp.comparacao, 'totais', v_imp.totais);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Desfazer por identidade (REV-NOV-007 e observação REV-NOV-003)
-- -----------------------------------------------------------------------------
-- O contrato do desfazer, linha a linha:
--   * variação CRIADA pelo lote: sai de circulação (inativa, com o preço do lote fechado) só se ninguém a usou
--     (estoque, reserva, venda, IMEI) e ninguém trabalhou nela depois (edição do cadastro, outro preço, outro
--     custo). Se não, fica como está, com o motivo: em_uso ou alterada_depois;
--   * variação ATUALIZADA: cada campo volta só se o valor ainda é o do lote e não houve edição posterior do
--     campo (mesmo que tenha voltado ao mesmo valor); o preço volta só se o preço geral aberto ainda é a linha
--     que o lote criou; o custo volta só se o custo vigente ainda é a linha que o lote criou e havia custo
--     antes. O que fica diz o motivo: alterado_depois, codigo_em_uso, sem_custo_anterior ou sem_identidade
--     (lote antigo cujo preço ou custo não pôde ser identificado);
--   * categorias, marcas e modelos criados pelo lote ficam: outros cadastros podem já depender deles.
-- Cada linha guarda o que voltou e o que ficou (desfeito) e a importação guarda as contagens (desfazer):
-- desfeitas (tudo voltou), parciais (parte voltou) e mantidas (nada voltou).
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
  v_parciais int := 0; -- R2
  v_mantidas int := 0;
  v_campo text;
  v_rotulo text;
  v_preco_atual public.precos;
  v_alvo uuid; -- R2
  v_marco bigint; -- R2: último evento de auditoria da variação quando o lote foi aplicado
  v_revertidos text[]; -- R2
  v_mantidos jsonb; -- R2
  v_resultado jsonb; -- R2
begin
  -- R2: permissão, trava da rede e só então a linha da importação (a mesma ordem de aplicar).
  select * into v_imp from public.importacoes i where i.id = p_importacao;
  if not found or v_imp.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Importação não encontrada para você' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('importacoes', v_imp.organizacao_id, 'catalogo'));
  select * into v_imp from public.importacoes i where i.id = p_importacao for update;
  if v_imp.situacao = 'desfeita' then
    return jsonb_build_object('repetida', true) || coalesce(v_imp.desfazer, '{}'::jsonb);
  end if;
  if v_imp.situacao <> 'aplicada' then
    raise exception 'Só se desfaz importação aplicada' using errcode = '22023';
  end if;

  -- R2: as travas de aplicar, na mesma ordem: preço geral das variações cujo preço o lote criou e, depois, as
  -- linhas das variações do lote, em ordem de id.
  for v_alvo in select l.variante_id from public.importacao_linhas l
                where l.importacao_id = v_imp.id and l.depois is not null and l.preco_id is not null order by l.variante_id loop
    perform privado.travar_preco(v_imp.organizacao_id, v_alvo, null, 'loja');
  end loop;
  perform 1 from public.variantes v
  where v.id in (select l.variante_id from public.importacao_linhas l where l.importacao_id = v_imp.id and l.depois is not null)
  order by v.id
  for no key update;

  v_rotulo := format('Desfaz a importação nº %s: %s', v_imp.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);

  for v_linha in select * from public.importacao_linhas l where l.importacao_id = v_imp.id and l.depois is not null order by l.numero desc loop
    select * into v_variante from public.variantes v where v.id = v_linha.variante_id;
    v_preco_atual := privado.preco_geral_aberto(v_variante.id);
    v_marco := coalesce(v_linha.auditoria_id, 0);
    v_revertidos := '{}';
    v_mantidos := '{}'::jsonb;
    if v_linha.antes is null then
      -- Criada pela importação: sai de circulação se ninguém usou; o preço que ela abriu é fechado.
      -- R2: e só se ninguém trabalhou nela depois (edição, outro preço ou outro custo).
      if privado.variante_usada(v_variante.id) then
        v_mantidos := jsonb_build_object('variacao', 'em_uso');
      elsif exists (select 1 from public.auditoria a
                    where a.alvo_tipo = 'variantes' and a.alvo_id = v_variante.id::text and a.id > v_marco)
            or exists (select 1 from public.precos p where p.variante_id = v_variante.id and p.id is distinct from v_linha.preco_id)
            or exists (select 1 from public.custos c where c.variante_id = v_variante.id and c.id is distinct from v_linha.custo_id)
            or (v_linha.preco_id is not null and v_preco_atual.id is distinct from v_linha.preco_id) then
        v_mantidos := jsonb_build_object('variacao', 'alterada_depois');
      else
        if v_preco_atual.id is not null then
          perform privado.trocar_preco_geral(v_imp.organizacao_id, v_variante.id, null, v_rotulo);
        end if;
        update public.variantes v set ativa = false where v.id = v_variante.id and v.ativa;
        v_revertidos := array['variacao'];
      end if;
    else
      -- Atualizada: volta cada campo que ainda está como a importação deixou.
      -- R2: "como a importação deixou" é por identidade: sem evento de auditoria posterior que tenha mexido no
      -- campo, e com o preço e o custo vigentes sendo as próprias linhas que o lote criou.
      foreach v_campo in array array['nome', 'cor', 'capacidade', 'codigo_barras'] loop
        if (v_linha.antes -> v_campo) is distinct from (v_linha.depois -> v_campo) then
          if (to_jsonb(v_variante) -> v_campo) is distinct from (v_linha.depois -> v_campo)
             or exists (select 1 from public.auditoria a
                        where a.alvo_tipo = 'variantes' and a.alvo_id = v_variante.id::text and a.id > v_marco
                          and (a.antes -> v_campo) is distinct from (a.depois -> v_campo)) then
            v_mantidos := v_mantidos || jsonb_build_object(v_campo, 'alterado_depois');
          elsif v_campo = 'codigo_barras' and v_linha.antes ->> 'codigo_barras' is not null and exists (
                  select 1 from public.variantes x where x.organizacao_id = v_imp.organizacao_id
                    and x.codigo_barras = v_linha.antes ->> 'codigo_barras' and x.id <> v_variante.id) then
            v_mantidos := v_mantidos || jsonb_build_object(v_campo, 'codigo_em_uso');
          else
            execute format('update public.variantes set %I = $1 where id = $2', v_campo) using v_linha.antes ->> v_campo, v_variante.id;
            v_revertidos := v_revertidos || v_campo;
          end if;
        end if;
      end loop;
      if v_linha.preco_id is not null then
        if v_preco_atual.id is distinct from v_linha.preco_id then
          v_mantidos := v_mantidos || jsonb_build_object('preco', 'alterado_depois');
        else
          perform privado.trocar_preco_geral(v_imp.organizacao_id, v_variante.id, (v_linha.antes ->> 'preco')::bigint, v_rotulo);
          v_revertidos := v_revertidos || 'preco'::text;
        end if;
      elsif (v_linha.antes -> 'preco') is distinct from (v_linha.depois -> 'preco') then
        v_mantidos := v_mantidos || jsonb_build_object('preco', 'sem_identidade');
      end if;
      if v_linha.custo_id is not null then
        if (privado.custo_vigente(v_variante.id)).id is distinct from v_linha.custo_id then
          v_mantidos := v_mantidos || jsonb_build_object('custo', 'alterado_depois');
        elsif v_linha.antes ->> 'custo' is null then
          v_mantidos := v_mantidos || jsonb_build_object('custo', 'sem_custo_anterior');
        else
          insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
          values (v_imp.organizacao_id, v_variante.id, (v_linha.antes ->> 'custo')::bigint, clock_timestamp(), 'manual',
                  format('desfaz:importacao:%s:%s', v_imp.numero, v_linha.numero), (select auth.uid()));
          v_revertidos := v_revertidos || 'custo'::text;
        end if;
      elsif (v_linha.antes -> 'custo') is distinct from (v_linha.depois -> 'custo') then
        v_mantidos := v_mantidos || jsonb_build_object('custo', 'sem_identidade');
      end if;
    end if;
    -- R2: o resultado da linha. Nada voltou = mantida; tudo voltou = desfeita; parte voltou = parcial.
    v_resultado := jsonb_build_object(
      'situacao', case when cardinality(v_revertidos) = 0 then 'mantida' when v_mantidos = '{}'::jsonb then 'desfeita' else 'parcial' end,
      'revertidos', to_jsonb(v_revertidos), 'mantidos', v_mantidos);
    update public.importacao_linhas l set desfeito = v_resultado where l.importacao_id = v_imp.id and l.numero = v_linha.numero;
    case v_resultado ->> 'situacao'
      when 'desfeita' then v_desfeitas := v_desfeitas + 1;
      when 'parcial' then v_parciais := v_parciais + 1;
      else v_mantidas := v_mantidas + 1;
    end case;
  end loop;

  v_resultado := jsonb_build_object('desfeitas', v_desfeitas, 'parciais', v_parciais, 'mantidas', v_mantidas);
  update public.importacoes i
  set situacao = 'desfeita', encerrado_por = (select auth.uid()), encerrado_em = now(), motivo = v_motivo, desfazer = v_resultado
  where i.id = v_imp.id;
  return jsonb_build_object('repetida', false) || v_resultado;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Preço manual que esperou outra mudança de preço
-- -----------------------------------------------------------------------------
-- O preço manual usa o início da própria transação como "agora". Quando ele espera a trava do preço atrás de
-- uma importação (ou de um desfazer, ou de outro preço manual) que acabou de gravar um preço, esse preço
-- começa DEPOIS do "agora" de quem esperou e era tomado por mudança agendada: o dono recebia "Já há mudança de
-- preço agendada para <este minuto>: cancele antes de agendar outra", sem haver nada agendado nem o que
-- cancelar (provado com duas conexões em concorrencia.test.ts). Agendada é só a mudança que ainda não começou
-- pelo relógio; a que começou enquanto se esperava cai na resposta que a função já tinha para isso, "Outro
-- preço começou neste mesmo instante: tente de novo" (40001), e a nova tentativa entra por cima normalmente.
-- O texto é o aplicado em 20261111133804_precos_e_campanhas, com a única mudança marcada "R2"; as permissões
-- de execução continuam as que a função já tinha.
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
    and p.origem <> 'campanha' and p.cancelado_em is null and p.inicio > clock_timestamp() -- R2: era now()
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

-- -----------------------------------------------------------------------------
-- 8. Quem executa: as funções novas ou recriadas nascem abertas e são fechadas aqui. A prévia, o desfazer e o
--    preço manual (create or replace) mantêm as permissões que já tinham.
-- -----------------------------------------------------------------------------
revoke all on function privado.reconciliar_identidades_do_catalogo(), privado.custo_vigente(uuid),
  privado.trocar_preco_geral(uuid, uuid, bigint, text), privado.importacao_totais(uuid), privado.importacao_conferir_travas(uuid, text),
  privado.importacao_comparar(uuid, jsonb), privado.importacao_recomparar(uuid)
  from public, anon, authenticated;
revoke all on function public.importacao_aplicar(uuid, text, integer) from public, anon;
grant execute on function public.importacao_aplicar(uuid, text, integer) to authenticated;
