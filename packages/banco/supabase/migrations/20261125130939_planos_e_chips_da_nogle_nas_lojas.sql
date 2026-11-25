-- =============================================================================
-- Lote CONNECT-f (25/11/2026; ORA-CONNECT-001, ORA-CONNECT-003 e ORA-INV-011, que seguem parciais): a Ora Connect pronta
-- para operar nas lojas, como o proprietário decidiu em 25/11 ("Sim, ligue" a ativação, a recarga e a portabilidade, e
-- "Sim, pelo número" os chips no estoque).
-- (1) Os planos da Nogle viram os serviços vendáveis no caixa. Para cada plano ativo da lista oficial (connect_referencias,
--     tipo plano, carregada pelo worker), uma variação da "Recarga Ora Connect" (REC-<código do plano>) e uma da "Ativação
--     Ora Connect" (ATV-<código>), com o preço da rede, no canal loja, igual ao valor de face do plano (origem importacao). O
--     plano que sai da lista desativa as duas variações e encerra o preço. Antes, a recarga estava sem preço (o caixa recusa
--     o produto sem preço) e não havia serviço de ativação: a Connect não tinha o serviço pago que o SALDO exige.
-- (2) Os chips físicos que a Nogle mostra no PDV de cada loja entram no estoque da loja pelo ICCID, como "Chip Ora
--     Connect" (entrada_importacao, chave nogle:<iccid>): o vendedor vende o chip certo, e a ativação o aceita. O chip que
--     já está no estoque da Ora (em qualquer loja, vendido ou não) não entra de novo; o ICCID que não passa no dígito
--     verificador fica de fora e é contado. O CHIP ORA da Rein é por quantidade e está zerado nas lojas: não conta em dobro.
-- (3) As divergências, para o dono: o chip disponível no estoque de uma loja que não está no PDV dela na Nogle (vendido ou
--     ativado por fora, ou levado para outro PDV). Nada é apagado: a gerência confere.
-- As funções (1) e (2) são do worker (service_role), chamadas depois das listas (--listas) e de cada leitura do estoque.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function public.connect_worker_planos_no_caixa(p_organizacao uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recarga uuid;
  v_categoria uuid;
  v_ativacao uuid;
  v_plano record;
  v_prefixo text;
  v_variante uuid;
  v_preco public.precos;
  -- O relógio, não o início da transação: o preço encerrado agora termina depois de começar, mesmo se a mesma transação
  -- tiver gravado outro (o banco exige fim > início).
  v_agora timestamptz := clock_timestamp();
  v_criadas int := 0;
  v_precos int := 0;
  v_desativadas int := 0;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_planos_no_caixa', p_organizacao, 'planos'));
  -- O produto de cada serviço, pelo tipo (a rede tem um de cada; no ora5g-dev, a "Recarga Ora Connect").
  select p.id, p.categoria_id into v_recarga, v_categoria from public.produtos p
  where p.organizacao_id = p_organizacao and p.tipo = 'recarga' and p.ativo
  order by p.criado_em, p.id limit 1;
  if v_recarga is null then
    raise exception 'Não há produto de recarga ativo nesta rede' using errcode = 'P0002';
  end if;
  select p.id into v_ativacao from public.produtos p
  where p.organizacao_id = p_organizacao and p.tipo = 'ativacao' and p.ativo
  order by p.criado_em, p.id limit 1;
  if v_ativacao is null then
    perform set_config('ora.motivo', 'Ativação Ora Connect: o serviço vendável no caixa, pelos planos da Nogle (CONNECT-f)', true);
    insert into public.produtos (organizacao_id, tipo, nome, categoria_id, descricao, publicar_online)
    values (p_organizacao, 'ativacao', 'Ativação Ora Connect', v_categoria,
            'A ativação de uma linha Ora Connect no plano da Nogle, pelo valor de face do plano.', false)
    returning id into v_ativacao;
  end if;

  perform set_config('ora.motivo', 'Os planos da Nogle como serviços do caixa: o valor de face do plano (CONNECT-f)', true);
  for v_plano in
    select r.codigo, left(trim(r.nome), 120) as nome, r.valor_centavos from public.connect_referencias r
    where r.organizacao_id = p_organizacao and r.tipo = 'plano' and r.ativo and coalesce(r.valor_centavos, 0) > 0
    order by r.codigo
  loop
    foreach v_prefixo in array array['REC', 'ATV'] loop
      select v.id into v_variante from public.variantes v
      where v.organizacao_id = p_organizacao and v.sku = v_prefixo || '-' || v_plano.codigo;
      if v_variante is null then
        insert into public.variantes (organizacao_id, produto_id, sku, nome, ativa)
        values (p_organizacao, case v_prefixo when 'REC' then v_recarga else v_ativacao end, v_prefixo || '-' || v_plano.codigo,
                v_plano.nome, true)
        returning id into v_variante;
        v_criadas := v_criadas + 1;
      else
        update public.variantes v set nome = v_plano.nome, ativa = true
        where v.id = v_variante and (v.nome <> v_plano.nome or not v.ativa);
      end if;
      -- O preço da rede no caixa é o valor de face do plano: o vigente diferente é encerrado agora e um novo começa.
      select pr.* into v_preco from public.precos pr
      where pr.variante_id = v_variante and pr.unidade_id is null and pr.canal = 'loja' and pr.cancelado_em is null
        and pr.inicio <= v_agora and (pr.fim is null or pr.fim > v_agora)
      order by pr.inicio desc limit 1;
      if v_preco.id is null or v_preco.valor_centavos <> v_plano.valor_centavos then
        if v_preco.id is not null then
          update public.precos pr set fim = v_agora where pr.id = v_preco.id;
        end if;
        insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, motivo)
        values (p_organizacao, v_variante, null, 'loja', v_plano.valor_centavos, v_agora, 'importacao',
                format('Plano %s da Nogle (%s): o valor de face', v_plano.codigo, v_plano.nome));
        v_precos := v_precos + 1;
      end if;
      v_variante := null;
    end loop;
  end loop;

  -- O que não é mais plano ativo (inclusive a variação de antes, sem preço): desativado, com o preço encerrado.
  for v_variante in
    select v.id from public.variantes v
    where v.organizacao_id = p_organizacao and v.produto_id in (v_recarga, v_ativacao) and v.ativa
      and not exists (select 1 from public.connect_referencias r
                      where r.organizacao_id = p_organizacao and r.tipo = 'plano' and r.ativo and coalesce(r.valor_centavos, 0) > 0
                        and v.sku in ('REC-' || r.codigo, 'ATV-' || r.codigo))
  loop
    update public.variantes v set ativa = false where v.id = v_variante;
    update public.precos pr set fim = v_agora
    where pr.variante_id = v_variante and pr.cancelado_em is null and pr.inicio < v_agora and (pr.fim is null or pr.fim > v_agora);
    v_desativadas := v_desativadas + 1;
  end loop;
  return jsonb_build_object('criadas', v_criadas, 'precos', v_precos, 'desativadas', v_desativadas);
