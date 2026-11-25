-- =============================================================================
-- Lote CONNECT-h (25/11/2026; ORA-CONNECT-007): a consulta completa da Nogle, com os relatórios individuais do número e do
-- cliente. O proprietário pediu em 25/11 "todas as funções da Nogle, consulta completa, relatório individual, número
-- situação" e escolheu os relatórios do número, do cliente (pelo CPF/CNPJ) e do vendedor ou da loja (a D-060); as consultas
-- seguem a D-056 ("só consultas"). A documentação inteira foi lida de novo em 25/11 (a publicada é a mesma cópia de 07/11).
-- Tipos novos de consulta (o resto do caminho é o do CONNECT-g: a tela grava, o worker consulta e grava a resposta limpa):
--   linha_completa    o relatório do número: os detalhes, o saldo, as recargas, as cobranças em aberto, o consumo de internet,
--                     de ligações e de SMS do mês, a portabilidade, a ativação do chip e as transações da linha (o relatório
--                     oficial de transações filtrado pela linha);
--   cliente_completo  o relatório do cliente, pelo CPF ou pelo CNPJ: o cadastro na Nogle e as linhas dele, cada uma com a
--                     situação;
--   linha_cobrancas (GET /linhas/cobrancasGeradas), linha_consumo_voz (GET /linhas/consumo/voz), linha_consumo_sms
--   (GET /linhas/consumo/sms), linha_existe (GET /linhas/verificaExistencia), iccid_plano_pago (GET
--   /ativacao/verificaPlanoPago) e iccid_situacao (POST /ativacao/validaIccid, que só lê).
-- O CPF ou o CNPJ do relatório do cliente é apagado com a resposta, depois de 24 horas (fica a forma mascarada, para a
-- tela). A resposta do relatório pode ter até 100 KB. Funções refeitas a partir do texto em vigor
-- (20261125141320_consultas_da_nogle), só com estas mudanças.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.connect_consultas add column parametro_mascarado text check (parametro_mascarado is null or length(parametro_mascarado) <= 40);
alter table public.connect_consultas drop constraint connect_consultas_tipo_check;
alter table public.connect_consultas add constraint connect_consultas_tipo_check check (tipo in ('linha_detalhes', 'linha_saldo',
  'linha_historico', 'linha_consumo', 'iccid_numero', 'iccid_ativacao', 'carteira_saldo', 'linha_completa', 'cliente_completo',
  'linha_cobrancas', 'linha_consumo_voz', 'linha_consumo_sms', 'linha_existe', 'iccid_plano_pago', 'iccid_situacao'));
alter table public.connect_consultas drop constraint connect_consultas_parametro;
alter table public.connect_consultas add constraint connect_consultas_parametro check (
  (tipo = 'carteira_saldo' and parametro is null) or (tipo <> 'carteira_saldo' and (parametro is not null or resposta_apagada_em is not null)));
alter table public.connect_consultas drop constraint connect_consultas_resposta_check;
alter table public.connect_consultas add constraint connect_consultas_resposta_check check (
  resposta is null or (jsonb_typeof(resposta) = 'object' and octet_length(resposta::text) <= 100000));

