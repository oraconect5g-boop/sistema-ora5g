-- =============================================================================
-- Lote ORG-a (plano do proprietário de 16/11, Onda 1, item 2; ORA-ORG-001): o cadastro operacional da loja, separado da
-- liberação fiscal.
--
-- Até aqui a loja física só existia com o CNPJ da filial (a restrição loja_fisica_exige_cnpj, de 07/11, e as funções do
-- cadastro de lojas, L2). O plano manda cadastrar as 11 lojas e o local DEFEITOS sem CNPJ nem endereço inventado. Agora:
--   * a loja física pode existir sem o CNPJ: tem estoque, recebe e manda transferências, entra no inventário e na escolha
--     de loja (o cadastro operacional);
--   * vender pede a liberação fiscal, que é o CNPJ da filial no cadastro: a venda e a reserva de venda (do PDV e do site)
--     numa loja física sem CNPJ são recusadas com OR038, como o local de exceção não vende (ADR-007); a vitrine do site
--     não oferece a loja sem CNPJ (privado.ofertas_da_vitrine);
--   * loja_criar aceita a loja física sem CNPJ; loja_atualizar aceita o CNPJ informado depois e não deixa apagar o de uma
--     loja que já o tem (as vendas e as notas dela dependem dele).
-- As três funções são cópias das definições em vigor (md5 do corpo conferido no ora5g-dev antes), com só a mudança acima.
-- Códigos: OR038 a loja ainda não está liberada para vender (falta o CNPJ da filial).
-- Reversão: supabase/reversao/<mesmo nome>.sql (só com todas as lojas físicas com CNPJ: a restrição volta).
-- =============================================================================

alter table public.unidades drop constraint loja_fisica_exige_cnpj;

-- A venda e a reserva de venda pedem a loja liberada (o CNPJ da filial).
create or replace function privado.loja_liberada_para_vender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_table_name = 'vendas' or to_jsonb(new) ->> 'origem' in ('pdv', 'online'))
     and exists (select 1 from public.unidades u where u.id = new.unidade_id and u.tipo = 'loja_fisica' and u.cnpj is null) then
    raise exception 'Esta loja ainda não está liberada para vender: falta o CNPJ da filial no cadastro da loja' using errcode = 'OR038';
  end if;
  return new;
end;
$$;
revoke all on function privado.loja_liberada_para_vender() from public, anon, authenticated;
create trigger vendas_loja_liberada before insert on public.vendas
  for each row execute function privado.loja_liberada_para_vender();
create trigger reservas_loja_liberada before insert on public.estoque_reservas
  for each row execute function privado.loja_liberada_para_vender();

