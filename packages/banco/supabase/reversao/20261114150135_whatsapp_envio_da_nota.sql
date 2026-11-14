-- Reversão de 20261114150135_whatsapp_envio_da_nota (só em banco sem dados reais).
-- Saem a fila de envio da nota pelo WhatsApp, os destinos, o histórico e as funções (os pedidos de envio se perdem).
drop function if exists public.whatsapp_aviso_de_status(text, text, text);
drop function if exists public.whatsapp_worker_resultado(uuid, jsonb);
drop function if exists public.whatsapp_worker_reivindicar(int);
drop function if exists public.whatsapp_envio_resolver(uuid, text);
drop function if exists public.nota_enviar_whatsapp(uuid, text, text);
drop function if exists privado.whatsapp_evento(public.whatsapp_envios, text, text, text);
drop table if exists public.whatsapp_envio_eventos;
drop table if exists privado.whatsapp_destinos;
drop table if exists public.whatsapp_envios;
