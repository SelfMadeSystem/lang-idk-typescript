import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import { AliasType } from "./AliasType";
import type { AppliedGenerics } from "./AppliedGenerics";
import { PrimitiveType } from "./Primitives";

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
        this.computed = result.getShallowType(env).getSimplifiedType(env);
        return this.computed;
      }
      return this;
    } finally {
      this.isGettingShallowType = false;
    }
  }

  override getSimplifiedType(env: Environment): AbstractType {
    if (!this.computed) this.getShallowType(env);
    if (this.computed) {
      return this.computed.getSimplifiedType(env);
    }
    return this;
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
    // if (!this.computed) this.getShallowType(env);
    // if (this.computed) {
    //   return this.computed.toString(env);
    // }
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
  private constructor(
    type: AbstractType,
    public readonly other: AbstractType,
  ) {
    super(type);
  }

  public static create(
    type: AbstractType,
    other: AbstractType,
    env: Environment,
  ): AbstractType {
    const comparison = type.compareTo(other, env);
    if (comparison.type === "equal") {
      return type;
    }
    return new LazyIntersectType(type, other);
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

export class LazyIfElseType extends AbstractLazyType {
  public constructor(
    public readonly condition: AbstractType,
    public readonly trueBranch: AbstractType,
    public readonly falseBranch: AbstractType,
  ) {
    super(NeverType.get());
  }

  override compute(env: Environment): AbstractType | null {
    const shallow = this.condition.getShallowType(env);
    if (shallow instanceof PrimitiveType && shallow.name === "true") {
      return this.trueBranch;
    }
    if (shallow instanceof PrimitiveType && shallow.name === "false") {
      return this.falseBranch;
    }
    return null;
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    return new LazyIfElseType(
      this.condition.applyTypeArguments(args, env),
      this.trueBranch.applyTypeArguments(args, env),
      this.falseBranch.applyTypeArguments(args, env),
    );
  }

  override getSimplifiedType(env: Environment): AbstractType {
    if (!this.computed) this.getShallowType(env);
    if (this.computed) {
      return this.computed.getSimplifiedType(env);
    }
    const condSimplified = this.condition.getSimplifiedType(env);
    const trueSimplified = this.trueBranch.getSimplifiedType(env);
    const falseSimplified = this.falseBranch.getSimplifiedType(env);
    if (
      condSimplified !== this.condition ||
      trueSimplified !== this.trueBranch ||
      falseSimplified !== this.falseBranch
    ) {
      return new LazyIfElseType(
        condSimplified,
        trueSimplified,
        falseSimplified,
      ).getSimplifiedType(env);
    }
    return this;
  }

  override toStringImpl(env: Environment): string {
    return `if (${this.condition.toString(env)}) ${this.trueBranch.toString(env)} else ${this.falseBranch.toString(env)}`;
  }

  override debugString(): string {
    return `LazyIfElseType(condition: ${this.condition.debugString()}, trueBranch: ${this.trueBranch.debugString()}, falseBranch: ${this.falseBranch.debugString()})`;
  }
}
