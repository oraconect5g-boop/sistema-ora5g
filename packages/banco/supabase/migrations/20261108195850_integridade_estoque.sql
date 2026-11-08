-- =============================================================================
-- Integridade do estoque — correções da auditoria do Codex de 08/11/2026
--   REV-020 (#19): IMEI principal de um aparelho podia ser o IMEI2 de outro;
--   REV-021 (#20): a mesma chave de reserva aceitava outra quantidade, origem ou prazo;
--   REV-022 (#21): colisão de chave na entrada devolvia outro aparelho ou criava item sem livro;
--   REV-023 (#22): segunda entrada do mesmo aparelho inflava o saldo;
--   auditoria §7.4: liberar a reserva de outro vendedor exige permissão e fica registrado.
--
-- Regras novas:
--   * identificadores (IMEI, IMEI2, ICCID) únicos em conjunto, por organização, também entre
--     transações simultâneas (tabela de identificadores com chave primária);
--   * posição de cada aparelho/chip (em_estoque) muda só pelo livro: entrada exige o item fora
--     do estoque e saída exige o item no estoque daquela loja; saída e devolução continuam possíveis;
--   * chave de idempotência repetida só devolve o resultado anterior quando o conteúdo é o mesmo;
--     com outro conteúdo, OR004; repetições simultâneas esperam a primeira (trava da chave);
--   * sinal da quantidade conforme o tipo do lançamento;
--   * privado.divergencias_estoque() lista qualquer diferença entre livro, saldo, itens e reservas.
--
-- Ordem das travas, seguida por todas as funções (evita impasse entre vendas simultâneas):
--   chave de idempotência (advisory) → item serializado → reserva → saldo.
-- Códigos novos: OR005 posição do item incompatível com o lançamento.
-- As seis migrations aplicadas continuam iguais (REV-018); esta é nova.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trava da chave de idempotência: o mesmo pedido, enviado duas vezes ao mesmo tempo,
-- é processado uma vez; o segundo espera e enxerga o resultado do primeiro.
-- -----------------------------------------------------------------------------
create or replace function privado.trava_da_chave(p_espaco text, p_organizacao uuid, p_chave text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended(p_espaco || ':' || p_organizacao::text || ':' || p_chave, 0);
$$;

-- -----------------------------------------------------------------------------
-- REV-020: IMEI, IMEI2 e ICCID num só conjunto de identificadores
-- -----------------------------------------------------------------------------
create table privado.identificadores_itens (
  organizacao_id uuid not null,
  identificador text not null,
  item_serializado_id uuid not null references public.itens_serializados (id),
  campo text not null check (campo in ('imei', 'imei2', 'iccid')),
  primary key (organizacao_id, identificador)
);
create index identificadores_itens_item on privado.identificadores_itens (item_serializado_id);
revoke all on privado.identificadores_itens from public, anon, authenticated;

insert into privado.identificadores_itens (organizacao_id, identificador, item_serializado_id, campo)
select i.organizacao_id, v.identificador, i.id, v.campo
from public.itens_serializados i
cross join lateral (values (i.imei, 'imei'), (i.imei2, 'imei2'), (i.iccid, 'iccid')) as v (identificador, campo)
where v.identificador is not null;

create or replace function privado.registrar_identificadores()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.imei is not distinct from old.imei and new.imei2 is not distinct from old.imei2
       and new.iccid is not distinct from old.iccid and new.organizacao_id = old.organizacao_id then
      return null;
    end if;
    delete from privado.identificadores_itens where item_serializado_id = new.id;
  end if;
  begin
    insert into privado.identificadores_itens (organizacao_id, identificador, item_serializado_id, campo)
    select new.organizacao_id, v.identificador, new.id, v.campo
    from (values (new.imei, 'imei'), (new.imei2, 'imei2'), (new.iccid, 'iccid')) as v (identificador, campo)
    where v.identificador is not null;
  exception when unique_violation then
    raise exception 'IMEI/ICCID já cadastrado em outro item desta rede' using errcode = '23505';
  end;
  return null;
end;
$$;

create trigger itens_serializados_identificadores
  after insert or update of imei, imei2, iccid, organizacao_id on public.itens_serializados
  for each row execute function privado.registrar_identificadores();

-- -----------------------------------------------------------------------------
-- REV-023: posição de cada item no livro
-- -----------------------------------------------------------------------------
alter table public.itens_serializados add column em_estoque boolean not null default false;
comment on column public.itens_serializados.em_estoque is
  'Posição no livro: true depois da entrada (+1), false depois da saída (-1). Só o livro muda.';

do $$
begin
  if exists (
    select 1 from public.estoque_movimentos m
    where m.item_serializado_id is not null
    group by m.item_serializado_id
    having sum(m.quantidade) not in (0, 1)
  ) then
    raise exception 'Há item com posição inválida no livro: corrigir antes desta migration';
  end if;
end;
$$;

update public.itens_serializados i
set em_estoque = true
where (select coalesce(sum(m.quantidade), 0) from public.estoque_movimentos m where m.item_serializado_id = i.id) = 1;

-- Sinal da quantidade conforme o tipo (entrada soma, saída subtrai, ajuste nos dois sentidos).
alter table public.estoque_movimentos add constraint movimento_sinal_do_tipo check (
  (tipo in ('entrada_importacao', 'entrada_compra', 'devolucao', 'transferencia_entrada') and quantidade > 0)
  or (tipo in ('venda', 'perda', 'transferencia_saida') and quantidade < 0)
  or tipo in ('ajuste', 'ajuste_conciliacao')
);

-- O livro valida e muda a posição do item na mesma transação, com o item travado.
create or replace function privado.validar_movimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tipo text := privado.tipo_da_variante(new.variante_id);
  item public.itens_serializados;
begin
  if tipo in ('aparelho', 'chip') then
    if new.item_serializado_id is null then
      raise exception 'Aparelho e chip movimentam pelo IMEI/ICCID' using errcode = '23514';
    end if;
    -- Trava do item: duas entradas (ou saídas) simultâneas do mesmo aparelho esperam uma pela
    -- outra, e a segunda vê a posição já mudada pela primeira.
    select * into item from public.itens_serializados i where i.id = new.item_serializado_id for update;
    if not found or item.variante_id <> new.variante_id or item.organizacao_id <> new.organizacao_id then
      raise exception 'O item não é desta variação' using errcode = '23514';
    end if;
    if new.quantidade = 1 then
      if item.em_estoque then
        raise exception 'Este IMEI/ICCID já está no estoque: a entrada não conta duas vezes' using errcode = 'OR005';
      end if;
      if item.unidade_id <> new.unidade_id and new.tipo not in ('transferencia_entrada', 'devolucao') then
        raise exception 'O item não está nesta loja' using errcode = '23514';
      end if;
      update public.itens_serializados
      set em_estoque = true, unidade_id = new.unidade_id, situacao = 'disponivel'
      where id = item.id;
    else
      if not item.em_estoque or item.unidade_id <> new.unidade_id then
        raise exception 'Este IMEI/ICCID não está no estoque desta loja' using errcode = 'OR005';
      end if;
      -- Item reservado só sai pela venda que consumiu a reserva (nunca com reserva ativa).
      if item.situacao = 'reservado' and (new.tipo <> 'venda' or exists (
           select 1 from public.estoque_reservas r
           where r.item_serializado_id = item.id and r.situacao = 'ativa')) then
        raise exception 'Este IMEI/ICCID está reservado: encerre a reserva antes' using errcode = 'OR002';
      end if;
      update public.itens_serializados
      set em_estoque = false,
          situacao = case new.tipo when 'venda' then 'vendido' when 'transferencia_saida' then 'em_transito' else 'baixado' end
      where id = item.id;
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

-- Saída do estoque (defeito achado pelos testes desta correção): o "insert ... on conflict" do
-- saldo confere o check da linha proposta (quantidade negativa) antes de achar o conflito, então
-- toda saída (venda, perda, transferência) falhava. Agora atualiza a linha existente e só insere
-- na primeira entrada; saída sem saldo continua recusada pelo check.
create or replace function privado.atualizar_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.estoque_saldos s
  set quantidade = s.quantidade + new.quantidade, atualizado_em = now()
  where s.unidade_id = new.unidade_id and s.variante_id = new.variante_id;
  if not found then
    insert into public.estoque_saldos as s (organizacao_id, unidade_id, variante_id, quantidade)
    values (new.organizacao_id, new.unidade_id, new.variante_id, new.quantidade)
    on conflict (unidade_id, variante_id)
    do update set quantidade = s.quantidade + excluded.quantidade, atualizado_em = now();
  end if;
  return null;
end;
$$;

-- Fora do livro, só reservar e liberar mudam a situação do item; posição e loja, nunca.
-- pg_trigger_depth() = 1: UPDATE direto ou de uma função; >= 2: vindo do gatilho do livro.
create or replace function privado.proteger_posicao_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.em_estoque then
      raise exception 'Item novo entra no estoque pelo livro' using errcode = '23514';
    end if;
    return new;
  end if;
  if pg_trigger_depth() < 2 and (
       new.em_estoque is distinct from old.em_estoque
       or new.unidade_id is distinct from old.unidade_id
       or (new.situacao is distinct from old.situacao and not (
             old.em_estoque
             and old.situacao in ('disponivel', 'reservado')
             and new.situacao in ('disponivel', 'reservado')))) then
    raise exception 'Posição, loja e saída do item mudam só pelo livro de estoque' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger itens_serializados_proteger_posicao
  before insert or update on public.itens_serializados
  for each row execute function privado.proteger_posicao_item();

-- -----------------------------------------------------------------------------
-- REV-022: lançamento e entrada com chave conferem o conteúdo e nunca ignoram colisão
-- -----------------------------------------------------------------------------
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
  existente public.estoque_movimentos;
  lancamento bigint;
begin
  select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  if organizacao is null then
    raise exception 'Unidade não encontrada' using errcode = 'P0002';
  end if;
  if p_chave is not null then
    perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_movimentos', organizacao, p_chave));
    select * into existente from public.estoque_movimentos m
    where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
    if found then
      -- Motivo e autor não fazem parte da identidade: reprocessar o mesmo lote por outra pessoa é repetição.
      if existente.unidade_id <> p_unidade or existente.variante_id <> p_variante
         or existente.quantidade <> p_quantidade or existente.tipo <> p_tipo
         or existente.item_serializado_id is distinct from p_item
         or existente.referencia_tipo is distinct from p_referencia_tipo
         or existente.referencia_id is distinct from p_referencia_id then
        raise exception 'Chave de idempotência já usada em outro lançamento' using errcode = 'OR004';
      end if;
      return existente.id;
    end if;
  end if;
  -- Sem "on conflict": uma colisão que escapasse da trava vira erro, nunca sucesso silencioso.
  insert into public.estoque_movimentos (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade, tipo,
    motivo, referencia_tipo, referencia_id, chave_idempotencia, usuario_id)
  values (organizacao, p_unidade, p_variante, p_item, p_quantidade, p_tipo,
    p_motivo, p_referencia_tipo, p_referencia_id, p_chave, p_usuario)
  returning id into lancamento;
  return lancamento;
end;
$$;

-- Entrada de aparelho ou chip NOVO no cadastro: cria o item fora do estoque e lança +1 (o livro
-- coloca o item no estoque). A mesma chave com o mesmo conteúdo devolve o mesmo item; com outro
-- conteúdo, OR004. Item e lançamento entram juntos ou nenhum dos dois.
-- Devolução e transferência de um item já cadastrado usam lancar_movimento com o próprio item.
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
  select m.item_serializado_id, m.unidade_id, m.variante_id, m.tipo, m.quantidade, i.imei, i.imei2, i.iccid
  into existente
  from public.estoque_movimentos m
  left join public.itens_serializados i on i.id = m.item_serializado_id
  where m.organizacao_id = organizacao and m.chave_idempotencia = p_chave;
  if found then
    if existente.item_serializado_id is null or existente.unidade_id <> p_unidade
       or existente.variante_id <> p_variante or existente.tipo <> p_tipo or existente.quantidade <> 1
       or existente.imei is distinct from p_imei or existente.imei2 is distinct from p_imei2
       or existente.iccid is distinct from p_iccid then
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
-- Reservas: encerrar segue a ordem item → reserva → saldo e diz se encerrou.
-- p_sem_esperar (rotina): item ou reserva ocupados por outra transação ficam para a próxima rodada.
-- -----------------------------------------------------------------------------
drop function privado.encerrar_reserva(uuid, text);
create function privado.encerrar_reserva(p_reserva uuid, p_situacao text, p_sem_esperar boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_da_reserva uuid;
  r public.estoque_reservas;
begin
  if p_situacao is null or p_situacao not in ('consumida', 'liberada', 'expirada') then
    raise exception 'Situação de encerramento inválida' using errcode = '22023';
  end if;
  select x.item_serializado_id into item_da_reserva from public.estoque_reservas x where x.id = p_reserva;
  if not found then
    return false;
  end if;
  if item_da_reserva is not null then
    if coalesce(p_sem_esperar, false) then
      perform 1 from public.itens_serializados i where i.id = item_da_reserva for update skip locked;
      if not found then
        return false;
      end if;
    else
      perform 1 from public.itens_serializados i where i.id = item_da_reserva for update;
    end if;
  end if;
  if coalesce(p_sem_esperar, false) then
    perform 1 from public.estoque_reservas x where x.id = p_reserva for update skip locked;
    if not found then
      return false;
    end if;
  end if;
  update public.estoque_reservas x
  set situacao = p_situacao, encerrada_em = now()
  where x.id = p_reserva and x.situacao = 'ativa' and (p_situacao <> 'expirada' or x.expira_em <= now())
  returning * into r;
  if not found then
    return false;
  end if;
  update public.estoque_saldos s
  set reservado = s.reservado - r.quantidade, atualizado_em = now()
  where s.unidade_id = r.unidade_id and s.variante_id = r.variante_id;
  if r.item_serializado_id is not null and p_situacao in ('liberada', 'expirada') then
    update public.itens_serializados i set situacao = 'disponivel'
    where i.id = r.item_serializado_id and i.situacao = 'reservado';
  end if;
  return true;
end;
$$;

-- Vence as reservas passadas do prazo. Sem filtro, é a rotina; com loja + variação de acessório,
-- é a própria reserva liberando espaço. Um item ocupado por outra transação fica para a próxima rodada.
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
    order by r.id
  loop
    begin
      -- A rotina (sem filtro) não espera por item em venda; a reserva de acessório espera (sem item).
      if privado.encerrar_reserva(vencida, 'expirada', p_unidade is null) then
        total := total + 1;
      end if;
    exception when deadlock_detected or lock_not_available then
      null;
    end;
  end loop;
  return total;
end;
$$;

-- REV-021: a repetição só devolve a reserva anterior com o mesmo conteúdo (autor, loja, variação,
-- item, quantidade, origem e prazo); com qualquer diferença, OR004.
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
       or existente.variante_id <> p_variante or existente.item_serializado_id is distinct from p_item
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

-- Auditoria §7.4: quem reservou libera; liberar a reserva de outra pessoa exige
-- reserva.liberar_outros (dono e gerente) e fica na auditoria.
do $$
begin
  perform set_config('ora.motivo', 'Integridade do estoque: liberar reserva de outro usuário (auditoria do Codex de 08/11, §7.4)', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('reserva.liberar_outros', 'Liberar reserva de estoque feita por outro usuário', 'estoque');
  insert into public.papel_permissoes (papel, permissao)
  values ('dono', 'reserva.liberar_outros'), ('gerente', 'reserva.liberar_outros');
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
  usuario uuid := (select auth.uid());
  r public.estoque_reservas;
begin
  select * into r from public.estoque_reservas x where x.id = p_reserva;
  if not found or not (select public.tem_permissao('venda.registrar', r.unidade_id)) then
    raise exception 'Reserva não encontrada' using errcode = 'P0002';
  end if;
  if r.criado_por is distinct from usuario and not (select public.tem_permissao('reserva.liberar_outros', r.unidade_id)) then
    raise exception 'Só quem reservou, ou a gerência da loja, libera esta reserva' using errcode = '42501';
  end if;
  if not privado.encerrar_reserva(r.id, 'liberada') then
    return false;
  end if;
  if r.criado_por is distinct from usuario then
    insert into public.auditoria (usuario_id, unidade_id, acao, alvo_tipo, alvo_id, antes, origem)
    values (usuario, r.unidade_id, 'estoque.reserva_de_outro_liberada', 'estoque_reservas', r.id::text,
            jsonb_build_object('criado_por', r.criado_por, 'variante_id', r.variante_id,
                               'item_serializado_id', r.item_serializado_id, 'quantidade', r.quantidade),
            'liberar_reserva');
  end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Conferência: qualquer linha devolvida é divergência (vazio = estoque íntegro)
-- -----------------------------------------------------------------------------
create or replace function privado.divergencias_estoque(p_organizacao uuid default null)
returns table (regra text, unidade_id uuid, variante_id uuid, item_serializado_id uuid, esperado bigint, encontrado bigint)
language sql
stable
security definer
set search_path = ''
as $$
  -- 1. saldo de cada loja = soma do livro
  select 'saldo_igual_ao_livro', coalesce(l.unidade_id, s.unidade_id), coalesce(l.variante_id, s.variante_id),
         null::uuid, coalesce(l.soma, 0), coalesce(s.quantidade, 0)::bigint
  from (select m.unidade_id, m.variante_id, sum(m.quantidade) as soma
        from public.estoque_movimentos m
        where p_organizacao is null or m.organizacao_id = p_organizacao
        group by m.unidade_id, m.variante_id) l
  full join (select x.unidade_id, x.variante_id, x.quantidade from public.estoque_saldos x
             where p_organizacao is null or x.organizacao_id = p_organizacao) s
    on s.unidade_id = l.unidade_id and s.variante_id = l.variante_id
  where coalesce(l.soma, 0) <> coalesce(s.quantidade, 0)
  union all
  -- 2. cada aparelho/chip: soma do livro do item = posição (0 ou 1)
  select 'posicao_do_item', i.unidade_id, i.variante_id, i.id, coalesce(sum(m.quantidade), 0), i.em_estoque::int::bigint
  from public.itens_serializados i
  left join public.estoque_movimentos m on m.item_serializado_id = i.id
  where p_organizacao is null or i.organizacao_id = p_organizacao
  group by i.id, i.unidade_id, i.variante_id, i.em_estoque
  having coalesce(sum(m.quantidade), 0) <> i.em_estoque::int
  union all
  -- 3. saldo de aparelho/chip = itens em estoque naquela loja (nos dois sentidos)
  select 'saldo_igual_aos_itens', coalesce(s.unidade_id, n.unidade_id), coalesce(s.variante_id, n.variante_id),
         null::uuid, coalesce(n.itens, 0), coalesce(s.quantidade, 0)::bigint
  from (select x.unidade_id, x.variante_id, x.quantidade from public.estoque_saldos x
        where (p_organizacao is null or x.organizacao_id = p_organizacao)
          and privado.tipo_da_variante(x.variante_id) in ('aparelho', 'chip')) s
  full join (select i.unidade_id, i.variante_id, count(*) as itens from public.itens_serializados i
             where i.em_estoque and (p_organizacao is null or i.organizacao_id = p_organizacao)
             group by i.unidade_id, i.variante_id) n
    on n.unidade_id = s.unidade_id and n.variante_id = s.variante_id
  where coalesce(n.itens, 0) <> coalesce(s.quantidade, 0)
  union all
  -- 4. reservado = soma das reservas ativas
  select 'reservado_igual_as_reservas', s.unidade_id, s.variante_id, null::uuid,
         coalesce(sum(r.quantidade), 0), s.reservado::bigint
  from public.estoque_saldos s
  left join public.estoque_reservas r
    on r.unidade_id = s.unidade_id and r.variante_id = s.variante_id and r.situacao = 'ativa'
  where p_organizacao is null or s.organizacao_id = p_organizacao
  group by s.unidade_id, s.variante_id, s.reservado
  having coalesce(sum(r.quantidade), 0) <> s.reservado
  union all
  -- 5. situação coerente com a posição e com as reservas
  select case
           when i.em_estoque and i.situacao not in ('disponivel', 'reservado') then 'situacao_fora_do_estoque'
           when not i.em_estoque and i.situacao in ('disponivel', 'reservado') then 'situacao_sem_posicao'
           else 'reserva_e_situacao' end,
         i.unidade_id, i.variante_id, i.id,
         (i.situacao = 'reservado')::int::bigint,
         (select count(*) from public.estoque_reservas r where r.item_serializado_id = i.id and r.situacao = 'ativa')
  from public.itens_serializados i
  where (p_organizacao is null or i.organizacao_id = p_organizacao)
    and ((i.em_estoque and i.situacao not in ('disponivel', 'reservado'))
      or (not i.em_estoque and i.situacao in ('disponivel', 'reservado'))
      or (i.situacao = 'reservado') <> exists (
           select 1 from public.estoque_reservas r where r.item_serializado_id = i.id and r.situacao = 'ativa'));
$$;

-- -----------------------------------------------------------------------------
-- Privilégios: funções internas só para o sistema; as públicas mantêm os grants anteriores
-- -----------------------------------------------------------------------------
revoke all on function privado.trava_da_chave(text, uuid, text), privado.registrar_identificadores(),
  privado.proteger_posicao_item(), privado.encerrar_reserva(uuid, text, boolean), privado.divergencias_estoque(uuid)
  from public, anon, authenticated;

-- A migration só termina com o estoque íntegro.
do $$
begin
  if exists (select 1 from privado.divergencias_estoque()) then
    raise exception 'Estoque divergente depois da migration: conferir privado.divergencias_estoque()';
  end if;
end;
$$;
