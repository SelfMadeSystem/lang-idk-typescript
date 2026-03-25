import {
  NamedTypeExpr,
  GenericTypeExpr,
  AppliedGenericExpr,
  ObjectTypeExpr,
  TypeAlias,
  TypeDef,
  TypeExpression,
  TypeUnit,
  type Statement,
  FunctionCall,
  Module,
  AccessExpr,
  AbstractNode,
  IfExpr,
  BinOpExpr,
  TupleTypeExpr,
  UniOpExpr,
} from "../parser/ast";
import { AnyType, NeverType, type AbstractType } from "../types/AbstractType";
import { AliasType } from "../types/AliasType";
import { AppliedGenerics } from "../types/AppliedGenerics";
import { GenericParameter, GenericType } from "../types/GenericType";
import {
  LazyApplyArguments,
  LazyBinOpType,
  LazyIfElseType,
  LazyUniOpType,
} from "../types/LazyType";
import { NamedType } from "../types/NamedType";
import { ObjectType } from "../types/ObjectType";
import { PrimitiveType } from "../types/Primitives";
import { UnionType } from "../types/UnionType";
import { Environment } from "./Environment";

function atError(ast: AbstractNode) {
  return "at " + ast.range.start.line + ":" + ast.range.start.column;
}

export class Runtime {
  public environment: Environment = new Environment();

  private definePrimitive(name: string, inherits: string[] = []) {
    const primitive = PrimitiveType.get(name, inherits);
    this.environment.define(name, primitive);
  }

  constructor() {
    this.definePrimitive("string");
    this.definePrimitive("number");
    this.definePrimitive("float", ["number"]);
    this.definePrimitive("int", ["number"]);
    this.definePrimitive("boolean");
    this.definePrimitive("true", ["boolean"]);
    this.definePrimitive("false", ["boolean"]);
    this.environment.define("never", NeverType.get());
    this.environment.define("any", AnyType.get());
  }