end;
$$;
revoke all on function public.connect_worker_planos_no_caixa(uuid) from public, anon, authenticated;
grant execute on function public.connect_worker_planos_no_caixa(uuid) to service_role;

create or replace function public.connect_worker_chips_no_estoque(p_organizacao uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_variante uuid;
  v_chip record;
  v_entraram int := 0;
  v_fora int := 0;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_chips_no_estoque', p_organizacao, 'chips'));
  -- O chip, pelo tipo (a rede tem um produto de chip; no ora5g-dev, o "Chip Ora Connect").
  select v.id into v_variante from public.variantes v join public.produtos p on p.id = v.produto_id
  where p.organizacao_id = p_organizacao and p.tipo = 'chip' and p.ativo and v.ativa
  order by p.criado_em, p.id, v.criado_em, v.id limit 1;
  if v_variante is null then
    raise exception 'Não há produto de chip ativo nesta rede' using errcode = 'P0002';
  end if;
  perform set_config('ora.motivo', 'O chip da Nogle no PDV da loja entra no estoque pelo ICCID (CONNECT-f)', true);
  for v_chip in
    select c.iccid, p.unidade_id from public.connect_chips_nogle c
    join public.connect_pdvs p on p.organizacao_id = c.organizacao_id and p.pdv_id = c.pdv_id
    where c.organizacao_id = p_organizacao and c.tipo = 'fisico' and p.unidade_id is not null and p.ativo
      and not exists (select 1 from public.itens_serializados i where i.organizacao_id = p_organizacao and i.iccid = c.iccid)
    order by c.iccid
  loop
    if not privado.iccid_valido(v_chip.iccid) then
      v_fora := v_fora + 1;
      continue;
    end if;
    perform privado.registrar_item_serializado(v_chip.unidade_id, v_variante, null, null, v_chip.iccid, 'entrada_importacao',
      'nogle:' || v_chip.iccid, null, 'novo', null);
    v_entraram := v_entraram + 1;
  end loop;
  return jsonb_build_object('entraram', v_entraram, 'fora_da_forma', v_fora,
    'divergentes', (select count(*) from privado.connect_chips_divergentes(p_organizacao)));
end;
$$;
revoke all on function public.connect_worker_chips_no_estoque(uuid) from public, anon, authenticated;
grant execute on function public.connect_worker_chips_no_estoque(uuid) to service_role;

-- As divergências de uma rede: o chip disponível no estoque de uma loja (lida na Nogle) que não está no PDV dela.
create or replace function privado.connect_chips_divergentes(p_organizacao uuid)
returns table (unidade_id uuid, iccid text, onde_na_nogle text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.unidade_id, i.iccid,
         case when c.iccid is null then 'fora dos PDVs e do estoque geral da Nogle'
              when c.pdv_id is null then 'no estoque geral da Ora na Nogle (sem PDV)'
              else format('no PDV %s da Nogle', c.pdv_id) end
  from public.itens_serializados i
  join public.variantes v on v.id = i.variante_id
  join public.produtos pr on pr.id = v.produto_id and pr.tipo = 'chip'
  join public.connect_pdvs p on p.organizacao_id = i.organizacao_id and p.unidade_id = i.unidade_id and p.estoque_lido_em is not null
  left join public.connect_chips_nogle c on c.organizacao_id = i.organizacao_id and c.iccid = i.iccid
  where i.organizacao_id = p_organizacao and i.iccid is not null and i.situacao = 'disponivel'
    and c.pdv_id is distinct from p.pdv_id;
$$;
revoke all on function privado.connect_chips_divergentes(uuid) from public, anon, authenticated;

-- A leitura das divergências para a tela: só quem gere a Ora Connect na rede (o dono).
create or replace function public.connect_chips_divergentes()
returns table (unidade_id uuid, iccid text, onde_na_nogle text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.* from privado.organizacoes_com_permissao('connect.gerir') o
  cross join lateral privado.connect_chips_divergentes(o) d
  order by d.unidade_id, d.iccid
  limit 500;
$$;
revoke all on function public.connect_chips_divergentes() from public, anon;
grant execute on function public.connect_chips_divergentes() to authenticated;
