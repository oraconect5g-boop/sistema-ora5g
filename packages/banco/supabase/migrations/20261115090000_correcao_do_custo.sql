-- =============================================================================
-- Correção do custo atual (lote CAT-008b: ORA-CAT-008, "a correção do custo atual")
--
-- O custo atual de cada variação é o último gravado em public.custos (privado.custo_atual): a entrada de mercadoria
-- grava o custo da compra, a importação o da planilha. Faltavam os caminhos de volta:
--   * o ESTORNO DA ENTRADA volta o custo: depois de estornar, o custo de cada variação da entrada passa a ser o que o
--     histórico diz sem ela (privado.custo_pelo_historico: o último custo definido por importação, correção ou entrada
--     registrada, na ordem do tempo). Se a entrada estornada era a última a definir o custo, volta o anterior; se
--     outra entrada, a importação ou uma correção definiu depois, nada muda; sem custo anterior, o atual fica. O custo
--     de volta é gravado como um custo novo (origem 'estorno'), e o histórico não perde nada;
--   * a CORREÇÃO DO CUSTO com motivo (public.custo_corrigir): quem cadastra o catálogo e vê custo na rede (o dono e o
--     administrador: catalogo.gerir e custo.ver no papel da rede) grava o custo certo de uma variação (origem
--     'correcao'), com o motivo na auditoria.
-- O custo das vendas já feitas não muda (venda_itens_custos guarda o de quando o item entrou na venda): só as vendas
-- seguintes usam o custo novo. Média ponderada: não; vale o último custo definido, como sempre.
-- Trilha: todo custo gravado passa a entrar na auditoria (gatilho novo em public.custos), com o motivo quando houver;
-- o registro do custo na auditoria só aparece para quem vê custo na rede.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- As duas origens novas do custo e a auditoria de todo custo gravado.
alter table public.custos drop constraint custos_origem_check;
alter table public.custos add constraint custos_origem_check
  check (origem in ('importacao', 'entrada', 'manual', 'estorno', 'correcao'));
create trigger custos_auditar after insert on public.custos
  for each row execute function privado.auditar_mudanca();

-- A auditoria do custo guarda o valor: como já acontece com a entrada de mercadoria (REV-NOV-001), só lê quem vê custo
-- na rede. Nenhum papel padrão perde leitura (quem tem auditoria.ver na rede também tem custo.ver).
drop policy auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated
  using (
    (
      (unidade_id is not null and (select public.tem_permissao('auditoria.ver', unidade_id)))
      or (
        unidade_id is null
        and organizacao_id is not null
        and organizacao_id in (select privado.organizacoes_com_permissao('auditoria.ver'))
      )
    )
    and (
      alvo_tipo is distinct from 'entradas_estoque'
      or (unidade_id is not null and (select public.tem_permissao('custo.ver', unidade_id)))
    )
    and (
      alvo_tipo is distinct from 'custos'
      or organizacao_id in (select privado.organizacoes_com_permissao('custo.ver'))
    )
  );

-- O instante do registro da entrada pelo relógio (e não o início da transação, como criado_em): é ele que ordena a
-- entrada entre os custos gravados (que usam o relógio). Nulo nas entradas anteriores a esta migration (vale criado_em);
-- sem preencher as antigas, nenhuma linha muda.
alter table public.entradas_estoque add column registrada_em timestamptz;
alter table public.entradas_estoque alter column registrada_em set default clock_timestamp();
comment on column public.entradas_estoque.registrada_em is
  'Instante do registro pelo relógio (CAT-008b): ordena a entrada entre os custos. Nulo nas entradas anteriores a 15/11/2026 (vale criado_em).';

