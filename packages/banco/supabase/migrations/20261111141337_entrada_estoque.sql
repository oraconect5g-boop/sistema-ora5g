-- =============================================================================
-- Entrada de mercadoria: compra com fornecedor e carga inicial (lote L4a: ORA-INV-009, ORA-INV-004,
-- ORA-CAT-008)
--
-- Até aqui o estoque só entrava por semente ou função interna. Agora quem tem estoque.receber (dono e
-- gerente, permissão nova; o gerente na loja do turno) registra a entrada pela tela:
--   * compra (com fornecedor e o documento, por exemplo o número da nota) ou carga inicial (o estoque
--     que já existe na loja quando ela começa a usar o sistema);
--   * aparelho e chip entram um a um pelo IMEI/ICCID (validados e únicos); acessório por quantidade;
--     serviço não tem estoque;
--   * custo de entrada por linha: vira o custo atual da variação (o de vendas passadas não muda);
--   * tudo numa transação, com a chave do formulário: repetir não duplica; conteúdo diferente com a
--     mesma chave é recusado (OR004);
--   * estornar devolve tudo pelo livro (ajuste com motivo), só se cada item ainda estiver na loja e
--     livre (não vendido, reservado nem transferido). Nada se apaga.
-- Fornecedores: cadastro simples (nome, CNPJ opcional) por quem recebe mercadoria.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Entrada de mercadoria pela tela (ORA-INV-009): receber é da gerência da loja', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('estoque.receber', 'Registrar entrada de mercadoria (compra ou carga inicial) e estorná-la', 'estoque');
  insert into public.papel_permissoes (papel, permissao)
  values ('dono', 'estoque.receber'), ('gerente', 'estoque.receber');
end;
$$;

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (length(trim(nome)) between 2 and 120),
  cnpj text check (cnpj is null or privado.cnpj_valido(cnpj)),
  contato text check (contato is null or length(trim(contato)) between 3 and 200),
  ativo boolean not null default true,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  unique (id, organizacao_id)
);
create unique index fornecedores_nome on public.fornecedores (organizacao_id, lower(nome));
create unique index fornecedores_cnpj on public.fornecedores (organizacao_id, cnpj) where cnpj is not null;
create index fornecedores_criado_por on public.fornecedores (criado_por);
create trigger fornecedores_auditar after insert or update on public.fornecedores
  for each row execute function privado.auditar_mudanca();

create table public.entradas_estoque (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  tipo text not null check (tipo in ('compra', 'carga_inicial')),
  fornecedor_id uuid,
  documento text check (documento is null or length(trim(documento)) between 1 and 60),
  chave text not null check (length(trim(chave)) between 8 and 80),
  conteudo text not null,
  situacao text not null default 'registrada' check (situacao in ('registrada', 'estornada')),
  total_unidades int not null check (total_unidades > 0),
  total_custo_centavos bigint check (total_custo_centavos is null or total_custo_centavos >= 0),
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  estornado_por uuid references public.perfis_usuario (id),
  estornado_em timestamptz,
  motivo_estorno text check (motivo_estorno is null or length(trim(motivo_estorno)) >= 3),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (fornecedor_id, organizacao_id) references public.fornecedores (id, organizacao_id),
  constraint compra_tem_fornecedor check (tipo <> 'compra' or fornecedor_id is not null),
  constraint estorno_completo check ((situacao = 'estornada') = (estornado_em is not null and estornado_por is not null and motivo_estorno is not null)),
  unique (organizacao_id, chave)
);
create index entradas_estoque_unidade on public.entradas_estoque (unidade_id, criado_em desc);
create index entradas_estoque_fornecedor on public.entradas_estoque (fornecedor_id, organizacao_id);
create index entradas_estoque_criado_por on public.entradas_estoque (criado_por);
create index entradas_estoque_estornado_por on public.entradas_estoque (estornado_por);
create trigger entradas_estoque_auditar after insert or update on public.entradas_estoque
  for each row execute function privado.auditar_mudanca();

