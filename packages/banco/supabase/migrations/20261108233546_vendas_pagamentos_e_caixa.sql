-- =============================================================================
-- ADR-004 — Vendas, pagamentos e caixa (ORA-POS, ORA-PAY, ORA-FIN-001)
-- Proposto em 08/11/2026; aplicado só no desenvolvimento (prioridade do proprietário).
--
--   * Venda persistente desde o primeiro item; conclusão transacional e idempotente.
--   * Preço e custo do momento gravados; preço mudou no meio da venda = OR007.
--   * Desconto acima do limite da categoria (sem política = qualquer desconto) exige aprovação
--     de quem tem desconto.aprovar, nunca de quem pediu, válida por 30 min e só para o item igual.
--   * Pagamento misto: troco só do dinheiro; maquininha e Pix com comprovante (confirmação
--     manual registrada); link bloqueado até o provedor; PayJoy/Aiva = entrada + a receber.
--   * Caixa por pessoa e loja, só de inserção; fechamento com contagem e diferença.
--   * Cancelamento antes de concluir libera o estoque; depois, só a gerência, com estorno.
-- Ordem das travas: chave → venda → caixa → item serializado (por id) → reserva → saldo.
-- Códigos: OR007 preço mudou, OR008 sem caixa aberto, OR009 pagamento não confere,
--          OR010 desconto sem aprovação válida.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'ADR-004: cancelar venda concluída é da gerência', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('venda.cancelar', 'Cancelar venda concluída, com estorno', 'vendas');
  insert into public.papel_permissoes (papel, permissao)
  values ('dono', 'venda.cancelar'), ('gerente', 'venda.cancelar');
end;
$$;

create or replace function privado.so_insercao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Este registro só aceita inserção: corrija com um novo lançamento' using errcode = '42501';
end;
$$;

-- Os mesmos meios de packages/dominio/src/pagamento.ts.
create or replace function privado.meio_valido(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('dinheiro', 'pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro', 'link_pagamento', 'payjoy', 'aiva'); $$;

create or replace function privado.meio_financeira(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('payjoy', 'aiva'); $$;

-- Maquininha e Pix: a confirmação é manual e exige o código do comprovante.
create or replace function privado.meio_com_comprovante(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro'); $$;

-- -----------------------------------------------------------------------------
-- 1. Caixa
-- -----------------------------------------------------------------------------
create table public.caixas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  operador_id uuid not null references public.perfis_usuario (id),
  chave_abertura text not null check (length(trim(chave_abertura)) > 0),
  fundo_centavos bigint not null check (fundo_centavos >= 0),
  situacao text not null default 'aberto' check (situacao in ('aberto', 'fechado', 'conferido')),
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  esperado_centavos bigint,
  contado_centavos bigint check (contado_centavos >= 0),
  diferenca_centavos bigint,
  observacao_fechamento text,
  conferido_por uuid references public.perfis_usuario (id),
  conferido_em timestamptz,
  observacao_conferencia text,
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave_abertura)
);
create unique index caixas_um_aberto on public.caixas (unidade_id, operador_id) where situacao = 'aberto';
create index caixas_unidade on public.caixas (unidade_id, aberto_em desc);
create index caixas_operador on public.caixas (operador_id);
create index caixas_conferido_por on public.caixas (conferido_por);
create index caixas_organizacao on public.caixas (organizacao_id);

create table public.caixa_movimentos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  caixa_id uuid not null references public.caixas (id),
  tipo text not null check (tipo in ('fundo', 'suprimento', 'sangria', 'recebimento', 'troco', 'estorno')),
  meio text not null check (privado.meio_valido(meio)),
  valor_centavos bigint not null check (valor_centavos <> 0),
  venda_id uuid,
  pagamento_id uuid,
  motivo text,
  usuario_id uuid references public.perfis_usuario (id),
  chave_idempotencia text not null check (length(trim(chave_idempotencia)) > 0),
  ocorrido_em timestamptz not null default now(),
  constraint caixa_sinal_do_tipo check (
    (tipo in ('fundo', 'suprimento', 'recebimento') and valor_centavos > 0)
    or (tipo in ('sangria', 'troco', 'estorno') and valor_centavos < 0)),
  unique (organizacao_id, chave_idempotencia)
);
create index caixa_movimentos_caixa on public.caixa_movimentos (caixa_id, ocorrido_em);
create index caixa_movimentos_venda on public.caixa_movimentos (venda_id);
create index caixa_movimentos_usuario on public.caixa_movimentos (usuario_id);
create trigger caixa_movimentos_sem_alteracao before update or delete on public.caixa_movimentos
  for each row execute function privado.so_insercao();
create trigger caixa_movimentos_sem_truncate before truncate on public.caixa_movimentos
  for each statement execute function privado.so_insercao();

