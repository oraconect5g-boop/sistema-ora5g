-- Reversão de 20261114205327_anexos_da_venda (só em banco sem dados reais): apaga o registro dos documentos e as
-- políticas do bucket "anexos". Os arquivos no Storage NÃO são apagados por aqui (o bucket fica, sem acesso pela API):
-- apagar documento de cliente é decisão do proprietário (D-026), fora de uma reversão.
drop function if exists public.venda_retirar_anexo(uuid, text);
drop function if exists public.venda_anexar_documento(uuid, text, text, text, text);
drop table if exists public.venda_anexos;
drop function if exists privado.venda_anexo_so_retirada();
drop policy if exists venda_anexos_enviar on storage.objects;
drop policy if exists venda_anexos_ler on storage.objects;
