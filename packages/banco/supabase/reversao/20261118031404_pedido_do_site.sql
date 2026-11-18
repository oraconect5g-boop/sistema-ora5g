-- Reversão de 20261118031404_pedido_do_site: devolve public.loja_reservar, public.loja_reserva_atender e public.loja_reserva_cancelar como
-- estavam (as definições de 20261117174218 e de 20261116093359, sem mudança) e tira o pedido do site. As reservas que
-- eram de um pedido ficam como reservas avulsas (a coluna pedido_id some). Antes de desfazer, volte a plataforma para
-- a versão anterior ao lote ONLINE-d: a loja online e as reservas do site leem o pedido.
create or replace function public.loja_reservar(
  p_organizacao uuid, p_variante uuid, p_unidade uuid, p_nome text, p_whatsapp text, p_chave text, p_origem jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_chave text := trim(coalesce(p_chave, ''));
  -- MKT-a: de onde o visitante chegou. O banco limpa o que vem do site; o que não serve fica vazio, sem recusar a reserva.
  v_origem text := case when jsonb_typeof(p_origem -> 'origem') = 'string' and p_origem ->> 'origem' in
    ('direto', 'google', 'instagram', 'facebook', 'whatsapp', 'tiktok', 'youtube', 'email', 'outro_site', 'outra_campanha')
    then p_origem ->> 'origem' end;
  v_referencia text := case when jsonb_typeof(p_origem -> 'referencia') = 'string'
    and lower(p_origem ->> 'referencia') ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$' then lower(p_origem ->> 'referencia') end;
  v_tipo text;
  v_preco bigint;
  v_existente public.loja_reservas;
  v_item uuid;
  v_estoque uuid;
  v_codigo text;
  v_reserva public.loja_reservas;
begin
  if length(v_whatsapp) = 13 and left(v_whatsapp, 2) = '55' then
    v_whatsapp := substr(v_whatsapp, 3);
  end if;
  select p.tipo into v_tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.ativa and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo
    and p.tipo in ('aparelho', 'acessorio');
  if v_tipo is null then
    raise exception 'Produto não encontrado na loja online' using errcode = 'OR036';
  end if;
  if not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao
                   and u.tipo = 'loja_fisica' and u.status = 'ativa') then
    raise exception 'Loja não encontrada' using errcode = 'OR036';
  end if;
  v_preco := privado.preco_do_balcao(p_variante, p_unidade);
  if v_preco is null then
    raise exception 'Este produto não está à venda nesta loja' using errcode = 'OR036';
  end if;
  if length(v_nome) not between 2 and 80 then
    raise exception 'Informe o seu nome (de 2 a 80 letras)' using errcode = '22023';
  end if;
  if v_whatsapp !~ '^[1-9]{2}9[0-9]{8}$' then
    raise exception 'Informe um WhatsApp de celular com DDD (11 números)' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 80 then
    raise exception 'Chave da reserva inválida' using errcode = '22023';
  end if;

  -- (0) A mesma chave devolve a mesma reserva; com outros dados, é recusada.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas', p_organizacao, v_chave));
  select * into v_existente from public.loja_reservas r where r.organizacao_id = p_organizacao and r.chave = v_chave;
  if found then
    if v_existente.variante_id <> p_variante or v_existente.unidade_id <> p_unidade or v_existente.nome <> v_nome
       or (select c.whatsapp from privado.loja_reservas_contato c where c.reserva_id = v_existente.id) is distinct from v_whatsapp then
      raise exception 'Esta reserva já foi feita com outros dados' using errcode = 'OR004';
    end if;
    return privado.reserva_do_site_em_json(v_existente);
  end if;

  -- (1) Os limites contra abuso: por WhatsApp (uma trava por número) e por loja.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_whatsapp', p_organizacao, v_whatsapp));
  if (select count(*) from public.loja_reservas r join privado.loja_reservas_contato c on c.reserva_id = r.id
      where r.organizacao_id = p_organizacao and c.whatsapp = v_whatsapp and r.situacao = 'ativa' and r.expira_em > now()) >= 2 then
    raise exception 'Este WhatsApp já tem 2 reservas ativas: retire uma delas na loja ou espere vencer' using errcode = 'OR034';
  end if;
  -- #102 (INTEG-c): a cota da loja com uma trava por loja. Duas reservas ao mesmo tempo, com outros WhatsApp e outras
  -- chaves, contam uma depois da outra: a segunda espera a primeira terminar e vê a conta já com ela. A trava vem
  -- antes de qualquer trava de aparelho ou de saldo, sempre na mesma ordem.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_loja', p_organizacao, p_unidade::text));
  if (select count(*) from public.loja_reservas r where r.unidade_id = p_unidade and r.criada_em > now() - interval '1 hour') >= 20 then
    raise exception 'Muitas reservas nesta loja agora: tente de novo daqui a pouco' using errcode = 'OR035';
  end if;

  -- (2) O estoque: as reservas vencidas desta loja e deste produto saem antes; depois, uma unidade fica segura.
  perform privado.expirar_reservas(p_unidade, p_variante);
  if v_tipo = 'aparelho' then
    select i.id into v_item from public.itens_serializados i
    where i.unidade_id = p_unidade and i.variante_id = p_variante and i.situacao = 'disponivel' and i.em_estoque
    order by i.criado_em, i.id
    limit 1
    for update skip locked;
    if v_item is null then
      raise exception 'Sem estoque nesta loja agora' using errcode = 'OR001';
    end if;
    update public.itens_serializados set situacao = 'reservado' where id = v_item;
  end if;
  update public.estoque_saldos s
  set reservado = s.reservado + 1, atualizado_em = now()
  where s.unidade_id = p_unidade and s.variante_id = p_variante and s.quantidade - s.reservado >= 1;
  if not found then
    raise exception 'Sem estoque nesta loja agora' using errcode = 'OR001';
  end if;
  insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade,
    origem, chave_idempotencia, expira_em, criado_por)
  values (p_organizacao, p_unidade, p_variante, v_item, 1, 'online', 'site:' || v_chave, now() + interval '24 hours', null)
  returning id into v_estoque;

  -- (3) A reserva do site, com um código que não se repete na empresa.
  loop
    v_codigo := privado.codigo_de_reserva();
    exit when not exists (select 1 from public.loja_reservas r where r.organizacao_id = p_organizacao and r.codigo = v_codigo);
  end loop;
  insert into public.loja_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, estoque_reserva_id, codigo,
    nome, whatsapp_mascarado, preco_centavos, expira_em, chave,
    origem, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referencia)
  values (p_organizacao, p_unidade, p_variante, v_item, v_estoque, v_codigo,
    v_nome, privado.mascara_telefone(v_whatsapp), v_preco, now() + interval '24 hours', v_chave,
    v_origem, privado.campo_de_campanha(p_origem, 'utm_source'), privado.campo_de_campanha(p_origem, 'utm_medium'),
    privado.campo_de_campanha(p_origem, 'utm_campaign'), privado.campo_de_campanha(p_origem, 'utm_content'),
    privado.campo_de_campanha(p_origem, 'utm_term'), v_referencia)
  returning * into v_reserva;
  insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  return privado.reserva_do_site_em_json(v_reserva);
