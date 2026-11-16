-- Reversão de 20261116130100_importacao_estatisticas (lote INTEG-b): a comparação refeita volta à de
-- 20261112163333_importador_correcoes.sql (sem atualizar as estatísticas) e a função nova sai.

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

alter function public.importacao_aplicar(uuid, text, int) reset enable_seqscan;
drop function if exists privado.importacao_atualizar_estatisticas();
