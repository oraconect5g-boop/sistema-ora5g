-- =============================================================================
-- Lote TRF-c (achado F18-05 da reanálise do Codex de 18/11/2026, PR #104; ORA-INV-007; a decisão D-049): o pedido de
-- transferência reserva na origem.
--
-- A orientação do proprietário de 18/11 pede reduzir o disponível da origem quando o produto é colocado em
-- transferência. Até aqui o pedido não reservava (o padrão reversível da D-049) e só a separação tirava do disponível.
-- Agora:
--   * privado.transferencia_reservar(transferência, quem): reserva na origem a quantidade do pedido, com a mesma trava
--     da venda (a linha de estoque_saldos só muda se houver o livre); sem disponível suficiente, OR001 com o código do
--     produto, o livre e o pedido. A reserva é pela quantidade também no aparelho e no chip: o IMEI/ICCID continua
--     escolhido na separação. A chave da reserva do pedido ('transferencia:<id>:pedido') não é a da separação antiga;
--   * public.transferencia_solicitar e public.transferencia_solicitar_remessa reservam na mesma transação do pedido (a
--     remessa, tudo ou nada, na ordem das variações, para dois pedidos ao mesmo tempo não travarem um ao outro);
--   * public.transferencia_separar usa a reserva do pedido: no acessório, o saldo não muda; no aparelho e no chip, a
--     reserva pela quantidade vira a reserva de cada IMEI/ICCID escolhido, sem contar duas vezes. O pedido de antes deste
--     lote, sem reserva, reserva na separação, como antes;
--   * sem mudança: cancelar ou recusar libera a reserva da transferência (transferencia_encerrar), e enviar consome a
--     reserva e baixa o físico da origem uma vez (transferencia_enviar).
-- O físico, o reservado e o em trânsito continuam sem baixa dupla. As três definições em vigor foram conferidas contra o
-- banco de desenvolvimento (md5 do corpo) antes da cópia.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.transferencia_reservar(p_transferencia uuid, p_usuario uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.transferencias;
  v_reserva uuid;
  v_livre int;
  v_sku text;
begin
  select * into t from public.transferencias x where x.id = p_transferencia;
  if not found or t.situacao <> 'solicitada' or t.reserva_id is not null then
    raise exception 'Esta transferência não é um pedido aberto sem reserva' using errcode = '22023';
  end if;
  perform privado.expirar_reservas(t.origem_id, t.variante_id);
  update public.estoque_saldos s set reservado = s.reservado + t.quantidade, atualizado_em = now()
  where s.unidade_id = t.origem_id and s.variante_id = t.variante_id and s.quantidade - s.reservado >= t.quantidade;
  if not found then
    select coalesce(max(s.quantidade - s.reservado), 0) into v_livre from public.estoque_saldos s
    where s.unidade_id = t.origem_id and s.variante_id = t.variante_id;
    select v.sku into v_sku from public.variantes v where v.id = t.variante_id;
    raise exception 'Estoque insuficiente na origem para %: % disponível, pedido %', v_sku, greatest(v_livre, 0), t.quantidade
      using errcode = 'OR001';
  end if;
  insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, quantidade, origem, chave_idempotencia, expira_em, criado_por)
  values (t.organizacao_id, t.origem_id, t.variante_id, t.quantidade, 'transferencia', 'transferencia:' || t.id || ':pedido', 'infinity', p_usuario)
  returning id into v_reserva;
  update public.transferencias x set reserva_id = v_reserva, atualizado_em = now() where x.id = t.id;
  return v_reserva;
end;
$$;
revoke all on function privado.transferencia_reservar(uuid, uuid) from public, anon, authenticated;

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
  -- TRF-c (D-049; a orientação do proprietário de 18/11): o pedido já reserva na origem, na mesma transação.
  perform privado.transferencia_reservar(nova, usuario);
  return nova;
end;
$$;
revoke all on function public.transferencia_solicitar(uuid, uuid, uuid, int, text, text) from public, anon;
grant execute on function public.transferencia_solicitar(uuid, uuid, uuid, int, text, text) to authenticated;

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
    if t.reserva_id is not null then
      -- TRF-c: a reserva do pedido (pela quantidade) vira a reserva de cada IMEI/ICCID escolhido, sem contar duas vezes.
      perform privado.encerrar_reserva(t.reserva_id, 'consumida');
      update public.transferencias x set reserva_id = null where x.id = t.id;
    end if;
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
    -- TRF-c: o acessório já está reservado desde o pedido; só o pedido de antes deste lote, sem reserva, reserva aqui.
    if t.reserva_id is null then
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
  end if;
  perform set_config('ora.motivo', 'Transferência nº ' || t.numero || ' separada', true);
  update public.transferencias x set situacao = 'separada', separado_por = usuario, separado_em = now(), atualizado_em = now() where x.id = t.id;
  return 'separada';
end;
$$;
revoke all on function public.transferencia_separar(uuid, uuid[]) from public, anon;
grant execute on function public.transferencia_separar(uuid, uuid[]) to authenticated;

create or replace function public.transferencia_solicitar_remessa(p_origem uuid, p_destino uuid, p_itens jsonb, p_motivo text, p_chave text)
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
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_conteudo text;
  existente public.transferencia_remessas;
  v_remessa public.transferencia_remessas;
  linha record;
  ids uuid[] := '{}';
  nova uuid;
  v_reservar uuid;
begin
  if unidade is null or unidade not in (p_origem, p_destino) or not (select public.tem_permissao('estoque.consultar', unidade)) then
    raise exception 'Peça a remessa estando na loja de origem ou de destino' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 30 then
    raise exception 'A remessa leva de 1 a 30 produtos' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) e
             where jsonb_typeof(e) <> 'object'
                or coalesce(e ->> 'variante', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or coalesce(e ->> 'quantidade', '') !~ '^[0-9]{1,4}$') then
    raise exception 'Produto ou quantidade inválidos na remessa' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'variante') from jsonb_array_elements(p_itens) e) <> jsonb_array_length(p_itens) then
    raise exception 'Cada produto entra uma vez na remessa: junte as quantidades' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  v_conteudo := md5(concat_ws('|', p_origem, p_destino, v_motivo, (
    select string_agg((e ->> 'variante') || ':' || ((e ->> 'quantidade')::int), ',' order by e ->> 'variante')
    from jsonb_array_elements(p_itens) e)));
  perform pg_advisory_xact_lock(privado.trava_da_chave('transferencia_remessas', organizacao, p_chave));
  select * into existente from public.transferencia_remessas r where r.organizacao_id = organizacao and r.chave = p_chave;
  if found then
    if existente.conteudo <> v_conteudo or existente.solicitado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('remessa', existente.id, 'numero', existente.numero, 'repetida', true,
      'transferencias', (select coalesce(jsonb_agg(t.id order by t.numero), '[]'::jsonb) from public.transferencias t where t.remessa_id = existente.id));
  end if;
  if p_origem is null or p_destino is null or p_origem = p_destino or (
       select count(*) from public.unidades u
       where u.id in (p_origem, p_destino) and u.organizacao_id = organizacao and u.status = 'ativa') <> 2 then
    raise exception 'Escolha duas lojas ativas e diferentes desta rede' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) e
             where (e ->> 'quantidade')::int not between 1 and 9999
                or not exists (select 1 from public.variantes v join public.produtos p on p.id = v.produto_id
                               where v.id = (e ->> 'variante')::uuid and v.organizacao_id = organizacao
                                 and p.tipo in ('aparelho', 'chip', 'acessorio'))) then
    raise exception 'Produto sem estoque para transferir ou quantidade inválida na remessa' using errcode = '22023';
  end if;
  if length(v_motivo) not between 3 and 500 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  insert into public.transferencia_remessas (organizacao_id, origem_id, destino_id, motivo, chave, conteudo, solicitado_por)
  values (organizacao, p_origem, p_destino, v_motivo, p_chave, v_conteudo, usuario)
  returning * into v_remessa;
  for linha in
    select (x.e ->> 'variante')::uuid as variante, (x.e ->> 'quantidade')::int as quantidade, x.ordem
    from jsonb_array_elements(p_itens) with ordinality as x (e, ordem) order by x.ordem
  loop
    insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, solicitado_por, remessa_id)
    values (organizacao, p_origem, p_destino, linha.variante, linha.quantidade, v_motivo, p_chave || ':' || linha.ordem,
            md5(concat_ws('|', p_origem, p_destino, linha.variante, linha.quantidade, v_motivo)), usuario, v_remessa.id)
    returning id into nova;
    ids := ids || nova;
  end loop;
  -- TRF-c: cada produto reserva na origem, tudo ou nada, na ordem das variações (a mesma em todo pedido, para dois
  -- pedidos ao mesmo tempo não travarem um ao outro).
  for v_reservar in select x.id from public.transferencias x where x.remessa_id = v_remessa.id order by x.variante_id loop
    perform privado.transferencia_reservar(v_reservar, usuario);
  end loop;
  return jsonb_build_object('remessa', v_remessa.id, 'numero', v_remessa.numero, 'repetida', false, 'transferencias', to_jsonb(ids));
end;
$$;
revoke all on function public.transferencia_solicitar_remessa(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.transferencia_solicitar_remessa(uuid, uuid, jsonb, text, text) to authenticated;
