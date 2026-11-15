-- =============================================================================
-- Documentos da conta a pagar: o boleto, a nota e o comprovante (lote FIN-004b: ORA-FIN-004, "anexar o boleto ou a
-- nota")
--
-- O boleto, a nota do fornecedor e o comprovante do pagamento saem da gaveta e do e-mail e ficam na própria conta:
--   * bucket PRIVADO "contas" (PDF, JPEG, PNG e WebP, até 5 MB), no caminho <organização>/<conta>/<id>.<formato>;
--     envia e lê quem gere a conta (conta_pagar.gerir: o dono na rede e em todas as lojas, o gerente na loja dele),
--     sempre por link assinado e temporário;
--   * public.conta_pagar_anexos: cada documento com o tipo (boleto, nota fiscal, comprovante do pagamento ou outro,
--     este com descrição), o formato, o tamanho, o SHA-256 (conferido pelo servidor ao receber) e quem enviou; retirar
--     (documento errado) guarda o registro como retirado, com quem, quando e o motivo; nada se apaga, e o arquivo
--     continua guardado;
--   * public.conta_pagar_anexar(conta, tipo, descricao, caminho, sha256): registra o arquivo que já está no Storage;
--     quem gere a conta; até 20 documentos vigentes por conta; o mesmo caminho devolve o mesmo registro;
--   * public.conta_pagar_retirar_anexo(anexo, motivo): quem gere a conta, com o motivo, uma vez.
-- Retenção: nada se apaga; o prazo legal de guarda e o descarte são a decisão pendente D-045 (com o contador e o
-- jurídico). Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contas', 'contas', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Lê quem lê a conta (o RLS das contas é o conta_pagar.gerir); envia quem gere a conta, no caminho da organização dela.
create policy conta_anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'contas' and (storage.foldername(name))[2] in (select c.id::text from public.contas_a_pagar c));
create policy conta_anexos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'contas'
              and array_length(storage.foldername(name), 1) = 2
              and exists (select 1 from public.contas_a_pagar c
                          where c.id::text = (storage.foldername(name))[2] and c.organizacao_id::text = (storage.foldername(name))[1]
                            and privado.pode_gerir_conta_pagar(c.organizacao_id, c.unidade_id)));

create table public.conta_pagar_anexos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid,
  conta_id uuid not null references public.contas_a_pagar (id),
  tipo text not null check (tipo in ('boleto', 'nota_fiscal', 'comprovante_pagamento', 'outro')),
  descricao text check (descricao is null or length(descricao) between 3 and 120),
  caminho text not null unique,
  formato text not null check (formato in ('pdf', 'jpg', 'png', 'webp')),
  bytes int not null check (bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  enviado_por uuid not null references public.perfis_usuario (id),
  enviado_em timestamptz not null default now(),
  retirado_em timestamptz,
  retirado_por uuid references public.perfis_usuario (id),
  motivo_retirada text check (motivo_retirada is null or length(motivo_retirada) between 3 and 200),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  constraint conta_anexo_retirada check (
    (retirado_em is null) = (retirado_por is null) and (retirado_em is null) = (motivo_retirada is null)),
  constraint conta_anexo_descricao_do_outro check (tipo <> 'outro' or descricao is not null)
);
comment on table public.conta_pagar_anexos is
  'Documentos da conta a pagar (FIN-004b, ORA-FIN-004): boleto, nota e comprovante no bucket privado "contas"; retirar só marca; nada se apaga.';
create index conta_pagar_anexos_conta on public.conta_pagar_anexos (conta_id, enviado_em);
create index conta_pagar_anexos_unidade on public.conta_pagar_anexos (unidade_id, organizacao_id) where unidade_id is not null;
create index conta_pagar_anexos_enviado_por on public.conta_pagar_anexos (enviado_por);
create index conta_pagar_anexos_retirado_por on public.conta_pagar_anexos (retirado_por) where retirado_por is not null;
create trigger conta_pagar_anexos_auditar after insert or update on public.conta_pagar_anexos
  for each row execute function privado.auditar_mudanca();

-- Só a retirada muda, uma vez; o resto é fixo. Nada se apaga.
create or replace function privado.conta_anexo_so_retirada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.retirado_em is not null or new.retirado_em is null
     or (to_jsonb(old) - array['retirado_em', 'retirado_por', 'motivo_retirada'])
        is distinct from (to_jsonb(new) - array['retirado_em', 'retirado_por', 'motivo_retirada']) then
    raise exception 'O documento da conta não muda: só a retirada, uma vez' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger conta_pagar_anexos_so_retirada before update on public.conta_pagar_anexos
  for each row execute function privado.conta_anexo_so_retirada();
create trigger conta_pagar_anexos_sem_apagar before delete on public.conta_pagar_anexos
  for each row execute function privado.so_insercao();
