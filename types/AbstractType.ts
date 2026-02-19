import type { Environment } from "../runtime/Environment";
import type { AppliedGenerics } from "./AppliedGenerics";

export type CompareResult =
  | {
      type: "equal";
    }
  | {
      type: "wider";
    }
  | {
      type: "narrower";
    }
  | {
      type: "incompatible";
      reason: string;
    };

export function invertCompareResult(result: CompareResult): CompareResult {
  switch (result.type) {
    case "equal":
      return { type: "equal" };
    case "wider":
      return { type: "narrower" };
    case "narrower":
      return { type: "wider" };
    case "incompatible":
      return { type: "incompatible", reason: result.reason };
  }
}

export abstract class AbstractType {
  protected cache = new Map<AbstractType, CompareResult>();
  protected compareList: AbstractType[] = [];

  /**
   * Used in compareTo implementations to handle trivial cases like identity and never types.
   */
  protected trivialCompare(
    other: AbstractType,
    env: Environment,
  ): CompareResult | null {
    if (this === other) {
      return { type: "equal" };
    }
    if (this.cache.has(other)) {
      return this.cache.get(other)!;
    }
    if (!this.isUnion() && other.isUnion()) {
      return other.compareAgainst(this, env);
    }
    if (!this.isGeneric() && other.isGeneric()) {
      return other.compareAgainst(this, env);
    }
    if (other.isNever()) {
      return { type: "wider" };
    }
    if (this.isNever()) {
      return { type: "narrower" };
    }
    return null;
  }

  /**
   * Gets the underlying shallow type. Only used for alias types, which should be transparent in comparisons.
   */
  getShallowType(env: Environment): AbstractType {
    return this;
  }

  /**
   * Applies type arguments to this type if it is generic.
   *
   * Should return a new type with the arguments applied, or an error if the arguments are invalid.
   */
  applyTypeArguments(args: AppliedGenerics, env: Environment): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return this;
    }
    return shallow.applyTypeArguments(args, env);
  }

  /**
   * Compares this type to another type, using caching to avoid infinite recursion.
   */
  compareTo(other: AbstractType, env: Environment): CompareResult {
    other = other.getShallowType(env);
    this.compareList.push(other);
    const result = this.compareToImpl(other, env);
    this.cache.set(other, result); // should prevent infinite recursion
    this.compareList.pop();
    return result;
  }

  /**
   * Compares this type to another type.
   * Returns a CompareResult indicating the relationship between the two types.
   *
   * - "equal": both types are identical.
   * - "wider": this type is a supertype of the other type.
   * - "narrower": this type is a subtype of the other type.
   * - "incomparable": the types are unrelated, with a reason provided.
   *
   * `a.compareTo(b)` should yield the inverse relationship of `b.compareTo(a)`.
   *
   * @param other The other type to compare against.
   * @param env The environment to use for looking up type definitions during comparison.
   * @returns A CompareResult indicating the relationship.
   */
  protected abstract compareToImpl(
    other: AbstractType,
    env: Environment,
  ): CompareResult;

  compareAgainst(other: AbstractType, env: Environment): CompareResult {
    return invertCompareResult(this.compareTo(other, env));
  }

  isAssignableTo(other: AbstractType, env: Environment): boolean {
    const result = this.compareTo(other, env);
    return result.type === "equal" || result.type === "narrower";
  }

  /**
   * Accesses the property of this type with the given name, or never if the property does not exist.
   */
  abstract getProperty(name: string, env: Environment): AbstractType;

  /**
   * Intersects this type with another type, returning a new type that is assignable to both.
   */
  abstract intersectWith(other: AbstractType, env: Environment): AbstractType;

  equals(other: AbstractType, env: Environment): boolean {
    const result = this.compareTo(other, env);
    return result.type === "equal";
  }

  isNever(): boolean {
    return false;
  }

  isUnion(): boolean {
    return false;
  }

  isGeneric(): boolean {
    return false;
  }

  abstract toString(env: Environment): string;

  abstract debugString(): string;
}

export class NeverType extends AbstractType {
  private static instance: NeverType | null = null;

  private constructor() {
    super();
  }

  static get(): NeverType {
    if (!this.instance) {
      this.instance = new NeverType();
    }
    return this.instance;
  }

  override compareToImpl(other: AbstractType): CompareResult {
    if (other instanceof NeverType) {
      return { type: "equal" };
    }
    return { type: "narrower" };
  }

  override getProperty(): AbstractType {
    return this;
  }

  override intersectWith(): AbstractType {
    return this;
  }

  override isNever(): boolean {
    return true;
  }

  override toString(env: Environment): string {
    return "never";
  }

  override debugString(): string {
    return "NeverType";
  }
}
