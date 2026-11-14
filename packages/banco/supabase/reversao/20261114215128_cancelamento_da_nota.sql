-- Reversão de 20261114215128_cancelamento_da_nota: as duas funções, a mensagem antiga do gatilho da venda cancelada, os
-- tipos de evento e as colunas do cancelamento no fisco (os registros feitos se perdem: só em banco sem dados reais; os
-- eventos novos ficam, porque o histórico da nota não se apaga, e a restrição volta sem conferir as linhas antigas).
drop function if exists public.notas_corrigir_chave(uuid, text, text);
drop function if exists public.notas_registrar_cancelamento(uuid, text, text);

create or replace function privado.notas_da_venda_cancelada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos;
begin
  if old.situacao = 'concluida' and new.situacao = 'cancelada' then
    if exists (select 1 from public.notas_pedidos p where p.venda_id = old.id and p.situacao = 'emitida') then
      raise exception 'Venda com nota emitida: faça antes o cancelamento ou a devolução fiscal' using errcode = 'OR015';
    end if;
    for pedido in select * from public.notas_pedidos p where p.venda_id = old.id and p.situacao <> 'cancelada' for update loop
      update public.notas_pedidos p set situacao = 'cancelada', motivo_cancelamento = 'Venda cancelada', atualizado_em = now() where p.id = pedido.id;
      delete from privado.notas_destinatarios d where d.pedido_id = pedido.id;
      perform privado.nota_evento(pedido, 'cancelada', 'Venda cancelada');
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function privado.notas_da_venda_cancelada() from public, anon, authenticated;

alter table public.notas_eventos drop constraint notas_eventos_tipo_check;
alter table public.notas_eventos add constraint notas_eventos_tipo_check check (tipo in (
  'pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida', 'emitida_sem_aprovacao_previa', 'cancelada',
  'ajustada_por_devolucao')) not valid;

drop index if exists public.notas_pedidos_cancelada_no_fisco_por;
alter table public.notas_pedidos drop constraint if exists cancelada_no_fisco_coerente;
alter table public.notas_pedidos drop column if exists protocolo_cancelamento;
alter table public.notas_pedidos drop column if exists cancelada_no_fisco_por;
alter table public.notas_pedidos drop column if exists cancelada_no_fisco_em;
