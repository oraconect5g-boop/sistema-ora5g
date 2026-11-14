-- =============================================================================
-- Cancelamento e correção da nota registrada (lote L10c: ORA-FISC-009 e ORA-FISC-006 em parte)
--
-- Sem emissor contratado (A4), a nota é emitida e cancelada no portal de sempre; aqui fica registrado o que foi feito.
-- Até agora, a venda com nota emitida não era cancelada nunca (OR015) e uma chave registrada errada não tinha conserto.
--
--   * public.notas_registrar_cancelamento(pedido, protocolo, justificativa): quem aprova nota, na loja do pedido (a
--     mesma regra do registro da emissão), registra que a nota emitida foi cancelada no fisco, com o protocolo do evento
--     de cancelamento (15 dígitos) e a justificativa (de 15 a 255 letras, como a do evento). O pedido passa a
--     "cancelada" com a marca do fisco (quem, quando, o protocolo); a chave continua gravada e não serve para outro
--     pedido. Depois disso a venda pode ser cancelada (o gatilho só barra a nota ainda emitida) ou pedir outra nota.
--     Repetir com o mesmo protocolo devolve falso; com outro, é recusado. Nota de venda que já tem nota de devolução
--     (pendente ou emitida) não é cancelada aqui: o caminho é com o contador. O prazo para cancelar é do fisco (depende
--     do modelo e do estado): o sistema registra, não decide.
--   * public.notas_corrigir_chave(pedido, chave, motivo): a chave registrada estava errada (digitada errado ou de outra
--     nota). Quem aprova nota troca pela certa (dígito, CNPJ da loja e unicidade conferidos, como no registro), com o
--     motivo; a anterior fica no histórico da nota. Com o XML guardado, a chave é a do XML e não se corrige. O protocolo
--     de autorização volta a vazio (era da outra chave) e entra de novo com o XML ou digitado.
--   * o gatilho da venda cancelada passa a dizer o caminho: registrar antes o cancelamento da nota no fisco.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

alter table public.notas_pedidos
  add column cancelada_no_fisco_em timestamptz,
  add column cancelada_no_fisco_por uuid references public.perfis_usuario (id),
  add column protocolo_cancelamento text check (protocolo_cancelamento is null or protocolo_cancelamento ~ '^[0-9]{15}$'),
  add constraint cancelada_no_fisco_coerente check (
    (cancelada_no_fisco_em is null) = (protocolo_cancelamento is null)
    and (cancelada_no_fisco_em is null) = (cancelada_no_fisco_por is null)
    and (cancelada_no_fisco_em is null or (situacao = 'cancelada' and chave_acesso is not null)));
create index notas_pedidos_cancelada_no_fisco_por on public.notas_pedidos (cancelada_no_fisco_por);

alter table public.notas_eventos drop constraint notas_eventos_tipo_check;
alter table public.notas_eventos add constraint notas_eventos_tipo_check check (tipo in (
  'pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida', 'emitida_sem_aprovacao_previa', 'cancelada',
  'ajustada_por_devolucao', 'cancelada_no_fisco', 'chave_corrigida'));

