-- =============================================================================
-- Lote TRF-a (plano do proprietário de 16/11, Onda 1, item 5; ORA-INV-007, #60): a remessa, com vários produtos na
-- mesma transferência.
--
-- Até aqui cada pedido de transferência levava um produto (ADR-007). Agora a loja pede de uma vez uma remessa, com até
-- 30 produtos entre as mesmas duas lojas. Cada produto continua sendo uma transferência, com o próprio caminho: separar
-- com reserva na origem, enviar, receber e conferir, divergência, recusa e cancelamento. A remessa só as agrupa:
--   * public.transferencia_remessas: o número, as lojas, o motivo, quem pediu e quando; a leitura segue a das
--     transferências (as lojas envolvidas, com estoque.consultar);
--   * public.transferencias.remessa_id: a remessa de cada transferência (nula no pedido avulso);
--   * public.transferencia_solicitar_remessa(origem, destino, itens, motivo, chave): pede tudo numa transação só, com as
--     mesmas regras do pedido avulso (a pessoa na loja de origem ou de destino, com estoque.consultar; duas lojas ativas
--     e diferentes da rede; produto com estoque; quantidade de 1 a 9.999; motivo). Cada produto entra uma vez. A mesma
--     chave com o mesmo conteúdo devolve a mesma remessa; com outro conteúdo, OR004;
--   * public.transferencia_remessa_enviar(remessa): a origem envia de uma vez as transferências da remessa já separadas;
--     as outras ficam como estão. Cada uma passa por transferencia_enviar, com as regras dela (só a loja de origem; de
--     DEFEITOS, só quem ajusta estoque). Remessa que não existe ou não é da pessoa: 42501;
--   * public.transferencia_lojas(): as lojas ativas da rede para escolher a origem e o destino (as mesmas que o "onde
--     tem" do estoque já mostra, public.estoque_na_rede): quem tem estoque.consultar em alguma loja da rede vê o nome
--     e o tipo de todas; nada de estoque, endereço ou CNPJ.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.transferencia_remessas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null,
  origem_id uuid not null,
  destino_id uuid not null,
  motivo text not null check (length(trim(motivo)) between 3 and 500),
  chave text not null check (length(trim(chave)) > 0),
  conteudo text not null,
  solicitado_por uuid not null references public.perfis_usuario (id),
  solicitado_em timestamptz not null default now(),
  foreign key (origem_id, organizacao_id) references public.unidades (id, organizacao_id),
  foreign key (destino_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, chave),
  constraint remessa_origem_diferente_do_destino check (origem_id <> destino_id)
);
comment on table public.transferencia_remessas is
  'Remessa: vários produtos pedidos de uma vez entre as mesmas duas lojas (TRF-a, ORA-INV-007); cada produto é uma transferência.';
create index transferencia_remessas_origem_organizacao on public.transferencia_remessas (origem_id, organizacao_id);
create index transferencia_remessas_destino_organizacao on public.transferencia_remessas (destino_id, organizacao_id);
create index transferencia_remessas_solicitado_por on public.transferencia_remessas (solicitado_por);
create trigger transferencia_remessas_auditar after insert or update on public.transferencia_remessas
  for each row execute function privado.auditar_mudanca();

alter table public.transferencias add column remessa_id uuid references public.transferencia_remessas (id);
create index transferencias_remessa on public.transferencias (remessa_id);

alter table public.transferencia_remessas enable row level security;
revoke all on public.transferencia_remessas from anon, authenticated;
revoke all on sequence public.transferencia_remessas_numero_seq from anon, authenticated;
grant select on public.transferencia_remessas to authenticated;
create policy transferencia_remessas_ler on public.transferencia_remessas for select to authenticated
  using (origem_id in (select privado.unidades_com_permissao('estoque.consultar'))
         or destino_id in (select privado.unidades_com_permissao('estoque.consultar')));

create or replace function public.transferencia_solicitar_remessa(p_origem uuid, p_destino uuid, p_itens jsonb, p_motivo text, p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  unidade uuid := (select public.unidade_atual());
  organizacao uuid;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_conteudo text;
  existente public.transferencia_remessas;
  v_remessa public.transferencia_remessas;
  linha record;
  ids uuid[] := '{}';
  nova uuid;
begin
  if unidade is null or unidade not in (p_origem, p_destino) or not (select public.tem_permissao('estoque.consultar', unidade)) then
    raise exception 'Peça a remessa estando na loja de origem ou de destino' using errcode = '42501';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'Chave de idempotência obrigatória' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 30 then
    raise exception 'A remessa leva de 1 a 30 produtos' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) e
             where jsonb_typeof(e) <> 'object'
                or coalesce(e ->> 'variante', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or coalesce(e ->> 'quantidade', '') !~ '^[0-9]{1,4}$') then
    raise exception 'Produto ou quantidade inválidos na remessa' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'variante') from jsonb_array_elements(p_itens) e) <> jsonb_array_length(p_itens) then
    raise exception 'Cada produto entra uma vez na remessa: junte as quantidades' using errcode = '22023';
  end if;
  select u.organizacao_id into organizacao from public.unidades u where u.id = unidade;
  v_conteudo := md5(concat_ws('|', p_origem, p_destino, v_motivo, (
    select string_agg((e ->> 'variante') || ':' || ((e ->> 'quantidade')::int), ',' order by e ->> 'variante')
    from jsonb_array_elements(p_itens) e)));
  perform pg_advisory_xact_lock(privado.trava_da_chave('transferencia_remessas', organizacao, p_chave));
  select * into existente from public.transferencia_remessas r where r.organizacao_id = organizacao and r.chave = p_chave;
  if found then
    if existente.conteudo <> v_conteudo or existente.solicitado_por <> usuario then
      raise exception 'Chave de idempotência já usada em outra operação' using errcode = 'OR004';
    end if;
    return jsonb_build_object('remessa', existente.id, 'numero', existente.numero, 'repetida', true,
      'transferencias', (select coalesce(jsonb_agg(t.id order by t.numero), '[]'::jsonb) from public.transferencias t where t.remessa_id = existente.id));
  end if;
  if p_origem is null or p_destino is null or p_origem = p_destino or (
       select count(*) from public.unidades u
       where u.id in (p_origem, p_destino) and u.organizacao_id = organizacao and u.status = 'ativa') <> 2 then
    raise exception 'Escolha duas lojas ativas e diferentes desta rede' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) e
             where (e ->> 'quantidade')::int not between 1 and 9999
                or not exists (select 1 from public.variantes v join public.produtos p on p.id = v.produto_id
                               where v.id = (e ->> 'variante')::uuid and v.organizacao_id = organizacao
                                 and p.tipo in ('aparelho', 'chip', 'acessorio'))) then
    raise exception 'Produto sem estoque para transferir ou quantidade inválida na remessa' using errcode = '22023';
  end if;
  if length(v_motivo) not between 3 and 500 then
    raise exception 'Informe o motivo' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  insert into public.transferencia_remessas (organizacao_id, origem_id, destino_id, motivo, chave, conteudo, solicitado_por)
  values (organizacao, p_origem, p_destino, v_motivo, p_chave, v_conteudo, usuario)
  returning * into v_remessa;
  for linha in
    select (x.e ->> 'variante')::uuid as variante, (x.e ->> 'quantidade')::int as quantidade, x.ordem
    from jsonb_array_elements(p_itens) with ordinality as x (e, ordem) order by x.ordem
  loop
    insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, solicitado_por, remessa_id)
    values (organizacao, p_origem, p_destino, linha.variante, linha.quantidade, v_motivo, p_chave || ':' || linha.ordem,
            md5(concat_ws('|', p_origem, p_destino, linha.variante, linha.quantidade, v_motivo)), usuario, v_remessa.id)
    returning id into nova;
    ids := ids || nova;
  end loop;
  return jsonb_build_object('remessa', v_remessa.id, 'numero', v_remessa.numero, 'repetida', false, 'transferencias', to_jsonb(ids));
