-- Reversão de integridade_estoque. SOMENTE em banco sem dados reais: volta as funções de estoque
-- à versão de catalogo_estoque (com os defeitos REV-020 a REV-023) e apaga a posição dos itens,
-- os identificadores e a permissão reserva.liberar_outros. A auditoria só aceita inserção: os
-- eventos já gravados ficam.
drop trigger if exists itens_serializados_proteger_posicao on public.itens_serializados;
drop trigger if exists itens_serializados_identificadores on public.itens_serializados;
drop function if exists privado.proteger_posicao_item(), privado.registrar_identificadores(),
  privado.divergencias_estoque(uuid), privado.encerrar_reserva(uuid, text, boolean);
drop table if exists privado.identificadores_itens;
alter table public.estoque_movimentos drop constraint if exists movimento_sinal_do_tipo;
alter table public.itens_serializados drop column if exists em_estoque;

do $$
begin
  perform set_config('ora.motivo', 'Reversão de integridade_estoque', true);
  delete from public.papel_permissoes where permissao = 'reserva.liberar_outros';
  delete from public.permissoes where codigo = 'reserva.liberar_outros';
end;
$$;

-- Funções como estavam em 20261108150620_catalogo_estoque.sql
-- O saldo acompanha o livro na mesma transação; o check do saldo recusa estoque negativo.
create or replace function privado.atualizar_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.estoque_saldos as s (organizacao_id, unidade_id, variante_id, quantidade)
  values (new.organizacao_id, new.unidade_id, new.variante_id, new.quantidade)
  on conflict (unidade_id, variante_id)
  do update set quantidade = s.quantidade + excluded.quantidade, atualizado_em = now();
  return null;
end;
$$;

create or replace function privado.validar_movimento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tipo text := privado.tipo_da_variante(new.variante_id);
  item record;
