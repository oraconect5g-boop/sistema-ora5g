-- =============================================================================
-- Integridade, parte c (lote INTEG-c; revisão do Codex de 16/11/2026, commit e311060 da PR #100):
--   #101 (P1): a identidade do destinatário da nota passa a ser comprovada, e o envio pelo WhatsApp exige essa prova;
--   #102 (P2): a cota de 20 reservas do site por loja e por hora deixa de ser furada por duas reservas ao mesmo tempo.
-- (ORA-FISC-001, ORA-POS-008 e ORA-CRM-002, como no INTEG-a; ORA-ONLINE-006.)
--
-- #101. A migration 20261116095825_destinatario_fiscal_integro (INTEG-a) preencheu notas_pedidos.cliente_id dos pedidos
-- antigos com o cliente do destinatário guardado ou, sem ele, com o cliente DE HOJE da venda. A nota emitida antes
-- dela já não tinha o destinatário guardado (ele sai na emissão): se a venda tinha trocado de cliente depois do pedido,
-- a nota de Alfa ficava ligada a Beta, e o envio pelo WhatsApp ia para Beta (reproduzido pelo Codex com PGlite).
--   1) notas_pedidos.cliente_origem (nova): de onde vem a identidade do cliente da nota. "pedido" (gravado no pedido,
--      e na correção antes da emissão), "destinatario_guardado" (conferido agora no destinatário guardado) ou
--      "conferencia" (a gerência conferiu o documento da nota e confirmou; com quem e quando). Nulo: sem prova.
--   2) Os pedidos que já existem: com o destinatário guardado, o cliente dele e a origem "destinatario_guardado"; sem
--      ele, o cliente fica como está e a origem fica nula (sem prova). No ora5g-dev, em 17/11, não há nota nem envio.
--   3) privado.notas_pedidos_origem_do_cliente (gatilho): todo pedido novo, ou mudança do cliente da nota, grava a
--      origem: "pedido", ou "conferencia" quando quem muda é a conferência.
--   4) public.nota_enviar_whatsapp: a do INTEG-a, recusando com OR037 a nota sem identidade comprovada.
--   5) public.whatsapp_worker_reivindicar: a do INTEG-a, conferindo a identidade comprovada também na fila que já
--      existe: o envio sem prova falha com o motivo e nada sai.
--   6) public.nota_confirmar_destinatario(pedido, motivo), nova: a gerência (nota.aprovar) confere o PDF da nota e
--      confirma que o destinatário é o cliente de hoje da venda; vai para a auditoria com o motivo. Se a nota é de
--      outra pessoa, não se confirma: ela não vai pelo WhatsApp.
--
-- #102. public.loja_reservar contava as reservas da última hora da loja sem uma trava que valesse para a loja inteira
-- (as travas da chave e do WhatsApp não seguram pessoas diferentes): com 19 reservas, duas ao mesmo tempo viam 19 e
-- terminavam com 21 (reproduzido pelo Codex no PostgreSQL 17). Agora a conta vem depois de uma trava por loja.
--   7) public.loja_reservar: a do ONLINE-c (20261117071458), com a trava da loja antes da conta; nada mais muda.
--
-- As três definições copiadas foram conferidas no ora5g-dev antes (md5 do corpo igual ao das últimas migrations).
-- Reversão: supabase/reversao/<mesmo nome>.sql (as três definições anteriores; tira a função nova, o gatilho e as
-- colunas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- #101: de onde vem a identidade do cliente da nota
-- -----------------------------------------------------------------------------
alter table public.notas_pedidos
  add column cliente_origem text check (cliente_origem in ('pedido', 'destinatario_guardado', 'conferencia')),
  add column cliente_conferido_por uuid references public.perfis_usuario (id),
  add column cliente_conferido_em timestamptz,
  add constraint cliente_origem_coerente check (
    (cliente_origem is null or cliente_id is not null)
    and (cliente_origem is distinct from 'conferencia' or cliente_conferido_por is not null)
    and ((cliente_conferido_por is null) = (cliente_conferido_em is null))
  );
create index notas_pedidos_cliente_conferido_por on public.notas_pedidos (cliente_conferido_por);
comment on column public.notas_pedidos.cliente_origem is
  'De onde vem a identidade do cliente da nota (#101, INTEG-c): pedido, destinatario_guardado ou conferencia; nulo = sem prova, e a nota não vai pelo WhatsApp.';

-- Os pedidos que já existem: o destinatário guardado é a prova; sem ele, nada é deduzido da venda de hoje.
update public.notas_pedidos p
set cliente_id = d.cliente_id,
    cliente_origem = case when d.cliente_id is not null then 'destinatario_guardado' end
from privado.notas_destinatarios d
where d.pedido_id = p.id;

create or replace function privado.notas_pedidos_origem_do_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id then
    new.cliente_origem := case when new.cliente_id is null then null
      else coalesce(nullif(current_setting('ora.origem_do_cliente', true), ''), 'pedido') end;
    if new.cliente_origem is distinct from 'conferencia' then
      new.cliente_conferido_por := null;
      new.cliente_conferido_em := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function privado.notas_pedidos_origem_do_cliente() from public, anon;
create trigger notas_pedidos_origem_do_cliente before insert or update of cliente_id on public.notas_pedidos
  for each row execute function privado.notas_pedidos_origem_do_cliente();

-- -----------------------------------------------------------------------------
-- #101: o envio pelo WhatsApp só com a identidade comprovada (a do INTEG-a, com a conferência nova)
-- -----------------------------------------------------------------------------
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
  -- #101 (INTEG-c): só com a identidade do destinatário comprovada: no pedido, pelo destinatário guardado ou pela
  -- conferência da gerência. A nota antiga, emitida sem essa prova, não é atribuída ao cliente de hoje da venda.
  if pedido.cliente_origem is null then
    raise exception 'A identidade do destinatário desta nota não está comprovada: a gerência confere o documento da nota e confirma o cliente antes do envio' using errcode = 'OR037';
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

-- -----------------------------------------------------------------------------
-- #101: o worker confere a identidade comprovada também na fila que já existe (a do INTEG-a, com a conferência nova)
-- -----------------------------------------------------------------------------
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
    -- #101 (INTEG-c): a fila de antes da correção também confere a identidade comprovada do destinatário.
    if not exists (select 1 from public.notas_pedidos p where p.id = envio.pedido_id and p.cliente_origem is not null) then
      update public.whatsapp_envios e
      set situacao = 'falhou', erro = 'A identidade do destinatário desta nota não está comprovada: nada foi enviado; a gerência confere a nota e pede de novo', atualizado_em = now()
      where e.id = envio.id;
      perform privado.whatsapp_evento(envio, 'falhou', 'Conferido antes do envio: a identidade do destinatário não está comprovada; nada foi enviado', 'worker');
      continue;
    end if;
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

-- -----------------------------------------------------------------------------
-- #101: a conferência da gerência. Confirma que o destinatário da nota emitida é o cliente de hoje da venda, depois de
-- conferir o documento da nota (o PDF). Só a nota sem identidade comprovada; o motivo vai para a auditoria.
-- -----------------------------------------------------------------------------
create or replace function public.nota_confirmar_destinatario(p_pedido uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  pedido public.notas_pedidos;
  venda public.vendas;
  v_motivo text := nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), '');
