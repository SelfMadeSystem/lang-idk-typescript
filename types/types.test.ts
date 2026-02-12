import { test, expect } from "bun:test";
import { UnionType } from "./UnionType";
import { ObjectType } from "./ObjectType";
import { IntType, StringType } from "./Primitives";
import { NeverType } from "./AbstractType";

test("IntType is equal to IntType", () => {
  const intType1 = new IntType();
  const intType2 = new IntType();
  expect(intType1.compareTo(intType2)).toMatchObject({ type: "equal" });
});

test("StringType is equal to StringType", () => {
  const stringType1 = new StringType();
  const stringType2 = new StringType();
  expect(stringType1.compareTo(stringType2)).toMatchObject({ type: "equal" });
});

test("IntType is incompatible with StringType", () => {
  const intType = new IntType();
  const stringType = new StringType();
  expect(intType.compareTo(stringType).type).toBe("incompatible");
});

test("ObjectTypes with same properties are equal", () => {
  const objType1 = new ObjectType({ a: new IntType(), b: new StringType() });
  const objType2 = new ObjectType({ a: new IntType(), b: new StringType() });
  expect(objType1.compareTo(objType2)).toMatchObject({ type: "equal" });
});

test("ObjectType with fewer properties is wider", () => {
  const objType1 = new ObjectType({ a: new IntType() });
  const objType2 = new ObjectType({ a: new IntType(), b: new StringType() });
  expect(objType1.compareTo(objType2)).toMatchObject({ type: "wider" });
});

test("ObjectType with more properties is narrower", () => {
  const objType1 = new ObjectType({ a: new IntType() });
  const objType2 = new ObjectType({ a: new IntType(), b: new StringType() });
  expect(objType2.compareTo(objType1)).toMatchObject({ type: "narrower" });
});

test("ObjectTypes with incompatible properties are incompatible", () => {
  const objType1 = new ObjectType({ a: new IntType() });
  const objType2 = new ObjectType({ a: new StringType() });
  expect(objType1.compareTo(objType2).type).toBe("incompatible");
});

test("ObjectType with different properties are incompatible", () => {
  const objType1 = new ObjectType({ a: new IntType() });
  const objType2 = new ObjectType({ b: new IntType() });
  expect(objType1.compareTo(objType2).type).toBe("incompatible");
});

test("IntType is incompatible with ObjectType", () => {
  const intType = new IntType();
  const objType = new ObjectType({ a: new IntType() });
  expect(intType.compareTo(objType).type).toBe("incompatible");
});

test("UnionType with same members are equal", () => {
  const unionType1 = UnionType.create([new IntType(), new StringType()]);
  const unionType2 = UnionType.create([new StringType(), new IntType()]);
  expect(unionType1.compareTo(unionType2)).toMatchObject({ type: "equal" });
});

test("UnionType with subset of members is narrower", () => {
  const unionType1 = UnionType.create([new IntType(), new ObjectType({ a: new IntType() })]);
  const unionType2 = UnionType.create([new IntType(), new ObjectType({ a: new IntType() }), new StringType()]);
  expect(unionType1.compareTo(unionType2)).toMatchObject({ type: "narrower" });
});

test("UnionType with superset of members is wider", () => {
  const unionType1 = UnionType.create([new IntType(), new ObjectType({ a: new IntType() })]);
  const unionType2 = UnionType.create([new IntType(), new ObjectType({ a: new IntType() }), new StringType()]);
  expect(unionType2.compareTo(unionType1)).toMatchObject({ type: "wider" });
});

test("UnionTypes with different members are incompatible", () => {
  const unionType1 = UnionType.create([new IntType(), new ObjectType({ a: new IntType() })]);
  const unionType2 = UnionType.create([new StringType(), new ObjectType({ a: new StringType() })]);
  expect(unionType1.compareTo(unionType2).type).toBe("incompatible");
});

test("UnionType is wider than its members", () => {
  const unionType = UnionType.create([new IntType(), new StringType()]);
  const intType = new IntType();
  const stringType = new StringType();
  expect(unionType.compareTo(intType)).toMatchObject({ type: "wider" });
  expect(unionType.compareTo(stringType)).toMatchObject({ type: "wider" });
});

