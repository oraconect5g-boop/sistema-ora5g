-- =============================================================================
-- Inventário cíclico com ajuste aprovado por outra pessoa (lote L4b: ORA-INV-008)
--
-- A conferência do dia (conferir_item) só marca o que foi visto. Agora a loja conta um grupo de itens
-- e a diferença vira ajuste no livro só depois da aprovação de outra pessoa:
--   * quem tem estoque.conferir (gerente e dono) abre o inventário de uma lista de itens e conta:
--     acessório por quantidade; aparelho e chip pelo IMEI/ICCID encontrado. O sistema guarda o que
--     ele tinha no momento de cada contagem (para a diferença não mudar com as vendas seguintes);
--   * quem tem estoque.solicitar_ajuste (gerente) envia com o motivo; quem tem estoque.ajustar (dono)
--     e não abriu nem enviou aprova ou recusa (OR025);
--   * aprovado: acessório ajusta pela diferença da contagem (a mais: ajuste; a menos: perda); aparelho
--     ou chip que não foi encontrado e continua livre na loja sai como perda; o encontrado sem cadastro
--     nesta loja só é apontado (entra por entrada, transferência ou devolução, nunca pelo inventário);
--   * tudo com motivo e auditoria; nada se apaga. A trilha guarda antes, contado, ajuste e quem fez.
-- Códigos: OR025 quem abriu ou enviou o inventário não aprova.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.inventarios (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  descricao text not null check (length(trim(descricao)) between 3 and 120),
  chave text not null check (length(trim(chave)) between 8 and 80),
  situacao text not null default 'em_contagem' check (situacao in ('em_contagem', 'enviado', 'aprovado', 'recusado', 'cancelado')),
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  enviado_por uuid references public.perfis_usuario (id),
  enviado_em timestamptz,
  motivo_envio text,
  decidido_por uuid references public.perfis_usuario (id),
  decidido_em timestamptz,
  motivo_decisao text,
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave)
);
create index inventarios_unidade on public.inventarios (unidade_id, criado_em desc);
create index inventarios_criado_por on public.inventarios (criado_por);
create index inventarios_enviado_por on public.inventarios (enviado_por);
create index inventarios_decidido_por on public.inventarios (decidido_por);
create trigger inventarios_auditar after insert or update on public.inventarios
  for each row execute function privado.auditar_mudanca();

create table public.inventario_itens (
  inventario_id uuid not null references public.inventarios (id),
  organizacao_id uuid not null,
  variante_id uuid not null,
  tipo text not null check (tipo in ('aparelho', 'chip', 'acessorio')),
  sistema_quantidade int,
  contado_quantidade int check (contado_quantidade is null or contado_quantidade between 0 and 100000),
  sistema_itens uuid[],
  contados text[],
  contado_por uuid references public.perfis_usuario (id),
  contado_em timestamptz,
  ajuste_quantidade int,
  itens_baixados uuid[],
  nao_baixados uuid[],
  encontrados_fora text[],
  primary key (inventario_id, variante_id),
  foreign key (variante_id, organizacao_id) references public.variantes (id, organizacao_id)
);
create index inventario_itens_variante on public.inventario_itens (variante_id, organizacao_id);
create index inventario_itens_contado_por on public.inventario_itens (contado_por);

alter table public.inventarios enable row level security;
alter table public.inventario_itens enable row level security;
revoke all on public.inventarios, public.inventario_itens from anon, authenticated;
revoke all on sequence public.inventarios_numero_seq from anon, authenticated;
grant select on public.inventarios, public.inventario_itens to authenticated;
create policy inventarios_ler on public.inventarios for select to authenticated
  using (unidade_id in (select privado.unidades_com_permissao('estoque.consultar')));
create policy inventario_itens_ler on public.inventario_itens for select to authenticated
  using (inventario_id in (select i.id from public.inventarios i));

