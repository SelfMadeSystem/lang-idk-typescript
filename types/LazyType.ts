import type { Environment } from "../runtime/Environment";
import { AbstractType, type CompareResult } from "./AbstractType";
import { AliasType } from "./AliasType";
import type { AppliedGenerics } from "./AppliedGenerics";

export abstract class AbstractLazyType extends AbstractType {
  protected computed: AbstractType | null = null;
  protected isGettingShallowType = false;

  constructor(public readonly type: AbstractType) {
    super();
  }

  abstract compute(env: Environment): AbstractType | null;

  override getShallowType(env: Environment): AbstractType {
    if (this.isGettingShallowType) {
      return this.type;
    }
    this.isGettingShallowType = true;
    try {
      if (this.computed) {
        return this.computed;
      }
      const result = this.compute(env);
      if (result && result !== this.type) {
        this.computed = result.getShallowType(env);
        return result;
      }
      return this.type;
    } finally {
      this.isGettingShallowType = false;
    }
  }

  protected override compareToImpl(
    other: AbstractType,
    env: Environment,
  ): CompareResult {
    if (this.computed) {
      return this.computed.compareTo(other, env);
    }
    const trivial = this.trivialCompare(other, env);
    if (trivial) {
      return trivial;
    }
    return this.getShallowType(env).compareTo(other, env);
  }

  override getProperty(name: string, env: Environment): AbstractType {
    return this.getShallowType(env).getProperty(name, env);
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    return this.getShallowType(env).intersectWith(other, env);
  }

  override isGeneric(): boolean {
    if (this.computed) {
      return this.computed.isGeneric();
    }
    return this.type.isGeneric();
  }

  override isNever(): boolean {
    if (this.computed) {
      return this.computed.isNever();
    }
    return this.type.isNever();
  }

  override isUnion(): boolean {
    if (this.computed) {
      return this.computed.isUnion();
    }
    return this.type.isUnion();
  }

  abstract toStringImpl(env: Environment): string;

  override toString(env: Environment): string {
    if (!this.computed) this.getShallowType(env);
    if (this.computed) {
      return this.computed.toString(env);
    }
    return this.toStringImpl(env);
  }
}

export class LazyApplyArguments extends AbstractLazyType {
  public constructor(
    type: AbstractType,
    public readonly args: AppliedGenerics,
  ) {
    super(type);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    return new LazyApplyArguments(
      this.type.applyTypeArguments(args, env),
      this.args.applyTypeArguments(args, env),
    );
  }

  override compute(env: Environment): AbstractType | null {
    const shallow = this.type.getShallowType(env);
    if (shallow instanceof AliasType) {
      return null;
    }
    const result = shallow.applyTypeArguments(this.args, env);

    if (
      result instanceof LazyApplyArguments &&
      result.type === this.type &&
      result.args === this.args
    ) {
      return null;
    }

    return result;
  }

  override toStringImpl(env: Environment): string {
    return this.type.toString(env) + "<" + this.args.toString(env) + ">";
  }

  override debugString(): string {
    return `LazyApplyArguments(type: ${this.type.debugString()}, args: ${this.args.debugString()})`;
  }
}

export class LazyAccessType extends AbstractLazyType {
  public constructor(
    type: AbstractType,
    public readonly property: string,
  ) {
    super(type);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    return new LazyAccessType(
      this.type.applyTypeArguments(args, env),
      this.property,
    );
  }

  override compute(env: Environment): AbstractType | null {
    const shallow = this.type.getShallowType(env);
    if (shallow instanceof AliasType) {
      return null;
    }
    const result = shallow.getProperty(this.property, env);
    if (
      result instanceof LazyAccessType &&
      result.type === this.type &&
      result.property === this.property
    ) {
      return null;
    }
    return result;
  }

  override toStringImpl(env: Environment): string {
    return this.type.toString(env) + "." + this.property;
  }

  override debugString(): string {
    return `LazyAccessType(type: ${this.type.debugString()}, property: ${this.property})`;
  }
}

export class LazyIntersectType extends AbstractLazyType {
  public constructor(
    type: AbstractType,
    public readonly other: AbstractType,
  ) {
    super(type);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    return new LazyIntersectType(
      this.type.applyTypeArguments(args, env),
      this.other.applyTypeArguments(args, env),
    );
  }

  protected override compareToImpl(
    other: AbstractType,
    env: Environment,
  ): CompareResult {
    if (!this.computed) this.getShallowType(env); // try to compute first
    if (this.computed) {
      return this.computed.compareTo(other, env);
    }
    const trivial = this.trivialCompare(other, env);
    if (trivial) {
      return trivial;
    }
    const comparisons = [
      this.type.compareTo(other, env),
      this.other.compareTo(other, env),
    ];
    if (comparisons.some((c) => c.type === "incompatible")) {
      return {
        type: "incompatible",
        reason: comparisons.find((c) => c.type === "incompatible")!.reason,
      };
    }
    const hasWider = comparisons.some((c) => c.type === "wider");
    const hasNarrower = comparisons.some((c) => c.type === "narrower");
    if (hasWider && hasNarrower) {
      return { type: "incompatible", reason: "Conflicting comparisons" };
    }
    if (hasWider) {
      return { type: "wider" };
    }
    if (hasNarrower) {
      return { type: "narrower" };
    }
    return { type: "equal" };
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    return new LazyIntersectType(this, other);
  }

  override compute(env: Environment): AbstractType | null {
    const shallow = this.type.getShallowType(env);
    if (shallow instanceof AliasType) {
      return null;
    }
    const result = shallow.intersectWith(this.other, env);
    if (
      result instanceof LazyIntersectType &&
      result.type === this.type &&
      result.other === this.other
    ) {
      return null;
    }
    return result;
  }

  override toStringImpl(env: Environment): string {
    return this.type.toString(env) + " & " + this.other.toString(env);
  }

  override debugString(): string {
    return `LazyIntersectType(type: ${this.type.debugString()}, other: ${this.other.debugString()})`;
  }
}
