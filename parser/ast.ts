import type { InputState, Parser } from "./parserLib";
import * as p from "./parserLib";

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
    return `type ${this.name.name}${startWithIdentifier ? ` ${expr}` : expr};`;
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
    return `type ${this.name.name} = ${this.expression.toLangString()};`;
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
    return `type ${this.name.name};`;
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
    return `${this.name.name}(${this.args.map((arg) => arg.toLangString()).join(", ")});`;
  }

  static parse: (parseStmt: Parser<Statement>) => Parser<FunctionCall> = () =>
    p.map(
      p.sequence(
        Identifier.parse(),
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
 * /[a-z_]([a-z0-9_])* /i
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
    return this.name;
  }

  static parse: () => Parser<Identifier> = () =>
    p.map(
      p.regex(/[a-z_]([a-z0-9_])*/i),
      (match, start, end) =>
        new Identifier(match, {
          start: toPlace(start),
          end: toPlace(end),
        }),
    ) as Parser<Identifier>;
}

export abstract class TypeExpression extends AbstractNode {
  static parseExpr: () => Parser<TypeExpression> = () =>
    p.recursive((parseExpr) =>
      p.choice(
        NamedTypeExpr.parse(),
        GenericTypeExpr.parse(parseExpr),
        ObjectTypeExpr.parse(parseExpr),
        TupleTypeExpr.parse(parseExpr),
        UnionTypeExpr.parse(parseExpr),
      ),
    ) as Parser<TypeExpression>;

  static parseAppliedExpr: () => Parser<TypeExpression> = () =>
    p.recursive((parseExpr) =>
      p.choice(
        NamedTypeExpr.parse(parseExpr),
        AppliedGenericExpr.parse(parseExpr),
        ObjectTypeExpr.parse(parseExpr),
        TupleTypeExpr.parse(parseExpr),
        UnionTypeExpr.parse(parseExpr),
      ),
    ) as Parser<TypeExpression>;
}

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
    return `${this.name.name}${this.next ? `${this.next.toLangString()}` : ""}`;
  }

  static parse: (parseExpr?: Parser<TypeExpression>) => Parser<NamedTypeExpr> =
    (parseExpr) =>
      p.map(
        p.sequence(
          Identifier.parse(),
          comment,
          p.optional(parseExpr ?? TypeExpression.parseAppliedExpr()),
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
    return `${this.name.name}${
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
    public next?: TypeExpression,
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
        comment,
        p.optional(parseExpr),
      ),
      ([, , args, , , , next], start, end) =>
        new AppliedGenericExpr(
          args,
          {
            start: toPlace(start),
            end: toPlace(end),
          },
          next || undefined,
        ),
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
    return `${this.name ? `${this.name.name} = ` : ""}${this.value.toLangString()}`;
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
    return `${this.name.name}${this.optional ? "?" : ""}: ${this.value.toLangString()};`;
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
  ) {
    super(range);
  }

  toAstString() {
    return `UnionType([${this.options.map((opt) => opt.toAstString()).join(", ")}])`;
  }

  toLangString() {
    return `${this.options.map((opt) => opt.toLangString()).join(" | ")}`;
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
      ),
      ([, , options], start, end) =>
        options.length === 0
          ? null
          : options.length === 1
            ? options[0]
            : new UnionTypeExpr(options, {
                start: toPlace(start),
                end: toPlace(end),
              }),
    ) as Parser<UnionTypeExpr>;
}
