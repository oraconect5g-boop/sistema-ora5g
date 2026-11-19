-- =============================================================================
-- Lote VEL-e (ORA-QUAL-010; a orientação do proprietário de 18/11/2026: "medir antes/depois em celular autenticado; não
-- remover RLS ou cachear permissões entre usuários"): as permissões da sessão numa conta só. Decisão: ADR-010, "O que
-- veio no VEL-e".
--
-- O que a medida com login de 19/11 mostrou (seção 4.9 de docs/operacao/DESEMPENHO_NO_CELULAR.md): toda tela com login
-- começa pelo molde da sessão (public.molde_da_sessao), e cada ida a ele levava de 0,26 a 0,77 s (mediana de 0,53 s em 310
-- idas do log de tempos), contra cerca de 0,17 s de uma leitura simples. No banco, com a sessão do vendedor de teste, o
-- molde levava 0,19 s, dos quais 0,155 s eram as 42 perguntas de permissão da loja, uma a uma: cada public.tem_permissao
-- confere a sessão inteira de novo (a pessoa ativa, o turno, o segundo fator, os vínculos e a loja do turno).
--
--   * privado.permissoes_vigentes(p_permissoes, p_unidade): quais das permissões pedidas a sessão tem, pela MESMA regra de
--     public.tem_permissao (o mesmo texto, aplicado a um conjunto), com os vínculos vigentes e a loja do turno lidos uma
--     vez só. Uma permissão está na resposta se, e só se, tem_permissao(ela, p_unidade) é verdadeiro. SECURITY DEFINER,
--     como tem_permissao, para ler as mesmas tabelas do mesmo jeito; não fica aberta para quem não entrou.
--   * public.molde_da_sessao: as permissões da loja e as da rede, e as duas filas do menu, por ela (eram 47 perguntas).
--     O resto do texto não muda.
--   * public.pendencias_da_loja (o sino e o Início): as 11 perguntas viram 1. O resto do texto não muda.
-- Nenhuma permissão nova, nenhum papel muda, nada guardado entre chamadas nem entre pessoas, o RLS de sempre. As ações e
-- as telas continuam perguntando à tem_permissao, que não muda.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.permissoes_vigentes(p_permissoes text[], p_unidade uuid default null)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pp.permissao
  from privado.vinculos_vigentes() v
  join public.papel_permissoes pp on pp.papel = v.papel and pp.permissao = any (p_permissoes)
  where (
    v.escopo = 'organizacao'
    and (p_unidade is null
         or exists (select 1 from public.unidades u
                    where u.id = p_unidade and u.organizacao_id = v.organizacao_id))
  ) or (
    v.escopo = 'unidade'
    and v.unidade_id = (select public.unidade_atual())
    and (p_unidade is null or p_unidade = v.unidade_id)
  );
$$;
comment on function privado.permissoes_vigentes(text[], uuid) is
  'VEL-e: quais das permissões pedidas a sessão tem, pela mesma regra de public.tem_permissao, com os vínculos vigentes e a loja do turno lidos uma vez. Só lê.';
revoke all on function privado.permissoes_vigentes(text[], uuid) from public, anon;
grant execute on function privado.permissoes_vigentes(text[], uuid) to authenticated;

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
  v_filas text[] := '{}';
begin
  if coalesce(cardinality(p_permissoes_da_loja), 0) + coalesce(cardinality(p_permissoes_da_rede), 0) > 80 then
    raise exception 'Permissões demais numa leitura só: no máximo 80' using errcode = '22023';
  end if;

  -- A decisão da sessão é a de sempre: situacao_da_sessao devolve exatamente uma linha.
  select to_jsonb(s) into v_situacao from public.situacao_da_sessao() s;
  v_unidade := (v_situacao ->> 'unidade_id')::uuid;

  -- VEL-e: as permissões pela MESMA regra de tem_permissao, numa conta só (privado.permissoes_vigentes): as da
  -- loja com a loja do turno (ou nula, quando ainda não há loja escolhida, como já era), as da rede sem loja.
  -- Sessão bloqueada, fora do turno, encerrada ou com segundo fator pendente: não há vínculo vigente, e a lista
  -- sai vazia, como antes.
  select coalesce(jsonb_agg(x.permissao order by x.permissao), '[]'::jsonb)
  into v_permissoes
  from (
    select l.permissao
    from privado.permissoes_vigentes(coalesce(p_permissoes_da_loja, '{}'::text[]), v_unidade) as l(permissao)
    union
    select r.permissao
    from privado.permissoes_vigentes(coalesce(p_permissoes_da_rede, '{}'::text[])) as r(permissao)
  ) x;

  select p.nome into v_nome from public.perfis_usuario p where p.id = v_eu;

  select coalesce(
    jsonb_agg(jsonb_build_object('papel', v.papel, 'escopo', v.escopo, 'unidade_id', v.unidade_id) order by v.criado_em, v.id),
    '[]'::jsonb)
  into v_vinculos
  from public.vinculos v
  where v.usuario_id = v_eu and v.fim is null;

  -- As duas filas do menu, só para quem pode atender cada uma (como o molde já fazia), pela mesma regra.
  if v_unidade is not null then
    select coalesce(array_agg(f.permissao), '{}'::text[]) into v_filas
    from privado.permissoes_vigentes(array['desconto.aprovar', 'nota.aprovar'], v_unidade) as f(permissao);
  end if;
  if 'desconto.aprovar' = any (v_filas) then
    select count(*) into v_aprovacoes
    from public.aprovacoes_desconto a
    where a.unidade_id = v_unidade and a.situacao = 'pendente';
  end if;
  if 'nota.aprovar' = any (v_filas) then
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
  'VEL-a e VEL-e: numa ida só, a situação da sessão (situacao_da_sessao), as permissões pedidas (pela regra de tem_permissao, numa conta só: privado.permissoes_vigentes), o nome, os vínculos e as contagens do menu. Só lê; não decide permissão por conta própria.';

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
       where (t.origem_id = v_unidade and t.situacao in ('solicitada', 'separada')) or (t.destino_id = v_unidade and t.situacao = 'enviada')));
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
  'VEL-c e VEL-e: numa ida só, as contagens das pendências da loja do turno (o sino e o Início). Cada contagem só para quem tem a permissão da fila (a regra de tem_permissao, numa conta só: privado.permissoes_vigentes), com o RLS de quem chama; sem a permissão, a chave não aparece. Só lê.';
