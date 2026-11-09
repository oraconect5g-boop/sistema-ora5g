-- =============================================================================
-- Lote 3 do prompt consolidado (09/11/2026) — fotos dos produtos (revisão do Codex aebbdcc)
--   #42 (REV-040) registrar a mesma foto de novo devolve a mesma foto (antes: 23505).
--   Índice redundante: fotos_produto_produto_organizacao (produto_id, organizacao_id) repetia
--   fotos_organizacao (organizacao_id, produto_id), que já cobre a chave estrangeira composta, como
--   o Codex confirmou por EXPLAIN. Ele foi criado em 20261108233711 só para apagar o aviso 0001 do
--   advisor, o que o Codex pediu para não fazer. O aviso volta e fica aceito.
-- Função recriada a partir do texto aplicado, com as mudanças marcadas. Reversão em
-- supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

drop index public.fotos_produto_produto_organizacao;

create or replace function public.registrar_foto(
  p_produto uuid, p_variante uuid, p_caminho text, p_largura int, p_altura int, p_ilustracao boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  produto public.produtos;
  partes text[];
  meta jsonb;
  nova uuid;
  existente public.fotos_produto;
begin
  select * into produto from public.produtos p where p.id = p_produto;
  if not found or ator is null or produto.organizacao_id not in (select privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Sem permissão para enviar foto deste produto' using errcode = '42501';
  end if;
  if p_variante is not null and not exists (
       select 1 from public.variantes v where v.id = p_variante and v.produto_id = p_produto) then
    raise exception 'A variante não é deste produto' using errcode = '22023';
  end if;
  partes := string_to_array(coalesce(p_caminho, ''), '/');
  if p_caminho !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(produto|[0-9a-f-]{36})/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
     or partes[1] <> produto.organizacao_id::text or partes[2] <> p_produto::text
     or partes[3] <> coalesce(p_variante::text, 'produto') then
    raise exception 'Caminho da foto fora do padrão deste produto' using errcode = '22023';
  end if;
  -- Repetir o registro do mesmo arquivo (clique duplo, nova tentativa da tela) devolve a mesma foto
  -- (REV-040, #42). O mesmo arquivo em outro produto ou variação, já substituído ou com outra
  -- marcação de ilustração é recusado (OR004). Trava pelo caminho: duas tentativas ao mesmo tempo
  -- não criam duas fotos.
  perform pg_advisory_xact_lock(privado.trava_da_chave('fotos', produto.organizacao_id, p_caminho));
  select * into existente from public.fotos_produto f where f.caminho = p_caminho;
  if found then
    if existente.produto_id = p_produto and existente.variante_id is not distinct from p_variante
       and existente.substituida_em is null and existente.ilustracao = coalesce(p_ilustracao, false) then
      return existente.id;
    end if;
    raise exception 'Este arquivo já foi registrado de outro jeito: envie a foto de novo' using errcode = 'OR004';
  end if;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'produtos' and o.name = p_caminho;
  if meta is null then
    raise exception 'O arquivo não chegou ao Storage' using errcode = 'P0002';
  end if;
  if coalesce(p_ilustracao, false) and produto.tipo in ('aparelho', 'acessorio', 'chip') then
    raise exception 'Produto físico precisa de foto real, não de ilustração' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Foto do produto enviada', true);
  update public.fotos_produto f set substituida_em = now()
  where f.produto_id = p_produto and f.variante_id is not distinct from p_variante and f.substituida_em is null;
  insert into public.fotos_produto (organizacao_id, produto_id, variante_id, caminho, largura, altura, bytes, tipo, ilustracao, criado_por)
  values (produto.organizacao_id, p_produto, p_variante, p_caminho, p_largura, p_altura,
          (meta ->> 'size')::int, meta ->> 'mimetype', coalesce(p_ilustracao, false), ator)
  returning id into nova;
  return nova;
end;
$$;
