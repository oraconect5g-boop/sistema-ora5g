-- =============================================================================
-- Envio da nota ao cliente pelo WhatsApp oficial: fila, estados e idempotência (lote K1c; issue #76, decisão do
-- proprietário de 12/11/2026)
--
-- A loja pede o envio da nota emitida (com o PDF guardado, L10a) ao WhatsApp do cliente ligado à venda; quem envia
-- de fato é o worker, pela integração oficial (WhatsApp Business Platform da Meta), com as credenciais só nele. O
-- clique não é envio: os estados vêm das evidências do provedor.
--   * public.whatsapp_envios: um pedido de envio por linha, com o número de destino mascarado (o número inteiro fica
--     em privado.whatsapp_destinos, só para o worker), a nota, o documento (PDF) e o cliente; estados: na_fila →
--     enviando → aceito (a Meta devolveu o id da mensagem) → entregue → lido; ou falhou; ou desconhecido (o envio
--     não terminou e a Meta pode ter recebido: confere-se antes de reenviar). Cada mudança fica em
--     public.whatsapp_envio_eventos (só inserção).
--   * public.nota_enviar_whatsapp: pede o envio (quem pede a nota da venda: o vendedor da venda ou quem aprova a nota
--     na loja). Só nota emitida, com o PDF guardado, cliente ativo com WhatsApp. A mesma chave devolve o mesmo
--     pedido; com um envio na fila ou em andamento, devolve esse (duplo clique e repetição não duplicam); com um
--     desconhecido, recusa até a conferência; depois de um envio terminado, reenviar pede motivo. A finalidade é o
--     documento fiscal: não depende de aceite de ofertas.
--   * public.whatsapp_worker_reivindicar / whatsapp_worker_resultado / whatsapp_aviso_de_status (só service_role):
--     o worker pega a fila (envio parado há mais de 5 minutos vira desconhecido), registra a resposta da Meta (ou
--     devolve à fila o que nem saiu) e os avisos de entrega e leitura, uma vez cada, sem voltar estado (aviso repetido
--     ou fora de ordem não muda nada).
-- Sem a integração habilitada (credenciais e modelo aprovado), nada sai da fila: a tela diz isso.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.whatsapp_envios (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  pedido_id uuid not null references public.notas_pedidos (id),
  documento_id uuid not null references public.notas_documentos (id),
  venda_id uuid not null references public.vendas (id),
  cliente_id uuid not null references public.clientes (id),
  destino_mascarado text not null,
  finalidade text not null default 'documento_fiscal' check (finalidade in ('documento_fiscal')),
  situacao text not null default 'na_fila' check (situacao in ('na_fila', 'enviando', 'aceito', 'entregue', 'lido', 'falhou', 'desconhecido')),
  tentativas int not null default 0 check (tentativas >= 0),
  enviando_desde timestamptz,
  provedor_id text unique check (provedor_id is null or length(provedor_id) between 4 and 200),
  erro text check (erro is null or length(erro) <= 300),
  motivo text check (motivo is null or length(trim(motivo)) between 3 and 200),
  chave text not null check (length(trim(chave)) between 8 and 80),
  pedido_por uuid not null references public.perfis_usuario (id),
  pedido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint aceito_tem_id check (situacao not in ('aceito', 'entregue', 'lido') or provedor_id is not null)
);
create index whatsapp_envios_pedido on public.whatsapp_envios (pedido_id, pedido_em);
create index whatsapp_envios_documento on public.whatsapp_envios (documento_id);
create index whatsapp_envios_venda on public.whatsapp_envios (venda_id);
create index whatsapp_envios_cliente on public.whatsapp_envios (cliente_id);
create index whatsapp_envios_pedido_por on public.whatsapp_envios (pedido_por);
create index whatsapp_envios_unidade on public.whatsapp_envios (unidade_id, organizacao_id);
create index whatsapp_envios_fila on public.whatsapp_envios (pedido_em, id) where situacao in ('na_fila', 'enviando');
create trigger whatsapp_envios_auditar after insert or update on public.whatsapp_envios
  for each row execute function privado.auditar_mudanca();

create table privado.whatsapp_destinos (
  envio_id uuid primary key references public.whatsapp_envios (id),
  telefone text not null check (telefone ~ '^[0-9]{10,11}$')
);
revoke all on privado.whatsapp_destinos from public, anon, authenticated;

