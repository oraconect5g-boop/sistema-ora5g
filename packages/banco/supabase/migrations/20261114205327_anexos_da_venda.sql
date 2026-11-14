-- =============================================================================
-- Documentos da venda: contratos e anexos em armazenamento privado (lote L5d: ORA-CRM-008)
--
-- O contrato do financiamento, o termo de garantia, o contrato da linha e o comprovante assinado saem da gaveta e do
-- celular de cada vendedor e ficam na própria venda:
--   * bucket PRIVADO "anexos" (PDF, JPEG, PNG e WebP, até 5 MB), no caminho <organização>/<loja>/<venda>/<id>.<formato>;
--     envia quem vende na loja da venda (venda.registrar), só em venda que a pessoa lê; lê quem lê a venda (o RLS dela:
--     o vendedor as próprias, a gerência as da loja), sempre por link assinado e temporário.
--   * public.venda_anexos: cada documento com o tipo, a descrição (obrigatória em "outro"), o formato, o tamanho, o
--     SHA-256 (conferido pelo servidor ao receber) e quem enviou; retirar (documento errado) guarda o registro como
--     retirado, com quem, quando e o motivo; nada se apaga, e o arquivo continua guardado.
--   * public.venda_anexar_documento(venda, tipo, descricao, caminho, sha256): registra o arquivo que já está no Storage,
--     na venda concluída ou cancelada; quem vendeu ou a gerência da loja; até 20 documentos vigentes por venda; o mesmo
--     caminho devolve o mesmo registro.
--   * public.venda_retirar_anexo(anexo, motivo): a gerência da loja (venda.cancelar), com o motivo, uma vez.
-- Retenção: os documentos ficam enquanto a venda existir (o prazo legal de guarda e o descarte são a decisão D-026, com
-- o jurídico e o contador); a assinatura digital depende de fornecedor e fica fora daqui. Reversão:
-- supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy venda_anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[3] in (select v.id::text from public.vendas v));
create policy venda_anexos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos'
              and array_length(storage.foldername(name), 1) = 3
              and (storage.foldername(name))[2] in (select u::text from privado.unidades_com_permissao('venda.registrar') as u)
              and (storage.foldername(name))[3] in (select v.id::text from public.vendas v));

create table public.venda_anexos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  unidade_id uuid not null,
  venda_id uuid not null references public.vendas (id),
  tipo text not null check (tipo in ('contrato_financiamento', 'termo_garantia', 'contrato_linha', 'comprovante_assinado', 'outro')),
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
  constraint venda_anexo_retirada check (
    (retirado_em is null) = (retirado_por is null) and (retirado_em is null) = (motivo_retirada is null)),
  constraint venda_anexo_descricao_do_outro check (tipo <> 'outro' or descricao is not null)
);
comment on table public.venda_anexos is
  'Documentos da venda (L5d, ORA-CRM-008): contratos e comprovantes no bucket privado "anexos"; retirar só marca; nada se apaga.';
create index venda_anexos_venda on public.venda_anexos (venda_id, enviado_em);
create index venda_anexos_unidade on public.venda_anexos (unidade_id, organizacao_id);
create index venda_anexos_enviado_por on public.venda_anexos (enviado_por);
create index venda_anexos_retirado_por on public.venda_anexos (retirado_por) where retirado_por is not null;
create trigger venda_anexos_auditar after insert or update on public.venda_anexos
  for each row execute function privado.auditar_mudanca();

-- Só a retirada muda, uma vez; o resto é fixo. Nada se apaga.
create or replace function privado.venda_anexo_so_retirada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.retirado_em is not null or new.retirado_em is null
     or (to_jsonb(old) - array['retirado_em', 'retirado_por', 'motivo_retirada'])
        is distinct from (to_jsonb(new) - array['retirado_em', 'retirado_por', 'motivo_retirada']) then
    raise exception 'O documento da venda não muda: só a retirada, uma vez' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger venda_anexos_so_retirada before update on public.venda_anexos
  for each row execute function privado.venda_anexo_so_retirada();
create trigger venda_anexos_sem_apagar before delete on public.venda_anexos
  for each row execute function privado.so_insercao();
create trigger venda_anexos_sem_truncate before truncate on public.venda_anexos
  for each statement execute function privado.so_insercao();

alter table public.venda_anexos enable row level security;
revoke all on public.venda_anexos from anon, authenticated;
grant select on public.venda_anexos to authenticated;
create policy venda_anexos_ler on public.venda_anexos for select to authenticated
  using (venda_id in (select v.id from public.vendas v));