begin
  if tipo in ('aparelho', 'chip') then
    if new.item_serializado_id is null then
      raise exception 'Aparelho e chip movimentam pelo IMEI/ICCID' using errcode = '23514';
    end if;
    select i.variante_id, i.unidade_id into item from public.itens_serializados i where i.id = new.item_serializado_id;
    if item.variante_id is distinct from new.variante_id or item.unidade_id is distinct from new.unidade_id then
      raise exception 'O item não é desta variação ou não está nesta loja' using errcode = '23514';
    end if;
  elsif tipo = 'acessorio' then
    if new.item_serializado_id is not null then
      raise exception 'Acessório movimenta por quantidade' using errcode = '23514';
    end if;
  else
    raise exception 'Este tipo de item não tem estoque' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function privado.lancar_movimento(
  p_unidade uuid, p_variante uuid, p_quantidade int, p_tipo text, p_item uuid default null,
  p_motivo text default null, p_referencia_tipo text default null, p_referencia_id text default null,
  p_chave text default null, p_usuario uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  organizacao uuid;
  lancamento bigint;
begin
  select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  insert into public.estoque_movimentos (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade, tipo,
    motivo, referencia_tipo, referencia_id, chave_idempotencia, usuario_id)
  values (organizacao, p_unidade, p_variante, p_item, p_quantidade, p_tipo,
    p_motivo, p_referencia_tipo, p_referencia_id, p_chave, p_usuario)
  on conflict (organizacao_id, chave_idempotencia) where chave_idempotencia is not null do nothing
  returning id into lancamento;
  if lancamento is null then
    select m.id into lancamento from public.estoque_movimentos m
    where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
  end if;
  return lancamento;
end;
$$;

-- Entrada de um aparelho ou chip: cria o item disponível e lança +1 no livro. A mesma chave
-- devolve o item já criado (importação reprocessada não duplica).
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
  item uuid;
begin
  if p_tipo not in ('entrada_importacao', 'entrada_compra', 'ajuste_conciliacao', 'ajuste', 'devolucao') then
    raise exception 'Tipo de entrada inválido: %', p_tipo using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  select m.item_serializado_id into item from public.estoque_movimentos m
  where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
  if item is not null then
    return item;
  end if;
  insert into public.itens_serializados (organizacao_id, variante_id, unidade_id, imei, imei2, iccid, numero_serie, condicao)
  values (organizacao, p_variante, p_unidade, p_imei, p_imei2, p_iccid, p_numero_serie, p_condicao)
  returning id into item;
  perform privado.lancar_movimento(p_unidade, p_variante, 1, p_tipo, item, null, null, null, p_chave, p_usuario);
  return item;
end;
$$;

create function privado.encerrar_reserva(p_reserva uuid, p_situacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.estoque_reservas;
begin
  update public.estoque_reservas
  set situacao = p_situacao, encerrada_em = now()
  where id = p_reserva and situacao = 'ativa'
  returning * into r;
  if not found then
    return;
  end if;
  update public.estoque_saldos
  set reservado = reservado - r.quantidade, atualizado_em = now()
  where unidade_id = r.unidade_id and variante_id = r.variante_id;
  if r.item_serializado_id is not null and p_situacao in ('liberada', 'expirada') then
    update public.itens_serializados set situacao = 'disponivel'
    where id = r.item_serializado_id and situacao = 'reservado';
  end if;
end;
$$;

-- Vence as reservas passadas do prazo (a rotina chama sem filtro; a reserva chama por loja + variação).
create or replace function privado.expirar_reservas(p_unidade uuid default null, p_variante uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  vencida uuid;
  total int := 0;
begin
  for vencida in
    select r.id from public.estoque_reservas r
    where r.situacao = 'ativa' and r.expira_em <= now()
      and (p_unidade is null or r.unidade_id = p_unidade)
      and (p_variante is null or r.variante_id = p_variante)
    for update skip locked
  loop
    perform privado.encerrar_reserva(vencida, 'expirada');
    total := total + 1;
  end loop;
  return total;
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
  nova uuid;
begin
  if unidade is null or not (select public.tem_permissao('venda.registrar', unidade)) then
    raise exception 'Sem permissão para vender nesta unidade' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_origem is null or p_origem not in ('pdv', 'online') then
    raise exception 'Origem inválida' using errcode = '22023';
  end if;
  if p_minutos is null or p_minutos not between 1 and 120 then
    raise exception 'Prazo da reserva entre 1 e 120 minutos' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;

  -- Repetir o mesmo pedido devolve a mesma reserva; a chave nunca serve para outra operação.
  select * into existente from public.estoque_reservas r
  where r.organizacao_id = organizacao and r.chave_idempotencia = p_chave;
  if found then
    if existente.criado_por is distinct from usuario or existente.variante_id <> p_variante
       or existente.item_serializado_id is distinct from p_item or existente.unidade_id <> unidade then
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

  perform privado.expirar_reservas(unidade, p_variante);

  if tipo in ('aparelho', 'chip') then
    if p_item is null or coalesce(p_quantidade, 1) <> 1 then
      raise exception 'Aparelho e chip são reservados um a um, pelo IMEI/ICCID' using errcode = '22023';
    end if;
    select * into item from public.itens_serializados i where i.id = p_item for update;
    if not found or item.variante_id <> p_variante or item.unidade_id <> unidade then
      raise exception 'Este IMEI/ICCID não está nesta loja' using errcode = 'OR003';
    end if;
    if item.situacao <> 'disponivel' then
      raise exception 'Este IMEI/ICCID não está disponível (%)', item.situacao using errcode = 'OR002';
    end if;
    update public.itens_serializados set situacao = 'reservado' where id = p_item;
    qtd := 1;
  else
    if p_item is not null then
      raise exception 'Acessório é reservado por quantidade' using errcode = '22023';
    end if;
    if p_quantidade is null or p_quantidade < 1 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;
    qtd := p_quantidade;
  end if;

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

create or replace function public.liberar_reserva(p_reserva uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.estoque_reservas;
begin
  select * into r from public.estoque_reservas where id = p_reserva for update;
  if not found or not (select public.tem_permissao('venda.registrar', r.unidade_id)) then
    raise exception 'Reserva não encontrada' using errcode = 'P0002';
  end if;
  if r.situacao <> 'ativa' then
    return false;
  end if;
  perform privado.encerrar_reserva(r.id, 'liberada');
  return true;
end;
$$;

drop function if exists privado.trava_da_chave(text, uuid, text);
revoke all on function privado.encerrar_reserva(uuid, text) from public, anon, authenticated;
