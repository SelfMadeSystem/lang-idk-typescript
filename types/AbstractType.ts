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
  protected cache = new Map<AbstractType, CompareResult>();
  protected compareList: AbstractType[] = [];

  /**
   * Used in compareTo implementations to handle trivial cases like identity and never types.
   */
  protected trivialCompare(other: AbstractType): CompareResult | null {
    if (this === other) {
      return { type: "equal" };
    }
    if (this.cache.has(other)) {
      return this.cache.get(other)!;
    }
    if (!this.isUnion() && other.isUnion()) {
      return other.compareAgainst(this);
    }
    if (!this.isGeneric() && other.isGeneric()) {
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
   * Gets an underlying type if this is a wrapper type like a reference type.
   */
  getUnderlyingType(): AbstractType {
    return this;
  }

  /**
   * Compares this type to another type, using caching to avoid infinite recursion.
   */
  compareTo(other: AbstractType): CompareResult {
    other = other.getUnderlyingType();
    this.compareList.push(other);
    const result = this.compareToImpl(other);
    this.cache.set(other, result); // should prevent infinite recursion
    this.compareList.pop();
    return result;
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
  protected abstract compareToImpl(other: AbstractType): CompareResult;

  compareAgainst(other: AbstractType): CompareResult {
    return invertCompareResult(this.compareTo(other));
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

  isGeneric(): boolean {
    return false;
  }

  abstract toString(): string;
}

export class NeverType extends AbstractType {
  override compareToImpl(other: AbstractType): CompareResult {
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
