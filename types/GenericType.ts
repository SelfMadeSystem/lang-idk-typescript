import { AbstractType, type CompareResult } from "./AbstractType";

export class GenericType extends AbstractType {
  constructor(
    public params: GenericParameter[],
    public type: AbstractType | null = null,
  ) {
    super();
    params.forEach(
      (param, i) => ((param.parent = this), (param.thisIndex = i)),
    );
  }

  resetCompareIndices() {
    this.params.forEach((param) => param.comparisons.clear());
  }

  startComparing() {
    this.params.forEach(
      (param, i) => (param.comparisons.clear(), (param.thisIndex = i)),
    );
  }

  findIndex(param: GenericParameter): number {
    return this.params.findIndex((p) => p === param);
  }

  override compareToImpl(other: AbstractType): CompareResult {
    const trivial = this.trivialCompare(other);
    if (trivial) {
      return trivial;
    }

    if (other instanceof GenericType) {
      this.startComparing();
      other.startComparing();

      if (this.type && other.type) {
        const result = this.type.compareTo(other.type);

        this.resetCompareIndices();
        other.resetCompareIndices();

        return result;
      }

      this.resetCompareIndices();
      other.resetCompareIndices();

      if (!this.type && !other.type) {
        // Compare parameters pairwise
        if (this.params.length !== other.params.length) {
          return {
            type: "incompatible",
            reason: "Generic types have different numbers of parameters",
          };
        }

        for (let i = 0; i < this.params.length; i++) {
          const paramResult = this.params[i]!.compareTo(other.params[i]!);
          if (paramResult.type !== "equal") {
            return {
              type: "incompatible",
              reason: `Generic parameter ${this.params[i]!.name} is not compatible with ${other.params[i]!.name}`,
            };
          }
        }

        return { type: "equal" };
      }

      return {
        type: "incompatible",
        reason: "One generic type has a base type while the other does not",
      };
    }

    this.startComparing();

    if (this.type) {
      const result = this.type.compareTo(other);

      this.resetCompareIndices();

      return result;
    }

    this.resetCompareIndices();

    // if (!this.type && !other.type) {
    //   return { type: "equal" };
    // }

    return {
      type: "incompatible",
      reason: "One generic type has a base type while the other does not",
    };
  }

  override isGeneric(): boolean {
    return true;
  }

  override toString(): string {
    const params = this.params.map((param) => param.toFullString()).join(", ");
    return `<${params}>${this.type ? this.type.toString() : ""}`;
  }
}

export class GenericParameter extends AbstractType {
  public parent: GenericType = null as any;
  public thisIndex: number = -1;
  public comparisons: Map<number, CompareResult> = new Map();

  constructor(
    public name: string,
    public constraint: AbstractType | null = null,
  ) {
    super();
  }

  override compareToImpl(other: AbstractType): CompareResult {
    const trivial = this.trivialCompare(other);
    if (trivial) {
      return trivial;
    }

    if (other instanceof GenericParameter) {
      if (this.parent === other.parent) {
        // since we already checked for trivial equality, if they have the same parent and are not the same instance, they must be different parameters
        return {
          type: "incompatible",
          reason: `Different generic parameters ${this.name} and ${other.name} from the same generic type`,
        };
      }

      const thisIndex = this.thisIndex;
      const otherIndex = other.thisIndex;

      const comparison = this.comparisons.get(otherIndex);
      if (comparison) {
        return comparison;
      }

      const thisConstraint = this.constraint;
      const otherConstraint = other.constraint;

      let result: CompareResult;

      if (thisConstraint && otherConstraint) {
        result = thisConstraint.compareTo(otherConstraint);
      } else if (!thisConstraint && !otherConstraint) {
        result = { type: "equal" };
      } else if (thisConstraint && !otherConstraint) {
        result = { type: "narrower" };
      } else {
        result = { type: "wider" };
      }

      this.comparisons.set(otherIndex, result);
      other.comparisons.set(thisIndex, result);

      if (this.comparisons.size > 1) {
        // we already compared this parameter to another parameter, so we know this generic type must be narrower
        return { type: "narrower" };
      }
      if (other.comparisons.size > 1) {
        // we already compared this parameter to another parameter, so we know this generic type must be wider
        return { type: "wider" };
      }
      return result;
    }

    if (this.constraint) {
      return this.constraint.compareTo(other);
    }

    return { type: "narrower" };
  }

  override toString(): string {
    return this.name;
  }

  toFullString(): string {
    return this.constraint
      ? `${this.name}: ${this.constraint.toString()}`
      : this.name;
  }
}
