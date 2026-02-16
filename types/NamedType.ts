import { AbstractType, type CompareResult } from "./AbstractType";
import type { AppliedGenerics } from "./AppliedGenerics";

export class NamedType extends AbstractType {
  constructor(
    public name: string,
    public type: AbstractType,
  ) {
    super();
  }

  override applyTypeArguments(args: AppliedGenerics): AbstractType | Error {
    const r = this.type.applyTypeArguments(args);
    if (r instanceof Error) {
      return r;
    }
    return new NamedType(this.name, r);
  }

  override compareToImpl(other: AbstractType): CompareResult {
    const trivial = this.trivialCompare(other);
    if (trivial) return trivial;
    if (!(other instanceof NamedType) || this.name !== other.name) {
      // Assume names are globally unique
      return { type: "incompatible", reason: "Type names do not match" };
    }
    // Names match, so compare the underlying types
    // e.g. List<T> and List<U> are compatible if T and U are compatible
    return this.type.compareTo(other.type);
  }

  override toString(): string {
    return this.name + this.type.toString();
  }
}