end;
$$;

create or replace function public.transferencia_remessa_enviar(p_remessa uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.transferencia_remessas;
  t record;
  enviadas int := 0;
  a_separar int := 0;
begin
  select * into r from public.transferencia_remessas x where x.id = p_remessa;
  if not found or (select public.unidade_atual()) is distinct from r.origem_id then
    raise exception 'Só a loja de origem envia a remessa' using errcode = '42501';
  end if;
  for t in select x.id, x.situacao from public.transferencias x where x.remessa_id = r.id order by x.numero loop
    if t.situacao = 'separada' then
      perform public.transferencia_enviar(t.id);
      enviadas := enviadas + 1;
    elsif t.situacao = 'solicitada' then
      a_separar := a_separar + 1;
    end if;
  end loop;
  return jsonb_build_object('enviadas', enviadas, 'a_separar', a_separar);
end;
$$;

create or replace function public.transferencia_lojas()
returns table (id uuid, nome text, tipo text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.nome, u.tipo
  from public.unidades u
  where u.status = 'ativa' and u.tipo in ('loja_fisica', 'deposito', 'excecao')
    and u.organizacao_id in (
      select x.organizacao_id from public.unidades x
      where x.id in (select privado.unidades_com_permissao('estoque.consultar')))
  order by u.tipo = 'excecao', u.nome;
$$;

revoke all on function public.transferencia_solicitar_remessa(uuid, uuid, jsonb, text, text), public.transferencia_remessa_enviar(uuid),
  public.transferencia_lojas() from public, anon;
grant execute on function public.transferencia_solicitar_remessa(uuid, uuid, jsonb, text, text), public.transferencia_remessa_enviar(uuid),
  public.transferencia_lojas() to authenticated;
