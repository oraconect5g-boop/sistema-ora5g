-- Reversão de 20261115220000_loja_online_vitrine (lote ONLINE-a): a vitrine sai, o visitante volta a não alcançar nada
-- no banco (nem o esquema privado) e as fotos voltam a ser só da equipe.
drop policy if exists produtos_fotos_vitrine on storage.objects;
drop function if exists public.loja_produto(uuid, uuid);
drop function if exists public.loja_vitrine(uuid, text, uuid);
drop function if exists privado.foto_na_vitrine(text);
drop function if exists privado.foto_principal_da_vitrine(uuid);
drop function if exists privado.ofertas_da_vitrine(uuid, uuid);
drop function if exists privado.preco_do_balcao(uuid, uuid);
revoke usage on schema privado from anon;
