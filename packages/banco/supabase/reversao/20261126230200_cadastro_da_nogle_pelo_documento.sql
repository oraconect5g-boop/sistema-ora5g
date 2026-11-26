-- Reversão de 20261126230200_cadastro_da_nogle_pelo_documento (lote AUD-f, parte B): sai o cadastro do cliente para preencher.
-- As buscas desse tipo saem junto (duram 15 minutos e não são trilha de auditoria); a consulta e a limpeza voltam ao texto
-- anterior, inteiras (20261125180630_outras_consultas_da_nogle), e a política de leitura volta a ser a de antes.
drop function public.connect_cadastro_da_nogle_descartar(uuid);
drop function public.connect_cadastro_da_nogle(uuid, text);
delete from public.connect_consultas where tipo = 'cliente_cadastro';

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
  v_documento text;
  v_mascarado text;
  v_existente public.connect_consultas;
  v_id uuid;
begin
  if v_usuario is null or v_unidade is null then
    raise exception 'Entre no sistema e escolha a loja do turno' using errcode = '42501';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = v_unidade;
  if p_tipo is null or p_tipo not in ('linha_detalhes', 'linha_saldo', 'linha_historico', 'linha_consumo', 'iccid_numero',
                                      'iccid_ativacao', 'carteira_saldo', 'linha_completa', 'cliente_completo', 'linha_cobrancas',
                                      'linha_consumo_voz', 'linha_consumo_sms', 'linha_existe', 'iccid_plano_pago', 'iccid_situacao',
                                      'faq_categorias', 'faq_perguntas', 'planos_campanhas', 'estados', 'validar_cep', 'validar_cnpj',
                                      'compra_rastreio', 'titularidade_da_linha', 'logistica', 'validar_cpf', 'carteira_programadas',
                                      'relatorio_portabilidades', 'lista_de_linhas', 'lista_de_clientes', 'pagamento_da_solicitacao',
                                      'carteira_extrato_saidas', 'carteira_extrato_entradas') then
    raise exception 'Consulta desconhecida' using errcode = '22023';
  end if;
  -- Quem pode: a rede (o saldo, o extrato e as recargas programadas da carteira, os relatórios e as listas da Nogle inteira), a
  -- gestão da loja (o custo da logística e o CPF, que devolve o nome e o nascimento) ou quem opera a Ora Connect na loja (o resto).
  if p_tipo in ('carteira_saldo', 'carteira_programadas', 'relatorio_portabilidades', 'lista_de_linhas', 'lista_de_clientes',
                'carteira_extrato_saidas', 'carteira_extrato_entradas') then
    if v_org is null or v_org not in (select privado.organizacoes_com_permissao('connect.gerir')) then
      raise exception 'Esta consulta é de quem gere a Ora Connect na rede' using errcode = '42501';
    end if;
  elsif p_tipo in ('logistica', 'validar_cpf') then
    if not coalesce((select public.tem_permissao('connect.gerir', v_unidade)), false) then
      raise exception 'Esta consulta é do dono e dos gerentes' using errcode = '42501';
    end if;
  elsif not coalesce((select public.tem_permissao('connect.operar', v_unidade)), false) then
    raise exception 'Consultar linha e chip é de quem opera a Ora Connect nesta loja' using errcode = '42501';
  end if;

  -- O parâmetro de cada consulta (só dígitos).
  if p_tipo in ('carteira_saldo', 'faq_categorias', 'planos_campanhas', 'estados', 'logistica') then
    if v_param is not null then
      raise exception 'Esta consulta não leva número' using errcode = '22023';
    end if;
  elsif p_tipo like 'linha\_%' and not privado.linha_valida(v_param) then
    raise exception 'Linha: 11 dígitos com DDD' using errcode = '22023';
  elsif p_tipo like 'iccid\_%' and (v_param is null or not privado.iccid_valido(v_param)) then
    raise exception 'ICCID inválido: confira os dígitos impressos no chip' using errcode = '22023';
  -- CONNECT-h: o relatório do cliente, pelo CPF (11 dígitos) ou pelo CNPJ (14).
  elsif p_tipo = 'cliente_completo' and not coalesce((length(v_param) = 11 and privado.cpf_valido(v_param))
                                                     or (length(v_param) = 14 and privado.cnpj_valido(v_param)), false) then
    raise exception 'CPF ou CNPJ inválido' using errcode = '22023';
  elsif p_tipo = 'faq_perguntas' and coalesce(v_param, '') !~ '^[0-9]{1,9}$' then
    raise exception 'O número da categoria das dúvidas' using errcode = '22023';
  elsif p_tipo = 'validar_cep' and coalesce(v_param, '') !~ '^[0-9]{8}$' then
    raise exception 'CEP: 8 dígitos' using errcode = '22023';
  elsif p_tipo = 'validar_cpf' and not coalesce(length(v_param) = 11 and privado.cpf_valido(v_param), false) then
    raise exception 'CPF inválido' using errcode = '22023';
  elsif p_tipo = 'validar_cnpj' and not coalesce(length(v_param) = 14 and privado.cnpj_valido(v_param), false) then
    raise exception 'CNPJ inválido' using errcode = '22023';
  elsif p_tipo = 'compra_rastreio' and coalesce(v_param, '') !~ '^[0-9]{1,12}$' then
    raise exception 'O número do pedido de compra' using errcode = '22023';
  elsif p_tipo = 'titularidade_da_linha' then
    -- A linha (11 dígitos) e o CPF (11) ou o CNPJ (14) do titular, gravados juntos.
    v_documento := substr(coalesce(v_param, ''), 12);
    if not coalesce(length(v_param) in (22, 25) and privado.linha_valida(left(v_param, 11))
                    and ((length(v_documento) = 11 and privado.cpf_valido(v_documento))
                         or (length(v_documento) = 14 and privado.cnpj_valido(v_documento))), false) then
      raise exception 'A linha com DDD e o CPF ou CNPJ do titular' using errcode = '22023';
    end if;
  elsif p_tipo = 'carteira_programadas' and not coalesce(v_param ~ '^[0-9]{1,2}$' and v_param::int between 1 and 90, false) then
    raise exception 'Os próximos dias: de 1 a 90' using errcode = '22023';
  elsif p_tipo in ('relatorio_portabilidades', 'carteira_extrato_saidas', 'carteira_extrato_entradas')
        and not coalesce(v_param ~ '^[0-9]{1,3}$' and v_param::int between 1 and 366, false) then
    raise exception 'Os últimos dias: de 1 a 366' using errcode = '22023';
  elsif p_tipo = 'pagamento_da_solicitacao' and coalesce(v_param, '') !~ '^[123][0-9]{1,12}$' then
    raise exception 'O tipo (ativação, recarga ou compra) e o número da solicitação' using errcode = '22023';
  elsif p_tipo in ('lista_de_linhas', 'lista_de_clientes') and not coalesce(v_param ~ '^[0-9]{1,4}$' and v_param::int between 1 and 9999, false) then
    raise exception 'A página: de 1 a 9999' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave da consulta inválida' using errcode = '22023';
  end if;

  -- O documento, para a tela, só mascarado (o inteiro sai em 24 horas).
  v_mascarado := case
    when p_tipo in ('cliente_completo', 'validar_cpf', 'validar_cnpj') then privado.connect_documento_mascarado(v_param)
    when p_tipo = 'titularidade_da_linha'
      then '(' || substr(v_param, 1, 2) || ') ' || substr(v_param, 3, 5) || '-' || substr(v_param, 8, 4) || ' · '
           || privado.connect_documento_mascarado(v_documento)
  end;

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
  values (v_org, v_unidade, v_usuario, p_chave, p_tipo, v_param, v_mascarado)
  returning id into v_id;
  return v_id;
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
  -- CONNECT-h e CONNECT-i: o CPF ou o CNPJ (do relatório do cliente, da validação e da titularidade) também sai depois de 24
  -- horas (fica o mascarado, para a tela).
  update public.connect_consultas c
  set resposta = null, resposta_apagada_em = coalesce(c.resposta_apagada_em, now()),
      parametro = case when c.tipo in ('cliente_completo', 'validar_cpf', 'validar_cnpj', 'titularidade_da_linha') then null else c.parametro end
  where c.organizacao_id = p_organizacao and coalesce(c.respondida_em, c.pedida_em) < now() - interval '24 hours'
    and (c.resposta is not null
         or (c.tipo in ('cliente_completo', 'validar_cpf', 'validar_cnpj', 'titularidade_da_linha') and c.parametro is not null))
    and c.situacao not in ('na_fila', 'consultando');
  get diagnostics v_apagadas = row_count;
  return jsonb_build_object('vencidas', v_vencidas + v_na_fila, 'apagadas', v_apagadas);
