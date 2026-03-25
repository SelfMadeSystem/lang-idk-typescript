import type { BinOp, UniOp } from "../parser/ops";
import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import { AliasType } from "./AliasType";
import type { AppliedGenerics } from "./AppliedGenerics";
import { NotType } from "./NotType";
import { PrimitiveType } from "./Primitives";
import { UnionType } from "./UnionType";

export abstract class AbstractLazyType extends AbstractType {
  protected computed: AbstractType | null = null;
  protected isComputing = false;

  constructor(public readonly type: AbstractType) {
    super();
  }

  abstract compute(env: Environment): AbstractType | null;

  override getShallowType(env: Environment): AbstractType {
    if (this.isComputing) {
      return this.type;
    }
    this.isComputing = true;
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
      this.isComputing = false;
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
    const shallow = this.getShallowType(env);
    if (shallow !== this) {
      return shallow.compareTo(other, env);
    }
    return {
      type: "incompatible",
      reason: `Unable to compare lazy type ${this.toString(env)} to ${other.toString(env)}`,
    };
  }

  abstract override containsType(
    target: AbstractType,
    env: Environment,
  ): boolean;

  override isIncomplete(env: Environment): boolean {
    return true; // lazy types are considered incomplete until computed
  }

  override getProperty(name: string, env: Environment): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return NeverType.get();
    }
    return shallow.getProperty(name, env);
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    const shallow = this.getShallowType(env);
    if (shallow === this) {
      return other;
    }
    return shallow.intersectWith(other, env);
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

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (this.computed) {
      return this.computed.containsType(target, env);
    }
    return (
      this.type.containsType(target, env) || this.args.containsType(target, env)
    );
  }

  override compute(env: Environment): AbstractType | null {
    const shallow = this.type.getShallowType(env);
    if (
      (shallow.isIncomplete(env) && !shallow.isGeneric()) ||
      shallow instanceof AliasType
    ) {
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

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (this.computed) {
      return this.computed.containsType(target, env);
    }
    return this.type.containsType(target, env);
  }

  override compute(env: Environment): AbstractType | null {
    const shallow = this.type.getShallowType(env);
    if (shallow.isIncomplete(env)) {
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

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (this.computed) {
      return this.computed.containsType(target, env);
    }
    return (
      this.type.containsType(target, env) ||
      this.other.containsType(target, env)
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
    if (shallow.isIncomplete(env)) {
      return null; // can't compute yet
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
    if (shallow.isIncomplete(env)) {
      return null; // can't compute yet
    }
    throw new Error(
      `Condition of LazyIfElseType must simplify to a boolean literal, but got ${shallow.toString(env)}`,
    );
  }

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (this.computed) {
      return this.computed.containsType(target, env);
    }
    return (
      this.condition.containsType(target, env) ||
      this.trueBranch.containsType(target, env) ||
      this.falseBranch.containsType(target, env)
    );
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

export class LazyBinOpType extends AbstractLazyType {
  public constructor(
    public readonly left: AbstractType,
    public readonly op: BinOp,
    public readonly right: AbstractType,
  ) {
    super(NeverType.get());
  }

  public static doOp(
    left: AbstractType,
    op: BinOp,
    right: AbstractType,
    env: Environment,
  ): AbstractType | null {
    switch (op.op) {
      case "|":
        return UnionType.create([left, right], env);
      case "&":
        return left.intersectWith(right, env);
    }
    const leftShallow = left.getShallowType(env).getSimplifiedType(env);
    const rightShallow = right.getShallowType(env).getSimplifiedType(env);
    if (leftShallow.isIncomplete(env) || rightShallow.isIncomplete(env)) {
      return null; // can't compute yet
    }
    switch (op.op) {
      case "is":
        return leftShallow.compareTo(rightShallow, env).type === "equal"
          ? PrimitiveType.get("true")
          : PrimitiveType.get("false");
      case "wider":
        return leftShallow.compareTo(rightShallow, env).type === "wider"
          ? PrimitiveType.get("true")
          : PrimitiveType.get("false");
      case "narrower":
        return leftShallow.compareTo(rightShallow, env).type === "narrower"
          ? PrimitiveType.get("true")
          : PrimitiveType.get("false");
      case "extends":
        return leftShallow.compareTo(rightShallow, env).type === "narrower" ||
          leftShallow.compareTo(rightShallow, env).type === "equal"
          ? PrimitiveType.get("true")
          : PrimitiveType.get("false");
    }
  }

  override compute(env: Environment): AbstractType | null {
    const result = LazyBinOpType.doOp(this.left, this.op, this.right, env);
    if (
      result instanceof LazyBinOpType &&
      result.left === this.left &&
      result.op === this.op &&
      result.right === this.right
    ) {
      return null;
    }
    return result;
  }

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (this.computed) {
      return this.computed.containsType(target, env);
    }
    return (
      this.left.containsType(target, env) ||
      this.right.containsType(target, env)
    );
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    return new LazyBinOpType(
      this.left.applyTypeArguments(args, env),
      this.op,
      this.right.applyTypeArguments(args, env),
    );
  }

  override toStringImpl(env: Environment): string {
    return `${this.left.toString(env)} ${this.op.op} ${this.right.toString(env)}`;
  }

  override debugString(): string {
    return `LazyBinOpType(left: ${this.left.debugString()}, op: ${this.op.op}, right: ${this.right.debugString()})`;
  }
}

export class LazyUniOpType extends AbstractLazyType {
  public constructor(
    public readonly op: UniOp,
    public readonly operand: AbstractType,
  ) {
    super(NeverType.get());
  }

  public static doOp(
    op: UniOp,
    operand: AbstractType,
    env: Environment,
  ): AbstractType | null {
    switch (op.op) {
      case "!":
        const operandShallow = operand.getShallowType(env).getSimplifiedType(env);
        if (operandShallow.isIncomplete(env)) {
          return null; // can't compute yet
        }
        if (operandShallow instanceof PrimitiveType) {
          if (operandShallow.name === "true") {
            return PrimitiveType.get("false");
          }
          if (operandShallow.name === "false") {
            return PrimitiveType.get("true");
          }
        }
        return NeverType.get(); // not type not supported until it's correctly implemented
        // return new NotType(operandShallow);
    }
  }

  override compute(env: Environment): AbstractType | null {
    const result = LazyUniOpType.doOp(this.op, this.operand, env);
    if (
      result instanceof LazyUniOpType &&
      result.op === this.op &&
      result.operand === this.operand
    ) {
      return null;
    }
    return result;
  }

  override containsType(target: AbstractType, env: Environment): boolean {
    if (this === target) {
      return true;
    }
    if (this.computed) {
      return this.computed.containsType(target, env);
    }
    return this.operand.containsType(target, env);
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    return new LazyUniOpType(
      this.op,
      this.operand.applyTypeArguments(args, env),
    );
  }

  override toStringImpl(env: Environment): string {
    return `${this.op.op} ${this.operand.toString(env)}`;
  }

  override debugString(): string {
    return `LazyUniOpType(op: ${this.op.op}, operand: ${this.operand.debugString()})`;
  }
}
