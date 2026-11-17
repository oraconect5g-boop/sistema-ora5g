-- Reversão de 20261117225818_extratos_e_conciliacao (lote EXT-a): tira as funções dos extratos, o gatilho que devolve a
-- linha, as linhas e os extratos. As conciliações já feitas nos pagamentos ficam (são as de sempre, do L7a); só a ligação
-- com a linha do extrato some.
drop trigger venda_pagamentos_extrato_de_volta on public.venda_pagamentos;
drop function privado.extrato_linha_de_volta();
drop function public.extrato_resumo(uuid);
drop function public.extrato_desfazer(uuid, text);
drop function public.extrato_ignorar(uuid, text);
drop function public.extrato_conciliar_certas(uuid);
drop function public.extrato_conciliar(uuid, uuid);
drop function public.extrato_sugestoes(uuid);
drop function public.extratos_recentes(int);
drop function public.extrato_importar(uuid, text, text, text[], text, text, jsonb, jsonb);
drop table public.extrato_linhas;
drop table public.extratos;
drop function privado.extrato_e_meu(uuid, uuid);