create table public.whatsapp_envio_eventos (
  id bigint generated always as identity primary key,
  organizacao_id uuid not null,
  envio_id uuid not null references public.whatsapp_envios (id),
  situacao text not null,
  detalhe text check (detalhe is null or length(detalhe) <= 300),
  origem text not null check (origem in ('pedido', 'worker', 'aviso')),
  usuario_id uuid references public.perfis_usuario (id),
  ocorrido_em timestamptz not null default now()
);
create index whatsapp_envio_eventos_envio on public.whatsapp_envio_eventos (envio_id, id);
create index whatsapp_envio_eventos_usuario on public.whatsapp_envio_eventos (usuario_id);
create trigger whatsapp_envio_eventos_sem_alteracao before update or delete on public.whatsapp_envio_eventos
  for each row execute function privado.so_insercao();
create trigger whatsapp_envio_eventos_sem_truncate before truncate on public.whatsapp_envio_eventos
  for each statement execute function privado.so_insercao();

alter table public.whatsapp_envios enable row level security;
alter table public.whatsapp_envio_eventos enable row level security;
alter table privado.whatsapp_destinos enable row level security;
revoke all on public.whatsapp_envios, public.whatsapp_envio_eventos from anon, authenticated;
revoke all on sequence public.whatsapp_envios_numero_seq, public.whatsapp_envio_eventos_id_seq from anon, authenticated;
grant select on public.whatsapp_envios, public.whatsapp_envio_eventos to authenticated;
-- Quem lê a nota (quem pediu, quem vê a venda, quem aprova) acompanha o envio dela.
create policy whatsapp_envios_ler on public.whatsapp_envios for select to authenticated
  using (pedido_id in (select p.id from public.notas_pedidos p));
create policy whatsapp_envio_eventos_ler on public.whatsapp_envio_eventos for select to authenticated
  using (envio_id in (select e.id from public.whatsapp_envios e));