create or replace function public.connect_consultar(p_tipo text, p_chave text, p_parametro text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_org uuid;
  v_param text := nullif(regexp_replace(coalesce(p_parametro, ''), '[^0-9]', '', 'g'), '');
  v_existente public.connect_consultas;
  v_id uuid;
begin
  if v_usuario is null or v_unidade is null then
    raise exception 'Entre no sistema e escolha a loja do turno' using errcode = '42501';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = v_unidade;
  if p_tipo is null or p_tipo not in ('linha_detalhes', 'linha_saldo', 'linha_historico', 'linha_consumo', 'iccid_numero',
                                      'iccid_ativacao', 'carteira_saldo', 'linha_completa', 'cliente_completo', 'linha_cobrancas',
                                      'linha_consumo_voz', 'linha_consumo_sms', 'linha_existe', 'iccid_plano_pago', 'iccid_situacao') then
    raise exception 'Consulta desconhecida' using errcode = '22023';
  end if;
  if p_tipo = 'carteira_saldo' then
    if v_org is null or v_org not in (select privado.organizacoes_com_permissao('connect.gerir')) then
      raise exception 'O saldo da carteira é de quem gere a Ora Connect na rede' using errcode = '42501';
    end if;
    if v_param is not null then
      raise exception 'O saldo da carteira não leva linha nem ICCID' using errcode = '22023';
    end if;
  else
    if not (select public.tem_permissao('connect.operar', v_unidade)) then
      raise exception 'Consultar linha e chip é de quem opera a Ora Connect nesta loja' using errcode = '42501';
    end if;
    if p_tipo like 'linha\_%' and not privado.linha_valida(v_param) then
      raise exception 'Linha: 11 dígitos com DDD' using errcode = '22023';
    end if;
    if p_tipo like 'iccid\_%' and (v_param is null or not privado.iccid_valido(v_param)) then
      raise exception 'ICCID inválido: confira os dígitos impressos no chip' using errcode = '22023';
    end if;
    -- CONNECT-h: o relatório do cliente, pelo CPF (11 dígitos) ou pelo CNPJ (14).
    if p_tipo = 'cliente_completo' and not coalesce((length(v_param) = 11 and privado.cpf_valido(v_param))
                                                    or (length(v_param) = 14 and privado.cnpj_valido(v_param)), false) then
      raise exception 'CPF ou CNPJ inválido' using errcode = '22023';
    end if;
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave da consulta inválida' using errcode = '22023';
  end if;

  -- O clique repetido (a mesma chave) devolve a mesma consulta; com outro conteúdo, OR004.
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_consultas', v_org, v_usuario::text || ':' || p_chave));
  select c.* into v_existente from public.connect_consultas c
  where c.organizacao_id = v_org and c.pedida_por = v_usuario and c.chave = p_chave;
  if found then
    if v_existente.tipo <> p_tipo or v_existente.parametro is distinct from v_param then
      raise exception 'Chave de idempotência já usada em outra consulta' using errcode = 'OR004';
    end if;
    return v_existente.id;
  end if;
  -- As consultas não mudam nada, mas a Nogle não é para varredura: até 30 por pessoa por hora.
  if (select count(*) from public.connect_consultas c
      where c.pedida_por = v_usuario and c.pedida_em > now() - interval '1 hour') >= 30 then
    raise exception 'Muitas consultas na última hora: espere um pouco' using errcode = 'OR056';
  end if;
  insert into public.connect_consultas (organizacao_id, unidade_id, pedida_por, chave, tipo, parametro, parametro_mascarado)
  values (v_org, v_unidade, v_usuario, p_chave, p_tipo, v_param,
          case when p_tipo = 'cliente_completo' and length(v_param) = 11
                 then '•••.•••.' || substr(v_param, 7, 3) || '-' || right(v_param, 2)
               when p_tipo = 'cliente_completo' then '••.•••.•••/' || substr(v_param, 9, 4) || '-' || right(v_param, 2) end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.connect_worker_registrar_resposta_da_consulta(p_consulta uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_situacao text := p_resultado ->> 'situacao';
  v_resposta jsonb := p_resultado -> 'resposta';
  v_mensagem text := nullif(left(trim(coalesce(p_resultado ->> 'mensagem', '')), 300), '');
  v_feita text;
begin
  if v_situacao is null or v_situacao not in ('respondida', 'nao_encontrada', 'falhou') then
    raise exception 'Situação da consulta inválida' using errcode = '22023';
  end if;
  if v_resposta is not null and (jsonb_typeof(v_resposta) <> 'object' or octet_length(v_resposta::text) > 100000) then
    raise exception 'Resposta da consulta fora da forma' using errcode = '22023';
  end if;
  update public.connect_consultas c
  set situacao = v_situacao, resposta = case when v_situacao = 'respondida' then v_resposta end, mensagem = v_mensagem,
      respondida_em = now()
  where c.id = p_consulta and c.situacao = 'consultando'
  returning c.situacao into v_feita;
  -- A que já venceu (falhou por tempo) não muda: a pessoa já pediu de novo.
  return coalesce(v_feita, 'ignorada');
end;
$$;

create or replace function public.connect_worker_limpar_consultas(p_organizacao uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vencidas int;
  v_na_fila int;
  v_apagadas int;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  update public.connect_consultas c
  set situacao = 'falhou', mensagem = 'A consulta não terminou: peça de novo.', respondida_em = now()
  where c.organizacao_id = p_organizacao and c.situacao = 'consultando' and c.consultando_desde < now() - interval '2 minutes';
  get diagnostics v_vencidas = row_count;
  update public.connect_consultas c
  set situacao = 'falhou', mensagem = 'O servidor não consultou a tempo: peça de novo.', respondida_em = now()
  where c.organizacao_id = p_organizacao and c.situacao = 'na_fila' and c.pedida_em < now() - interval '10 minutes';
  get diagnostics v_na_fila = row_count;
  -- CONNECT-h: o CPF ou o CNPJ do relatório do cliente também sai depois de 24 horas (fica o mascarado, para a tela).
  update public.connect_consultas c
  set resposta = null, resposta_apagada_em = coalesce(c.resposta_apagada_em, now()),
      parametro = case when c.tipo = 'cliente_completo' then null else c.parametro end
  where c.organizacao_id = p_organizacao and coalesce(c.respondida_em, c.pedida_em) < now() - interval '24 hours'
    and (c.resposta is not null or (c.tipo = 'cliente_completo' and c.parametro is not null))
    and c.situacao not in ('na_fila', 'consultando');
  get diagnostics v_apagadas = row_count;
  return jsonb_build_object('vencidas', v_vencidas + v_na_fila, 'apagadas', v_apagadas);
end;
$$;
