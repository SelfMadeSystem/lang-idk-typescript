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
      const thisKeys = Object.keys(this.properties);
      const otherKeys = Object.keys(other.properties);
      const allKeys = new Set([...thisKeys, ...otherKeys]);
      let hasWider = false;
      let hasNarrower = false;
      for (const key of allKeys) {
        const thisProp = this.properties[key];
        const otherProp = other.properties[key];
        if (thisProp && otherProp) {
          const comp = thisProp.compareTo(otherProp);
          if (comp.type === "incompatible") {
            return {
              type: "incompatible",
              reason: `Property '${key}' is incompatible: ${comp.reason}`,
            };
          } else if (comp.type === "wider") {
            hasWider = true;
          } else if (comp.type === "narrower") {
            hasNarrower = true;
          }
        } else if (thisProp && !otherProp) {
          hasNarrower = true;
        } else if (!thisProp && otherProp) {
          hasWider = true;
        }
      }
      if (!hasWider && !hasNarrower) {
        return { type: "equal" };
      } else if (hasWider && !hasNarrower) {
        return { type: "wider" };
      } else if (!hasWider && hasNarrower) {
        return { type: "narrower" };
      } else {
        return {
          type: "incompatible",
          reason: "ObjectTypes have mixed wider and narrower properties",
        };
      }
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
