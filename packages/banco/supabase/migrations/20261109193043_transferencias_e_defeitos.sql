-- =============================================================================
-- ADR-007 (09/11/2026) — Pedidos internos de transferência e o local DEFEITOS (#60)
-- Decisão do proprietário: 11 lojas comerciais e o local DEFEITOS (itens com erro ou problema),
-- que NÃO é loja: não vende e o saldo dele não entra no disponível da rede.
--   * unidades.tipo ganha 'excecao' (DEFEITOS). Venda e reserva de venda em local de exceção são
--     recusadas por gatilho.
--   * Permissão estoque.transferir (dono e gerente): separar, enviar e receber na própria loja.
--     Sair de um local de exceção (regularizar) exige estoque.ajustar na origem.
--   * Pedido: solicitada → separada (itens escolhidos e reservados na origem) → enviada (sai da
--     origem pelo livro; aparelho e chip ficam em trânsito) → recebida ou recebida_com_divergencia
--     (entra no destino só o que foi conferido). Recusada (antes de separar) e cancelada (antes de
--     enviar, libera a reserva uma vez). Depois do envio não há cancelamento: só recebimento.
--   * Reserva de transferência entra no mesmo "reservado" do saldo que a reserva de venda: o
--     disponível = físico − reservado conta as duas uma vez. Não vence sozinha (expira_em infinito).
--   * Cada passo é idempotente pela situação: repetir o mesmo passo devolve a situação; passo de
--     outro jeito é OR004.
-- Ordem das travas: transferência → item serializado (por id) → reserva → saldo (igual à venda
-- depois da própria venda). Códigos: OR001 sem saldo, OR002 item indisponível, OR003 item de
-- outra loja, OR004 passo repetido de outro jeito.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'ADR-007: pedidos internos de transferência e local DEFEITOS', true);
  insert into public.permissoes (codigo, descricao, modulo) values
    ('estoque.transferir', 'Separar, enviar e receber transferências entre lojas', 'estoque');
  insert into public.papel_permissoes (papel, permissao) values
    ('dono', 'estoque.transferir'), ('gerente', 'estoque.transferir');
end;
$$;

alter table public.unidades drop constraint unidades_tipo_check;
alter table public.unidades add constraint unidades_tipo_check
  check (tipo in ('loja_fisica', 'online', 'assistencia', 'deposito', 'excecao'));

alter table public.estoque_reservas drop constraint estoque_reservas_origem_check;
alter table public.estoque_reservas add constraint estoque_reservas_origem_check
  check (origem in ('pdv', 'online', 'transferencia'));

-- -----------------------------------------------------------------------------
-- 1. Local de exceção não vende
-- -----------------------------------------------------------------------------
create or replace function privado.local_de_excecao_nao_vende()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.unidades u where u.id = new.unidade_id and u.tipo = 'excecao')
     and (tg_table_name = 'vendas' or to_jsonb(new) ->> 'origem' in ('pdv', 'online')) then
    raise exception 'DEFEITOS (local de exceção) não vende: transfira o item para uma loja antes' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger vendas_fora_da_excecao before insert on public.vendas
  for each row execute function privado.local_de_excecao_nao_vende();
create trigger reservas_fora_da_excecao before insert on public.estoque_reservas
  for each row execute function privado.local_de_excecao_nao_vende();

