import type { Environment } from "../runtime/Environment";
import { AbstractType, NeverType, type CompareResult } from "./AbstractType";
import { AliasType } from "./AliasType";
import type { AppliedGenerics } from "./AppliedGenerics";
import { PrimitiveType } from "./Primitives";
import { UnionType } from "./UnionType";

export class ObjectType extends AbstractType {
  private toStringing = false;

  constructor(public properties: Record<string, AbstractType>) {
    super();
  }

  override applyTypeArguments(
    args: AppliedGenerics,
    env: Environment,
  ): AbstractType {
    const newProps: Record<string, AbstractType> = {};
    for (const [key, type] of Object.entries(this.properties)) {
      const r = type.applyTypeArguments(args, env);
      if (r instanceof Error) {
        throw new Error(
          `Failed to apply type arguments to property '${key}': ${r.message}`,
        );
      }
      newProps[key] = r;
    }
    return new ObjectType(newProps);
  }

  override compareToImpl(other: AbstractType, env: Environment): CompareResult {
    const trivial = this.trivialCompare(other, env);
    if (trivial) return trivial;
    if (other instanceof ObjectType) {
      if (this.compareList.slice(0, -1).includes(other)) {
        return { type: "equal" }; // prevent infinite recursion in circular types, assume equal but cache incompatible to prevent future comparisons from also assuming equal
      }
      if (this.compareList.length > 1) {
        this.cache.set(other, {
          type: "incompatible",
          reason: "Recursive comparison detected",
        });
      }
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
          const comp = thisProp.compareTo(otherProp, env);
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
    return other.compareAgainst(this, env);
  }

  override getProperty(name: string, env: Environment): AbstractType {
    return this.properties[name] || NeverType.get();
  }

  override intersectWith(other: AbstractType, env: Environment): AbstractType {
    if (other instanceof ObjectType) {
      const newProps: Record<string, AbstractType> = {};
      const allKeys = new Set([
        ...Object.keys(this.properties),
        ...Object.keys(other.properties),
      ]);
      for (const key of allKeys) {
        const thisProp = this.properties[key];
        const otherProp = other.properties[key];
        if (thisProp && otherProp) {
          newProps[key] = thisProp.intersectWith(otherProp, env);
        } else if (thisProp && !otherProp) {
          newProps[key] = thisProp;
        } else if (!thisProp && otherProp) {
          newProps[key] = otherProp;
        }
      }
      return new ObjectType(newProps);
    }
    if (other instanceof NeverType || other instanceof PrimitiveType) {
      return NeverType.get();
    }
    return other.intersectWith(this, env);
  }

  override toString(env: Environment): string {
    if (this.toStringing) {
      return "{ ... }"; // prevent infinite recursion in toString
    }
    this.toStringing = true;
    const props = Object.entries(this.properties)
      .map(([key, type]) => `${key}: ${type.toString(env)}`)
      .join(", ");
    this.toStringing = false;
    return `{ ${props} }`;
  }
}