create or replace function privado.whatsapp_evento(p_envio public.whatsapp_envios, p_situacao text, p_detalhe text, p_origem text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.whatsapp_envio_eventos (organizacao_id, envio_id, situacao, detalhe, origem, usuario_id)
  values (p_envio.organizacao_id, p_envio.id, p_situacao, left(p_detalhe, 300), p_origem, (select auth.uid()));
$$;
revoke all on function privado.whatsapp_evento(public.whatsapp_envios, text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Pedir o envio (tela)
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
  if venda.cliente_id is null then
    raise exception 'Ligue a venda ao cliente da rede antes de enviar a nota pelo WhatsApp' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from public.clientes c join privado.cliente_dados d on d.cliente_id = c.id
  where c.id = venda.cliente_id and c.situacao = 'ativo';
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
  values (pedido.organizacao_id, pedido.unidade_id, pedido.id, v_documento, venda.id, venda.cliente_id, privado.mascara_telefone(v_telefone),
          case when existente.id is not null then v_motivo end, trim(p_chave), usuario)
  returning * into novo;
  insert into privado.whatsapp_destinos (envio_id, telefone) values (novo.id, v_telefone);
  perform privado.whatsapp_evento(novo, 'na_fila', case when existente.id is not null then 'Reenvio: ' || v_motivo end, 'pedido');
  return novo.id;
end;
$$;
revoke all on function public.nota_enviar_whatsapp(uuid, text, text) from public, anon;
grant execute on function public.nota_enviar_whatsapp(uuid, text, text) to authenticated;

-- Resultado desconhecido conferido pela gerência (quem aprova a nota na loja): sem a evidência do provedor, a única
-- conclusão possível aqui é "não chegou" (com motivo), o que libera o reenvio. Nunca vira "entregue" sem a Meta.
create or replace function public.whatsapp_envio_resolver(p_envio uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  envio public.whatsapp_envios;
begin
  select * into envio from public.whatsapp_envios e where e.id = p_envio for update;
  if not found or envio.unidade_id is distinct from (select public.unidade_atual())
     or not (select public.tem_permissao('nota.aprovar', envio.unidade_id)) then
    raise exception 'Envio não encontrado' using errcode = 'P0002';
  end if;
  if envio.situacao <> 'desconhecido' then
    return false;
  end if;
  perform set_config('ora.motivo', 'Envio pelo WhatsApp conferido: ' || v_motivo, true);
  update public.whatsapp_envios e set situacao = 'falhou', erro = left('Conferido pela loja: ' || v_motivo, 300), atualizado_em = now()
  where e.id = envio.id;
  perform privado.whatsapp_evento(envio, 'falhou', 'Conferido pela loja: ' || v_motivo, 'pedido');
  return true;
end;
$$;
revoke all on function public.whatsapp_envio_resolver(uuid, text) from public, anon;
grant execute on function public.whatsapp_envio_resolver(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Worker (service_role): pegar a fila, registrar a resposta da Meta e os avisos de status
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

create or replace function public.whatsapp_worker_resultado(p_envio uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  envio public.whatsapp_envios;
  v_situacao text := p_resultado ->> 'situacao';
  v_provedor text := nullif(trim(coalesce(p_resultado ->> 'provedor_id', '')), '');
  v_erro text := nullif(left(trim(coalesce(p_resultado ->> 'erro', '')), 300), '');
begin
  select * into envio from public.whatsapp_envios e where e.id = p_envio for update;
  if not found then
    raise exception 'Envio não encontrado' using errcode = 'P0002';
  end if;
  if v_situacao is null or v_situacao not in ('aceito', 'falhou', 'desconhecido', 'na_fila') or (v_situacao = 'aceito' and v_provedor is null) then
    raise exception 'Resultado do envio inválido' using errcode = '22023';
  end if;
  if envio.situacao <> 'enviando' then
    -- Repetição do mesmo resultado não muda nada; resultado diferente para envio que já saiu de "enviando" é recusado.
    if envio.situacao = v_situacao and envio.provedor_id is not distinct from v_provedor then
      return envio.situacao;
    end if;
    raise exception 'Este envio não está mais sendo enviado (%)', envio.situacao using errcode = '22023';
  end if;
  -- "na_fila": nada saiu (sem conexão, sem link do documento): volta para a fila, sem gastar a tentativa como envio.
  update public.whatsapp_envios e
  set situacao = v_situacao, provedor_id = v_provedor, erro = v_erro,
      enviando_desde = null, atualizado_em = now()
  where e.id = envio.id;
  perform privado.whatsapp_evento(envio, v_situacao, v_erro, 'worker');
  return v_situacao;
end;
$$;

create or replace function public.whatsapp_aviso_de_status(p_provedor_id text, p_status text, p_detalhe text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  envio public.whatsapp_envios;
  nova text := case p_status when 'delivered' then 'entregue' when 'read' then 'lido' when 'failed' then 'falhou' when 'sent' then 'aceito' end;
  ordem constant text[] := array['aceito', 'entregue', 'lido'];
begin
  if nova is null then
    raise exception 'Status do aviso desconhecido' using errcode = '22023';
  end if;
  select * into envio from public.whatsapp_envios e where e.provedor_id = p_provedor_id for update;
  if not found then
    return false; -- aviso de mensagem que não é nossa (ou ainda sem id): ignorado
  end if;
  -- Sem voltar estado: aviso repetido ou fora de ordem não muda nada; falha só antes da entrega.
  if envio.situacao = nova
     or (nova = 'aceito')
     or (nova = 'falhou' and envio.situacao in ('entregue', 'lido'))
     or (nova <> 'falhou' and envio.situacao in ('aceito', 'entregue', 'lido') and array_position(ordem, nova) <= array_position(ordem, envio.situacao))
     or envio.situacao = 'falhou' then
    return false;
  end if;
  update public.whatsapp_envios e set situacao = nova, erro = case when nova = 'falhou' then left(p_detalhe, 300) else e.erro end, atualizado_em = now()
  where e.id = envio.id;
  perform privado.whatsapp_evento(envio, nova, case when nova = 'falhou' then left(p_detalhe, 300) end, 'aviso');
  return true;
end;
$$;

revoke all on function public.whatsapp_worker_reivindicar(int), public.whatsapp_worker_resultado(uuid, jsonb),
  public.whatsapp_aviso_de_status(text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_worker_reivindicar(int), public.whatsapp_worker_resultado(uuid, jsonb),
  public.whatsapp_aviso_de_status(text, text, text) to service_role;