-- -----------------------------------------------------------------------------
-- 2. Vendas
-- -----------------------------------------------------------------------------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  vendedor_id uuid not null references public.perfis_usuario (id),
  canal text not null default 'loja' check (canal in ('loja', 'online')),
  chave_criacao text not null check (length(trim(chave_criacao)) > 0),
  cliente_nome text check (cliente_nome is null or length(trim(cliente_nome)) between 2 and 120),
  cliente_email text check (cliente_email is null or cliente_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  situacao text not null default 'rascunho'
    check (situacao in ('rascunho', 'aguardando_aprovacao', 'concluida', 'cancelada')),
  subtotal_centavos bigint,
  desconto_centavos bigint,
  total_centavos bigint,
  troco_centavos bigint,
  recebido_centavos bigint,
  a_receber_centavos bigint,
  caixa_id uuid references public.caixas (id),
  chave_conclusao text,
  conteudo_conclusao text,
  criado_em timestamptz not null default now(),
  concluida_em timestamptz,
  cancelada_em timestamptz,
  cancelada_por uuid references public.perfis_usuario (id),
  motivo_cancelamento text,
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave_criacao),
  unique (organizacao_id, chave_conclusao)
);
create index vendas_unidade on public.vendas (unidade_id, criado_em desc);
create index vendas_vendedor on public.vendas (vendedor_id, criado_em desc);
create index vendas_caixa on public.vendas (caixa_id);
create index vendas_cancelada_por on public.vendas (cancelada_por);
create index vendas_organizacao on public.vendas (organizacao_id);

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  chave text not null check (length(trim(chave)) > 0),
  variante_id uuid not null,
  item_serializado_id uuid references public.itens_serializados (id),
  tipo text not null,
  quantidade int not null check (quantidade > 0),
  preco_unitario_centavos bigint not null check (preco_unitario_centavos >= 0),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  reserva_id uuid references public.estoque_reservas (id),
  criado_em timestamptz not null default now(),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  constraint desconto_ate_o_preco check (desconto_centavos <= preco_unitario_centavos * quantidade),
  unique (venda_id, chave)
);
create index venda_itens_venda on public.venda_itens (venda_id);
create index venda_itens_variante on public.venda_itens (variante_id, organizacao_id);
create index venda_itens_item on public.venda_itens (item_serializado_id);
create index venda_itens_reserva on public.venda_itens (reserva_id);

-- Custo separado: só quem tem custo.ver lê (o vendedor nunca recebe custo).
create table public.venda_itens_custos (
  item_id uuid primary key references public.venda_itens (id) on delete cascade,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  custo_unitario_centavos bigint not null check (custo_unitario_centavos >= 0)
);
create index venda_itens_custos_unidade on public.venda_itens_custos (unidade_id);

create table public.aprovacoes_desconto (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  item_id uuid references public.venda_itens (id) on delete set null,
  conteudo text not null,
  preco_centavos bigint not null,
  desconto_centavos bigint not null,
  maximo_sem_aprovacao_centavos bigint not null,
  abaixo_do_custo boolean not null default false,
  motivo text not null check (length(trim(motivo)) >= 3),
  solicitado_por uuid not null references public.perfis_usuario (id),
  solicitado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovada', 'negada', 'invalidada')),
  decidido_por uuid references public.perfis_usuario (id),
  decidido_em timestamptz,
  observacao text,
  constraint ninguem_aprova_o_proprio check (decidido_por is null or decidido_por <> solicitado_por)
);
create index aprovacoes_venda on public.aprovacoes_desconto (venda_id);
create index aprovacoes_item on public.aprovacoes_desconto (item_id);
create index aprovacoes_pendentes on public.aprovacoes_desconto (unidade_id, solicitado_em) where situacao = 'pendente';
create index aprovacoes_solicitado_por on public.aprovacoes_desconto (solicitado_por);
create index aprovacoes_decidido_por on public.aprovacoes_desconto (decidido_por);

create table public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  ordem int not null,
  meio text not null check (privado.meio_valido(meio)),
  valor_centavos bigint not null check (valor_centavos > 0),
  entrada_centavos bigint not null default 0 check (entrada_centavos >= 0),
  meio_entrada text check (meio_entrada is null or (privado.meio_valido(meio_entrada) and not privado.meio_financeira(meio_entrada))),
  comprovante text,
  confirmacao text not null check (confirmacao in ('caixa', 'manual', 'provedor', 'financeira')),
  confirmado_por uuid references public.perfis_usuario (id),
  situacao text not null default 'confirmado' check (situacao in ('confirmado', 'estornado')),
  estornado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint entrada_ate_o_valor check (entrada_centavos <= valor_centavos),
  unique (venda_id, ordem)
);
create index venda_pagamentos_venda on public.venda_pagamentos (venda_id);
create index venda_pagamentos_confirmado_por on public.venda_pagamentos (confirmado_por);

