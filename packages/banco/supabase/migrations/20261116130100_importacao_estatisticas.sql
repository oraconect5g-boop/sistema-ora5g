-- =============================================================================
-- A importação de 2.000 linhas dentro do orçamento de 8 s por chamada (#95; lote INTEG-b; diagnóstico integral de
-- 16/11/2026; ORA-CAT-002)
--
-- Medido em 16/11 no teste do orçamento (src/concorrencia.test.ts, "2.000 linhas", PostgreSQL 17 do teste): a aplicação
-- de outras 2.000 linhas a criar, num catálogo que já tinha 2.000 produtos, levava 7,2 s (no CI do GitHub, 8,5 s, acima
-- do orçamento de 8 s). As tabelas recém-preenchidas não tinham estatística e as linhas da importação são gravadas na
-- mesma transação da prévia: o banco estimava mal e escolhia planos ruins. Duas medidas, juntas:
--   * privado.importacao_atualizar_estatisticas() (nova): ANALYZE das tabelas que a comparação e a aplicação leem (as
--     linhas da importação, produtos, variantes, categorias, marcas, preços e custos; a auditoria fica de fora: é grande
--     e é lida só pelo índice), chamada pela comparação refeita (privado.importacao_recomparar, a de
--     20261112163333_importador_correcoes.sql), pela qual a aplicação sempre passa, com tudo travado, antes de gravar;
--   * public.importacao_aplicar com enable_seqscan desligado durante a execução: com a estatística de uma tabela ainda
--     pequena, o banco preferia ler a tabela inteira a cada linha, e a tabela cresce durante a própria carga.
-- Resultado medido (duas rodadas): a primeira carga de 2.000 de 2,3 s para 1,0-1,1 s; a segunda de 7,2 s para 1,0-1,1 s;
-- a atualização de 2.000 de 1,4 s para 1,3 s; o desfazer de 2.000 atualizadas de 2,3 s para 1,8 s. O orçamento não muda,
-- e nada muda no resultado: a mesma idempotência, auditoria, validação e travas.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.importacao_atualizar_estatisticas()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  analyze public.importacao_linhas, public.produtos, public.variantes, public.categorias, public.marcas, public.precos, public.custos;
end;
$$;
revoke all on function privado.importacao_atualizar_estatisticas() from public, anon, authenticated;

create or replace function privado.importacao_recomparar(p_importacao uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organizacao uuid;
  v_mudadas int;
begin
  -- #95: as estatísticas das tabelas lidas aqui e na aplicação, antes de comparar (ver o cabeçalho).
  perform privado.importacao_atualizar_estatisticas();
  select i.organizacao_id into v_organizacao from public.importacoes i where i.id = p_importacao;
  if v_organizacao is null then
    return false;
  end if;
  with nova as (
    select l.numero, c.o_variante, c.o_diferencas, c.o_base, l.erros_arquivo || c.o_erros as erros,
           case when cardinality(l.erros_arquivo || c.o_erros) > 0 then 'erro' else c.o_acao end as acao
    from public.importacao_linhas l
    cross join lateral privado.importacao_comparar(v_organizacao, l.dados) c
    where l.importacao_id = p_importacao
  )
  update public.importacao_linhas l
  set acao = n.acao, erros = n.erros, diferencas = n.o_diferencas, variante_id = n.o_variante, base = n.o_base
  from nova n
  where l.importacao_id = p_importacao and l.numero = n.numero
    and (l.base is null or l.acao <> n.acao or l.erros <> n.erros or l.diferencas <> n.o_diferencas
         or l.variante_id is distinct from n.o_variante or l.base <> n.o_base);
  get diagnostics v_mudadas = row_count;
  if v_mudadas = 0 then
    return false;
  end if;
  perform set_config('ora.motivo', 'Comparação da prévia refeita: o cadastro mudou depois dela', true);
  update public.importacoes i
  set totais = privado.importacao_totais(p_importacao), comparacao = i.comparacao + 1, comparado_em = now()
  where i.id = p_importacao;
  return true;
end;
$$;

alter function public.importacao_aplicar(uuid, text, int) set enable_seqscan = off;
