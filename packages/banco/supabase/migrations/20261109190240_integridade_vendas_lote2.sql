-- =============================================================================
-- Lote 2 do prompt consolidado (09/11/2026) — dinheiro, estoque e aprovações
--   #46 (REV-044) entrada de financiamento por Pix/cartão exige comprovante.
--   #47 (REV-045) toda saída em dinheiro no cancelamento confere o saldo do caixa travado.
--   #48 (REV-046) troco só de linha em dinheiro (banco = packages/dominio/src/pagamento.ts).
--   #49 (REV-047) cancelamento devolve o dinheiro recebido líquido (troco distribuído).
--   #50 (REV-048) Pix, cartão e financeira: estorno a confirmar com comprovante (estornos_externos);
--                 vale também para o reembolso da devolução parcial.
--   #51 (REV-049) cancelamento não repõe estoque: retorno físico conferido (venda_retornos), com
--                 IMEI/ICCID e condição; a devolução parcial também confere o IMEI/ICCID.
--   #53 (REV-051) decidir_aprovacao trava a venda antes da aprovação.
--   #34 (REV-032) repetição da chave confere produto, condição e número de série.
-- Ordem das travas mantida: chave → venda → caixa → item serializado (por id) → reserva → saldo.
-- Funções recriadas a partir do texto aplicado, com as mudanças marcadas. Reversão em
-- supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estorno a confirmar (#50) e retorno físico a conferir (#51)
-- -----------------------------------------------------------------------------
alter table public.venda_pagamentos drop constraint venda_pagamentos_situacao_check;
alter table public.venda_pagamentos add constraint venda_pagamentos_situacao_check
  check (situacao in ('confirmado', 'estorno_pendente', 'estornado'));
alter table public.venda_pagamentos add constraint estornado_tem_data check ((situacao = 'estornado') = (estornado_em is not null));

create table public.estornos_externos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  pagamento_id uuid references public.venda_pagamentos (id),
  devolucao_id uuid references public.venda_devolucoes (id),
  meio text not null check (privado.meio_valido(meio) and meio not in ('dinheiro', 'vale_troca', 'link_pagamento')),
  valor_centavos bigint not null check (valor_centavos > 0),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'confirmado')),
  solicitado_por uuid not null references public.perfis_usuario (id),
  solicitado_em timestamptz not null default now(),
  confirmado_por uuid references public.perfis_usuario (id),
  confirmado_em timestamptz,
  comprovante text check (comprovante is null or length(trim(comprovante)) between 4 and 60),
  observacao text check (observacao is null or length(observacao) <= 500),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint estorno_de_uma_origem check ((pagamento_id is null) <> (devolucao_id is null)),
  constraint estorno_confirmado_com_prova check (
    (situacao = 'confirmado') = (confirmado_por is not null and confirmado_em is not null and comprovante is not null)),
  unique (pagamento_id, meio),
  unique (devolucao_id, meio)
);
create index estornos_externos_venda on public.estornos_externos (venda_id);
create index estornos_externos_devolucao on public.estornos_externos (devolucao_id);
create index estornos_externos_pendentes on public.estornos_externos (unidade_id, solicitado_em) where situacao = 'pendente';
create index estornos_externos_unidade_organizacao on public.estornos_externos (unidade_id, organizacao_id);
create index estornos_externos_solicitado_por on public.estornos_externos (solicitado_por);
create index estornos_externos_confirmado_por on public.estornos_externos (confirmado_por);

create table public.venda_retornos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  venda_item_id uuid not null unique references public.venda_itens (id),
  quantidade int not null check (quantidade > 0),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'recebido', 'nao_recebido')),
  motivo text not null check (length(trim(motivo)) >= 3),
  solicitado_por uuid not null references public.perfis_usuario (id),
  solicitado_em timestamptz not null default now(),
  conferido_por uuid references public.perfis_usuario (id),
  conferido_em timestamptz,
  condicao text check (condicao in ('novo', 'seminovo', 'avariado')),
  observacao text check (observacao is null or length(observacao) <= 500),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint retorno_conferido check ((situacao = 'pendente') = (conferido_por is null and conferido_em is null)),
  constraint retorno_recebido_com_condicao check ((situacao = 'recebido') = (condicao is not null))
);
create index venda_retornos_venda on public.venda_retornos (venda_id);
create index venda_retornos_pendentes on public.venda_retornos (unidade_id, solicitado_em) where situacao = 'pendente';
create index venda_retornos_unidade_organizacao on public.venda_retornos (unidade_id, organizacao_id);
create index venda_retornos_solicitado_por on public.venda_retornos (solicitado_por);
create index venda_retornos_conferido_por on public.venda_retornos (conferido_por);

