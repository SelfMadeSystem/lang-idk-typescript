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
    this.params.forEach(
      (param) => ((param.compareIndex = -1), (param.comparing = true)),
    );
  }

  startComparing() {
    this.params.forEach(
      (param, i) => (
        (param.compareIndex = -1),
        (param.thisIndex = i),
        (param.comparing = true),
        (param.compareResult = null)
      ),
    );
  }

  findIndex(param: GenericParameter): number {
    return this.params.findIndex((p) => p === param);
  }

  override compareTo(other: AbstractType): CompareResult {
    const trivial = this.trivialCompare(other);
    if (trivial) {
      return trivial;
    }

    if (other instanceof GenericType) {
      this.startComparing();
      other.startComparing();

      for (let i = 0; i < this.params.length; i++) {
        const paramA = this.params[i]!;

        if (paramA.constraint === null) {
          continue;
        }

        const indexB = other.params.findIndex(
          (param) =>
            param.compareIndex === -1 &&
            param.constraint &&
            param.constraint.equals(paramA.constraint!),
        );
        if (indexB === -1) {
          continue;
        }

        const paramB = other.params[indexB]!;
        paramA.compareIndex = i;
        paramB.compareIndex = indexB;
        paramA.compareResult = { type: "equal" };
        paramB.compareResult = { type: "equal" };
      }

      if (this.type && other.type) {
        const result = this.type.compareTo(other.type);

        this.resetCompareIndices();
        other.resetCompareIndices();

        return result;
      }

      this.resetCompareIndices();
      other.resetCompareIndices();

      if (!this.type && !other.type) {
        return { type: "equal" };
      }

      return {
        type: "incompatible",
        reason: "One generic type has a base type while the other does not",
      };
    }

    return {
      type: "incompatible",
      reason: "Cannot compare generic type to non-generic type",
    };
  }

  override toString(): string {
    const params = this.params.map((param) => param.toFullString()).join(", ");
    return `<${params}>${this.type ? this.type.toString() : ""}`;
  }
}

export class GenericParameter extends AbstractType {
  public parent: GenericType = null as any;
  public thisIndex: number = -1;
  public compareIndex: number = -1;
  public comparing: boolean = false;
  public compareResult: CompareResult | null = null;

  constructor(
    public name: string,
    public constraint: AbstractType | null = null,
  ) {
    super();
  }

  override compareTo(other: AbstractType): CompareResult {
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

      if (this.compareIndex !== -1 && this.compareIndex === other.thisIndex) {
        return this.compareResult || { type: "equal" };
      }
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
