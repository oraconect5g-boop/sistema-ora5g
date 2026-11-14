-- =============================================================================
-- Orçamento do técnico e resposta do cliente na ordem de serviço (lote L12b: ORA-OS-003 e ORA-OS-004; ORA-OS-005 em
-- parte; DEC-U47, seção 2C da Etapa 0)
--
-- O orçamento sai do grupo de WhatsApp e fica na OS, com histórico; nada é consertado sem a resposta do cliente
-- registrada (canal e momento).
--   * ordens_servico.servico: aguardando_orcamento → aguardando_cliente → aprovado (→ concluido) ou recusado. A
--     custódia (onde o aparelho está) continua em "local"; o serviço anda à parte.
--   * public.os_orcamentos: cada orçamento é uma versão (diagnóstico, peças descritas, mão de obra, total, prazo
--     estimado), com quem registrou e se foi em nome do técnico; o novo substitui o que esperava o cliente; a resposta
--     (aprovado ou recusado, pelo canal: loja, WhatsApp ou telefone) é gravada uma vez; nada se apaga.
--   * public.os_orcar(os, dados, chave): o técnico da assistência para onde a OS foi (os.orcar), com o aparelho com
--     ele; ou a gerência da loja em nome dele (os.gerir), dizendo como ele passou o orçamento (P5 pendente). A mesma
--     chave devolve o mesmo orçamento.
--   * public.os_responder_orcamento(orcamento, resposta, canal, observacao): a loja da OS (os.abrir) registra o que o
--     cliente respondeu; só o orçamento que espera o cliente; a mesma resposta repetida não muda nada.
--   * public.os_concluir_servico(os, observacao): o técnico (ou a gerência em nome dele) marca o conserto feito, só
--     depois da aprovação e com o aparelho com ele.
--   * public.os_contato_whatsapp (a do L12a): ganha o aviso "orcamento", enquanto o orçamento espera o cliente.
-- As peças do orçamento são descritas; a baixa das peças do estoque ligada à OS, a entrega com cobrança pelo PDV e os
-- relatórios ficam para o L12c (ORA-OS-006). Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.ordens_servico add column servico text not null default 'aguardando_orcamento'
  check (servico in ('aguardando_orcamento', 'aguardando_cliente', 'aprovado', 'recusado', 'concluido'));

create table public.os_orcamentos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  os_id uuid not null references public.ordens_servico (id),
  diagnostico text not null check (length(diagnostico) between 3 and 1000),
  pecas jsonb not null default '[]'::jsonb check (jsonb_typeof(pecas) = 'array' and jsonb_array_length(pecas) <= 10),
  mao_de_obra_centavos bigint not null check (mao_de_obra_centavos between 0 and 10000000),
  pecas_centavos bigint not null check (pecas_centavos between 0 and 10000000),
  total_centavos bigint not null check (total_centavos > 0 and total_centavos = mao_de_obra_centavos + pecas_centavos),
  prazo_dias int check (prazo_dias is null or prazo_dias between 1 and 60),
  situacao text not null default 'aguardando_cliente' check (situacao in ('aguardando_cliente', 'aprovado', 'recusado', 'substituido')),
  em_nome_do_tecnico boolean not null default false,
  observacao text check (observacao is null or length(observacao) between 2 and 300),
  chave text not null check (length(trim(chave)) between 8 and 80),
  conteudo text not null,
  registrado_por uuid not null references public.perfis_usuario (id),
  registrado_em timestamptz not null default now(),
  resposta_canal text check (resposta_canal is null or resposta_canal in ('loja', 'whatsapp', 'telefone')),
  resposta_observacao text check (resposta_observacao is null or length(resposta_observacao) between 2 and 300),
  respondido_por uuid references public.perfis_usuario (id),
  respondido_em timestamptz,
  unique (organizacao_id, chave),
  constraint os_orcamento_resposta check (
    (situacao in ('aprovado', 'recusado')) = (respondido_em is not null)
    and (respondido_em is null) = (resposta_canal is null) and (respondido_em is null) = (respondido_por is null)
    and (respondido_em is not null or resposta_observacao is null))
);
comment on table public.os_orcamentos is
  'Orçamentos da ordem de serviço (L12b, ORA-OS-003/004): cada versão com a resposta do cliente, registrada uma vez; nada se apaga.';
create unique index os_orcamentos_esperando on public.os_orcamentos (os_id) where situacao = 'aguardando_cliente';
create index os_orcamentos_os on public.os_orcamentos (os_id, numero);
create index os_orcamentos_registrado_por on public.os_orcamentos (registrado_por);
create index os_orcamentos_respondido_por on public.os_orcamentos (respondido_por);
create trigger os_orcamentos_auditar after insert or update on public.os_orcamentos
  for each row execute function privado.auditar_mudanca();