create table public.contas_a_receber (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  pagamento_id uuid not null references public.venda_pagamentos (id),
  devedor text not null check (devedor in ('payjoy', 'aiva')),
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'recebida', 'cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index contas_a_receber_venda on public.contas_a_receber (venda_id);
create index contas_a_receber_pagamento on public.contas_a_receber (pagamento_id);
create index contas_a_receber_abertas on public.contas_a_receber (organizacao_id, devedor) where situacao = 'aberta';

create trigger caixas_auditar after insert or update on public.caixas for each row execute function privado.auditar_mudanca();
create trigger vendas_auditar after insert or update on public.vendas for each row execute function privado.auditar_mudanca();
create trigger aprovacoes_auditar after insert or update on public.aprovacoes_desconto for each row execute function privado.auditar_mudanca();
create trigger venda_pagamentos_auditar after insert or update on public.venda_pagamentos for each row execute function privado.auditar_mudanca();
create trigger contas_a_receber_auditar after insert or update on public.contas_a_receber for each row execute function privado.auditar_mudanca();

-- -----------------------------------------------------------------------------
-- 3. Leitura (RLS): vendedor vê as próprias; gerência vê a loja; custo só com custo.ver
-- -----------------------------------------------------------------------------
alter table public.caixas enable row level security;
alter table public.caixa_movimentos enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.venda_itens_custos enable row level security;
alter table public.aprovacoes_desconto enable row level security;
alter table public.venda_pagamentos enable row level security;
alter table public.contas_a_receber enable row level security;
revoke all on public.caixas, public.caixa_movimentos, public.vendas, public.venda_itens, public.venda_itens_custos,
  public.aprovacoes_desconto, public.venda_pagamentos, public.contas_a_receber from anon, authenticated;
revoke all on sequence public.caixa_movimentos_id_seq, public.vendas_numero_seq from anon, authenticated;
grant select on public.caixas, public.caixa_movimentos, public.vendas, public.venda_itens, public.venda_itens_custos,
  public.aprovacoes_desconto, public.venda_pagamentos, public.contas_a_receber to authenticated;

create policy caixas_ler on public.caixas for select to authenticated
  using ((operador_id = (select auth.uid()) and unidade_id in (select privado.unidades_visiveis()))
         or (select public.tem_permissao('caixa.conferir', unidade_id)));
create policy caixa_movimentos_ler on public.caixa_movimentos for select to authenticated
  using (caixa_id in (select c.id from public.caixas c));
create policy vendas_ler on public.vendas for select to authenticated
  using ((vendedor_id = (select auth.uid()) and unidade_id in (select privado.unidades_visiveis()))
         or (select public.tem_permissao('venda.ver_unidade', unidade_id))
         or (select public.tem_permissao('venda.ver_todas', unidade_id)));
create policy venda_itens_ler on public.venda_itens for select to authenticated
  using (venda_id in (select v.id from public.vendas v));
create policy venda_itens_custos_ler on public.venda_itens_custos for select to authenticated
  using ((select public.tem_permissao('custo.ver', unidade_id)));
create policy aprovacoes_ler on public.aprovacoes_desconto for select to authenticated
  using (solicitado_por = (select auth.uid()) or (select public.tem_permissao('desconto.aprovar', unidade_id)));
create policy venda_pagamentos_ler on public.venda_pagamentos for select to authenticated
  using (venda_id in (select v.id from public.vendas v));
create policy contas_a_receber_ler on public.contas_a_receber for select to authenticated
  using (venda_id in (select v.id from public.vendas v));

-- -----------------------------------------------------------------------------
-- 4. Caixa: abrir, suprir/sangrar, fechar, conferir
-- -----------------------------------------------------------------------------
create or replace function privado.dinheiro_no_caixa(p_caixa uuid)
returns bigint language sql stable security definer set search_path = ''
as $$ select coalesce(sum(m.valor_centavos), 0)::bigint from public.caixa_movimentos m where m.caixa_id = p_caixa and m.meio = 'dinheiro'; $$;

create or replace function public.abrir_caixa(p_fundo bigint, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  existente public.caixas;
  novo uuid;
begin
  if unidade is null or not (select public.tem_permissao('caixa.abrir', unidade)) then
    raise exception 'Sem permissão para abrir caixa nesta loja' using errcode = '42501';
  end if;
  if p_fundo is null or p_fundo < 0 then
    raise exception 'Fundo de troco inválido' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  perform pg_advisory_xact_lock(privado.trava_da_chave('caixas', organizacao, p_chave));
  select * into existente from public.caixas c where c.organizacao_id = organizacao and c.chave_abertura = p_chave;
  if found then
    if existente.operador_id <> usuario or existente.unidade_id <> unidade or existente.fundo_centavos <> p_fundo then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if exists (select 1 from public.caixas c where c.unidade_id = unidade and c.operador_id = usuario and c.situacao = 'aberto') then
    raise exception 'Você já tem um caixa aberto nesta loja' using errcode = '23505';
  end if;
  insert into public.caixas (organizacao_id, unidade_id, operador_id, chave_abertura, fundo_centavos)
  values (organizacao, unidade, usuario, p_chave, p_fundo)
  returning id into novo;
  if p_fundo > 0 then
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, motivo, usuario_id, chave_idempotencia)
    values (organizacao, novo, 'fundo', 'dinheiro', p_fundo, 'Fundo de troco', usuario, 'caixa:' || novo || ':fundo');
  end if;
  return novo;
end;
$$;

-- Caixa aberto da pessoa na loja da sessão, travado (ordem: depois da venda, antes dos itens).
create or replace function privado.meu_caixa_aberto()
returns public.caixas
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caixa public.caixas;
begin
  select * into caixa from public.caixas c
  where c.unidade_id = (select public.unidade_atual()) and c.operador_id = (select auth.uid()) and c.situacao = 'aberto'
  for update;
  if not found then
    raise exception 'Abra o seu caixa nesta loja antes' using errcode = 'OR008';
  end if;
  return caixa;
end;
$$;

create or replace function public.movimentar_caixa(p_tipo text, p_valor bigint, p_motivo text, p_chave text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  caixa public.caixas;
  existente public.caixa_movimentos;
  valor bigint;
  novo bigint;
begin
  if p_tipo is null or p_tipo not in ('suprimento', 'sangria') then
    raise exception 'Use suprimento ou sangria' using errcode = '22023';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if (select public.unidade_atual()) is null or not (select public.tem_permissao('caixa.abrir', (select public.unidade_atual()))) then
    raise exception 'Sem permissão para mexer em caixa nesta loja' using errcode = '42501';
  end if;
  valor := case p_tipo when 'sangria' then -p_valor else p_valor end;
  caixa := privado.meu_caixa_aberto();
  perform pg_advisory_xact_lock(privado.trava_da_chave('caixa_movimentos', caixa.organizacao_id, p_chave));
  select * into existente from public.caixa_movimentos m where m.organizacao_id = caixa.organizacao_id and m.chave_idempotencia = p_chave;
  if found then
    if existente.caixa_id <> caixa.id or existente.tipo <> p_tipo or existente.valor_centavos <> valor then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if p_tipo = 'sangria' and privado.dinheiro_no_caixa(caixa.id) < p_valor then
    raise exception 'A sangria passa do dinheiro que há no caixa' using errcode = '23514';
  end if;
  insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, motivo, usuario_id, chave_idempotencia)
  values (caixa.organizacao_id, caixa.id, p_tipo, 'dinheiro', valor, trim(p_motivo), usuario, p_chave)
  returning id into novo;
  return novo;
end;
$$;

create or replace function public.fechar_caixa(p_contado bigint, p_observacao text)
returns table (esperado bigint, contado bigint, diferenca bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caixa public.caixas;
  previsto bigint;
begin
  if p_contado is null or p_contado < 0 then
    raise exception 'Informe o dinheiro contado' using errcode = '22023';
  end if;
  if (select public.unidade_atual()) is null or not (select public.tem_permissao('caixa.abrir', (select public.unidade_atual()))) then
    raise exception 'Sem permissão para mexer em caixa nesta loja' using errcode = '42501';
  end if;
  caixa := privado.meu_caixa_aberto();
  previsto := privado.dinheiro_no_caixa(caixa.id);
  if p_contado <> previsto and (p_observacao is null or length(trim(p_observacao)) < 3) then
    raise exception 'Explique a diferença do caixa' using errcode = '22023';
  end if;
  update public.caixas c
  set situacao = 'fechado', fechado_em = now(), esperado_centavos = previsto, contado_centavos = p_contado,
      diferenca_centavos = p_contado - previsto, observacao_fechamento = nullif(trim(coalesce(p_observacao, '')), '')
  where c.id = caixa.id;
  return query select previsto, p_contado, p_contado - previsto;
end;
$$;

create or replace function public.conferir_caixa(p_caixa uuid, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  caixa public.caixas;
begin
  select * into caixa from public.caixas c where c.id = p_caixa for update;
  if not found or not (select public.tem_permissao('caixa.conferir', caixa.unidade_id)) then
    raise exception 'Caixa não encontrado' using errcode = 'P0002';
  end if;
  if caixa.operador_id = usuario then
    raise exception 'Ninguém confere o próprio caixa' using errcode = '42501';
  end if;
  if caixa.situacao <> 'fechado' then
    return false;
  end if;
  update public.caixas c
  set situacao = 'conferido', conferido_por = usuario, conferido_em = now(), observacao_conferencia = nullif(trim(coalesce(p_observacao, '')), '')
  where c.id = caixa.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Venda: criar, itens, desconto e aprovação
-- -----------------------------------------------------------------------------
create or replace function public.criar_venda(p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  existente public.vendas;
  nova uuid;
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  perform pg_advisory_xact_lock(privado.trava_da_chave('vendas', organizacao, p_chave));
  select * into existente from public.vendas v where v.organizacao_id = organizacao and v.chave_criacao = p_chave;
  if found then
    if existente.vendedor_id <> usuario or existente.unidade_id <> unidade then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  insert into public.vendas (organizacao_id, unidade_id, vendedor_id, chave_criacao)
  values (organizacao, unidade, usuario, p_chave)
  returning id into nova;
  return nova;
end;
$$;

-- Venda em aberto da própria pessoa, na loja da sessão, travada (primeira trava depois da chave).
create or replace function privado.minha_venda_aberta(p_venda uuid)
returns public.vendas
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  venda public.vendas;
begin
  select * into venda from public.vendas v where v.id = p_venda for update;
  if not found or venda.vendedor_id <> (select auth.uid()) or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.registrar', venda.unidade_id)) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if venda.situacao not in ('rascunho', 'aguardando_aprovacao') then
    raise exception 'Esta venda não está mais aberta (%)', venda.situacao using errcode = '22023';
  end if;
  return venda;
end;
$$;

create or replace function privado.conteudo_do_item(p_item public.venda_itens)
returns text language sql immutable set search_path = ''
as $$ select md5(concat_ws('|', p_item.variante_id, p_item.item_serializado_id, p_item.quantidade, p_item.preco_unitario_centavos, p_item.desconto_centavos)); $$;

-- Desconto que o vendedor dá sem pedir (mesma regra de packages/dominio/src/desconto.ts, com taxa
-- do meio = 0 até as taxas serem configuradas). Sem política na categoria ou sem custo: zero.
create or replace function privado.maximo_sem_aprovacao(p_item public.venda_itens)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  teto_pb int;
  margem_pb int;
  custo bigint;
  preco bigint := p_item.preco_unitario_centavos * p_item.quantidade;
  fator bigint;
  teto bigint;
  preco_minimo bigint;
  pela_margem bigint;
begin
  select c.desconto_teto_pb, c.margem_minima_pb into teto_pb, margem_pb
  from public.variantes v join public.produtos p on p.id = v.produto_id join public.categorias c on c.id = p.categoria_id
  where v.id = p_item.variante_id;
  select x.custo_unitario_centavos * p_item.quantidade into custo from public.venda_itens_custos x where x.item_id = p_item.id;
  if teto_pb is null or margem_pb is null or custo is null then
    return 0;
  end if;
  fator := 10000 - margem_pb;
  teto := (preco * teto_pb) / 10000;
  if fator <= 0 then
    return 0;
  end if;
  preco_minimo := (custo * 10000 + fator - 1) / fator;
  pela_margem := case when preco_minimo < preco then preco - preco_minimo else 0 end;
  return least(pela_margem, teto);
end;
$$;

create or replace function privado.abaixo_do_custo(p_item public.venda_itens)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p_item.preco_unitario_centavos * p_item.quantidade - p_item.desconto_centavos < x.custo_unitario_centavos * p_item.quantidade
                   from public.venda_itens_custos x where x.item_id = p_item.id), false);
$$;

create or replace function public.adicionar_item(p_venda uuid, p_variante uuid, p_item uuid, p_quantidade int, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  venda public.vendas;
  existente public.venda_itens;
  tipo text;
  preco bigint;
  custo bigint;
  quantidade int;
  reserva uuid;
  novo uuid;
begin
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  venda := privado.minha_venda_aberta(p_venda);
  select * into existente from public.venda_itens i where i.venda_id = venda.id and i.chave = p_chave;
  if found then
    if existente.variante_id <> p_variante or existente.item_serializado_id is distinct from p_item
       or existente.quantidade <> coalesce(p_quantidade, 1) then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  select p.tipo into tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.organizacao_id = venda.organizacao_id and v.ativa and p.ativo;
  if tipo is null then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  preco := public.preco_vigente(p_variante, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end);
  if preco is null then
    raise exception 'Produto sem preço nesta loja' using errcode = 'P0002';
  end if;
  select c.valor_centavos into custo from public.custos c
  where c.variante_id = p_variante and c.inicio <= now() order by c.inicio desc limit 1;
  quantidade := case when tipo in ('aparelho', 'chip') then 1 else coalesce(p_quantidade, 1) end;
  if quantidade < 1 or (tipo in ('aparelho', 'chip') and coalesce(p_quantidade, 1) <> 1) then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  if tipo in ('aparelho', 'chip', 'acessorio') then
    reserva := public.reservar_estoque(p_variante, quantidade, p_item, 'venda:' || venda.id || ':' || p_chave,
                                       case venda.canal when 'online' then 'online' else 'pdv' end, 30);
  elsif p_item is not null then
    raise exception 'Serviço não tem IMEI/ICCID' using errcode = '22023';
  end if;
  insert into public.venda_itens (organizacao_id, venda_id, chave, variante_id, item_serializado_id, tipo, quantidade, preco_unitario_centavos, reserva_id)
  values (venda.organizacao_id, venda.id, p_chave, p_variante, p_item, tipo, quantidade, preco, reserva)
  returning id into novo;
  if custo is not null then
    insert into public.venda_itens_custos (item_id, organizacao_id, unidade_id, custo_unitario_centavos)
    values (novo, venda.organizacao_id, venda.unidade_id, custo);
  end if;
  return novo;
end;
$$;

create or replace function public.remover_item(p_item uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item public.venda_itens;
  venda public.vendas;
begin
  select * into item from public.venda_itens i where i.id = p_item;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  venda := privado.minha_venda_aberta(item.venda_id);
  if item.reserva_id is not null then
    perform privado.encerrar_reserva(item.reserva_id, 'liberada');
  end if;
  update public.aprovacoes_desconto a set situacao = 'invalidada'
  where a.item_id = item.id and a.situacao in ('pendente', 'aprovada');
  delete from public.venda_itens i where i.id = item.id;
  perform privado.atualizar_espera_de_aprovacao(venda.id);
  return true;
end;
$$;

-- A venda fica "aguardando aprovação" enquanto houver pedido pendente.
create or replace function privado.atualizar_espera_de_aprovacao(p_venda uuid)
returns void language sql volatile security definer set search_path = ''
as $$
  update public.vendas v
  set situacao = case when exists (select 1 from public.aprovacoes_desconto a where a.venda_id = v.id and a.situacao = 'pendente')
                      then 'aguardando_aprovacao' else 'rascunho' end
  where v.id = p_venda and v.situacao in ('rascunho', 'aguardando_aprovacao');
$$;

-- Aplica o desconto pedido e diz se cabe no limite. Mudar o desconto invalida aprovação anterior.
create or replace function public.aplicar_desconto(p_item uuid, p_desconto bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item public.venda_itens;
  venda public.vendas;
begin
  select * into item from public.venda_itens i where i.id = p_item;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  venda := privado.minha_venda_aberta(item.venda_id);
  if not (select public.tem_permissao('desconto.dar', venda.unidade_id)) and coalesce(p_desconto, 0) > 0 then
    raise exception 'Sem permissão para dar desconto' using errcode = '42501';
  end if;
  if p_desconto is null or p_desconto < 0 or p_desconto > item.preco_unitario_centavos * item.quantidade then
    raise exception 'Desconto inválido' using errcode = '22023';
  end if;
  update public.venda_itens i set desconto_centavos = p_desconto where i.id = item.id returning * into item;
  update public.aprovacoes_desconto a set situacao = 'invalidada'
  where a.item_id = item.id and a.situacao in ('pendente', 'aprovada') and a.conteudo <> privado.conteudo_do_item(item);
  perform privado.atualizar_espera_de_aprovacao(venda.id);
  return case
    when p_desconto = 0 then 'sem_desconto'
    when privado.abaixo_do_custo(item) then 'abaixo_do_custo'
    when p_desconto <= privado.maximo_sem_aprovacao(item) then 'dentro_do_limite'
    else 'precisa_aprovacao' end;
end;
$$;

create or replace function public.pedir_aprovacao(p_item uuid, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item public.venda_itens;
  venda public.vendas;
  maximo bigint;
  existente uuid;
  nova uuid;
begin
  select * into item from public.venda_itens i where i.id = p_item;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  venda := privado.minha_venda_aberta(item.venda_id);
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  maximo := privado.maximo_sem_aprovacao(item);
  if item.desconto_centavos <= maximo and not privado.abaixo_do_custo(item) then
    raise exception 'Este desconto não precisa de aprovação' using errcode = '22023';
  end if;
  select a.id into existente from public.aprovacoes_desconto a
  where a.item_id = item.id and a.situacao = 'pendente' and a.conteudo = privado.conteudo_do_item(item) and a.expira_em > now();
  if found then
    return existente;
  end if;
  insert into public.aprovacoes_desconto (organizacao_id, unidade_id, venda_id, item_id, conteudo, preco_centavos, desconto_centavos,
    maximo_sem_aprovacao_centavos, abaixo_do_custo, motivo, solicitado_por, expira_em)
  values (venda.organizacao_id, venda.unidade_id, venda.id, item.id, privado.conteudo_do_item(item),
    item.preco_unitario_centavos * item.quantidade, item.desconto_centavos, maximo, privado.abaixo_do_custo(item),
    trim(p_motivo), (select auth.uid()), now() + interval '30 minutes')
  returning id into nova;
  perform privado.atualizar_espera_de_aprovacao(venda.id);
  return nova;
end;
$$;

create or replace function public.decidir_aprovacao(p_aprovacao uuid, p_aprovar boolean, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  pedido public.aprovacoes_desconto;
  item public.venda_itens;
begin
  select * into pedido from public.aprovacoes_desconto a where a.id = p_aprovacao for update;
  if not found or not (select public.tem_permissao('desconto.aprovar', pedido.unidade_id)) then
    raise exception 'Pedido de aprovação não encontrado' using errcode = 'P0002';
  end if;
  if pedido.solicitado_por = usuario then
    raise exception 'Ninguém aprova o próprio desconto' using errcode = '42501';
  end if;
  if p_aprovar is null then
    raise exception 'Diga se aprova ou nega' using errcode = '22023';
  end if;
  if pedido.situacao <> 'pendente' then
    return false;
  end if;
  select * into item from public.venda_itens i where i.id = pedido.item_id;
  if pedido.expira_em <= now() or not found or privado.conteudo_do_item(item) <> pedido.conteudo then
    update public.aprovacoes_desconto a set situacao = 'invalidada' where a.id = pedido.id;
    perform privado.atualizar_espera_de_aprovacao(pedido.venda_id);
    return false;
  end if;
  update public.aprovacoes_desconto a
  set situacao = case when p_aprovar then 'aprovada' else 'negada' end, decidido_por = usuario, decidido_em = now(),
      observacao = nullif(trim(coalesce(p_observacao, '')), '')
  where a.id = pedido.id;
  perform privado.atualizar_espera_de_aprovacao(pedido.venda_id);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Conclusão transacional e idempotente
-- -----------------------------------------------------------------------------
-- p_pagamentos: [{"meio": "...", "valor": centavos, "entrada": centavos, "meio_entrada": "...",
--                 "comprovante": "..."}]. p_cliente: {"nome": "...", "email": "..."} (opcional).
create or replace function public.concluir_venda(p_venda uuid, p_pagamentos jsonb, p_cliente jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  conteudo text;
  venda public.vendas;
  caixa public.caixas;
  item public.venda_itens;
  pagamento jsonb;
  ordem int := 0;
  meio text;
  valor bigint;
  entrada bigint;
  meio_entrada text;
  comprovante text;
  subtotal bigint := 0;
  descontos bigint := 0;
  total bigint;
  recebido bigint := 0;
  a_receber bigint := 0;
  em_dinheiro bigint := 0;
  excedente bigint;
  troco bigint;
  email text := nullif(lower(trim(coalesce(p_cliente ->> 'email', ''))), '');
  nome text := nullif(trim(coalesce(p_cliente ->> 'nome', '')), '');
  pagamento_id uuid;
  reserva public.estoque_reservas;
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta loja' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe ao menos um pagamento' using errcode = 'OR009';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  conteudo := md5(concat_ws('|', p_venda, p_pagamentos::text, coalesce(p_cliente, '{}'::jsonb)::text));

  -- (0) chave: a repetição devolve o mesmo resultado; outro conteúdo, OR004
  perform pg_advisory_xact_lock(privado.trava_da_chave('vendas_conclusao', organizacao, p_chave));
  select * into venda from public.vendas v where v.organizacao_id = organizacao and v.chave_conclusao = p_chave;
  if found then
    if venda.conteudo_conclusao <> conteudo or venda.vendedor_id <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', venda.total_centavos, 'troco', venda.troco_centavos,
                              'recebido', venda.recebido_centavos, 'a_receber', venda.a_receber_centavos, 'repetida', true);
  end if;

  -- (1) venda, (2) caixa
  venda := privado.minha_venda_aberta(p_venda);
  if venda.situacao = 'aguardando_aprovacao' then
    raise exception 'Há desconto aguardando aprovação' using errcode = 'OR010';
  end if;
  if not exists (select 1 from public.venda_itens i where i.venda_id = venda.id) then
    raise exception 'A venda não tem itens' using errcode = '22023';
  end if;
  caixa := privado.meu_caixa_aberto();
  if email is not null and email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail do cliente inválido' using errcode = '22023';
  end if;

  -- (3) itens serializados em ordem de id
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.venda_itens i where i.venda_id = venda.id and i.item_serializado_id is not null)
  order by s.id for update;

  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if public.preco_vigente(item.variante_id, venda.unidade_id, case venda.canal when 'online' then 'online' else 'loja' end)
       is distinct from item.preco_unitario_centavos then
      raise exception 'O preço de um item mudou: confira o carrinho' using errcode = 'OR007';
    end if;
    if (item.desconto_centavos > privado.maximo_sem_aprovacao(item) or privado.abaixo_do_custo(item)) and not exists (
         select 1 from public.aprovacoes_desconto a
         where a.item_id = item.id and a.situacao = 'aprovada' and a.conteudo = privado.conteudo_do_item(item) and a.expira_em > now()) then
      raise exception 'Desconto sem aprovação válida' using errcode = 'OR010';
    end if;
    if item.reserva_id is not null then
      select * into reserva from public.estoque_reservas r where r.id = item.reserva_id;
      if reserva.situacao <> 'ativa' or reserva.expira_em <= now() then
        raise exception 'A reserva de um item venceu: tire e coloque de novo' using errcode = 'OR002';
      end if;
    end if;
    subtotal := subtotal + item.preco_unitario_centavos * item.quantidade;
    descontos := descontos + item.desconto_centavos;
  end loop;
  total := subtotal - descontos;

  -- Pagamentos: a mesma regra de packages/dominio/src/pagamento.ts
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    meio := pagamento ->> 'meio';
    if meio is null or not privado.meio_valido(meio) then
      raise exception 'Meio de pagamento desconhecido' using errcode = 'OR009';
    end if;
    if meio = 'link_pagamento' then
      raise exception 'Link de pagamento ainda não integrado: use outro meio' using errcode = 'OR009';
    end if;
    begin
      valor := (pagamento ->> 'valor')::bigint;
      entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    exception when others then
      raise exception 'Valor de pagamento inválido' using errcode = 'OR009';
    end;
    if valor is null or valor <= 0 or entrada < 0 or entrada > valor then
      raise exception 'Valor de pagamento inválido' using errcode = 'OR009';
    end if;
    if privado.meio_com_comprovante(meio) and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
      raise exception 'Informe o código do comprovante' using errcode = 'OR009';
    end if;
    if privado.meio_financeira(meio) then
      if meio = 'payjoy' and email is null then
        raise exception 'PayJoy exige o e-mail do cliente' using errcode = 'OR009';
      end if;
      meio_entrada := case when entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
      if meio_entrada is not null and (not privado.meio_valido(meio_entrada) or privado.meio_financeira(meio_entrada) or meio_entrada = 'link_pagamento') then
        raise exception 'Meio da entrada inválido' using errcode = 'OR009';
      end if;
      recebido := recebido + entrada;
      a_receber := a_receber + valor - entrada;
      if meio_entrada = 'dinheiro' then
        em_dinheiro := em_dinheiro + entrada;
      end if;
    else
      if entrada <> 0 then
        raise exception 'Entrada só existe em financiamento' using errcode = 'OR009';
      end if;
      recebido := recebido + valor;
      if meio = 'dinheiro' then
        em_dinheiro := em_dinheiro + valor;
      end if;
    end if;
  end loop;
  excedente := greatest(0, recebido + a_receber - total);
  troco := least(excedente, em_dinheiro);
  if excedente > troco then
    raise exception 'Pagamento maior que o total sem dinheiro para dar troco' using errcode = 'OR009';
  end if;
  if recebido + a_receber < total then
    raise exception 'Falta pagar %', total - recebido - a_receber using errcode = 'OR009';
  end if;

  -- Estoque: consome as reservas e lança a saída "venda" (reserva e saldo vêm depois dos itens)
  for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
    if item.reserva_id is not null then
      perform privado.encerrar_reserva(item.reserva_id, 'consumida');
    end if;
    if item.tipo in ('aparelho', 'chip', 'acessorio') then
      perform privado.lancar_movimento(venda.unidade_id, item.variante_id, -item.quantidade, 'venda', item.item_serializado_id,
        null, 'venda', venda.id::text, 'venda:' || venda.id || ':item:' || item.id, usuario);
    end if;
  end loop;

  -- Pagamentos, caixa e valores a receber
  for pagamento in select value from jsonb_array_elements(p_pagamentos) loop
    ordem := ordem + 1;
    meio := pagamento ->> 'meio';
    valor := (pagamento ->> 'valor')::bigint;
    entrada := coalesce((pagamento ->> 'entrada')::bigint, 0);
    meio_entrada := case when privado.meio_financeira(meio) and entrada > 0 then coalesce(pagamento ->> 'meio_entrada', 'dinheiro') end;
    comprovante := nullif(trim(coalesce(pagamento ->> 'comprovante', '')), '');
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, meio_entrada, comprovante, confirmacao, confirmado_por)
    values (venda.organizacao_id, venda.id, ordem, meio, valor, entrada, meio_entrada, comprovante,
            case when meio = 'dinheiro' then 'caixa' when privado.meio_financeira(meio) then 'financeira' else 'manual' end, usuario)
    returning id into pagamento_id;
    if privado.meio_financeira(meio) then
      if entrada > 0 then
        insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
        values (venda.organizacao_id, caixa.id, 'recebimento', meio_entrada, entrada, venda.id, pagamento_id, usuario, 'venda:' || venda.id || ':pagamento:' || ordem);
      end if;
      if valor - entrada > 0 then
        insert into public.contas_a_receber (organizacao_id, unidade_id, venda_id, pagamento_id, devedor, valor_centavos)
        values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento_id, meio, valor - entrada);
      end if;
    else
      insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, usuario_id, chave_idempotencia)
      values (venda.organizacao_id, caixa.id, 'recebimento', meio, valor, venda.id, pagamento_id, usuario, 'venda:' || venda.id || ':pagamento:' || ordem);
    end if;
  end loop;
  if troco > 0 then
    insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, usuario_id, chave_idempotencia)
    values (venda.organizacao_id, caixa.id, 'troco', 'dinheiro', -troco, venda.id, usuario, 'venda:' || venda.id || ':troco');
  end if;

  update public.vendas v
  set situacao = 'concluida', concluida_em = now(), subtotal_centavos = subtotal, desconto_centavos = descontos, total_centavos = total,
      troco_centavos = troco, recebido_centavos = recebido - troco, a_receber_centavos = a_receber, caixa_id = caixa.id,
      chave_conclusao = p_chave, conteudo_conclusao = conteudo,
      cliente_nome = coalesce(nome, v.cliente_nome), cliente_email = coalesce(email, v.cliente_email)
  where v.id = venda.id
  returning * into venda;
  return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', total, 'troco', troco,
                            'recebido', recebido - troco, 'a_receber', a_receber, 'repetida', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Cancelamento: antes de concluir libera o estoque; depois, estorno pela gerência
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_venda(p_venda uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  venda public.vendas;
  caixa public.caixas;
  item public.venda_itens;
  pagamento public.venda_pagamentos;
  troco_a_descontar bigint;
  devolver bigint;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = p_venda for update;
  if not found or venda.unidade_id is distinct from (select public.unidade_atual())
     or not ((venda.vendedor_id = usuario and venda.situacao in ('rascunho', 'aguardando_aprovacao')
              and (select public.tem_permissao('venda.registrar', venda.unidade_id)))
             or (select public.tem_permissao('venda.cancelar', venda.unidade_id))) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if venda.situacao = 'cancelada' then
    return false;
  end if;

  if venda.situacao in ('rascunho', 'aguardando_aprovacao') then
    for item in select * from public.venda_itens i where i.venda_id = venda.id loop
      if item.reserva_id is not null then
        perform privado.encerrar_reserva(item.reserva_id, 'liberada');
      end if;
    end loop;
    update public.aprovacoes_desconto a set situacao = 'invalidada' where a.venda_id = venda.id and a.situacao in ('pendente', 'aprovada');
  else
    -- Concluída: estorno no caixa de quem cancela, devolução ao estoque e a receber cancelado.
    caixa := privado.meu_caixa_aberto();
    perform 1 from public.itens_serializados s
    where s.id in (select i.item_serializado_id from public.venda_itens i where i.venda_id = venda.id and i.item_serializado_id is not null)
    order by s.id for update;
    for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
      if item.tipo in ('aparelho', 'chip', 'acessorio') then
        perform privado.lancar_movimento(venda.unidade_id, item.variante_id, item.quantidade, 'devolucao', item.item_serializado_id,
          'Cancelamento: ' || trim(p_motivo), 'venda', venda.id::text, 'venda:' || venda.id || ':cancelamento:' || item.id, usuario);
      end if;
    end loop;
    troco_a_descontar := coalesce(venda.troco_centavos, 0);
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      if privado.meio_financeira(pagamento.meio) then
        if pagamento.entrada_centavos > 0 then
          insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, motivo, usuario_id, chave_idempotencia)
          values (venda.organizacao_id, caixa.id, 'estorno', pagamento.meio_entrada, -pagamento.entrada_centavos, venda.id, pagamento.id,
                  trim(p_motivo), usuario, 'venda:' || venda.id || ':estorno:' || pagamento.ordem);
        end if;
        update public.contas_a_receber r set situacao = 'cancelada', atualizado_em = now() where r.pagamento_id = pagamento.id and r.situacao = 'aberta';
      else
        -- Dinheiro: devolve o que ficou na loja (o troco já saiu uma vez, da primeira linha em dinheiro).
        devolver := pagamento.valor_centavos;
        if pagamento.meio = 'dinheiro' and troco_a_descontar > 0 then
          devolver := devolver - least(devolver, troco_a_descontar);
          troco_a_descontar := troco_a_descontar - least(pagamento.valor_centavos, troco_a_descontar);
        end if;
        if pagamento.meio = 'dinheiro' and devolver > privado.dinheiro_no_caixa(caixa.id) then
          raise exception 'Não há dinheiro suficiente no seu caixa para devolver' using errcode = '23514';
        end if;
        if devolver > 0 then
          insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, motivo, usuario_id, chave_idempotencia)
          values (venda.organizacao_id, caixa.id, 'estorno', pagamento.meio, -devolver,
                  venda.id, pagamento.id, trim(p_motivo), usuario, 'venda:' || venda.id || ':estorno:' || pagamento.ordem);
        end if;
      end if;
      update public.venda_pagamentos p set situacao = 'estornado', estornado_em = now() where p.id = pagamento.id;
    end loop;
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  update public.vendas v
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = usuario, motivo_cancelamento = trim(p_motivo)
  where v.id = venda.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Privilégios
-- -----------------------------------------------------------------------------
revoke all on function privado.so_insercao(), privado.meio_valido(text), privado.meio_financeira(text),
  privado.meio_com_comprovante(text), privado.dinheiro_no_caixa(uuid), privado.meu_caixa_aberto(),
  privado.minha_venda_aberta(uuid), privado.conteudo_do_item(public.venda_itens), privado.maximo_sem_aprovacao(public.venda_itens),
  privado.abaixo_do_custo(public.venda_itens), privado.atualizar_espera_de_aprovacao(uuid)
  from public, anon, authenticated;

revoke all on function public.abrir_caixa(bigint, text), public.movimentar_caixa(text, bigint, text, text),
  public.fechar_caixa(bigint, text), public.conferir_caixa(uuid, text), public.criar_venda(text),
  public.adicionar_item(uuid, uuid, uuid, int, text), public.remover_item(uuid), public.aplicar_desconto(uuid, bigint),
  public.pedir_aprovacao(uuid, text), public.decidir_aprovacao(uuid, boolean, text),
  public.concluir_venda(uuid, jsonb, jsonb, text), public.cancelar_venda(uuid, text) from public, anon;
grant execute on function public.abrir_caixa(bigint, text), public.movimentar_caixa(text, bigint, text, text),
  public.fechar_caixa(bigint, text), public.conferir_caixa(uuid, text), public.criar_venda(text),
  public.adicionar_item(uuid, uuid, uuid, int, text), public.remover_item(uuid), public.aplicar_desconto(uuid, bigint),
  public.pedir_aprovacao(uuid, text), public.decidir_aprovacao(uuid, boolean, text),
  public.concluir_venda(uuid, jsonb, jsonb, text), public.cancelar_venda(uuid, text) to authenticated;
