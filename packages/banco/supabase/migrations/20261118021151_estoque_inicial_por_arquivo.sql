-- =============================================================================
-- Lote REIN-b (auditoria do Codex de 17/11/2026, PR #104, orientação "Primeiro lote"; plano do proprietário de 16/11,
-- Onda 1, item 3, a carga do estoque por local; ORA-INV-004 e ORA-CAT-002): o estoque inicial de cada loja pelo
-- relatório de produtos da Rein, com prévia, aprovação e aplicação pelo livro.
--
-- O relatório traz, por produto, a quantidade de cada local (o físico e o disponível em colunas separadas), numa data
-- de corte (a posição do arquivo). A aplicação lê o arquivo e, com o mapeamento que a pessoa confirma (a coluna do
-- código do produto e, de cada loja, a coluna do físico e a do disponível), manda ao banco, loja por loja, as linhas com
-- quantidade. Nada do formato da Rein é suposto aqui. Aqui:
--   * public.estoque_cargas: cada carga (uma loja e um arquivo): o arquivo e a impressão digital, a data de corte,
--     o mapeamento, a situação (prévia, aplicada, descartada ou desfeita), os totais, quem gerou e quem aplicou;
--   * public.estoque_carga_linhas: cada produto da loja na carga, com o físico e o disponível do arquivo, o saldo do
--     sistema na data de corte e o que a carga faz com ele:
--       - entrar: acessório com físico positivo e sem saldo no sistema na data de corte;
--       - serializado: aparelho ou chip: entra pela Entrada de estoque, com o IMEI ou o ICCID de cada unidade (nada se
--         inventa);
--       - sem_produto: o código não está no catálogo (importe o catálogo antes);
--       - conferir: o problema da linha no arquivo, a quantidade negativa, o disponível maior que o físico, o código
--         repetido, o produto inativo, o tipo sem estoque, ou a loja que já tinha saldo do produto na data de corte;
--       - nada: físico zero;
--   * public.estoque_carga_previa(organização, loja, arquivo, impressão, corte, mapeamento, linhas): quem tem
--     importacao.executar (o administrador) grava a prévia da loja, sem mexer no estoque. O mesmo arquivo da mesma
--     loja devolve a mesma prévia; o arquivo já aplicado naquela loja é recusado (OR023);
--   * public.estoque_carga_aplicar(carga, motivo): quem tem importacao.aprovar (o dono) e não gerou a prévia (OR024)
--     lança no livro cada linha "entrar" (entrada_importacao, com chave própria: repetir não duplica). A loja com outra
--     carga aplicada é recusada (OR041): desfaça a outra antes;
--   * public.estoque_carga_descartar(carga, motivo): encerra a prévia sem aplicar;
--   * public.estoque_carga_desfazer(carga, motivo): devolve pelo livro (ajuste negativo) o que a carga lançou, linha a
--     linha, onde a loja ainda tem a quantidade livre; o resto fica e é contado.
-- A movimentação depois da data de corte continua valendo: a carga lança só o que o arquivo diz que havia na data de
-- corte, e a loja que já tinha o produto no sistema naquela data vai para conferência, sem lançar nada. O DEFEITOS
-- (local de exceção) recebe a carga como as lojas e continua sem vender (ADR-007). Decisão: ADR-021.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.estoque_cargas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid not null,
  arquivo_nome text not null check (length(arquivo_nome) between 1 and 200 and arquivo_nome = btrim(arquivo_nome)),
  arquivo_sha256 text not null check (arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  corte timestamptz not null,
  mapeamento jsonb not null check (jsonb_typeof(mapeamento) = 'object'),
  situacao text not null default 'previa' check (situacao in ('previa', 'aplicada', 'descartada', 'desfeita')),
  totais jsonb not null default '{}'::jsonb,
  criado_por uuid not null references public.perfis_usuario (id),
  criado_em timestamptz not null default now(),
  aplicado_por uuid references public.perfis_usuario (id),
  aplicado_em timestamptz,
  encerrado_por uuid references public.perfis_usuario (id),
  encerrado_em timestamptz,
  motivo text check (motivo is null or length(trim(motivo)) >= 3),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id)
);
comment on table public.estoque_cargas is
  'REIN-b: cada carga do estoque inicial de uma loja pelo arquivo (ADR-021): o arquivo, a data de corte, a situação e quem gerou e aplicou.';
