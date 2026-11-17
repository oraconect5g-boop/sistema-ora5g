-- Reversão de 20261117200000_avisos_no_celular (lote PWA-b): tira as funções dos avisos, os gatilhos dos três pedidos, a
-- fila, as inscrições dos celulares e o segredo dos avisos. Os pedidos de desconto, nota e saída de caixa ficam como estão.
drop function public.avisos_resultado(text, jsonb);
drop function public.avisos_a_enviar(text, int);
drop function public.aviso_teste();
drop function public.aviso_minhas_inscricoes();
drop function public.aviso_cancelar(text);
drop function public.aviso_inscrever(text, text, text, text);
drop trigger caixa_saidas_aviso on public.caixa_saidas;
drop trigger notas_pedidos_aviso on public.notas_pedidos;
drop trigger aprovacoes_desconto_aviso on public.aprovacoes_desconto;
drop function privado.aviso_da_saida();
drop function privado.aviso_da_nota();
drop function privado.aviso_do_desconto();
drop function privado.enfileirar_aviso(uuid, uuid, text, uuid, uuid, text, text, text, text);
drop function privado.quem_recebe_aviso(uuid, text);
drop function privado.segredo_confere(text, text);
drop table privado.segredos_de_rotina;
drop table privado.avisos;
drop table privado.avisos_inscricoes;
