-- =============================================================================
-- A loja online sem erro 500 para o visitante (lote ONLINE-c: ORA-ONLINE-001 e ORA-ONLINE-006, em parte; plano de
-- 16/11/2026, onda 0, item 2)
--
-- Medido na homologação em 17/11/2026: abrir /loja/<produto que não está no site> mostrava a página "não encontrada"
-- (certo), mas a ida ao banco respondia HTTP 500. O motivo: public.loja_produto levantava o erro P0002, e a camada que
-- atende o banco pela internet (PostgREST) responde 500 a todo erro da classe P0 que não seja o P0001. Qualquer robô
-- que percorra endereços do site gerava, assim, erros 500 no banco, sem que nada estivesse quebrado.
--
-- 1) public.loja_produto: produto fora do site (inexistente, não marcado, inativo, de outro tipo, de outra empresa ou
--    sem preço em loja nenhuma) agora devolve NULO, sem erro. A página trata o nulo como "não encontrada". O resto é o
--    texto de 20261115210812, sem mudança: a mesma assinatura, as mesmas regras e o mesmo retorno para o que está no
--    site.
-- 2) public.loja_reservar: as três recusas de "não está à venda na loja online" (o produto, a loja e o preço) trocam
--    o código P0002 pelo código próprio OR036, que a mesma camada responde com 400 (pedido recusado), como já faz com
--    OR001, OR004, OR034 e OR035. As mensagens e todo o resto são o texto de 20261116093359, sem mudança.
--
-- Nada muda em quem pode executar (o visitante e o usuário logado, como antes: "create or replace" mantém as
-- permissões já dadas), em tabela, em política ou em permissão. As duas definições anteriores foram conferidas contra
-- o banco de desenvolvimento (md5 do corpo) antes da cópia.
-- Reversão: supabase/reversao/<mesmo nome>.sql (devolve as duas definições anteriores).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- O detalhe: fora do site, nulo (antes, erro P0002)
-- -----------------------------------------------------------------------------
create or replace function public.loja_produto(p_organizacao uuid, p_produto uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_produto public.produtos;
begin
  select * into v_produto from public.produtos p
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio');
  if not found or not exists (select 1 from privado.ofertas_da_vitrine(p_organizacao, p_produto)) then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_produto.id, 'nome', v_produto.nome, 'modelo', v_produto.modelo, 'descricao', v_produto.descricao,
    'marca', (select m.nome from public.marcas m where m.id = v_produto.marca_id),
    'categoria', (select c.nome from public.categorias c where c.id = v_produto.categoria_id),
    'fotos', (
      select coalesce(jsonb_agg(jsonb_build_object('caminho', f.caminho, 'variante', f.variante_id, 'largura', f.largura, 'altura', f.altura)
               order by (f.variante_id is null) desc, f.criado_em, f.id), '[]'::jsonb)
      from public.fotos_produto f left join public.variantes v on v.id = f.variante_id
      where f.produto_id = v_produto.id and f.substituida_em is null and (f.variante_id is null or v.ativa)),
    'variantes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', v.id, 'nome', v.nome, 'cor', v.cor, 'capacidade', v.capacidade,
               'lojas', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', u.id, 'nome', u.nome, 'cidade', u.cidade, 'endereco', u.endereco, 'preco_centavos', o.preco_centavos,
                          'disponibilidade', case when o.disponivel = 0 then 'sem_estoque' when o.disponivel <= 2 then 'ultimas_unidades' else 'disponivel' end)
                          order by (o.disponivel > 0) desc, u.nome), '[]'::jsonb)
                 from privado.ofertas_da_vitrine(p_organizacao, v_produto.id) o join public.unidades u on u.id = o.unidade_id
                 where o.variante_id = v.id))
             order by v.nome, v.id), '[]'::jsonb)
      from public.variantes v
      where v.produto_id = v_produto.id and v.ativa
        and exists (select 1 from privado.ofertas_da_vitrine(p_organizacao, v_produto.id) o where o.variante_id = v.id)));
end;
$$;

