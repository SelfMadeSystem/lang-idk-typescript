import {
  NamedTypeExpr,
  GenericTypeExpr,
  AppliedGenericExpr,
  AppliedGenericArgument,
  ObjectTypeExpr,
  ObjectProperty,
  TupleTypeExpr, // tuples aren't supported yet
  UnionTypeExpr,
  TypeAlias,
  TypeDef,
  TypeExpression,
  TypeUnit,
  type Statement,
  FunctionCall,
  Module,
} from "../parser/ast";
import type { AbstractType } from "../types/AbstractType";
import { AliasType } from "../types/AliasType";
import { AppliedGenerics } from "../types/AppliedGenerics";
import { GenericParameter, GenericType } from "../types/GenericType";
import { NamedType } from "../types/NamedType";
import { ObjectType } from "../types/ObjectType";
import { IntType, StringType } from "../types/Primitives";
import { UnionType } from "../types/UnionType";
import { Environment } from "./Environment";

export class Runtime {
  public environment: Environment = new Environment();

  constructor() {
    this.environment.define("string", new StringType());
    this.environment.define("int", new IntType());
  }

  public runModule(module: Module) {
    for (const statement of module.body) {
      const result = this.runStatement(statement);
      if (result instanceof Error) {
        console.error(
          `Error in statement at ${statement.range.start.line}:${statement.range.start.column}: ${result.message}`,
        );
      }
    }
  }

  public pushEnvironment() {
    this.environment = new Environment(this.environment);
  }

  public popEnvironment() {
    if (this.environment.parent) {
      this.environment = this.environment.parent;
    } else {
      throw new Error("Cannot pop the global environment");
    }
  }

  public runStatement(statement: Statement) {
    console.log("Statement: ", statement.constructor.name);
    if (statement instanceof TypeUnit) {
      const namedType = new NamedType(statement.name.name);
      const result1 = this.environment.define(statement.name.name, namedType);
      if (result1 instanceof Error) {
        return result1;
      }
      return;
    }
    if (statement instanceof TypeDef) {
      const namedType = new NamedType(statement.name.name);
      const result1 = this.environment.define(statement.name.name, namedType);
      if (result1 instanceof Error) {
        return result1;
      }
      const result2 = this.runExpression(statement.expression);
      if (result2 instanceof Error) {
        return result2;
      }
      if (result2 instanceof AliasType) {
        return new Error("Type definitions cannot be aliases");
      }
      if (result2 instanceof AppliedGenerics) {
        return new Error("Type definitions cannot be applied generics");
      }
      namedType.type = result2;
      return;
    }
    if (statement instanceof TypeAlias) {
      // Set an alias in case of recursive types, then populate it with the actual type once we have it
      const alias = new AliasType(statement.name.name);
      const result1 = this.environment.define(statement.name.name, alias);
      if (result1 instanceof Error) {
        return result1;
      }
      const result2 = this.runExpression(statement.expression);
      if (result2 instanceof Error) {
        return result2;
      }
      if (result2 instanceof AliasType) {
        return new Error("Recursive type aliase detected");
      }
      if (result2 instanceof AppliedGenerics) {
        return new Error("Type aliases cannot be applied generics");
      }
      this.environment.set(statement.name.name, result2);
      return;
    }
    if (statement instanceof FunctionCall) {
      this.runFunctionCall(statement);
      return;
    }
  }

