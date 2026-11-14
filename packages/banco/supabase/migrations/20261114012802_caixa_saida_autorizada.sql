-- =============================================================================
-- Saída autorizada do caixa (lote L7c: ORA-PAY-005; decisão do proprietário de 13/11/2026, D-017 em parte)
--
-- Dinheiro que sai da gaveta para uma despesa da loja (pagar um motoboy, uma compra pequena) não é
-- sangria (recolhimento ao cofre): precisa de autorização. Decisão do proprietário: autoriza o GERENTE
-- ou o DONO. Fluxo, como o da aprovação de desconto:
--   1) quem está com o caixa aberto pede a saída, com valor e motivo; o valor não passa do dinheiro
--      que há na gaveta;
--   2) outra pessoa, com caixa.conferir na loja (gerente e dono), autoriza ou nega (negar pede motivo);
--      quem pediu nunca autoriza a própria saída;
--   3) ao autorizar, o banco lança o movimento "saida_autorizada" no caixa de quem pediu (negativo, em
--      dinheiro): o esperado do fechamento já desconta. A autorização trava a mesma linha do caixa que o
--      fechamento trava: ou a saída entra antes e o fechamento a desconta, ou o caixa fecha antes e a
--      autorização é recusada (o pedido pode então ser negado ou cancelado por quem pediu).
-- Tudo auditado (gatilho, com o motivo). Os pedidos não se apagam.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) O novo tipo de movimento, sempre negativo (sai dinheiro).
alter table public.caixa_movimentos drop constraint caixa_movimentos_tipo_check;
alter table public.caixa_movimentos add constraint caixa_movimentos_tipo_check
  check (tipo in ('fundo', 'suprimento', 'sangria', 'recebimento', 'troco', 'estorno', 'saida_autorizada'));
alter table public.caixa_movimentos drop constraint caixa_sinal_do_tipo;
alter table public.caixa_movimentos add constraint caixa_sinal_do_tipo check (
  (tipo in ('fundo', 'suprimento', 'recebimento') and valor_centavos > 0)
  or (tipo in ('sangria', 'troco', 'estorno', 'saida_autorizada') and valor_centavos < 0));

-- 2) Os pedidos de saída.
create table public.caixa_saidas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  caixa_id uuid not null references public.caixas (id),
  valor_centavos bigint not null check (valor_centavos > 0),
  motivo text not null check (length(motivo) between 3 and 200),
  chave text not null check (length(trim(chave)) > 0),
  pedida_por uuid not null references public.perfis_usuario (id),
  pedida_em timestamptz not null default now(),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'autorizada', 'negada', 'cancelada')),
  decidida_por uuid references public.perfis_usuario (id),
  decidida_em timestamptz,
  motivo_decisao text check (motivo_decisao is null or length(motivo_decisao) between 3 and 200),
  movimento_id bigint references public.caixa_movimentos (id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint saida_decidida check ((situacao = 'pendente') = (decidida_em is null) and (decidida_em is null) = (decidida_por is null)),
  constraint saida_autorizada_tem_movimento check ((situacao = 'autorizada') = (movimento_id is not null)),
  constraint saida_negada_tem_motivo check (situacao <> 'negada' or motivo_decisao is not null)
);
create index caixa_saidas_pendentes on public.caixa_saidas (unidade_id, pedida_em) where situacao = 'pendente';
create index caixa_saidas_caixa on public.caixa_saidas (caixa_id);
create index caixa_saidas_pedida_por on public.caixa_saidas (pedida_por);
create index caixa_saidas_decidida_por on public.caixa_saidas (decidida_por);
create index caixa_saidas_movimento on public.caixa_saidas (movimento_id);
create trigger caixa_saidas_auditar after insert or update on public.caixa_saidas for each row execute function privado.auditar_mudanca();

alter table public.caixa_saidas enable row level security;
revoke all on public.caixa_saidas from anon, authenticated;
grant select on public.caixa_saidas to authenticated;
-- Quem pediu vê os próprios pedidos; quem confere caixa na loja vê os da loja.
create policy caixa_saidas_ler on public.caixa_saidas for select to authenticated
  using (pedida_por = (select auth.uid()) or (select public.tem_permissao('caixa.conferir', unidade_id)));