create table public.entrada_itens (
  entrada_id uuid not null references public.entradas_estoque (id),
  linha int not null check (linha between 1 and 200),
  organizacao_id uuid not null,
  variante_id uuid not null,
  quantidade int not null check (quantidade between 1 and 10000),
  custo_unitario_centavos bigint check (custo_unitario_centavos is null or custo_unitario_centavos between 0 and 100000000),
  condicao text not null check (condicao in ('novo', 'seminovo', 'avariado')),
  itens uuid[] not null default '{}',
  primary key (entrada_id, linha),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id)
);
create index entrada_itens_variante on public.entrada_itens (variante_id, organizacao_id);

alter table public.fornecedores enable row level security;
alter table public.entradas_estoque enable row level security;
alter table public.entrada_itens enable row level security;
revoke all on public.fornecedores, public.entradas_estoque, public.entrada_itens from anon, authenticated;
revoke all on sequence public.entradas_estoque_numero_seq from anon, authenticated;
grant select on public.fornecedores, public.entradas_estoque, public.entrada_itens to authenticated;
-- Fornecedor: a rede inteira lê (nome e CNPJ não são dado pessoal). Entrada: quem consulta o estoque da loja.
create policy fornecedores_ler on public.fornecedores for select to authenticated
  using (organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v));
create policy entradas_estoque_ler on public.entradas_estoque for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('estoque.consultar')));
create policy entrada_itens_ler on public.entrada_itens for select to authenticated
  using (entrada_id in (select e.id from public.entradas_estoque e));

