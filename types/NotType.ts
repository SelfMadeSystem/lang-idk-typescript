import type { Environment } from "../runtime/Environment";
import {
  AbstractType,
  invertCompareResult,
  NeverType,
  type CompareResult,
} from "./AbstractType";
import { LazyIntersectType } from "./LazyType";

// TODO: Figure out how to properly implement this. If unfeasible, remove it.
export class NotType extends AbstractType {
  constructor(public readonly type: AbstractType) {
    super();
  }

  protected override compareToImpl(
    other: AbstractType,
    env: Environment,
  ): CompareResult {
    if (other instanceof NotType) {
      return invertCompareResult(this.type.compareTo(other.type, env));
    }
    const result = this.type.compareTo(other, env);
    if (result.type === "equal") {
      return { type: "incompatible", reason: `Type ${other.toString(env)} is excluded by ${this.toString(env)}` };
    }
    if (result.type === "wider") {
      return { type: "incompatible", reason: `Type ${other.toString(env)} is wider than excluded type ${this.type.toString(env)}` };
    }
    if (result.type === "narrower") {
      return { type: "wider" };
    }
    return { type: "wider" };
  }

  override getProperty(name: string, env: Environment): AbstractType {
    return NeverType.get();
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    if (other instanceof NotType) {
      return new NotType(this.type.intersectWith(other.type, env));
    }
    const comparison = this.type.compareTo(other, env);
    if (comparison.type === "equal" || comparison.type === "wider") {
      return NeverType.get();
    }
    return LazyIntersectType.create(this, other, env);
  }

  override toString(env: Environment): string {
    return `! ${this.type.toString(env)}`;
  }

  override debugString(): string {
    return `NotType(${this.type.debugString()})`;
  }
}