create index estoque_cargas_organizacao on public.estoque_cargas (organizacao_id, criado_em desc);
create index estoque_cargas_unidade on public.estoque_cargas (unidade_id, organizacao_id);
create index estoque_cargas_criado_por on public.estoque_cargas (criado_por);
create index estoque_cargas_aplicado_por on public.estoque_cargas (aplicado_por);
create index estoque_cargas_encerrado_por on public.estoque_cargas (encerrado_por);
-- Uma carga aplicada por loja de cada vez: a segunda espera a primeira ser desfeita (OR041).
create unique index estoque_cargas_uma_aplicada_por_loja on public.estoque_cargas (organizacao_id, unidade_id) where situacao = 'aplicada';
create trigger estoque_cargas_auditar after insert or update on public.estoque_cargas
  for each row execute function privado.auditar_mudanca();

create table public.estoque_carga_linhas (
  carga_id uuid not null references public.estoque_cargas (id),
  numero int not null check (numero >= 2),
  sku text not null check (length(sku) <= 60),
  variante_id uuid references public.variantes (id),
  fisico int,
  disponivel int,
  saldo_no_corte int not null default 0,
  acao text not null check (acao in ('entrar', 'serializado', 'sem_produto', 'conferir', 'nada')),
  motivo text check (motivo is null or length(motivo) <= 300),
  movimento_id bigint references public.estoque_movimentos (id),
  desfeita_em timestamptz,
  primary key (carga_id, numero),
  constraint estoque_carga_linhas_entrar check (acao <> 'entrar' or (variante_id is not null and fisico > 0))
);
comment on table public.estoque_carga_linhas is
  'REIN-b: cada produto de uma loja numa carga do estoque inicial (ADR-021), com o que a carga faz com ele e o lançamento no livro.';
create index estoque_carga_linhas_variante on public.estoque_carga_linhas (variante_id);
create index estoque_carga_linhas_movimento on public.estoque_carga_linhas (movimento_id);

alter table public.estoque_cargas enable row level security;
alter table public.estoque_carga_linhas enable row level security;
revoke all on public.estoque_cargas, public.estoque_carga_linhas from anon, authenticated;
revoke all on sequence public.estoque_cargas_numero_seq from anon, authenticated;
grant select on public.estoque_cargas, public.estoque_carga_linhas to authenticated;
-- Quem importa e quem aprova veem as cargas da rede (as mesmas permissões da importação do catálogo).
create policy estoque_cargas_ler on public.estoque_cargas for select to authenticated
  using (organizacao_id in (select privado.organizacoes_com_permissao('importacao.executar'))
      or organizacao_id in (select privado.organizacoes_com_permissao('importacao.aprovar')));
create policy estoque_carga_linhas_ler on public.estoque_carga_linhas for select to authenticated
  using (carga_id in (select c.id from public.estoque_cargas c));

