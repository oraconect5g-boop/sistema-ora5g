-- =============================================================================
-- ADR-004, adendo de 09/11/2026 — Devolução parcial e troca (ORA-POS-010 e ORA-POS-012)
-- Aplicado só no desenvolvimento. A política comercial (prazo, estado aceito, D-026) segue
-- pendente: o banco registra e controla a devolução; não decide quem tem direito a ela.
--
--   * Só a gerência (venda.cancelar), na loja da venda, devolve itens de venda concluída, com motivo.
--   * Valor de cada item devolvido = preço × quantidade menos a parte acumulada do desconto (sem
--     sobra de centavo ao devolver aos poucos). O reembolso soma exatamente esse valor.
--   * Reembolso só nos meios que a venda usou, até o que cada meio pagou menos o já devolvido:
--     dinheiro sai do caixa de quem devolve; cartão e Pix ficam como estorno a fazer na maquininha
--     ou no banco. Ou vira VALE-TROCA: crédito na rede, sem dinheiro.
--   * Venda financiada (PayJoy/Aiva) não tem devolução parcial (OR016): cancelamento total.
--   * Aparelho, chip e acessório voltam ao estoque pelo livro ("devolucao"), com a condição informada.
--   * Serviço com operação Ora Connect viva não se devolve (OR013); chip ativado não volta (gatilho).
--   * Nota emitida: a devolução abre um pedido de NOTA DE DEVOLUÇÃO na fila fiscal (ADR-006); nota
--     ainda não emitida: o pedido recebe o aviso de emitir só o que ficou.
--   * Venda com devolução não é cancelada inteira (OR017): devolvem-se os itens que restam.
--   * Vale-troca é meio de pagamento ("vale_troca", com o número do vale no comprovante): o gatilho
--     do pagamento confere e baixa o saldo; o cancelamento da venda devolve o saldo ao vale.
-- Ordem das travas: chave → venda → caixa → item serializado (por id) → saldo; o vale, no pagamento.
-- Códigos: OR016 venda financiada, OR017 venda com devolução, OR018 vale inválido ou sem saldo.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

-- Os mesmos meios de packages/dominio/src/pagamento.ts, agora com o vale-troca.
create or replace function privado.meio_valido(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('dinheiro', 'pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'link_pagamento', 'payjoy', 'aiva', 'vale_troca'); $$;

-- Maquininha e Pix: código do comprovante. Vale-troca: o número do vale no mesmo campo.
create or replace function privado.meio_com_comprovante(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'vale_troca'); $$;

-- Entrada de financiamento nunca é paga com vale (o vale só baixa como linha de pagamento própria).
alter table public.venda_pagamentos add constraint entrada_sem_vale check (meio_entrada is distinct from 'vale_troca');

alter table public.vendas add column devolvido_centavos bigint not null default 0 check (devolvido_centavos >= 0);

-- -----------------------------------------------------------------------------
-- 1. Devoluções, itens devolvidos, reembolsos e vales
-- -----------------------------------------------------------------------------
create table public.venda_devolucoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  chave text not null check (length(trim(chave)) > 0),
  conteudo text not null,
  motivo text not null check (length(trim(motivo)) >= 3),
  valor_centavos bigint not null check (valor_centavos > 0),
  caixa_id uuid references public.caixas (id),
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave)
);
create index venda_devolucoes_venda on public.venda_devolucoes (venda_id);
create index venda_devolucoes_unidade_organizacao on public.venda_devolucoes (unidade_id, organizacao_id);
create index venda_devolucoes_caixa on public.venda_devolucoes (caixa_id);
create index venda_devolucoes_criado_por on public.venda_devolucoes (criado_por);

