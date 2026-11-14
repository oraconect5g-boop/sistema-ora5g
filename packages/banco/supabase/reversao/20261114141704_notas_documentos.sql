-- Reversão de 20261114141704_notas_documentos (só em banco sem dados reais).
-- Saem o registro dos documentos (com os arquivos registrados: guarde uma cópia antes, se houver), a função de
-- anexar, o protocolo da nota e as regras do bucket "notas" (o bucket fica, vazio, se tiver arquivos).
drop function if exists public.notas_anexar_documento(uuid, text, text, text, text);
drop table if exists public.notas_documentos;
drop function if exists privado.nota_documento_so_substituir();
alter table public.notas_pedidos drop column if exists protocolo;
drop policy if exists notas_documentos_ler on storage.objects;
drop policy if exists notas_documentos_enviar on storage.objects;
delete from storage.buckets b where b.id = 'notas' and not exists (select 1 from storage.objects o where o.bucket_id = 'notas');
