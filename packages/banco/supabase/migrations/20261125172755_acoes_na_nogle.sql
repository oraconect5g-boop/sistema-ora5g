-- =============================================================================
-- Lote CONNECT-j (25/11/2026; ORA-CONNECT-007, ORA-CONNECT-008 e ORA-CONNECT-011, que seguem parciais): as funções da Nogle que
-- mudam algo, pedidas na tela e enviadas pelo worker. O proprietário pediu em 25/11 "todas as funções da Nogle" e respondeu
-- "Sim, todas para dono e gerentes" (a D-061). Cada pedido fica com quem pediu, o motivo e a auditoria; o worker envia UMA vez.
-- As rotas, da coleção oficial (lida inteira de novo em 25/11):
--   linha_bloquear                  POST   /atendimento/bloqueio                      { numero, motivo, observacoes }
--   linha_desbloquear               POST   /atendimento/desbloqueio                   { numero }
--   recarga_automatica_bloquear     POST   /recarga/alterarStatusRecargaAutomatica    { linha, operacao: "bloqueio", origem, motivo }
--   recarga_automatica_desbloquear  POST   /recarga/alterarStatusRecargaAutomatica    { linha, operacao: "desbloqueio", ... }
--   linha_apelido                   POST   /linhas/atualizar                          { linha, linha_apelido }
--   portabilidade_reenviar_sms      POST   /portabilidade/reenviarsms                 (a tabela diz linha e linha_doadora; o exemplo,
--                                                                                    numero_contel e doador_numero: vão os dois)
--   recarga_programar               POST   /recarga/saldo/adicionar                   { linha, plano, quantidade_recargas }
--   compra_chip                     POST   /compra/solicitar                          { metodo_pagamento, id_plano (88888 = só o chip),
--                                                                                      quantidade (até 15), o cliente e o endereço }
--   cliente_cadastrar / _atualizar  POST   /cliente/criar · PUT /cliente/atualizar    { o cliente e o endereço }
--   pdv_cadastrar                   POST   /pdv/cadastrar                             { nome, endereço, contatos e o usuário }
--   pdv_atualizar                   PUT    /pdv/atualizar                             { id, os campos que mudam }
--   pdv_inativar                    DELETE /pdv/inativar                              { id } (inativa o PDV e todos os usuários dele)
--   pdv_usuario                     POST   /pdv/usuario                               { id, nome, email, senha }
-- * public.connect_acoes: cada pedido, com o que não é sensível (a linha, o plano, o PDV); quem pediu e quem gere a Ora Connect
--   na loja leem (RLS).
-- * privado.connect_acoes_dados: o que é sensível (o CPF, o endereço, a senha do usuário do PDV), só até o envio: apagado
--   quando a ação termina (feita, recusada, resultado desconhecido ou cancelada).
-- * public.connect_pedir_acao: o pedido, só de quem gere a Ora Connect na loja do turno (o dono e os gerentes: a D-061); o PDV
--   que já existe, só o da loja de quem pede (o dono, qualquer um). public.connect_cancelar_acao: o que ainda não saiu.
-- * public.connect_worker_acoes_a_enviar e connect_worker_registrar_acao: só o worker (service_role).
-- Situações: registrada → enviando → feita | recusada | resultado_desconhecido; ou cancelada. O envio que não terminou em 10
-- minutos vira resultado desconhecido: a Nogle pode ter feito, e a ação nunca é reenviada sozinha.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.connect_acoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid not null,
  pedida_por uuid not null references public.perfis_usuario (id),
  chave text not null check (length(trim(chave)) between 1 and 120),
  conteudo text not null,
  tipo text not null check (tipo in ('linha_bloquear', 'linha_desbloquear', 'recarga_automatica_bloquear', 'recarga_automatica_desbloquear',
    'linha_apelido', 'portabilidade_reenviar_sms', 'recarga_programar', 'compra_chip', 'cliente_cadastrar', 'cliente_atualizar',
    'pdv_cadastrar', 'pdv_atualizar', 'pdv_inativar', 'pdv_usuario')),
  alvo text check (alvo is null or length(alvo) <= 120),
  parametros jsonb not null default '{}'::jsonb check (jsonb_typeof(parametros) = 'object' and octet_length(parametros::text) <= 4000),
  motivo text not null check (length(trim(motivo)) between 3 and 300),
  situacao text not null default 'registrada'
    check (situacao in ('registrada', 'enviando', 'feita', 'recusada', 'resultado_desconhecido', 'cancelada')),
  pedida_em timestamptz not null default now(),
  enviando_desde timestamptz,
  concluida_em timestamptz,
  mensagem text check (mensagem is null or length(mensagem) <= 300),
  resultado jsonb not null default '{}'::jsonb check (jsonb_typeof(resultado) = 'object' and octet_length(resultado::text) <= 4000),
  unique (organizacao_id, chave),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
