-- =============================================================================
-- Lote TRF-e (ORA-INV-007 e ORA-QUAL-006; o complemento do TRF-d, de 23/11/2026): a transferência recebida com falta
-- continua contando como pendência da loja enquanto o que faltou não tem destino.
--
-- O defeito: ao ser recebida com falta, a transferência saía da conta das pendências (o sino do topo e o Início), que só
-- olhava "pedir, separar, enviar ou receber". O que faltou ficava esperando sem aparecer para ninguém, a não ser na
-- própria tela de Transferências.
--
-- public.pendencias_da_loja: a mesma função do VEL-c e do VEL-e (copiada da última definição,
-- 20261119134800_permissoes_numa_conta), com uma condição a mais na contagem das transferências: a recebida com
-- divergência e ainda não resolvida conta para a loja de origem e para a de destino, porque as duas têm o que fazer
-- (o destino confirma o que chegou depois; a origem, o que voltou; a baixa é de quem ajusta estoque na origem).
-- A permissão (estoque.consultar) e o RLS de quem chama não mudam. Só lê.
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
  v_permissoes text[];
begin
  if v_eu is null or v_unidade is null then
    return r;
  end if;

  -- VEL-e: as permissões das filas numa conta só, pela MESMA regra de tem_permissao (privado.permissoes_vigentes).
  select coalesce(array_agg(x.permissao), '{}'::text[]) into v_permissoes
  from privado.permissoes_vigentes(array['desconto.aprovar', 'nota.aprovar', 'caixa.conferir', 'conta_pagar.gerir',
    'bonus.aprovar', 'estoque.consultar', 'connect.gerir', 'venda.ver_unidade', 'os.abrir', 'os.gerir', 'os.orcar'],
    v_unidade) as x(permissao);

  if 'desconto.aprovar' = any (v_permissoes) then
    r := r || jsonb_build_object('aprovacoes',
      (select count(*) from public.aprovacoes_desconto a where a.unidade_id = v_unidade and a.situacao = 'pendente'));
  end if;

  if 'nota.aprovar' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'notas', (select count(*) from public.notas_pedidos n where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'aprovada')),
      'notas_paradas', (select count(*) from public.notas_pedidos n
                        where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'correcao_solicitada', 'aprovada')
                          and n.criado_em < v_ha_um_dia));
  end if;

  if 'caixa.conferir' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'caixas', (select count(*) from public.caixas c where c.unidade_id = v_unidade and c.situacao = 'fechado'),
      -- Saídas do caixa que outra pessoa pediu: quem pediu não autoriza a própria.
      'saidas', (select count(*) from public.caixa_saidas s where s.unidade_id = v_unidade and s.situacao = 'pendente' and s.pedida_por <> v_eu),
      'caixas_com_diferenca', (select count(*) from public.caixas c
                               where c.unidade_id = v_unidade and c.diferenca_centavos <> 0 and c.fechado_em >= v_ha_sete_dias));
  end if;

  -- As contas que a pessoa gere: o RLS dá ao dono a rede e todas as lojas; ao gerente, a loja dele.
  if 'conta_pagar.gerir' = any (v_permissoes) then
    r := r || jsonb_build_object('contas_a_pagar',
      (select count(*) from public.contas_a_pagar p where p.situacao = 'aberta' and p.vencimento <= v_hoje));
  end if;

  if 'bonus.aprovar' = any (v_permissoes) then
    r := r || jsonb_build_object('fechamentos', (select count(*) from public.bonus_fechamentos f where f.situacao = 'enviado'));
  end if;

  if 'estoque.consultar' = any (v_permissoes) then
    r := r || jsonb_build_object('transferencias',
      (select count(*) from public.transferencias t
       where (t.origem_id = v_unidade and t.situacao in ('solicitada', 'separada')) or (t.destino_id = v_unidade and t.situacao = 'enviada')
          -- TRF-e: a recebida com falta espera, dos dois lados, o destino do que faltou (TRF-d).
          or (t.situacao = 'recebida_com_divergencia' and t.divergencia_resolvida_em is null and v_unidade in (t.origem_id, t.destino_id))));
  end if;

  if 'connect.gerir' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'connect', (select count(*) from public.connect_operacoes o where o.unidade_id = v_unidade and o.situacao = 'resultado_desconhecido'),
      'ativacoes_com_falha', (select count(*) from public.connect_operacoes o
                              where o.unidade_id = v_unidade and o.tipo in ('ativacao', 'portabilidade')
                                and o.situacao in ('recusada', 'negada', 'erro_operadora') and o.atualizado_em >= v_ha_sete_dias));
  end if;

  if 'venda.ver_unidade' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'estornos', (select count(*) from public.estornos_externos e where e.unidade_id = v_unidade and e.situacao = 'pendente'),
      'retornos', (select count(*) from public.venda_retornos v where v.unidade_id = v_unidade and v.situacao = 'pendente'));
  end if;

  -- A assistência: as OS atrasadas e as prontas (o RLS dá à loja as dela e ao dono as da rede); ao técnico, as que
  -- estão com ele esperando o orçamento ou o conserto.
  if 'os.abrir' = any (v_permissoes) or 'os.gerir' = any (v_permissoes) then
    r := r || jsonb_build_object(
      'os_atrasadas', (select count(*) from public.ordens_servico o where o.situacao = 'aberta' and o.prazo < v_hoje),
      'os_prontas', (select count(*) from public.ordens_servico o where o.situacao = 'aberta' and o.local = 'loja' and o.servico = 'concluido'));
  end if;
  if 'os.orcar' = any (v_permissoes) then
    r := r || jsonb_build_object('os_do_tecnico',
      (select count(*) from public.ordens_servico o
       where o.situacao = 'aberta' and o.local = 'com_tecnico' and o.servico in ('aguardando_orcamento', 'aprovado')));
  end if;

  return r;
end;
$$;

comment on function public.pendencias_da_loja() is
  'VEL-c, VEL-e e TRF-e: numa ida só, as contagens das pendências da loja do turno (o sino e o Início). Cada contagem só para quem tem a permissão da fila (a regra de tem_permissao, numa conta só: privado.permissoes_vigentes), com o RLS de quem chama; sem a permissão, a chave não aparece. As transferências contam também a recebida com falta sem o destino do que faltou. Só lê.';

revoke all on function public.pendencias_da_loja() from public, anon;
grant execute on function public.pendencias_da_loja() to authenticated;
