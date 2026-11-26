-- Reversão de 20261126200000_ativacao_paga_e_linha_ativa (lote AUD-f, parte A): a consulta, a lista das operações a consultar e o
-- envio voltam ao texto anterior, inteiros (20261110124824_connect_consulta_por_uuid); saem o pagamento confirmado, o Pix copia e
-- cola, o material do eSIM e os dois tipos de evento novos. Ela se recusa se o lote já gravou algum deles (a reversão os
-- apagaria, e o evento é a trilha da auditoria): confira e registre antes.
do $$
begin
  if exists (select 1 from public.connect_eventos e where e.tipo in ('pagamento_confirmado', 'material_esim'))
     or exists (select 1 from public.connect_operacoes o
                where o.pagamento_confirmado_em is not null or o.pix_copia_cola is not null or o.esim_codigo is not null) then
    raise exception 'Há pagamento confirmado, Pix copia e cola ou material do eSIM gravados pelo lote AUD-f: a reversão os apagaria';
  end if;
end;
$$;
drop function public.connect_worker_registrar_material_esim(uuid, jsonb);

create or replace function public.connect_worker_registrar_consulta(p_operacao uuid, p_evidencia jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
  tipo_evidencia text := p_evidencia ->> 'evidencia';
  novo text;
  tentativas int;
  espera interval;
  debitado bigint := case when coalesce(p_evidencia ->> 'valor_debitado_centavos', '') ~ '^[0-9]{1,12}$'
                          then (p_evidencia ->> 'valor_debitado_centavos')::bigint end;
  numero_evidencia text := nullif(regexp_replace(coalesce(p_evidencia ->> 'numero', ''), '[^0-9]', '', 'g'), '');
  chave_evidencia text;
  conferir text;
begin
  if tipo_evidencia is null or tipo_evidencia not in ('confirmada', 'negada', 'em_andamento', 'erro_operadora', 'sem_evidencia',
                                            'consulta_bloqueada', 'falha_consulta', 'ambigua') then
    raise exception 'Evidência inválida' using errcode = '22023';
  end if;
  select * into op from public.connect_operacoes o where o.id = p_operacao for update;
  if not found then
    raise exception 'Operação não encontrada' using errcode = 'P0002';
  end if;
  if op.situacao not in ('aguardando_operadora', 'resultado_desconhecido') then
    return op.situacao;
  end if;
  tentativas := op.tentativas_consulta + 1;
  espera := case when tentativas <= 3 then interval '2 minutes' when tentativas <= 6 then interval '10 minutes'
                 when tentativas <= 12 then interval '1 hour' else interval '6 hours' end;
  novo := case when op.situacao = 'aguardando_operadora' and tipo_evidencia in ('confirmada', 'negada', 'erro_operadora')
               then tipo_evidencia else op.situacao end;
  if numero_evidencia is not null and not privado.linha_valida(numero_evidencia) then
    numero_evidencia := null;
  end if;
  -- Recarga: uma evidência do histórico confirma UMA operação (REV-056, #59). A data de cadastro
  -- sozinha não é chave única garantida pela Nogle. Histórico com duas recargas iguais, outra
  -- operação da linha com a mesma data, ou recarga do histórico já usada por outra operação: a
  -- gerência confere (resultado desconhecido → connect_resolver). Sem data de cadastro e de
  -- realização, não confirma.
  -- Consulta pelo uuid da própria operação (GET /consultaPagamento, resposta da Nogle de 10/11/2026):
  -- a evidência é da operação exata. Confirma só com o mesmo uuid e a data do pagamento; uuid de outra
  -- operação ou sem data não confirma.
  if op.situacao = 'aguardando_operadora' and tipo_evidencia = 'confirmada' and op.tipo in ('ativacao', 'recarga')
     and nullif(p_evidencia #>> '{dados,uuid}', '') is not null then
    if p_evidencia #>> '{dados,uuid}' = op.uuid_externo and nullif(p_evidencia #>> '{dados,data_pagamento}', '') is not null then
      chave_evidencia := 'uuid|' || op.uuid_externo;
    else
      novo := op.situacao;
    end if;
  elsif op.tipo = 'recarga' and op.situacao = 'aguardando_operadora' and tipo_evidencia in ('confirmada', 'ambigua') then
    if tipo_evidencia = 'ambigua' then
      conferir := 'Mais de uma recarga com a mesma data de cadastro no histórico da linha';
    elsif nullif(p_evidencia #>> '{dados,data_cadastro}', '') is null or nullif(p_evidencia #>> '{dados,data_recarga}', '') is null then
      novo := op.situacao;
    else
      chave_evidencia := concat_ws('|', 'recarga', op.linha, p_evidencia #>> '{dados,data_cadastro}', p_evidencia #>> '{dados,data_recarga}',
                                   coalesce(p_evidencia #>> '{dados,plano}', ''));
      if exists (select 1 from public.connect_operacoes x
                 where x.organizacao_id = op.organizacao_id and x.id <> op.id and x.tipo = 'recarga' and x.linha = op.linha
                   and x.data_cadastro_externa = op.data_cadastro_externa and x.situacao not in ('recusada', 'cancelada', 'nao_recebida')) then
        conferir := 'Outra operação da mesma linha tem a mesma data de cadastro: a evidência não diz de qual é';
      elsif exists (select 1 from public.connect_operacoes x
                    where x.organizacao_id = op.organizacao_id and x.id <> op.id and x.evidencia_chave = chave_evidencia) then
        conferir := 'Esta recarga do histórico já confirmou outra operação';
      end if;
    end if;
    if conferir is not null then
      chave_evidencia := null;
      -- Uma recarga em curso por linha (índice connect_uma_recarga_em_curso): se outra da linha já
      -- espera a gerência, esta continua aguardando e é consultada de novo depois.
      novo := case when exists (select 1 from public.connect_operacoes x
                                where x.organizacao_id = op.organizacao_id and x.id <> op.id and x.tipo = 'recarga' and x.linha = op.linha
                                  and x.situacao in ('registrada', 'enviando', 'resultado_desconhecido'))
                   then op.situacao else 'resultado_desconhecido' end;
    end if;
  end if;
  update public.connect_operacoes o
  set situacao = novo,
      evidencia = p_evidencia - 'dados' - 'valor_debitado_centavos' || jsonb_build_object('consultado_em', now()),
      numero_ativado = case when novo = 'confirmada' and o.tipo = 'ativacao' then coalesce(numero_evidencia, o.numero_ativado) else o.numero_ativado end,
      tentativas_consulta = tentativas,
      evidencia_chave = case when novo = 'confirmada' and chave_evidencia is not null then chave_evidencia else o.evidencia_chave end,
      proxima_consulta_em = case when novo in ('confirmada', 'negada', 'erro_operadora') or novo = 'resultado_desconhecido' and conferir is not null
                                 then null else now() + espera end,
      concluida_em = case when novo in ('confirmada', 'negada') then now() else o.concluida_em end,
      atualizado_em = now()
  where o.id = op.id;
  -- Débito da carteira é custo (REV-053, #56): só na tabela lida com custo.ver.
  if novo = 'confirmada' and debitado is not null then
    insert into public.connect_operacoes_custos (operacao_id, organizacao_id, unidade_id, valor_debitado_centavos)
    values (op.id, op.organizacao_id, op.unidade_id, debitado)
    on conflict (operacao_id) do update set valor_debitado_centavos = excluded.valor_debitado_centavos, atualizado_em = now();
  end if;
  if novo = 'confirmada' then
    insert into public.connect_producao (organizacao_id, unidade_id, vendedor_id, operacao_id, tipo, valor_face_centavos, origem)
    values (op.organizacao_id, op.unidade_id, op.vendedor_id, op.id, op.tipo, op.valor_face_centavos, 'evidencia_da_operadora')
    on conflict (operacao_id) do nothing;
  end if;
  perform privado.connect_evento(op, case when conferir is not null then 'conferencia' when novo <> op.situacao then novo else 'consulta' end,
    op.situacao, novo, null, coalesce(conferir, p_evidencia ->> 'mensagem'), p_evidencia - 'mensagem' - 'valor_debitado_centavos');
  return novo;
end;
$$;

drop function public.connect_worker_operacoes_a_consultar(uuid, text[], int);
create function public.connect_worker_operacoes_a_consultar(p_organizacao uuid, p_tipos text[], p_limite int)
returns table (
  operacao_id uuid, tipo text, situacao text, iccid text, linha text, linha_doadora text, id_externo text,
  data_cadastro_externa text, metodo_pagamento text, enviado_em timestamptz, tentativas_consulta int, uuid_externo text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
begin
  for op in
    select * from public.connect_operacoes o
    where o.organizacao_id = p_organizacao and o.situacao in ('aguardando_operadora', 'resultado_desconhecido')
      and o.tipo = any (coalesce(p_tipos, '{}')) and o.proxima_consulta_em <= now()
    order by o.proxima_consulta_em, o.id
    limit greatest(1, least(coalesce(p_limite, 10), 50))
    for update skip locked
  loop
    -- Reserva a consulta por 5 minutos (outro worker não pega a mesma).
    update public.connect_operacoes o set proxima_consulta_em = now() + interval '5 minutes' where o.id = op.id;
    operacao_id := op.id;
    tipo := op.tipo;
    situacao := op.situacao;
    iccid := op.iccid;
    linha := op.linha;
    linha_doadora := op.linha_doadora;
    id_externo := op.id_externo;
    data_cadastro_externa := op.data_cadastro_externa;
    metodo_pagamento := op.metodo_pagamento;
    enviado_em := op.enviado_em;
    tentativas_consulta := op.tentativas_consulta;
    uuid_externo := op.uuid_externo;
    return next;
  end loop;
end;
$$;
revoke all on function public.connect_worker_operacoes_a_consultar(uuid, text[], int) from public, anon, authenticated;
grant execute on function public.connect_worker_operacoes_a_consultar(uuid, text[], int) to service_role;

create or replace function public.connect_worker_registrar_envio(p_operacao uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
  resultado text := p_resultado ->> 'resultado';
  novo text;
  iccid_resposta text := nullif(regexp_replace(coalesce(p_resultado ->> 'iccid', ''), '[^0-9]', '', 'g'), '');
  status_http int := case when coalesce(p_resultado ->> 'status_http', '') ~ '^[0-9]{1,3}$' then (p_resultado ->> 'status_http')::int end;
  uuid_resposta text := case when coalesce(p_resultado ->> 'uuid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_resultado ->> 'uuid' end;
begin
  select * into op from public.connect_operacoes o where o.id = p_operacao for update;
  if not found then
    raise exception 'Operação não encontrada' using errcode = 'P0002';
  end if;
  if resultado = 'nao_enviada' then
    if op.situacao <> 'enviando' then
      raise exception 'Operação não está em envio (situação: %)', op.situacao using errcode = '22023';
    end if;
    update public.connect_operacoes o set situacao = 'registrada', enviando_desde = null, atualizado_em = now() where o.id = op.id;
    perform privado.connect_evento(op, 'sem_conexao', 'enviando', 'registrada', null, left(p_resultado ->> 'mensagem', 300));
    return 'registrada';
  end if;
  -- Resposta que chega depois do prazo do envio (já marcado desconhecido) ainda vale como evidência.
  if op.situacao not in ('enviando', 'resultado_desconhecido') or (op.situacao = 'resultado_desconhecido' and op.enviado_em is not null) then
    raise exception 'Operação não está em envio (situação: %)', op.situacao using errcode = '22023';
  end if;
  novo := case resultado when 'aceita' then 'aguardando_operadora' when 'recusada' then 'recusada'
                         when 'desconhecida' then 'resultado_desconhecido' end;
  if novo is null then
    raise exception 'Resultado de envio inválido' using errcode = '22023';
  end if;
  if op.esim and op.iccid is null and iccid_resposta is not null and privado.iccid_valido(iccid_resposta)
     and not exists (select 1 from public.connect_operacoes o where o.organizacao_id = op.organizacao_id and o.tipo = 'ativacao'
                     and o.iccid = iccid_resposta and o.situacao not in ('recusada', 'negada', 'nao_recebida', 'cancelada')) then
    op.iccid := iccid_resposta;
  end if;
  update public.connect_operacoes o
  set situacao = novo,
      enviando_desde = null,
      enviado_em = now(),
      iccid = op.iccid,
      id_externo = coalesce(nullif(left(p_resultado ->> 'id_externo', 60), ''), o.id_externo),
      data_cadastro_externa = coalesce(nullif(left(p_resultado ->> 'data_cadastro', 40), ''), o.data_cadastro_externa),
      link_pagamento = coalesce(nullif(left(p_resultado ->> 'link_pagamento', 500), ''), o.link_pagamento),
      link_esim = coalesce(nullif(left(p_resultado ->> 'link_esim', 500), ''), o.link_esim),
      -- uuid da Nogle (resposta de 10/11/2026): uma operação por uuid; repetido em outra é ignorado.
      uuid_externo = coalesce(o.uuid_externo, case when uuid_resposta is not null and not exists (
        select 1 from public.connect_operacoes x where x.organizacao_id = op.organizacao_id and x.uuid_externo = uuid_resposta and x.id <> op.id)
        then uuid_resposta end),
      mensagem_operadora = nullif(left(p_resultado ->> 'mensagem', 300), ''),
      proxima_consulta_em = case novo when 'aguardando_operadora' then now() + interval '1 minute'
                                      when 'resultado_desconhecido' then now() + interval '2 minutes' end,
      concluida_em = case when novo = 'recusada' then now() end,
      atualizado_em = now()
  where o.id = op.id;
  delete from privado.connect_dados_envio d where d.operacao_id = op.id;
  perform privado.connect_evento(op, case when novo = 'resultado_desconhecido' then 'sem_resposta' else 'resposta' end,
    op.situacao, novo, status_http, p_resultado ->> 'mensagem', p_resultado -> 'dados');
  return novo;
end;
$$;

alter table public.connect_eventos drop constraint connect_eventos_tipo_check;
alter table public.connect_eventos add constraint connect_eventos_tipo_check check (tipo in (
  'registrada', 'envio_iniciado', 'sem_conexao', 'resposta', 'sem_resposta', 'envio_expirado',
  'consulta', 'confirmada', 'negada', 'erro_operadora', 'resolvida', 'cancelada', 'conferencia'));
alter table public.connect_operacoes
  drop constraint connect_operacoes_esim_codigo_formato,
  drop constraint connect_operacoes_pix_copia_cola_formato;
drop function privado.connect_pix_copia_cola_valido(text);
alter table public.connect_operacoes drop column esim_codigo, drop column pix_copia_cola, drop column pagamento_confirmado_em;
