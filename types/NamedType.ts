import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import type { AppliedGenerics } from "./AppliedGenerics";

export class NamedType extends AbstractType {
  protected nameSet = new Set<string>();

  constructor(
    public name: string,
    public type?: AbstractType,
  ) {
    super();
  }

  override getSimplifiedType(env: Environment): AbstractType {
    if (!this.type) {
      return this;
    }
    const simplified = this.type.getSimplifiedType(env);
    if (simplified === this.type) {
      return this;
    }
    return new NamedType(this.name, simplified);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    if (!this.type) {
      return this;
    }
    const r = this.type.applyTypeArguments(args, env);
    return new NamedType(this.name, r);
  }

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (!this.type) {
      return false;
    }
    return this.type.containsType(target, env);
  }

  override isIncomplete(env: Environment): boolean {
    if (!this.type) {
      return true;
    }
    return this.type.isIncomplete(env);
  }

  getNameSet(): Set<string> {
    if (this.nameSet.size === 0) {
      this.nameSet.add(this.name);
      let currentType = this.type;
      while (currentType instanceof NamedType) {
        this.nameSet.add(currentType.name);
        currentType = currentType.type;
      }
    }
    return this.nameSet;
  }

  protected compareSubtypeTo(
    other: NamedType,
    env: Environment,
  ): CompareResult {
    let myType: AbstractType | undefined = this.type;
    let otherType: AbstractType | undefined = other.type;
    while (myType instanceof NamedType) {
      myType = myType.type;
    }
    while (otherType instanceof NamedType) {
      otherType = otherType.type;
    }
    if (!myType && !otherType) {
      return { type: "equal" };
    }
    if (!myType) {
      return { type: "narrower" };
    }
    if (!otherType) {
      return { type: "wider" };
    }
    return myType.compareTo(otherType, env);
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (!(other instanceof NamedType)) {
      // comparing (name){...} to (){...}
      if (!this.type) {
        return { type: "incompatible", reason: "Expected " + this.name };
      }
      const comparison = this.type.compareTo(other, env);
      switch (comparison.type) {
        case "wider":
          return {
            type: "incompatible",
            reason: "Structural type is wider than nominal type " + this.name,
          };
        case "equal":
          return {
            type: "wider",
          };
        default:
          return comparison;
      }
    }
    const isSubset = this.getNameSet().isSubsetOf(other.getNameSet());
    const isSuperset = this.getNameSet().isSupersetOf(other.getNameSet());
    if (isSubset && isSuperset) {
      // comparing (name){...} to (name){...}
      return this.compareSubtypeTo(other, env);
    }
    if (!isSubset && !isSuperset) {
      // comparing (name){...} to (otherName){...}
      return {
        type: "incompatible",
        reason: `Types ${this.name} and ${other.name} are unrelated`,
      };
    }
    const comparison = this.compareSubtypeTo(other, env);
    if (isSubset) {
      // comparing (a){...} to (a, b){...}
      // this must be wider or incompatible
      if (comparison.type === "narrower") {
        return {
          type: "incompatible",
          reason: `Type ${this.name} is structurally narrower than ${other.name}, but is nominally wider`,
        };
      }
      return comparison;
    }
    // comparing (a, b){...} to (a){...}
    // this must be narrower or incompatible
    if (comparison.type === "wider") {
      return {
        type: "incompatible",
        reason: `Type ${this.name} is structurally wider than ${other.name}, but is nominally narrower`,
      };
    }
    return comparison;
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    if (!this.type) {
      return new NamedType(this.name, other);
    }
    const intersected = this.type.intersectWith(other, env);
    return new NamedType(this.name, intersected);
  }

  override getProperty(name: string, env: Environment): AbstractType {
    if (!this.type) {
      return NeverType.get();
    }
    return this.type.getProperty(name, env);
  }

  override toString(env: Environment): string {
    const nextStr = this.type?.toString(env) ?? "";
    if (/^[A-Za-z0-9_]/.test(nextStr)) {
      return this.name + " " + nextStr;
    }
    return this.name + nextStr;
  }

  override debugString(): string {
    return `NamedType(name: ${this.name}, type: ${this.type?.debugString() ?? "undefined"})`;
  }
}
