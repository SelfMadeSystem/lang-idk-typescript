import { UnionType } from "./UnionType";

export type CompareResult =
  | {
      type: "equal";
    }
  | {
      type: "wider";
    }
  | {
      type: "narrower";
    }
  | {
      type: "incompatible";
      reason: string;
    };

export function invertCompareResult(result: CompareResult): CompareResult {
  switch (result.type) {
    case "equal":
      return { type: "equal" };
    case "wider":
      return { type: "narrower" };
    case "narrower":
      return { type: "wider" };
    case "incompatible":
      return { type: "incompatible", reason: result.reason };
  }
}

export abstract class AbstractType {
  /**
   * Used in compareTo implementations to handle trivial cases like identity and never types.
   */
  protected trivialCompare(other: AbstractType): CompareResult | null {
    if (this === other) {
      return { type: "equal" };
    }
    if (other.isUnion()) {
      return other.compareAgainst(this);
    }
    if (other.isNever()) {
      return { type: "wider" };
    }
    if (this.isNever()) {
      return { type: "narrower" };
    }
    return null;
  }

  /**
   * Compares this type to another type.
   * Returns a CompareResult indicating the relationship between the two types.
   *
   * - "equal": both types are identical.
   * - "wider": this type is a supertype of the other type.
   * - "narrower": this type is a subtype of the other type.
   * - "incomparable": the types are unrelated, with a reason provided.
   *
   * `a.compareTo(b)` should yield the inverse relationship of `b.compareTo(a)`.
   *
   * @param other The other type to compare against.
   * @returns A CompareResult indicating the relationship.
   */
  abstract compareTo(other: AbstractType): CompareResult;

  compareAgainst(other: AbstractType): CompareResult {
    return other.compareTo(this);
  }

  isAssignableTo(other: AbstractType): boolean {
    const result = this.compareTo(other);
    return result.type === "equal" || result.type === "narrower";
  }

  equals(other: AbstractType): boolean {
    const result = this.compareTo(other);
    return result.type === "equal";
  }

  isNever(): boolean {
    return false;
  }

  isUnion(): boolean {
    return false;
  }

  abstract toString(): string;
}

export class NeverType extends AbstractType {
  override compareTo(other: AbstractType): CompareResult {
    if (other instanceof NeverType) {
      return { type: "equal" };
    }
    return { type: "narrower" };
  }

  override isNever(): boolean {
    return true;
  }

  override toString(): string {
    return "never";
  }
}
