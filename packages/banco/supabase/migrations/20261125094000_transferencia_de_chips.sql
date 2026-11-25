-- =============================================================================
-- Lote CONNECT-e (25/11/2026; ORA-INV-011, que segue parcial): a transferência de chips pela Nogle, pelo sistema.
--
-- O proprietário fez a primeira transferência de verdade em 25/11 (1 eSIM para a Santa Cândida: HTTP 200, "Sucesso.", e a
-- loja passou de 3 para 4 eSIM) e respondeu "Sim, monte", com só o dono pedindo. Cada pedido é o sim dele para aquela
-- operação; o servidor (o worker) envia UMA vez e confirma pelo estoque do PDV, porque a resposta da Nogle só diz
-- "Sucesso." (não diz qual chip foi). As rotas, da coleção oficial de 07/11 e das respostas da Nogle de 10/11:
--   POST /pdv/transferir-chip-esim          { id, quantidade }                      → a Nogle escolhe os eSIMs
--   POST /pdv/transferir-chip-fisico-unidade { id, iccid }                          → um chip físico
--   POST /pdv/transferir-chip-fisico-lote    { id, iccid_inicial, iccid_final }     → sem o último dígito (o verificador)
--   * public.connect_transferencias_chips: cada pedido, com a chave de idempotência, a situação e o resultado (as contagens
--     do PDV antes e depois e os ICCIDs que chegaram); lido pelo dono e pelo administrador (RLS);
--   * public.connect_transferir_chips: o pedido, só de quem gere a Ora Connect na rede (o dono); confere o estoque livre da
--     última leitura (eSIM e físicos sem PDV) e o chip que já está noutro pedido em andamento;
--   * public.connect_cancelar_transferencia: o dono cancela o que ainda não saiu;
--   * public.connect_worker_transferencias_a_enviar e connect_worker_registrar_transferencia: só o worker (service_role).
-- Situações: registrada → enviando → confirmada | parcial | recusada | resultado_desconhecido; ou cancelada. O envio que não
-- terminou em 10 minutos vira resultado desconhecido: a Nogle pode ter recebido, e o pedido nunca é reenviado.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.connect_transferencias_chips (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  chave text not null check (length(trim(chave)) between 1 and 120),
  conteudo text not null,
  tipo text not null check (tipo in ('esim', 'unidade', 'lote')),
  pdv_id int not null,
  iccid text check (iccid is null or iccid ~ '^89[0-9]{17,18}$'),
  iccid_final text check (iccid_final is null or iccid_final ~ '^89[0-9]{17,18}$'),
  quantidade int not null check (quantidade between 1 and 500),
  motivo text check (motivo is null or length(motivo) <= 200),
  situacao text not null default 'registrada'
    check (situacao in ('registrada', 'enviando', 'confirmada', 'parcial', 'recusada', 'resultado_desconhecido', 'cancelada')),
  pedida_por uuid not null references public.perfis_usuario (id),
  pedida_em timestamptz not null default now(),
  enviando_desde timestamptz,
  enviada_em timestamptz,
  concluida_em timestamptz,
  mensagem text check (mensagem is null or length(mensagem) <= 300),
  resultado jsonb not null default '{}'::jsonb,
  unique (organizacao_id, chave),
  foreign key (organizacao_id, pdv_id) references public.connect_pdvs (organizacao_id, pdv_id),
  constraint connect_transferencias_chips_forma check (
    (tipo = 'esim' and iccid is null and iccid_final is null)
    or (tipo = 'unidade' and iccid is not null and iccid_final is null and quantidade = 1)
    or (tipo = 'lote' and iccid is not null and iccid_final is not null and length(iccid) = length(iccid_final) and iccid <= iccid_final))
);
comment on table public.connect_transferencias_chips is
  'CONNECT-e: cada pedido de transferência de chips pela Nogle (só o dono pede); o worker envia uma vez e confirma pelo '
  'estoque do PDV.';
create index connect_transferencias_chips_fila on public.connect_transferencias_chips (organizacao_id, situacao, pedida_em);
create index connect_transferencias_chips_pedida_por on public.connect_transferencias_chips (pedida_por);
create index connect_transferencias_chips_pdv on public.connect_transferencias_chips (organizacao_id, pdv_id);

create trigger connect_transferencias_chips_auditar after insert or update on public.connect_transferencias_chips
  for each row execute function privado.auditar_mudanca();

alter table public.connect_transferencias_chips enable row level security;
revoke all on public.connect_transferencias_chips from anon, authenticated;
revoke all on sequence public.connect_transferencias_chips_numero_seq from anon, authenticated;
grant select on public.connect_transferencias_chips to authenticated;
create policy connect_transferencias_chips_ler on public.connect_transferencias_chips for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'))
         or organizacao_id in (select privado.organizacoes_com_permissao('integracoes.gerir')));

