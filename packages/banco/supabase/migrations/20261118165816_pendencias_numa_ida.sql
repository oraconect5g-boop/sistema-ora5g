-- =============================================================================
-- Velocidade das telas com login, lote VEL-c (ORA-QUAL-010, D-047; ADR-010, "O que fica para depois")
--
-- O sino do topo (/api/pendencias, em toda tela com login) e o Início liam as pendências da loja do turno em 16
-- contagens separadas, pedidas ao mesmo tempo: pelo log de tempos da homologação de 18/11, de 17 a 29 pedidos por
-- abertura, de 0,72 a 1,47 s no banco. A orientação do proprietário de 18/11 pede continuar o VEL-c "sem remover RLS
-- ou cachear permissões entre usuários para reduzir chamadas".
--
-- public.pendencias_da_loja: as mesmas 16 contagens numa ida só. Não decide nada por conta própria:
--   * a loja é a do turno (public.unidade_atual(), a mesma das ações);
--   * cada contagem só é feita para quem tem a permissão da fila, pela MESMA public.tem_permissao das telas e das
--     ações (as mesmas chaves que o sino conferia no molde da sessão); sem a permissão, a chave nem aparece;
--   * cada contagem é uma leitura comum, SECURITY INVOKER: as regras de leitura (RLS) de quem chama valem como nas
--     contagens separadas (o dono vê as contas a pagar da rede; o gerente, as da loja dele);
--   * os filtros são os de apps/plataforma/src/lib/inicio/pendencias.ts, com o dia de hoje em São Paulo e as janelas
--     de 7 dias e de 1 dia contadas de agora.
-- Não grava nada, não guarda nada entre chamadas e não fica aberta para quem não entrou (anon).
--
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.pendencias_da_loja()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_eu constant uuid := (select auth.uid());
  v_unidade constant uuid := (select public.unidade_atual());
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ha_sete_dias constant timestamptz := now() - interval '7 days';
  v_ha_um_dia constant timestamptz := now() - interval '1 day';
  r jsonb := '{}'::jsonb;
begin
  if v_eu is null or v_unidade is null then
    return r;
  end if;

  if public.tem_permissao('desconto.aprovar', v_unidade) then
    r := r || jsonb_build_object('aprovacoes',
      (select count(*) from public.aprovacoes_desconto a where a.unidade_id = v_unidade and a.situacao = 'pendente'));
  end if;

  if public.tem_permissao('nota.aprovar', v_unidade) then
    r := r || jsonb_build_object(
      'notas', (select count(*) from public.notas_pedidos n where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'aprovada')),
      'notas_paradas', (select count(*) from public.notas_pedidos n
                        where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')
                          and n.criado_em < v_ha_um_dia));
  end if;

  if public.tem_permissao('caixa.conferir', v_unidade) then
    r := r || jsonb_build_object(
      'caixas', (select count(*) from public.caixas c where c.unidade_id = v_unidade and c.situacao = 'fechado'),
      -- Saídas do caixa que outra pessoa pediu: quem pediu não autoriza a própria.
      'saidas', (select count(*) from public.caixa_saidas s where s.unidade_id = v_unidade and s.situacao = 'pendente' and s.pedida_por <> v_eu),
      'caixas_com_diferenca', (select count(*) from public.caixas c
                               where c.unidade_id = v_unidade and c.diferenca_centavos <> 0 and c.fechado_em >= v_ha_sete_dias));
  end if;

  -- As contas que a pessoa gere: o RLS dá ao dono a rede e todas as lojas; ao gerente, a loja dele.
  if public.tem_permissao('conta_pagar.gerir', v_unidade) then
    r := r || jsonb_build_object('contas_a_pagar',
      (select count(*) from public.contas_a_pagar p where p.situacao = 'aberta' and p.vencimento <= v_hoje));
  end if;

  if public.tem_permissao('bonus.aprovar', v_unidade) then
    r := r || jsonb_build_object('fechamentos', (select count(*) from public.bonus_fechamentos f where f.situacao = 'enviado'));
  end if;

  if public.tem_permissao('estoque.consultar', v_unidade) then
    r := r || jsonb_build_object('transferencias',
      (select count(*) from public.transferencias t
       where (t.origem_id = v_unidade and t.situacao in ('solicitada', 'separada')) or (t.destino_id = v_unidade and t.situacao = 'enviada')));
  end if;

  if public.tem_permissao('connect.gerir', v_unidade) then
    r := r || jsonb_build_object(
      'connect', (select count(*) from public.connect_operacoes o where o.unidade_id = v_unidade and o.situacao = 'resultado_desconhecido'),
      'ativacoes_com_falha', (select count(*) from public.connect_operacoes o
                              where o.unidade_id = v_unidade and o.tipo in ('ativacao', 'portabilidade')
                                and o.situacao in ('recusada', 'negada', 'erro_operadora') and o.atualizado_em >= v_ha_sete_dias));
  end if;

  if public.tem_permissao('venda.ver_unidade', v_unidade) then
    r := r || jsonb_build_object(
      'estornos', (select count(*) from public.estornos_externos e where e.unidade_id = v_unidade and e.situacao = 'pendente'),
      'retornos', (select count(*) from public.venda_retornos v where v.unidade_id = v_unidade and v.situacao = 'pendente'));
  end if;

  -- A assistência: as OS atrasadas e as prontas (o RLS dá à loja as dela e ao dono as da rede); ao técnico, as que
  -- estão com ele esperando o orçamento ou o conserto.
  if public.tem_permissao('os.abrir', v_unidade) or public.tem_permissao('os.gerir', v_unidade) then
    r := r || jsonb_build_object(
      'os_atrasadas', (select count(*) from public.ordens_servico o where o.situacao = 'aberta' and o.prazo < v_hoje),
      'os_prontas', (select count(*) from public.ordens_servico o where o.situacao = 'aberta' and o.local = 'loja' and o.servico = 'concluido'));
  end if;
  if public.tem_permissao('os.orcar', v_unidade) then
    r := r || jsonb_build_object('os_do_tecnico',
      (select count(*) from public.ordens_servico o
       where o.situacao = 'aberta' and o.local = 'com_tecnico' and o.servico in ('aguardando_orcamento', 'aprovado')));
  end if;

  return r;
end;
$$;

comment on function public.pendencias_da_loja() is
  'VEL-c: numa ida só, as contagens das pendências da loja do turno (o sino e o Início). Cada contagem só para quem tem a permissão da fila (tem_permissao), com o RLS de quem chama; sem a permissão, a chave não aparece. Só lê.';

revoke all on function public.pendencias_da_loja() from public, anon;
grant execute on function public.pendencias_da_loja() to authenticated;