-- -----------------------------------------------------------------------------
-- A reserva pelo visitante: "não está à venda na loja online" com o código OR036 (antes, P0002)
-- -----------------------------------------------------------------------------
create or replace function public.loja_reservar(
  p_organizacao uuid, p_variante uuid, p_unidade uuid, p_nome text, p_whatsapp text, p_chave text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_chave text := trim(coalesce(p_chave, ''));
  v_tipo text;
  v_preco bigint;
  v_existente public.loja_reservas;
  v_item uuid;
  v_estoque uuid;
  v_codigo text;
  v_reserva public.loja_reservas;
begin
  if length(v_whatsapp) = 13 and left(v_whatsapp, 2) = '55' then
    v_whatsapp := substr(v_whatsapp, 3);
  end if;
  select p.tipo into v_tipo
  from public.variantes v join public.produtos p on p.id = v.produto_id
  where v.id = p_variante and v.ativa and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo
    and p.tipo in ('aparelho', 'acessorio');
  if v_tipo is null then
    raise exception 'Produto não encontrado na loja online' using errcode = 'OR036';
  end if;
  if not exists (select 1 from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao
                   and u.tipo = 'loja_fisica' and u.status = 'ativa') then
    raise exception 'Loja não encontrada' using errcode = 'OR036';
  end if;
  v_preco := privado.preco_do_balcao(p_variante, p_unidade);
  if v_preco is null then
    raise exception 'Este produto não está à venda nesta loja' using errcode = 'OR036';
  end if;
  if length(v_nome) not between 2 and 80 then
    raise exception 'Informe o seu nome (de 2 a 80 letras)' using errcode = '22023';
  end if;
  if v_whatsapp !~ '^[1-9]{2}9[0-9]{8}$' then
    raise exception 'Informe um WhatsApp de celular com DDD (11 números)' using errcode = '22023';
  end if;
  if length(v_chave) not between 8 and 80 then
    raise exception 'Chave da reserva inválida' using errcode = '22023';
  end if;

  -- (0) A mesma chave devolve a mesma reserva; com outros dados, é recusada.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas', p_organizacao, v_chave));
  select * into v_existente from public.loja_reservas r where r.organizacao_id = p_organizacao and r.chave = v_chave;
  if found then
    if v_existente.variante_id <> p_variante or v_existente.unidade_id <> p_unidade or v_existente.nome <> v_nome
       or (select c.whatsapp from privado.loja_reservas_contato c where c.reserva_id = v_existente.id) is distinct from v_whatsapp then
      raise exception 'Esta reserva já foi feita com outros dados' using errcode = 'OR004';
    end if;
    return privado.reserva_do_site_em_json(v_existente);
  end if;

  -- (1) Os limites contra abuso: por WhatsApp (uma trava por número) e por loja.
  perform pg_advisory_xact_lock(privado.trava_da_chave('loja_reservas_whatsapp', p_organizacao, v_whatsapp));
  if (select count(*) from public.loja_reservas r join privado.loja_reservas_contato c on c.reserva_id = r.id
      where r.organizacao_id = p_organizacao and c.whatsapp = v_whatsapp and r.situacao = 'ativa' and r.expira_em > now()) >= 2 then
    raise exception 'Este WhatsApp já tem 2 reservas ativas: retire uma delas na loja ou espere vencer' using errcode = 'OR034';
  end if;
  if (select count(*) from public.loja_reservas r where r.unidade_id = p_unidade and r.criada_em > now() - interval '1 hour') >= 20 then
    raise exception 'Muitas reservas nesta loja agora: tente de novo daqui a pouco' using errcode = 'OR035';
  end if;

  -- (2) O estoque: as reservas vencidas desta loja e deste produto saem antes; depois, uma unidade fica segura.
  perform privado.expirar_reservas(p_unidade, p_variante);
  if v_tipo = 'aparelho' then
    select i.id into v_item from public.itens_serializados i
    where i.unidade_id = p_unidade and i.variante_id = p_variante and i.situacao = 'disponivel' and i.em_estoque
    order by i.criado_em, i.id
    limit 1
    for update skip locked;
    if v_item is null then
      raise exception 'Sem estoque nesta loja agora' using errcode = 'OR001';
    end if;
    update public.itens_serializados set situacao = 'reservado' where id = v_item;
  end if;
  update public.estoque_saldos s
  set reservado = s.reservado + 1, atualizado_em = now()
  where s.unidade_id = p_unidade and s.variante_id = p_variante and s.quantidade - s.reservado >= 1;
  if not found then
    raise exception 'Sem estoque nesta loja agora' using errcode = 'OR001';
  end if;
  insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, quantidade,
    origem, chave_idempotencia, expira_em, criado_por)
  values (p_organizacao, p_unidade, p_variante, v_item, 1, 'online', 'site:' || v_chave, now() + interval '24 hours', null)
  returning id into v_estoque;

  -- (3) A reserva do site, com um código que não se repete na empresa.
  loop
    v_codigo := privado.codigo_de_reserva();
    exit when not exists (select 1 from public.loja_reservas r where r.organizacao_id = p_organizacao and r.codigo = v_codigo);
  end loop;
  insert into public.loja_reservas (organizacao_id, unidade_id, variante_id, item_serializado_id, estoque_reserva_id, codigo,
    nome, whatsapp_mascarado, preco_centavos, expira_em, chave)
  values (p_organizacao, p_unidade, p_variante, v_item, v_estoque, v_codigo,
    v_nome, privado.mascara_telefone(v_whatsapp), v_preco, now() + interval '24 hours', v_chave)
  returning * into v_reserva;
  insert into privado.loja_reservas_contato (reserva_id, whatsapp) values (v_reserva.id, v_whatsapp);
  return privado.reserva_do_site_em_json(v_reserva);
end;
$$;
