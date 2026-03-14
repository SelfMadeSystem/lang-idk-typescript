type BaseBinOp = {
  op: string;
  priority: number;
};
type BaseUniOp = {
  op: string;
};

export const BIN_OPS = [
  { op: "|", priority: 1 },
  { op: "&", priority: 2 },
  { op: "is", priority: 0 },
  { op: "wider", priority: 0 },
  { op: "narrower", priority: 0 },
  { op: "extends", priority: 0 },
] as const satisfies BaseBinOp[];

export type BinOp = (typeof BIN_OPS)[number];

export const UNI_OPS = [{ op: "!" }] as const satisfies BaseUniOp[];

export type UniOp = (typeof UNI_OPS)[number];

export const BIN_MAP = Object.fromEntries(
  BIN_OPS.map((o) => [`bin:${o.op}`, o]),
) as Record<`bin:${(typeof BIN_OPS)[number]["op"]}`, (typeof BIN_OPS)[number]>;

export const UNI_MAP = Object.fromEntries(
  UNI_OPS.map((o) => [`uni:${o.op}`, o]),
) as Record<`uni:${(typeof UNI_OPS)[number]["op"]}`, (typeof UNI_OPS)[number]>;
