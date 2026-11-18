-- Reversão de 20261118151653_conciliacao_da_nogle (lote CONNECT-c): tira a função do worker e as três tabelas da
-- conciliação. As operações da Ora Connect ficam como estão (nada nelas é mudado pela conciliação).
drop function public.connect_worker_registrar_conciliacao(uuid, text, date, date, jsonb);
drop table public.connect_conciliacao_so_aqui;
drop table public.connect_conciliacao_linhas;
drop table public.connect_conciliacoes;