comment on table public.connect_acoes is
  'CONNECT-j: as funções da Nogle que mudam algo (a D-061: o dono e os gerentes), enviadas uma vez pelo worker; o sensível fica '
  'em privado.connect_acoes_dados só até o envio.';
create index connect_acoes_organizacao on public.connect_acoes (organizacao_id, pedida_em);
create index connect_acoes_fila on public.connect_acoes (organizacao_id, pedida_em) where situacao in ('registrada', 'enviando');
create index connect_acoes_pedida_por on public.connect_acoes (pedida_por, pedida_em desc);
create index connect_acoes_unidade on public.connect_acoes (unidade_id, organizacao_id);
create trigger connect_acoes_auditar after insert or update on public.connect_acoes
  for each row execute function privado.auditar_mudanca();

alter table public.connect_acoes enable row level security;
revoke all on public.connect_acoes from anon, authenticated;
revoke all on sequence public.connect_acoes_numero_seq from anon, authenticated;
grant select on public.connect_acoes to authenticated;
create policy connect_acoes_ler on public.connect_acoes for select to authenticated
  using (pedida_por = (select auth.uid()) or (select public.tem_permissao('connect.gerir', unidade_id)));

create table privado.connect_acoes_dados (
  acao_id uuid primary key references public.connect_acoes (id) on delete cascade,
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) <= 8000),
  criado_em timestamptz not null default now()
);
comment on table privado.connect_acoes_dados is
  'CONNECT-j: o sensível de cada ação na Nogle (o CPF, o endereço, a senha do usuário do PDV), só até o envio; o acesso é só '
  'pelas funções connect_pedir_acao e as do worker (RLS ligado e nenhuma política).';