-- -----------------------------------------------------------------------------
-- 2. Pedidos de transferência
-- -----------------------------------------------------------------------------
create table public.transferencias (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  origem_id uuid not null,
  destino_id uuid not null,
  variante_id uuid not null,
  quantidade int not null check (quantidade between 1 and 9999),
  motivo text not null check (length(trim(motivo)) between 3 and 500),
  chave text not null check (length(trim(chave)) > 0),
  conteudo text not null,
  situacao text not null default 'solicitada' check (situacao in (
    'solicitada', 'separada', 'enviada', 'recebida', 'recebida_com_divergencia', 'recusada', 'cancelada')),
  reserva_id uuid references public.estoque_reservas (id),
  quantidade_recebida int check (quantidade_recebida between 0 and quantidade),
  observacao text check (observacao is null or length(observacao) <= 500),
  solicitado_por uuid not null references public.perfis_usuario (id),
  solicitado_em timestamptz not null default now(),
  separado_por uuid references public.perfis_usuario (id),
  separado_em timestamptz,
  enviado_por uuid references public.perfis_usuario (id),
  enviado_em timestamptz,
  recebido_por uuid references public.perfis_usuario (id),
  recebido_em timestamptz,
  encerrado_por uuid references public.perfis_usuario (id),
  encerrado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  foreign key (origem_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (destino_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint origem_diferente_do_destino check (origem_id <> destino_id),
  constraint recebida_com_quantidade check ((situacao in ('recebida', 'recebida_com_divergencia')) = (quantidade_recebida is not null))
);
create index transferencias_origem on public.transferencias (origem_id, situacao);
create index transferencias_destino on public.transferencias (destino_id, situacao);
create index transferencias_origem_organizacao on public.transferencias (origem_id, organizacao_id);
create index transferencias_destino_organizacao on public.transferencias (destino_id, organizacao_id);
create index transferencias_variante_organizacao on public.transferencias (variante_id, organizacao_id);
create index transferencias_reserva on public.transferencias (reserva_id);
create index transferencias_solicitado_por on public.transferencias (solicitado_por);
create index transferencias_separado_por on public.transferencias (separado_por);
create index transferencias_enviado_por on public.transferencias (enviado_por);
create index transferencias_recebido_por on public.transferencias (recebido_por);
create index transferencias_encerrado_por on public.transferencias (encerrado_por);

-- Aparelho e chip: o IMEI/ICCID escolhido na separação, a reserva dele e a conferência no destino.
create table public.transferencia_itens (
  transferencia_id uuid not null references public.transferencias (id),
  item_serializado_id uuid not null references public.itens_serializados (id),
  reserva_id uuid not null references public.estoque_reservas (id),
  recebido boolean,
  primary key (transferencia_id, item_serializado_id)
);
create index transferencia_itens_item on public.transferencia_itens (item_serializado_id);
create index transferencia_itens_reserva on public.transferencia_itens (reserva_id);

create trigger transferencias_auditar after insert or update on public.transferencias
  for each row execute function privado.auditar_mudanca();

alter table public.transferencias enable row level security;
alter table public.transferencia_itens enable row level security;
revoke all on public.transferencias, public.transferencia_itens from anon, authenticated;
revoke all on sequence public.transferencias_numero_seq from anon, authenticated;
grant select on public.transferencias, public.transferencia_itens to authenticated;
create policy transferencias_ler on public.transferencias for select to authenticated
  using (origem_id in (select privado.unidades_com_permissao('estoque.consultar'))
         or destino_id in (select privado.unidades_com_permissao('estoque.consultar')));
create policy transferencia_itens_ler on public.transferencia_itens for select to authenticated
  using (transferencia_id in (select t.id from public.transferencias t));

-- -----------------------------------------------------------------------------
-- 3. Livro: item reservado também sai pela transferência que consumiu a reserva
-- -----------------------------------------------------------------------------
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
      -- Item reservado só sai pela venda ou pela transferência que consumiu a reserva (nunca com
      -- reserva ativa). Transferência: ADR-007 (#60).
      if item.situacao = 'reservado' and (new.tipo not in ('venda', 'transferencia_saida') or exists (
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

-- -----------------------------------------------------------------------------
-- 4. Funções do pedido
-- -----------------------------------------------------------------------------
-- Transferência travada e quem pode agir nela (sessão na loja do lado certo, com a permissão).
create or replace function privado.transferencia_travada(p_transferencia uuid)
returns public.transferencias
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.transferencias;
begin
  select * into t from public.transferencias x where x.id = p_transferencia for update;
  if not found or (select public.unidade_atual()) is null
     or (select public.unidade_atual()) not in (t.origem_id, t.destino_id) then
    raise exception 'Transferência não encontrada' using errcode = 'P0002';
  end if;
  return t;
end;
$$;

-- p_origem e p_destino: lojas da mesma organização, ativas e diferentes; a sessão está numa delas.
create or replace function public.transferencia_solicitar(p_origem uuid, p_destino uuid, p_variante uuid, p_quantidade int, p_motivo text, p_chave text)
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
  conteudo text;
  existente public.transferencias;
  nova uuid;
begin
  if unidade is null or unidade not in (p_origem, p_destino) or not (select public.tem_permissao('estoque.consultar', unidade)) then
    raise exception 'Peça a transferência estando na loja de origem ou de destino' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  conteudo := md5(concat_ws('|', p_origem, p_destino, p_variante, p_quantidade, trim(coalesce(p_motivo, ''))));
  perform pg_advisory_xact_lock(privado.trava_da_chave('transferencias', organizacao, p_chave));
  select * into existente from public.transferencias t where t.organizacao_id = organizacao and t.chave = p_chave;
  if found then
    if existente.conteudo <> conteudo or existente.solicitado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if p_origem is null or p_destino is null or p_origem = p_destino or (
       select count(*) from public.unidades u
       where u.id in (p_origem, p_destino) and u.organizacao_id = organizacao and u.status = 'ativa') <> 2 then
    raise exception 'Escolha duas lojas ativas e diferentes desta rede' using errcode = '22023';
  end if;
  if p_variante is null or not exists (
       select 1 from public.variantes v join public.produtos p on p.id = v.produto_id
       where v.id = p_variante and v.organizacao_id = organizacao and p.tipo in ('aparelho', 'chip', 'acessorio')) then
    raise exception 'Produto sem estoque para transferir' using errcode = '22023';
  end if;
  if p_quantidade is null or p_quantidade not between 1 and 9999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  if p_motivo is null or length(trim(p_motivo)) not between 3 and 500 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, solicitado_por)
  values (organizacao, p_origem, p_destino, p_variante, p_quantidade, trim(p_motivo), p_chave, conteudo, usuario)
  returning id into nova;
  return nova;
end;
$$;

-- A origem separa: aparelho e chip pelo IMEI/ICCID (p_itens, exatamente a quantidade); acessório
-- pela quantidade (p_itens vazio). Reserva na origem, no mesmo "reservado" da venda.
create or replace function public.transferencia_separar(p_transferencia uuid, p_itens uuid[])
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  t public.transferencias;
  tipo_origem text;
  tipo_produto text;
  lista uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_itens, '{}')) as x where x is not null), '{}');
  item public.itens_serializados;
  item_escolhido uuid;
  nova_reserva uuid;
