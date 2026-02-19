import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import { AliasType } from "./AliasType";
import { AppliedGenerics } from "./AppliedGenerics";
import { LazyAccessType, LazyIntersectType } from "./LazyType";

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

  override isIncomplete(env: Environment): boolean {
    return true;
  }

  override getSimplifiedType(env: Environment): AbstractType {
    const simplifiedType = this.type.getSimplifiedType(env);
    if (simplifiedType === this.type) {
      return this;
    }
    const newParams = this.params.map(
      (param) =>
        new GenericParameter(param.name, param.constraint, param.defaultType),
    );
    const replaceArgs = new AppliedGenerics(newParams, {});
    replaceArgs.argsByName.set(
      this,
      new Map(newParams.map((p) => [p.name, p])),
    );
    return new GenericType(
      newParams,
      simplifiedType.applyTypeArguments(replaceArgs, env),
    );
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    const argsString =
      "$" + this.toString(env) + ";" + args.toString(env) + "$";

    const lookup = env.lookup(argsString);
    if (lookup) {
      return lookup;
    }

    const alias = new AliasType(argsString);

    alias.overrideName = `<${args.toString(env)}>`;

    env.setTemporary(argsString, alias);

    const populateResult = args.populateFromGeneric(this);

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
        const originalParam = this.params.find((p) => p.name === param.name);
        if (!originalParam) {
          throw new Error(
            `Failed to find original generic parameter for ${param.name} when applying type arguments to generic type.`,
          );
        }

        const newConstraint = originalParam.constraint?.applyTypeArguments(
          newApplied,
          env,
        );
        if (newConstraint instanceof Error) {
          throw new Error(
            `Failed to apply type arguments to constraint of generic parameter ${param.name}: ${newConstraint.message}`,
          );
        }

        param.constraint = newConstraint || null;
        const newDefault = originalParam.defaultType?.applyTypeArguments(
          newApplied,
          env,
        );
        if (newDefault instanceof Error) {
          throw new Error(
            `Failed to apply type arguments to default type of generic parameter ${param.name}: ${newDefault.message}`,
          );
        }
        param.defaultType = newDefault || null;
      }

      args.argsByName.set(
        newGeneric,
        new Map(newGeneric.params.map((p) => [p.name, p])),
      );

      newGeneric.type = this.type.applyTypeArguments(args, env);
      env.setTemporary(argsString, newGeneric);
      return newGeneric;
    }

    const r = this.type.applyTypeArguments(args, env);
    env.setTemporary(argsString, r);
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

      const result = this.type.compareTo(other.type, env);

      this.resetCompareIndices();
      other.resetCompareIndices();

      return result;
    }

    this.startComparing();

    const result = this.type.compareTo(other, env);

    this.resetCompareIndices();

    return result;
  }

  override getProperty(name: string, env: Environment): AbstractType {
    return this.type.getProperty(name, env);
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    if (other instanceof NeverType) {
      return other;
    }
    if (!(other instanceof GenericType))
      try {
        this.params.forEach(
          (param) => (
            (param.interConstraint = param.constraint),
            (param.merging = true)
          ),
        );
        const intersected = this.type.intersectWith(other, env);
        if (intersected instanceof NeverType) {
          return intersected;
        }
        const newParams = this.params.map(
          (param) =>
            new GenericParameter(
              param.name,
              param.interConstraint,
              param.defaultType,
            ),
        );
        const replaceArgs = new AppliedGenerics(newParams, {});
        replaceArgs.argsByName.set(
          this,
          new Map(newParams.map((p) => [p.name, p])),
        );
        return new GenericType(
          newParams,
          intersected.applyTypeArguments(replaceArgs, env),
        );
      } finally {
        this.params.forEach((param) => (param.merging = false));
      }
    try {
      this.params.forEach(
        (param) => (
          (param.interConstraint = param.constraint),
          (param.merging = true)
        ),
      );
      other.params.forEach(
        (param) => (
          (param.interConstraint = param.constraint),
          (param.merging = true)
        ),
      );
      const intersected = this.type.intersectWith(other.type, env);

      if (intersected instanceof NeverType) {
        return intersected;
      }

      const newThisParams = this.params.map(
        (param) =>
          new GenericParameter(
            param.name + "0",
            param.interConstraint,
            param.defaultType,
          ),
      );
      const newOtherParams = other.params.map(
        (param) =>
          new GenericParameter(
            param.name + "1",
            param.interConstraint,
            param.defaultType,
          ),
      );

      const newParams = [...newThisParams, ...newOtherParams];

      const replaceArgs = new AppliedGenerics(newParams, {});
      replaceArgs.argsByName.set(
        this,
        new Map(newThisParams.map((p, i) => [this.params[i]!.name, p])),
      );
      replaceArgs.argsByName.set(
        other,
        new Map(newOtherParams.map((p, i) => [other.params[i]!.name, p])),
      );

      newParams.forEach((param) => {
        if (param.constraint) {
          param.constraint = param.constraint.applyTypeArguments(
            replaceArgs,
            env,
          );
        }
      });

      return new GenericType(
        newParams,
        intersected.applyTypeArguments(replaceArgs, env),
      );
    } finally {
      this.params.forEach((param) => (param.merging = false));
      other.params.forEach((param) => (param.merging = false));
    }
  }

  override isGeneric(): boolean {
    return true;
  }

  override toString(env: Environment): string {
    const params = this.params
      .map((param) => param.toFullString(env))
      .join(", ");
    return `<${params}>${this.type ? this.type.toString(env) : ""}`;
  }

  override debugString(): string {
    const params = this.params.map((param) => param.debugString()).join(", ");
    return `GenericType(params: [${params}], type: ${this.type.debugString()})`;
  }
}

