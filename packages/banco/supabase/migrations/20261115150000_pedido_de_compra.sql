-- =============================================================================
-- Pedido de compra antes do recebimento (lote INV-009a: ORA-INV-009, "pedido de compra antes do recebimento e
-- conferência da nota com o fornecedor")
--
-- Até aqui a compra entrava direto pela entrada de mercadoria (L4a): não ficava registrado o que foi pedido ao
-- fornecedor, e não havia com o que conferir a nota. Agora:
--   * public.pedidos_compra e public.pedido_compra_itens: o pedido da loja ao fornecedor (o número, o fornecedor, a
--     referência do fornecedor, a previsão de entrega e a observação) e cada variação pedida, com a quantidade e o custo
--     combinado (opcional). Nada se apaga: o pedido é encerrado (com algo recebido) ou cancelado (sem nada), com motivo;
--   * public.entradas_estoque.pedido_id: o pedido que a entrada recebeu (ou parte dele); uma entrada liga a um pedido
--     só, e um pedido pode chegar em várias entradas;
--   * public.pedido_compra_criar: quem recebe mercadoria na loja (estoque.receber: o dono e o gerente da loja); a
--     mesma chave do formulário devolve o mesmo pedido;
--   * public.pedido_compra_encerrar: com motivo; sem nada recebido, "cancelado"; com algo recebido, "encerrado";
--   * public.pedido_compra_ligar_entrada: a compra registrada da mesma loja e do mesmo fornecedor entra no pedido
--     aberto (ou sai dele, com o pedido nulo), com motivo na auditoria; a ligação de pedido encerrado não muda;
--   * public.pedidos_compra (a lista) e public.pedido_compra (o pedido com a conferência): o pedido contra o recebido
--     nas entradas registradas ligadas, linha a linha, e o que chegou fora do pedido; o custo (o combinado e o da nota)
--     só para quem vê custo na loja.
-- As tabelas não são lidas direto pela API (o custo combinado é custo): a leitura é pelas duas funções, que conferem
-- quem pede; e o registro do pedido na auditoria só aparece para quem vê custo na loja. Reversão:
-- supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid not null,
  fornecedor_id uuid not null,
  documento text check (documento is null or length(trim(documento)) between 1 and 60),
  previsto_para date,
  observacao text check (observacao is null or length(trim(observacao)) between 3 and 300),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'encerrado', 'cancelado')),
  chave text not null check (length(trim(chave)) between 8 and 80),
  conteudo text not null,
  total_unidades int not null check (total_unidades > 0),
  total_previsto_centavos bigint check (total_previsto_centavos is null or total_previsto_centavos >= 0),
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  encerrado_por uuid references public.perfis_usuario (id),
  encerrado_em timestamptz,
  motivo_encerramento text check (motivo_encerramento is null or length(trim(motivo_encerramento)) between 3 and 300),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (fornecedor_id, organizacao_id) references public.fornecedores (id, organizacao_id),
  constraint pedido_compra_encerramento check (
    (situacao = 'aberto') = (encerrado_em is null) and (encerrado_em is null) = (encerrado_por is null)
    and (encerrado_em is null) = (motivo_encerramento is null)),
  unique (organizacao_id, chave),
  unique (id, organizacao_id)
);
comment on table public.pedidos_compra is
  'Pedidos de compra da loja ao fornecedor (INV-009a, ORA-INV-009); lidos só pelas funções pedidos_compra e pedido_compra; nada se apaga.';
create index pedidos_compra_unidade on public.pedidos_compra (unidade_id, numero desc);
create index pedidos_compra_fornecedor on public.pedidos_compra (fornecedor_id, organizacao_id);
create index pedidos_compra_criado_por on public.pedidos_compra (criado_por);
create index pedidos_compra_encerrado_por on public.pedidos_compra (encerrado_por) where encerrado_por is not null;

