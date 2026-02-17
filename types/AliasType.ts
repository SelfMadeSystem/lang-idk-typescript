import type { Environment } from "../runtime/Environment";
import { AbstractType, type CompareResult } from "./AbstractType";
import type { AppliedGenerics } from "./AppliedGenerics";

export class AliasType extends AbstractType {
  public overrideName: string | null = null;
  public appliedGenerics: AppliedGenerics | null = null;

  constructor(public name: string) {
    super();
  }

  override getShallowType(env: Environment): AbstractType {
    const result = env.lookup(this.name);
    if (!result) {
      throw new Error(`Type ${this.name} not found in environment`);
    }
    if (result === this) {
      return this;
    }
    const r = result.getShallowType(env);
    if (this.appliedGenerics) {
      return r.applyTypeArguments(this.appliedGenerics, env);
    }
    return r;
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    const thisShallow = this.getShallowType(env);
    if (thisShallow === this) {
      return { type: "equal" };
    }
    return thisShallow.compareTo(other, env);
  }

  override applyTypeArguments(args: AppliedGenerics, env: Environment): AbstractType {
    if (this.getShallowType(env) === this) {
      this.appliedGenerics = args;
      return this;
    }
    return super.applyTypeArguments(args, env);
  }

  toStringSimple(env: Environment): string {
    if (this.overrideName) {
      return this.overrideName;
    }
    if (this.name.includes("$")) {
      return env.lookup(this.name)?.toString(env) ?? this.name;
    }
    return this.name;
  }

  override toString(env: Environment): string {
    const str = this.toStringSimple(env);
    if (this.appliedGenerics) {
      return `${str}<${this.appliedGenerics.toString(env)}>`;
    }
    return str;
  }
}