-- -----------------------------------------------------------------------------
-- Fornecedor
-- -----------------------------------------------------------------------------
create or replace function public.fornecedor_salvar(p_organizacao uuid, p_id uuid, p_nome text, p_cnpj text, p_contato text, p_ativo boolean, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_contato text := nullif(trim(coalesce(p_contato, '')), '');
  v_atual public.fornecedores;
  v_id uuid;
begin
  if p_organizacao is null or not exists (
       select 1 from public.unidades u where u.organizacao_id = p_organizacao and u.id in (select privado.unidades_com_permissao('estoque.receber'))) then
    raise exception 'Sem permissão para cadastrar fornecedor nesta rede' using errcode = '42501';
  end if;
  if length(v_nome) not between 2 and 120 then
    raise exception 'Informe o nome do fornecedor (de 2 a 120 letras)' using errcode = '22023';
  end if;
  if v_cnpj is not null and not privado.cnpj_valido(v_cnpj) then
    raise exception 'CNPJ do fornecedor inválido' using errcode = '22023';
  end if;
  if v_contato is not null and length(v_contato) not between 3 and 200 then
    raise exception 'Contato do fornecedor inválido (de 3 a 200 letras)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('fornecedores', p_organizacao, lower(v_nome)));
  if p_id is null then
    select * into v_atual from public.fornecedores f where f.organizacao_id = p_organizacao and lower(f.nome) = lower(v_nome);
    if found then
      return jsonb_build_object('id', v_atual.id, 'repetida', true);
    end if;
    if v_cnpj is not null and exists (select 1 from public.fornecedores f where f.organizacao_id = p_organizacao and f.cnpj = v_cnpj) then
      raise exception 'Este CNPJ já está em outro fornecedor' using errcode = '23505';
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    insert into public.fornecedores (organizacao_id, nome, cnpj, contato, criado_por)
    values (p_organizacao, v_nome, v_cnpj, v_contato, (select auth.uid())) returning id into v_id;
    return jsonb_build_object('id', v_id, 'repetida', false);
  end if;
  select * into v_atual from public.fornecedores f where f.id = p_id and f.organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'Fornecedor não encontrado' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.fornecedores f where f.organizacao_id = p_organizacao and lower(f.nome) = lower(v_nome) and f.id <> p_id) then
    raise exception 'Já existe outro fornecedor com este nome' using errcode = '23505';
  end if;
  if v_cnpj is not null and exists (select 1 from public.fornecedores f where f.organizacao_id = p_organizacao and f.cnpj = v_cnpj and f.id <> p_id) then
    raise exception 'Este CNPJ já está em outro fornecedor' using errcode = '23505';
  end if;
  if v_atual.nome = v_nome and v_atual.cnpj is not distinct from v_cnpj and v_atual.contato is not distinct from v_contato
     and v_atual.ativo = coalesce(p_ativo, v_atual.ativo) then
    return jsonb_build_object('id', p_id, 'repetida', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.fornecedores f set nome = v_nome, cnpj = v_cnpj, contato = v_contato, ativo = coalesce(p_ativo, v_atual.ativo) where f.id = p_id;
  return jsonb_build_object('id', p_id, 'repetida', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Entrada
-- p_itens: [{variante, quantidade?, identificadores?: [IMEI ou ICCID], custo?, condicao?}] (1 a 200 linhas;
-- até 500 aparelhos/chips por entrada).
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

-- Estorno: tudo volta pelo livro (ajuste com motivo), só se cada item ainda estiver na loja e livre.
create or replace function public.estoque_estornar_entrada(p_entrada uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_entrada public.entradas_estoque;
  v_linha public.entrada_itens;
  v_item public.itens_serializados;
  v_id uuid;
  v_saldo public.estoque_saldos;
begin
  select * into v_entrada from public.entradas_estoque e where e.id = p_entrada for update;
  if not found or not public.tem_permissao('estoque.receber', v_entrada.unidade_id) then
    raise exception 'Entrada não encontrada para você' using errcode = 'P0002';
  end if;
  if v_entrada.situacao = 'estornada' then
    return 'ja_estornada';
  end if;
  perform set_config('ora.motivo', format('Estorno da entrada nº %s: %s', v_entrada.numero, v_motivo), true);
  for v_linha in select * from public.entrada_itens i where i.entrada_id = v_entrada.id order by i.linha loop
    if cardinality(v_linha.itens) > 0 then
      foreach v_id in array v_linha.itens loop
        select * into v_item from public.itens_serializados i where i.id = v_id for update;
        if not v_item.em_estoque or v_item.unidade_id <> v_entrada.unidade_id or v_item.situacao <> 'disponivel' then
          raise exception 'O IMEI/ICCID % não está livre nesta loja (vendido, reservado ou transferido): o estorno não é possível',
            coalesce(v_item.imei, v_item.iccid) using errcode = 'OR002';
        end if;
        perform privado.lancar_movimento(v_entrada.unidade_id, v_linha.variante_id, -1, 'ajuste', v_id, v_motivo, 'estorno_entrada',
          v_entrada.id::text, format('estorno:%s:%s', v_entrada.id, v_id), (select auth.uid()));
      end loop;
    else
      select * into v_saldo from public.estoque_saldos s where s.unidade_id = v_entrada.unidade_id and s.variante_id = v_linha.variante_id for update;
      if coalesce(v_saldo.quantidade, 0) - coalesce(v_saldo.reservado, 0) < v_linha.quantidade then
        raise exception 'Não há quantidade livre para estornar a linha % (já vendida, reservada ou transferida)', v_linha.linha using errcode = 'OR001';
      end if;
      perform privado.lancar_movimento(v_entrada.unidade_id, v_linha.variante_id, -v_linha.quantidade, 'ajuste', null, v_motivo, 'estorno_entrada',
        v_entrada.id::text, format('estorno:%s:%s', v_entrada.id, v_linha.linha), (select auth.uid()));
    end if;
  end loop;
  update public.entradas_estoque e set situacao = 'estornada', estornado_por = (select auth.uid()), estornado_em = now(), motivo_estorno = v_motivo
  where e.id = v_entrada.id;
  return 'estornada';
end;
$$;

revoke all on function public.fornecedor_salvar(uuid, uuid, text, text, text, boolean, text),
  public.estoque_registrar_entrada(uuid, text, uuid, text, jsonb, text, text), public.estoque_estornar_entrada(uuid, text) from public, anon;
grant execute on function public.fornecedor_salvar(uuid, uuid, text, text, text, boolean, text),
  public.estoque_registrar_entrada(uuid, text, uuid, text, jsonb, text, text), public.estoque_estornar_entrada(uuid, text) to authenticated;