-- A vitrine do site só oferece a loja liberada para vender.
create or replace function privado.ofertas_da_vitrine(p_organizacao uuid, p_produto uuid)
returns table (variante_id uuid, unidade_id uuid, preco_centavos bigint, disponivel int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, u.id, privado.preco_do_balcao(v.id, u.id),
         greatest(coalesce(s.quantidade - s.reservado, 0) + coalesce((
           select sum(r.quantidade)::int from public.estoque_reservas r
           where r.unidade_id = u.id and r.variante_id = v.id and r.situacao = 'ativa' and r.expira_em <= now()), 0), 0)
  from public.produtos p
  join public.variantes v on v.produto_id = p.id and v.ativa
  join public.unidades u on u.organizacao_id = p.organizacao_id and u.tipo = 'loja_fisica' and u.status = 'ativa'
    and u.cnpj is not null
  left join public.estoque_saldos s on s.unidade_id = u.id and s.variante_id = v.id
  where p.id = p_produto and p.organizacao_id = p_organizacao and p.publicar_online and p.ativo and p.tipo in ('aparelho', 'acessorio')
    and privado.preco_do_balcao(v.id, u.id) is not null;
$$;

-- A loja física sem o CNPJ entra pelo cadastro operacional.
create or replace function public.loja_criar(
  p_empresa uuid, p_codigo text, p_nome text, p_tipo text, p_cnpj text, p_uf text, p_cidade text, p_emissora uuid, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organizacao uuid;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_codigo text := lower(trim(coalesce(p_codigo, '')));
  v_nome text := trim(coalesce(p_nome, ''));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_uf text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_cidade text := nullif(trim(coalesce(p_cidade, '')), '');
  v_existente public.unidades;
  v_nova uuid;
begin
  select e.organizacao_id into v_organizacao from public.empresas e where e.id = p_empresa;
  if v_organizacao is null or not privado.gere_lojas_da_organizacao(v_organizacao) then
    raise exception 'Sem permissão para cadastrar lojas nesta empresa' using errcode = '42501';
  end if;
  if v_codigo !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'Código inválido: use letras minúsculas, números e hífen (2 a 40)' using errcode = '22023';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 80 then
    raise exception 'Informe o nome da loja (até 80 letras)' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('loja_fisica', 'online', 'assistencia', 'deposito', 'excecao') then
    raise exception 'Tipo de loja inválido' using errcode = '22023';
  end if;
  if p_tipo = 'online' and v_cnpj is null and p_emissora is null then
    raise exception 'Loja online precisa de CNPJ próprio ou de uma loja que emita as notas por ela' using errcode = '22023';
  end if;
  if v_cnpj is not null and not privado.cnpj_valido(v_cnpj) then
    raise exception 'CNPJ inválido' using errcode = '22023';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida' using errcode = '22023';
  end if;
  if length(coalesce(v_cidade, '')) > 80 then
    raise exception 'Cidade muito longa (até 80 letras)' using errcode = '22023';
  end if;

  -- Duas criações iguais ao mesmo tempo: a segunda espera a primeira e devolve a mesma loja.
  perform pg_advisory_xact_lock(privado.trava_da_chave('unidades', v_organizacao, v_codigo));
  select * into v_existente from public.unidades u where u.organizacao_id = v_organizacao and u.codigo = v_codigo;
  if found then
    if v_existente.nome = v_nome and v_existente.tipo = p_tipo and v_existente.cnpj is not distinct from v_cnpj
       and v_existente.empresa_id = p_empresa then
      return jsonb_build_object('id', v_existente.id, 'repetida', true);
    end if;
    raise exception 'Já existe uma loja com o código %', v_codigo using errcode = '23505';
  end if;
  if v_cnpj is not null and exists (select 1 from public.unidades u where u.cnpj = v_cnpj) then
    raise exception 'Este CNPJ já está em outra loja' using errcode = '23505';
  end if;

  perform set_config('ora.motivo', v_motivo, true);
  insert into public.unidades (organizacao_id, empresa_id, codigo, nome, tipo, cnpj, uf, cidade, unidade_emissora_id)
  values (v_organizacao, p_empresa, v_codigo, v_nome, p_tipo, v_cnpj, v_uf, v_cidade, p_emissora)
  returning id into v_nova;
  return jsonb_build_object('id', v_nova, 'repetida', false);
end;
$$;

-- O CNPJ pode chegar depois; o de uma loja que já o tem não se apaga.
create or replace function public.loja_atualizar(p_unidade uuid, p_nome text, p_cnpj text, p_uf text, p_cidade text, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loja public.unidades;
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := trim(coalesce(p_nome, ''));
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_uf text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_cidade text := nullif(trim(coalesce(p_cidade, '')), '');
begin
  select * into v_loja from public.unidades u where u.id = p_unidade for no key update;
  if not found or not privado.gere_lojas_da_organizacao(v_loja.organizacao_id) then
    raise exception 'Loja não encontrada para você' using errcode = 'P0002';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 80 then
    raise exception 'Informe o nome da loja (até 80 letras)' using errcode = '22023';
  end if;
  if v_loja.tipo = 'loja_fisica' and v_cnpj is null and v_loja.cnpj is not null then
    raise exception 'A loja já tem o CNPJ da filial: ele pode ser trocado, mas não apagado' using errcode = '22023';
  end if;
  if v_loja.tipo = 'online' and v_cnpj is null and v_loja.unidade_emissora_id is null then
    raise exception 'Loja online precisa de CNPJ próprio ou de uma loja que emita as notas por ela' using errcode = '22023';
  end if;
  if v_cnpj is not null and not privado.cnpj_valido(v_cnpj) then
    raise exception 'CNPJ inválido' using errcode = '22023';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida' using errcode = '22023';
  end if;
  if length(coalesce(v_cidade, '')) > 80 then
    raise exception 'Cidade muito longa (até 80 letras)' using errcode = '22023';
  end if;
  if v_cnpj is not null and exists (select 1 from public.unidades u where u.cnpj = v_cnpj and u.id <> v_loja.id) then
    raise exception 'Este CNPJ já está em outra loja' using errcode = '23505';
  end if;
  if v_loja.nome = v_nome and v_loja.cnpj is not distinct from v_cnpj and v_loja.uf is not distinct from v_uf
     and v_loja.cidade is not distinct from v_cidade then
    return false;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.unidades u set nome = v_nome, cnpj = v_cnpj, uf = v_uf, cidade = v_cidade where u.id = v_loja.id;
  return true;
end;
$$;