create table public.pedido_compra_itens (
  pedido_id uuid not null references public.pedidos_compra (id),
  linha int not null check (linha between 1 and 200),
  organizacao_id uuid not null,
  variante_id uuid not null,
  quantidade int not null check (quantidade between 1 and 10000),
  custo_unitario_centavos bigint check (custo_unitario_centavos is null or custo_unitario_centavos between 0 and 100000000),
  primary key (pedido_id, linha),
  unique (pedido_id, variante_id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id)
);
create index pedido_compra_itens_variante on public.pedido_compra_itens (variante_id, organizacao_id);

create trigger pedidos_compra_auditar after insert or update on public.pedidos_compra
  for each row execute function privado.auditar_mudanca();

-- O registro do pedido na auditoria leva o total combinado (custo): como a entrada de mercadoria (REV-NOV-001), só lê
-- quem vê custo na loja. As linhas do pedido não vão para a auditoria (ficam na própria tabela, lida só pelas funções).
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
    and (
      alvo_tipo is distinct from 'custos'
      or organizacao_id in (select privado.organizacoes_com_permissao('custo.ver'))
    )
    and (
      alvo_tipo is distinct from 'pedidos_compra'
      or (unidade_id is not null and (select public.tem_permissao('custo.ver', unidade_id)))
    )
  );

-- Do pedido só muda o encerramento, uma vez (e os totais, na criação); as linhas não mudam. Nada se apaga.
create or replace function privado.pedido_compra_so_encerramento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.situacao <> 'aberto'
     or ((to_jsonb(old) - array['situacao', 'encerrado_por', 'encerrado_em', 'motivo_encerramento', 'total_unidades', 'total_previsto_centavos'])
         is distinct from (to_jsonb(new) - array['situacao', 'encerrado_por', 'encerrado_em', 'motivo_encerramento', 'total_unidades', 'total_previsto_centavos']))
     or (new.situacao <> 'aberto' and (old.total_unidades, old.total_previsto_centavos) is distinct from (new.total_unidades, new.total_previsto_centavos)) then
    raise exception 'O pedido de compra não muda: só o encerramento, uma vez' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger pedidos_compra_so_encerramento before update on public.pedidos_compra
  for each row execute function privado.pedido_compra_so_encerramento();
create trigger pedidos_compra_sem_apagar before delete on public.pedidos_compra
  for each row execute function privado.so_insercao();
create trigger pedidos_compra_sem_truncate before truncate on public.pedidos_compra
  for each statement execute function privado.so_insercao();
create trigger pedido_compra_itens_sem_mudar before update or delete on public.pedido_compra_itens
  for each row execute function privado.so_insercao();
create trigger pedido_compra_itens_sem_truncate before truncate on public.pedido_compra_itens
  for each statement execute function privado.so_insercao();

alter table public.pedidos_compra enable row level security;
alter table public.pedido_compra_itens enable row level security;
revoke all on public.pedidos_compra, public.pedido_compra_itens from anon, authenticated;
revoke all on sequence public.pedidos_compra_numero_seq from anon, authenticated;

-- A entrada que recebeu o pedido (da mesma rede). A ligação é lida direto (não é custo).
alter table public.entradas_estoque add column pedido_id uuid;
alter table public.entradas_estoque add constraint entradas_estoque_pedido_fkey
  foreign key (pedido_id, organizacao_id) references public.pedidos_compra (id, organizacao_id);
create index entradas_estoque_pedido on public.entradas_estoque (pedido_id) where pedido_id is not null;
grant select (pedido_id) on public.entradas_estoque to authenticated;

