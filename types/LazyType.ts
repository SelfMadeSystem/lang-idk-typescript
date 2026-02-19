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
