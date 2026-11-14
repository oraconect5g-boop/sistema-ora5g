-- Reversão de 20261114145334_inventario_correcoes (só em banco sem dados reais).
-- Voltam os textos de inventario_contar e inventario_decidir de 20261111142726_inventario (a contagem volta a ser o
-- número de códigos lidos e quem contou volta a poder decidir) e sai a trilha das contagens, com o que foi gravado nela.
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

drop table if exists public.inventario_contagens;