begin
  select * into pedido from public.notas_pedidos p where p.id = p_pedido for update;
  if not found or pedido.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.aprovar', pedido.unidade_id)) then
    raise exception 'Nota não encontrada nesta loja' using errcode = '42501';
  end if;
  if pedido.tipo <> 'venda' or pedido.situacao <> 'emitida' then
    raise exception 'A conferência do destinatário é da nota de venda emitida' using errcode = '22023';
  end if;
  if pedido.cliente_origem is not null then
    raise exception 'A identidade do destinatário desta nota já está comprovada' using errcode = '22023';
  end if;
  if v_motivo is null or length(v_motivo) not between 10 and 200 then
    raise exception 'Informe como o destinatário foi conferido (de 10 a 200 letras): fica na auditoria' using errcode = '22023';
  end if;
  select * into venda from public.vendas v where v.id = pedido.venda_id;
  if venda.cliente_id is null or not exists (
    select 1 from public.clientes c where c.id = venda.cliente_id and c.organizacao_id = pedido.organizacao_id and c.situacao = 'ativo'
  ) then
    raise exception 'A venda não tem um cliente ativo do cadastro para confirmar' using errcode = '22023';
  end if;
  perform set_config('ora.origem_do_cliente', 'conferencia', true);
  update public.notas_pedidos p
  set cliente_id = venda.cliente_id, cliente_origem = 'conferencia', cliente_conferido_por = usuario,
      cliente_conferido_em = now(), atualizado_em = now()
  where p.id = pedido.id;
  perform set_config('ora.origem_do_cliente', '', true);
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, antes, depois, motivo, origem)
  values (usuario, pedido.unidade_id, pedido.organizacao_id, 'notas_pedidos.destinatario_conferido', 'notas_pedidos', pedido.id::text,
          jsonb_build_object('cliente_id', pedido.cliente_id, 'cliente_origem', pedido.cliente_origem),
          jsonb_build_object('cliente_id', venda.cliente_id, 'cliente_origem', 'conferencia'), v_motivo, 'aplicacao');
  return true;
end;
$$;
revoke all on function public.nota_confirmar_destinatario(uuid, text) from public, anon;
grant execute on function public.nota_confirmar_destinatario(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- #102: a cota de reservas do site por loja, com a trava da loja (a do ONLINE-c, com a trava nova)
-- -----------------------------------------------------------------------------
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
    nome, whatsapp_mascarado, preco_centavos, expira_em, chave)
  values (p_organizacao, p_unidade, p_variante, v_item, v_estoque, v_codigo,
    v_nome, privado.mascara_telefone(v_whatsapp), v_preco, now() + interval '24 hours', v_chave)
  returning * into v_reserva;
  insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  return privado.reserva_do_site_em_json(v_reserva);
end;
$$;
