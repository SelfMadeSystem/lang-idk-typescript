import type { AbstractType } from "../types/AbstractType";

export class Environment {
  public parent: Environment | null;
  public types: Map<string, AbstractType>;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
    this.types = new Map();
  }

  define(name: string, type: AbstractType): Error | null {
    if (this.types.has(name)) {
      return new Error(`Type ${name} is already defined in this scope`);
    }

    this.types.set(name, type);
    return null;
  }

  set(name: string, type: AbstractType): void {
    if (this.types.has(name)) {
      this.types.set(name, type);
    } else if (this.parent) {
      this.parent.set(name, type);
    } else {
      this.types.set(name, type);
    }
  }

  lookup(name: string): AbstractType | null {
    const type = this.types.get(name);
    if (type) {
      return type;
    }

    if (this.parent) {
      return this.parent.lookup(name);
    }

    return null;
  }
}
