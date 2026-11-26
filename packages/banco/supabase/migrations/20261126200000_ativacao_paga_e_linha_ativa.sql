-- =============================================================================
-- Lote AUD-f (26/11/2026), parte A: as correções da auditoria de e7f55b2 no Ora Connect e na Asaas, autorizadas pelo
-- proprietário como um lote só. NÃO aplicada no banco do servidor: vai para revisão (PR) antes; o número final sai na aplicação.
--
-- A. Item 2 da auditoria (pagamento e ativação): o pagamento confirmado da ativação não é a linha ativa. A consulta pelo uuid
--    (GET /consultaPagamento, ainda desligada: NOGLE_CONSULTA_PAGAMENTO) dizia "Ativação paga e feita" só pela data do
--    pagamento; agora guarda o pagamento (pagamento_confirmado_em) e a linha só se confirma com a prova oficial (o ICCID ativo,
--    com o número ativado). O eSIM sem ICCID (sem como provar a linha) vai para a gerência conferir na Nogle (resultado
--    desconhecido, que o connect_resolver decide), em vez de esperar para sempre. O Pix copia e cola (o código EMV) da
--    resposta oficial do envio fica à parte do link de pagamento (uma página https). O material de instalação do eSIM (o link
--    e o código LPA), quando vier pela consulta do pagamento, é gravado por uma função própria, sem ir para os eventos.
-- =============================================================================

alter table public.connect_operacoes
  add column pagamento_confirmado_em timestamptz,
  add column pix_copia_cola text,
  add column esim_codigo text;
comment on column public.connect_operacoes.pagamento_confirmado_em is
  'AUD-f: quando a Nogle confirmou o pagamento da ativação (pelo uuid). Não é a linha ativa: a ativação só confirma com o ICCID ativo e o número ativado.';
comment on column public.connect_operacoes.pix_copia_cola is
  'AUD-f: o Pix copia e cola (código EMV) da resposta oficial do envio, quando vier. Não é o link de pagamento (uma página https).';
comment on column public.connect_operacoes.esim_codigo is
  'AUD-f: o código de instalação do eSIM (LPA), quando vier pela consulta do pagamento. Instala a linha: nunca vai para eventos nem registros.';

