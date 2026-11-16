// ONLINE-b: soltar as reservas do site vencidas antes de ler o estoque nunca impede a tela de abrir.
import { afterEach, describe, expect, it, vi } from "vitest";

import { soltarReservasDoSiteVencidas } from "./reservas-vencidas";

type Cliente = Parameters<typeof soltarReservasDoSiteVencidas>[0];
const cliente = (resposta: { data: unknown; error: null | { code: string } }) => {
  const rpc = vi.fn(async () => resposta);
  return { supabase: { rpc } as unknown as Cliente, rpc };
};
afterEach(() => vi.restoreAllMocks());

describe("soltar as reservas do site vencidas (ONLINE-b)", () => {
  it("chama a função do banco e devolve quantas soltou", async () => {
    const { supabase, rpc } = cliente({ data: 2, error: null });
    expect(await soltarReservasDoSiteVencidas(supabase)).toBe(2);
    expect(rpc).toHaveBeenCalledWith("loja_reservas_liberar_vencidas");
  });

  it("sem a migration ou sem permissão, segue calada; outra falha vai para o log, sem quebrar a tela", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const code of ["PGRST202", "42883", "42501"]) expect(await soltarReservasDoSiteVencidas(cliente({ data: null, error: { code } }).supabase)).toBe(0);
    expect(erro).not.toHaveBeenCalled();
    expect(await soltarReservasDoSiteVencidas(cliente({ data: null, error: { code: "57014" } }).supabase)).toBe(0);
    expect(erro).toHaveBeenCalledWith("loja: falha ao soltar as reservas do site vencidas", { codigo: "57014" });
  });
});