  public runExpression(
    expression: TypeExpression,
  ): AbstractType | AppliedGenerics | Error {
    console.log("Running: ", expression.constructor.name, expression.toLangString());
    using _ = this.environment; // clear temporary types after running each expression
    if (expression instanceof NamedTypeExpr) {
      const result = this.environment.lookup(expression.name.name);
      if (!result) {
        return new Error(
          `Type ${expression.name.name} not found in environment`,
        );
      }
      console.log("Found: ", result.constructor.name, result.toString(this.environment));
      if (expression.next) {
        const nextResult = this.runExpression(expression.next);
        if (nextResult instanceof Error) {
          return nextResult;
        }
        if (nextResult instanceof AppliedGenerics) {
          const r = result.applyTypeArguments(nextResult, this.environment);
          if (r instanceof Error) {
            return new Error(
              `Failed to apply type arguments to ${expression.name.name}: ${r.message}`,
            );
          }
          return r;
        }
        return new Error(
          `Expected type arguments after ${expression.name.name}`,
        );
      }
      return result;
    }
    if (expression instanceof GenericTypeExpr) {
      this.pushEnvironment();
      const genericParameters: GenericParameter[] = [];
      const genericType = new GenericType([], null as any);

      for (const param of expression.args) {
        const p = new GenericParameter(param.name.name);
        const r = this.environment.define(param.name.name, p);
        if (r instanceof Error) {
          return r;
        }
        genericType.pushParameter(p);

        const constraintResult = param.constraint
          ? this.runExpression(param.constraint)
          : null;
        if (constraintResult instanceof Error) {
          return new Error(
            `Failed to evaluate constraint for generic parameter ${param.name.name}: ${constraintResult.message}`,
          );
        }
        if (constraintResult instanceof AppliedGenerics) {
          return new Error(
            "Applied generics are not supported as generic parameter constraints",
          );
        }
        p.constraint = constraintResult;

        const defaultResult = param.defaultType
          ? this.runExpression(param.defaultType)
          : null;
        if (defaultResult instanceof Error) {
          return new Error(
            `Failed to evaluate default type for generic parameter ${param.name.name}: ${defaultResult.message}`,
          );
        }
        if (defaultResult instanceof AppliedGenerics) {
          return new Error(
            "Applied generics are not supported as generic parameter default types",
          );
        }
        p.defaultType = defaultResult;
        genericParameters.push(p);
      }

      if (!expression.next) {
        return new Error("Generic type must have a body");
      }
      const typeResult = this.runExpression(expression.next);
      if (typeResult instanceof Error) {
        return new Error(
          `Failed to evaluate body of generic type: ${typeResult.message}`,
        );
      }
      if (typeResult instanceof AppliedGenerics) {
        return new Error(
          "Applied generics are not supported as generic type bodies",
        );
      }

      genericType.type = typeResult;
      this.popEnvironment();
      return genericType;
    }
    if (expression instanceof AppliedGenericExpr) {
      const positional: AbstractType[] = [];
      const named: Record<string, AbstractType> = {};
      for (const arg of expression.args) {
        const result = this.runExpression(arg.value);
        if (result instanceof Error) {
          return new Error(
            `Failed to evaluate type argument: ${result.message}`,
          );
        }
        if (result instanceof AppliedGenerics) {
          return new Error("Nested applied generics are not supported");
        }
        if (arg.name) {
          if (named[arg.name.name]) {
            return new Error(`Duplicate named argument: ${arg.name.name}`);
          }
          named[arg.name.name] = result;
        } else {
          positional.push(result);
        }
      }
      if (expression.next) {
        const nextResult = this.runExpression(expression.next);
        if (nextResult instanceof Error) {
          return new Error(
            `Failed to evaluate applied generic target: ${nextResult.message}`,
          );
        }
        if (!(nextResult instanceof AppliedGenerics)) {
          return new Error(
            `Expected a generic type to apply arguments to, got ${typeof nextResult}`,
          );
        }
        return new AppliedGenerics(positional, named, nextResult);
      }
      return new AppliedGenerics(positional, named);
    }
    if (expression instanceof ObjectTypeExpr) {
      const properties: Record<string, AbstractType> = {};
      for (const prop of expression.properties) {
        const typeResult = this.runExpression(prop.value);
        if (typeResult instanceof Error) {
          return new Error(
            `Failed to evaluate type of property ${prop.name.name}: ${typeResult.message}`,
          );
        }
        if (typeResult instanceof AppliedGenerics) {
          return new Error(
            "Applied generics are not supported in object types",
          );
        }
        properties[prop.name.name] = typeResult;
      }
      return new ObjectType(properties);
    }
    if (expression instanceof UnionTypeExpr) {
      const types: AbstractType[] = [];
      for (const typeExpr of expression.options) {
        const typeResult = this.runExpression(typeExpr);
        if (typeResult instanceof Error) {
          return new Error(
            `Failed to evaluate union type option: ${typeResult.message}`,
          );
        }
        if (typeResult instanceof AppliedGenerics) {
          return new Error("Applied generics are not supported in union types");
        }
        types.push(typeResult);
      }
      return UnionType.create(types, this.environment);
    }
    return new Error("Unknown type expression");
  }