create trigger conta_pagar_anexos_sem_truncate before truncate on public.conta_pagar_anexos
  for each statement execute function privado.so_insercao();

alter table public.conta_pagar_anexos enable row level security;
revoke all on public.conta_pagar_anexos from anon, authenticated;
grant select on public.conta_pagar_anexos to authenticated;
create policy conta_pagar_anexos_ler on public.conta_pagar_anexos for select to authenticated
  using (conta_id in (select c.id from public.contas_a_pagar c));

-- -----------------------------------------------------------------------------
-- Anexar e retirar: quem gere a conta
-- -----------------------------------------------------------------------------
create or replace function public.conta_pagar_anexar(p_conta uuid, p_tipo text, p_descricao text, p_caminho text, p_sha256 text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conta public.contas_a_pagar;
  v_descricao text := nullif(regexp_replace(trim(coalesce(p_descricao, '')), '\s+', ' ', 'g'), '');
  v_formato text;
  v_mime text;
  meta jsonb;
  existente public.conta_pagar_anexos;
  novo uuid;
begin
  select * into conta from public.contas_a_pagar c where c.id = p_conta for update;
  if conta.id is null or not privado.pode_gerir_conta_pagar(conta.organizacao_id, conta.unidade_id) then
    raise exception 'Conta a pagar não encontrada para você' using errcode = 'P0002';
  end if;
  if p_tipo is null or p_tipo not in ('boleto', 'nota_fiscal', 'comprovante_pagamento', 'outro') then
    raise exception 'Tipo de documento desconhecido' using errcode = '22023';
  end if;
  if v_descricao is not null and length(v_descricao) not between 3 and 120 then
    raise exception 'Descrição do documento: de 3 a 120 letras' using errcode = '22023';
  end if;
  if p_tipo = 'outro' and v_descricao is null then
    raise exception 'Diga que documento é (descrição de 3 a 120 letras)' using errcode = '22023';
  end if;
  if p_caminho is null or p_caminho !~ ('^' || conta.organizacao_id || '/' || conta.id || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Caminho do documento fora do padrão desta conta' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Resumo SHA-256 do documento inválido' using errcode = '22023';
  end if;
  select * into existente from public.conta_pagar_anexos a where a.caminho = p_caminho;
  if found then
    return jsonb_build_object('id', existente.id, 'repetido', true);
  end if;
  v_formato := substring(p_caminho from '\.([a-z]+)$');
  v_mime := case v_formato when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' else 'image/webp' end;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'contas' and o.name = p_caminho;
  if meta is null then
    raise exception 'O arquivo não chegou ao Storage' using errcode = 'P0002';
  end if;
  if meta ->> 'mimetype' is distinct from v_mime then
    raise exception 'O arquivo no Storage não é do formato informado' using errcode = '22023';
  end if;
  if (select count(*) from public.conta_pagar_anexos a where a.conta_id = conta.id and a.retirado_em is null) >= 20 then
    raise exception 'Esta conta já tem 20 documentos: retire um errado antes' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', format('Documento da conta a pagar: %s', replace(p_tipo, '_', ' ')), true);
  insert into public.conta_pagar_anexos (organizacao_id, unidade_id, conta_id, tipo, descricao, caminho, formato, bytes, sha256, enviado_por)
  values (conta.organizacao_id, conta.unidade_id, conta.id, p_tipo, v_descricao, p_caminho, v_formato, (meta ->> 'size')::int, p_sha256,
          (select auth.uid()))
  returning id into novo;
  return jsonb_build_object('id', novo, 'repetido', false);
end;
$$;

create or replace function public.conta_pagar_retirar_anexo(p_anexo uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  anexo public.conta_pagar_anexos;
  conta public.contas_a_pagar;
  v_motivo text;
begin
  select * into anexo from public.conta_pagar_anexos a where a.id = p_anexo for update;
  select * into conta from public.contas_a_pagar c where c.id = anexo.conta_id;
  if anexo.id is null or conta.id is null or not privado.pode_gerir_conta_pagar(conta.organizacao_id, conta.unidade_id) then
    raise exception 'Documento não encontrado' using errcode = 'P0002';
  end if;
  if anexo.retirado_em is not null then
    return false;
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  if length(v_motivo) > 200 then
    raise exception 'O motivo tem até 200 letras' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.conta_pagar_anexos a set retirado_em = now(), retirado_por = (select auth.uid()), motivo_retirada = v_motivo where a.id = anexo.id;
  return true;
end;
$$;

revoke all on function privado.conta_anexo_so_retirada() from public, anon, authenticated;
revoke all on function public.conta_pagar_anexar(uuid, text, text, text, text), public.conta_pagar_retirar_anexo(uuid, text) from public, anon;
grant execute on function public.conta_pagar_anexar(uuid, text, text, text, text), public.conta_pagar_retirar_anexo(uuid, text) to authenticated;
