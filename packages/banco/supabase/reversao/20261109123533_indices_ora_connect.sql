-- Reversão de indices_ora_connect.
drop index if exists public.connect_habilitacoes_alterado_por, public.connect_operacoes_unidade_organizacao,
  public.connect_producao_unidade_organizacao;