-- -----------------------------------------------------------------------------
-- A prévia de uma loja
-- -----------------------------------------------------------------------------
create or replace function public.estoque_carga_previa(
  p_organizacao uuid, p_unidade uuid, p_arquivo_nome text, p_sha256 text, p_corte timestamptz, p_mapeamento jsonb, p_linhas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade public.unidades;
  v_existente public.estoque_cargas;
  v_aplicada bigint;
  v_id uuid;
  v_numero bigint;
  v_linha jsonb;
  v_n int;
  v_sku text;
  v_fisico int;
  v_disponivel int;
  v_problema text;
  v_variante public.variantes;
  v_produto_ativo boolean;
  v_tipo text;
  v_saldo int;
  v_acao text;
  v_motivo text;
  v_vistos jsonb := '{}'::jsonb;
  v_totais jsonb;
begin
  if p_organizacao is null or p_organizacao not in (select privado.organizacoes_com_permissao('importacao.executar')) then
    raise exception 'Sem permissão para importar nesta rede' using errcode = '42501';
  end if;
  select * into v_unidade from public.unidades u where u.id = p_unidade and u.organizacao_id = p_organizacao;
  if not found or v_unidade.status <> 'ativa' or v_unidade.tipo not in ('loja_fisica', 'deposito', 'excecao') then
    raise exception 'A carga é para uma loja, um depósito ou o local de exceção ativos desta rede' using errcode = '22023';
  end if;
  if p_arquivo_nome is null or length(btrim(p_arquivo_nome)) not between 1 and 200 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_mapeamento) is distinct from 'object' then
    raise exception 'Dados do arquivo inválidos' using errcode = '22023';
  end if;
  if p_corte is null or p_corte > now() or p_corte < now() - interval '400 days' then
    raise exception 'A data de corte (a posição do arquivo) vem antes de agora e no máximo 400 dias atrás' using errcode = '22023';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 3000 then
    raise exception 'A carga de uma loja leva de 1 a 3.000 linhas' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', p_organizacao, p_sha256 || ':' || p_unidade::text));
  select c.numero into v_aplicada from public.estoque_cargas c
  where c.organizacao_id = p_organizacao and c.unidade_id = p_unidade and c.arquivo_sha256 = p_sha256 and c.situacao = 'aplicada';
  if found then
    raise exception 'Este arquivo já foi aplicado nesta loja (carga nº %)', v_aplicada using errcode = 'OR023';
  end if;
  select * into v_existente from public.estoque_cargas c
  where c.organizacao_id = p_organizacao and c.unidade_id = p_unidade and c.arquivo_sha256 = p_sha256 and c.situacao = 'previa'
    and c.corte = p_corte and c.mapeamento = p_mapeamento
  order by c.criado_em desc limit 1;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero, 'repetida', true, 'totais', v_existente.totais);
  end if;

  perform set_config('ora.motivo', 'Prévia da carga do estoque inicial: ' || btrim(p_arquivo_nome), true);
  insert into public.estoque_cargas (organizacao_id, unidade_id, arquivo_nome, arquivo_sha256, corte, mapeamento, criado_por)
  values (p_organizacao, p_unidade, btrim(p_arquivo_nome), p_sha256, p_corte, p_mapeamento, (select auth.uid()))
  returning id, numero into v_id, v_numero;

  for v_linha in select e from jsonb_array_elements(p_linhas) e loop
    if jsonb_typeof(v_linha) <> 'object' or coalesce(v_linha ->> 'numero', '') !~ '^[0-9]{1,6}$' or (v_linha ->> 'numero')::int < 2
       or (v_linha ? 'fisico' and jsonb_typeof(v_linha -> 'fisico') not in ('number', 'null'))
       or (v_linha ? 'disponivel' and jsonb_typeof(v_linha -> 'disponivel') not in ('number', 'null')) then
      raise exception 'Linha do arquivo em formato inválido' using errcode = '22023';
    end if;
    v_n := (v_linha ->> 'numero')::int;
    v_sku := left(btrim(coalesce(v_linha ->> 'sku', '')), 60);
    v_problema := nullif(left(btrim(coalesce(v_linha ->> 'problema', '')), 200), '');
    if coalesce(v_linha ->> 'fisico', '') !~ '^-?[0-9]{1,7}$' and v_linha ->> 'fisico' is not null then
      raise exception 'Linha %: a quantidade física precisa ser um número inteiro', v_n using errcode = '22023';
    end if;
    if coalesce(v_linha ->> 'disponivel', '') !~ '^-?[0-9]{1,7}$' and v_linha ->> 'disponivel' is not null then
      raise exception 'Linha %: a quantidade disponível precisa ser um número inteiro', v_n using errcode = '22023';
    end if;
    v_fisico := (v_linha ->> 'fisico')::int;
    v_disponivel := (v_linha ->> 'disponivel')::int;
    v_variante := null;
    v_saldo := 0;
    v_acao := 'conferir';
    v_motivo := null;
    if v_problema is not null then
      v_motivo := v_problema;
    elsif v_sku = '' then
      v_motivo := 'Linha sem o código do produto';
    elsif v_vistos ? v_sku then
      v_motivo := format('Código repetido no arquivo (já na linha %s)', v_vistos ->> v_sku);
    else
      select * into v_variante from public.variantes v where v.organizacao_id = p_organizacao and v.sku = v_sku;
      if not found then
        v_acao := 'sem_produto';
        v_motivo := 'O código não está no catálogo: importe o catálogo antes';
      else
        select p.ativo, p.tipo into v_produto_ativo, v_tipo from public.produtos p where p.id = v_variante.produto_id;
        select coalesce(sum(m.quantidade), 0) into v_saldo from public.estoque_movimentos m
        where m.organizacao_id = p_organizacao and m.unidade_id = p_unidade and m.variante_id = v_variante.id and m.ocorrido_em <= p_corte;
        if v_fisico is null then
          v_motivo := 'Sem a quantidade física';
        elsif v_fisico < 0 or v_disponivel < 0 then
          v_motivo := 'Quantidade negativa no arquivo';
        elsif v_disponivel > v_fisico then
          v_motivo := 'O disponível é maior que o físico';
        elsif v_fisico = 0 then
          v_acao := 'nada';
        elsif not v_variante.ativa or not v_produto_ativo then
          v_motivo := 'O produto está inativo no catálogo: reative antes';
        elsif v_tipo not in ('aparelho', 'chip', 'acessorio') then
          v_motivo := 'Este tipo de item não tem estoque';
        elsif v_saldo <> 0 then
          v_motivo := format('A loja já tinha %s no sistema na data de corte: confira antes de lançar', v_saldo);
        elsif v_tipo in ('aparelho', 'chip') then
          v_acao := 'serializado';
          v_motivo := 'Entra pela Entrada de estoque, com o IMEI ou o ICCID de cada unidade';
        else
          v_acao := 'entrar';
        end if;
      end if;
      v_vistos := v_vistos || jsonb_build_object(v_sku, v_n);
    end if;
    insert into public.estoque_carga_linhas (carga_id, numero, sku, variante_id, fisico, disponivel, saldo_no_corte, acao, motivo)
    values (v_id, v_n, v_sku, v_variante.id, v_fisico, v_disponivel, v_saldo, v_acao, v_motivo);
  end loop;

  select jsonb_build_object(
    'linhas', count(*),
    'entrar', count(*) filter (where l.acao = 'entrar'),
    'unidades_entrar', coalesce(sum(l.fisico) filter (where l.acao = 'entrar'), 0),
    'serializado', count(*) filter (where l.acao = 'serializado'),
    'unidades_serializado', coalesce(sum(l.fisico) filter (where l.acao = 'serializado'), 0),
    'sem_produto', count(*) filter (where l.acao = 'sem_produto'),
    'conferir', count(*) filter (where l.acao = 'conferir'),
    'nada', count(*) filter (where l.acao = 'nada'),
    'fora_do_disponivel', coalesce(sum(l.fisico - l.disponivel) filter (where l.acao in ('entrar', 'serializado') and l.disponivel is not null), 0))
  into v_totais
  from public.estoque_carga_linhas l where l.carga_id = v_id;
  update public.estoque_cargas c set totais = v_totais where c.id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'repetida', false, 'totais', v_totais);
