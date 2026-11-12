-- =============================================================================
-- Maquininhas por loja, maquininha no pagamento e conciliação manual (lote L7a: ORA-PAY-012, ORA-PAY-001,
-- ORA-PAY-003, ORA-PAY-007)
--
--   * Cada loja cadastra as maquininhas que usa (PicPay ou PagBank, com o número do terminal e um apelido);
--     quem tem terminal.gerir (dono e gerente) cadastra e desativa, com motivo. Nada se apaga.
--   * No pagamento por maquininha, a venda guarda qual maquininha foi usada; se a loja tem maquininha
--     ativa daquele provedor, escolher uma é obrigatório (OR009). Pix direto vai para a conta, sem maquininha.
--   * Situação do dinheiro (sem misturar venda com dinheiro recebido): dinheiro fica no caixa; cartão e Pix
--     ficam "a liquidar" até alguém conciliar à mão com o extrato (referência, valor líquido e data em que o
--     dinheiro caiu). Nada é dado como liquidado sem essa conciliação (não há API das maquininhas: E3).
--     Conciliar e desfazer exigem pagamento.conciliar (dono e gerente) e ficam na auditoria.
-- concluir_venda recriada a partir do texto aplicado em 20261111191909_clientes_compartilhados, com as
-- mudanças marcadas "L7a". Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Maquininhas por loja e conciliação manual (ORA-PAY-012, ORA-PAY-007)', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('terminal.gerir', 'Cadastrar e desativar as maquininhas da loja', 'pagamentos'),
    ('pagamento.conciliar', 'Conciliar à mão os pagamentos de cartão e Pix com o extrato (valor líquido e data)', 'pagamentos');
  insert into public.papel_permissoes (papel, permissao) values
    ('dono', 'terminal.gerir'), ('gerente', 'terminal.gerir'), ('dono', 'pagamento.conciliar'), ('gerente', 'pagamento.conciliar');
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Maquininhas
-- -----------------------------------------------------------------------------
create table public.terminais (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  provedor text not null check (provedor in ('picpay', 'pagbank')),
  identificador text not null check (identificador ~ '^[A-Za-z0-9._/-]{3,40}$'),
  apelido text not null check (length(trim(apelido)) between 2 and 60),
  ativo boolean not null default true,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  unique (organizacao_id, provedor, identificador),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
create index terminais_unidade on public.terminais (unidade_id, organizacao_id);
create index terminais_criado_por on public.terminais (criado_por);
create trigger terminais_auditar after insert or update on public.terminais
  for each row execute function privado.auditar_mudanca();
alter table public.terminais enable row level security;
revoke all on public.terminais from anon, authenticated;
grant select on public.terminais to authenticated;
-- Quem está na loja vê as maquininhas dela (para escolher no pagamento).
create policy terminais_ler on public.terminais for select to authenticated
  using (unidade_id in (select privado.unidades_visiveis()));

-- Provedor de cada meio de maquininha (Pix direto e dinheiro não têm).
create or replace function privado.meio_provedor(p_meio text)
returns text language sql immutable set search_path = ''
as $$ select case when p_meio in ('pix_picpay', 'cartao_picpay') then 'picpay' when p_meio = 'cartao_pagseguro' then 'pagbank' end; $$;

-- Maquininha do pagamento: a informada (da loja, ativa, do provedor do meio) ou nenhuma; obrigatória quando a
-- loja tem maquininha ativa daquele provedor.
create or replace function privado.terminal_do_pagamento(p_unidade uuid, p_meio text, p_terminal text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_provedor text := privado.meio_provedor(p_meio);
  v_terminal uuid;
begin
  if v_provedor is null then
    if nullif(p_terminal, '') is not null then
      raise exception 'Este meio não usa maquininha' using errcode = 'OR009';
    end if;
    return null;
  end if;
  if nullif(p_terminal, '') is null then
    if exists (select 1 from public.terminais t where t.unidade_id = p_unidade and t.provedor = v_provedor and t.ativo) then
      raise exception 'Escolha a maquininha usada no pagamento' using errcode = 'OR009';
    end if;
    return null;
  end if;
  begin
    v_terminal := p_terminal::uuid;
  exception when others then
    raise exception 'Maquininha inválida' using errcode = 'OR009';
  end;
  if not exists (select 1 from public.terminais t where t.id = v_terminal and t.unidade_id = p_unidade and t.provedor = v_provedor and t.ativo) then
    raise exception 'Maquininha inválida para este pagamento: tem que ser desta loja, ativa e do mesmo provedor' using errcode = 'OR009';
  end if;
  return v_terminal;
end;
$$;
revoke all on function privado.meio_provedor(text), privado.terminal_do_pagamento(uuid, text, text) from public, anon, authenticated;

create or replace function public.terminal_salvar(p_id uuid, p_unidade uuid, p_provedor text, p_identificador text, p_apelido text, p_ativo boolean, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_unidade public.unidades;
  v_atual public.terminais;
  v_apelido text := regexp_replace(trim(coalesce(p_apelido, '')), '\s+', ' ', 'g');
  v_identificador text := upper(trim(coalesce(p_identificador, '')));
  v_id uuid;
begin
  if p_id is not null then
    select * into v_atual from public.terminais t where t.id = p_id for no key update;
    if not found or not public.tem_permissao('terminal.gerir', v_atual.unidade_id) then
      raise exception 'Maquininha não encontrada para você' using errcode = 'P0002';
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    if length(v_apelido) not between 2 and 60 then
      raise exception 'Dê um apelido à maquininha (de 2 a 60 letras), por exemplo "Balcão 1"' using errcode = '22023';
    end if;
    update public.terminais t set apelido = v_apelido, ativo = coalesce(p_ativo, t.ativo) where t.id = v_atual.id;
    return v_atual.id;
  end if;
  select * into v_unidade from public.unidades u where u.id = p_unidade;
  if not found or not public.tem_permissao('terminal.gerir', p_unidade) then
    raise exception 'Sem permissão para cadastrar maquininha nesta loja' using errcode = '42501';
  end if;
  if p_provedor is null or p_provedor not in ('picpay', 'pagbank') then
    raise exception 'Escolha o provedor da maquininha' using errcode = '22023';
  end if;
  if v_identificador !~ '^[A-Z0-9._/-]{3,40}$' then
    raise exception 'Número do terminal inválido (de 3 a 40 letras e números)' using errcode = '22023';
  end if;
  if length(v_apelido) not between 2 and 60 then
    raise exception 'Dê um apelido à maquininha (de 2 a 60 letras), por exemplo "Balcão 1"' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  begin
    insert into public.terminais (organizacao_id, unidade_id, provedor, identificador, apelido, criado_por)
    values (v_unidade.organizacao_id, p_unidade, p_provedor, v_identificador, v_apelido, (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta maquininha já está cadastrada na rede' using errcode = 'OR020';
  end;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Maquininha no pagamento, liquidação e conciliação
-- -----------------------------------------------------------------------------
alter table public.venda_pagamentos add column terminal_id uuid references public.terminais (id);
alter table public.venda_pagamentos add column liquidado_em date;
alter table public.venda_pagamentos add column valor_liquido_centavos bigint;
alter table public.venda_pagamentos add column referencia_conciliacao text;
alter table public.venda_pagamentos add column conciliado_em timestamptz;
alter table public.venda_pagamentos add column conciliado_por uuid references public.perfis_usuario (id);
alter table public.venda_pagamentos add constraint conciliacao_completa check (
  (conciliado_em is null) = (liquidado_em is null) and (conciliado_em is null) = (valor_liquido_centavos is null)
  and (conciliado_em is null) = (referencia_conciliacao is null) and (conciliado_em is null) = (conciliado_por is null));
alter table public.venda_pagamentos add constraint liquido_ate_o_valor check (valor_liquido_centavos is null or valor_liquido_centavos between 0 and valor_centavos);
create index venda_pagamentos_terminal on public.venda_pagamentos (terminal_id);
create index venda_pagamentos_conciliado_por on public.venda_pagamentos (conciliado_por);

-- Meios cujo dinheiro chega pela conta ou pela maquininha (os que se conciliam com extrato).
create or replace function privado.meio_liquidavel(p_meio text)
returns boolean language sql immutable set search_path = ''
as $$ select p_meio in ('pix_direto', 'pix_picpay', 'cartao_picpay', 'cartao_pagseguro'); $$;
revoke all on function privado.meio_liquidavel(text) from public, anon, authenticated;

-- Situação do dinheiro de um pagamento (a mesma regra na tela e nos totais).
create or replace function privado.situacao_do_dinheiro(p public.venda_pagamentos)
returns text language sql stable set search_path = ''
as $$
  select case
    when p.situacao = 'estornado' then 'estornado'
    when p.situacao = 'estorno_pendente' then 'estorno_pendente'
    when p.meio = 'dinheiro' then 'no_caixa'
    when privado.meio_financeira(p.meio) then 'com_a_financeira'
    when p.meio = 'vale_troca' then 'vale_troca'
    when p.conciliado_em is not null then 'conciliado'
    else 'a_liquidar'
  end;
$$;
revoke all on function privado.situacao_do_dinheiro(public.venda_pagamentos) from public, anon, authenticated;

create or replace function public.pagamento_conciliar(p_pagamento uuid, p_referencia text, p_valor_liquido bigint, p_liquidado_em date)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p public.venda_pagamentos;
  v_venda public.vendas;
  v_referencia text := regexp_replace(trim(coalesce(p_referencia, '')), '\s+', ' ', 'g');
begin
  select * into v_p from public.venda_pagamentos p where p.id = p_pagamento for no key update;
  select * into v_venda from public.vendas v where v.id = v_p.venda_id;
  if v_p.id is null or not public.tem_permissao('pagamento.conciliar', v_venda.unidade_id) then
    raise exception 'Pagamento não encontrado para você' using errcode = 'P0002';
  end if;
  if not privado.meio_liquidavel(v_p.meio) or v_p.situacao <> 'confirmado' then
    raise exception 'Só se concilia pagamento de cartão ou Pix confirmado' using errcode = '22023';
  end if;
  if length(v_referencia) not between 3 and 80 then
    raise exception 'Informe a referência do extrato (de 3 a 80 letras): NSU, código ou linha do extrato' using errcode = '22023';
  end if;
  if p_valor_liquido is null or p_valor_liquido < 0 or p_valor_liquido > v_p.valor_centavos then
    raise exception 'Valor líquido entre zero e o valor do pagamento' using errcode = '22023';
  end if;
  if p_liquidado_em is null or p_liquidado_em < (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date
     or p_liquidado_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data em que o dinheiro caiu vai do dia da venda até hoje' using errcode = '22023';
  end if;
  if v_p.conciliado_em is not null then
    if v_p.referencia_conciliacao = v_referencia and v_p.valor_liquido_centavos = p_valor_liquido and v_p.liquidado_em = p_liquidado_em then
      return false;
    end if;
    raise exception 'Pagamento já conciliado: desfaça a conciliação antes de mudar' using errcode = 'OR030';
  end if;
  perform set_config('ora.motivo', 'Conciliação manual com o extrato: ' || v_referencia, true);
  update public.venda_pagamentos p set liquidado_em = p_liquidado_em, valor_liquido_centavos = p_valor_liquido, referencia_conciliacao = v_referencia,
    conciliado_em = now(), conciliado_por = (select auth.uid())
  where p.id = v_p.id;
  return true;
end;
$$;

create or replace function public.pagamento_desconciliar(p_pagamento uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_p public.venda_pagamentos;
  v_unidade uuid;
begin
  select * into v_p from public.venda_pagamentos p where p.id = p_pagamento for no key update;
  select v.unidade_id into v_unidade from public.vendas v where v.id = v_p.venda_id;
  if v_p.id is null or not public.tem_permissao('pagamento.conciliar', v_unidade) then
    raise exception 'Pagamento não encontrado para você' using errcode = 'P0002';
  end if;
  if v_p.conciliado_em is null then
    return false;
  end if;
  perform set_config('ora.motivo', 'Conciliação desfeita: ' || v_motivo, true);
  update public.venda_pagamentos p set liquidado_em = null, valor_liquido_centavos = null, referencia_conciliacao = null, conciliado_em = null, conciliado_por = null
  where p.id = v_p.id;
  return true;
end;
$$;

-- Pagamentos da loja do turno num período, com a situação do dinheiro e os totais por situação (conciliação).
create or replace function public.pagamentos_do_periodo(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
begin
  if v_unidade is null or not public.tem_permissao('pagamento.conciliar', v_unidade) then
    raise exception 'Sem permissão para conciliar pagamentos nesta loja' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 62 then
    raise exception 'Escolha um período de até 62 dias' using errcode = '22023';
  end if;
  return (
    with pags as (
      select p.*, v.numero as venda_numero, v.concluida_em, privado.situacao_do_dinheiro(p) as dinheiro, t.apelido as terminal
      from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id left join public.terminais t on t.id = p.terminal_id
      where v.unidade_id = v_unidade and v.concluida_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
        and v.concluida_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo'))
    select jsonb_build_object(
      'totais', coalesce((select jsonb_object_agg(x.dinheiro, jsonb_build_object('quantidade', x.n, 'valor', x.valor, 'liquido', x.liquido))
                          from (select dinheiro, count(*) as n, sum(valor_centavos - entrada_centavos) as valor, sum(valor_liquido_centavos) as liquido
                                from pags group by dinheiro) x), '{}'::jsonb),
      'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'venda_id', p.venda_id, 'venda_numero', p.venda_numero, 'concluida_em', p.concluida_em,
                                'meio', p.meio, 'valor', p.valor_centavos, 'comprovante', p.comprovante, 'terminal', p.terminal, 'dinheiro', p.dinheiro,
                                'liquidado_em', p.liquidado_em, 'valor_liquido', p.valor_liquido_centavos, 'referencia', p.referencia_conciliacao)
                              order by p.concluida_em, p.ordem)
                              from pags p where privado.meio_liquidavel(p.meio)), '[]'::jsonb)));
end;
$$;

-- concluir_venda recriada a partir do texto aplicado em 20261111191909_clientes_compartilhados (L7a).
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
  cliente_rede uuid; -- L5a
  terminal_escolhido uuid; -- L7a
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
  -- L5a: cliente da rede escolhido na venda pela busca exata; o nome e o e-mail digitados seguem como origem.
  if nullif(p_cliente ->> 'id', '') is not null then
    begin
      cliente_rede := (p_cliente ->> 'id')::uuid;
    exception when others then
      raise exception 'Cliente inválido' using errcode = '22023';
    end;
    if not public.tem_permissao('cliente.buscar', unidade) or not exists (
         select 1 from public.clientes c where c.id = cliente_rede and c.organizacao_id = organizacao and c.situacao = 'ativo') then
      raise exception 'Cliente não encontrado nesta rede' using errcode = '22023';
    end if;
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
    -- L7a: maquininha usada (obrigatória quando a loja tem maquininha ativa daquele provedor).
    perform privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal');
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
    terminal_escolhido := privado.terminal_do_pagamento(venda.unidade_id, meio, pagamento ->> 'terminal'); -- L7a
    insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, entrada_centavos, meio_entrada, comprovante, confirmacao, confirmado_por,
                                         terminal_id) -- L7a
    values (venda.organizacao_id, venda.id, ordem, meio, valor, entrada, meio_entrada, comprovante,
            case when meio = 'dinheiro' then 'caixa' when privado.meio_financeira(meio) then 'financeira' else 'manual' end, usuario,
            terminal_escolhido)
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
      cliente_nome = coalesce(nome, v.cliente_nome), cliente_email = coalesce(email, v.cliente_email),
      cliente_id = coalesce(cliente_rede, v.cliente_id) -- L5a
  where v.id = venda.id
  returning * into venda;
  return jsonb_build_object('venda', venda.id, 'numero', venda.numero, 'total', total, 'troco', troco,
                            'recebido', recebido - troco, 'a_receber', a_receber, 'repetida', false);
end;
$$;

revoke all on function public.terminal_salvar(uuid, uuid, text, text, text, boolean, text), public.pagamento_conciliar(uuid, text, bigint, date),
  public.pagamento_desconciliar(uuid, text), public.pagamentos_do_periodo(date, date) from public, anon;
grant execute on function public.terminal_salvar(uuid, uuid, text, text, text, boolean, text), public.pagamento_conciliar(uuid, text, bigint, date),
  public.pagamento_desconciliar(uuid, text), public.pagamentos_do_periodo(date, date) to authenticated;
