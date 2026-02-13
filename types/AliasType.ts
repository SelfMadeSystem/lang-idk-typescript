import { AbstractType } from "./AbstractType";

export const aliases = new Map<string, AbstractType>();

export class AliasType extends AbstractType {
  public static define(name: string, type: AbstractType): AliasType {
    if (aliases.has(name)) {
      const existing = aliases.get(name)!;
      if (existing.compareTo(type).type === "equal") {
        return existing as AliasType;
      } else {
        throw new Error(
          `Alias name "${name}" is already used for a different type`,
        );
      }
    }
    const alias = new AliasType(name, type);
    aliases.set(name, alias);
    return alias;
  }

  private constructor(
    public name: string,
    public type: AbstractType,
  ) {
    super();
  }

  override getShallowType(): AbstractType {
    return this.type.getShallowType();
  }

  override compareToImpl(other: AbstractType) {
    return this.type.compareTo(other);
  }

  override toString(): string {
    return this.name;
  }
}