alter table privado.connect_acoes_dados enable row level security;
revoke all on privado.connect_acoes_dados from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- O cliente (e o endereço) de uma ação: conferido e normalizado como a Nogle pede. CPF ou CNPJ; o nascimento, quando a
-- ação pede (o cadastro de pessoa física); o endereço com a cidade da lista oficial.
-- -----------------------------------------------------------------------------
create or replace function privado.connect_cliente_da_acao(p_organizacao uuid, p_dados jsonb, p_exige_nascimento boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cpf text := nullif(regexp_replace(coalesce(p_dados ->> 'cpf', ''), '[^0-9]', '', 'g'), '');
  v_cnpj text := nullif(regexp_replace(coalesce(p_dados ->> 'cnpj', ''), '[^0-9]', '', 'g'), '');
  v_email text := lower(nullif(trim(p_dados ->> 'email'), ''));
  v_telefone text := nullif(regexp_replace(coalesce(p_dados ->> 'telefone', ''), '[^0-9]', '', 'g'), '');
  v_nascimento date;
  v_endereco jsonb := p_dados -> 'endereco';
  v_cep text;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Informe os dados do cliente' using errcode = '22023';
  end if;
  if (v_cpf is null) = (v_cnpj is null) then
    raise exception 'Informe o CPF (pessoa física) ou o CNPJ (empresa)' using errcode = '22023';
  end if;
  if (v_cpf is not null and not privado.cpf_valido(v_cpf)) or (v_cnpj is not null and not privado.cnpj_valido(v_cnpj)) then
    raise exception 'CPF ou CNPJ inválido' using errcode = '22023';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;
  if v_telefone is not null and v_telefone !~ '^[1-9]{2}[0-9]{9}$' then
    raise exception 'Telefone com DDD: 11 dígitos' using errcode = '22023';
  end if;
  if coalesce(p_dados ->> 'data_nascimento', '') <> '' then
    begin
      v_nascimento := (p_dados ->> 'data_nascimento')::date;
    exception when others then
      raise exception 'Data de nascimento inválida' using errcode = '22023';
    end;
    if v_nascimento < date '1900-01-01' or v_nascimento >= current_date then
      raise exception 'Data de nascimento inválida' using errcode = '22023';
    end if;
  elsif p_exige_nascimento and v_cpf is not null then
    raise exception 'Data de nascimento obrigatória para pessoa física' using errcode = '22023';
  end if;
  if v_endereco is null or jsonb_typeof(v_endereco) <> 'object' then
    raise exception 'Informe o endereço do cliente' using errcode = '22023';
  end if;
  v_cep := regexp_replace(coalesce(v_endereco ->> 'cep', ''), '[^0-9]', '', 'g');
  if v_cep !~ '^[0-9]{8}$' then
    raise exception 'CEP: 8 dígitos' using errcode = '22023';
  end if;
  if coalesce(v_endereco ->> 'id_cidade', '') !~ '^[0-9]{1,9}$'
     or not exists (select 1 from public.connect_referencias r
                    where r.organizacao_id = p_organizacao and r.tipo = 'cidade' and r.codigo = v_endereco ->> 'id_cidade' and r.ativo) then
    raise exception 'Cidade fora da lista da Nogle' using errcode = '22023';
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'nome', privado.connect_texto(p_dados, 'nome', 'o nome do cliente', 120),
    'apelido', privado.connect_texto(p_dados, 'apelido', 'o apelido do cliente', 60, false),
    'cpf', v_cpf, 'cnpj', v_cnpj, 'email', v_email, 'telefone', v_telefone, 'data_nascimento', to_char(v_nascimento, 'YYYY-MM-DD'),
    'endereco', jsonb_strip_nulls(jsonb_build_object(
      'rua', privado.connect_texto(v_endereco, 'rua', 'a rua', 80),
      'numero', privado.connect_texto(v_endereco, 'numero', 'o número do endereço', 10),
      'complemento', privado.connect_texto(v_endereco, 'complemento', 'o complemento', 60, false),
      'bairro', privado.connect_texto(v_endereco, 'bairro', 'o bairro', 40),
      'cep', v_cep,
      'id_cidade', (v_endereco ->> 'id_cidade')::int))));
