// ⚠️ DADOS FICTÍCIOS DA DEMONSTRAÇÃO. Nomes de pessoas, metas e lojas 02–14 são inventados
// (a lista oficial das 14 lojas ainda não chegou). Nunca copiar para o banco real.

export type Loja = { codigo: string; nome: string; piloto: boolean; bairro: string; metaDia: number };

const BAIRROS = ["Centro", "Boa Vista", "Portão", "Água Verde", "Batel", "Cajuru", "Pinheirinho", "Xaxim", "Bacacheri", "CIC", "Boqueirão", "Hauer", "Cabral"];

export const LOJAS: readonly Loja[] = [
  { codigo: "santa-candida", nome: "Santa Cândida", piloto: true, bairro: "Santa Cândida", metaDia: 2_400_000 },
  ...Array.from({ length: 13 }, (_, i) => {
    const n = i + 2;
    return {
      codigo: `loja-${String(n).padStart(2, "0")}`,
      nome: `Loja ${String(n).padStart(2, "0")}`,
      piloto: false,
      bairro: BAIRROS[i] ?? "—",
      metaDia: 1_800_000 + ((n * 97_531) % 600_000),
    };
  }),
];

export const UNIDADES_ESPECIAIS = [
  { codigo: "loja-online", nome: "Loja Online", tipo: "Online", observacao: "CNPJ emissor ainda a definir (decisão P10)" },
  { codigo: "assistencia", nome: "Assistência (técnico central)", tipo: "Assistência", observacao: "Guarda aparelhos de clientes; não é estoque de venda" },
] as const;

export const nomeDaLoja = (codigo: string) =>
  LOJAS.find((l) => l.codigo === codigo)?.nome ?? UNIDADES_ESPECIAIS.find((u) => u.codigo === codigo)?.nome ?? codigo;

export type Papel = "vendedor" | "gerente" | "dono" | "administrador" | "tecnico";

export type Pessoa = {
  id: string;
  nome: string;
  papel: Papel;
  lojas: readonly string[];
  metaDia: number;
  status: "ativo" | "bloqueado";
  ultimoAcesso: string;
  /** Turno de hoje por loja, em minutos desde 00:00 (o vendedor que trabalha em duas lojas troca no meio do dia). */
  turnos: Readonly<Record<string, readonly [number, number]>>;
};

const DIA_TODO = [9 * 60, 20 * 60] as const;

const NOMES = [
  "Bruno Teixeira", "Camila Rocha", "Diego Martins", "Eduarda Lima", "Felipe Nunes", "Gabriela Dias", "Heitor Ramos",
  "Isabela Moura", "João Vieira", "Karina Lopes", "Leonardo Reis", "Nicolas Prado", "Olívia Campos", "Pedro Barros",
  "Renata Freitas", "Sérgio Pinto", "Tatiane Melo", "Vinícius Araújo", "Yasmin Cardoso", "Wagner Duarte", "Bianca Torres",
  "Caio Mendes", "Débora Farias", "Enzo Correia", "Gustavo Moreira", "Helena Castro", "Igor Batista", "Larissa Gomes",
  "Matheus Ribeiro", "Paula Santana", "Thiago Monteiro",
];

const vendedor = (id: string, nome: string, lojas: string[], metaDia: number, turnos?: Record<string, readonly [number, number]>, status: Pessoa["status"] = "ativo"): Pessoa => ({
  id, nome, papel: "vendedor", lojas, metaDia, status, ultimoAcesso: "hoje",
  turnos: turnos ?? Object.fromEntries(lojas.slice(0, 1).map((l) => [l, DIA_TODO])),
});

// Santa Cândida (piloto): Ana e Rafael trabalham em duas lojas e trocam de loja no meio do dia.
const DA_PILOTO: Pessoa[] = [
  vendedor("ana", "Ana Souza", ["santa-candida", "loja-03"], 600_000, { "santa-candida": [9 * 60, 14 * 60], "loja-03": [14 * 60, 20 * 60] }),
  vendedor("lucas", "Lucas Pereira", ["santa-candida", "loja-03"], 600_000, { "santa-candida": DIA_TODO }),
  vendedor("julia", "Júlia Costa", ["santa-candida"], 500_000),
  vendedor("rafael", "Rafael Alves", ["santa-candida", "loja-07"], 500_000, { "santa-candida": [9 * 60, 15 * 60], "loja-07": [15 * 60, 20 * 60] }),
];

// Lojas 02 a 14: 2 ou 3 vendedores cada (31 no total).
const DAS_DEMAIS: Pessoa[] = (() => {
  const lista: Pessoa[] = [];
  let k = 0;
  LOJAS.slice(1).forEach((loja, i) => {
    const quantos = i < 5 ? 3 : 2;
    for (let j = 0; j < quantos; j++) {
      const nome = NOMES[k] ?? `Vendedor ${k + 1}`;
      const meta = Math.round(loja.metaDia / quantos / 50_000) * 50_000 + (j - 1) * 50_000;
      lista.push(vendedor(`v${String(k + 1).padStart(2, "0")}`, nome, [loja.codigo], meta, undefined, k === 12 ? "bloqueado" : "ativo"));
      k++;
    }
  });
  return lista;
})();

export const VENDEDORES: readonly Pessoa[] = [...DA_PILOTO, ...DAS_DEMAIS];

export const PESSOAS: readonly Pessoa[] = [
  ...VENDEDORES,
  { id: "marcos", nome: "Marcos Lima", papel: "gerente", lojas: ["santa-candida"], metaDia: 0, status: "ativo", ultimoAcesso: "hoje", turnos: { "santa-candida": DIA_TODO } },
  { id: "ricardo", nome: "Ricardo Andrade", papel: "dono", lojas: LOJAS.map((l) => l.codigo), metaDia: 0, status: "ativo", ultimoAcesso: "hoje", turnos: {} },
  { id: "patricia", nome: "Patrícia Andrade", papel: "dono", lojas: LOJAS.map((l) => l.codigo), metaDia: 0, status: "ativo", ultimoAcesso: "ontem", turnos: {} },
  { id: "admin", nome: "Admin do sistema", papel: "administrador", lojas: LOJAS.map((l) => l.codigo), metaDia: 0, status: "ativo", ultimoAcesso: "hoje", turnos: {} },
  { id: "teo", nome: "Téo Martins", papel: "tecnico", lojas: ["assistencia"], metaDia: 0, status: "ativo", ultimoAcesso: "hoje", turnos: { assistencia: DIA_TODO } },
];

export const pessoa = (id: string) => PESSOAS.find((p) => p.id === id);
export const nomeDaPessoa = (id: string) => pessoa(id)?.nome ?? id;
export const primeiroNome = (id: string) => nomeDaPessoa(id).split(" ")[0] ?? id;

export const NOMES_PAPEIS: Record<Papel, string> = {
  vendedor: "Vendedor",
  gerente: "Gerente",
  dono: "Dono",
  administrador: "Administrador",
  tecnico: "Técnico",
};
