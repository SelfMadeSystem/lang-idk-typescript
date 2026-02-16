import type { Environment } from "../runtime/Environment";
import type { AbstractType } from "./AbstractType";
import type { GenericParameter, GenericType } from "./GenericType";

export class AppliedGenerics {
  public argsByName: Map<GenericType, Map<string, AbstractType>> = new Map();
  public populateResult: Map<GenericType, GenericParameter[]> = new Map();

  constructor(
    public positionalArgs: AbstractType[],
    public namedArgs: Record<string, AbstractType>,
    base?: AppliedGenerics,
  ) {
    if (base) {
      this.positionalArgs = [...positionalArgs, ...base.positionalArgs];
      this.namedArgs = { ...base.namedArgs, ...namedArgs };
    }
  }

  get(generic: GenericType, paramName: string): AbstractType | null {
    const argsForGeneric = this.argsByName.get(generic);
    if (!argsForGeneric) {
      return null;
    }
    return argsForGeneric.get(paramName) || null;
  }

  /**
   * Returns an error if the provided arguments are invalid for the given generic.
   * Returns the list of missing parameters if some parameters are missing but the provided arguments are otherwise valid.
   */
  populateFromGeneric(generic: GenericType): Error | GenericParameter[] {
    if (this.argsByName.has(generic)) {
      return this.populateResult.get(generic)!;
    }
    const argsByName = new Map<string, AbstractType>();
    for (let i = 0; i < this.positionalArgs.length; i++) {
      const param = generic.params[i];
      if (!param) {
        return new Error(
          `Too many positional arguments provided. Expected ${generic.params.length}, got ${this.positionalArgs.length}.`,
        );
      }
      argsByName.set(param.name, this.positionalArgs[i]!);
    }
    for (const [name, arg] of Object.entries(this.namedArgs)) {
      const param = generic.params.find((p) => p.name === name);
      if (!param) {
        return new Error(`Unknown named argument "${name}".`);
      }
      if (argsByName.has(name)) {
        return new Error(
          `Argument "${name}" provided both positionally and as a named argument.`,
        );
      }
      argsByName.set(name, arg);
    }
    this.argsByName.set(generic, argsByName);
    const missingParams = generic.params.filter(
      (p) => !argsByName.has(p.name) && !p.defaultType,
    );
    this.populateResult.set(generic, missingParams);
    return missingParams;
  }

  toString(env: Environment): string {
    const positional = this.positionalArgs
      .map((a) => a.toString(env))
      .join(", ");
    const named = Object.entries(this.namedArgs)
      .map(([k, v]) => `${k} = ${v.toString(env)}`)
      .join(", ");
    return [positional, named].filter((s) => s).join(", ");
  }
}
