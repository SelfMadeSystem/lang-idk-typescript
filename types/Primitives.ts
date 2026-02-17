import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";

export class PrimitiveType extends AbstractType {
  private static instances: Map<string, PrimitiveType> = new Map();

  private constructor(public name: string) {
    super();
  }

  static get(name: string): PrimitiveType {
    let instance = this.instances.get(name);
    if (!instance) {
      instance = new PrimitiveType(name);
      this.instances.set(name, instance);
    }
    return instance;
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (other instanceof PrimitiveType) {
      return this.name === other.name
        ? { type: "equal" }
        : {
            type: "incompatible",
            reason: `Primitive types do not match: ${this.name} vs ${other.name}`,
          };
    }
    return {
      type: "incompatible",
      reason: other.toString(env) + " is not a" + (/^[aeiou]/i.test(this.name) ? "n" : "") + " " + this.name,
    };
  }

  override getProperty(): AbstractType {
    return NeverType.get();
  }

  override toString(env: Environment): string {
    return this.name;
  }
}