-- -----------------------------------------------------------------------------
-- Anexar (quem vendeu ou a gerência da loja) e retirar (a gerência)
-- -----------------------------------------------------------------------------
create or replace function public.venda_anexar_documento(p_venda uuid, p_tipo text, p_descricao text, p_caminho text, p_sha256 text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  venda public.vendas;
  v_descricao text := nullif(regexp_replace(trim(coalesce(p_descricao, '')), '\s+', ' ', 'g'), '');
  v_formato text;
  v_mime text;
  meta jsonb;
  existente public.venda_anexos;
  novo uuid;
begin
  select * into venda from public.vendas v where v.id = p_venda for update;
  if not coalesce(venda.id is not null and venda.unidade_id = v_unidade
                  and ((venda.vendedor_id = (select auth.uid()) and (select public.tem_permissao('venda.registrar', v_unidade)))
                       or (select public.tem_permissao('venda.ver_unidade', v_unidade))), false) then
    raise exception 'Venda não encontrada' using errcode = 'P0002';
  end if;
  if venda.situacao not in ('concluida', 'cancelada') then
    raise exception 'Anexe o documento depois de concluir a venda' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('contrato_financiamento', 'termo_garantia', 'contrato_linha', 'comprovante_assinado', 'outro') then
    raise exception 'Tipo de documento desconhecido' using errcode = '22023';
  end if;
  if v_descricao is not null and length(v_descricao) not between 3 and 120 then
    raise exception 'Descrição do documento: de 3 a 120 letras' using errcode = '22023';
  end if;
  if p_tipo = 'outro' and v_descricao is null then
    raise exception 'Diga que documento é (descrição de 3 a 120 letras)' using errcode = '22023';
  end if;
  if p_caminho is null or p_caminho !~ ('^' || venda.organizacao_id || '/' || venda.unidade_id || '/' || venda.id || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
    raise exception 'Caminho do documento fora do padrão desta venda' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Resumo SHA-256 do documento inválido' using errcode = '22023';
  end if;
  select * into existente from public.venda_anexos a where a.caminho = p_caminho;
  if found then
    return jsonb_build_object('id', existente.id, 'repetido', true);
  end if;
  v_formato := substring(p_caminho from '\.([a-z]+)$');
  v_mime := case v_formato when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' else 'image/webp' end;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'anexos' and o.name = p_caminho;
  if meta is null then
    raise exception 'O arquivo não chegou ao Storage' using errcode = 'P0002';
  end if;
  if meta ->> 'mimetype' is distinct from v_mime then
    raise exception 'O arquivo no Storage não é do formato informado' using errcode = '22023';
  end if;
  if (select count(*) from public.venda_anexos a where a.venda_id = venda.id and a.retirado_em is null) >= 20 then
    raise exception 'Esta venda já tem 20 documentos: retire um errado antes' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', format('Documento da venda nº %s: %s', venda.numero, replace(p_tipo, '_', ' ')), true);
  insert into public.venda_anexos (organizacao_id, unidade_id, venda_id, tipo, descricao, caminho, formato, bytes, sha256, enviado_por)
  values (venda.organizacao_id, venda.unidade_id, venda.id, p_tipo, v_descricao, p_caminho, v_formato, (meta ->> 'size')::int, p_sha256,
          (select auth.uid()))
  returning id into novo;
  return jsonb_build_object('id', novo, 'repetido', false);
end;
$$;

create or replace function public.venda_retirar_anexo(p_anexo uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidade uuid := (select public.unidade_atual());
  anexo public.venda_anexos;
  v_motivo text;
begin
  select * into anexo from public.venda_anexos a where a.id = p_anexo for update;
  if not coalesce(anexo.id is not null and anexo.unidade_id = v_unidade and (select public.tem_permissao('venda.cancelar', v_unidade)), false) then
    if coalesce(anexo.id is not null and anexo.unidade_id = v_unidade and (select public.tem_permissao('venda.registrar', v_unidade)), false) then
      raise exception 'Retirar documento da venda é da gerência da loja' using errcode = '42501';
    end if;
    raise exception 'Documento não encontrado' using errcode = 'P0002';
  end if;
  if anexo.retirado_em is not null then
    return false;
  end if;
  v_motivo := privado.exigir_motivo(p_motivo);
  perform set_config('ora.motivo', v_motivo, true);
  update public.venda_anexos a set retirado_em = now(), retirado_por = (select auth.uid()), motivo_retirada = v_motivo where a.id = anexo.id;
  return true;
end;
$$;

revoke all on function privado.venda_anexo_so_retirada() from public, anon, authenticated;
revoke all on function public.venda_anexar_documento(uuid, text, text, text, text), public.venda_retirar_anexo(uuid, text) from public, anon;
grant execute on function public.venda_anexar_documento(uuid, text, text, text, text), public.venda_retirar_anexo(uuid, text) to authenticated;
