-- Reversão de 20261119134800_permissoes_numa_conta (lote VEL-e): devolve o molde da sessão e as pendências da loja às
-- definições de antes (uma pergunta à tem_permissao por permissão) e tira privado.permissoes_vigentes. Nada se perde:
-- são só leituras.
create or replace function public.molde_da_sessao(
  p_permissoes_da_loja text[],
  p_permissoes_da_rede text[] default '{}'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_eu constant uuid := (select auth.uid());
  v_situacao jsonb;
  v_unidade uuid;
  v_permissoes jsonb;
  v_nome text;
  v_vinculos jsonb;
  v_aprovacoes bigint := 0;
  v_notas bigint := 0;
begin
  if coalesce(cardinality(p_permissoes_da_loja), 0) + coalesce(cardinality(p_permissoes_da_rede), 0) > 80 then
    raise exception 'Permissões demais numa leitura só: no máximo 80' using errcode = '22023';
  end if;

  -- A decisão da sessão é a de sempre: situacao_da_sessao devolve exatamente uma linha.
  select to_jsonb(s) into v_situacao from public.situacao_da_sessao() s;
  v_unidade := (v_situacao ->> 'unidade_id')::uuid;

  -- Cada permissão pela mesma função das telas e das ações. Sessão bloqueada, fora do turno,
  -- encerrada ou com segundo fator pendente: tem_permissao nega todas, e a lista sai vazia.
  select coalesce(jsonb_agg(x.permissao order by x.permissao), '[]'::jsonb)
  into v_permissoes
  from (
    select l.permissao
    from unnest(coalesce(p_permissoes_da_loja, '{}'::text[])) as l(permissao)
    where public.tem_permissao(l.permissao, v_unidade)
    union
    select r.permissao
    from unnest(coalesce(p_permissoes_da_rede, '{}'::text[])) as r(permissao)
    where public.tem_permissao(r.permissao)
  ) x;

  select p.nome into v_nome from public.perfis_usuario p where p.id = v_eu;

  select coalesce(
    jsonb_agg(jsonb_build_object('papel', v.papel, 'escopo', v.escopo, 'unidade_id', v.unidade_id) order by v.criado_em, v.id),
    '[]'::jsonb)
  into v_vinculos
  from public.vinculos v
  where v.usuario_id = v_eu and v.fim is null;

  -- As duas filas do menu, só para quem pode atender cada uma (como o molde já fazia).
  if v_unidade is not null and public.tem_permissao('desconto.aprovar', v_unidade) then
    select count(*) into v_aprovacoes
    from public.aprovacoes_desconto a
    where a.unidade_id = v_unidade and a.situacao = 'pendente';
  end if;
  if v_unidade is not null and public.tem_permissao('nota.aprovar', v_unidade) then
    select count(*) into v_notas
    from public.notas_pedidos n
    where n.unidade_id = v_unidade and n.situacao in ('aguardando_aprovacao', 'aprovada');
  end if;

  return jsonb_build_object(
    'situacao', v_situacao,
    'permissoes', v_permissoes,
    'nome', v_nome,
    'vinculos', v_vinculos,
    'pendencias', jsonb_build_object('aprovacoes', v_aprovacoes, 'notas', v_notas)
  );
end;
$$;
comment on function public.molde_da_sessao(text[], text[]) is
  'VEL-a: numa ida só, a situação da sessão (situacao_da_sessao), as permissões pedidas (cada uma por tem_permissao), o nome, os vínculos e as contagens do menu. Só lê; não decide permissão por conta própria.';

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

drop function if exists privado.permissoes_vigentes(text[], uuid);