begin
  t := privado.transferencia_travada(p_transferencia);
  select u.tipo into tipo_origem from public.unidades u where u.id = t.origem_id;
  if (select public.unidade_atual()) <> t.origem_id
     or not (select public.tem_permissao(case when tipo_origem = 'excecao' then 'estoque.ajustar' else 'estoque.transferir' end, t.origem_id)) then
    raise exception 'Só a loja de origem separa (de DEFEITOS, só quem ajusta estoque)' using errcode = '42501';
  end if;
  select p.tipo into tipo_produto from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = t.variante_id;
  if t.situacao <> 'solicitada' then
    if t.situacao = 'separada' and (tipo_produto = 'acessorio' and cardinality(lista) = 0
        or lista = coalesce((select array_agg(i.item_serializado_id order by i.item_serializado_id) from public.transferencia_itens i where i.transferencia_id = t.id), '{}')) then
      return t.situacao;
    end if;
    raise exception 'Esta transferência já está % e não volta a ser separada', t.situacao using errcode = 'OR004';
  end if;
  if tipo_produto in ('aparelho', 'chip') then
    if cardinality(lista) <> t.quantidade then
      raise exception 'Escolha exatamente % IMEI/ICCID', t.quantidade using errcode = '22023';
    end if;
    for item in select * from public.itens_serializados s where s.id = any (lista) order by s.id for update loop
      null;
    end loop;
    foreach item_escolhido in array lista loop
      select * into item from public.itens_serializados s where s.id = item_escolhido;
      if not found or item.variante_id <> t.variante_id or item.unidade_id <> t.origem_id then
        raise exception 'Este IMEI/ICCID não é deste produto nesta loja' using errcode = 'OR003';
      end if;
      if not item.em_estoque or item.situacao <> 'disponivel' then
        raise exception 'Este IMEI/ICCID não está disponível (%)', item.situacao using errcode = 'OR002';
      end if;
    end loop;
    foreach item_escolhido in array lista loop
      update public.itens_serializados s set situacao = 'reservado' where s.id = item_escolhido;
      update public.estoque_saldos s set reservado = s.reservado + 1, atualizado_em = now()
      where s.unidade_id = t.origem_id and s.variante_id = t.variante_id and s.quantidade - s.reservado >= 1;
      if not found then
        raise exception 'Estoque insuficiente na origem' using errcode = 'OR001';
      end if;
      insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade, origem, chave_idempotencia, expira_em, criado_por)
      values (t.organizacao_id, t.origem_id, t.variante_id, item_escolhido, 1, 'transferencia', 'transferencia:' || t.id || ':item:' || item_escolhido, 'infinity', usuario)
      returning id into nova_reserva;
      insert into public.transferencia_itens (transferencia_id, item_serializado_id, reserva_id) values (t.id, item_escolhido, nova_reserva);
    end loop;
  else
    if cardinality(lista) > 0 then
      raise exception 'Acessório é separado pela quantidade' using errcode = '22023';
    end if;
    perform privado.expirar_reservas(t.origem_id, t.variante_id);
    update public.estoque_saldos s set reservado = s.reservado + t.quantidade, atualizado_em = now()
    where s.unidade_id = t.origem_id and s.variante_id = t.variante_id and s.quantidade - s.reservado >= t.quantidade;
    if not found then
      raise exception 'Estoque insuficiente na origem' using errcode = 'OR001';
    end if;
    insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, quantidade, origem, chave_idempotencia, expira_em, criado_por)
    values (t.organizacao_id, t.origem_id, t.variante_id, t.quantidade, 'transferencia', 'transferencia:' || t.id, 'infinity', usuario)
    returning id into nova_reserva;
    update public.transferencias x set reserva_id = nova_reserva where x.id = t.id;
  end if;
  perform set_config('ora.motivo', 'Transferência nº ' || t.numero || ' separada', true);
  update public.transferencias x set situacao = 'separada', separado_por = usuario, separado_em = now(), atualizado_em = now() where x.id = t.id;
  return 'separada';
