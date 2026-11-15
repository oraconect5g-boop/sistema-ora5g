-- Reversão de 20261115110000_limpeza_das_fotos (lote CAT-011b): as duas funções, a política de apagar no Storage e a
-- conferência do registro. Os arquivos já apagados não voltam (eram arquivos sem registro); os registros da auditoria
-- ficam.
drop function if exists public.fotos_sem_registro_limpar(text[]);
drop function if exists public.fotos_sem_registro();
drop policy if exists produtos_fotos_limpar on storage.objects;
drop function if exists privado.foto_registrada(text);