test("Members of a UnionType are narrower than the UnionType", () => {
  const unionType = UnionType.create([new IntType(), new StringType()]);
  const intType = new IntType();
  const stringType = new StringType();
  expect(intType.compareTo(unionType)).toMatchObject({ type: "narrower" });
  expect(stringType.compareTo(unionType)).toMatchObject({ type: "narrower" });
});

test("UnionType create simplifies nested unions and removes duplicates and never types", () => {
  const unionType = UnionType.create([
    new IntType(),
    new StringType(),
    new IntType(),
    UnionType.create([new IntType(), new StringType()]),
  ]);
  const simplifiedUnion = UnionType.create([new IntType(), new StringType()]);
  expect(unionType.compareTo(simplifiedUnion)).toMatchObject({ type: "equal" });
});

test("UnionType with no members is never", () => {
  const unionType = UnionType.create([]);
  const neverType = new NeverType();
  expect(unionType.compareTo(neverType)).toMatchObject({ type: "equal" });
});

test("UnionType with one member simplifies to that member", () => {
  const unionType = UnionType.create([new IntType(), new IntType()]);
  const intType = new IntType();
  expect(unionType.compareTo(intType)).toMatchObject({ type: "equal" });
});

test("UnionType with nested unions compares correctly", () => {
  const unionType1 = UnionType.create([new IntType(), new ObjectType({ a: new IntType() })]);
  const unionType2 = UnionType.create([new StringType(), new ObjectType({ a: new StringType() })]);
  const mixedUnionType = UnionType.create([unionType1, unionType2]);
  expect(mixedUnionType.compareTo(unionType1).type).toBe("wider");
});

test("ObjectType with nested ObjectTypes is equal when identical", () => {
  const objType1 = new ObjectType({
    a: new ObjectType({ b: new IntType(), c: new StringType() }),
  });
  const objType2 = new ObjectType({
    a: new ObjectType({ b: new IntType(), c: new StringType() }),
  });
  expect(objType1.compareTo(objType2)).toMatchObject({ type: "equal" });
});

test("ObjectType with nested ObjectTypes is incompatible when properties differ", () => {
  const objType1 = new ObjectType({
    a: new ObjectType({ b: new IntType(), c: new StringType() }),
  });
  const objType2 = new ObjectType({
    a: new ObjectType({ b: new StringType(), c: new IntType() }),
  });
  expect(objType1.compareTo(objType2).type).toBe("incompatible");
});

test("UnionType with nested ObjectTypes simplifies correctly", () => {
  const unionType = UnionType.create([
    new ObjectType({ a: new IntType() }),
    new ObjectType({ a: new IntType() }),
  ]);
  const simplifiedUnion = UnionType.create([new ObjectType({ a: new IntType() })]);
  expect(unionType.compareTo(simplifiedUnion)).toMatchObject({ type: "equal" });
});

test("UnionType with NeverType simplifies to other members", () => {
  const unionType = UnionType.create([new IntType(), new NeverType()]);
  const intType = new IntType();
  expect(unionType.compareTo(intType)).toMatchObject({ type: "equal" });
});

test("UnionType with duplicate members simplifies correctly", () => {
  const unionType = UnionType.create([new IntType(), new IntType(), new StringType()]);
  const simplifiedUnion = UnionType.create([new IntType(), new StringType()]);
  expect(unionType.compareTo(simplifiedUnion)).toMatchObject({ type: "equal" });
});

test("ObjectType with additional nested properties is narrower", () => {
  const objType1 = new ObjectType({
    a: new ObjectType({ b: new IntType() }),
  });
  const objType2 = new ObjectType({
    a: new ObjectType({ b: new IntType(), c: new StringType() }),
  });
  expect(objType2.compareTo(objType1)).toMatchObject({ type: "narrower" });
});

test("ObjectType with missing nested properties is wider", () => {
  const objType1 = new ObjectType({
    a: new ObjectType({ b: new IntType(), c: new StringType() }),
  });
  const objType2 = new ObjectType({
    a: new ObjectType({ b: new IntType() }),
  });
  expect(objType2.compareTo(objType1)).toMatchObject({ type: "wider" });
});

test("ObjectType with nested UnionType compares correctly", () => {
  const objType1 = new ObjectType({
    a: UnionType.create([new IntType(), new StringType()]),
  });
  const objType2 = new ObjectType({
    a: new IntType(),
  });
  expect(objType1.compareTo(objType2)).toMatchObject({ type: "wider" });
});