create table public.venda_devolucao_itens (
  id bigint generated always as identity primary key,
  devolucao_id uuid not null references public.venda_devolucoes (id),
  venda_item_id uuid not null references public.venda_itens (id),
  quantidade int not null check (quantidade > 0),
  valor_centavos bigint not null check (valor_centavos >= 0),
  condicao text check (condicao in ('novo', 'seminovo', 'avariado')),
  unique (devolucao_id, venda_item_id)
);
create index venda_devolucao_itens_item on public.venda_devolucao_itens (venda_item_id);

create table public.venda_devolucao_reembolsos (
  id bigint generated always as identity primary key,
  devolucao_id uuid not null references public.venda_devolucoes (id),
  meio text not null check (privado.meio_valido(meio) and not privado.meio_financeira(meio) and meio <> 'link_pagamento'),
  valor_centavos bigint not null check (valor_centavos > 0),
  unique (devolucao_id, meio)
);

create table public.vales_troca (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  devolucao_id uuid not null unique references public.venda_devolucoes (id),
  valor_centavos bigint not null check (valor_centavos > 0),
  saldo_centavos bigint not null check (saldo_centavos between 0 and valor_centavos),
  cliente_nome text,
  criado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
create index vales_troca_unidade_organizacao on public.vales_troca (unidade_id, organizacao_id);
create index vales_troca_organizacao_numero on public.vales_troca (organizacao_id, numero);

create table public.vales_troca_usos (
  id bigint generated always as identity primary key,
  vale_id uuid not null references public.vales_troca (id),
  venda_id uuid not null references public.vendas (id),
  pagamento_id uuid not null unique references public.venda_pagamentos (id),
  valor_centavos bigint not null check (valor_centavos > 0),
  usado_em timestamptz not null default now(),
  devolvido_em timestamptz
);
create index vales_troca_usos_vale on public.vales_troca_usos (vale_id);
create index vales_troca_usos_venda on public.vales_troca_usos (venda_id);

create trigger venda_devolucoes_sem_alteracao before update or delete on public.venda_devolucoes
  for each row execute function privado.so_insercao();
create trigger venda_devolucao_itens_sem_alteracao before update or delete on public.venda_devolucao_itens
  for each row execute function privado.so_insercao();
create trigger venda_devolucao_reembolsos_sem_alteracao before update or delete on public.venda_devolucao_reembolsos
  for each row execute function privado.so_insercao();

alter table public.venda_devolucoes enable row level security;
alter table public.venda_devolucao_itens enable row level security;
alter table public.venda_devolucao_reembolsos enable row level security;
alter table public.vales_troca enable row level security;
alter table public.vales_troca_usos enable row level security;
revoke all on public.venda_devolucoes, public.venda_devolucao_itens, public.venda_devolucao_reembolsos, public.vales_troca,
  public.vales_troca_usos from anon, authenticated;
revoke all on sequence public.venda_devolucoes_numero_seq, public.venda_devolucao_itens_id_seq, public.venda_devolucao_reembolsos_id_seq,
  public.vales_troca_numero_seq, public.vales_troca_usos_id_seq from anon, authenticated;
grant select on public.venda_devolucoes, public.venda_devolucao_itens, public.venda_devolucao_reembolsos, public.vales_troca,
  public.vales_troca_usos to authenticated;

create policy venda_devolucoes_ler on public.venda_devolucoes for select to authenticated
  using (venda_id in (select v.id from public.vendas v));
create policy venda_devolucao_itens_ler on public.venda_devolucao_itens for select to authenticated
  using (devolucao_id in (select d.id from public.venda_devolucoes d));
create policy venda_devolucao_reembolsos_ler on public.venda_devolucao_reembolsos for select to authenticated
  using (devolucao_id in (select d.id from public.venda_devolucoes d));
create policy vales_troca_ler on public.vales_troca for select to authenticated
  using (unidade_id in (select privado.unidades_visiveis()));
create policy vales_troca_usos_ler on public.vales_troca_usos for select to authenticated
  using (vale_id in (select v.id from public.vales_troca v) or venda_id in (select v.id from public.vendas v));

-- -----------------------------------------------------------------------------
-- 2. Fila fiscal: pedido de nota de devolução (ADR-006)
-- -----------------------------------------------------------------------------
alter table public.notas_pedidos add column tipo text not null default 'venda' check (tipo in ('venda', 'devolucao'));
alter table public.notas_pedidos add column devolucao_id uuid references public.venda_devolucoes (id);
alter table public.notas_pedidos add constraint devolucao_tem_referencia check ((tipo = 'devolucao') = (devolucao_id is not null));
drop index public.notas_um_pedido_vivo_por_venda;
create unique index notas_um_pedido_vivo_por_venda on public.notas_pedidos (venda_id) where situacao <> 'cancelada' and tipo = 'venda';
create unique index notas_um_pedido_por_devolucao on public.notas_pedidos (devolucao_id) where devolucao_id is not null;
alter table public.notas_eventos drop constraint notas_eventos_tipo_check;
alter table public.notas_eventos add constraint notas_eventos_tipo_check check (tipo in (
  'pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida', 'emitida_sem_aprovacao_previa', 'cancelada',
  'ajustada_por_devolucao'));

-- -----------------------------------------------------------------------------
-- 3. Proteções: venda com devolução e vale no pagamento
-- -----------------------------------------------------------------------------
create or replace function privado.proteger_venda_com_devolucao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.situacao = 'concluida' and new.situacao = 'cancelada'
     and exists (select 1 from public.venda_devolucoes d where d.venda_id = old.id) then
    raise exception 'Venda com devolução: o cancelamento inteiro não se aplica; devolva os itens que restam' using errcode = 'OR017';
  end if;
  return new;
end;
$$;
create trigger vendas_com_devolucao before update of situacao on public.vendas
  for each row execute function privado.proteger_venda_com_devolucao();

-- Pagamento com vale: confere o vale da organização pelo número e baixa o saldo; o estorno do
-- pagamento (cancelamento da venda) devolve o saldo uma vez só.
create or replace function privado.vale_no_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vale public.vales_troca;
  digitos text;
begin
  if new.meio <> 'vale_troca' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    digitos := regexp_replace(coalesce(new.comprovante, ''), '[^0-9]', '', 'g');
    if digitos !~ '^[0-9]{1,12}$' then
      raise exception 'Informe o número do vale-troca' using errcode = 'OR018';
    end if;
    select * into vale from public.vales_troca v
    where v.organizacao_id = new.organizacao_id and v.numero = digitos::bigint for update;
    if not found or vale.saldo_centavos < new.valor_centavos then
      raise exception 'Vale-troca não encontrado ou sem saldo suficiente' using errcode = 'OR018';
    end if;
    update public.vales_troca v set saldo_centavos = v.saldo_centavos - new.valor_centavos where v.id = vale.id;
    insert into public.vales_troca_usos (vale_id, venda_id, pagamento_id, valor_centavos)
    values (vale.id, new.venda_id, new.id, new.valor_centavos);
  elsif old.situacao = 'confirmado' and new.situacao = 'estornado' then
    update public.vales_troca v set saldo_centavos = v.saldo_centavos + u.valor_centavos
    from public.vales_troca_usos u
    where u.pagamento_id = new.id and u.devolvido_em is null and v.id = u.vale_id;
    update public.vales_troca_usos u set devolvido_em = now() where u.pagamento_id = new.id and u.devolvido_em is null;
  end if;
  return null;
end;
$$;
create trigger venda_pagamentos_vale after insert or update of situacao on public.venda_pagamentos
  for each row execute function privado.vale_no_pagamento();

-- -----------------------------------------------------------------------------
-- 4. Devolução parcial (e troca, com o reembolso em vale)
-- p_itens: [{item, quantidade, condicao: novo | seminovo | avariado}]; p_reembolsos: [{meio, valor}].
-- -----------------------------------------------------------------------------
create or replace function public.devolver_itens(p_venda uuid, p_itens jsonb, p_reembolsos jsonb, p_motivo text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  existente public.venda_devolucoes;
  conteudo text;
  caixa public.caixas;
  linha jsonb;
  item public.venda_itens;
  calculados jsonb := '[]'::jsonb;
  ids_itens uuid[] := '{}';
  quantidade_pedida int;
  ja_devolvida int;
  condicao_retorno text;
  valor_item bigint;
  total bigint := 0;
  meio_reembolso text;
  meios_vistos text[] := '{}';
  valor bigint;
  soma_reembolsos bigint := 0;
  em_vale bigint := 0;
  em_dinheiro bigint := 0;
  pago bigint;
  devolvido_antes bigint;
  precisa_caixa boolean := false;
  devolucao public.venda_devolucoes;
  vale public.vales_troca;
  nota public.notas_pedidos;
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.cancelar', venda.unidade_id)) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  conteudo := md5(concat_ws('|', p_venda, coalesce(p_itens, 'null'::jsonb)::text, coalesce(p_reembolsos, 'null'::jsonb)::text, trim(coalesce(p_motivo, ''))));

  -- (0) chave: a repetição devolve o mesmo resultado; outro conteúdo, OR004
  perform pg_advisory_xact_lock(privado.trava_da_chave('devolucoes', venda.organizacao_id, p_chave));
  select * into existente from public.venda_devolucoes d where d.organizacao_id = venda.organizacao_id and d.chave = p_chave;
  if found then
    if existente.conteudo <> conteudo or existente.criado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('devolucao', existente.id, 'numero', existente.numero, 'valor', existente.valor_centavos,
                              'vale', (select v.numero from public.vales_troca v where v.devolucao_id = existente.id), 'repetida', true);
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha ao menos um item' using errcode = '22023';
  end if;
  if p_reembolsos is null or jsonb_typeof(p_reembolsos) <> 'array' or jsonb_array_length(p_reembolsos) = 0 then
    raise exception 'Informe como o valor volta ao cliente' using errcode = 'OR009';
  end if;

  -- (1) venda travada
  select * into venda from public.vendas v where v.id = p_venda for update;
  if venda.situacao <> 'concluida' then
    raise exception 'Só venda concluída tem devolução' using errcode = '22023';
  end if;
  if exists (select 1 from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' and privado.meio_financeira(p.meio)) then
    raise exception 'Venda financiada: a devolução parcial passa pela financeira; use o cancelamento total' using errcode = 'OR016';
  end if;

  -- Itens: da venda, sem repetir, até o que resta; valor com a parte acumulada do desconto.
  for linha in select value from jsonb_array_elements(p_itens) loop
    if coalesce(linha ->> 'item', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Item inválido' using errcode = '22023';
    end if;
    select * into item from public.venda_itens i where i.id = (linha ->> 'item')::uuid and i.venda_id = venda.id;
    if not found then
      raise exception 'O item não é desta venda' using errcode = 'P0002';
    end if;
    if item.id = any (ids_itens) then
      raise exception 'Item repetido na devolução' using errcode = '22023';
    end if;
    ids_itens := ids_itens || item.id;
    if coalesce(linha ->> 'quantidade', '1') !~ '^[0-9]{1,4}$' then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    quantidade_pedida := coalesce(linha ->> 'quantidade', '1')::int;
    select coalesce(sum(di.quantidade), 0) into ja_devolvida from public.venda_devolucao_itens di where di.venda_item_id = item.id;
    if quantidade_pedida < 1 or quantidade_pedida > item.quantidade - ja_devolvida then
      raise exception 'Quantidade maior que a que resta deste item' using errcode = '22023';
    end if;
    condicao_retorno := nullif(linha ->> 'condicao', '');
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      condicao_retorno := coalesce(condicao_retorno, 'novo');
      if condicao_retorno not in ('novo', 'seminovo', 'avariado') then
        raise exception 'Condição do item: novo, seminovo ou avariado' using errcode = '22023';
      end if;
    else
      condicao_retorno := null;
      if exists (select 1 from public.connect_operacoes o where o.venda_item_id = item.id
                 and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')) then
        raise exception 'Serviço com operação da Ora Connect em andamento ou feita: resolva a operação antes' using errcode = 'OR013';
      end if;
    end if;
    valor_item := item.preco_unitario_centavos * quantidade_pedida
      - (item.desconto_centavos * (ja_devolvida + quantidade_pedida) / item.quantidade - item.desconto_centavos * ja_devolvida / item.quantidade);
    total := total + valor_item;
    calculados := calculados || jsonb_build_array(jsonb_build_object(
      'item', item.id, 'quantidade', quantidade_pedida, 'valor', valor_item, 'condicao', condicao_retorno));
  end loop;
  if total <= 0 then
    raise exception 'Nada a devolver em dinheiro ou vale' using errcode = '22023';
  end if;

  -- Reembolso: só nos meios pagos, até o que cada um pagou menos o já devolvido; o vale à parte.
  for linha in select value from jsonb_array_elements(p_reembolsos) loop
    meio_reembolso := linha ->> 'meio';
    if coalesce(linha ->> 'valor', '') !~ '^[0-9]{1,12}$' or (linha ->> 'valor')::bigint <= 0 or meio_reembolso is null then
      raise exception 'Valor de reembolso inválido' using errcode = 'OR009';
    end if;
    valor := (linha ->> 'valor')::bigint;
    if meio_reembolso = any (meios_vistos) then
      raise exception 'Um valor por meio de reembolso' using errcode = 'OR009';
    end if;
    meios_vistos := meios_vistos || meio_reembolso;
    if meio_reembolso = 'vale_troca' then
      em_vale := em_vale + valor;
    else
      if not privado.meio_valido(meio_reembolso) or privado.meio_financeira(meio_reembolso) or meio_reembolso = 'link_pagamento' then
        raise exception 'Meio de reembolso inválido' using errcode = 'OR009';
      end if;
      select coalesce(sum(p.valor_centavos), 0) into pago from public.venda_pagamentos p
      where p.venda_id = venda.id and p.situacao = 'confirmado' and p.meio = meio_reembolso;
      if meio_reembolso = 'dinheiro' then
        pago := pago - coalesce(venda.troco_centavos, 0);
        em_dinheiro := valor;
      end if;
      select coalesce(sum(r.valor_centavos), 0) into devolvido_antes
      from public.venda_devolucao_reembolsos r join public.venda_devolucoes d on d.id = r.devolucao_id
      where d.venda_id = venda.id and r.meio = meio_reembolso;
      if valor > pago - devolvido_antes then
        raise exception 'O reembolso em % passa do que esse meio pagou', meio_reembolso using errcode = 'OR009';
      end if;
      precisa_caixa := true;
    end if;
    soma_reembolsos := soma_reembolsos + valor;
  end loop;
  if soma_reembolsos <> total then
    raise exception 'O reembolso (%) precisa somar o valor devolvido (%)', soma_reembolsos, total using errcode = 'OR009';
  end if;

  -- (2) caixa de quem devolve, quando sai dinheiro ou fica estorno de maquininha/Pix
  if precisa_caixa then
    caixa := privado.meu_caixa_aberto();
    if em_dinheiro > privado.dinheiro_no_caixa(caixa.id) then
      raise exception 'Não há dinheiro suficiente no seu caixa para devolver' using errcode = '23514';
    end if;
  end if;

  -- (3) itens serializados em ordem de id
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.venda_itens i where i.id = any (ids_itens) and i.item_serializado_id is not null)
  order by s.id for update;

  insert into public.venda_devolucoes (organizacao_id, unidade_id, venda_id, chave, conteudo, motivo, valor_centavos, caixa_id, criado_por)
  values (venda.organizacao_id, venda.unidade_id, venda.id, p_chave, conteudo, trim(p_motivo), total, caixa.id, usuario)
  returning * into devolucao;

  for linha in select value from jsonb_array_elements(calculados) loop
    select * into item from public.venda_itens i where i.id = (linha ->> 'item')::uuid;
    insert into public.venda_devolucao_itens (devolucao_id, venda_item_id, quantidade, valor_centavos, condicao)
    values (devolucao.id, item.id, (linha ->> 'quantidade')::int, (linha ->> 'valor')::bigint, linha ->> 'condicao');
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      perform privado.lancar_movimento(venda.unidade_id, item.variante_id, (linha ->> 'quantidade')::int, 'devolucao', item.item_serializado_id,
        'Devolução nº ' || devolucao.numero || ': ' || trim(p_motivo), 'devolucao', devolucao.id::text,
        'devolucao:' || devolucao.id || ':item:' || item.id, usuario);
      if item.item_serializado_id is not null then
        update public.itens_serializados s set condicao = linha ->> 'condicao' where s.id = item.item_serializado_id;
      end if;
    end if;
  end loop;

  for linha in select value from jsonb_array_elements(p_reembolsos) loop
    meio_reembolso := linha ->> 'meio';
    valor := (linha ->> 'valor')::bigint;
    insert into public.venda_devolucao_reembolsos (devolucao_id, meio, valor_centavos) values (devolucao.id, meio_reembolso, valor);
    if meio_reembolso <> 'vale_troca' then
      insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, motivo, usuario_id, chave_idempotencia)
      values (venda.organizacao_id, caixa.id, 'estorno', meio_reembolso, -valor, venda.id,
              'Devolução nº ' || devolucao.numero || ': ' || trim(p_motivo), usuario,
              'devolucao:' || devolucao.id || ':reembolso:' || meio_reembolso);
    end if;
  end loop;
  if em_vale > 0 then
    insert into public.vales_troca (organizacao_id, unidade_id, devolucao_id, valor_centavos, saldo_centavos, cliente_nome)
    values (venda.organizacao_id, venda.unidade_id, devolucao.id, em_vale, em_vale, venda.cliente_nome)
    returning * into vale;
  end if;
  update public.vendas v set devolvido_centavos = v.devolvido_centavos + total where v.id = venda.id;

  -- Fiscal: nota emitida pede nota de devolução; nota ainda não emitida recebe o aviso.
  select * into nota from public.notas_pedidos p where p.venda_id = venda.id and p.tipo = 'venda' and p.situacao <> 'cancelada';
  if found then
    if nota.situacao = 'emitida' then
      insert into public.notas_pedidos (organizacao_id, unidade_id, venda_id, venda_concluida_em, solicitado_por, chave, tipo, devolucao_id, observacao)
      values (venda.organizacao_id, venda.unidade_id, venda.id, now(), usuario, 'devolucao:' || devolucao.id, 'devolucao', devolucao.id,
              'Nota de devolução da devolução nº ' || devolucao.numero || ' (nota de origem ' || nota.chave_acesso || ')')
      returning * into nota;
      perform privado.nota_evento(nota, 'pedida', 'Devolução nº ' || devolucao.numero);
    else
      update public.notas_pedidos p
      set observacao = left(concat_ws(' · ', p.observacao, 'Devolução nº ' || devolucao.numero || ' antes da emissão: emitir só os itens que ficaram'), 500),
          atualizado_em = now()
      where p.id = nota.id;
      perform privado.nota_evento(nota, 'ajustada_por_devolucao', 'Devolução nº ' || devolucao.numero);
    end if;
  end if;

  return jsonb_build_object('devolucao', devolucao.id, 'numero', devolucao.numero, 'valor', total, 'vale', vale.numero, 'repetida', false);
end;
$$;

revoke all on function privado.proteger_venda_com_devolucao(), privado.vale_no_pagamento() from public, anon, authenticated;
revoke all on function public.devolver_itens(uuid, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.devolver_itens(uuid, jsonb, jsonb, text, text) to authenticated;
