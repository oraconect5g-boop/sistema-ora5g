-- =============================================================================
-- Inventário: quem contou não aprova e cada aparelho conta uma vez (correções das issues #78 e #79)
--
-- #78 (REV-DIR-001): a aprovação olhava só quem abriu e quem enviou; quem contou podia aprovar o próprio
-- ajuste quando outra pessoa tinha aberto e enviado. Agora quem contou qualquer item do inventário também
-- não decide (OR025), inclusive quando outra pessoa refez a contagem depois. Cada contagem entra na trilha
-- public.inventario_contagens (só inserção): quem contou, quando, o que o sistema tinha e o que foi lido. A
-- recontagem substitui o número do item, mas não apaga a anterior nem libera quem contou antes para decidir.
--
-- #79 (REV-DIR-002): a quantidade contada de aparelho e chip era o número de códigos lidos, e o IMEI e o
-- IMEI2 do mesmo aparelho contavam dois. Agora cada código é resolvido para o item cadastrado na rede (IMEI,
-- IMEI2 e ICCID são um só conjunto por rede, em privado.identificadores_itens) e conta-se uma vez cada unidade
-- desta variação que está no estoque desta loja. O resto vira alerta, sem mexer no saldo: código sem cadastro
-- na rede, item cadastrado em outra loja ou fora do estoque (vendido, em trânsito, baixado) e item desta loja
-- de outra variação. O inventário continua sem criar saldo: o encontrado fora entra por entrada,
-- transferência ou devolução; o não encontrado só sai com a aprovação de outra pessoa.
--
-- Códigos: OR025 quem abriu, contou ou enviou o inventário não decide.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.inventario_contagens (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  inventario_id uuid not null,
  organizacao_id uuid not null,
  unidade_id uuid not null,
  variante_id uuid not null,
  contado_por uuid not null references public.perfis_usuario (id),
  contado_em timestamptz not null default now(),
  sistema_quantidade int not null,
  contado_quantidade int not null,
  lidos text[],
  desconhecidos text[],
  fora_da_loja text[],
  outra_variacao text[],
  foreign key (inventario_id, variante_id) references public.inventario_itens (inventario_id, variante_id),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
comment on table public.inventario_contagens is
  'Trilha de cada contagem do inventário (só inserção), na ordem de numero. lidos: códigos lidos; desconhecidos, fora_da_loja e outra_variacao: '
  'alertas da leitura (nulos nas contagens anteriores à correção de 14/11/2026, que não foram classificadas).';
create index inventario_contagens_item on public.inventario_contagens (inventario_id, variante_id, numero desc);
create index inventario_contagens_contado_por on public.inventario_contagens (contado_por);
create index inventario_contagens_unidade on public.inventario_contagens (unidade_id, organizacao_id);
create trigger inventario_contagens_sem_alteracao before update or delete on public.inventario_contagens
  for each row execute function privado.so_insercao();
create trigger inventario_contagens_sem_truncate before truncate on public.inventario_contagens
  for each statement execute function privado.so_insercao();

alter table public.inventario_contagens enable row level security;
revoke all on public.inventario_contagens from anon, authenticated;
revoke all on sequence public.inventario_contagens_numero_seq from anon, authenticated;
grant select on public.inventario_contagens to authenticated;
create policy inventario_contagens_ler on public.inventario_contagens for select to authenticated
  using (inventario_id in (select i.id from public.inventarios i));

-- A última contagem de cada item contado antes desta correção entra na trilha: quem contou continua sem decidir.
insert into public.inventario_contagens (inventario_id, organizacao_id, unidade_id, variante_id, contado_por, contado_em,
  sistema_quantidade, contado_quantidade, lidos)
select x.inventario_id, x.organizacao_id, i.unidade_id, x.variante_id, x.contado_por, x.contado_em,
  x.sistema_quantidade, x.contado_quantidade, x.contados
from public.inventario_itens x
join public.inventarios i on i.id = x.inventario_id
where x.contado_por is not null and x.contado_em is not null and x.sistema_quantidade is not null and x.contado_quantidade is not null
order by x.contado_em, x.inventario_id, x.variante_id;

-- -----------------------------------------------------------------------------
-- Contar: grava a contagem e a trilha; aparelho e chip contam uma vez por unidade física (#79)
-- -----------------------------------------------------------------------------
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
  v_achados uuid[];
  v_desconhecidos text[];
  v_fora text[];
  v_outra text[];
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
    v_saldo := coalesce(v_saldo, 0);
    update public.inventario_itens x set sistema_quantidade = v_saldo, contado_quantidade = p_quantidade,
      contado_por = (select auth.uid()), contado_em = now()
    where x.inventario_id = v_inv.id and x.variante_id = p_variante;
    insert into public.inventario_contagens (inventario_id, organizacao_id, unidade_id, variante_id, contado_por,
      sistema_quantidade, contado_quantidade)
    values (v_inv.id, v_inv.organizacao_id, v_inv.unidade_id, p_variante, (select auth.uid()), v_saldo, p_quantidade);
    return jsonb_build_object('sistema', v_saldo, 'contado', p_quantidade);
  end if;

  v_ids := coalesce(array(select distinct regexp_replace(x, '[^0-9]', '', 'g') from unnest(coalesce(p_identificadores, '{}')) x
                          where regexp_replace(x, '[^0-9]', '', 'g') <> ''), '{}');
  if cardinality(v_ids) > 2000 then
    raise exception 'Até 2.000 IMEI/ICCID por item' using errcode = '22023';
  end if;
  select coalesce(array_agg(i.id order by i.id), '{}') into v_sistema from public.itens_serializados i
  where i.unidade_id = v_inv.unidade_id and i.variante_id = p_variante and i.em_estoque;
  -- Cada código lido vira o item cadastrado na rede; o IMEI e o IMEI2 do mesmo aparelho dão o mesmo item.
  with lidos as (
    select l.codigo, c.item_serializado_id as item
    from unnest(v_ids) as l (codigo)
    left join privado.identificadores_itens c on c.organizacao_id = v_inv.organizacao_id and c.identificador = l.codigo
  )
  select
    coalesce(array_agg(distinct l.item) filter (where l.item = any (v_sistema)), '{}'),
    coalesce(array_agg(l.codigo order by l.codigo) filter (where l.item is null), '{}'),
    coalesce(array_agg(l.codigo order by l.codigo) filter (
      where l.item is not null and not (l.item = any (v_sistema)) and not (i.em_estoque and i.unidade_id = v_inv.unidade_id)), '{}'),
    coalesce(array_agg(l.codigo order by l.codigo) filter (
      where l.item is not null and not (l.item = any (v_sistema)) and i.em_estoque and i.unidade_id = v_inv.unidade_id), '{}')
  into v_achados, v_desconhecidos, v_fora, v_outra
  from lidos l
  left join public.itens_serializados i on i.id = l.item;

  update public.inventario_itens x set sistema_itens = v_sistema, sistema_quantidade = cardinality(v_sistema),
    contados = v_ids, contado_quantidade = cardinality(v_achados), contado_por = (select auth.uid()), contado_em = now()
  where x.inventario_id = v_inv.id and x.variante_id = p_variante;
  insert into public.inventario_contagens (inventario_id, organizacao_id, unidade_id, variante_id, contado_por,
    sistema_quantidade, contado_quantidade, lidos, desconhecidos, fora_da_loja, outra_variacao)
  values (v_inv.id, v_inv.organizacao_id, v_inv.unidade_id, p_variante, (select auth.uid()),
    cardinality(v_sistema), cardinality(v_achados), v_ids, v_desconhecidos, v_fora, v_outra);
  return jsonb_build_object('sistema', cardinality(v_sistema), 'contado', cardinality(v_achados), 'lidos', cardinality(v_ids),
    'desconhecidos', to_jsonb(v_desconhecidos), 'fora_da_loja', to_jsonb(v_fora), 'outra_variacao', to_jsonb(v_outra));
end;
$$;

-- -----------------------------------------------------------------------------
-- Decidir: quem abriu, contou (em qualquer contagem) ou enviou não decide (#78)
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
  if (select auth.uid()) in (v_inv.criado_por, v_inv.enviado_por)
     or exists (select 1 from public.inventario_contagens c where c.inventario_id = v_inv.id and c.contado_por = (select auth.uid()))
     or exists (select 1 from public.inventario_itens x where x.inventario_id = v_inv.id and x.contado_por = (select auth.uid())) then
    raise exception 'Quem abriu, contou ou enviou o inventário não decide: outra pessoa decide' using errcode = 'OR025';
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
      -- Não encontrados: estavam no sistema na hora da contagem e nenhum IMEI/ICCID deles foi lido.
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
