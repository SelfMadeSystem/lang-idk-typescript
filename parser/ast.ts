import type { InputState, Parser } from "./parserLib";
import * as p from "./parserLib";
Error.stackTraceLimit = Infinity;
export const BIN_OPS = ["is", "wider", "narrower", "extends"] as const;
export type BinOp = (typeof BIN_OPS)[number];

export const UNI_OPS = [] as const;
export type UniOp = (typeof UNI_OPS)[number];

export const KEYWORDS = [
  ...BIN_OPS,
  ...UNI_OPS,
  "type",
  "if",
  "elif",
  "else",
] as const;
export type Keyword = (typeof KEYWORDS)[number];

export type Place = {
  index: number;
  line: number;
  column: number;
};

export function toPlace(input: InputState<any>): Place {
  return {
    index: input.index,
    line: input.line,
    column: input.column,
  };
}

export type Range = {
  start: Place;
  end: Place;
};

export class Module {
  readonly type = "Module";

  constructor(
    public name: string,
    public body: Statement[],
  ) {}

  toAstString() {
    return `Module(${this.name}, [${this.body.map((stmt) => stmt.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return this.body.map((stmt) => stmt.toLangString()).join("\n");
  }

  static parse(name: string): Parser<Module> {
    return p.map(
      p.sequence(
        comment,
        p.sepBy(Statement.parseStmt(), comment),
        comment,
        p.eof,
      ),
      ([, body]) => new Module(name, body),
    ) as Parser<Module>;
  }
}

export abstract class AbstractNode {
  public abstract readonly type: string;

  public constructor(public range: Range) {}

  public abstract toAstString(): string;

  public abstract toLangString(): string;
}

export abstract class Statement extends AbstractNode {
  static parseStmt: () => Parser<Statement> = () =>
    p.recursive((parseStmt) =>
      p.choice(
        TypeDef.parse(parseStmt),
        TypeAlias.parse(parseStmt),
        TypeUnit.parse(parseStmt),
        FunctionCall.parse(parseStmt),
      ),
    ) as Parser<Statement>;
}

export const comment = p.many(
  p.choice(
    p.whitespace,
    p.sequence(
      p.literal("//"),
      p.regex(/[^\n]*/),
      p.choice(p.literal("\n"), p.eof),
    ),
    p.sequence(p.literal("/*"), p.regex(/[\s\S]*?(?=\*\/)/), p.literal("*/")),
  ),
);

/**
 * type Name TypeExpression;
 */
export class TypeDef extends Statement {
  public readonly type = "TypeDef";

  constructor(
    public name: Identifier,
    public expression: TypeExpression,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `TypeDef(${this.name.toAstString()}, ${this.expression.toAstString()})`;
  }

  toLangString() {
    const expr = this.expression.toLangString();
    const startWithIdentifier = /^[a-z_]/i.test(expr);
    return `type ${this.name.toLangString()}${startWithIdentifier ? ` ${expr}` : expr};`;
  }

  static parse: (parseStmt: Parser<Statement>) => Parser<TypeDef> = () =>
    p.map(
      p.sequence(
        p.literal("type"),
        comment,
        Identifier.parse(),
        comment,
        TypeExpression.parseExpr(),
        comment,
        p.literal(";"),
      ),
      ([, , name, , expression], start, end) =>
        new TypeDef(name, expression, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<TypeDef>;
}

/**
 * type Name = TypeExpression;
 */
export class TypeAlias extends Statement {
  public readonly type = "TypeAlias";

  constructor(
    public name: Identifier,
    public expression: TypeExpression,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `TypeAlias(${this.name.toAstString()}, ${this.expression.toAstString()})`;
  }

  toLangString() {
    return `type ${this.name.toLangString()} = ${this.expression.toLangString()};`;
  }

  static parse: (parseStmt: Parser<Statement>) => Parser<TypeAlias> = () =>
    p.map(
      p.sequence(
        p.literal("type"),
        comment,
        Identifier.parse(),
        comment,
        p.literal("="),
        comment,
        TypeExpression.parseExpr(),
        comment,
        p.literal(";"),
      ),
      ([, , name, , , , expression], start, end) =>
        new TypeAlias(name, expression, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<TypeAlias>;
}

/**
 * type Name;
 */
export class TypeUnit extends Statement {
  public readonly type = "TypeUnit";

  constructor(
    public name: Identifier,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `TypeUnit(${this.name.toAstString()})`;
  }

  toLangString() {
    return `type ${this.name.toLangString()};`;
  }

  static parse: (parseStmt: Parser<Statement>) => Parser<TypeUnit> = () =>
    p.map(
      p.sequence(
        p.literal("type"),
        comment,
        Identifier.parse(),
        comment,
        p.literal(";"),
      ),
      ([, , name], start, end) =>
        new TypeUnit(name, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<TypeUnit>;
}

/**
 * Name(TypeExpression, TypeExpression, ...)
 *
 * Functions calls for now are just for testing type expressions.
 */
export class FunctionCall extends Statement {
  public readonly type = "FunctionCall";

  constructor(
    public name: Identifier,
    public args: TypeExpression[],
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `FunctionCall(${this.name.toAstString()}, [${this.args.map((arg) => arg.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return `${this.name.toLangString()}(${this.args.map((arg) => arg.toLangString()).join(", ")});`;
  }

  static parse: (parseStmt: Parser<Statement>) => Parser<FunctionCall> = () =>
    p.map(
      p.sequence(
        Identifier.parse(true),
        comment,
        p.literal("("),
        comment,
        p.sepBy(
          TypeExpression.parseExpr(),
          p.sequence(comment, p.literal(","), comment),
        ),
        comment,
        p.literal(")"),
        comment,
        p.literal(";"),
      ),
      ([name, , , , args], start, end) =>
        new FunctionCall(name, args, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<FunctionCall>;
}

/**
 * /[a-z_]([a-z0-9_])* /i (not part of KEYWORDS) or "anything here"
 *
 * String literal follows same rules as in JSON, but only supports double quotes.
 */
export class Identifier extends AbstractNode {
  public readonly type = "Identifier";

  constructor(
    public name: string,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `Identifier(${JSON.stringify(this.name)})`;
  }

  toLangString() {
    if (KEYWORDS.includes(this.name as Keyword)) {
      return JSON.stringify(this.name);
    }
    if (/^[a-z_][a-z0-9_]*$/i.test(this.name)) {
      return this.name;
    }
    return JSON.stringify(this.name);
  }

  static parse: (includeKw?: boolean) => Parser<Identifier> = (
    includeKw = false,
  ) =>
    p.map(
      p.choice(
        Identifier.parseIdentifier(includeKw),
        Identifier.parseStringLiteral(),
      ),
      (match, start, end) =>
        new Identifier(match, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    );

  static parseIdentifier: (includeKw?: boolean) => Parser<string> = (
    includeKw = false,
  ) =>
    includeKw
      ? p.regex(/[a-z_][a-z0-9_]*/i)
      : p.and(
          p.regex(/[a-z_][a-z0-9_]*/i),
          (name) => !KEYWORDS.includes(name as Keyword),
        );

  static parseStringLiteral: () => Parser<string> = () =>
    p.map(
      p.sequence(p.literal('"'), p.regex(/(?:\\.|[^"\\])*/), p.literal('"')),
      ([, content]) => JSON.parse(`"${content}"`),
    );
}

export abstract class TypeExpression extends AbstractNode {
  static parseExpr: () => Parser<TypeExpression> = () =>
    p.recursive((parseExpr) =>
      p.choice(
        UniOpExpr.parse(parseExpr),
        p.map(
          p.sequence(
            p.choice(
              IfExpr.parse(parseExpr),
              NamedTypeExpr.parse(parseExpr),
              GenericTypeExpr.parse(parseExpr),
              ObjectTypeExpr.parse(parseExpr),
              TupleTypeExpr.parse(parseExpr),
              UnionTypeExpr.parse(parseExpr),
              InterTypeExpr.parse(parseExpr),
            ),
            p.optional(
              p.sequence(
                comment,
                p.choice(
                  BinOpExpr.parse(parseExpr),
                  AccessExpr.parse(parseExpr),
                ),
              ),
            ),
          ),
          ([base, after], start, end) => {
            if (!after) {
              return base;
            } else {
              const [, op] = after;
              if (op instanceof BinOpExpr) {
                op.left = base;
                return op;
              } else if (op instanceof AccessExpr) {
                if (op.properties.length === 0) {
                  return base;
                }
                op.object = base;
                return op;
              } else {
                throw new Error("Unknown expression after base expression");
              }
            }
          },
        ),
      ),
    ) as Parser<TypeExpression>;
}

export class BinOpExpr extends TypeExpression {
  public readonly type = "BinOp";

  constructor(
    public left: TypeExpression, // will be null just when parsing
    public operator: BinOp,
    public right: TypeExpression,
    range: Range,
  ) {
    super(range);
  }

  public static parse: (
    parseExpr: Parser<TypeExpression>,
  ) => Parser<BinOpExpr> = (parseExpr) =>
    p.map(
      p.sequence(
        p.choice(...BIN_OPS.map((b) => p.literal(b))),
        comment,
        parseExpr,
      ),
      ([operator, , right], start, end) =>
        new BinOpExpr(null as any, operator, right, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<BinOpExpr>;

  toAstString() {
    return `BinOp(${this.left.toAstString()}, ${JSON.stringify(this.operator)}, ${this.right.toAstString()})`;
  }

  toLangString() {
    return `${this.left.toLangString()} ${this.operator} ${this.right.toLangString()}`;
  }
}

export class UniOpExpr extends TypeExpression {
  public readonly type = "UniOp";

  constructor(
    public operator: UniOp,
    public operand: TypeExpression,
    range: Range,
  ) {
    super(range);
  }

  public static parse: (
    parseExpr: Parser<TypeExpression>,
  ) => Parser<UniOpExpr> = (parseExpr) =>
    p.map(
      p.sequence(
        p.choice(...UNI_OPS.map((b) => p.literal(b))),
        comment,
        parseExpr,
      ),
      ([operator, , operand], start, end) =>
        new UniOpExpr(operator, operand, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<UniOpExpr>;

  toAstString() {
    return `UniOp(${JSON.stringify(this.operator)}, ${this.operand.toAstString()})`;
  }

  toLangString() {
    return `${this.operator} ${this.operand.toLangString()}`;
  }
}

export class IfExpr extends TypeExpression {
  public readonly type = "IfExpr";

  constructor(
    public condition: TypeExpression,
    public thenBranch: TypeExpression,
    public elseBranch: TypeExpression,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `IfExpr(${this.condition.toAstString()}, ${this.thenBranch.toAstString()} ${this.elseBranch.toAstString()})`;
  }

  toLangString() {
    return `if (${this.condition.toLangString()}) ${this.thenBranch.toLangString()} else ${this.elseBranch.toLangString()}`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<IfExpr> = (
    parseExpr,
  ) =>
    p.map(
      p.sequence(
        p.literal("if"),
        comment,
        p.literal("("),
        comment,
        parseExpr,
        comment,
        p.literal(")"),
        comment,
        parseExpr,
        comment,
        p.sequence(comment, p.literal("else"), comment, parseExpr),
      ),
      ([, , , , condition, , , , trueBranch, , elseBranch], start, end) =>
        new IfExpr(condition, trueBranch, elseBranch[3], {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<IfExpr>;
}

/**
 * Name AppliedGenericExpr?
 */
export class NamedTypeExpr extends TypeExpression {
  public readonly type = "NamedType";

  constructor(
    public name: Identifier,
    range: Range,
    public next?: TypeExpression,
  ) {
    super(range);
  }

  toAstString() {
    return `NamedType(${this.name.toAstString()}${this.next ? `, ${this.next.toAstString()}` : ""})`;
  }

  toLangString() {
    return `${this.name.toLangString()}${this.next ? `${this.next.toLangString()}` : ""}`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<NamedTypeExpr> = (
    parseExpr,
  ) =>
    p.map(
      p.sequence(
        Identifier.parse(),
        comment,
        p.optional(AppliedGenericExpr.parse(parseExpr)),
      ),
      ([name, , next], start, end) =>
        new NamedTypeExpr(
          name,
          {
            start: toPlace(start),
            end: toPlace(end),
          },
          next || undefined,
        ),
    ) as Parser<NamedTypeExpr>;
}

/**
 * <A, B, ...> TypeExpression
 */
export class GenericTypeExpr extends TypeExpression {
  public readonly type = "GenericType";

  constructor(
    public args: GenericParameter[],
    range: Range,
    public next?: TypeExpression,
  ) {
    super(range);
  }

  toAstString() {
    return `GenericType([${this.args.map((arg) => arg.toAstString()).join(", ")}]${this.next ? `, ${this.next.toAstString()}` : ""})`;
  }

  toLangString() {
    return `<${this.args.map((arg) => arg.toLangString()).join(", ")}>${this.next ? `${this.next.toLangString()}` : ""}`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<GenericTypeExpr> =
    (parseExpr) =>
      p.map(
        p.sequence(
          p.literal("<"),
          comment,
          p.sepBy(
            GenericParameter.parse(parseExpr),
            p.sequence(comment, p.literal(","), comment),
          ),
          comment,
          p.literal(">"),
          comment,
          p.optional(parseExpr),
        ),
        ([, , args, , , , next], start, end) =>
          new GenericTypeExpr(
            args,
            {
              start: toPlace(start),
              end: toPlace(end),
            },
            next || undefined,
          ),
      ) as Parser<GenericTypeExpr>;
}

/**
 * A
 * A: Constraint
 * A = Default
 * A: Constraint = Default
 */
export class GenericParameter extends TypeExpression {
  public readonly type = "GenericParameter";

  constructor(
    public name: Identifier,
    range: Range,
    public constraint?: TypeExpression,
    public defaultType?: TypeExpression,
  ) {
    super(range);
  }

  toAstString() {
    return `GenericParameter(${this.name.toAstString()}${
      this.constraint ? `, constraint = ${this.constraint.toAstString()}` : ""
    }${
      this.defaultType ? `, default = ${this.defaultType.toAstString()}` : ""
    })`;
  }

  toLangString() {
    return `${this.name.toLangString()}${
      this.constraint ? `: ${this.constraint.toLangString()}` : ""
    }${this.defaultType ? ` = ${this.defaultType.toLangString()}` : ""}`;
  }

  static parse: (
    parseExpr: Parser<TypeExpression>,
  ) => Parser<GenericParameter> = (parseExpr) =>
    p.map(
      p.sequence(
        Identifier.parse(),
        comment,
        p.optional(p.sequence(p.literal(":"), comment, parseExpr)),
        comment,
        p.optional(p.sequence(p.literal("="), comment, parseExpr)),
      ),
      ([name, , constraint, , defaultType], start, end) =>
        new GenericParameter(
          name,
          {
            start: toPlace(start),
            end: toPlace(end),
          },
          constraint ? constraint[2] : undefined,
          defaultType ? defaultType[2] : undefined,
        ),
    ) as Parser<GenericParameter>;
}

export class AppliedGenericExpr extends TypeExpression {
  public readonly type = "AppliedGenericType";

  constructor(
    public args: AppliedGenericArgument[],
    range: Range,
    public next?: TypeExpression, // TODO: Figure out of this is necessary
  ) {
    super(range);
  }

  toAstString() {
    return `AppliedGenericType([${this.args.map((arg) => arg.toAstString()).join(", ")}]${this.next ? `, ${this.next.toAstString()}` : ""})`;
  }

  toLangString() {
    return `<${this.args.map((arg) => arg.toLangString()).join(", ")}>${this.next ? `${this.next.toLangString()}` : ""}`;
  }

  static parse: (
    parseExpr: Parser<TypeExpression>,
  ) => Parser<AppliedGenericExpr> = (parseExpr) =>
    p.map(
      p.sequence(
        p.literal("<"),
        comment,
        p.sepBy(
          AppliedGenericArgument.parse(parseExpr),
          p.sequence(comment, p.literal(","), comment),
        ),
        comment,
        p.literal(">"),
      ),
      ([, , args], start, end) =>
        new AppliedGenericExpr(args, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<AppliedGenericExpr>;
}

export class AppliedGenericArgument extends TypeExpression {
  public readonly type = "AppliedGenericArgument";

  constructor(
    public name: Identifier | null,
    public value: TypeExpression,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `AppliedGenericArgument(${this.name ? this.name.toAstString() : "null"}, ${this.value.toAstString()})`;
  }

  toLangString() {
    return `${this.name ? `${this.name.toLangString()} = ` : ""}${this.value.toLangString()}`;
  }

  static parse: (
    parseExpr: Parser<TypeExpression>,
  ) => Parser<AppliedGenericArgument> = (parseExpr) =>
    p.map(
      p.choice(
        p.sequence(
          Identifier.parse(),
          comment,
          p.literal("="),
          comment,
          parseExpr,
        ),
        parseExpr,
      ),
      (result, start, end) => {
        if (Array.isArray(result)) {
          const [name, , , , value] = result;
          return new AppliedGenericArgument(name, value, {
            start: toPlace(start),
            end: toPlace(end),
          });
        } else {
          return new AppliedGenericArgument(null, result, {
            start: toPlace(start),
            end: toPlace(end),
          });
        }
      },
    ) as Parser<AppliedGenericArgument>;
}

export class ObjectTypeExpr extends TypeExpression {
  public readonly type = "ObjectType";

  constructor(
    public properties: ObjectProperty[],
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `ObjectType([${this.properties.map((prop) => prop.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return `{
${this.properties.map((prop) => `  ${prop.toLangString()}`).join("\n")}
}`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<ObjectTypeExpr> =
    (parseExpr) =>
      p.map(
        p.sequence(
          p.literal("{"),
          comment,
          p.sepBy(
            ObjectProperty.parse(parseExpr),
            p.sequence(
              comment,
              p.choice(p.literal(","), p.literal(";")),
              comment,
            ),
          ),
          comment,
          p.literal("}"),
        ),
        ([, , properties], start, end) =>
          new ObjectTypeExpr(properties, {
            start: toPlace(start),
            end: toPlace(end),
          }),
      ) as Parser<ObjectTypeExpr>;
}

export class ObjectProperty extends TypeExpression {
  public readonly type = "ObjectProperty";

  constructor(
    public name: Identifier,
    public value: TypeExpression,
    public optional: boolean,
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `ObjectProperty(${this.name.toAstString()}, ${this.value.toAstString()}, ${this.optional})`;
  }

  toLangString() {
    return `${this.name.toLangString()}${this.optional ? "?" : ""}: ${this.value.toLangString()};`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<ObjectProperty> =
    (parseExpr) =>
      p.map(
        p.sequence(
          Identifier.parse(),
          p.optional(p.literal("?")),
          comment,
          p.literal(":"),
          comment,
          parseExpr,
        ),
        ([name, optional, , , , value], start, end) =>
          new ObjectProperty(name, value, optional !== null, {
            start: toPlace(start),
            end: toPlace(end),
          }),
      ) as Parser<ObjectProperty>;
}

export class TupleTypeExpr extends TypeExpression {
  public readonly type = "TupleType";

  constructor(
    public elements: TypeExpression[],
    range: Range,
  ) {
    super(range);
  }

  toAstString() {
    return `TupleType([${this.elements.map((el) => el.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return `[${this.elements.map((el) => el.toLangString()).join(", ")}]`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<TupleTypeExpr> = (
    parseExpr,
  ) =>
    p.map(
      p.sequence(
        p.literal("["),
        comment,
        p.sepBy(parseExpr, p.sequence(comment, p.literal(","), comment)),
        comment,
        p.literal("]"),
      ),
      ([, , elements], start, end) =>
        new TupleTypeExpr(elements, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<TupleTypeExpr>;
}

export class UnionTypeExpr extends TypeExpression {
  public readonly type = "UnionType";

  constructor(
    public options: TypeExpression[],
    range: Range,
    public appliedGeneric?: AppliedGenericExpr,
  ) {
    super(range);
  }

  toAstString() {
    return `UnionType([${this.options.map((opt) => opt.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return `(${this.options.map((opt) => opt.toLangString()).join(" | ")})`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<UnionTypeExpr> = (
    parseExpr,
  ) =>
    p.map(
      p.sequence(
        p.literal("("),
        comment,
        p.sepBy(parseExpr, p.sequence(comment, p.literal("|"), comment)),
        comment,
        p.literal(")"),
        comment,
        p.optional(AppliedGenericExpr.parse(parseExpr)),
      ),
      ([, , options, , , , appliedGeneric], start, end) =>
        options.length === 0
          ? null
          : new UnionTypeExpr(
              options,
              {
                start: toPlace(start),
                end: toPlace(end),
              },
              appliedGeneric || undefined,
            ),
    ) as Parser<UnionTypeExpr>;
}

export class InterTypeExpr extends TypeExpression {
  public readonly type = "InterType";

  constructor(
    public expressions: TypeExpression[],
    range: Range,
    public appliedGeneric?: AppliedGenericExpr,
  ) {
    super(range);
  }

  toAstString() {
    return `InterType([${this.expressions.map((opt) => opt.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return `(${this.expressions.map((opt) => opt.toLangString()).join(" & ")})`;
  }

  static parse: (parseExpr: Parser<TypeExpression>) => Parser<InterTypeExpr> = (
    parseExpr,
  ) =>
    p.map(
      p.sequence(
        p.literal("("),
        comment,
        p.sepBy(parseExpr, p.sequence(comment, p.literal("&"), comment)),
        comment,
        p.literal(")"),
        comment,
        p.optional(AppliedGenericExpr.parse(parseExpr)),
      ),
      ([, , options, , , , appliedGeneric], start, end) =>
        options.length === 0
          ? null
          : new InterTypeExpr(
              options,
              {
                start: toPlace(start),
                end: toPlace(end),
              },
              appliedGeneric || undefined,
            ),
    ) as Parser<InterTypeExpr>;
}

export class AccessExpr extends TypeExpression {
  public readonly type = "Access";

  constructor(
    public object: TypeExpression, // will be null just when parsing
    public properties: Identifier[],
    range: Range,
  ) {
    super(range);
  }

  public static parse: (
    parseExpr: Parser<TypeExpression>,
  ) => Parser<AccessExpr> = (parseExpr) =>
    p.map(
      p.many(p.sequence(p.literal("."), comment, Identifier.parse(), comment)),
      (accesses) =>
        new AccessExpr(
          null as any,
          accesses.map(([, , id]) => id),
          {
            start: { index: 0, line: 0, column: 0 },
            end: { index: 0, line: 0, column: 0 },
          },
        ),
      // The actual object will be filled in by the caller (e.g. NamedTypeExpr)
    ) as Parser<AccessExpr>;

  public override toAstString(): string {
    return `Access(${this.object.toAstString()}, ${this.properties.map((p) => p.toAstString()).join(", ")})`;
  }

  public override toLangString(): string {
    return `${this.object.toLangString()}.${this.properties.map((p) => p.toLangString()).join(".")}`;
  }
}