-- -----------------------------------------------------------------------------
-- O custo pelo histórico: o último custo DEFINIDO (por importação, desfazer importação, correção ou linha de entrada
-- REGISTRADA), sem as entradas estornadas. As linhas de custo com origem 'entrada' não contam (conta a linha da
-- entrada, mesmo quando ela não gravou custo por ser igual ao atual), e as de origem 'estorno' também não (são só o
-- resultado desta conta). Nulo: nenhum custo definido.
-- -----------------------------------------------------------------------------
create or replace function privado.custo_pelo_historico(p_variante uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select ev.valor from (
    select c.valor_centavos as valor, c.inicio as quando, c.criado_em as desempate, 0 as linha
    from public.custos c
    where c.variante_id = p_variante and c.origem in ('importacao', 'manual', 'correcao')
    union all
    select i.custo_unitario_centavos, coalesce(e.registrada_em, e.criado_em), e.criado_em, i.linha
    from public.entrada_itens i
    join public.entradas_estoque e on e.id = i.entrada_id
    where i.variante_id = p_variante and i.custo_unitario_centavos is not null and e.situacao = 'registrada'
  ) ev
  order by ev.quando desc, ev.desempate desc, ev.linha desc
  limit 1;
$$;
revoke all on function privado.custo_pelo_historico(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- O estorno da entrada (o mesmo do L4a) e, no fim, o custo de volta.
-- -----------------------------------------------------------------------------
create or replace function public.estoque_estornar_entrada(p_entrada uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_variante uuid;
  v_volta bigint;
  v_entrada public.entradas_estoque;
  v_linha public.entrada_itens;
  v_item public.itens_serializados;
  v_id uuid;
  v_saldo public.estoque_saldos;
begin
  select * into v_entrada from public.entradas_estoque e where e.id = p_entrada for update;
  if not found or not public.tem_permissao('estoque.receber', v_entrada.unidade_id) then
    raise exception 'Entrada não encontrada para você' using errcode = 'P0002';
  end if;
  if v_entrada.situacao = 'estornada' then
    return 'ja_estornada';
  end if;
  perform set_config('ora.motivo', format('Estorno da entrada nº %s: %s', v_entrada.numero, v_motivo), true);
  for v_linha in select * from public.entrada_itens i where i.entrada_id = v_entrada.id order by i.linha loop
    if cardinality(v_linha.itens) > 0 then
      foreach v_id in array v_linha.itens loop
        select * into v_item from public.itens_serializados i where i.id = v_id for update;
        if not v_item.em_estoque or v_item.unidade_id <> v_entrada.unidade_id or v_item.situacao <> 'disponivel' then
          raise exception 'O IMEI/ICCID % não está livre nesta loja (vendido, reservado ou transferido): o estorno não é possível',
            coalesce(v_item.imei, v_item.iccid) using errcode = 'OR002';
        end if;
        perform privado.lancar_movimento(v_entrada.unidade_id, v_linha.variante_id, -1, 'ajuste', v_id, v_motivo, 'estorno_entrada',
          v_entrada.id::text, format('estorno:%s:%s', v_entrada.id, v_id), (select auth.uid()));
      end loop;
    else
      select * into v_saldo from public.estoque_saldos s where s.unidade_id = v_entrada.unidade_id and s.variante_id = v_linha.variante_id for update;
      if coalesce(v_saldo.quantidade, 0) - coalesce(v_saldo.reservado, 0) < v_linha.quantidade then
        raise exception 'Não há quantidade livre para estornar a linha % (já vendida, reservada ou transferida)', v_linha.linha using errcode = 'OR001';
      end if;
      perform privado.lancar_movimento(v_entrada.unidade_id, v_linha.variante_id, -v_linha.quantidade, 'ajuste', null, v_motivo, 'estorno_entrada',
        v_entrada.id::text, format('estorno:%s:%s', v_entrada.id, v_linha.linha), (select auth.uid()));
    end if;
  end loop;
  update public.entradas_estoque e set situacao = 'estornada', estornado_por = (select auth.uid()), estornado_em = now(), motivo_estorno = v_motivo
  where e.id = v_entrada.id;
  -- CAT-008b: o custo das variações desta entrada volta ao que o histórico diz sem ela (se a entrada era a última a
  -- definir o custo, volta o anterior; se outra coisa definiu depois, nada muda; sem custo anterior, o atual fica).
  for v_variante in
    select distinct i.variante_id from public.entrada_itens i where i.entrada_id = v_entrada.id and i.custo_unitario_centavos is not null
  loop
    v_volta := privado.custo_pelo_historico(v_variante);
    if v_volta is not null and v_volta is distinct from privado.custo_atual(v_variante) then
      insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
      values (v_entrada.organizacao_id, v_variante, v_volta, clock_timestamp(), 'estorno', format('estorno:entrada:%s', v_entrada.numero), (select auth.uid()));
    end if;
  end loop;
  return 'estornada';
end;
$$;

-- -----------------------------------------------------------------------------
-- A correção do custo, com motivo: o dono e o administrador (catalogo.gerir e custo.ver no papel da rede).
-- -----------------------------------------------------------------------------
create or replace function public.custo_corrigir(p_variante uuid, p_valor_centavos bigint, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_variante public.variantes;
  v_motivo text;
begin
  select * into v_variante from public.variantes v where v.id = p_variante for update;
  if v_variante.id is null
     or v_variante.organizacao_id not in (select privado.organizacoes_com_permissao('catalogo.gerir'))
     or v_variante.organizacao_id not in (select privado.organizacoes_com_permissao('custo.ver')) then
    raise exception 'Variação não encontrada para você' using errcode = 'P0002';
  end if;
  if p_valor_centavos is null or p_valor_centavos < 0 or p_valor_centavos > 100000000 then
    raise exception 'Custo inválido: de R$ 0,00 a R$ 1.000.000,00' using errcode = '22023';
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  if length(v_motivo) > 300 then
    raise exception 'O motivo tem até 300 letras' using errcode = '22023';
  end if;
  if privado.custo_atual(v_variante.id) is not distinct from p_valor_centavos then
    return false;
  end if;
  perform set_config('ora.motivo', format('Correção do custo: %s', v_motivo), true);
  insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia, criado_por)
  values (v_variante.organizacao_id, v_variante.id, p_valor_centavos, clock_timestamp(), 'correcao', left(v_motivo, 200), (select auth.uid()));
  return true;
end;
$$;
revoke all on function public.custo_corrigir(uuid, bigint, text) from public, anon;
grant execute on function public.custo_corrigir(uuid, bigint, text) to authenticated;