-- Só a passagem de pendente para o desfecho; o resto é fixo e nada se apaga.
create or replace function privado.so_desfecho_do_pendente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Registro fixo: não se apaga' using errcode = '42501';
  end if;
  if old.situacao <> 'pendente' or new.situacao = 'pendente'
     or (to_jsonb(new) - array['situacao', 'confirmado_por', 'confirmado_em', 'comprovante', 'observacao', 'conferido_por', 'conferido_em', 'condicao'])
        is distinct from (to_jsonb(old) - array['situacao', 'confirmado_por', 'confirmado_em', 'comprovante', 'observacao', 'conferido_por', 'conferido_em', 'condicao']) then
    raise exception 'Registro fixo: só o pendente recebe o desfecho' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger estornos_externos_fixos before update or delete on public.estornos_externos
  for each row execute function privado.so_desfecho_do_pendente();
create trigger venda_retornos_fixos before update or delete on public.venda_retornos
  for each row execute function privado.so_desfecho_do_pendente();
create trigger estornos_externos_auditar after insert or update on public.estornos_externos
  for each row execute function privado.auditar_mudanca();
create trigger venda_retornos_auditar after insert or update on public.venda_retornos
  for each row execute function privado.auditar_mudanca();

alter table public.estornos_externos enable row level security;
alter table public.venda_retornos enable row level security;
revoke all on public.estornos_externos, public.venda_retornos from anon, authenticated;
revoke all on sequence public.estornos_externos_numero_seq from anon, authenticated;
grant select on public.estornos_externos, public.venda_retornos to authenticated;
create policy estornos_externos_ler on public.estornos_externos for select to authenticated
  using (venda_id in (select v.id from public.vendas v));
create policy venda_retornos_ler on public.venda_retornos for select to authenticated
  using (venda_id in (select v.id from public.vendas v));

