-- Reversão de 20261117145723_saude_do_banco_e_vendas_sem_nota (lote SAUDE-a): tira as duas funções. Nada de dado muda.
drop function public.saude_do_banco(text);
drop function public.notas_vendas_sem_pedido();
