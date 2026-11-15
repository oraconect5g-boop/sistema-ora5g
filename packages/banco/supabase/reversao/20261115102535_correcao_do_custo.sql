-- Reversão de 20261115102535_correcao_do_custo (antes 20261115090000; só em banco sem dados reais): apaga a correção do custo, a conta pelo
-- histórico e o instante do registro da entrada, devolve o estorno da entrada do L4a (sem voltar o custo) e tira o gatilho da auditoria dos custos. Os
-- custos já gravados com as origens novas ('estorno' e 'correcao') ficam: a regra antiga das origens volta como NOT
-- VALID (vale para os custos novos, sem apagar o histórico).
drop function if exists public.custo_corrigir(uuid, bigint, text);
create or replace function public.estoque_estornar_entrada(p_entrada uuid, p_motivo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
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
  return 'estornada';
end;
$$;
drop function if exists privado.custo_pelo_historico(uuid);
alter table public.entradas_estoque drop column if exists registrada_em;
drop trigger if exists custos_auditar on public.custos;
alter table public.custos drop constraint custos_origem_check;
alter table public.custos add constraint custos_origem_check check (origem in ('importacao', 'entrada', 'manual')) not valid;
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
  );