-- -----------------------------------------------------------------------------
-- Criar, encerrar e ligar a entrada
-- -----------------------------------------------------------------------------
create or replace function public.pedido_compra_criar(
  p_unidade uuid, p_fornecedor uuid, p_documento text, p_previsto date, p_itens jsonb, p_observacao text, p_chave text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade public.unidades;
  v_documento text := nullif(trim(coalesce(p_documento, '')), '');
  v_observacao text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_conteudo text;
  v_existente public.pedidos_compra;
  v_pedido uuid;
  v_numero bigint;
  v_linha jsonb;
  v_n int := 0;
  v_variante public.variantes;
  v_quantidade int;
  v_custo bigint;
  v_vistas uuid[] := '{}';
  v_total int := 0;
  v_total_custo bigint := 0;
  v_todas_com_custo boolean := true;
begin
  select * into v_unidade from public.unidades u where u.id = p_unidade;
  if not found or not public.tem_permissao('estoque.receber', p_unidade) then
    raise exception 'Sem permissão para pedir compra para esta loja' using errcode = '42501';
  end if;
  if v_unidade.status <> 'ativa' or v_unidade.tipo not in ('loja_fisica', 'deposito') then
    raise exception 'Pedido de compra só para loja física ou depósito ativos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.fornecedores f where f.id = p_fornecedor and f.organizacao_id = v_unidade.organizacao_id and f.ativo) then
    raise exception 'Escolha um fornecedor ativo desta rede' using errcode = '22023';
  end if;
  if v_documento is not null and length(v_documento) > 60 then
    raise exception 'Referência do fornecedor longa demais (até 60)' using errcode = '22023';
  end if;
  if p_previsto is not null and (p_previsto < v_hoje or p_previsto > v_hoje + 365) then
    raise exception 'A previsão de entrega vai de hoje até um ano' using errcode = '22023';
  end if;
  if v_observacao is not null and length(v_observacao) not between 3 and 300 then
    raise exception 'Observação: de 3 a 300 letras' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 200 then
    raise exception 'O pedido precisa ter de 1 a 200 linhas' using errcode = '22023';
  end if;

  v_conteudo := md5(jsonb_build_array(p_unidade, p_fornecedor, v_documento, p_previsto, v_observacao, p_itens)::text);
  perform pg_advisory_xact_lock(privado.trava_da_chave('pedidos_compra', v_unidade.organizacao_id, p_chave));
  select * into v_existente from public.pedidos_compra p where p.organizacao_id = v_unidade.organizacao_id and p.chave = trim(p_chave);
  if found then
    if v_existente.conteudo = v_conteudo then
      return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetido', true);
    end if;
    raise exception 'Chave do formulário já usada em outro pedido' using errcode = 'OR004';
  end if;

  perform set_config('ora.motivo', 'Pedido de compra', true);
  insert into public.pedidos_compra (organizacao_id, unidade_id, fornecedor_id, documento, previsto_para, observacao, chave, conteudo, total_unidades, criado_por)
  values (v_unidade.organizacao_id, p_unidade, p_fornecedor, v_documento, p_previsto, v_observacao, trim(p_chave), v_conteudo, 1, (select auth.uid()))
  returning id, numero into v_pedido, v_numero;

  for v_linha in select e from jsonb_array_elements(p_itens) e loop
    v_n := v_n + 1;
    if jsonb_typeof(v_linha) <> 'object' or coalesce(v_linha ->> 'variante', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'Linha %: variação inválida', v_n using errcode = '22023';
    end if;
    select * into v_variante from public.variantes v where v.id = (v_linha ->> 'variante')::uuid and v.organizacao_id = v_unidade.organizacao_id and v.ativa;
    if not found then
      raise exception 'Linha %: variação inativa ou de outra rede', v_n using errcode = '22023';
    end if;
    if not exists (select 1 from public.produtos p where p.id = v_variante.produto_id and p.ativo) then
      raise exception 'Linha % (%): o produto está inativo no catálogo', v_n, v_variante.sku using errcode = '22023';
    end if;
    if privado.tipo_da_variante(v_variante.id) not in ('aparelho', 'chip', 'acessorio') then
      raise exception 'Linha % (%): este tipo de item não tem estoque', v_n, v_variante.sku using errcode = '22023';
    end if;
    if v_variante.id = any (v_vistas) then
      raise exception 'Linha % (%): a variação já está em outra linha do pedido', v_n, v_variante.sku using errcode = '22023';
    end if;
    v_vistas := v_vistas || v_variante.id;
    if jsonb_typeof(v_linha -> 'quantidade') is distinct from 'number' or (v_linha ->> 'quantidade') !~ '^[0-9]{1,5}$'
       or (v_linha ->> 'quantidade')::int not between 1 and 10000 then
      raise exception 'Linha % (%): quantidade inválida (1 a 10.000)', v_n, v_variante.sku using errcode = '22023';
    end if;
    v_quantidade := (v_linha ->> 'quantidade')::int;
    v_custo := null;
    if v_linha ? 'custo' and jsonb_typeof(v_linha -> 'custo') <> 'null' then
      if jsonb_typeof(v_linha -> 'custo') <> 'number' or (v_linha ->> 'custo') !~ '^[0-9]{1,9}$' or (v_linha ->> 'custo')::bigint > 100000000 then
        raise exception 'Linha %: custo inválido', v_n using errcode = '22023';
      end if;
      v_custo := (v_linha ->> 'custo')::bigint;
    end if;
    insert into public.pedido_compra_itens (pedido_id, linha, organizacao_id, variante_id, quantidade, custo_unitario_centavos)
    values (v_pedido, v_n, v_unidade.organizacao_id, v_variante.id, v_quantidade, v_custo);
    v_total := v_total + v_quantidade;
    if v_custo is null then v_todas_com_custo := false; else v_total_custo := v_total_custo + v_custo * v_quantidade; end if;
  end loop;

  update public.pedidos_compra p set total_unidades = v_total, total_previsto_centavos = case when v_todas_com_custo then v_total_custo end
  where p.id = v_pedido;
  return jsonb_build_object('id', v_pedido, 'numero', v_numero, 'repetido', false);
end;
$$;

create or replace function public.pedido_compra_encerrar(p_pedido uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos_compra;
  v_motivo text;
  v_situacao text;
begin
  select * into v_pedido from public.pedidos_compra p where p.id = p_pedido for update;
  if not found or not public.tem_permissao('estoque.receber', v_pedido.unidade_id) then
    raise exception 'Pedido de compra não encontrado para você' using errcode = 'P0002';
  end if;
  if v_pedido.situacao <> 'aberto' then
    return 'ja_encerrado';
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  if length(v_motivo) > 300 then
    raise exception 'O motivo tem até 300 letras' using errcode = '22023';
  end if;
  v_situacao := case when exists (select 1 from public.entradas_estoque e where e.pedido_id = v_pedido.id and e.situacao = 'registrada')
                     then 'encerrado' else 'cancelado' end;
  perform set_config('ora.motivo', format('Pedido de compra nº %s %s: %s', v_pedido.numero, v_situacao, v_motivo), true);
  update public.pedidos_compra p set situacao = v_situacao, encerrado_por = (select auth.uid()), encerrado_em = now(), motivo_encerramento = v_motivo
  where p.id = v_pedido.id;
  return v_situacao;
end;
$$;

create or replace function public.pedido_compra_ligar_entrada(p_entrada uuid, p_pedido uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entrada public.entradas_estoque;
  v_pedido public.pedidos_compra;
  v_motivo text;
begin
  select * into v_entrada from public.entradas_estoque e where e.id = p_entrada for update;
  if not found or not public.tem_permissao('estoque.receber', v_entrada.unidade_id) then
    raise exception 'Entrada não encontrada para você' using errcode = 'P0002';
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  if length(v_motivo) > 300 then
    raise exception 'O motivo tem até 300 letras' using errcode = '22023';
  end if;
  if v_entrada.pedido_id is not distinct from p_pedido then
    return false;
  end if;
  if v_entrada.pedido_id is not null
     and (select p.situacao from public.pedidos_compra p where p.id = v_entrada.pedido_id) <> 'aberto' then
    raise exception 'O pedido desta entrada já foi encerrado: a ligação fica' using errcode = '22023';
  end if;
  if p_pedido is not null then
    if v_entrada.tipo <> 'compra' then
      raise exception 'Só a entrada de compra de fornecedor recebe pedido' using errcode = '22023';
    end if;
    if v_entrada.situacao <> 'registrada' then
      raise exception 'A entrada foi estornada: não recebe pedido' using errcode = '22023';
    end if;
    select * into v_pedido from public.pedidos_compra p where p.id = p_pedido and p.organizacao_id = v_entrada.organizacao_id for update;
    if not found then
      raise exception 'Pedido de compra não encontrado' using errcode = 'P0002';
    end if;
    if v_pedido.unidade_id <> v_entrada.unidade_id then
      raise exception 'O pedido é de outra loja' using errcode = '22023';
    end if;
    if v_pedido.fornecedor_id <> v_entrada.fornecedor_id then
      raise exception 'O pedido é de outro fornecedor' using errcode = '22023';
    end if;
    if v_pedido.situacao <> 'aberto' then
      raise exception 'O pedido já foi encerrado' using errcode = '22023';
    end if;
  end if;
  perform set_config('ora.motivo', case when p_pedido is null then 'Entrada desligada do pedido de compra: ' else 'Entrada ligada ao pedido de compra: ' end || v_motivo, true);
  update public.entradas_estoque e set pedido_id = p_pedido where e.id = v_entrada.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- A leitura: a lista e o pedido com a conferência (o custo só com custo.ver na loja)
-- -----------------------------------------------------------------------------
-- O recebido de cada pedido, por variação: as entradas registradas ligadas a ele.
create or replace function privado.recebido_do_pedido(p_pedido uuid)
returns table (variante_id uuid, quantidade bigint, custo_medio_centavos bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select i.variante_id, sum(i.quantidade)::bigint,
    case when count(*) filter (where i.custo_unitario_centavos is null) = 0
         then round(sum(i.custo_unitario_centavos * i.quantidade)::numeric / nullif(sum(i.quantidade), 0))::bigint end
  from public.entradas_estoque e
  join public.entrada_itens i on i.entrada_id = e.id
  where e.pedido_id = p_pedido and e.situacao = 'registrada'
  group by i.variante_id;
$$;
revoke all on function privado.recebido_do_pedido(uuid), privado.pedido_compra_so_encerramento() from public, anon, authenticated;

create or replace function public.pedidos_compra(p_unidade uuid default null, p_situacao text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if p_unidade is not null and not public.tem_permissao('estoque.receber', p_unidade) then
    raise exception 'Sem permissão para ver os pedidos de compra desta loja' using errcode = '42501';
  end if;
  if p_unidade is null and not exists (select 1 from privado.unidades_com_permissao('estoque.receber')) then
    raise exception 'Sem permissão para ver pedidos de compra' using errcode = '42501';
  end if;
  if p_situacao is not null and p_situacao not in ('aberto', 'encerrado', 'cancelado') then
    raise exception 'Situação desconhecida' using errcode = '22023';
  end if;
  with lojas as (
    select u as unidade_id from privado.unidades_com_permissao('estoque.receber') u where p_unidade is null or u = p_unidade
  ),
  pedidos as (
    select p.* from public.pedidos_compra p
    where p.unidade_id in (select l.unidade_id from lojas l) and (p_situacao is null or p.situacao = p_situacao)
    order by p.numero desc limit 200
  ),
  linhas as (
    select i.pedido_id, i.quantidade, least(i.quantidade, coalesce(r.quantidade, 0)) as recebida
    from pedidos p join public.pedido_compra_itens i on i.pedido_id = p.id
    left join lateral (select x.quantidade from privado.recebido_do_pedido(p.id) x where x.variante_id = i.variante_id) r on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'numero', p.numero, 'unidade_id', p.unidade_id, 'fornecedor_id', p.fornecedor_id,
      'fornecedor', (select f.nome from public.fornecedores f where f.id = p.fornecedor_id),
      'documento', p.documento, 'previsto_para', p.previsto_para, 'situacao', p.situacao, 'criado_em', p.criado_em,
      'encerrado_em', p.encerrado_em, 'motivo_encerramento', p.motivo_encerramento,
      'unidades', p.total_unidades, 'recebidas', (select coalesce(sum(l.recebida), 0) from linhas l where l.pedido_id = p.id),
      'entradas', (select count(*) from public.entradas_estoque e where e.pedido_id = p.id and e.situacao = 'registrada'),
      'total_previsto', case when public.tem_permissao('custo.ver', p.unidade_id) then p.total_previsto_centavos end
    ) order by p.numero desc), '[]'::jsonb) into resultado
  from pedidos p;
  return resultado;
end;
$$;

create or replace function public.pedido_compra(p_pedido uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos_compra;
  v_custo boolean;
  resultado jsonb;
begin
  select * into v_pedido from public.pedidos_compra p where p.id = p_pedido;
  if not found or not public.tem_permissao('estoque.receber', v_pedido.unidade_id) then
    raise exception 'Pedido de compra não encontrado para você' using errcode = 'P0002';
  end if;
  v_custo := public.tem_permissao('custo.ver', v_pedido.unidade_id);
  with recebido as (select * from privado.recebido_do_pedido(v_pedido.id))
  select jsonb_build_object(
    'id', v_pedido.id, 'numero', v_pedido.numero, 'unidade_id', v_pedido.unidade_id, 'fornecedor_id', v_pedido.fornecedor_id,
    'fornecedor', (select f.nome from public.fornecedores f where f.id = v_pedido.fornecedor_id),
    'documento', v_pedido.documento, 'previsto_para', v_pedido.previsto_para, 'observacao', v_pedido.observacao,
    'situacao', v_pedido.situacao, 'criado_em', v_pedido.criado_em, 'encerrado_em', v_pedido.encerrado_em,
    'motivo_encerramento', v_pedido.motivo_encerramento, 've_custo', v_custo,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linha', i.linha, 'variante_id', i.variante_id, 'sku', v.sku, 'nome', v.nome, 'produto', pr.nome,
        'quantidade', i.quantidade, 'recebida', coalesce(r.quantidade, 0),
        'custo_combinado', case when v_custo then i.custo_unitario_centavos end,
        'custo_da_nota', case when v_custo then r.custo_medio_centavos end
      ) order by i.linha)
      from public.pedido_compra_itens i
      join public.variantes v on v.id = i.variante_id
      join public.produtos pr on pr.id = v.produto_id
      left join recebido r on r.variante_id = i.variante_id
      where i.pedido_id = v_pedido.id), '[]'::jsonb),
    'fora_do_pedido', coalesce((
      select jsonb_agg(jsonb_build_object('variante_id', r.variante_id, 'sku', v.sku, 'nome', v.nome, 'recebida', r.quantidade,
                                          'custo_da_nota', case when v_custo then r.custo_medio_centavos end) order by v.sku)
      from recebido r join public.variantes v on v.id = r.variante_id
      where not exists (select 1 from public.pedido_compra_itens i where i.pedido_id = v_pedido.id and i.variante_id = r.variante_id)), '[]'::jsonb),
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero, 'documento', e.documento, 'situacao', e.situacao,
                                          'criado_em', e.criado_em, 'unidades', e.total_unidades) order by e.numero)
      from public.entradas_estoque e where e.pedido_id = v_pedido.id), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

revoke all on function public.pedido_compra_criar(uuid, uuid, text, date, jsonb, text, text), public.pedido_compra_encerrar(uuid, text),
  public.pedido_compra_ligar_entrada(uuid, uuid, text), public.pedidos_compra(uuid, text), public.pedido_compra(uuid) from public, anon;
grant execute on function public.pedido_compra_criar(uuid, uuid, text, date, jsonb, text, text), public.pedido_compra_encerrar(uuid, text),
  public.pedido_compra_ligar_entrada(uuid, uuid, text), public.pedidos_compra(uuid, text), public.pedido_compra(uuid) to authenticated;
