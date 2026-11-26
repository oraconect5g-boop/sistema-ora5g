-- =============================================================================
-- Lote AUD-f (26/11/2026), parte C: as somas da produção da Ora Connect por vendedor e por loja, feitas no banco (item 3 da
-- auditoria de e7f55b2). NÃO aplicada no banco do servidor: vai para revisão (PR) antes; o número final sai na aplicação.
--
-- O relatório, a carteira e a Operações do dia somavam no site só as operações que cabiam numa leitura (a API devolve até
-- 1.000 linhas por vez; a tela pedia 500 ou 2.000): com mais operações no período, o total saía parcial, como se fosse
-- completo. Esta função soma no banco, por vendedor e loja, com as MESMAS regras de leitura de connect_operacoes (security
-- invoker: quem só opera soma as próprias; quem gere, as das lojas que gere). As categorias são as do relatório: confirmadas
-- por tipo; em andamento (registrada, enviando, aguardando a operadora); sem resultado (resultado desconhecido, erro na
-- operadora); não feitas (recusada, negada, não recebida, cancelada); o valor de face das ativações e recargas confirmadas
-- (não é receita da Ora) e o que a loja recebeu no caixa pelas confirmadas.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create function public.connect_somas_por(p_inicio timestamptz, p_fim timestamptz, p_unidade uuid default null, p_vendedor uuid default null)
returns table (
  vendedor_id uuid, unidade_id uuid, operacoes bigint, ativacoes bigint, recargas bigint, portabilidades bigint, em_andamento bigint,
  sem_resultado bigint, nao_feitas bigint, valor_de_face_centavos bigint, recebido_centavos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.vendedor_id, o.unidade_id, count(*),
         count(*) filter (where o.situacao = 'confirmada' and o.tipo = 'ativacao'),
         count(*) filter (where o.situacao = 'confirmada' and o.tipo = 'recarga'),
         count(*) filter (where o.situacao = 'confirmada' and o.tipo = 'portabilidade'),
         count(*) filter (where o.situacao in ('registrada', 'enviando', 'aguardando_operadora')),
         count(*) filter (where o.situacao in ('resultado_desconhecido', 'erro_operadora')),
         count(*) filter (where o.situacao in ('recusada', 'negada', 'nao_recebida', 'cancelada')),
         coalesce(sum(o.valor_face_centavos) filter (where o.situacao = 'confirmada' and o.tipo <> 'portabilidade'), 0)::bigint,
         coalesce(sum(o.recebido_na_loja_centavos) filter (where o.situacao = 'confirmada'), 0)::bigint
  from public.connect_operacoes o
  where o.criado_em >= p_inicio and o.criado_em <= p_fim
    and (p_unidade is null or o.unidade_id = p_unidade)
    and (p_vendedor is null or o.vendedor_id = p_vendedor)
  group by o.vendedor_id, o.unidade_id
$$;
comment on function public.connect_somas_por(timestamptz, timestamptz, uuid, uuid) is
  'AUD-f: as somas da produção da Ora Connect por vendedor e loja no período, com as regras de leitura de connect_operacoes (security invoker).';
revoke all on function public.connect_somas_por(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.connect_somas_por(timestamptz, timestamptz, uuid, uuid) to authenticated;
