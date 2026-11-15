-- Reversão de 20261115102440_documentos_da_conta (antes 20261115080000; só em banco sem dados reais): apaga o registro dos documentos e as
-- políticas do bucket "contas". Os arquivos no Storage NÃO são apagados por aqui (o bucket fica, sem acesso pela API):
-- apagar documento financeiro é a decisão pendente D-045 (com o contador e o jurídico), fora de uma reversão.
drop function if exists public.conta_pagar_retirar_anexo(uuid, text);
drop function if exists public.conta_pagar_anexar(uuid, text, text, text, text);
drop table if exists public.conta_pagar_anexos;
drop function if exists privado.conta_anexo_so_retirada();
drop policy if exists conta_anexos_enviar on storage.objects;
drop policy if exists conta_anexos_ler on storage.objects;