-- Só a situação e a resposta mudam, uma vez, a partir de "aguardando_cliente"; o resto é fixo. Nada se apaga.
create or replace function privado.os_orcamento_so_resposta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.situacao <> 'aguardando_cliente' or new.situacao = 'aguardando_cliente'
     or (to_jsonb(old) - array['situacao', 'resposta_canal', 'resposta_observacao', 'respondido_por', 'respondido_em'])
        is distinct from (to_jsonb(new) - array['situacao', 'resposta_canal', 'resposta_observacao', 'respondido_por', 'respondido_em']) then
    raise exception 'O orçamento não muda: registre um novo, que substitui este' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger os_orcamentos_so_resposta before update on public.os_orcamentos
  for each row execute function privado.os_orcamento_so_resposta();
create trigger os_orcamentos_sem_apagar before delete on public.os_orcamentos
  for each row execute function privado.so_insercao();
create trigger os_orcamentos_sem_truncate before truncate on public.os_orcamentos
  for each statement execute function privado.so_insercao();
revoke all on function privado.os_orcamento_so_resposta() from public, anon, authenticated;

alter table public.os_orcamentos enable row level security;
revoke all on public.os_orcamentos from anon, authenticated;
revoke all on sequence public.os_orcamentos_numero_seq from anon, authenticated;
grant select on public.os_orcamentos to authenticated;
create policy os_orcamentos_ler on public.os_orcamentos for select to authenticated
  using (os_id in (select o.id from public.ordens_servico o));

alter table public.os_eventos drop constraint os_eventos_tipo_check;
alter table public.os_eventos add constraint os_eventos_tipo_check
  check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                  'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp', 'orcamento', 'resposta_do_cliente', 'servico_concluido'));

-- -----------------------------------------------------------------------------
-- Orçar (técnico, ou a gerência em nome dele)
-- -----------------------------------------------------------------------------
create or replace function public.os_orcar(p_os uuid, p_dados jsonb, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_tecnico boolean;
  v_gere boolean;
  v_pela_loja boolean;
  v_conteudo text := md5(coalesce(p_dados, '{}'::jsonb)::text);
  existente public.os_orcamentos;
  novo public.os_orcamentos;
  v_diagnostico text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'diagnostico', '')), '\s+', ' ', 'g'), '');
  v_obs text := nullif(regexp_replace(trim(coalesce(p_dados ->> 'observacao', '')), '\s+', ' ', 'g'), '');
  v_mao bigint;
  v_prazo int;
  v_pecas jsonb := '[]'::jsonb;
  v_total_pecas bigint := 0;
  item jsonb;
  v_descricao text;
  v_quantidade int;
  v_valor bigint;