-- O formato do Pix copia e cola: começa com 000201, traz o identificador do Pix e não tem caractere de controle.
create function privado.connect_pix_copia_cola_valido(p_valor text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(length(p_valor) between 20 and 512 and p_valor ~ '^000201' and strpos(upper(p_valor), 'BR.GOV.BCB.PIX') > 0
                  and p_valor !~ '[[:cntrl:]]', false);
$$;
revoke all on function privado.connect_pix_copia_cola_valido(text) from public, anon, authenticated;

alter table public.connect_operacoes
  add constraint connect_operacoes_pix_copia_cola_formato check (pix_copia_cola is null or privado.connect_pix_copia_cola_valido(pix_copia_cola)),
  add constraint connect_operacoes_esim_codigo_formato check (esim_codigo is null
    or (length(esim_codigo) <= 300 and esim_codigo ~ '^LPA:1\$[^[:space:]$]+\$[^[:space:]]+$'));

alter table public.connect_eventos drop constraint connect_eventos_tipo_check;
alter table public.connect_eventos add constraint connect_eventos_tipo_check check (tipo in (
  'registrada', 'envio_iniciado', 'sem_conexao', 'resposta', 'sem_resposta', 'envio_expirado',
  'consulta', 'confirmada', 'negada', 'erro_operadora', 'resolvida', 'cancelada', 'conferencia',
  'pagamento_confirmado', 'material_esim'));

-- O envio: o texto em vigor (20261110124824_connect_consulta_por_uuid, conferido pelo md5 do corpo em 26/11) + o Pix copia e cola.
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
      -- AUD-f: o Pix copia e cola (o código EMV) da resposta oficial do envio, só no formato do Pix; não é o link.
      pix_copia_cola = coalesce(case when privado.connect_pix_copia_cola_valido(p_resultado ->> 'pix_copia_cola')
                                     then p_resultado ->> 'pix_copia_cola' end, o.pix_copia_cola),
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

-- A lista das operações a consultar: + o pagamento confirmado e o eSIM.
drop function public.connect_worker_operacoes_a_consultar(uuid, text[], int);
create function public.connect_worker_operacoes_a_consultar(p_organizacao uuid, p_tipos text[], p_limite int)
returns table (
  operacao_id uuid, tipo text, situacao text, iccid text, linha text, linha_doadora text, id_externo text,
  data_cadastro_externa text, metodo_pagamento text, enviado_em timestamptz, tentativas_consulta int, uuid_externo text,
  pagamento_confirmado_em timestamptz, esim boolean)
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
    pagamento_confirmado_em := op.pagamento_confirmado_em;
    esim := op.esim;
    return next;
  end loop;
end;
$$;
revoke all on function public.connect_worker_operacoes_a_consultar(uuid, text[], int) from public, anon, authenticated;
grant execute on function public.connect_worker_operacoes_a_consultar(uuid, text[], int) to service_role;

-- A evidência: o texto em vigor (o mesmo arquivo, conferido pelo md5) + o pago, que não é a linha ativa.
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
  pago boolean := false;
begin
  if tipo_evidencia is null or tipo_evidencia not in ('confirmada', 'negada', 'em_andamento', 'erro_operadora', 'sem_evidencia',
                                            'consulta_bloqueada', 'falha_consulta', 'ambigua',
                                            'pago', 'pago_sem_prova_da_linha', 'sem_prova_da_linha') then
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
  -- AUD-f (auditoria de e7f55b2): o pagamento confirmado da ATIVAÇÃO não é a linha ativa. "pago" (pelo uuid da própria
  -- operação, com a data do pagamento) guarda o pagamento e segue esperando a prova da linha (o ICCID ativo, com o número);
  -- "pago_sem_prova_da_linha" e "sem_prova_da_linha" (o eSIM sem ICCID) vão para a gerência conferir (resultado desconhecido,
  -- que o connect_resolver decide). Ativação só confirma com o número ativado na prova da linha.
  if tipo_evidencia in ('pago', 'pago_sem_prova_da_linha') then
    if op.tipo <> 'ativacao' or op.uuid_externo is null or p_evidencia #>> '{dados,uuid}' is distinct from op.uuid_externo
       or nullif(p_evidencia #>> '{dados,data_pagamento}', '') is null then
      tipo_evidencia := 'sem_evidencia';
    else
      pago := true;
    end if;
  end if;
  if tipo_evidencia in ('pago_sem_prova_da_linha', 'sem_prova_da_linha') and op.tipo = 'ativacao' and op.situacao = 'aguardando_operadora' then
    novo := 'resultado_desconhecido';
    conferir := case when pago then 'Ativação paga na Nogle, sem ICCID para provar a linha: a gerência confere na Nogle e registra o desfecho'
                     else 'Sem ICCID para o servidor provar a linha: a gerência confere na Nogle e registra o desfecho' end;
  end if;
  if op.tipo = 'ativacao' and novo = 'confirmada' and numero_evidencia is null then
    novo := op.situacao;
  end if;
  -- Recarga: uma evidência do histórico confirma UMA operação (REV-056, #59). A data de cadastro
  -- sozinha não é chave única garantida pela Nogle. Histórico com duas recargas iguais, outra
  -- operação da linha com a mesma data, ou recarga do histórico já usada por outra operação: a
  -- gerência confere (resultado desconhecido → connect_resolver). Sem data de cadastro e de
  -- realização, não confirma.
  -- Consulta pelo uuid da própria operação (GET /consultaPagamento, resposta da Nogle de 10/11/2026):
  -- a evidência é da operação exata. Confirma só com o mesmo uuid e a data do pagamento; uuid de outra
  -- operação ou sem data não confirma.
  if op.situacao = 'aguardando_operadora' and tipo_evidencia = 'confirmada' and op.tipo = 'recarga'
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
                                 then null when pago and novo = 'aguardando_operadora' then now() + interval '1 minute' else now() + espera end,
      pagamento_confirmado_em = case when pago then coalesce(o.pagamento_confirmado_em, now()) else o.pagamento_confirmado_em end,
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
  perform privado.connect_evento(op, case when conferir is not null then 'conferencia' when novo <> op.situacao then novo
                                      when pago and op.pagamento_confirmado_em is null then 'pagamento_confirmado' else 'consulta' end,
    op.situacao, novo, null, coalesce(conferir, p_evidencia ->> 'mensagem'), p_evidencia - 'mensagem' - 'valor_debitado_centavos');
  return novo;
end;
$$;

-- O material de instalação do eSIM, gravado à parte: só na ativação de eSIM, só o link https e o código LPA, sem trocar o que
-- já veio (o link do envio fica). O evento diz só que chegou: o link e o código instalam a linha e não vão para os eventos.
create function public.connect_worker_registrar_material_esim(p_operacao uuid, p_material jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  op public.connect_operacoes;
  v_link text := nullif(btrim(coalesce(p_material ->> 'link', '')), '');
  v_codigo text := nullif(btrim(coalesce(p_material ->> 'codigo', '')), '');
begin
  select * into op from public.connect_operacoes o where o.id = p_operacao for update;
  if not found then
    raise exception 'Operação não encontrada' using errcode = 'P0002';
  end if;
  if op.tipo <> 'ativacao' or not op.esim then
    return false;
  end if;
  -- O Postgres não aceita repetição acima de 255 na expressão: o tamanho fica no length().
  if v_link is not null and (length(v_link) > 498 or v_link !~ '^https://[^[:space:]]+$') then
    v_link := null;
  end if;
  if v_codigo is not null and (length(v_codigo) > 300 or v_codigo !~ '^LPA:1\$[^[:space:]$]+\$[^[:space:]]+$') then
    v_codigo := null;
  end if;
  if v_link is null and v_codigo is null or (op.link_esim is not null or v_link is null) and (op.esim_codigo is not null or v_codigo is null) then
    return false;
  end if;
  update public.connect_operacoes o
  set link_esim = coalesce(o.link_esim, v_link), esim_codigo = coalesce(o.esim_codigo, v_codigo), atualizado_em = now()
  where o.id = op.id;
  perform privado.connect_evento(op, 'material_esim', op.situacao, op.situacao, null, 'Material de instalação do eSIM recebido da Nogle', null);
  return true;
end;
$$;
revoke all on function public.connect_worker_registrar_material_esim(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_registrar_material_esim(uuid, jsonb) to service_role;