  private runFunctionCall(call: FunctionCall) {
    switch (call.name.name) {
      case "print": {
        const args = call.args.map((arg) => {
          const result = this.runExpression(arg);
          if (result instanceof Error) {
            return new Error(
              `Failed to evaluate argument for print: ${result.message}`,
            );
          }
          return result;
        });
        for (const arg of args) {
          if (arg instanceof Error) {
            console.error(arg.message);
          } else {
            console.log(arg.toString(this.environment));
          }
        }
        break;
      }
      case "compare": {
        const biArgsResult = this.getBiArgs(call, this.environment);
        if (biArgsResult instanceof Error) {
          console.error(biArgsResult.message);
          break;
        }
        const [a, b] = biArgsResult;
        const comp = a.compareTo(b, this.environment);
        console.log(`Comparison result: ${comp.type}`);
        if (comp.type === "incompatible") {
          console.log(`Reason: ${comp.reason}`);
        }
        break;
      }
      case "equal": {
        const biArgsResult = this.getBiArgs(call, this.environment);
        if (biArgsResult instanceof Error) {
          console.error(biArgsResult.message);
          break;
        }
        const [a, b] = biArgsResult;
        const eq = a.compareTo(b, this.environment);
        if (eq.type === "equal") {
          console.log("Types are equal");
        } else {
          console.log("Types are not equal");
          console.log(`Reason: ${eq.type}`);
          if (eq.type === "incompatible") {
            console.log(`Details: ${eq.reason}`);
          }
        }
        break;
      }
      case "incompatible": {
        const biArgsResult = this.getBiArgs(call, this.environment);
        if (biArgsResult instanceof Error) {
          console.error(biArgsResult.message);
          break;
        }
        const [a, b] = biArgsResult;
        const comp = a.compareTo(b, this.environment);
        if (comp.type === "incompatible") {
          console.log("Types are incompatible");
        } else {
          console.log("Types are not incompatible");
          console.log(`Reason: ${comp.type}`);
        }
        break;
      }
      case "wider": {
        const biArgsResult = this.getBiArgs(call, this.environment);
        if (biArgsResult instanceof Error) {
          console.error(biArgsResult.message);
          break;
        }
        const [a, b] = biArgsResult;
        const wider = a.compareTo(b, this.environment);
        if (wider.type === "wider") {
          console.log("First type is wider than second");
        } else {
          console.log("First type is not wider than second");
          console.log(`Reason: ${wider.type}`);
          if (wider.type === "incompatible") {
            console.log(`Details: ${wider.reason}`);
          }
        }
        break;
      }
      case "narrower": {
        const biArgsResult = this.getBiArgs(call, this.environment);
        if (biArgsResult instanceof Error) {
          console.error(biArgsResult.message);
          break;
        }
        const [a, b] = biArgsResult;
        const narrower = a.compareTo(b, this.environment);
        if (narrower.type === "narrower") {
          console.log("First type is narrower than second");
        } else {
          console.log("First type is not narrower than second");
          console.log(`Reason: ${narrower.type}`);
          if (narrower.type === "incompatible") {
            console.log(`Details: ${narrower.reason}`);
          }
        }
        break;
      }
      default:
        console.error(`Unknown function: ${call.name.name}`);
    }
  }

  private getBiArgs(
    call: FunctionCall,
    env: Environment,
  ): [AbstractType, AbstractType] | Error {
    if (call.args.length !== 2) {
      return new Error("comparison function requires exactly 2 arguments");
    }
    const argResults = call.args.map((arg) => this.runExpression(arg));
    if (argResults.some((r) => r instanceof Error)) {
      return new Error(
        `Failed to evaluate arguments for comparison: ${
          argResults.find((r) => r instanceof Error)! as Error
        }.message`,
      );
    }
    const [a, b] = argResults as [AbstractType, AbstractType];
    return [a, b];
  }
}