end;
$$;
revoke all on function privado.connect_cliente_da_acao(uuid, jsonb, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- O pedido, pela tela (o dono e os gerentes)
-- -----------------------------------------------------------------------------
create or replace function public.connect_pedir_acao(p_tipo text, p_chave text, p_motivo text, p_parametros jsonb default '{}'::jsonb,
  p_dados jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_unidade uuid := (select public.unidade_atual());
  v_org uuid;
  v_par jsonb := coalesce(p_parametros, '{}'::jsonb);
  v_dados jsonb;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_linha text;
  v_doadora text;
  v_plano text;
  v_qtd int;
  v_pdv int;
  v_alvo text;
  v_metodo text;
  v_senha text;
  v_usuario_pdv jsonb;
  v_conteudo text;
  v_existente public.connect_acoes;
  v_id uuid;
  v_numero bigint;
begin
  if v_usuario is null or v_unidade is null or not coalesce((select public.tem_permissao('connect.gerir', v_unidade)), false) then
    raise exception 'As ações na Nogle são do dono e dos gerentes, na loja do turno' using errcode = '42501';
  end if;
  select u.organizacao_id into v_org from public.unidades u where u.id = v_unidade;
  if p_tipo is null or p_tipo not in ('linha_bloquear', 'linha_desbloquear', 'recarga_automatica_bloquear', 'recarga_automatica_desbloquear',
      'linha_apelido', 'portabilidade_reenviar_sms', 'recarga_programar', 'compra_chip', 'cliente_cadastrar', 'cliente_atualizar',
      'pdv_cadastrar', 'pdv_atualizar', 'pdv_inativar', 'pdv_usuario') then
    raise exception 'Ação desconhecida' using errcode = '22023';
  end if;
  if v_motivo is null or length(v_motivo) not between 3 and 300 then
    raise exception 'Escreva o motivo (de 3 a 300 letras; fica na auditoria)' using errcode = '22023';
  end if;
  if jsonb_typeof(v_par) <> 'object' or (p_dados is not null and jsonb_typeof(p_dados) <> 'object') then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave do pedido inválida' using errcode = '22023';
  end if;

  -- As ações numa linha: o número com DDD.
  if p_tipo in ('linha_bloquear', 'linha_desbloquear', 'recarga_automatica_bloquear', 'recarga_automatica_desbloquear', 'linha_apelido',
                'portabilidade_reenviar_sms', 'recarga_programar') then
    v_linha := regexp_replace(coalesce(v_par ->> 'linha', ''), '[^0-9]', '', 'g');
    if not privado.linha_valida(v_linha) then
      raise exception 'Linha: 11 dígitos com DDD' using errcode = '22023';
    end if;
    v_alvo := v_linha;
    v_par := jsonb_build_object('linha', v_linha);
  end if;

  if p_tipo = 'linha_bloquear' then
    if coalesce(p_parametros ->> 'motivo_bloqueio', '') not in ('PERDA', 'ROUBO', 'TROCA', 'BLOQUEIO DE IMEI', 'INADIMPLÊNCIA') then
      raise exception 'Motivo do bloqueio: perda, roubo, troca, bloqueio de IMEI ou inadimplência' using errcode = '22023';
    end if;
    v_par := v_par || jsonb_build_object('motivo_bloqueio', p_parametros ->> 'motivo_bloqueio');
  elsif p_tipo = 'linha_apelido' then
    v_par := v_par || jsonb_build_object('apelido', privado.connect_texto(p_parametros, 'apelido', 'o apelido', 60));
  elsif p_tipo = 'portabilidade_reenviar_sms' then
    v_doadora := regexp_replace(coalesce(p_parametros ->> 'linha_doadora', ''), '[^0-9]', '', 'g');
    if not privado.linha_valida(v_doadora) or v_doadora = v_linha then
      raise exception 'A linha doadora (a da outra operadora), com DDD, diferente da linha Ora' using errcode = '22023';
    end if;
    v_par := v_par || jsonb_build_object('linha_doadora', v_doadora);
  elsif p_tipo in ('recarga_programar', 'compra_chip') then
    v_plano := trim(coalesce(p_parametros ->> 'plano', ''));
    if not (p_tipo = 'compra_chip' and v_plano = '88888')
       and not exists (select 1 from public.connect_referencias r
                       where r.organizacao_id = v_org and r.tipo = 'plano' and r.codigo = v_plano and r.ativo) then
      raise exception 'Plano fora da lista da Nogle' using errcode = 'P0002';
    end if;
    begin
      v_qtd := nullif(trim(coalesce(p_parametros ->> 'quantidade', '')), '')::int;
    exception when others then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end;
    if p_tipo = 'recarga_programar' then
      if v_qtd is not null and v_qtd not between 1 and 60 then
        raise exception 'Quantidade de recargas: de 1 a 60 (ou vazia, sem fim)' using errcode = '22023';
      end if;
      v_par := v_par || jsonb_build_object('plano', v_plano, 'quantidade', v_qtd);
    else
      v_qtd := coalesce(v_qtd, 1);
      if v_qtd not between 1 and 15 then
        raise exception 'Quantidade de chips: de 1 a 15 por pedido' using errcode = '22023';
      end if;
      v_metodo := upper(trim(coalesce(p_parametros ->> 'metodo', '')));
      if v_metodo not in ('LINK', 'SALDO') then
        raise exception 'Forma de pagamento: LINK (o cliente paga pelo link) ou SALDO (a carteira da Ora)' using errcode = '22023';
      end if;
      v_dados := privado.connect_cliente_da_acao(v_org, p_dados, false);
      v_par := jsonb_build_object('plano', v_plano, 'quantidade', v_qtd, 'metodo', v_metodo);
    end if;
  elsif p_tipo in ('cliente_cadastrar', 'cliente_atualizar') then
    v_dados := privado.connect_cliente_da_acao(v_org, p_dados, p_tipo = 'cliente_cadastrar');
  elsif p_tipo = 'pdv_cadastrar' then
    if coalesce(p_parametros ->> 'uf', '') !~ '^[A-Z]{2}$' then
      raise exception 'UF do PDV: duas letras' using errcode = '22023';
    end if;
    v_par := jsonb_build_object('nome', privado.connect_texto(p_parametros, 'nome', 'o nome do PDV', 250), 'uf', p_parametros ->> 'uf',
                                'cidade', privado.connect_texto(p_parametros, 'cidade', 'a cidade do PDV', 80));
    v_alvo := v_par ->> 'nome';
  elsif p_tipo in ('pdv_atualizar', 'pdv_inativar', 'pdv_usuario') then
    begin
      v_pdv := (p_parametros ->> 'pdv')::int;
    exception when others then
      raise exception 'PDV inválido' using errcode = '22023';
    end;
    -- O PDV da Nogle já lido pelo sistema; quem não gere a rede inteira só mexe no PDV ligado a uma loja que ele gere.
    if not exists (select 1 from public.connect_pdvs p
                   where p.organizacao_id = v_org and p.pdv_id = v_pdv
                     and (v_org in (select privado.organizacoes_com_permissao('connect.gerir'))
                          or (p.unidade_id is not null and (select public.tem_permissao('connect.gerir', p.unidade_id))))) then
      raise exception 'PDV fora da sua gestão' using errcode = '42501';
    end if;
    v_par := jsonb_build_object('pdv', v_pdv);
    v_alvo := 'PDV ' || v_pdv;
  end if;

  -- Os dados do PDV (contatos, endereço e o usuário com a senha), sensíveis: conferidos aqui e guardados à parte.
  if p_tipo in ('pdv_cadastrar', 'pdv_atualizar', 'pdv_usuario') then
    v_usuario_pdv := case when p_tipo = 'pdv_usuario' then p_dados else p_dados -> 'usuario' end;
    if p_tipo = 'pdv_usuario' or (v_usuario_pdv is not null and jsonb_typeof(v_usuario_pdv) = 'object') then
      v_senha := v_usuario_pdv ->> 'senha';
      if v_senha is null or length(v_senha) not between 8 and 64 then
        raise exception 'A senha do usuário do PDV: de 8 a 64 caracteres' using errcode = '22023';
      end if;
      if coalesce(lower(trim(v_usuario_pdv ->> 'email')), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'E-mail do usuário do PDV inválido' using errcode = '22023';
      end if;
      v_usuario_pdv := jsonb_build_object('nome', privado.connect_texto(v_usuario_pdv, 'nome', 'o nome do usuário', 120),
                                          'email', lower(trim(v_usuario_pdv ->> 'email')), 'senha', v_senha);
    else
      v_usuario_pdv := null;
    end if;
    if p_tipo = 'pdv_usuario' then
      v_dados := v_usuario_pdv;
    else
      v_dados := jsonb_strip_nulls(jsonb_build_object(
        'nome', case when p_tipo = 'pdv_atualizar' then privado.connect_texto(coalesce(p_dados, '{}'::jsonb), 'nome', 'o nome do PDV', 250, false) end,
        'razao_social', privado.connect_texto(coalesce(p_dados, '{}'::jsonb), 'razao_social', 'a razão social', 250, false),
        'cnpj', nullif(regexp_replace(coalesce(p_dados ->> 'cnpj', ''), '[^0-9]', '', 'g'), ''),
        'cpf', nullif(regexp_replace(coalesce(p_dados ->> 'cpf', ''), '[^0-9]', '', 'g'), ''),
        'contato_email', lower(nullif(trim(p_dados ->> 'contato_email'), '')),
        'contato_celular', nullif(regexp_replace(coalesce(p_dados ->> 'contato_celular', ''), '[^0-9]', '', 'g'), ''),
        'endereco', case when jsonb_typeof(p_dados -> 'endereco') = 'object' then jsonb_strip_nulls(jsonb_build_object(
          'rua', privado.connect_texto(p_dados -> 'endereco', 'rua', 'a rua', 120, false),
          'numero', nullif(regexp_replace(coalesce(p_dados #>> '{endereco,numero}', ''), '[^0-9]', '', 'g'), ''),
          'cep', nullif(regexp_replace(coalesce(p_dados #>> '{endereco,cep}', ''), '[^0-9]', '', 'g'), ''),
          'bairro', privado.connect_texto(p_dados -> 'endereco', 'bairro', 'o bairro', 80, false),
          'complemento', privado.connect_texto(p_dados -> 'endereco', 'complemento', 'o complemento', 80, false),
          'uf', nullif(trim(p_dados #>> '{endereco,uf}'), ''),
          'cidade', privado.connect_texto(p_dados -> 'endereco', 'cidade', 'a cidade', 80, false))) end,
        'usuario', v_usuario_pdv));
      if (v_dados ? 'cnpj' and not privado.cnpj_valido(v_dados ->> 'cnpj')) or (v_dados ? 'cpf' and not privado.cpf_valido(v_dados ->> 'cpf')) then
        raise exception 'CPF ou CNPJ do PDV inválido' using errcode = '22023';
      end if;
      if v_dados ? 'contato_celular' and v_dados ->> 'contato_celular' !~ '^[1-9]{2}[0-9]{9}$' then
        raise exception 'Celular do PDV com DDD: 11 dígitos' using errcode = '22023';
      end if;
      if p_tipo = 'pdv_atualizar' and v_dados = '{}'::jsonb then
        raise exception 'Diga o que muda no PDV' using errcode = '22023';
      end if;
      if v_dados = '{}'::jsonb then
        v_dados := null;
      end if;
    end if;
  end if;

  -- O cliente aparece na lista só com o documento mascarado.
  if v_dados ? 'cpf' and p_tipo in ('compra_chip', 'cliente_cadastrar', 'cliente_atualizar') then
    v_alvo := '•••.•••.' || substr(v_dados ->> 'cpf', 7, 3) || '-' || right(v_dados ->> 'cpf', 2);
  elsif v_dados ? 'cnpj' and p_tipo in ('compra_chip', 'cliente_cadastrar', 'cliente_atualizar') then
    v_alvo := '••.•••.•••/' || substr(v_dados ->> 'cnpj', 9, 4) || '-' || right(v_dados ->> 'cnpj', 2);
  end if;

  -- O clique repetido (a mesma chave) devolve o mesmo pedido; com outro conteúdo, OR004. A senha não entra na conta.
  v_conteudo := md5(p_tipo || ':' || v_par::text || ':' || coalesce(((v_dados #- '{usuario,senha}'::text[]) - 'senha'::text)::text, ''));
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_acoes', v_org, p_chave));
  select a.* into v_existente from public.connect_acoes a where a.organizacao_id = v_org and a.chave = p_chave;
  if found then
    if v_existente.conteudo <> v_conteudo or v_existente.pedida_por <> v_usuario then
      raise exception 'Chave de idempotência já usada em outro pedido' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'situacao', v_existente.situacao, 'repetido', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  insert into public.connect_acoes (organizacao_id, unidade_id, pedida_por, chave, conteudo, tipo, alvo, parametros, motivo)
  values (v_org, v_unidade, v_usuario, p_chave, v_conteudo, p_tipo, v_alvo, v_par, v_motivo)
  returning id, numero into v_id, v_numero;
  if v_dados is not null then
    insert into privado.connect_acoes_dados (acao_id, dados) values (v_id, v_dados);
  end if;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'situacao', 'registrada');
end;
$$;
revoke all on function public.connect_pedir_acao(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.connect_pedir_acao(text, text, text, jsonb, jsonb) to authenticated;

-- O cancelamento do que ainda não saiu: quem pediu ou quem gere a Ora Connect na loja do pedido. O que já saiu é OR057.
create or replace function public.connect_cancelar_acao(p_acao uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_acao public.connect_acoes;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  -- Sem usuário, nada: a comparação com o usuário vazio seria nula, e o nulo não recusa (o inventário de autorização pegou).
  if (select auth.uid()) is null then
    raise exception 'Pedido não encontrado' using errcode = '42501';
  end if;
  select a.* into v_acao from public.connect_acoes a where a.id = p_acao for update;
  if not found or not (coalesce(v_acao.pedida_por = (select auth.uid()), false)
                       or coalesce((select public.tem_permissao('connect.gerir', v_acao.unidade_id)), false)) then
    raise exception 'Pedido não encontrado' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) not between 3 and 300 then
    raise exception 'Escreva o motivo do cancelamento' using errcode = '22023';
  end if;
  if v_acao.situacao <> 'registrada' then
    raise exception 'O pedido já saiu para a Nogle: não dá para cancelar' using errcode = 'OR057';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.connect_acoes a set situacao = 'cancelada', concluida_em = now(), mensagem = left('Cancelado: ' || v_motivo, 300)
  where a.id = p_acao;
  delete from privado.connect_acoes_dados d where d.acao_id = p_acao;
  return 'cancelada';
end;
$$;
revoke all on function public.connect_cancelar_acao(uuid, text) from public, anon;
grant execute on function public.connect_cancelar_acao(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- O worker (service_role)
-- -----------------------------------------------------------------------------
-- Vence o envio parado (mais de 10 minutos: resultado desconhecido, nunca reenviado) e pega até p_limite pedidos da fila, com
-- os dados sensíveis (que saem do banco quando a ação termina).
create or replace function public.connect_worker_acoes_a_enviar(p_organizacao uuid, p_limite int)
returns table (acao_id uuid, tipo text, parametros jsonb, dados jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'O envio à Nogle não terminou em 10 minutos: resultado desconhecido (CONNECT-j)', true);
  update public.connect_acoes a
  set situacao = 'resultado_desconhecido', concluida_em = now(),
      mensagem = 'O envio não terminou: confira no painel da Nogle antes de pedir de novo.'
  where a.organizacao_id = p_organizacao and a.situacao = 'enviando' and a.enviando_desde < now() - interval '10 minutes';
  delete from privado.connect_acoes_dados d using public.connect_acoes a
  where a.id = d.acao_id and a.organizacao_id = p_organizacao and a.situacao in ('feita', 'recusada', 'resultado_desconhecido', 'cancelada');
  perform set_config('ora.motivo', 'O worker pegou o pedido para enviar à Nogle (CONNECT-j)', true);
  return query
  with fila as (
    select a.id from public.connect_acoes a
    where a.organizacao_id = p_organizacao and a.situacao = 'registrada'
    order by a.pedida_em, a.id
    limit greatest(1, least(coalesce(p_limite, 5), 20))
    for update skip locked)
  update public.connect_acoes a set situacao = 'enviando', enviando_desde = now()
  from fila where a.id = fila.id
  returning a.id, a.tipo, a.parametros, (select d.dados from privado.connect_acoes_dados d where d.acao_id = a.id);
end;
$$;
revoke all on function public.connect_worker_acoes_a_enviar(uuid, int) from public, anon, authenticated;
grant execute on function public.connect_worker_acoes_a_enviar(uuid, int) to service_role;

-- O resultado do envio: nao_enviada (nada saiu: volta para a fila), feita, recusada ou desconhecida (saiu sem resposta clara).
create or replace function public.connect_worker_registrar_acao(p_acao uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_envio text := p_resultado ->> 'envio';
  v_mensagem text := nullif(left(trim(coalesce(p_resultado ->> 'mensagem', '')), 300), '');
  v_resultado jsonb := coalesce(p_resultado -> 'resultado', '{}'::jsonb);
  v_nova text;
begin
  if v_envio is null or v_envio not in ('nao_enviada', 'feita', 'recusada', 'desconhecida') then
    raise exception 'Resultado do envio inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_resultado) <> 'object' or octet_length(v_resultado::text) > 4000 then
    raise exception 'Resultado fora da forma' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'O resultado do envio à Nogle (CONNECT-j)', true);
  if v_envio = 'nao_enviada' then
    update public.connect_acoes a set situacao = 'registrada', enviando_desde = null, mensagem = v_mensagem
    where a.id = p_acao and a.situacao = 'enviando'
    returning a.situacao into v_nova;
    return coalesce(v_nova, 'ignorada');
  end if;
  update public.connect_acoes a
  set situacao = case v_envio when 'desconhecida' then 'resultado_desconhecido' else v_envio end, mensagem = v_mensagem,
      resultado = v_resultado, concluida_em = now()
  where a.id = p_acao and a.situacao = 'enviando'
  returning a.situacao into v_nova;
  if v_nova is not null then
    delete from privado.connect_acoes_dados d where d.acao_id = p_acao;
  end if;
  return coalesce(v_nova, 'ignorada');
end;
$$;
revoke all on function public.connect_worker_registrar_acao(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_registrar_acao(uuid, jsonb) to service_role;