-- -----------------------------------------------------------------------------
-- Abrir, contar, enviar, cancelar
-- -----------------------------------------------------------------------------
create or replace function public.inventario_abrir(p_unidade uuid, p_variantes uuid[], p_descricao text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade public.unidades;
  v_descricao text := regexp_replace(trim(coalesce(p_descricao, '')), '\s+', ' ', 'g');
  v_existente public.inventarios;
  v_id uuid;
  v_numero bigint;
  v_variantes uuid[];
begin
  select * into v_unidade from public.unidades u where u.id = p_unidade;
  if not found or not public.tem_permissao('estoque.conferir', p_unidade) then
    raise exception 'Sem permissão para inventariar esta loja' using errcode = '42501';
  end if;
  if v_unidade.status <> 'ativa' then
    raise exception 'Loja inativa' using errcode = 'OR019';
  end if;
  if length(v_descricao) not between 3 and 120 then
    raise exception 'Descreva o inventário (de 3 a 120 letras), por exemplo "Capas e películas"' using errcode = '22023';
  end if;
  if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
    raise exception 'Chave do formulário obrigatória' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_variantes from unnest(coalesce(p_variantes, '{}')) x;
  if cardinality(v_variantes) not between 1 and 300 then
    raise exception 'Escolha de 1 a 300 itens para contar' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_variantes) x
             where not exists (select 1 from public.variantes v where v.id = x and v.organizacao_id = v_unidade.organizacao_id and v.ativa
                                 and privado.tipo_da_variante(v.id) in ('aparelho', 'chip', 'acessorio'))) then
    raise exception 'Algum item não existe nesta rede, está inativo ou não tem estoque' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('inventarios', v_unidade.organizacao_id, p_chave));
  select * into v_existente from public.inventarios i where i.organizacao_id = v_unidade.organizacao_id and i.chave = trim(p_chave);
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true);
  end if;
  perform set_config('ora.motivo', 'Inventário aberto: ' || v_descricao, true);
  insert into public.inventarios (organizacao_id, unidade_id, descricao, chave, criado_por)
  values (v_unidade.organizacao_id, p_unidade, v_descricao, trim(p_chave), (select auth.uid()))
  returning id, numero into v_id, v_numero;
  insert into public.inventario_itens (inventario_id, organizacao_id, variante_id, tipo)
  select v_id, v_unidade.organizacao_id, x, privado.tipo_da_variante(x) from unnest(v_variantes) x;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false);
end;
$$;