export class GenericParameter extends AbstractType {
  public parent: GenericType = null as any;
  public thisIndex: number = -1;
  public comparisons: Map<number, CompareResult> = new Map();
  public interConstraint: AbstractType | null = null; // just used for intersection
  public merging = false;
  protected intersecting = false;

  constructor(
    public name: string,
    public constraint: AbstractType | null = null,
    public defaultType: AbstractType | null = null,
  ) {
    super();
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    const arg = args.get(this.parent, this.name);
    if (arg) {
      if (this.constraint) {
        const constraintResult = arg.compareTo(this.constraint, env);
        if (
          constraintResult.type === "incompatible" ||
          constraintResult.type === "wider"
        ) {
          throw new Error(
            `Type argument ${arg.toString(env)} does not satisfy constraint ${this.constraint.toString(
              env,
            )} for generic parameter ${this.name}. Comparison result: ${constraintResult.type}${
              "reason" in constraintResult
                ? ` (${constraintResult.reason})`
                : ""
            }`,
          );
        }
      }
      return arg;
    }
    if (this.defaultType) {
      if (this.constraint) {
        const constraintResult = this.defaultType.compareTo(
          this.constraint,
          env,
        );
        if (
          constraintResult.type === "incompatible" ||
          constraintResult.type === "wider"
        ) {
          throw new Error(
            `Default type ${this.defaultType.toString(env)} does not satisfy constraint ${this.constraint.toString(
              env,
            )} for generic parameter ${this.name}. Comparison result: ${constraintResult.type}${
              "reason" in constraintResult
                ? ` (${constraintResult.reason})`
                : ""
            }`,
          );
        }
      }
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

    return { type: "wider" };
  }

  override isIncomplete(env: Environment): boolean {
    return true; // generic parameters are always incomplete until they are replaced with actual types
  }

  override getProperty(name: string, env: Environment): AbstractType {
    return new LazyAccessType(this, name);
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    if (this.intersecting || !this.merging) {
      return LazyIntersectType.create(this, other, env);
    }

    this.intersecting = true;

    try {
      if (this.interConstraint) {
        this.interConstraint = this.interConstraint.intersectWith(other, env);
      } else this.interConstraint = other;

      const comparison = this.interConstraint.compareTo(other, env);
      if (comparison.type === "wider" || comparison.type === "incompatible") {
        return LazyIntersectType.create(this, other, env);
      }

      return this;
    } finally {
      this.intersecting = false;
    }
  }

  override toString(env: Environment): string {
    return this.name;
  }

  toFullString(env: Environment): string {
    const s1 = this.constraint
      ? `${this.name}: ${this.constraint.toString(env)}`
      : this.name;
    const s2 = this.defaultType ? ` = ${this.defaultType.toString(env)}` : "";
    return s1 + s2;
  }

  override debugString(): string {
    const constraintStr = this.constraint
      ? `, constraint: ${this.constraint.debugString()}`
      : "";
    const defaultStr = this.defaultType
      ? `, defaultType: ${this.defaultType.debugString()}`
      : "";
    return `GenericParameter(name: ${this.name}${constraintStr}${defaultStr})`;
  }
}