-- -----------------------------------------------------------------------------
-- O cancelamento da nota no fisco, registrado
-- -----------------------------------------------------------------------------
create or replace function public.notas_registrar_cancelamento(p_pedido uuid, p_protocolo text, p_justificativa text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  v_protocolo text := regexp_replace(coalesce(p_protocolo, ''), '[^0-9]', '', 'g');
  v_justificativa text := trim(coalesce(p_justificativa, ''));
begin
  if pedido.cancelada_no_fisco_em is not null then
    if pedido.protocolo_cancelamento = v_protocolo then
      return false;
    end if;
    raise exception 'O cancelamento desta nota já foi registrado com outro protocolo' using errcode = '22023';
  end if;
  if pedido.situacao <> 'emitida' then
    raise exception 'Só a nota emitida tem cancelamento no fisco' using errcode = '22023';
  end if;
  if v_protocolo !~ '^[0-9]{15}$' then
    raise exception 'Protocolo do cancelamento inválido: são 15 dígitos' using errcode = '22023';
  end if;
  if length(v_justificativa) not between 15 and 255 then
    raise exception 'A justificativa do cancelamento tem de 15 a 255 letras (como a do evento no fisco)' using errcode = '22023';
  end if;
  if pedido.tipo = 'venda' and exists (
       select 1 from public.notas_pedidos d where d.venda_id = pedido.venda_id and d.tipo = 'devolucao' and d.situacao <> 'cancelada') then
    raise exception 'Esta venda tem nota de devolução: o cancelamento da nota de origem é tratado com o contador' using errcode = '22023';
  end if;
  update public.notas_pedidos p
  set situacao = 'cancelada', motivo_cancelamento = left('Cancelada no fisco: ' || v_justificativa, 300), cancelada_no_fisco_em = now(),
      cancelada_no_fisco_por = (select auth.uid()), protocolo_cancelamento = v_protocolo, atualizado_em = now()
  where p.id = pedido.id;
  perform privado.nota_evento(pedido, 'cancelada_no_fisco', 'Protocolo ' || v_protocolo || ': ' || v_justificativa);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- A chave registrada errada, corrigida
-- -----------------------------------------------------------------------------
create or replace function public.notas_corrigir_chave(p_pedido uuid, p_chave_acesso text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  v_chave text := regexp_replace(coalesce(p_chave_acesso, ''), '[^0-9]', '', 'g');
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_cnpj text;
begin
  if pedido.situacao <> 'emitida' then
    raise exception 'Só a chave da nota emitida se corrige' using errcode = '22023';
  end if;
  if length(v_motivo) not between 10 and 300 then
    raise exception 'Informe o motivo da correção (de 10 a 300 letras)' using errcode = '22023';
  end if;
  if v_chave = pedido.chave_acesso then
    return false;
  end if;
  if not privado.chave_de_acesso_valida(v_chave) then
    raise exception 'Chave de acesso inválida: confira os 44 dígitos' using errcode = '22023';
  end if;
  select coalesce(u.cnpj, e.cnpj) into v_cnpj
  from public.unidades u left join public.unidades e on e.id = u.unidade_emissora_id
  where u.id = pedido.unidade_id;
  if v_cnpj is null or substr(v_chave, 7, 14) <> v_cnpj then
    raise exception 'A chave de acesso não é do CNPJ desta loja' using errcode = '22023';
  end if;
  if exists (select 1 from public.notas_documentos d where d.pedido_id = pedido.id and d.tipo = 'xml' and d.substituido_em is null) then
    raise exception 'O XML guardado confirma a chave registrada: se a nota é outra, cancele esta no fisco e registre a certa' using errcode = '22023';
  end if;
  begin
    update public.notas_pedidos p
    set chave_acesso = v_chave, modelo = substr(v_chave, 21, 2), serie = substr(v_chave, 23, 3)::int,
        numero_documento = substr(v_chave, 26, 9)::bigint, protocolo = null, atualizado_em = now()
    where p.id = pedido.id;
  exception when unique_violation then
    raise exception 'Esta chave de acesso já está registrada em outro pedido' using errcode = '22023';
  end;
  perform privado.nota_evento(pedido, 'chave_corrigida', 'Chave anterior ' || pedido.chave_acesso || ': ' || v_motivo);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Venda cancelada: a mensagem passa a dizer o caminho (a regra é a mesma: só a nota ainda emitida barra)
-- -----------------------------------------------------------------------------
create or replace function privado.notas_da_venda_cancelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
begin
  if old.situacao = 'concluida' and new.situacao = 'cancelada' then
    if exists (select 1 from public.notas_pedidos p where p.venda_id = old.id and p.situacao = 'emitida') then
      raise exception 'Venda com nota emitida: registre antes o cancelamento da nota no fisco (ou faça a devolução)' using errcode = 'OR015';
    end if;
    for pedido in select * from public.notas_pedidos p where p.venda_id = old.id and p.situacao <> 'cancelada' for update loop
      update public.notas_pedidos p set situacao = 'cancelada', motivo_cancelamento = 'Venda cancelada', atualizado_em = now() where p.id = pedido.id;
      delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
      perform privado.nota_evento(pedido, 'cancelada', 'Venda cancelada');
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function privado.notas_da_venda_cancelada() from public, anon, authenticated;
revoke all on function public.notas_registrar_cancelamento(uuid, text, text), public.notas_corrigir_chave(uuid, text, text) from public, anon;
grant execute on function public.notas_registrar_cancelamento(uuid, text, text), public.notas_corrigir_chave(uuid, text, text) to authenticated;
