import type { Environment } from "../runtime/Environment";
import { AbstractType, type CompareResult } from "./AbstractType";

export class IntType extends AbstractType {
  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (other instanceof IntType) {
      return { type: "equal" };
    }
    return {
      type: "incompatible",
      reason: other.toString() + " is not an int",
    };
  }

  override toString(): string {
    return "int";
  }
}

export class StringType extends AbstractType {
  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (other instanceof StringType) {
      return { type: "equal" };
    }
    return {
      type: "incompatible",
      reason: other.toString() + " is not a string",
    };
  }

  override toString(): string {
    return "string";
  }
}