-- Conta um item (pode contar de novo enquanto o inventário está em contagem). Guarda o que o sistema
-- tinha nesta hora: a diferença é da contagem, não das vendas que vierem depois.
create or replace function public.inventario_contar(p_inventario uuid, p_variante uuid, p_quantidade int, p_identificadores text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.inventarios;
  v_item public.inventario_itens;
  v_ids text[];
  v_sistema uuid[];
  v_saldo int;
begin
  select * into v_inv from public.inventarios i where i.id = p_inventario for update;
  if not found or not public.tem_permissao('estoque.conferir', v_inv.unidade_id) then
    raise exception 'Inventário não encontrado para você' using errcode = 'P0002';
  end if;
  if v_inv.situacao <> 'em_contagem' then
    raise exception 'Este inventário não está mais em contagem' using errcode = '22023';
  end if;
  select * into v_item from public.inventario_itens x where x.inventario_id = v_inv.id and x.variante_id = p_variante for update;
  if not found then
    raise exception 'Este item não faz parte do inventário' using errcode = '22023';
  end if;
  if v_item.tipo = 'acessorio' then
    if p_quantidade is null or p_quantidade not between 0 and 100000 then
      raise exception 'Informe a quantidade contada (0 a 100.000)' using errcode = '22023';
    end if;
    select coalesce(s.quantidade, 0) into v_saldo from public.estoque_saldos s where s.unidade_id = v_inv.unidade_id and s.variante_id = p_variante;
    update public.inventario_itens x set sistema_quantidade = coalesce(v_saldo, 0), contado_quantidade = p_quantidade,
      contado_por = (select auth.uid()), contado_em = now()
    where x.inventario_id = v_inv.id and x.variante_id = p_variante;
  else
    v_ids := coalesce(array(select distinct regexp_replace(x, '[^0-9]', '', 'g') from unnest(coalesce(p_identificadores, '{}')) x
                            where regexp_replace(x, '[^0-9]', '', 'g') <> ''), '{}');
    if cardinality(v_ids) > 2000 then
      raise exception 'Até 2.000 IMEI/ICCID por item' using errcode = '22023';
    end if;
    select coalesce(array_agg(i.id order by i.id), '{}') into v_sistema from public.itens_serializados i
    where i.unidade_id = v_inv.unidade_id and i.variante_id = p_variante and i.em_estoque;
    update public.inventario_itens x set sistema_itens = v_sistema, sistema_quantidade = cardinality(v_sistema),
      contados = v_ids, contado_quantidade = cardinality(v_ids), contado_por = (select auth.uid()), contado_em = now()
    where x.inventario_id = v_inv.id and x.variante_id = p_variante;
  end if;
  return (select jsonb_build_object('sistema', x.sistema_quantidade, 'contado', x.contado_quantidade)
          from public.inventario_itens x where x.inventario_id = v_inv.id and x.variante_id = p_variante);
end;
$$;

create or replace function public.inventario_enviar(p_inventario uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_inv public.inventarios;
begin
  select * into v_inv from public.inventarios i where i.id = p_inventario for update;
  if not found or not public.tem_permissao('estoque.solicitar_ajuste', v_inv.unidade_id) then
    raise exception 'Inventário não encontrado para você' using errcode = 'P0002';
  end if;
  if v_inv.situacao = 'enviado' then
    return false;
  end if;
  if v_inv.situacao <> 'em_contagem' then
    raise exception 'Este inventário já foi encerrado' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventario_itens x where x.inventario_id = v_inv.id and x.contado_em is null) then
    raise exception 'Conte todos os itens antes de enviar' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.inventarios i set situacao = 'enviado', enviado_por = (select auth.uid()), enviado_em = now(), motivo_envio = v_motivo
  where i.id = v_inv.id;
  return true;
end;
$$;

create or replace function public.inventario_cancelar(p_inventario uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_inv public.inventarios;
begin
  select * into v_inv from public.inventarios i where i.id = p_inventario for update;
  if not found or not public.tem_permissao('estoque.conferir', v_inv.unidade_id) then
    raise exception 'Inventário não encontrado para você' using errcode = 'P0002';
  end if;
  if v_inv.situacao = 'cancelado' then
    return false;
  end if;
  if v_inv.situacao not in ('em_contagem', 'enviado') then
    raise exception 'Inventário já decidido não se cancela' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.inventarios i set situacao = 'cancelado', decidido_por = (select auth.uid()), decidido_em = now(), motivo_decisao = v_motivo
  where i.id = v_inv.id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Decidir: aprovar aplica os ajustes no livro; recusar encerra sem mexer no estoque
-- -----------------------------------------------------------------------------
create or replace function public.inventario_decidir(p_inventario uuid, p_aprovar boolean, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_inv public.inventarios;
  v_item public.inventario_itens;
  v_delta int;
  v_falta uuid[];
  v_id uuid;
  v_serial public.itens_serializados;
  v_baixados uuid[];
  v_nao uuid[];
  v_fora text[];
  v_rotulo text;
  v_total_ajustes int := 0;
begin
  select * into v_inv from public.inventarios i where i.id = p_inventario for update;
  if not found or not public.tem_permissao('estoque.ajustar', v_inv.unidade_id) then
    raise exception 'Inventário não encontrado para você' using errcode = 'P0002';
  end if;
  if v_inv.situacao in ('aprovado', 'recusado') then
    return jsonb_build_object('repetida', true, 'situacao', v_inv.situacao);
  end if;
  if v_inv.situacao <> 'enviado' then
    raise exception 'Só se decide inventário enviado' using errcode = '22023';
  end if;
  if (select auth.uid()) in (v_inv.criado_por, v_inv.enviado_por) then
    raise exception 'Quem abriu ou enviou o inventário não aprova: outra pessoa decide' using errcode = 'OR025';
  end if;
  v_rotulo := format('Inventário nº %s: %s', v_inv.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  if not coalesce(p_aprovar, false) then
    update public.inventarios i set situacao = 'recusado', decidido_por = (select auth.uid()), decidido_em = now(), motivo_decisao = v_motivo
    where i.id = v_inv.id;
    return jsonb_build_object('repetida', false, 'situacao', 'recusado', 'ajustes', 0);
  end if;

  for v_item in select * from public.inventario_itens x where x.inventario_id = v_inv.id order by x.variante_id for update loop
    if v_item.tipo = 'acessorio' then
      v_delta := v_item.contado_quantidade - v_item.sistema_quantidade;
      if v_delta <> 0 then
        begin
          perform privado.lancar_movimento(v_inv.unidade_id, v_item.variante_id, v_delta, case when v_delta > 0 then 'ajuste' else 'perda' end,
            null, v_rotulo, 'inventario', v_inv.id::text, format('inventario:%s:%s', v_inv.id, v_item.variante_id), (select auth.uid()));
        exception when check_violation then
          raise exception 'O estoque deste item mudou desde a contagem e não comporta o ajuste: conte de novo' using errcode = 'OR001';
        end;
        v_total_ajustes := v_total_ajustes + 1;
      end if;
      update public.inventario_itens x set ajuste_quantidade = v_delta where x.inventario_id = v_inv.id and x.variante_id = v_item.variante_id;
    else
      -- Não encontrados: estavam no sistema na hora da contagem e o IMEI/ICCID não foi lido.
      select coalesce(array_agg(i.id), '{}') into v_falta from public.itens_serializados i
      where i.id = any (coalesce(v_item.sistema_itens, '{}'))
        and not (coalesce(i.imei, '') = any (coalesce(v_item.contados, '{}')) or coalesce(i.imei2, '') = any (coalesce(v_item.contados, '{}'))
                 or coalesce(i.iccid, '') = any (coalesce(v_item.contados, '{}')));
      v_baixados := '{}';
      v_nao := '{}';
      foreach v_id in array v_falta loop
        select * into v_serial from public.itens_serializados i where i.id = v_id for update;
        if v_serial.em_estoque and v_serial.unidade_id = v_inv.unidade_id and v_serial.situacao = 'disponivel' then
          perform privado.lancar_movimento(v_inv.unidade_id, v_item.variante_id, -1, 'perda', v_id, v_rotulo, 'inventario', v_inv.id::text,
            format('inventario:%s:%s', v_inv.id, v_id), (select auth.uid()));
          v_baixados := v_baixados || v_id;
        else
          -- Vendido, reservado ou transferido depois da contagem: fica como está.
          v_nao := v_nao || v_id;
        end if;
      end loop;
      -- Lidos na contagem que não estavam nesta loja no sistema: só apontados.
      select coalesce(array_agg(c), '{}') into v_fora from unnest(coalesce(v_item.contados, '{}')) c
      where not exists (select 1 from public.itens_serializados i
                        where i.id = any (coalesce(v_item.sistema_itens, '{}')) and c in (coalesce(i.imei, ''), coalesce(i.imei2, ''), coalesce(i.iccid, '')));
      update public.inventario_itens x set ajuste_quantidade = -cardinality(v_baixados), itens_baixados = v_baixados, nao_baixados = v_nao,
        encontrados_fora = v_fora
      where x.inventario_id = v_inv.id and x.variante_id = v_item.variante_id;
      v_total_ajustes := v_total_ajustes + cardinality(v_baixados);
    end if;
  end loop;
  update public.inventarios i set situacao = 'aprovado', decidido_por = (select auth.uid()), decidido_em = now(), motivo_decisao = v_motivo
  where i.id = v_inv.id;
  return jsonb_build_object('repetida', false, 'situacao', 'aprovado', 'ajustes', v_total_ajustes);
end;
$$;

revoke all on function public.inventario_abrir(uuid, uuid[], text, text), public.inventario_contar(uuid, uuid, int, text[]),
  public.inventario_enviar(uuid, text), public.inventario_cancelar(uuid, text), public.inventario_decidir(uuid, boolean, text) from public, anon;
grant execute on function public.inventario_abrir(uuid, uuid[], text, text), public.inventario_contar(uuid, uuid, int, text[]),
  public.inventario_enviar(uuid, text), public.inventario_cancelar(uuid, text), public.inventario_decidir(uuid, boolean, text) to authenticated;
