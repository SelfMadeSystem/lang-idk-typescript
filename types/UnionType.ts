import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import type { AppliedGenerics } from "./AppliedGenerics";

export class UnionType extends AbstractType {
  private constructor(public types: AbstractType[]) {
    super();
  }

  static create(types: AbstractType[], env: Environment): AbstractType {
    const flattened: AbstractType[] = [];
    for (const t of types) {
      if (t instanceof UnionType) {
        flattened.push(...t.types);
      } else if (!t.isNever()) {
        flattened.push(t);
      }
    }
    // Remove duplicates
    const unique = flattened.filter(
      (t, index) => flattened.findIndex((ut) => ut.equals(t, env)) === index,
    );
    if (unique.length === 0) return NeverType.get();
    if (unique.length === 1) return unique[0]!;
    return new UnionType(unique);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    const newTypes: AbstractType[] = [];
    for (const t of this.types) {
      const r = t.applyTypeArguments(args, env);
      if (r instanceof Error) {
        throw new Error(
          `Failed to apply type arguments to union type: ${r.message}`,
        );
      }
      newTypes.push(r);
    }
    return UnionType.create(newTypes, env);
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    // don't trivial compare because it will cause infinite recursion with unions
    if (this === other) {
      return { type: "equal" };
    }
    if (other.isNever()) {
      return { type: "wider" };
    }
    if (this.isNever()) {
      return { type: "narrower" };
    }
    if (other instanceof UnionType) {
      // A | B narrower than A | B | C
      // A | B | C wider than A | B
      // A | B equal to A | B
      // A | B vs C | D:
      // - A | B narrower than C | D if A narrower than C | D and B narrower than C | D
      // - A | B wider than C | D if A wider than C | D or B wider than C | D
      const thisTypes = this.types;
      const otherTypes = other.types;
      const thisNarrower = thisTypes.every((t) =>
        otherTypes.some((ot) => t.isAssignableTo(ot, env)),
      );
      const thisWider = otherTypes.every((ot) =>
        thisTypes.some((t) => ot.isAssignableTo(t, env)),
      );
      if (thisNarrower && !thisWider) return { type: "narrower" };
      if (!thisNarrower && thisWider) return { type: "wider" };
      if (thisNarrower && thisWider) return { type: "equal" };
      return {
        type: "incompatible",
        reason: "Union types have no common assignable types",
      };
    }
    // A | B narrower than C if A narrower than C and B narrower than C
    // A | B wider than C if A wider than C or B wider than C
    const thisNarrower = this.types.every((t) => t.isAssignableTo(other, env));
    const thisWider = this.types.some((t) => other.isAssignableTo(t, env));
    if (thisNarrower && !thisWider) return { type: "narrower" };
    if (!thisNarrower && thisWider) return { type: "wider" };
    if (thisNarrower && thisWider) return { type: "equal" };
    return {
      type: "incompatible",
      reason: "Union type is not assignable to the other type",
    };
  }

  override getProperty(name: string, env: Environment): AbstractType {
    const props = this.types.map((t) => t.getProperty(name, env));
    return UnionType.create(props, env);
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    const newTypes = this.types.map((t) => t.intersectWith(other, env));
    return UnionType.create(newTypes, env);
  }

  override isUnion(): boolean {
    return true;
  }

  override toString(env: Environment): string {
    return `(${this.types.map((t) => t.toString(env)).join(" | ")})`;
  }

  override debugString(): string {
    const typesStr = this.types.map((t) => t.debugString()).join(" | ");
    return `UnionType(${typesStr})`;
  }
}