end;
$$;

-- A origem envia: consome as reservas e lança a saída pelo livro (aparelho e chip em trânsito).
create or replace function public.transferencia_enviar(p_transferencia uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  t public.transferencias;
  tipo_origem text;
  linha public.transferencia_itens;
begin
  t := privado.transferencia_travada(p_transferencia);
  select u.tipo into tipo_origem from public.unidades u where u.id = t.origem_id;
  if (select public.unidade_atual()) <> t.origem_id
     or not (select public.tem_permissao(case when tipo_origem = 'excecao' then 'estoque.ajustar' else 'estoque.transferir' end, t.origem_id)) then
    raise exception 'Só a loja de origem envia (de DEFEITOS, só quem ajusta estoque)' using errcode = '42501';
  end if;
  if t.situacao in ('enviada', 'recebida', 'recebida_com_divergencia') then
    return t.situacao;
  end if;
  if t.situacao <> 'separada' then
    raise exception 'Separe antes de enviar (situação: %)', t.situacao using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Transferência nº ' || t.numero || ' enviada', true);
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.transferencia_itens i where i.transferencia_id = t.id)
  order by s.id for update;
  for linha in select * from public.transferencia_itens i where i.transferencia_id = t.id order by i.item_serializado_id loop
    perform privado.encerrar_reserva(linha.reserva_id, 'consumida');
    perform privado.lancar_movimento(t.origem_id, t.variante_id, -1, 'transferencia_saida', linha.item_serializado_id,
      'Transferência nº ' || t.numero || ': ' || t.motivo, 'transferencia', t.id::text,
      'transferencia:' || t.id || ':saida:' || linha.item_serializado_id, usuario);
  end loop;
  if t.reserva_id is not null then
    perform privado.encerrar_reserva(t.reserva_id, 'consumida');
    perform privado.lancar_movimento(t.origem_id, t.variante_id, -t.quantidade, 'transferencia_saida', null,
      'Transferência nº ' || t.numero || ': ' || t.motivo, 'transferencia', t.id::text, 'transferencia:' || t.id || ':saida', usuario);
  end if;
  update public.transferencias x set situacao = 'enviada', enviado_por = usuario, enviado_em = now(), atualizado_em = now() where x.id = t.id;
  return 'enviada';