  public runModule(module: Module) {
    for (const statement of module.body) {
      this.aliasStatement(statement);
    }
    for (const statement of module.body) {
      const result = this.runStatement(statement);
      if (result instanceof Error) {
        console.error(
          `Error in statement at ${statement.range.start.line}:${statement.range.start.column}: ${result.message}`,
          { cause: result },
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

  public aliasStatement(statement: Statement) {
    if (statement instanceof TypeUnit) {
      this.environment.define(
        statement.name.name,
        new AliasType(statement.name.name),
      );
    } else if (statement instanceof TypeDef) {
      this.environment.define(
        statement.name.name,
        new AliasType(statement.name.name),
      );
    } else if (statement instanceof TypeAlias) {
      this.environment.define(
        statement.name.name,
        new AliasType(statement.name.name),
      );
    }
  }

  public runStatement(statement: Statement) {
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
      const result2 = this.runExpression(statement.expression);
      if (result2 instanceof Error) {
        return result2;
      }
      const result1 = this.environment.define(statement.name.name, namedType);
      if (result1 instanceof Error) {
        return result1;
      }
      if (result2 instanceof AliasType) {
        return new Error(
          "Type definitions cannot be aliases " + atError(statement),
        );
      }
      if (result2 instanceof AppliedGenerics) {
        return new Error(
          "Type definitions cannot be applied generics " + atError(statement),
        );
      }
      namedType.type = result2.getSimplifiedType(this.environment);
      return;
    }
    if (statement instanceof TypeAlias) {
      // Set an alias in case of recursive types, then populate it with the actual type once we have it
      const alias = new AliasType(statement.name.name);
      const result2 = this.runExpression(statement.expression);
      if (result2 instanceof Error) {
        return result2;
      }
      const result1 = this.environment.define(statement.name.name, alias);
      if (result1 instanceof Error) {
        return result1;
      }
      if (result2 instanceof AliasType) {
        return new Error(
          "Recursive type aliase detected " + atError(statement),
        );
      }
      if (result2 instanceof AppliedGenerics) {
        return new Error(
          "Type aliases cannot be applied generics " + atError(statement),
        );
      }
      this.environment.set(
        statement.name.name,
        result2.getSimplifiedType(this.environment),
      );
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
    using _ = this.environment; // clear temporary types after running each expression
    try {
      if (expression instanceof NamedTypeExpr) {
        const result = this.environment.lookup(expression.name.name);
        if (!result) {
          return new Error(
            `Type ${expression.name.name} not found in environment ${atError(expression)}`,
          );
        }
        if (expression.next) {
          const nextResult = this.runExpression(expression.next);
          if (nextResult instanceof Error) {
            return nextResult;
          }
          if (nextResult instanceof AppliedGenerics) {
            if (result instanceof GenericParameter) {
              return new LazyApplyArguments(result, nextResult);
            }
            const r = result.applyTypeArguments(nextResult, this.environment);
            if (r instanceof Error) {
              return new Error(
                `Failed to apply type arguments to ${expression.name.name} ${atError(expression)}: ${r.message}`,
                { cause: r },
              );
            }
            return r;
          }
          return new Error(
            `Expected type arguments after ${expression.name.name} ${atError(expression)}`,
          );
        }
        return result;
      }
      if (expression instanceof GenericTypeExpr) {
        this.pushEnvironment();
        try {
          const genericParameters: GenericParameter[] = [];
          const genericType = new GenericType([], null as any);

          const pMap = new Map<string, GenericParameter>();

          for (const param of expression.args) {
            const p = new GenericParameter(param.name.name);
            const r = this.environment.define(param.name.name, p);
            if (r instanceof Error) {
              return r;
            }
            genericType.pushParameter(p);
            pMap.set(param.name.name, p);
          }

          for (const param of expression.args) {
            const p = pMap.get(param.name.name)!;

            const constraintResult = param.constraint
              ? this.runExpression(param.constraint)
              : null;
            if (constraintResult instanceof Error) {
              return new Error(
                `Failed to evaluate constraint for generic parameter ${param.name.name} ${atError(expression)}: ${constraintResult.message}`,
                { cause: constraintResult },
              );
            }
            if (constraintResult instanceof AppliedGenerics) {
              return new Error(
                `Applied generics are not supported as generic parameter constraints ${atError(expression)}`,
              );
            }
            p.constraint = constraintResult;

            const defaultResult = param.defaultType
              ? this.runExpression(param.defaultType)
              : null;
            if (defaultResult instanceof Error) {
              return new Error(
                `Failed to evaluate default type for generic parameter ${param.name.name} ${atError(expression)}: ${defaultResult.message}`,
                { cause: defaultResult },
              );
            }
            if (defaultResult instanceof AppliedGenerics) {
              return new Error(
                `Applied generics are not supported as generic parameter default types ${atError(expression)}`,
              );
            }
            p.defaultType = defaultResult;
            genericParameters.push(p);
          }

          if (!expression.next) {
            return new Error(
              `Generic type must have a body ${atError(expression)}`,
            );
          }
          const typeResult = this.runExpression(expression.next);
          if (typeResult instanceof Error) {
            return new Error(
              `Failed to evaluate body of generic type ${atError(expression)}: ${typeResult.message}`,
              { cause: typeResult },
            );
          }
          if (typeResult instanceof AppliedGenerics) {
            return new Error(
              `Applied generics are not supported as generic type bodies ${atError(expression)}`,
            );
          }

          genericType.type = typeResult;
          return genericType;
        } finally {
          this.popEnvironment();
        }
      }
      if (expression instanceof AppliedGenericExpr) {
        const positional: AbstractType[] = [];
        const named: Record<string, AbstractType> = {};
        for (const arg of expression.args) {
          const result = this.runExpression(arg.value);
          if (result instanceof Error) {
            return new Error(
              `Failed to evaluate type argument ${atError(expression)}: ${result.message}`,
              { cause: result },
            );
          }
          if (result instanceof AppliedGenerics) {
            return new Error(
              `Nested applied generics are not supported ${atError(expression)}`,
            );
          }
          if (arg.name) {
            if (named[arg.name.name]) {
              return new Error(
                `Duplicate named argument ${atError(expression)}: ${arg.name.name}`,
              );
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
              `Failed to evaluate applied generic target ${atError(expression)}: ${nextResult.message}`,
              { cause: nextResult },
            );
          }
          if (!(nextResult instanceof AppliedGenerics)) {
            return new Error(
              `Expected a generic type to apply arguments to, got ${typeof nextResult} ${atError(expression)}`,
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
              `Failed to evaluate type of property ${prop.name.name} ${atError(prop.value)}: ${typeResult.message}`,
              { cause: typeResult },
            );
          }
          if (typeResult instanceof AppliedGenerics) {
            return new Error(
              `Applied generics are not supported in object types ${atError(prop.value)}`,
            );
          }
          properties[prop.name.name] = typeResult;
        }
        return new ObjectType(properties);
      }
      if (expression instanceof AccessExpr) {
        const targetResult = this.runExpression(expression.object);
        if (targetResult instanceof Error) {
          return new Error(
            `Failed to evaluate target of access expression ${atError(expression)}: ${targetResult.message}`,
            { cause: targetResult },
          );
        }
        if (targetResult instanceof AppliedGenerics) {
          return new Error(
            `Cannot access properties on applied generics ${atError(expression)}`,
          );
        }
        let result = targetResult;
        for (const p of expression.properties) {
          result = result.getProperty(p.name, this.environment);
        }
        return result;
      }
      if (expression instanceof IfExpr) {
        const conditionResult = this.runExpression(expression.condition);
        if (conditionResult instanceof Error) {
          return new Error(
            `Failed to evaluate condition of if expression ${atError(expression)}: ${conditionResult.message}`,
            { cause: conditionResult },
          );
        }
        if (conditionResult instanceof AppliedGenerics) {
          return new Error(
            `Applied generics cannot be used as conditions in if expressions ${atError(expression)}`,
          );
        }
        const thenResult = this.runExpression(expression.thenBranch);
        if (thenResult instanceof Error) {
          return new Error(
            `Failed to evaluate then branch of if expression ${atError(expression)}: ${thenResult.message}`,
            { cause: thenResult },
          );
        }
        if (thenResult instanceof AppliedGenerics) {
          return new Error(
            `Applied generics cannot be used in then branches of if expressions ${atError(expression)}`,
          );
        }
        const elseResult = this.runExpression(expression.elseBranch);
        if (elseResult instanceof Error) {
          return new Error(
            `Failed to evaluate else branch of if expression ${atError(expression)}: ${elseResult.message}`,
            { cause: elseResult },
          );
        }
        if (elseResult instanceof AppliedGenerics) {
          return new Error(
            `Applied generics cannot be used in else branches of if expressions ${atError(expression)}`,
          );
        }
        if (
          conditionResult instanceof PrimitiveType &&
          conditionResult.name === "true"
        ) {
          return thenResult;
        } else if (
          conditionResult instanceof PrimitiveType &&
          conditionResult.name === "false"
        ) {
          return elseResult;
        } else {
          return new LazyIfElseType(conditionResult, thenResult, elseResult);
        }
      }
      if (expression instanceof BinOpExpr) {
        const leftResult = this.runExpression(expression.left);
        if (leftResult instanceof Error) {
          return new Error(
            `Failed to evaluate left operand of binary expression ${atError(expression)}: ${leftResult.message}`,
            { cause: leftResult },
          );
        }
        if (leftResult instanceof AppliedGenerics) {
          return new Error(
            `Applied generics cannot be used as operands in binary expressions ${atError(expression)}`,
          );
        }
        const rightResult = this.runExpression(expression.right);
        if (rightResult instanceof Error) {
          return new Error(
            `Failed to evaluate right operand of binary expression ${atError(expression)}: ${rightResult.message}`,
            { cause: rightResult },
          );
        }
        if (rightResult instanceof AppliedGenerics) {
          return new Error(
            `Applied generics cannot be used as operands in binary expressions ${atError(expression)}`,
          );
        }
        if (
          leftResult.isIncomplete(this.environment) ||
          rightResult.isIncomplete(this.environment)
        ) {
          return new LazyBinOpType(
            leftResult,
            expression.operator,
            rightResult,
          );
        }
        const result = LazyBinOpType.doOp(
          leftResult,
          expression.operator,
          rightResult,
          this.environment,
        );
        if (!result) {
          return new LazyBinOpType(
            leftResult,
            expression.operator,
            rightResult,
          );
        }
        return result;
      }
      if (expression instanceof UniOpExpr) {
        const operandResult = this.runExpression(expression.operand);
        if (operandResult instanceof Error) {
          return new Error(
            `Failed to evaluate operand of unary expression ${atError(expression)}: ${operandResult.message}`,
            { cause: operandResult },
          );
        }
        if (operandResult instanceof AppliedGenerics) {
          return new Error(
            `Applied generics cannot be used as operands in unary expressions ${atError(expression)}`,
          );
        }
        if (operandResult.isIncomplete(this.environment)) {
          return new LazyUniOpType(expression.operator, operandResult);
        }
        const result = LazyUniOpType.doOp(
          expression.operator,
          operandResult,
          this.environment,
        );
        if (!result) {
          return new LazyUniOpType(expression.operator, operandResult);
        }
        return result;
      }
      if (expression instanceof TupleTypeExpr) {
        if (expression.elements.length !== 1) {
          return new Error(
            `Tuple types aren't supported yet ${atError(expression)}`,
          );
        }
        return this.runExpression(expression.elements[0]!);
      }
    } catch (e) {
      if (e instanceof Error) {
        return e;
      }
      return new Error(`Unknown error ${atError(expression)}: ${e}`);
    }
    return new Error(`Unknown type expression ${atError(expression)}`);
  }

  private runFunctionCall(call: FunctionCall) {
    switch (call.name.name) {
      case "print": {
        const args = call.args.map((arg) => {
          const result = this.runExpression(arg);
          if (result instanceof Error) {
            return new Error(
              `Failed to evaluate argument for print ${atError(arg)}: ${result.message}`,
              { cause: result },
            );
          }
          if (result instanceof AppliedGenerics) {
            return new Error(
              `Applied generics cannot be printed ${atError(arg)}`,
            );
          }
          return result.getSimplifiedType(this.environment);
        });
        for (const arg of args) {
          if (arg instanceof Error) {
            console.error(arg.message);
            if (arg.cause) {
              console.error("Caused by:", arg.cause);
            }
          } else {
            console.log(arg.toString(this.environment));
          }
        }
        break;
      }
      case "debugPrint": {
        const args = call.args.map((arg) => {
          const result = this.runExpression(arg);
          if (result instanceof Error) {
            return new Error(
              `Failed to evaluate argument for print ${atError(arg)}: ${result.message}`,
              { cause: result },
            );
          }
          if (result instanceof AppliedGenerics) {
            return new Error(
              `Applied generics cannot be printed ${atError(arg)}`,
            );
          }
          return result.getSimplifiedType(this.environment);
        });
        for (const arg of args) {
          if (arg instanceof Error) {
            console.error(arg.message);
            if (arg.cause) {
              console.error("Caused by:", arg.cause);
            }
          } else {
            console.log(arg.debugString());
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
      case "debugger": {
        const args = call.args.map((arg) => {
          const result = this.runExpression(arg);
          if (result instanceof Error) {
            return new Error(
              `Failed to evaluate argument for print ${atError(arg)}: ${result.message}`,
              { cause: result },
            );
          }
          if (result instanceof AppliedGenerics) {
            return new Error(
              `Applied generics cannot be printed ${atError(arg)}`,
            );
          }
          return result.getSimplifiedType(this.environment);
        });
        debugger;
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
      return new Error(
        `comparison function requires exactly 2 arguments ${atError(call)}`,
      );
    }
    const argResults = call.args.map((arg) => this.runExpression(arg));
    if (argResults.some((r) => r instanceof Error)) {
      return new Error(
        `Failed to evaluate arguments for comparison ${atError(call)}: ${
          argResults.find((r) => r instanceof Error)! as Error
        }.message`,
        {
          cause: argResults.find((r) => r instanceof Error) as Error,
        },
      );
    }
    const [a, b] = argResults as [AbstractType, AbstractType];
    return [a.getSimplifiedType(env), b.getSimplifiedType(env)];
  }
}
