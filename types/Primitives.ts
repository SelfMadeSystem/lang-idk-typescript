import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";

export class PrimitiveType extends AbstractType {
  private static instances: Map<string, PrimitiveType> = new Map();

  private constructor(
    public name: string,
    public inherits: string[] = [],
  ) {
    super();
  }

  static get(name: string, inherits: string[] = []): PrimitiveType {
    let instance = this.instances.get(name);
    if (!instance) {
      instance = new PrimitiveType(name, inherits);
      this.instances.set(name, instance);
    }
    return instance;
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (other instanceof PrimitiveType) {
      if (this.name === other.name) {
        return { type: "equal" };
      }
      if (this.inherits.includes(other.name)) {
        return { type: "narrower" };
      }
      if (other.inherits.includes(this.name)) {
        return { type: "wider" };
      }
      return {
        type: "incompatible",
        reason: `Primitive types ${this.name} and ${other.name} are incompatible`,
      };
    }
    return other.compareAgainst(this, env);
  }

  override getProperty(): AbstractType {
    return NeverType.get();
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    if (other instanceof PrimitiveType) {
      if (this.name === other.name) {
        return this;
      }
      if (this.inherits.includes(other.name)) {
        return this;
      }
      if (other.inherits.includes(this.name)) {
        return other;
      }
    }
    return NeverType.get();
  }

  override toString(env: Environment): string {
    return this.name;
  }

  override debugString(): string {
    return `PrimitiveType(name: ${this.name}, inherits: [${this.inherits.join(", ")}])`;
  }
}
