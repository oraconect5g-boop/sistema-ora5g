-- Reversão de 20261117135133_identidade_da_nota_e_cota_da_loja (lote INTEG-c): devolve as três definições anteriores
-- (nota_enviar_whatsapp e whatsapp_worker_reivindicar do INTEG-a; loja_reservar do ONLINE-c), tira a conferência do
-- destinatário, o gatilho da origem e as colunas novas. O cliente que a migration copiou do destinatário guardado fica
-- (é o mesmo que o INTEG-a já tinha copiado). Depois disto, a nota antiga volta a poder ir ao cliente de hoje da venda
-- (#101) e a cota da loja volta a poder passar de 20 (#102).
drop function public.nota_confirmar_destinatario(uuid, text);
drop trigger notas_pedidos_origem_do_cliente on public.notas_pedidos;
drop function privado.notas_pedidos_origem_do_cliente();

create or replace function public.nota_enviar_whatsapp(p_pedido uuid, p_chave text, p_motivo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  pedido public.notas_pedidos;
  venda public.vendas;
  v_documento uuid;
  v_telefone text;
  existente public.whatsapp_envios;
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
  novo public.whatsapp_envios;
begin
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  select * into pedido from public.notas_pedidos p where p.id = p_pedido;
  select * into venda from public.vendas v where v.id = pedido.venda_id for share;
  if pedido.id is null or venda.id is null or venda.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.solicitar', venda.unidade_id))
     or not (venda.vendedor_id = usuario or (select public.tem_permissao('nota.aprovar', venda.unidade_id))) then
    raise exception 'Nota não encontrada' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('whatsapp_envios', pedido.organizacao_id, pedido.id::text));
  select * into existente from public.whatsapp_envios e where e.organizacao_id = pedido.organizacao_id and e.chave = trim(p_chave);
  if found then
    if existente.pedido_id <> pedido.id then
      raise exception 'Chave de idempotência já usada em outro envio' using errcode = 'OR004';
    end if;
    return existente.id;
  end if;
  if pedido.tipo <> 'venda' or pedido.situacao <> 'emitida' then
    raise exception 'Só a nota emitida vai ao cliente pelo WhatsApp' using errcode = '22023';
  end if;
  select d.id into v_documento from public.notas_documentos d where d.pedido_id = pedido.id and d.tipo = 'pdf' and d.substituido_em is null;
  if v_documento is null then
    raise exception 'Guarde o PDF da nota antes de enviar pelo WhatsApp' using errcode = '22023';
  end if;
  -- #88: a nota vai só ao cliente que estava na venda quando ela foi pedida, e só se a venda ainda é dele: trocar o
  -- cliente da venda depois não manda o documento de um cliente para outro.
  if pedido.cliente_id is null then
    raise exception 'A nota foi pedida sem o cliente da rede na venda: o envio pelo WhatsApp vale para a nota pedida com o cliente ligado à venda' using errcode = '22023';
  end if;
  if venda.cliente_id is distinct from pedido.cliente_id then
    raise exception 'O cliente da venda mudou depois do pedido da nota: a nota é de outro cliente; confira a venda e a nota antes de enviar' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from public.clientes c join privado.cliente_dados d on d.cliente_id = c.id
  where c.id = pedido.cliente_id and c.situacao = 'ativo';
  if v_telefone is null then
    raise exception 'O cliente da venda não tem WhatsApp no cadastro: complete o cadastro' using errcode = '22023';
  end if;
  -- O último envio desta nota decide: em andamento devolve ele mesmo; desconhecido espera a conferência; terminado,
  -- reenviar pede motivo (fica no histórico).
  select * into existente from public.whatsapp_envios e where e.pedido_id = pedido.id order by e.pedido_em desc, e.numero desc limit 1;
  if found then
    if existente.situacao in ('na_fila', 'enviando') then
      return existente.id;
    end if;
    if existente.situacao = 'desconhecido' then
      raise exception 'O último envio está com resultado desconhecido: aguarde a conferência com o WhatsApp antes de reenviar' using errcode = '22023';
    end if;
    if v_motivo is null or length(v_motivo) not between 3 and 200 then
      raise exception 'Para reenviar a nota, informe o motivo (de 3 a 200 letras)' using errcode = '22023';
    end if;
  end if;
  perform set_config('ora.motivo', coalesce(v_motivo, 'Envio da nota ao cliente pelo WhatsApp'), true);
  insert into public.whatsapp_envios (organizacao_id, unidade_id, pedido_id, documento_id, venda_id, cliente_id, destino_mascarado, motivo, chave, pedido_por)
  values (pedido.organizacao_id, pedido.unidade_id, pedido.id, v_documento, venda.id, pedido.cliente_id, privado.mascara_telefone(v_telefone),
          case when existente.id is not null then v_motivo end, trim(p_chave), usuario)
  returning * into novo;
  insert into privado.whatsapp_destinos (envio_id, telefone) values (novo.id, v_telefone);
  perform privado.whatsapp_evento(novo, 'na_fila', case when existente.id is not null then 'Reenvio: ' || v_motivo end, 'pedido');
  return novo.id;
end;
$$;
create or replace function public.whatsapp_worker_reivindicar(p_limite int)
returns table (envio_id uuid, organizacao_id uuid, telefone text, documento_caminho text, nota_numero bigint, nota_serie int, chave_acesso text, cliente_nome text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  envio public.whatsapp_envios;
begin
  -- Envio que não terminou (o worker parou entre pegar e registrar): a Meta pode ter recebido.
  for envio in
    select * from public.whatsapp_envios e where e.situacao = 'enviando' and e.enviando_desde < now() - interval '5 minutes'
    for update skip locked
  loop
    update public.whatsapp_envios e set situacao = 'desconhecido', enviando_desde = null, atualizado_em = now() where e.id = envio.id;
    perform privado.whatsapp_evento(envio, 'desconhecido', 'O envio não terminou: conferir com a Meta antes de reenviar', 'worker');
  end loop;
  for envio in
    select * from public.whatsapp_envios e where e.situacao = 'na_fila'
    order by e.pedido_em, e.id
    limit greatest(1, least(coalesce(p_limite, 5), 20))
    for update skip locked
  loop
    -- #88: confere o destinatário de novo antes de expedir: a nota ainda emitida, o mesmo PDF, o cliente do pedido, da
    -- venda e do envio iguais, o cadastro ativo e o mesmo WhatsApp. Se algo mudou, nada sai: o envio falha com o motivo
    -- e a loja confere e pede de novo.
    if not exists (
      select 1
      from public.notas_pedidos p
      join public.vendas v on v.id = p.venda_id
      join public.notas_documentos doc on doc.id = envio.documento_id and doc.substituido_em is null
      join public.clientes c on c.id = envio.cliente_id and c.situacao = 'ativo'
      join privado.cliente_dados dados on dados.cliente_id = c.id
      join privado.whatsapp_destinos w on w.envio_id = envio.id and w.telefone = dados.telefone
      where p.id = envio.pedido_id and p.situacao = 'emitida' and p.cliente_id = envio.cliente_id and v.cliente_id = envio.cliente_id
    ) then
      update public.whatsapp_envios e
      set situacao = 'falhou', erro = 'O destinatário mudou depois do pedido (nota, cliente da venda, cadastro ou WhatsApp): nada foi enviado', atualizado_em = now()
      where e.id = envio.id;
      perform privado.whatsapp_evento(envio, 'falhou', 'Conferido antes do envio: o destinatário não confere mais; nada foi enviado', 'worker');
      continue;
    end if;
    update public.whatsapp_envios e set situacao = 'enviando', enviando_desde = now(), tentativas = e.tentativas + 1, atualizado_em = now()
    where e.id = envio.id;
    perform privado.whatsapp_evento(envio, 'enviando', null, 'worker');
    return query
      select envio.id, envio.organizacao_id, d.telefone, doc.caminho, p.numero_documento, p.serie, p.chave_acesso, c.nome
      from privado.whatsapp_destinos d
      join public.notas_documentos doc on doc.id = envio.documento_id
      join public.notas_pedidos p on p.id = envio.pedido_id
      join public.clientes c on c.id = envio.cliente_id
      where d.envio_id = envio.id;
  end loop;
end;
$$;
create or replace function public.loja_reservar(
  p_organizacao uuid, p_variante uuid, p_unidade uuid, p_nome text, p_whatsapp text, p_chave text
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
    nome, whatsapp_mascarado, preco_centavos, expira_em, chave)
  values (p_organizacao, p_unidade, p_variante, v_item, v_estoque, v_codigo,
    v_nome, privado.mascara_telefone(v_whatsapp), v_preco, now() + interval '24 hours', v_chave)
  returning * into v_reserva;
  insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  return privado.reserva_do_site_em_json(v_reserva);
end;
$$;

drop index public.notas_pedidos_cliente_conferido_por;
alter table public.notas_pedidos
  drop constraint cliente_origem_coerente,
  drop column cliente_conferido_em,
  drop column cliente_conferido_por,
  drop column cliente_origem;
