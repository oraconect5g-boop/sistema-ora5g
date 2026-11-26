-- =============================================================================
-- Lote AUD-f (26/11/2026), parte D: a Asaas no pagamento pelo site (item 4 da auditoria de e7f55b2). NÃO aplicada no banco do
-- servidor: vai para revisão (PR) antes; o número final sai na aplicação.
--
-- - Cada situação da Asaas que não é pago, pendente, cancelado nem estornado vira divergência com o seu motivo: o estorno
--   parcial (antes passava como pago), o estorno pedido ou em andamento, a contestação (chargeback), o recebido em dinheiro e a
--   negativação. O pagamento não muda sozinho em nenhum deles: a loja confere.
-- - A conciliação de cada pagamento: o bruto (valor_centavos), o líquido (o que a Asaas deposita, depois da taxa), o estornado,
--   a situação na Asaas e a hora da última reconsulta; a taxa é o bruto menos o líquido. Nada muda no titular nem no split.
-- A reconsulta refeita a partir do texto em vigor (20261124155208_pagamento_pelo_site, conferido pelo md5 do corpo no ora5g-dev
-- em 26/11), só com estas mudanças. Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.loja_pagamentos
  add column valor_liquido_centavos bigint check (valor_liquido_centavos is null or valor_liquido_centavos >= 0),
  add column estornado_centavos bigint not null default 0 check (estornado_centavos >= 0),
  add column situacao_no_provedor text check (situacao_no_provedor is null or situacao_no_provedor ~ '^[A-Z_]{1,40}$'),
  add column conferido_em timestamptz,
  add constraint loja_pagamento_estorno_no_valor check (estornado_centavos <= valor_centavos);
comment on column public.loja_pagamentos.valor_liquido_centavos is 'AUD-f: o líquido que a Asaas informa (netValue): o bruto menos a taxa dela.';
comment on column public.loja_pagamentos.estornado_centavos is 'AUD-f: a soma dos estornos feitos que a Asaas informa (refunds concluídos).';
comment on column public.loja_pagamentos.situacao_no_provedor is 'AUD-f: a situação do pagamento na Asaas na última reconsulta (status).';
comment on column public.loja_pagamentos.conferido_em is 'AUD-f: a hora da última reconsulta do pagamento na Asaas.';

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
  -- AUD-f: o motivo da situação que não é pago nem pendente, e a conciliação (o líquido, o estornado, a situação na Asaas).
  v_motivo text := nullif(p_consulta ->> 'motivo', '');
  v_status text := nullif(p_consulta ->> 'status', '');
  v_liquido bigint;
  v_estornado bigint;
begin
  if p_consulta is null or jsonb_typeof(p_consulta) <> 'object' or coalesce(v_situacao, '') not in ('pago', 'pendente', 'cancelado', 'estornado', 'desconhecida')
     or coalesce(jsonb_typeof(p_consulta -> 'valor_centavos'), '') <> 'number' or coalesce(v_id, '') !~ '^[A-Za-z0-9_-]{1,80}$'
     or coalesce(p_consulta ->> 'link', '') !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end if;
  begin
    v_valor := (p_consulta ->> 'valor_centavos')::bigint;
    v_liquido := case when p_consulta ? 'liquido_centavos' then (p_consulta ->> 'liquido_centavos')::bigint end;
    v_estornado := case when p_consulta ? 'estornado_centavos' then (p_consulta ->> 'estornado_centavos')::bigint end;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end;
  if (v_motivo is not null and v_motivo not in ('estorno_parcial', 'estorno_em_andamento', 'contestacao', 'recebido_em_dinheiro', 'negativacao'))
     or (v_status is not null and v_status !~ '^[A-Z_]{1,40}$')
     or (p_consulta ? 'liquido_centavos' and (jsonb_typeof(p_consulta -> 'liquido_centavos') <> 'number' or v_liquido < 0))
     or (p_consulta ? 'estornado_centavos' and (jsonb_typeof(p_consulta -> 'estornado_centavos') <> 'number' or v_estornado < 0 or v_estornado > v_valor)) then
    raise exception 'Reconsulta inválida' using errcode = '22023';
  end if;
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
    -- AUD-f: cada caso com o seu motivo (o estorno parcial passava como pago; os outros, como situação desconhecida).
    v_divergencia := case v_motivo
      when 'estorno_parcial' then 'estorno parcial na Asaas: confira o valor devolvido e o pedido'
      when 'estorno_em_andamento' then 'estorno pedido ou em andamento na Asaas: o pagamento só muda quando ele terminar'
      when 'contestacao' then 'contestação (chargeback) aberta na Asaas: não entregue nem cancele sem conferir'
      when 'recebido_em_dinheiro' then 'a Asaas marcou o pagamento como recebido em dinheiro: confira'
      when 'negativacao' then 'cobrança em negativação na Asaas: confira'
      else 'a Asaas respondeu uma situação que o sistema não conhece' end;
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
  -- AUD-f: a conciliação do pagamento (o que a Asaas disse nesta reconsulta), só do pagamento deste link.
  if v_resultado <> 'link_desconhecido' then
    update public.loja_pagamentos pg
    set valor_liquido_centavos = coalesce(v_liquido, pg.valor_liquido_centavos), estornado_centavos = coalesce(v_estornado, pg.estornado_centavos),
        situacao_no_provedor = coalesce(v_status, pg.situacao_no_provedor), conferido_em = now()
    where pg.id = v_pg.id;
  end if;
  update privado.pagamento_avisos a set processado_em = now(), resultado = v_resultado, reservado_ate = null where a.id = p_aviso;
  return v_resultado;
end;
$$;