end;
$$;

revoke all on function public.loja_reservar(uuid, uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.loja_reservar(uuid, uuid, uuid, text, text, text, jsonb) to anon, authenticated;

create or replace function public.loja_reserva_atender(p_reserva uuid, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserva public.loja_reservas := privado.reserva_do_site_para_a_loja(p_reserva);
  v_chave text := trim(coalesce(p_chave, ''));
  v_venda uuid;
begin
  if v_reserva.situacao = 'atendida' then
    return jsonb_build_object('venda', v_reserva.venda_id, 'preco_reservado_centavos', v_reserva.preco_centavos,
      'preco_atual_centavos', privado.preco_do_balcao(v_reserva.variante_id, v_reserva.unidade_id), 'repetida', true);
  end if;
  if v_reserva.situacao = 'cancelada' then
    raise exception 'Esta reserva foi cancelada' using errcode = '22023';
  end if;
  if v_reserva.expira_em <= now() then
    raise exception 'Esta reserva venceu: venda pelo PDV, se ainda houver estoque' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 80 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  -- A unidade sai da reserva do site e entra na venda na mesma transação: ninguém a pega no meio.
  if not privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada') then
    raise exception 'A reserva de estoque desta reserva não está mais ativa' using errcode = '22023';
  end if;
  v_venda := public.criar_venda(v_chave || ':venda');
  perform public.adicionar_item(v_venda, v_reserva.variante_id, v_reserva.item_serializado_id, 1, v_chave || ':item');
  update public.loja_reservas r
  set situacao = 'atendida', atendida_em = now(), atendida_por = (select auth.uid()), venda_id = v_venda
  where r.id = v_reserva.id;
  return jsonb_build_object('venda', v_venda, 'preco_reservado_centavos', v_reserva.preco_centavos,
    'preco_atual_centavos', privado.preco_do_balcao(v_reserva.variante_id, v_reserva.unidade_id), 'repetida', false);
end;
$$;

create or replace function public.loja_reserva_cancelar(p_reserva uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reserva public.loja_reservas := privado.reserva_do_site_para_a_loja(p_reserva);
  v_motivo text := privado.exigir_motivo(p_motivo);
begin
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  if v_reserva.situacao = 'cancelada' then
    return false;
  end if;
  if v_reserva.situacao = 'atendida' then
    raise exception 'Esta reserva já foi atendida: a venda segue no PDV' using errcode = '22023';
  end if;
  perform privado.encerrar_reserva(v_reserva.estoque_reserva_id, 'liberada');
  update public.loja_reservas r
  set situacao = 'cancelada', cancelada_em = now(), cancelada_por = (select auth.uid()), motivo_cancelamento = v_motivo
  where r.id = v_reserva.id;
  return true;
end;
$$;

drop function if exists public.loja_pedido_cancelar(uuid, text);
drop function if exists public.loja_pedido_atender(uuid, text);
drop function if exists public.loja_pedido_consultar(uuid, text, text);
drop function if exists public.loja_pedir(uuid, uuid, jsonb, text, text, text, jsonb);
drop function if exists privado.pedido_do_site_para_a_loja(uuid);
drop function if exists privado.pedido_do_site_em_json(public.loja_pedidos);
drop function if exists privado.codigo_do_site(uuid);
drop function if exists privado.reservar_unidade_do_site(uuid, uuid, uuid, text, text, timestamptz);
drop function if exists privado.compromissos_do_whatsapp(uuid, text);
alter table public.loja_reservas drop column if exists pedido_id;
drop table if exists privado.loja_pedidos_contato;
drop table if exists public.loja_pedidos;
