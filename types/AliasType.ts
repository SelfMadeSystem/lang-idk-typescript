import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import type { AppliedGenerics } from "./AppliedGenerics";
import { LazyAccessType, LazyApplyArguments } from "./LazyType";

export class AliasType extends AbstractType {
  public overrideName: string | null = null;
  protected isFindingShallow = false;

  constructor(public name: string) {
    super();
  }

  override getShallowType(env: Environment): AbstractType {
    if (this.isFindingShallow) {
      return this;
    }
    this.isFindingShallow = true;
    try {
      const result = env.lookup(this.name);
      if (!result) {
        throw new Error(`Type ${this.name} not found in environment`);
      }
      if (result === this) {
        return this;
      }
      return result.getShallowType(env);
    } finally {
      this.isFindingShallow = false;
    }
  }

  override getSimplifiedType(env: Environment): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return this;
    }
    if (shallow.containsType(this, env)) {
      return this; // don't resolve recursive types
    }
    return shallow.getSimplifiedType(env);
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    const thisShallow = this.getShallowType(env);
    if (thisShallow === this) {
      return {
        type: "incompatible",
        reason: `Could not resolve type alias ${this.name} to a concrete type`,
      };
    }
    return thisShallow.compareTo(other, env);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return new LazyApplyArguments(this, args);
    }
    return shallow.applyTypeArguments(args, env);
  }

  override getProperty(name: string, env: Environment): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return new LazyAccessType(this, name);
    }
    return shallow.getProperty(name, env);
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return this;
    }
    return shallow.intersectWith(other, env);
  }

  override toString(env: Environment): string {
    if (this.overrideName) {
      return this.overrideName;
    }
    if (this.name.includes("$")) {
      return env.lookup(this.name)?.toString(env) ?? this.name;
    }
    return this.name;
  }

  override debugString(): string {
    return `AliasType(${this.name})`;
  }
}
