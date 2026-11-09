-- Reversão de 20261109191416_fotos_idempotentes_lote3.sql.
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

create index fotos_produto_produto_organizacao on public.fotos_produto (produto_id, organizacao_id);
