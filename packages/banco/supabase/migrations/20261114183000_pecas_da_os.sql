-- =============================================================================
-- Peças do estoque ligadas à ordem de serviço (lote L12d: ORA-OS-006 em parte; DEC-U44, seção 2C da Etapa 0, item 3:
-- "peças e insumos só saem do estoque vinculados a uma OS; na contagem de estoque, peça faltando sem OS aparece como
-- divergência do responsável")
--
--   * categorias.peca_de_assistencia: a rede marca quais categorias são peças da assistência
--     (public.catalogo_definir_peca_de_assistencia, de quem cadastra o catálogo; só categoria de itens controlados por
--     quantidade). Peça não entra em venda: o gatilho do L12c em venda_itens passa a recusá-la também; ela só sai do
--     estoque pela OS (ou pela perda e pelo ajuste do inventário, que já pedem a decisão da gerência).
--   * estoque_movimentos: tipos novos "consumo_os" (a peça usada sai) e "consumo_os_estorno" (a que não foi usada volta),
--     sempre com a OS como referência.
--   * public.os_pecas: cada peça usada numa OS (de qual estoque, quanto, quem, se em nome do técnico), com o movimento
--     do livro; a devolução também fica registrada, uma vez; nada se apaga.
--   * public.os_usar_peca(os, variante, quantidade, observacao, chave): o técnico da assistência para onde a OS foi
--     (os.orcar), com o aparelho com ele e o conserto aprovado; ou a gerência da loja da OS em nome dele (os.gerir),
--     dizendo como ele passou. A peça sai do estoque da assistência da OS; sem saldo, é recusada (OR001). A mesma chave
--     devolve o mesmo registro.
--   * public.os_devolver_peca(peca, motivo): a peça que não foi usada volta ao estoque da assistência, uma vez,
--     enquanto a OS está aberta.
--   * Divergência: como a peça só sai pela OS, a que falta na contagem do inventário sem OS aparece como divergência
--     da loja (L4b), como qualquer falta.
-- Os relatórios da assistência ficam para o lote seguinte (L12e). Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estrutura
-- -----------------------------------------------------------------------------
alter table public.categorias add column peca_de_assistencia boolean not null default false;
comment on column public.categorias.peca_de_assistencia is
  'L12d: categoria de peças da assistência: o item não entra em venda e só sai do estoque pela ordem de serviço (os_usar_peca).';

alter table public.estoque_movimentos drop constraint estoque_movimentos_tipo_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_tipo_check check (tipo in (
  'entrada_importacao', 'entrada_compra', 'ajuste_conciliacao', 'ajuste', 'perda',
  'venda', 'devolucao', 'transferencia_saida', 'transferencia_entrada', 'consumo_os', 'consumo_os_estorno'
));
alter table public.estoque_movimentos drop constraint movimento_sinal_do_tipo;
alter table public.estoque_movimentos add constraint movimento_sinal_do_tipo check (
  (tipo in ('entrada_importacao', 'entrada_compra', 'devolucao', 'transferencia_entrada', 'consumo_os_estorno') and quantidade > 0)
  or (tipo in ('venda', 'perda', 'transferencia_saida', 'consumo_os') and quantidade < 0)
  or tipo in ('ajuste', 'ajuste_conciliacao')
);
alter table public.estoque_movimentos add constraint movimento_da_os_tem_referencia check (
  tipo not in ('consumo_os', 'consumo_os_estorno') or (referencia_tipo = 'os' and referencia_id is not null)
);

create table public.os_pecas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  os_id uuid not null references public.ordens_servico (id),
  unidade_id uuid not null references public.unidades (id),
  variante_id uuid not null,
  quantidade int not null check (quantidade between 1 and 20),
  movimento_id bigint not null references public.estoque_movimentos (id),
  em_nome_do_tecnico boolean not null default false,
  observacao text check (observacao is null or length(observacao) between 2 and 300),
  chave text not null check (length(trim(chave)) between 8 and 80),
  registrado_por uuid not null references public.perfis_usuario (id),
  registrado_em timestamptz not null default now(),
  devolvida_em timestamptz,
  devolvida_por uuid references public.perfis_usuario (id),
  motivo_devolucao text check (motivo_devolucao is null or length(motivo_devolucao) between 3 and 200),
  estorno_movimento_id bigint references public.estoque_movimentos (id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint os_peca_devolucao check (
    (devolvida_em is null) = (devolvida_por is null) and (devolvida_em is null) = (motivo_devolucao is null)
    and (devolvida_em is null) = (estorno_movimento_id is null))
);
comment on table public.os_pecas is
  'Peças do estoque usadas na ordem de serviço (L12d, ORA-OS-006): cada uma com o movimento do livro; a devolução, uma vez; nada se apaga.';
create index os_pecas_os on public.os_pecas (os_id, registrado_em);
create index os_pecas_unidade on public.os_pecas (unidade_id);
create index os_pecas_variante on public.os_pecas (variante_id, organizacao_id);
create index os_pecas_movimento on public.os_pecas (movimento_id);
create index os_pecas_estorno on public.os_pecas (estorno_movimento_id) where estorno_movimento_id is not null;
create index os_pecas_registrado_por on public.os_pecas (registrado_por);
create index os_pecas_devolvida_por on public.os_pecas (devolvida_por) where devolvida_por is not null;
create trigger os_pecas_auditar after insert or update on public.os_pecas
  for each row execute function privado.auditar_mudanca();

-- Só a devolução muda, uma vez; o resto é fixo. Nada se apaga.
create or replace function privado.os_peca_so_devolucao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.devolvida_em is not null or new.devolvida_em is null
     or (to_jsonb(old) - array['devolvida_em', 'devolvida_por', 'motivo_devolucao', 'estorno_movimento_id'])
        is distinct from (to_jsonb(new) - array['devolvida_em', 'devolvida_por', 'motivo_devolucao', 'estorno_movimento_id']) then
    raise exception 'A peça usada não muda: só a devolução da que não foi usada, uma vez' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger os_pecas_so_devolucao before update on public.os_pecas
  for each row execute function privado.os_peca_so_devolucao();
create trigger os_pecas_sem_apagar before delete on public.os_pecas
  for each row execute function privado.so_insercao();
create trigger os_pecas_sem_truncate before truncate on public.os_pecas
  for each statement execute function privado.so_insercao();

alter table public.os_pecas enable row level security;
revoke all on public.os_pecas from anon, authenticated;
grant select on public.os_pecas to authenticated;
create policy os_pecas_ler on public.os_pecas for select to authenticated
  using (os_id in (select o.id from public.ordens_servico o));

alter table public.os_eventos drop constraint os_eventos_tipo_check;
alter table public.os_eventos add constraint os_eventos_tipo_check
  check (tipo in ('aberta', 'enviada_ao_tecnico', 'recebida_pelo_tecnico', 'devolvida_pelo_tecnico', 'recebida_na_loja',
                  'devolvida_ao_cliente', 'cancelada', 'foto', 'aviso_whatsapp', 'orcamento', 'resposta_do_cliente', 'servico_concluido',
                  'cobrada', 'cobranca_desfeita', 'entregue_ao_cliente', 'peca_usada', 'peca_devolvida'));

-- O gatilho do L12c em venda_itens: o conserto só pela OS e, agora, a peça da assistência nunca na venda.
create or replace function privado.venda_item_reservado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reservado boolean;
  v_peca boolean;
begin
  select p.reservado_para = 'ordem_de_servico', c.peca_de_assistencia into v_reservado, v_peca
  from public.variantes v join public.produtos p on p.id = v.produto_id join public.categorias c on c.id = p.categoria_id
  where v.id = new.variante_id;
  if coalesce(v_reservado, false) and new.os_id is null then
    raise exception 'O conserto só entra na venda pela ordem de serviço' using errcode = '22023';
  end if;
  if new.os_id is not null and not coalesce(v_reservado, false) then
    raise exception 'O item da ordem de serviço é o conserto' using errcode = '22023';
  end if;
  -- L12d: a peça da assistência só sai do estoque pela ordem de serviço.
  if coalesce(v_peca, false) then
    raise exception 'Peça da assistência não se vende: ela só sai do estoque pela ordem de serviço' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Marcar a categoria como peça da assistência (quem cadastra o catálogo)
-- -----------------------------------------------------------------------------
create or replace function public.catalogo_definir_peca_de_assistencia(p_organizacao uuid, p_categoria uuid, p_peca boolean, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text;
  v_atual public.categorias;
begin
  if not privado.gere_catalogo(p_organizacao) then
    raise exception 'Sem permissão para cadastrar no catálogo desta rede' using errcode = '42501';
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  if p_peca is null then
    raise exception 'Diga se a categoria é de peças da assistência' using errcode = '22023';
  end if;
  select * into v_atual from public.categorias c where c.id = p_categoria and c.organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'Categoria não encontrada' using errcode = 'P0002';
  end if;
  if v_atual.peca_de_assistencia = p_peca then
    return false;
  end if;
  -- Peça é controlada por quantidade: categoria com aparelho, chip ou serviço ativo não vira peça.
  if p_peca and exists (select 1 from public.produtos p where p.categoria_id = v_atual.id and p.ativo and p.tipo <> 'acessorio') then
    raise exception 'Peça da assistência é controlada por quantidade: a categoria tem aparelho, chip ou serviço ativo' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.categorias c set peca_de_assistencia = p_peca where c.id = v_atual.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Usar e devolver a peça (técnico, ou a gerência da loja em nome dele)
-- -----------------------------------------------------------------------------
create or replace function public.os_usar_peca(p_os uuid, p_variante uuid, p_quantidade int, p_observacao text, p_chave text)
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
  v_obs text := nullif(regexp_replace(trim(coalesce(p_observacao, '')), '\s+', ' ', 'g'), '');
  existente public.os_pecas;
  v_tipo text;
  v_nome text;
  v_movimento bigint;
  v_id uuid;
begin
  select * into os from public.ordens_servico o where o.id = p_os for update;
  v_tecnico := coalesce(os.id is not null and os.assistencia_id = v_unidade and (select public.tem_permissao('os.orcar', v_unidade)), false);
  v_gere := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.gerir', v_unidade)), false);
  if not (v_tecnico or v_gere) then
    if coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false) then
      raise exception 'A peça é registrada pelo técnico (ou pela gerência da loja, em nome dele)' using errcode = '42501';
    end if;
    raise exception 'Ordem de serviço não encontrada' using errcode = 'P0002';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  select * into existente from public.os_pecas x where x.organizacao_id = os.organizacao_id and x.chave = p_chave;
  if found then
    if existente.os_id <> os.id or existente.variante_id is distinct from p_variante or existente.quantidade is distinct from p_quantidade then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('id', existente.id, 'repetida', true);
  end if;
  if v_obs is not null and length(v_obs) not between 2 and 300 then
    raise exception 'Observação: de 2 a 300 letras' using errcode = '22023';
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada' using errcode = '22023';
  end if;
  if os.servico not in ('aprovado', 'concluido') then
    raise exception 'A peça é usada depois da aprovação do cliente registrada' using errcode = '22023';
  end if;
  if os.local <> 'com_tecnico' then
    raise exception 'A peça é registrada com o aparelho com o técnico' using errcode = '22023';
  end if;
  if p_quantidade is null or p_quantidade not between 1 and 20 then
    raise exception 'Quantidade da peça: de 1 a 20' using errcode = '22023';
  end if;
  select p.tipo, v.nome into v_tipo, v_nome
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.organizacao_id = os.organizacao_id;
  if v_tipo is null then
    raise exception 'Peça não encontrada no catálogo' using errcode = 'P0002';
  end if;
  if v_tipo <> 'acessorio' then
    raise exception 'Só peça controlada por quantidade sai pela OS (aparelho e chip saem pelo IMEI/ICCID)' using errcode = '22023';
  end if;
  if not v_tecnico and v_obs is null then
    raise exception 'Em nome do técnico, diga como ele passou a peça usada (mensagem, ligação)' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', coalesce(v_obs, 'Peça usada na OS nº ' || os.numero), true);
  begin
    v_movimento := privado.lancar_movimento(os.assistencia_id, p_variante, -p_quantidade, 'consumo_os', null,
      'OS nº ' || os.numero, 'os', os.id::text, 'os_peca:' || p_chave, (select auth.uid()));
  exception when check_violation then
    raise exception 'Sem saldo desta peça no estoque da assistência' using errcode = 'OR001';
  end;
  insert into public.os_pecas (organizacao_id, os_id, unidade_id, variante_id, quantidade, movimento_id, em_nome_do_tecnico, observacao, chave, registrado_por)
  values (os.organizacao_id, os.id, os.assistencia_id, p_variante, p_quantidade, v_movimento, not v_tecnico, v_obs, p_chave, (select auth.uid()))
  returning id into v_id;
  perform privado.os_evento(os, 'peca_usada', null, null,
    left(p_quantidade || ' × ' || v_nome || coalesce(': ' || v_obs, ''), 300), not v_tecnico, v_unidade);
  return jsonb_build_object('id', v_id, 'repetida', false);
end;
$$;

create or replace function public.os_devolver_peca(p_peca uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  peca public.os_pecas;
  os public.ordens_servico;
  v_tecnico boolean;
  v_gere boolean;
  v_motivo text;
  v_nome text;
  v_movimento bigint;
begin
  select * into peca from public.os_pecas x where x.id = p_peca;
  select * into os from public.ordens_servico o where o.id = peca.os_id for update;
  v_tecnico := coalesce(os.id is not null and os.assistencia_id = v_unidade and (select public.tem_permissao('os.orcar', v_unidade)), false);
  v_gere := coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.gerir', v_unidade)), false);
  if not (v_tecnico or v_gere) then
    if coalesce(os.id is not null and os.unidade_id = v_unidade and (select public.tem_permissao('os.abrir', v_unidade)), false) then
      raise exception 'A peça é devolvida pelo técnico (ou pela gerência da loja, em nome dele)' using errcode = '42501';
    end if;
    raise exception 'Peça não encontrada' using errcode = 'P0002';
  end if;
  select * into peca from public.os_pecas x where x.id = p_peca for update;
  if peca.devolvida_em is not null then
    return false;
  end if;
  if os.situacao <> 'aberta' then
    raise exception 'A ordem de serviço já foi encerrada: a peça volta pelo inventário' using errcode = '22023';
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  select v.nome into v_nome from public.variantes v where v.id = peca.variante_id;
  perform set_config('ora.motivo', v_motivo, true);
  v_movimento := privado.lancar_movimento(peca.unidade_id, peca.variante_id, peca.quantidade, 'consumo_os_estorno', null,
    v_motivo, 'os', os.id::text, 'os_peca_estorno:' || peca.id, (select auth.uid()));
  update public.os_pecas x set devolvida_em = now(), devolvida_por = (select auth.uid()), motivo_devolucao = v_motivo,
    estorno_movimento_id = v_movimento
  where x.id = peca.id;
  perform privado.os_evento(os, 'peca_devolvida', null, null, left(peca.quantidade || ' × ' || v_nome || ': ' || v_motivo, 300), not v_tecnico, v_unidade);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permissões das funções
-- -----------------------------------------------------------------------------
revoke all on function privado.os_peca_so_devolucao(), privado.venda_item_reservado() from public, anon, authenticated;
revoke all on function public.catalogo_definir_peca_de_assistencia(uuid, uuid, boolean, text), public.os_usar_peca(uuid, uuid, int, text, text),
  public.os_devolver_peca(uuid, text) from public, anon;
grant execute on function public.catalogo_definir_peca_de_assistencia(uuid, uuid, boolean, text), public.os_usar_peca(uuid, uuid, int, text, text),
  public.os_devolver_peca(uuid, text) to authenticated;