-- -----------------------------------------------------------------------------
-- O pedido, pelo dono
-- -----------------------------------------------------------------------------
-- eSIM: só a quantidade (até o livre no estoque geral, menos o que já está pedido). Um chip: o ICCID de um físico livre no
-- estoque geral. Um lote: o primeiro e o último ICCID (do mesmo tamanho, em ordem); a quantidade é a dos físicos livres no
-- intervalo, pela última leitura. A mesma chave com o mesmo conteúdo devolve o pedido que já existe (o clique repetido); com
-- outro conteúdo, OR004. Sem estoque livre: OR052. Chip já em outro pedido em andamento: OR053.
create or replace function public.connect_transferir_chips(p_tipo text, p_pdv int, p_chave text, p_iccid text default null,
  p_iccid_final text default null, p_quantidade int default null, p_motivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pdv public.connect_pdvs;
  v_org uuid;
  v_iccid text := nullif(regexp_replace(coalesce(p_iccid, ''), '[^0-9]', '', 'g'), '');
  v_final text := nullif(regexp_replace(coalesce(p_iccid_final, ''), '[^0-9]', '', 'g'), '');
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_qtd int;
  v_livres int;
  v_conteudo text;
  v_existente public.connect_transferencias_chips;
  v_id uuid;
  v_numero bigint;
begin
  select p.* into v_pdv from public.connect_pdvs p
  where p.pdv_id = p_pdv and p.organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'));
  if not found then
    raise exception 'Só o dono pede transferência de chips, para um PDV da rede' using errcode = '42501';
  end if;
  v_org := v_pdv.organizacao_id;
  if p_tipo is null or p_tipo not in ('esim', 'unidade', 'lote') then
    raise exception 'Tipo de transferência desconhecido: esim, unidade ou lote' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 1 and 120 then
    raise exception 'Chave do pedido inválida' using errcode = '22023';
  end if;
  if v_motivo is not null and length(v_motivo) > 200 then
    raise exception 'O motivo vai até 200 caracteres' using errcode = '22023';
  end if;

  -- O clique repetido (a mesma chave) devolve o pedido que já existe, antes das conferências do estoque.
  v_conteudo := md5(concat_ws('|', p_tipo, p_pdv, v_iccid, v_final, case when p_tipo = 'esim' then p_quantidade end, v_motivo));
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_transferencias', v_org, p_chave));
  select t.* into v_existente from public.connect_transferencias_chips t where t.organizacao_id = v_org and t.chave = p_chave;
  if found then
    if v_existente.conteudo <> v_conteudo then
      raise exception 'Chave de idempotência já usada em outro pedido' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'situacao', v_existente.situacao,
      'quantidade', v_existente.quantidade, 'repetido', true);
  end if;

  if not v_pdv.ativo then
    raise exception 'Este PDV não está mais na lista da Nogle' using errcode = '22023';
  end if;
  -- Um pedido por vez na rede: dois pedidos ao mesmo tempo não contam o mesmo estoque livre.
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_transferencias', v_org, 'estoque livre'));
  if p_tipo = 'esim' then
    if p_quantidade is null or p_quantidade not between 1 and 500 or v_iccid is not null or v_final is not null then
      raise exception 'Para eSIM, só a quantidade (de 1 a 500)' using errcode = '22023';
    end if;
    v_qtd := p_quantidade;
    select count(*) into v_livres from public.connect_chips_nogle c
    where c.organizacao_id = v_org and c.pdv_id is null and c.tipo = 'esim';
    v_livres := v_livres - coalesce((select sum(t.quantidade) from public.connect_transferencias_chips t
      where t.organizacao_id = v_org and t.tipo = 'esim' and t.situacao in ('registrada', 'enviando')), 0);
    if v_qtd > v_livres then
      raise exception 'O estoque geral da Ora tem % eSIM livres na última leitura (fora os já pedidos)', greatest(v_livres, 0)
        using errcode = 'OR052';
    end if;
  else
    if v_iccid is null or v_iccid !~ '^89[0-9]{17,18}$' then
      raise exception 'Informe o ICCID completo (19 ou 20 dígitos, começando com 89)' using errcode = '22023';
    end if;
    if p_tipo = 'unidade' then
      if v_final is not null then
        raise exception 'Para um chip, só o ICCID' using errcode = '22023';
      end if;
      if not exists (select 1 from public.connect_chips_nogle c
                     where c.organizacao_id = v_org and c.iccid = v_iccid and c.pdv_id is null and c.tipo = 'fisico') then
        raise exception 'Este chip não está livre no estoque geral da Ora na última leitura (já está num PDV, é eSIM ou não existe)'
          using errcode = 'OR052';
      end if;
      v_qtd := 1;
    else
      if v_final is null or v_final !~ '^89[0-9]{17,18}$' or length(v_final) <> length(v_iccid) or v_iccid > v_final then
        raise exception 'Para um lote, o primeiro e o último ICCID, do mesmo tamanho e em ordem' using errcode = '22023';
      end if;
      select count(*) into v_qtd from public.connect_chips_nogle c
      where c.organizacao_id = v_org and c.pdv_id is null and c.tipo = 'fisico' and length(c.iccid) = length(v_iccid)
        and left(c.iccid, -1) between left(v_iccid, -1) and left(v_final, -1);
      if v_qtd = 0 then
        raise exception 'Nenhum chip físico livre nesse intervalo na última leitura' using errcode = 'OR052';
      end if;
      if v_qtd > 500 then
        raise exception 'Um lote vai até 500 chips (há % no intervalo)', v_qtd using errcode = '22023';
      end if;
    end if;
    if exists (select 1 from public.connect_transferencias_chips t
               where t.organizacao_id = v_org and t.situacao in ('registrada', 'enviando') and t.tipo in ('unidade', 'lote')
                 and length(t.iccid) = length(v_iccid)
                 and left(t.iccid, -1) <= left(coalesce(v_final, v_iccid), -1)
                 and left(coalesce(t.iccid_final, t.iccid), -1) >= left(v_iccid, -1)) then
      raise exception 'Algum desses chips já está num pedido em andamento' using errcode = 'OR053';
    end if;
  end if;

  perform set_config('ora.motivo', format('Pedido de transferência de %s chip(s) (%s) para o PDV %s da Nogle (%s)%s', v_qtd, p_tipo,
    p_pdv, v_pdv.nome, case when v_motivo is not null then ': ' || v_motivo else '' end), true);
  insert into public.connect_transferencias_chips (organizacao_id, chave, conteudo, tipo, pdv_id, iccid, iccid_final, quantidade,
    motivo, pedida_por)
  values (v_org, p_chave, v_conteudo, p_tipo, p_pdv, v_iccid, v_final, v_qtd, v_motivo, (select auth.uid()))
  returning id, numero into v_id, v_numero;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'situacao', 'registrada', 'quantidade', v_qtd, 'repetido', false);
