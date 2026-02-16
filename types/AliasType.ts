import type { Environment } from "../runtime/Environment";
import { AbstractType, type CompareResult } from "./AbstractType";

export class AliasType extends AbstractType {
  public overrideName: string | null = null;

  constructor(public name: string) {
    super();
  }

  override getShallowType(env: Environment): AbstractType {
    const result = env.lookup(this.name);
    if (!result) {
      throw new Error(`Type ${this.name} not found in environment`);
    }
    return result.getShallowType(env);
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

  override toString(env: Environment): string {
    if (this.overrideName) {
      return this.overrideName;
    }
    if (this.name.includes("$")) {
      return env.lookup(this.name)?.toString(env) ?? this.name;
    }
    return this.name;
  }
}
