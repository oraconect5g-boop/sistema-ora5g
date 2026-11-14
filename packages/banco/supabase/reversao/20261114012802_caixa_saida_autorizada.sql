-- Reversão de 20261114012802_caixa_saida_autorizada. ATENÇÃO: só em banco sem saída autorizada lançada.
-- Os movimentos "saida_autorizada" são só de inserção e entram no dinheiro esperado dos caixas: se houver
-- algum, a volta da restrição antiga falha de propósito (o livro do caixa não se reescreve).
drop function if exists public.caixa_cancelar_saida(uuid);
drop function if exists public.caixa_decidir_saida(uuid, boolean, text);
drop function if exists public.caixa_pedir_saida(bigint, text, text);
drop table if exists public.caixa_saidas;
alter table public.caixa_movimentos drop constraint caixa_sinal_do_tipo;
alter table public.caixa_movimentos add constraint caixa_sinal_do_tipo check (
  (tipo in ('fundo', 'suprimento', 'recebimento') and valor_centavos > 0)
  or (tipo in ('sangria', 'troco', 'estorno') and valor_centavos < 0));
alter table public.caixa_movimentos drop constraint caixa_movimentos_tipo_check;
alter table public.caixa_movimentos add constraint caixa_movimentos_tipo_check
  check (tipo in ('fundo', 'suprimento', 'sangria', 'recebimento', 'troco', 'estorno'));