-- -----------------------------------------------------------------------------
-- 2. Funções recriadas
-- -----------------------------------------------------------------------------
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
      if meio_entrada is not null and (not privado.meio_valido(meio_entrada) or privado.meio_financeira(meio_entrada)
                                       or meio_entrada in ('link_pagamento', 'vale_troca')) then
        raise exception 'Meio da entrada inválido' using errcode = 'OR009';
      end if;
      -- Entrada por Pix ou cartão também precisa do comprovante (REV-044, #46).
      if meio_entrada is not null and privado.meio_com_comprovante(meio_entrada)
         and length(trim(coalesce(pagamento ->> 'comprovante', ''))) < 4 then
        raise exception 'Informe o código do comprovante da entrada' using errcode = 'OR009';
      end if;
      recebido := recebido + entrada;
      a_receber := a_receber + valor - entrada;
      -- Troco só sai de linha em dinheiro (REV-046, #48), como em packages/dominio/src/pagamento.ts:
      -- crédito da financeira acima do preço nunca vira dinheiro na mão do cliente.
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
  descontar bigint;
  em_dinheiro bigint := 0;
  dinheiro_por_pagamento jsonb := '{}'::jsonb;
  externo boolean;
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
    -- Concluída: o cancelamento comercial separa três coisas (REV-047/048/049, #49–#51):
    --   * dinheiro: devolve o recebido líquido (troco descontado), do caixa de quem cancela, com o
    --     saldo conferido sob a trava do caixa — inclusive a entrada em dinheiro (#47);
    --   * Pix, cartão e financeira: estorno A CONFIRMAR com o comprovante (estornos_externos);
    --     o pagamento fica "estorno_pendente" até lá (#50);
    --   * aparelho, chip e acessório: aguardam o retorno físico conferido (venda_retornos); nada volta
    --     sozinho ao estoque (#51). Chip com ativação viva na Ora Connect impede o cancelamento.
    caixa := privado.meu_caixa_aberto();
    if exists (
         select 1 from public.connect_operacoes o
         where o.organizacao_id = venda.organizacao_id and o.tipo = 'ativacao'
           and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')
           and (o.venda_chip_id = venda.id or o.iccid in (
                 select s.iccid from public.venda_itens i join public.itens_serializados s on s.id = i.item_serializado_id
                 where i.venda_id = venda.id and s.iccid is not null))) then
      raise exception 'Chip com ativação na Ora Connect: resolva a operação antes de cancelar' using errcode = 'OR013';
    end if;
    troco_a_descontar := coalesce(venda.troco_centavos, 0);
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      devolver := case when pagamento.meio = 'dinheiro' then pagamento.valor_centavos
                       when privado.meio_financeira(pagamento.meio) and pagamento.meio_entrada = 'dinheiro' then pagamento.entrada_centavos
                       else 0 end;
      descontar := least(devolver, troco_a_descontar);
      troco_a_descontar := troco_a_descontar - descontar;
      devolver := devolver - descontar;
      if devolver > 0 then
        dinheiro_por_pagamento := dinheiro_por_pagamento || jsonb_build_object(pagamento.id::text, devolver);
        em_dinheiro := em_dinheiro + devolver;
      end if;
    end loop;
    if em_dinheiro > privado.dinheiro_no_caixa(caixa.id) then
      raise exception 'Não há dinheiro suficiente no seu caixa para devolver' using errcode = '23514';
    end if;
    for item in select * from public.venda_itens i where i.venda_id = venda.id order by i.criado_em, i.id loop
      if item.tipo in ('aparelho', 'chip', 'acessorio') then
        insert into public.venda_retornos (organizacao_id, unidade_id, venda_id, venda_item_id, quantidade, motivo, solicitado_por)
        values (venda.organizacao_id, venda.unidade_id, venda.id, item.id, item.quantidade, trim(p_motivo), usuario);
      end if;
    end loop;
    for pagamento in select * from public.venda_pagamentos p where p.venda_id = venda.id and p.situacao = 'confirmado' order by p.ordem loop
      devolver := coalesce((dinheiro_por_pagamento ->> pagamento.id::text)::bigint, 0);
      if devolver > 0 then
        insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, pagamento_id, motivo, usuario_id, chave_idempotencia)
        values (venda.organizacao_id, caixa.id, 'estorno', 'dinheiro', -devolver, venda.id, pagamento.id,
                trim(p_motivo), usuario, 'venda:' || venda.id || ':estorno:' || pagamento.ordem);
      end if;
      externo := false;
      if privado.meio_financeira(pagamento.meio) then
        update public.contas_a_receber r set situacao = 'cancelada', atualizado_em = now() where r.pagamento_id = pagamento.id and r.situacao = 'aberta';
        -- O contrato na financeira se cancela fora daqui: fica a confirmar com o protocolo.
        if pagamento.valor_centavos - pagamento.entrada_centavos > 0 then
          insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
          values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio,
                  pagamento.valor_centavos - pagamento.entrada_centavos, usuario);
          externo := true;
        end if;
        if pagamento.entrada_centavos > 0 and pagamento.meio_entrada <> 'dinheiro' then
          insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
          values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio_entrada, pagamento.entrada_centavos, usuario);
          externo := true;
        end if;
      elsif pagamento.meio not in ('dinheiro', 'vale_troca') then
        insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, solicitado_por)
        values (venda.organizacao_id, venda.unidade_id, venda.id, pagamento.id, pagamento.meio, pagamento.valor_centavos, usuario);
        externo := true;
      end if;
      -- Dinheiro e vale-troca se resolvem aqui; o resto espera o comprovante do estorno.
      update public.venda_pagamentos p
      set situacao = case when externo then 'estorno_pendente' else 'estornado' end,
          estornado_em = case when externo then null else now() end
      where p.id = pagamento.id;
    end loop;
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  update public.vendas v
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = usuario, motivo_cancelamento = trim(p_motivo)
  where v.id = venda.id;
  return true;
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
  select * into pedido from public.aprovacoes_desconto a where a.id = p_aprovacao;
  if not found or not (select public.tem_permissao('desconto.aprovar', pedido.unidade_id)) then
    raise exception 'Pedido de aprovação não encontrado' using errcode = 'P0002';
  end if;
  -- Ordem das travas (REV-051, #53): venda → aprovação, a mesma de editar, remover, pedir,
  -- concluir e cancelar. Antes a aprovação era travada primeiro e o desconto simultâneo dava 40P01.
  perform 1 from public.vendas v where v.id = pedido.venda_id for update;
  select * into pedido from public.aprovacoes_desconto a where a.id = p_aprovacao for update;
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
      -- Identidade conferida no balcão (REV-049, #51): o IMEI/ICCID devolvido é o do item vendido.
      if item.item_serializado_id is not null and not exists (
           select 1 from public.itens_serializados s
           where s.id = item.item_serializado_id
             and regexp_replace(coalesce(linha ->> 'identificador', ''), '[^0-9]', '', 'g') in (s.imei, s.imei2, s.iccid)) then
        raise exception 'Confira o IMEI/ICCID: o item devolvido precisa ser o que foi vendido' using errcode = '22023';
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
      -- Só o dinheiro sai do caixa agora; Pix e cartão ficam como estorno a confirmar (#50).
      precisa_caixa := precisa_caixa or meio_reembolso = 'dinheiro';
    end if;
    soma_reembolsos := soma_reembolsos + valor;
  end loop;
  if soma_reembolsos <> total then
    raise exception 'O reembolso (%) precisa somar o valor devolvido (%)', soma_reembolsos, total using errcode = 'OR009';
  end if;

  -- (2) caixa de quem devolve, quando sai dinheiro (Pix e cartão ficam como estorno a confirmar)
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
    if meio_reembolso = 'dinheiro' then
      insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, venda_id, motivo, usuario_id, chave_idempotencia)
      values (venda.organizacao_id, caixa.id, 'estorno', meio_reembolso, -valor, venda.id,
              'Devolução nº ' || devolucao.numero || ': ' || trim(p_motivo), usuario,
              'devolucao:' || devolucao.id || ':reembolso:' || meio_reembolso);
    elsif meio_reembolso <> 'vale_troca' then
      insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, devolucao_id, meio, valor_centavos, solicitado_por)
      values (venda.organizacao_id, venda.unidade_id, venda.id, devolucao.id, meio_reembolso, valor, usuario);
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

create or replace function public.reservar_estoque(
  p_variante uuid, p_quantidade int, p_item uuid, p_chave text, p_origem text default 'pdv', p_minutos int default 15
)
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
  tipo text;
  qtd int;
  existente public.estoque_reservas;
  item public.itens_serializados;
  vencida uuid;
  nova uuid;
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta unidade' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  -- Produto obrigatório também na repetição da chave (REV-032, #34): nulo não "confere" com nada.
  if p_variante is null then
    raise exception 'Informe o produto' using errcode = '22023';
  end if;
  if p_origem is null or p_origem not in ('pdv', 'online') then
    raise exception 'Origem inválida' using errcode = '22023';
  end if;
  if p_minutos is null or p_minutos not between 1 and 120 then
    raise exception 'Prazo da reserva entre 1 e 120 minutos' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  qtd := case when p_item is not null then coalesce(p_quantidade, 1) else p_quantidade end;

  -- (0) chave
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_reservas', organizacao, p_chave));
  select * into existente from public.estoque_reservas r
  where r.organizacao_id = organizacao and r.chave_idempotencia = p_chave;
  if found then
    if existente.criado_por is distinct from usuario or existente.unidade_id <> unidade
       or existente.variante_id is distinct from p_variante or existente.item_serializado_id is distinct from p_item
       or existente.quantidade is distinct from qtd or existente.origem <> p_origem
       or existente.expira_em - existente.criado_em <> make_interval(mins => p_minutos) then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;

  select p.tipo into tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.organizacao_id = organizacao and v.ativa and p.ativo;
  if tipo is null then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  if tipo not in ('aparelho', 'chip', 'acessorio') then
    raise exception 'Este item não tem estoque para reservar' using errcode = '22023';
  end if;

  if tipo in ('aparelho', 'chip') then
    if p_item is null or qtd <> 1 then
      raise exception 'Aparelho e chip são reservados um a um, pelo IMEI/ICCID' using errcode = '22023';
    end if;
    -- (1) item
    select * into item from public.itens_serializados i where i.id = p_item for update;
    if not found or item.variante_id <> p_variante or item.unidade_id <> unidade then
      raise exception 'Este IMEI/ICCID não está nesta loja' using errcode = 'OR003';
    end if;
    if item.situacao = 'reservado' then
      -- (2) reserva vencida deste item é encerrada antes
      select r.id into vencida from public.estoque_reservas r
      where r.item_serializado_id = p_item and r.situacao = 'ativa' and r.expira_em <= now();
      if found then
        perform privado.encerrar_reserva(vencida, 'expirada');
        select * into item from public.itens_serializados i where i.id = p_item;
      end if;
    end if;
    if not item.em_estoque or item.situacao <> 'disponivel' then
      raise exception 'Este IMEI/ICCID não está disponível (%)', item.situacao using errcode = 'OR002';
    end if;
    update public.itens_serializados set situacao = 'reservado' where id = p_item;
  else
    if p_item is not null then
      raise exception 'Acessório é reservado por quantidade' using errcode = '22023';
    end if;
    if qtd is null or qtd < 1 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    -- (2) reservas vencidas deste acessório nesta loja
    perform privado.expirar_reservas(unidade, p_variante);
  end if;

  -- (3) saldo
  update public.estoque_saldos s
  set reservado = s.reservado + qtd, atualizado_em = now()
  where s.unidade_id = unidade and s.variante_id = p_variante and s.quantidade - s.reservado >= qtd;
  if not found then
    raise exception 'Estoque insuficiente nesta loja' using errcode = 'OR001';
  end if;

  insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade,
    origem, chave_idempotencia, expira_em, criado_por)
  values (organizacao, unidade, p_variante, p_item, qtd,
    p_origem, p_chave, now() + make_interval(mins => p_minutos), usuario)
  returning id into nova;
  return nova;
end;
$$;

create or replace function privado.registrar_item_serializado(
  p_unidade uuid, p_variante uuid, p_imei text, p_imei2 text, p_iccid text, p_tipo text,
  p_chave text, p_usuario uuid default null, p_condicao text default 'novo', p_numero_serie text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organizacao uuid;
  existente record;
  item uuid;
begin
  if p_tipo is null or p_tipo not in ('entrada_importacao', 'entrada_compra', 'ajuste_conciliacao', 'ajuste') then
    raise exception 'Tipo de entrada inválido: %', p_tipo using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória na entrada' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  if organizacao is null then
    raise exception 'Unidade não encontrada' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_movimentos', organizacao, p_chave));
  select m.item_serializado_id, m.unidade_id, m.variante_id, m.tipo, m.quantidade, i.imei, i.imei2, i.iccid, i.condicao, i.numero_serie
  into existente
  from public.estoque_movimentos m
  left join public.itens_serializados i on i.id = m.item_serializado_id
  where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
  if found then
    if existente.item_serializado_id is null or existente.unidade_id <> p_unidade
       or existente.variante_id <> p_variante or existente.tipo <> p_tipo or existente.quantidade <> 1
       or existente.imei is distinct from p_imei or existente.imei2 is distinct from p_imei2
       or existente.iccid is distinct from p_iccid
       -- Condição e número de série também são o conteúdo da entrada (REV-032, #34).
       or existente.condicao is distinct from p_condicao or existente.numero_serie is distinct from p_numero_serie then
      raise exception 'Chave de idempotência já usada em outra entrada' using errcode = 'OR004';
    end if;
    return existente.item_serializado_id;
  end if;

  insert into public.itens_serializados (organizacao_id, variante_id, unidade_id, imei, imei2, iccid, numero_serie, condicao)
  values (organizacao, p_variante, p_unidade, p_imei, p_imei2, p_iccid, p_numero_serie, p_condicao)
  returning id into item;
  perform privado.lancar_movimento(p_unidade, p_variante, 1, p_tipo, item, null, null, null, p_chave, p_usuario);
  return item;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Confirmar o estorno externo (#50) e conferir o retorno físico (#51)
-- Gerência da loja da venda (venda.cancelar), na loja da sessão. Ordem: venda → item → registro.
-- -----------------------------------------------------------------------------
create or replace function public.confirmar_estorno_externo(p_estorno uuid, p_comprovante text, p_observacao text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  estorno public.estornos_externos;
  codigo text := nullif(trim(coalesce(p_comprovante, '')), '');
begin
  select * into estorno from public.estornos_externos e where e.id = p_estorno;
  if not found or estorno.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.cancelar', estorno.unidade_id)) then
    raise exception 'Estorno não encontrado' using errcode = 'P0002';
  end if;
  if codigo is null or length(codigo) not between 4 and 60 then
    raise exception 'Informe o código do comprovante do estorno (maquininha, banco ou financeira)' using errcode = '22023';
  end if;
  perform 1 from public.vendas v where v.id = estorno.venda_id for update;
  select * into estorno from public.estornos_externos e where e.id = p_estorno for update;
  if estorno.situacao = 'confirmado' then
    if estorno.comprovante = codigo then
      return 'confirmado';
    end if;
    raise exception 'Este estorno já foi confirmado com outro comprovante' using errcode = 'OR004';
  end if;
  perform set_config('ora.motivo', 'Estorno externo confirmado pelo comprovante ' || codigo, true);
  update public.estornos_externos e
  set situacao = 'confirmado', confirmado_por = usuario, confirmado_em = now(), comprovante = codigo,
      observacao = nullif(left(trim(coalesce(p_observacao, '')), 500), '')
  where e.id = estorno.id;
  if estorno.pagamento_id is not null and not exists (
       select 1 from public.estornos_externos x where x.pagamento_id = estorno.pagamento_id and x.situacao = 'pendente') then
    update public.venda_pagamentos p set situacao = 'estornado', estornado_em = now()
    where p.id = estorno.pagamento_id and p.situacao = 'estorno_pendente';
  end if;
  return 'confirmado';
end;
$$;

-- p_recebido = false fecha o retorno sem estoque (o item não voltou), com a explicação.
create or replace function public.conferir_retorno(p_retorno uuid, p_recebido boolean, p_identificador text, p_condicao text, p_observacao text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  retorno public.venda_retornos;
  venda public.vendas;
  item public.venda_itens;
  serial public.itens_serializados;
  digitos text := regexp_replace(coalesce(p_identificador, ''), '[^0-9]', '', 'g');
  observacao_limpa text := nullif(left(trim(coalesce(p_observacao, '')), 500), '');
begin
  select * into retorno from public.venda_retornos r where r.id = p_retorno;
  if not found or retorno.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('venda.cancelar', retorno.unidade_id)) then
    raise exception 'Retorno não encontrado' using errcode = 'P0002';
  end if;
  if p_recebido is null then
    raise exception 'Diga se o item voltou' using errcode = '22023';
  end if;
  if p_recebido and (p_condicao is null or p_condicao not in ('novo', 'seminovo', 'avariado')) then
    raise exception 'Condição do item: novo, seminovo ou avariado' using errcode = '22023';
  end if;
  if not p_recebido and (observacao_limpa is null or length(observacao_limpa) < 10) then
    raise exception 'Explique por que o item não voltou (pelo menos 10 caracteres)' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = retorno.venda_id for update;
  select * into item from public.venda_itens i where i.id = retorno.venda_item_id;
  if item.item_serializado_id is not null then
    select * into serial from public.itens_serializados s where s.id = item.item_serializado_id for update;
  end if;
  select * into retorno from public.venda_retornos r where r.id = p_retorno for update;
  if retorno.situacao <> 'pendente' then
    if (p_recebido and retorno.situacao = 'recebido' and retorno.condicao = p_condicao)
       or (not p_recebido and retorno.situacao = 'nao_recebido') then
      return retorno.situacao;
    end if;
    raise exception 'Este retorno já foi conferido de outro jeito' using errcode = 'OR004';
  end if;
  perform set_config('ora.motivo', 'Retorno da venda nº ' || venda.numero || ': ' || retorno.motivo, true);
  if not p_recebido then
    update public.venda_retornos r
    set situacao = 'nao_recebido', conferido_por = usuario, conferido_em = now(), observacao = observacao_limpa
    where r.id = retorno.id;
    return 'nao_recebido';
  end if;
  -- Identidade: o IMEI/ICCID na mão é o do item vendido. Chip com ativação viva é barrado pelo
  -- gatilho do item (OR013): chip usado não volta como virgem.
  if serial.id is not null and (digitos = '' or digitos not in (coalesce(serial.imei, ''), coalesce(serial.imei2, ''), coalesce(serial.iccid, ''))) then
    raise exception 'Confira o IMEI/ICCID: o item devolvido precisa ser o que foi vendido' using errcode = '22023';
  end if;
  perform privado.lancar_movimento(retorno.unidade_id, item.variante_id, retorno.quantidade, 'devolucao', item.item_serializado_id,
    'Retorno conferido da venda nº ' || venda.numero || ': ' || retorno.motivo, 'venda', venda.id::text,
    'venda:' || venda.id || ':retorno:' || item.id, usuario);
  if serial.id is not null then
    update public.itens_serializados s set condicao = p_condicao where s.id = serial.id;
  end if;
  update public.venda_retornos r
  set situacao = 'recebido', conferido_por = usuario, conferido_em = now(), condicao = p_condicao, observacao = observacao_limpa
  where r.id = retorno.id;
  return 'recebido';
end;
$$;

revoke all on function privado.so_desfecho_do_pendente() from public, anon, authenticated;
revoke all on function public.confirmar_estorno_externo(uuid, text, text), public.conferir_retorno(uuid, boolean, text, text, text) from public, anon;
grant execute on function public.confirmar_estorno_externo(uuid, text, text), public.conferir_retorno(uuid, boolean, text, text, text) to authenticated;
