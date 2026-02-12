import { AbstractType, type CompareResult } from "./AbstractType";

export class ObjectType extends AbstractType {
  constructor(public properties: Record<string, AbstractType>) {
    super();
  }

  override compareTo(other: AbstractType): CompareResult {
    const trivial = this.trivialCompare(other);
    if (trivial) return trivial;
    if (other instanceof ObjectType) {
      // { a: A } is wider than { a: A, b: B }
      // { a: A, b: B } is narrower than { a: A }
      // { a: A } vs { a: B } give same as A vs B
      const thisProps = this.properties;
      const otherProps = other.properties;
      const thisKeys = Object.keys(thisProps);
      const otherKeys = Object.keys(otherProps);
      const thisWider = thisKeys.every(
        (key) =>
          key in otherProps && thisProps[key]!.isAssignableTo(otherProps[key]!),
      );
      const thisNarrower = otherKeys.every(
        (key) =>
          key in thisProps && otherProps[key]!.isAssignableTo(thisProps[key]!),
      );
      if (thisNarrower && !thisWider) return { type: "narrower" };
      if (!thisNarrower && thisWider) return { type: "wider" };
      if (thisNarrower && thisWider) return { type: "equal" };
      return {
        type: "incompatible",
        reason: "Object types have incompatible properties",
      };
    }
    return {
      type: "incompatible",
      reason: `Cannot compare ObjectType to ${other.constructor.name}`,
    };
  }

  override toString(): string {
    const props = Object.entries(this.properties)
      .map(([key, type]) => `${key}: ${type.toString()}`)
      .join(", ");
    return `{ ${props} }`;
  }
}