end;
$$;
revoke all on function public.connect_transferir_chips(text, int, text, text, text, int, text) from public, anon;
grant execute on function public.connect_transferir_chips(text, int, text, text, text, int, text) to authenticated;

-- O dono cancela o pedido que ainda não saiu (registrada), com o motivo (na auditoria). Depois de sair: OR054.
create or replace function public.connect_cancelar_transferencia(p_transferencia uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.connect_transferencias_chips;
begin
  select t.* into v_t from public.connect_transferencias_chips t
  where t.id = p_transferencia and t.organizacao_id in (select privado.organizacoes_com_permissao('connect.gerir'))
  for update;
  if not found then
    raise exception 'Só o dono cancela um pedido de transferência da rede' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Informe o motivo do cancelamento (de 3 a 200 caracteres)' using errcode = '22023';
  end if;
  if v_t.situacao <> 'registrada' then
    raise exception 'Só se cancela o pedido que ainda não saiu para a Nogle' using errcode = 'OR054';
  end if;
  perform set_config('ora.motivo', format('Pedido de transferência nº %s cancelado: %s', v_t.numero, trim(p_motivo)), true);
  update public.connect_transferencias_chips t
  set situacao = 'cancelada', mensagem = left(trim(p_motivo), 300), concluida_em = now()
  where t.id = v_t.id;
  return 'cancelada';
end;
$$;
revoke all on function public.connect_cancelar_transferencia(uuid, text) from public, anon;
grant execute on function public.connect_cancelar_transferencia(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- A fila do worker
-- -----------------------------------------------------------------------------
-- Pega os pedidos registrados (em ordem) e os marca "enviando". Antes, o envio que não terminou em 10 minutos (o worker parou
-- entre pegar e registrar) vira resultado desconhecido: a Nogle pode ter recebido; o pedido não volta para a fila.
create or replace function public.connect_worker_transferencias_a_enviar(p_organizacao uuid, p_limite int)
returns table (transferencia_id uuid, tipo text, pdv_id int, iccid text, iccid_final text, quantidade int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.connect_transferencias_chips;
begin
  perform set_config('ora.motivo', 'O envio à Nogle não terminou em 10 minutos: resultado desconhecido (não se reenvia)', true);
  update public.connect_transferencias_chips t
  set situacao = 'resultado_desconhecido', enviando_desde = null, concluida_em = now(),
      mensagem = 'O envio não terminou: a Nogle pode ter recebido. Confira no painel da Nogle; o pedido não é reenviado.'
  where t.organizacao_id = p_organizacao and t.situacao = 'enviando' and t.enviando_desde < now() - interval '10 minutes';

  perform set_config('ora.motivo', 'O worker pegou o pedido para enviar à Nogle', true);
  for v_t in
    select t.* from public.connect_transferencias_chips t
    where t.organizacao_id = p_organizacao and t.situacao = 'registrada'
    order by t.pedida_em, t.numero
    limit greatest(1, least(coalesce(p_limite, 5), 20))
    for update skip locked
  loop
    update public.connect_transferencias_chips t set situacao = 'enviando', enviando_desde = now() where t.id = v_t.id;
    transferencia_id := v_t.id;
    tipo := v_t.tipo;
    pdv_id := v_t.pdv_id;
    iccid := v_t.iccid;
    iccid_final := v_t.iccid_final;
    quantidade := v_t.quantidade;
    return next;
  end loop;
end;
$$;
revoke all on function public.connect_worker_transferencias_a_enviar(uuid, int) from public, anon, authenticated;
grant execute on function public.connect_worker_transferencias_a_enviar(uuid, int) to service_role;

-- O resultado de um envio. p_resultado = { envio: nao_enviada | recusada | desconhecida | aceita, mensagem,
--   confirmacao: confirmada | parcial | nao_confirmada (só na aceita), antes: { fisicos, esims }, depois: { fisicos, esims },
--   novos: [iccid], transferidos, nao_transferidos }.
-- nao_enviada: nada saiu (sem conexão, sem login, sem a leitura de antes): volta para a fila. recusada: a Nogle recusou.
-- desconhecida: saiu e não voltou resposta clara. aceita: confirmada ou parcial pelo estoque do PDV; sem os chips no estoque
-- depois do "Sucesso.", resultado desconhecido (conferir no painel da Nogle).
create or replace function public.connect_worker_registrar_transferencia(p_transferencia uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.connect_transferencias_chips;
  v_envio text := p_resultado ->> 'envio';
  v_conf text := p_resultado ->> 'confirmacao';
  v_msg text := left(nullif(trim(coalesce(p_resultado ->> 'mensagem', '')), ''), 300);
  v_situacao text;
  v_resultado jsonb;
begin
  select t.* into v_t from public.connect_transferencias_chips t where t.id = p_transferencia for update;
  if not found then
    raise exception 'Pedido de transferência desconhecido' using errcode = 'P0002';
  end if;
  if v_t.situacao <> 'enviando' then
    raise exception 'O pedido não está sendo enviado (%)', v_t.situacao using errcode = '22023';
  end if;
  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object' or v_envio is null
     or v_envio not in ('nao_enviada', 'recusada', 'desconhecida', 'aceita')
     or (v_envio = 'aceita' and (v_conf is null or v_conf not in ('confirmada', 'parcial', 'nao_confirmada')))
     or (p_resultado ? 'novos' and (jsonb_typeof(p_resultado -> 'novos') <> 'array' or jsonb_array_length(p_resultado -> 'novos') > 500
         or exists (select 1 from jsonb_array_elements_text(p_resultado -> 'novos') n where n !~ '^89[0-9]{17,18}$'))) then
    raise exception 'Resultado do envio em formato inválido' using errcode = '22023';
  end if;
  v_situacao := case v_envio
    when 'nao_enviada' then 'registrada'
    when 'recusada' then 'recusada'
    when 'desconhecida' then 'resultado_desconhecido'
    else case v_conf when 'confirmada' then 'confirmada' when 'parcial' then 'parcial' else 'resultado_desconhecido' end
  end;
  if v_envio = 'aceita' and v_conf = 'nao_confirmada' then
    v_msg := left(concat_ws(' ', v_msg, 'A Nogle respondeu, mas o estoque do PDV não mostrou os chips: confira no painel da Nogle.'), 300);
  end if;
  -- Só as contagens e os ICCIDs que chegaram (nada de código de eSIM).
  v_resultado := jsonb_strip_nulls(jsonb_build_object(
    'antes', p_resultado -> 'antes', 'depois', p_resultado -> 'depois', 'novos', p_resultado -> 'novos',
    'transferidos', p_resultado -> 'transferidos', 'nao_transferidos', p_resultado -> 'nao_transferidos'));
  perform set_config('ora.motivo', format('Envio à Nogle do pedido nº %s: %s', v_t.numero, v_situacao), true);
  update public.connect_transferencias_chips t
  set situacao = v_situacao,
      enviando_desde = null,
      enviada_em = case when v_envio = 'nao_enviada' then null else now() end,
      concluida_em = case when v_envio = 'nao_enviada' then null else now() end,
      mensagem = v_msg,
      resultado = case when v_envio = 'nao_enviada' then t.resultado else v_resultado end
  where t.id = v_t.id;
  return v_situacao;
end;
$$;
revoke all on function public.connect_worker_registrar_transferencia(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_registrar_transferencia(uuid, jsonb) to service_role;
