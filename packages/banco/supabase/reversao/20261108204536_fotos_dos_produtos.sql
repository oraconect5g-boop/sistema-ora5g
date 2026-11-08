-- Reversão de fotos_dos_produtos. SOMENTE em banco sem dados reais: apaga os registros das fotos,
-- as políticas do Storage e a permissão catalogo.fotos. No Supabase real, o bucket "produtos" e os
-- arquivos se apagam pelo painel do Storage (o Supabase recusa apagar direto pelas tabelas).
drop function if exists public.registrar_foto(uuid, uuid, text, int, int, boolean), public.pendencias_de_foto();
drop table if exists public.fotos_produto;
drop policy if exists produtos_fotos_ler on storage.objects;
drop policy if exists produtos_fotos_enviar on storage.objects;
drop function if exists privado.organizacoes_do_catalogo(), privado.organizacoes_que_enviam_fotos();
do $$
begin
  perform set_config('ora.motivo', 'Reversão de fotos_dos_produtos', true);
  delete from public.papel_permissoes where permissao = 'catalogo.fotos';
  delete from public.permissoes where codigo = 'catalogo.fotos';
  delete from storage.buckets b where b.id = 'produtos' and not exists (select 1 from storage.objects o where o.bucket_id = 'produtos');
end;
$$;
