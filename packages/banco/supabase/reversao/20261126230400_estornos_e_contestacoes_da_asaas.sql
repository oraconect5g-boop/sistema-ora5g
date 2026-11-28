-- Reversão de 20261126230400_estornos_e_contestacoes_da_asaas (lote AUD-f, parte D): a reconsulta volta ao texto anterior,
-- inteira (20261124155208_pagamento_pelo_site), e saem as colunas da conciliação (o líquido, o estornado, a situação na Asaas e
-- a hora da reconsulta: a Asaas continua com tudo, e a próxima reconsulta não as grava).
create or replace function public.pagamento_consulta_aplicar(p_aviso text, p_consulta jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_aviso privado.pagamento_avisos;
  v_pg public.loja_pagamentos;
  v_situacao text := p_consulta ->> 'situacao';
  v_valor bigint;
  v_id text := p_consulta ->> 'id_no_provedor';
  v_ate timestamptz;
  v_fora boolean;
  v_resultado text;
  v_divergencia text;
begin
  if p_consulta is null or jsonb_typeof(p_consulta) <> 'object' or coalesce(v_situacao, '') not in ('pago', 'pendente', 'cancelado', 'estornado', 'desconhecida')
     or coalesce(jsonb_typeof(p_consulta -> 'valor_centavos'), '') <> 'number' or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
     or coalesce(p_consulta ->> 'link', '') !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end if;
  begin
    v_valor := (p_consulta ->> 'valor_centavos')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end;
  select * into v_aviso from privado.pagamento_avisos a where a.id = p_aviso for update;
  if not found then
    raise exception 'Aviso não encontrado' using errcode = 'P0002';
  end if;
  if v_aviso.processado_em is not null then
    return v_aviso.resultado;
  end if;
  select * into v_pg from public.loja_pagamentos pg where pg.link_id = p_consulta ->> 'link' for update;
  if not found or v_aviso.link_id is distinct from v_pg.link_id then
    v_resultado := 'link_desconhecido';
  elsif v_situacao = 'desconhecida' then
    v_resultado := 'situacao_desconhecida';
    v_divergencia := 'a Asaas respondeu uma situação que o sistema não conhece';
  elsif v_valor <> v_pg.valor_centavos then
    v_resultado := 'divergencia';
    v_divergencia := 'o valor pago é outro';
  elsif v_situacao = 'pago' then
    if v_pg.situacao = 'aguardando' then
      -- O dinheiro veio: o pagamento fica pago de qualquer jeito. O pedido só se estende se ainda estava valendo (reservado,
      -- dentro do prazo e com todas as reservas ativas); senão, o pago vira divergência para a loja resolver.
      select (p.situacao <> 'reservado' or p.expira_em <= now() or exists (
                select 1 from public.loja_reservas r join public.estoque_reservas er on er.id = r.estoque_reserva_id
                where r.pedido_id = p.id and (r.situacao <> 'ativa' or er.situacao <> 'ativa')))
      into v_fora from public.loja_pedidos p where p.id = v_pg.pedido_id;
      update public.loja_pagamentos pg
      set situacao = 'pago', pago_em = now(), id_no_provedor = v_id, atualizado_em = now()
      where pg.id = v_pg.id;
      if v_fora then
        v_divergencia := 'pago depois de o pedido vencer ou ser cancelado';
      else
        -- O pedido pago fica guardado para a retirada: o pedido, as reservas do site e as de estoque dele.
        v_ate := now() + (select c.guardar_pago_por from privado.pagamento_pelo_site c where c.provedor = 'asaas');
        update public.loja_pedidos p set expira_em = greatest(p.expira_em, v_ate) where p.id = v_pg.pedido_id;
        update public.estoque_reservas er set expira_em = greatest(er.expira_em, v_ate)
        from public.loja_reservas r
        where r.pedido_id = v_pg.pedido_id and r.situacao = 'ativa' and er.id = r.estoque_reserva_id and er.situacao = 'ativa';
        update public.loja_reservas r set expira_em = greatest(r.expira_em, v_ate)
        where r.pedido_id = v_pg.pedido_id and r.situacao = 'ativa';
      end if;
      v_resultado := 'confirmado';
    elsif v_pg.situacao in ('pago', 'estornado') then
      v_resultado := 'ja_registrado';
    else
      v_resultado := 'divergencia';
      v_divergencia := 'pago depois de o pagamento ser cancelado';
    end if;
  elsif v_situacao = 'estornado' then
    if v_pg.situacao = 'pago' then
      update public.loja_pagamentos pg set situacao = 'estornado', estornado_em = now(), atualizado_em = now() where pg.id = v_pg.id;
      v_resultado := 'estorno_registrado';
    elsif v_pg.situacao = 'estornado' then
      v_resultado := 'ja_registrado';
    else
      v_resultado := 'divergencia';
      v_divergencia := 'estorno sem pagamento';
    end if;
  else
    v_resultado := case v_situacao when 'pendente' then 'pendente' else 'ignorado' end;
  end if;
  if v_divergencia is not null then
    update public.loja_pagamentos pg set divergencia = v_divergencia, atualizado_em = now() where pg.id = v_pg.id;
  end if;
  update privado.pagamento_avisos a set processado_em = now(), resultado = v_resultado, reservado_ate = null where a.id = p_aviso;
  return v_resultado;
end;
$$;

alter table public.loja_pagamentos
  drop constraint loja_pagamento_estorno_no_valor,
  drop column conferido_em, drop column situacao_no_provedor, drop column estornado_centavos, drop column valor_liquido_centavos;