end;
$$;

-- O destino recebe e confere: aparelho e chip pelo IMEI/ICCID lido (só os da transferência entram);
-- acessório pela quantidade contada. O que faltar fica como divergência, com explicação.
create or replace function public.transferencia_receber(p_transferencia uuid, p_identificadores text[], p_quantidade int, p_observacao text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  t public.transferencias;
  lidos text[] := coalesce((select array_agg(distinct regexp_replace(x, '[^0-9]', '', 'g')) from unnest(coalesce(p_identificadores, '{}')) as x
                            where regexp_replace(coalesce(x, ''), '[^0-9]', '', 'g') <> ''), '{}');
  observacao_limpa text := nullif(left(trim(coalesce(p_observacao, '')), 500), '');
  recebidos int := 0;
  linha record;
  lido text;
begin
  t := privado.transferencia_travada(p_transferencia);
  if (select public.unidade_atual()) <> t.destino_id or not (select public.tem_permissao('estoque.transferir', t.destino_id)) then
    raise exception 'Só a loja de destino recebe' using errcode = '42501';
  end if;
  if t.situacao in ('recebida', 'recebida_com_divergencia') then
    return t.situacao;
  end if;
  if t.situacao <> 'enviada' then
    raise exception 'A transferência ainda não foi enviada (situação: %)', t.situacao using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Transferência nº ' || t.numero || ' recebida', true);
  if exists (select 1 from public.transferencia_itens i where i.transferencia_id = t.id) then
    -- Identidade: cada número lido precisa ser de um item desta transferência (trocado é recusado).
    foreach lido in array lidos loop
      if not exists (select 1 from public.transferencia_itens i join public.itens_serializados s on s.id = i.item_serializado_id
                     where i.transferencia_id = t.id and lido in (s.imei, s.imei2, s.iccid)) then
        raise exception 'O IMEI/ICCID % não é desta transferência', lido using errcode = '22023';
      end if;
    end loop;
    for linha in
      select i.item_serializado_id, (s.imei = any (lidos) or s.imei2 = any (lidos) or s.iccid = any (lidos)) as conferido
      from public.transferencia_itens i join public.itens_serializados s on s.id = i.item_serializado_id
      where i.transferencia_id = t.id order by i.item_serializado_id
    loop
      update public.transferencia_itens i set recebido = coalesce(linha.conferido, false)
      where i.transferencia_id = t.id and i.item_serializado_id = linha.item_serializado_id;
      if linha.conferido then
        perform privado.lancar_movimento(t.destino_id, t.variante_id, 1, 'transferencia_entrada', linha.item_serializado_id,
          'Transferência nº ' || t.numero || ': ' || t.motivo, 'transferencia', t.id::text,
          'transferencia:' || t.id || ':entrada:' || linha.item_serializado_id, usuario);
        recebidos := recebidos + 1;
      end if;
    end loop;
  else
    if p_quantidade is null or p_quantidade not between 0 and t.quantidade then
      raise exception 'Informe a quantidade contada (de 0 a %)', t.quantidade using errcode = '22023';
    end if;
    recebidos := p_quantidade;
    if recebidos > 0 then
      perform privado.lancar_movimento(t.destino_id, t.variante_id, recebidos, 'transferencia_entrada', null,
        'Transferência nº ' || t.numero || ': ' || t.motivo, 'transferencia', t.id::text, 'transferencia:' || t.id || ':entrada', usuario);
    end if;
  end if;
  if recebidos < t.quantidade and (observacao_limpa is null or length(observacao_limpa) < 10) then
    raise exception 'Faltou item: explique a divergência (pelo menos 10 caracteres)' using errcode = '22023';
  end if;
  update public.transferencias x
  set situacao = case when recebidos = t.quantidade then 'recebida' else 'recebida_com_divergencia' end,
      quantidade_recebida = recebidos, observacao = observacao_limpa, recebido_por = usuario, recebido_em = now(), atualizado_em = now()
  where x.id = t.id;
  return case when recebidos = t.quantidade then 'recebida' else 'recebida_com_divergencia' end;
end;
$$;

-- Recusar (origem, antes de separar) ou cancelar (quem pediu ou a origem, antes de enviar).
create or replace function public.transferencia_encerrar(p_transferencia uuid, p_situacao text, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  t public.transferencias;
  linha public.transferencia_itens;
begin
  if p_situacao is null or p_situacao not in ('recusada', 'cancelada') then
    raise exception 'Use recusada ou cancelada' using errcode = '22023';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  t := privado.transferencia_travada(p_transferencia);
  if t.situacao = p_situacao then
    return t.situacao;
  end if;
  if p_situacao = 'recusada' and ((select public.unidade_atual()) <> t.origem_id
       or not (select public.tem_permissao('estoque.transferir', t.origem_id)) or t.situacao <> 'solicitada') then
    raise exception 'Só a origem recusa, e antes de separar' using errcode = '42501';
  end if;
  if p_situacao = 'cancelada' and (t.situacao not in ('solicitada', 'separada')
       or not (t.solicitado_por = usuario or ((select public.unidade_atual()) = t.origem_id
                                               and (select public.tem_permissao('estoque.transferir', t.origem_id))))) then
    raise exception 'Cancela quem pediu ou a origem, e só antes do envio (depois, receba com divergência)' using errcode = '42501';
  end if;
  perform set_config('ora.motivo', trim(p_motivo), true);
  perform 1 from public.itens_serializados s
  where s.id in (select i.item_serializado_id from public.transferencia_itens i where i.transferencia_id = t.id)
  order by s.id for update;
  for linha in select * from public.transferencia_itens i where i.transferencia_id = t.id order by i.item_serializado_id loop
    perform privado.encerrar_reserva(linha.reserva_id, 'liberada');
  end loop;
  if t.reserva_id is not null then
    perform privado.encerrar_reserva(t.reserva_id, 'liberada');
  end if;
  update public.transferencias x
  set situacao = p_situacao, observacao = left(trim(p_motivo), 500), encerrado_por = usuario, encerrado_em = now(), atualizado_em = now()
  where x.id = t.id;
  return p_situacao;
end;
$$;

-- "Onde tem este produto?": cada local da rede com físico, reservado (venda e transferência),
-- disponível para vender e o que está chegando em trânsito. DEFEITOS vem marcado e com disponível
-- zero (não vende). Sem custo e sem IMEI.
create or replace function public.estoque_na_rede(p_variante uuid)
returns table (unidade_id uuid, unidade text, tipo text, fisico int, reservado int, disponivel int, chegando int, pedidos_abertos int)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome, u.tipo,
         coalesce(s.quantidade, 0), coalesce(s.reservado, 0),
         case when u.tipo = 'excecao' then 0 else coalesce(s.quantidade - s.reservado, 0) end,
         coalesce((select sum(case when t.situacao = 'enviada' then t.quantidade else 0 end)::int from public.transferencias t
                   where t.destino_id = u.id and t.variante_id = p_variante), 0),
         coalesce((select count(*)::int from public.transferencias t
                   where (t.destino_id = u.id or t.origem_id = u.id) and t.variante_id = p_variante
                     and t.situacao in ('solicitada', 'separada', 'enviada')), 0)
  from public.unidades u
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = p_variante
  where u.status = 'ativa' and u.tipo in ('loja_fisica', 'deposito', 'excecao')
    and u.organizacao_id in (
      select x.organizacao_id from public.unidades x
      where x.id in (select privado.unidades_com_permissao('estoque.consultar')))
  order by u.tipo = 'excecao', u.nome;
$$;

revoke all on function privado.local_de_excecao_nao_vende(), privado.transferencia_travada(uuid) from public, anon, authenticated;
revoke all on function public.transferencia_solicitar(uuid, uuid, uuid, int, text, text), public.transferencia_separar(uuid, uuid[]),
  public.transferencia_enviar(uuid), public.transferencia_receber(uuid, text[], int, text), public.transferencia_encerrar(uuid, text, text),
  public.estoque_na_rede(uuid) from public, anon;
grant execute on function public.transferencia_solicitar(uuid, uuid, uuid, int, text, text), public.transferencia_separar(uuid, uuid[]),
  public.transferencia_enviar(uuid), public.transferencia_receber(uuid, text[], int, text), public.transferencia_encerrar(uuid, text, text),
  public.estoque_na_rede(uuid) to authenticated;
