import type { Environment } from "../runtime/Environment";
import { AbstractType, type CompareResult } from "./AbstractType";
import type { AppliedGenerics } from "./AppliedGenerics";

export class NamedType extends AbstractType {
  constructor(
    public name: string,
    public type?: AbstractType,
  ) {
    super();
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType | Error {
    if (!this.type) {
      return this;
    }
    const r = this.type.applyTypeArguments(args, env);
    if (r instanceof Error) {
      return r;
    }
    return new NamedType(this.name, r);
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (!(other instanceof NamedType) || this.name !== other.name) {
      // Assume names are globally unique
      return { type: "incompatible", reason: "Type names do not match" };
    }
    if (!this.type && !other.type) {
      // Both are opaque types with the same name, so they are compatible
      return { type: "equal" };
    }
    if (!this.type || !other.type) {
      // One is opaque and the other is not, so they are incompatible
      return {
        type: "incompatible",
        reason: "One type is opaque and the other is not",
      };
    }
    // Names match, so compare the underlying types
    // e.g. List<T> and List<U> are compatible if T and U are compatible
    return this.type.compareTo(other.type, env);
  }

  override toString(env: Environment): string {
    return this.name + (this.type?.toString(env) ?? "");
  }
}