-- -----------------------------------------------------------------------------
-- 3) Pedir a saída (quem está com o caixa aberto)
-- -----------------------------------------------------------------------------
create or replace function public.caixa_pedir_saida(p_valor bigint, p_motivo text, p_chave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g');
  v_caixa public.caixas;
  v_existente public.caixa_saidas;
  v_id uuid;
begin
  if (select public.unidade_atual()) is null or not (select public.tem_permissao('caixa.abrir', (select public.unidade_atual()))) then
    raise exception 'Sem permissão para mexer em caixa nesta loja' using errcode = '42501';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  if length(v_motivo) not between 3 and 200 then
    raise exception 'Informe o motivo da saída (de 3 a 200 letras)' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  v_caixa := privado.meu_caixa_aberto();
  perform pg_advisory_xact_lock(privado.trava_da_chave('caixa_saidas', v_caixa.organizacao_id, p_chave));
  select * into v_existente from public.caixa_saidas s where s.organizacao_id = v_caixa.organizacao_id and s.chave = p_chave;
  if found then
    if v_existente.caixa_id <> v_caixa.id or v_existente.valor_centavos <> p_valor or v_existente.motivo <> v_motivo then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return v_existente.id;
  end if;
  if privado.dinheiro_no_caixa(v_caixa.id) < p_valor then
    raise exception 'A saída passa do dinheiro que há no caixa' using errcode = '23514';
  end if;
  perform set_config('ora.motivo', 'Pedido de saída do caixa: ' || v_motivo, true);
  insert into public.caixa_saidas (organizacao_id, unidade_id, caixa_id, valor_centavos, motivo, chave, pedida_por)
  values (v_caixa.organizacao_id, v_caixa.unidade_id, v_caixa.id, p_valor, v_motivo, p_chave, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.caixa_pedir_saida(bigint, text, text) from public, anon;
grant execute on function public.caixa_pedir_saida(bigint, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Autorizar ou negar (gerente ou dono: caixa.conferir na loja; nunca quem pediu)
-- -----------------------------------------------------------------------------
create or replace function public.caixa_decidir_saida(p_saida uuid, p_autorizar boolean, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  v_s public.caixa_saidas;
  v_caixa public.caixas;
  v_movimento bigint;
begin
  select * into v_s from public.caixa_saidas s where s.id = p_saida for update;
  if v_s.id is null or not public.tem_permissao('caixa.conferir', v_s.unidade_id) then
    raise exception 'Pedido de saída não encontrado para você' using errcode = 'P0002';
  end if;
  if v_s.pedida_por = (select auth.uid()) then
    raise exception 'Quem pediu a saída não autoriza a própria saída' using errcode = '42501';
  end if;
  if p_autorizar is null then
    raise exception 'Diga se autoriza ou nega' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) not between 3 and 200 then
    raise exception 'O motivo tem de 3 a 200 letras' using errcode = '22023';
  end if;
  if v_s.situacao <> 'pendente' then
    -- Repetir a mesma decisão não muda nada; outra decisão sobre pedido já decidido é recusada.
    if (p_autorizar and v_s.situacao = 'autorizada') or (not p_autorizar and v_s.situacao = 'negada') then
      return v_s.situacao;
    end if;
    raise exception 'Pedido de saída já decidido' using errcode = '22023';
  end if;

  if not p_autorizar then
    if v_motivo is null then
      raise exception 'Diga o motivo de negar a saída' using errcode = '22023';
    end if;
    perform set_config('ora.motivo', 'Saída do caixa negada: ' || v_motivo, true);
    update public.caixa_saidas s set situacao = 'negada', decidida_por = (select auth.uid()), decidida_em = now(), motivo_decisao = v_motivo
    where s.id = v_s.id;
    return 'negada';
  end if;

  -- A mesma trava do fechamento: ou a saída entra antes e o fechamento a desconta, ou o caixa já fechou.
  select * into v_caixa from public.caixas c where c.id = v_s.caixa_id for update;
  if v_caixa.situacao <> 'aberto' then
    raise exception 'O caixa já foi fechado: negue o pedido ou peça de novo num caixa aberto' using errcode = '22023';
  end if;
  if privado.dinheiro_no_caixa(v_caixa.id) < v_s.valor_centavos then
    raise exception 'A saída passa do dinheiro que há no caixa' using errcode = '23514';
  end if;
  perform set_config('ora.motivo', 'Saída do caixa autorizada: ' || v_s.motivo, true);
  insert into public.caixa_movimentos (organizacao_id, caixa_id, tipo, meio, valor_centavos, motivo, usuario_id, chave_idempotencia)
  values (v_s.organizacao_id, v_caixa.id, 'saida_autorizada', 'dinheiro', -v_s.valor_centavos, 'Saída autorizada: ' || v_s.motivo, (select auth.uid()), 'saida:' || v_s.id)
  returning id into v_movimento;
  update public.caixa_saidas s set situacao = 'autorizada', decidida_por = (select auth.uid()), decidida_em = now(), motivo_decisao = v_motivo, movimento_id = v_movimento
  where s.id = v_s.id;
  return 'autorizada';
end;
$$;
revoke all on function public.caixa_decidir_saida(uuid, boolean, text) from public, anon;
grant execute on function public.caixa_decidir_saida(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Cancelar o próprio pedido ainda não decidido
-- -----------------------------------------------------------------------------
create or replace function public.caixa_cancelar_saida(p_saida uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_s public.caixa_saidas;
begin
  select * into v_s from public.caixa_saidas s where s.id = p_saida for update;
  -- Só quem pediu, com sessão válida e caixa.abrir na loja do pedido (bloqueio e fim de turno barram).
  if v_s.id is null or v_s.pedida_por <> (select auth.uid()) or not public.tem_permissao('caixa.abrir', v_s.unidade_id) then
    raise exception 'Pedido de saída não encontrado para você' using errcode = 'P0002';
  end if;
  if v_s.situacao <> 'pendente' then
    return false;
  end if;
  perform set_config('ora.motivo', 'Pedido de saída cancelado por quem pediu', true);
  update public.caixa_saidas s set situacao = 'cancelada', decidida_por = (select auth.uid()), decidida_em = now()
  where s.id = v_s.id;
  return true;
end;
$$;
revoke all on function public.caixa_cancelar_saida(uuid) from public, anon;
grant execute on function public.caixa_cancelar_saida(uuid) to authenticated;
