import { test, describe, expect } from "bun:test";
import { equal, printCompare, printType } from "./testUtils";
import { UnionType } from "./UnionType";
import { ObjectType } from "./ObjectType";
import { IntType, StringType } from "./Primitives";
import { NeverType } from "./AbstractType";
import { GenericParameter, GenericType } from "./GenericType";
import { NamedType } from "./NamedType";
import { AppliedGenerics } from "./AppliedGenerics";

describe("Applying generics", () => {
  test("Basic generic application", () => {
    const t = new GenericParameter("T");
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new IntType()], {}),
    );
    equal(appliedType, new IntType());
  });

  test("<T>{ t: T } with T = int", () => {
    const t = new GenericParameter("T");
    const genericType = new GenericType([t], new ObjectType({ t }));
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new IntType()], {}),
    );
    equal(appliedType, new ObjectType({ t: new IntType() }));
  });

  test("<A, B>{ a: A, b: B, ab: (A | B) } with A = int, B = string", () => {
    const a = new GenericParameter("A");
    const b = new GenericParameter("B");
    const genericType = new GenericType(
      [a, b],
      new ObjectType({ a, b, ab: UnionType.create([a, b]) }),
    );
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new IntType(), new StringType()], {}),
    );
    equal(
      appliedType,
      new ObjectType({
        a: new IntType(),
        b: new StringType(),
        ab: UnionType.create([new IntType(), new StringType()]),
      }),
    );
  });
});

describe("Applying generics with errors", () => {
  test("Generic application with missing argument", () => {
    const t = new GenericParameter("T");
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([], {}),
    );
    equal(appliedType, genericType);
  });

  test("Generic application with too many positional arguments", () => {
    const t = new GenericParameter("T");
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new IntType(), new IntType()], {}),
    );
    expect(appliedType).toBeInstanceOf(Error);
  });

  test("Generic application with unknown named argument", () => {
    const t = new GenericParameter("T");
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([], { U: new IntType() }),
    );
    expect(appliedType).toBeInstanceOf(Error);
  });

  test("Generic application with duplicate arguments", () => {
    const t = new GenericParameter("T");
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new IntType()], { T: new IntType() }),
    );
    expect(appliedType).toBeInstanceOf(Error);
  });

  test("Generic application with missing named argument that has a default", () => {
    const t = new GenericParameter("T", null, new IntType());
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([], {}),
    );
    equal(appliedType, new IntType());
  });

  test("Generic application with wider constraint", () => {
    const t = new GenericParameter("T", new ObjectType({ x: new IntType() }));
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics(
        [new ObjectType({ x: new IntType(), y: new IntType() })],
        {},
      ),
    );
    equal(appliedType, new ObjectType({ x: new IntType(), y: new IntType() }));
  });

  test("Generic application with narrower constraint", () => {
    const t = new GenericParameter(
      "T",
      new ObjectType({ x: new IntType(), y: new IntType() }),
    );
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new ObjectType({ x: new IntType() })], {}),
    );
    expect(appliedType).toBeInstanceOf(Error);
  });

  test("Generic application with incompatible constraint", () => {
    const t = new GenericParameter("T", new ObjectType({ x: new IntType() }));
    const genericType = new GenericType([t], t);
    const appliedType = genericType.applyTypeArguments(
      new AppliedGenerics([new IntType()], {}),
    );
    expect(appliedType).toBeInstanceOf(Error);
  });
});
