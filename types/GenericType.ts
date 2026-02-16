import type { Environment } from "../runtime/Environment";
import { AbstractType, type CompareResult } from "./AbstractType";
import { AppliedGenerics } from "./AppliedGenerics";

export class GenericType extends AbstractType {
  constructor(
    public params: GenericParameter[],
    public type: AbstractType,
  ) {
    super();
    params.forEach(
      (param, i) => ((param.parent = this), (param.thisIndex = i)),
    );
  }

  pushParameter(param: GenericParameter) {
    param.parent = this;
    param.thisIndex = this.params.length;
    this.params.push(param);
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

  override applyTypeArguments(args: AppliedGenerics, env: Environment): AbstractType | Error {
    const populateResult = args.populateFromGeneric(this);
    if (populateResult instanceof Error) {
      return populateResult;
    }
    if (populateResult.length > 0) {
      const newGeneric = new GenericType(
        populateResult.map((t) => new GenericParameter(t.name)),
        this.type,
      );
      const newApplied = new AppliedGenerics(
        [],
        Object.fromEntries(newGeneric.params.map((p) => [p.name, p])),
      );
      for (let i = 0; i < newGeneric.params.length; i++) {
        const param = newGeneric.params[i]!;
        const originalParam = this.params[i]!;
        const newConstraint =
          originalParam.constraint?.applyTypeArguments(newApplied, env);
        if (newConstraint instanceof Error) {
          return new Error(
            `Failed to apply type arguments to constraint of generic parameter ${param.name}: ${newConstraint.message}`,
          );
        }
        param.constraint = newConstraint || null;
        const newDefault =
          originalParam.defaultType?.applyTypeArguments(newApplied, env);
        if (newDefault instanceof Error) {
          return new Error(
            `Failed to apply type arguments to default type of generic parameter ${param.name}: ${newDefault.message}`,
          );
        }
        param.defaultType = newDefault || null;
      }

      args.argsByName.set(
        this,
        new Map(newGeneric.params.map((p) => [p.name, p])),
      );
    }
    const r = this.type.applyTypeArguments(args, env);
    if (r instanceof Error) {
      return new Error(
        `Failed to apply type arguments to generic type: ${r.message}`,
      );
    }
    return r;
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) {
      return trivial;
    }

    if (other instanceof GenericType) {
      this.startComparing();
      other.startComparing();

      if (this.type && other.type) {
        const result = this.type.compareTo(other.type, env);

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
          const paramResult = this.params[i]!.compareTo(other.params[i]!, env);
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
      const result = this.type.compareTo(other, env);

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
    public defaultType: AbstractType | null = null,
  ) {
    super();
  }

  override applyTypeArguments(args: AppliedGenerics, env: Environment): AbstractType | Error {
    if (args.argsByName.has(this.parent)) {
      const arg = args.argsByName.get(this.parent)!.get(this.name);
      if (arg) {
        if (this.constraint) {
          const constraintResult = arg.compareTo(this.constraint, env);
          if (
            constraintResult.type === "incompatible" ||
            constraintResult.type === "wider"
          ) {
            return new Error(
              `Type argument ${arg.toString()} does not satisfy constraint ${this.constraint.toString()} for generic parameter ${this.name}.`,
            );
          }
        }
        return arg;
      }
    }
    if (this.defaultType) {
      return this.defaultType.applyTypeArguments(args, env);
    }
    return this;
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
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
        result = thisConstraint.compareTo(otherConstraint, env);
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
      return this.constraint.compareTo(other, env);
    }

    return { type: "narrower" };
  }

  override toString(): string {
    return this.name;
  }

  toFullString(): string {
    const s1 = this.constraint
      ? `${this.name}: ${this.constraint.toString()}`
      : this.name;
    const s2 = this.defaultType ? ` = ${this.defaultType.toString()}` : "";
    return s1 + s2;
  }
}