begin
  select * into os from public.ordens_servico o where o.id = p_os for update;
  v_tecnico := coalesce(os.id is not null and os.assistencia_id = v_unidade and (select public.tem_permissao('os.orcar', v_unidade)), false);
  v_gere := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.gerir', v_unidade)), false);
  v_pela_loja := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false);
  if not (v_tecnico or v_gere) then
    if v_pela_loja then
      raise exception 'O orçamento é do técnico (ou da gerência da loja, em nome dele)' using errcode = '42501';
    end if;
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do orçamento inválidos' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  select * into existente from public.os_orcamentos x where x.organizacao_id = os.organizacao_id and x.chave = trim(p_chave);
  if found then
    if existente.os_id <> os.id or existente.conteudo <> v_conteudo then
      raise exception 'Chave de idempotência já usada em outro orçamento' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', existente.id, 'numero', existente.numero, 'repetida', true);
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.local <> 'com_tecnico' then
    raise exception 'O orçamento é feito com o aparelho com o técnico' using errcode = '22023';
  end if;
  if os.servico = 'concluido' then
    raise exception 'O conserto já foi concluído: o orçamento não muda' using errcode = '22023';
  end if;
  if v_diagnostico is null or length(v_diagnostico) not between 3 and 1000 then
    raise exception 'Descreva o diagnóstico (de 3 a 1.000 letras)' using errcode = '22023';
  end if;
  if coalesce(p_dados ->> 'mao_de_obra', '') !~ '^[0-9]{1,8}$' or (p_dados ->> 'mao_de_obra')::bigint > 10000000 then
    raise exception 'Valor da mão de obra inválido' using errcode = '22023';
  end if;
  v_mao := (p_dados ->> 'mao_de_obra')::bigint;
  if p_dados ? 'pecas' and jsonb_typeof(p_dados -> 'pecas') <> 'array' then
    raise exception 'Peças inválidas' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_dados -> 'pecas', '[]'::jsonb)) > 10 then
    raise exception 'No máximo 10 peças por orçamento' using errcode = '22023';
  end if;
  for item in select x from jsonb_array_elements(coalesce(p_dados -> 'pecas', '[]'::jsonb)) x loop
    v_descricao := nullif(regexp_replace(trim(coalesce(item ->> 'descricao', '')), '\s+', ' ', 'g'), '');
    if jsonb_typeof(item) <> 'object' or v_descricao is null or length(v_descricao) not between 2 and 120
       or coalesce(item ->> 'quantidade', '') !~ '^[0-9]{1,2}$' or coalesce(item ->> 'valor', '') !~ '^[0-9]{1,8}$' then
      raise exception 'Peça inválida: descrição, quantidade e valor de cada uma' using errcode = '22023';
    end if;
    v_quantidade := (item ->> 'quantidade')::int;
    v_valor := (item ->> 'valor')::bigint;
    if v_quantidade not between 1 and 20 or v_valor > 5000000 then
      raise exception 'Peça inválida: quantidade de 1 a 20 e valor de até R$ 50.000,00' using errcode = '22023';
    end if;
    v_pecas := v_pecas || jsonb_build_array(jsonb_build_object('descricao', v_descricao, 'quantidade', v_quantidade, 'valor', v_valor));
    v_total_pecas := v_total_pecas + v_quantidade * v_valor;
  end loop;
  if v_total_pecas > 10000000 or v_mao + v_total_pecas <= 0 then
    raise exception 'O total do orçamento vai de R$ 0,01 a R$ 100.000,00 em peças e mão de obra' using errcode = '22023';
  end if;
  if nullif(p_dados ->> 'prazo_dias', '') is not null then
    if (p_dados ->> 'prazo_dias') !~ '^[0-9]{1,2}$' or (p_dados ->> 'prazo_dias')::int not between 1 and 60 then
      raise exception 'Prazo do conserto: de 1 a 60 dias' using errcode = '22023';
    end if;
    v_prazo := (p_dados ->> 'prazo_dias')::int;
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  if not v_tecnico and v_obs is null then
    raise exception 'Em nome do técnico, diga como ele passou o orçamento (mensagem, ligação)' using errcode = '22023';
  end if;

  perform set_config('ora.motivo', coalesce(v_obs, 'Orçamento da ordem de serviço'), true);
  update public.os_orcamentos x set situacao = 'substituido' where x.os_id = os.id and x.situacao = 'aguardando_cliente';
  insert into public.os_orcamentos (organizacao_id, os_id, diagnostico, pecas, mao_de_obra_centavos, pecas_centavos, total_centavos, prazo_dias,
                                    em_nome_do_tecnico, observacao, chave, conteudo, registrado_por)
  values (os.organizacao_id, os.id, v_diagnostico, v_pecas, v_mao, v_total_pecas, v_mao + v_total_pecas, v_prazo,
          not v_tecnico, v_obs, trim(p_chave), v_conteudo, (select auth.uid()))
  returning * into novo;
  update public.ordens_servico o set servico = 'aguardando_cliente', atualizada_em = now() where o.id = os.id;
  perform privado.os_evento(os, 'orcamento', null, null, coalesce(v_obs, format('Orçamento nº %s', novo.numero)), not v_tecnico, v_unidade);
  return jsonb_build_object('id', novo.id, 'numero', novo.numero, 'repetida', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- A resposta do cliente (a loja registra o que o cliente disse, por qual canal)
-- -----------------------------------------------------------------------------
create or replace function public.os_responder_orcamento(p_orcamento uuid, p_resposta text, p_canal text, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  orc public.os_orcamentos;
  os public.ordens_servico;
  v_obs text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
begin
  select * into orc from public.os_orcamentos x where x.id = p_orcamento;
  select * into os from public.ordens_servico o where o.id = orc.os_id for update;
  if orc.id is null or os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Orçamento não encontrado' using errcode = 'P0002';
  end if;
  select * into orc from public.os_orcamentos x where x.id = p_orcamento for update;
  if p_resposta is null or p_resposta not in ('aprovado', 'recusado') then
    raise exception 'Resposta do cliente: aprovado ou recusado' using errcode = '22023';
  end if;
  if p_canal is null or p_canal not in ('loja', 'whatsapp', 'telefone') then
    raise exception 'Por onde o cliente respondeu: na loja, pelo WhatsApp ou por telefone' using errcode = '22023';
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  if orc.situacao = p_resposta then
    return false;
  end if;
  if orc.situacao <> 'aguardando_cliente' then
    raise exception 'Este orçamento já foi respondido ou substituído por outro' using errcode = '22023';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', format('Resposta do cliente ao orçamento nº %s: %s (%s)', orc.numero, p_resposta, p_canal), true);
  update public.os_orcamentos x set situacao = p_resposta, resposta_canal = p_canal, resposta_observacao = v_obs,
    respondido_por = (select auth.uid()), respondido_em = now()
  where x.id = orc.id;
  update public.ordens_servico o set servico = p_resposta, atualizada_em = now() where o.id = os.id;
  perform privado.os_evento(os, 'resposta_do_cliente', null, null,
    format('%s pelo cliente (%s)%s', case p_resposta when 'aprovado' then 'Aprovado' else 'Recusado' end,
           case p_canal when 'loja' then 'na loja' when 'whatsapp' then 'WhatsApp' else 'telefone' end, coalesce(': ' || v_obs, '')), false, v_unidade);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Conserto feito (técnico, ou a gerência em nome dele), só depois da aprovação
-- -----------------------------------------------------------------------------
create or replace function public.os_concluir_servico(p_os uuid, p_observacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_tecnico boolean;
  v_gere boolean;
  v_obs text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
begin
  select * into os from public.ordens_servico o where o.id = p_os for update;
  v_tecnico := coalesce(os.id is not null and os.assistencia_id = v_unidade and (select public.tem_permissao('os.orcar', v_unidade)), false);
  v_gere := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.gerir', v_unidade)), false);
  if not (v_tecnico or v_gere) then
    if coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false) then
      raise exception 'Concluir o conserto é do técnico (ou da gerência da loja, em nome dele)' using errcode = '42501';
    end if;
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  if os.situacao = 'aberta' and os.servico = 'concluido' then
    return false;
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.servico <> 'aprovado' then
    raise exception 'O conserto só é feito depois da aprovação do cliente registrada' using errcode = '22023';
  end if;
  if os.local <> 'com_tecnico' then
    raise exception 'O conserto é concluído com o aparelho com o técnico' using errcode = '22023';
  end if;
  if not v_tecnico and v_obs is null then
    raise exception 'Em nome do técnico, diga como ele confirmou o conserto (mensagem, ligação)' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', coalesce(v_obs, 'Conserto concluído'), true);
  update public.ordens_servico o set servico = 'concluido', atualizada_em = now() where o.id = os.id;
  perform privado.os_evento(os, 'servico_concluido', null, null, v_obs, not v_tecnico, v_unidade);
  return true;
end;
$$;

revoke all on function public.os_orcar(uuid, jsonb, text), public.os_responder_orcamento(uuid, text, text, text),
  public.os_concluir_servico(uuid, text) from public, anon;
grant execute on function public.os_orcar(uuid, jsonb, text), public.os_responder_orcamento(uuid, text, text, text),
  public.os_concluir_servico(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- O aviso do orçamento pelo WhatsApp (os_contato_whatsapp do L12a, com o trecho marcado "L12b")
-- -----------------------------------------------------------------------------
create or replace function public.os_contato_whatsapp(p_os uuid, p_aviso text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  os public.ordens_servico;
  v_telefone text;
begin
  if p_aviso is null or p_aviso not in ('comprovante', 'na_loja', 'orcamento') then -- L12b: + orcamento
    raise exception 'Aviso desconhecido' using errcode = '22023';
  end if;
  select * into os from public.ordens_servico o where o.id = p_os;
  if os.id is null or os.unidade_id is distinct from v_unidade or not (select public.tem_permissao('os.abrir', v_unidade)) then
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if p_aviso = 'na_loja' and (os.local <> 'loja' or not exists (select 1 from public.os_eventos e where e.os_id = os.id and e.tipo = 'recebida_na_loja')) then
    raise exception 'O aviso de chegada é depois que o aparelho volta do técnico para a loja' using errcode = '22023';
  end if;
  -- L12b: o orçamento vai ao cliente enquanto espera a resposta dele.
  if p_aviso = 'orcamento' and os.servico <> 'aguardando_cliente' then
    raise exception 'O aviso do orçamento é enquanto ele espera a resposta do cliente' using errcode = '22023';
  end if;
  select d.telefone into v_telefone from privado.cliente_dados d where d.cliente_id = os.cliente_id;
  if v_telefone is null then
    raise exception 'O cliente não tem WhatsApp no cadastro: complete o cadastro' using errcode = '22023';
  end if;
  perform privado.os_evento(os, 'aviso_whatsapp', null, null, case p_aviso when 'comprovante' then 'Comprovante' when 'orcamento' then 'Orçamento' else 'Aparelho de volta na loja' end, false, v_unidade);
  insert into public.auditoria (usuario_id, unidade_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, origem)
  values ((select auth.uid()), v_unidade, os.organizacao_id, 'os.contato_whatsapp', 'ordem_servico', os.id::text,
          jsonb_build_object('aviso', p_aviso), 'aplicacao');
  return v_telefone;
end;
$$;