end;
$$;
revoke all on function public.estoque_carga_previa(uuid, uuid, text, text, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.estoque_carga_previa(uuid, uuid, text, text, timestamptz, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Aplicar, descartar e desfazer
-- -----------------------------------------------------------------------------
create or replace function public.estoque_carga_aplicar(p_carga uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_carga public.estoque_cargas;
  v_unidade public.unidades;
  v_outra bigint;
  v_linha public.estoque_carga_linhas;
  v_ativa boolean;
  v_mov bigint;
  v_entradas int := 0;
  v_unidades bigint := 0;
  v_rotulo text;
begin
  select * into v_carga from public.estoque_cargas c where c.id = p_carga;
  if not found or v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Sem permissão para aplicar a carga' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', v_carga.organizacao_id, 'loja:' || v_carga.unidade_id::text));
  select * into v_carga from public.estoque_cargas c where c.id = p_carga for update;
  if v_carga.situacao <> 'previa' then
    raise exception 'Só a prévia pode ser aplicada (esta está %)', v_carga.situacao using errcode = '22023';
  end if;
  if v_carga.criado_por = (select auth.uid()) then
    raise exception 'Quem gerou a prévia não aplica: peça a outra pessoa com a aprovação' using errcode = 'OR024';
  end if;
  select c.numero into v_outra from public.estoque_cargas c
  where c.organizacao_id = v_carga.organizacao_id and c.unidade_id = v_carga.unidade_id and c.situacao = 'aplicada';
  if found then
    raise exception 'A loja já tem uma carga aplicada (nº %): desfaça antes de aplicar outra', v_outra using errcode = 'OR041';
  end if;
  select * into v_unidade from public.unidades u where u.id = v_carga.unidade_id;
  if v_unidade.status <> 'ativa' then
    raise exception 'A loja da carga não está ativa' using errcode = '22023';
  end if;
  v_rotulo := format('Carga inicial nº %s (%s, posição de %s): %s', v_carga.numero, v_carga.arquivo_nome,
    to_char(v_carga.corte at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  for v_linha in select * from public.estoque_carga_linhas l where l.carga_id = v_carga.id and l.acao = 'entrar' order by l.numero loop
    select v.ativa and p.ativo into v_ativa from public.variantes v join public.produtos p on p.id = v.produto_id where v.id = v_linha.variante_id;
    if not coalesce(v_ativa, false) then
      raise exception 'Linha % (%): o produto foi inativado depois da prévia: gere a prévia de novo', v_linha.numero, v_linha.sku using errcode = '22023';
    end if;
    v_mov := privado.lancar_movimento(v_carga.unidade_id, v_linha.variante_id, v_linha.fisico, 'entrada_importacao', null, v_rotulo,
      'estoque_carga', v_carga.id::text, format('estoque_carga:%s:%s', v_carga.id, v_linha.numero), (select auth.uid()));
    update public.estoque_carga_linhas l set movimento_id = v_mov where l.carga_id = v_carga.id and l.numero = v_linha.numero;
    v_entradas := v_entradas + 1;
    v_unidades := v_unidades + v_linha.fisico;
  end loop;
  update public.estoque_cargas c set situacao = 'aplicada', aplicado_por = (select auth.uid()), aplicado_em = now(), motivo = v_motivo
  where c.id = v_carga.id;
  return jsonb_build_object('id', v_carga.id, 'numero', v_carga.numero, 'entradas', v_entradas, 'unidades', v_unidades);
end;
$$;
revoke all on function public.estoque_carga_aplicar(uuid, text) from public, anon;
grant execute on function public.estoque_carga_aplicar(uuid, text) to authenticated;

create or replace function public.estoque_carga_descartar(p_carga uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_carga public.estoque_cargas;
begin
  select * into v_carga from public.estoque_cargas c where c.id = p_carga for update;
  if not found or (v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.executar'))
                   and v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar'))) then
    raise exception 'Sem permissão para descartar a carga' using errcode = '42501';
  end if;
  if v_carga.situacao <> 'previa' then
    raise exception 'Só a prévia pode ser descartada (esta está %)', v_carga.situacao using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.estoque_cargas c set situacao = 'descartada', encerrado_por = (select auth.uid()), encerrado_em = now(), motivo = v_motivo
  where c.id = v_carga.id;
  return true;
end;
$$;
revoke all on function public.estoque_carga_descartar(uuid, text) from public, anon;
grant execute on function public.estoque_carga_descartar(uuid, text) to authenticated;

create or replace function public.estoque_carga_desfazer(p_carga uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_carga public.estoque_cargas;
  v_linha public.estoque_carga_linhas;
  v_livre int;
  v_desfeitas int := 0;
  v_ficaram int := 0;
  v_rotulo text;
begin
  select * into v_carga from public.estoque_cargas c where c.id = p_carga;
  if not found or v_carga.organizacao_id not in (select privado.organizacoes_com_permissao('importacao.aprovar')) then
    raise exception 'Sem permissão para desfazer a carga' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('estoque_cargas', v_carga.organizacao_id, 'loja:' || v_carga.unidade_id::text));
  select * into v_carga from public.estoque_cargas c where c.id = p_carga for update;
  if v_carga.situacao <> 'aplicada' then
    raise exception 'Só a carga aplicada pode ser desfeita (esta está %)', v_carga.situacao using errcode = '22023';
  end if;
  v_rotulo := format('Desfazer a carga inicial nº %s: %s', v_carga.numero, v_motivo);
  perform set_config('ora.motivo', v_rotulo, true);
  for v_linha in select * from public.estoque_carga_linhas l
                 where l.carga_id = v_carga.id and l.movimento_id is not null and l.desfeita_em is null order by l.numero desc loop
    -- Só o que está livre na loja volta: o que já foi vendido, reservado ou transferido fica (e é contado).
    select coalesce(s.quantidade - s.reservado, 0) into v_livre from public.estoque_saldos s
    where s.unidade_id = v_carga.unidade_id and s.variante_id = v_linha.variante_id for update;
    if coalesce(v_livre, 0) >= v_linha.fisico then
      perform privado.lancar_movimento(v_carga.unidade_id, v_linha.variante_id, -v_linha.fisico, 'ajuste', null, v_rotulo,
        'estoque_carga', v_carga.id::text, format('estoque_carga:%s:desfazer:%s', v_carga.id, v_linha.numero), (select auth.uid()));
      update public.estoque_carga_linhas l set desfeita_em = now() where l.carga_id = v_carga.id and l.numero = v_linha.numero;
      v_desfeitas := v_desfeitas + 1;
    else
      v_ficaram := v_ficaram + 1;
    end if;
  end loop;
  update public.estoque_cargas c set situacao = 'desfeita', encerrado_por = (select auth.uid()), encerrado_em = now(), motivo = v_motivo,
    totais = c.totais || jsonb_build_object('desfeitas', v_desfeitas, 'ficaram', v_ficaram)
  where c.id = v_carga.id;
  return jsonb_build_object('id', v_carga.id, 'numero', v_carga.numero, 'desfeitas', v_desfeitas, 'ficaram', v_ficaram);
end;
$$;
revoke all on function public.estoque_carga_desfazer(uuid, text) from public, anon;
grant execute on function public.estoque_carga_desfazer(uuid, text) to authenticated;