end;
$$;

drop policy connect_consultas_ler on public.connect_consultas;
create policy connect_consultas_ler on public.connect_consultas for select to authenticated
  using (pedida_por = (select auth.uid()));
alter table public.connect_consultas drop constraint connect_consultas_sessao;
alter table public.connect_consultas drop column sessao_id;
alter table public.connect_consultas drop constraint connect_consultas_tipo_check;
alter table public.connect_consultas add constraint connect_consultas_tipo_check check (tipo in ('linha_detalhes', 'linha_saldo',
  'linha_historico', 'linha_consumo', 'iccid_numero', 'iccid_ativacao', 'carteira_saldo', 'linha_completa', 'cliente_completo',
  'linha_cobrancas', 'linha_consumo_voz', 'linha_consumo_sms', 'linha_existe', 'iccid_plano_pago', 'iccid_situacao',
  'faq_categorias', 'faq_perguntas', 'planos_campanhas', 'estados', 'validar_cep', 'validar_cnpj', 'compra_rastreio',
  'titularidade_da_linha', 'logistica', 'validar_cpf', 'carteira_programadas', 'relatorio_portabilidades', 'lista_de_linhas',
  'lista_de_clientes', 'pagamento_da_solicitacao', 'carteira_extrato_saidas', 'carteira_extrato_entradas'));
