-- Reversão de 20261113235217_resultado_do_mes. Apaga a leitura do resultado do mês, a marcação das
-- categorias que entram no resultado e a permissão resultado.ver; volta as funções das categorias ao
-- texto do lote L8a (20261113212437_contas_a_pagar).
drop function if exists public.resultado_do_mes(date, uuid, integer);
drop index if exists public.caixa_saidas_autorizadas;
drop index if exists public.contas_a_pagar_vencimento;
drop function if exists public.conta_pagar_categoria_salvar(uuid, text, boolean, boolean);
create or replace function public.conta_pagar_categoria_salvar(p_categoria uuid, p_nome text, p_ativa boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cat public.contas_pagar_categorias;
  v_org uuid;
  v_id uuid;
begin
  if p_categoria is null then
    select u.organizacao_id into v_org from public.unidades u where u.id = (select public.unidade_atual());
    if v_org is null or v_org not in (select privado.organizacoes_com_permissao('conta_pagar.gerir')) then
      raise exception 'Só o dono ajusta as categorias das contas a pagar' using errcode = '42501';
    end if;
  else
    select * into v_cat from public.contas_pagar_categorias c where c.id = p_categoria for update;
    if v_cat.id is null or v_cat.organizacao_id not in (select privado.organizacoes_com_permissao('conta_pagar.gerir')) then
      raise exception 'Categoria não encontrada para você' using errcode = 'P0002';
    end if;
    v_org := v_cat.organizacao_id;
  end if;
  if length(v_nome) not between 2 and 60 then
    raise exception 'O nome da categoria tem de 2 a 60 letras' using errcode = '22023';
  end if;
  if exists (select 1 from public.contas_pagar_categorias c
             where c.organizacao_id = v_org and lower(c.nome) = lower(v_nome) and c.id is distinct from p_categoria) then
    raise exception 'Já existe uma categoria com esse nome' using errcode = '22023';
  end if;
  if p_categoria is null then
    perform set_config('ora.motivo', 'Categoria das contas a pagar criada: ' || v_nome, true);
    insert into public.contas_pagar_categorias (organizacao_id, nome, ativa, criada_por)
    values (v_org, v_nome, coalesce(p_ativa, true), (select auth.uid()))
    returning id into v_id;
    return v_id;
  end if;
  if v_nome = v_cat.nome and coalesce(p_ativa, v_cat.ativa) = v_cat.ativa then
    return v_cat.id;
  end if;
  perform set_config('ora.motivo', 'Categoria das contas a pagar alterada: ' || v_nome
    || case when coalesce(p_ativa, v_cat.ativa) = v_cat.ativa then '' when v_cat.ativa then ' (desativada)' else ' (reativada)' end, true);
  update public.contas_pagar_categorias c set nome = v_nome, ativa = coalesce(p_ativa, v_cat.ativa) where c.id = v_cat.id;
  return v_cat.id;
end;
$$;
revoke all on function public.conta_pagar_categoria_salvar(uuid, text, boolean) from public, anon;
grant execute on function public.conta_pagar_categoria_salvar(uuid, text, boolean) to authenticated;
create or replace function privado.contas_pagar_semear_categorias(p_organizacao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := current_setting('ora.motivo', true);
begin
  perform set_config('ora.motivo', 'Lista inicial de categorias das contas a pagar (decisão do proprietário, 13/11/2026)', true);
  insert into public.contas_pagar_categorias (organizacao_id, nome, ordem)
  select p_organizacao, c.nome, c.ordem
  from (values ('Mercadoria (fornecedor)', 10), ('Aluguel e condomínio', 20), ('Água, luz e internet', 30), ('Salários e encargos', 40),
               ('Impostos e taxas', 50), ('Marketing', 60), ('Manutenção', 70), ('Outras', 80)) as c (nome, ordem)
  on conflict do nothing;
  perform set_config('ora.motivo', coalesce(v_motivo, ''), true);
end;
$$;
revoke all on function privado.contas_pagar_semear_categorias(uuid) from public, anon, authenticated;
alter table public.contas_pagar_categorias drop column entra_no_resultado;
do $$
begin
  perform set_config('ora.motivo', 'Reversão do resultado do mês (L8b)', true);
  delete from public.papel_permissoes where permissao = 'resultado.ver';
  delete from public.permissoes where codigo = 'resultado.ver';
end;
$$;
