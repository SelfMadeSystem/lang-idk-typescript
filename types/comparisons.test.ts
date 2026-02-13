import { test, expect, describe } from "bun:test";
import { UnionType } from "./UnionType";
import { ObjectType } from "./ObjectType";
import { IntType, StringType } from "./Primitives";
import { AbstractType, NeverType } from "./AbstractType";
import { GenericParameter, GenericType } from "./GenericType";

function wider(a: AbstractType, b: AbstractType) {
  expect(a.compareTo(b)).toMatchObject({ type: "wider" });
  expect(b.compareTo(a)).toMatchObject({ type: "narrower" });
}

function narrower(a: AbstractType, b: AbstractType) {
  expect(a.compareTo(b)).toMatchObject({ type: "narrower" });
  expect(b.compareTo(a)).toMatchObject({ type: "wider" });
}

function equal(a: AbstractType, b: AbstractType) {
  expect(a.compareTo(b)).toMatchObject({ type: "equal" });
}

function incompatible(a: AbstractType, b: AbstractType) {
  expect(a.compareTo(b).type).toBe("incompatible");
}

describe("Primitives", () => {
  test("IntType is equal to IntType", () => {
    const intType1 = new IntType();
    const intType2 = new IntType();
    equal(intType1, intType2);
  });

  test("StringType is equal to StringType", () => {
    const stringType1 = new StringType();
    const stringType2 = new StringType();
    equal(stringType1, stringType2);
  });

  test("IntType is incompatible with StringType", () => {
    const intType = new IntType();
    const stringType = new StringType();
    incompatible(intType, stringType);
  });
});

describe("ObjectType", () => {
  test("ObjectTypes with same properties are equal", () => {
    const objType1 = new ObjectType({ a: new IntType(), b: new StringType() });
    const objType2 = new ObjectType({ a: new IntType(), b: new StringType() });
    equal(objType1, objType2);
  });

  test("ObjectType with fewer properties is wider", () => {
    const objType1 = new ObjectType({ a: new IntType() });
    const objType2 = new ObjectType({ a: new IntType(), b: new StringType() });
    wider(objType1, objType2);
  });

  test("ObjectType with more properties is narrower", () => {
    const objType1 = new ObjectType({ a: new IntType() });
    const objType2 = new ObjectType({ a: new IntType(), b: new StringType() });
    narrower(objType2, objType1);
  });

  test("ObjectTypes with incompatible properties are incompatible", () => {
    const objType1 = new ObjectType({ a: new IntType() });
    const objType2 = new ObjectType({ a: new StringType() });
    incompatible(objType1, objType2);
  });

  test("ObjectType with different properties are incompatible", () => {
    const objType1 = new ObjectType({ a: new IntType() });
    const objType2 = new ObjectType({ b: new IntType() });
    incompatible(objType1, objType2);
  });

  test("IntType is incompatible with ObjectType", () => {
    const intType = new IntType();
    const objType = new ObjectType({ a: new IntType() });
    incompatible(intType, objType);
  });

  test("ObjectType with nested ObjectTypes is equal when identical", () => {
    const objType1 = new ObjectType({
      a: new ObjectType({ b: new IntType(), c: new StringType() }),
    });
    const objType2 = new ObjectType({
      a: new ObjectType({ b: new IntType(), c: new StringType() }),
    });
    equal(objType1, objType2);
  });

  test("ObjectType with nested ObjectTypes is incompatible when properties differ", () => {
    const objType1 = new ObjectType({
      a: new ObjectType({ b: new IntType(), c: new StringType() }),
    });
    const objType2 = new ObjectType({
      a: new ObjectType({ b: new StringType(), c: new IntType() }),
    });
    incompatible(objType1, objType2);
  });

  test("ObjectType with additional nested properties is narrower", () => {
    const objType1 = new ObjectType({
      a: new ObjectType({ b: new IntType() }),
    });
    const objType2 = new ObjectType({
      a: new ObjectType({ b: new IntType(), c: new StringType() }),
    });
    narrower(objType2, objType1);
  });

  test("ObjectType with missing nested properties is wider", () => {
    const objType1 = new ObjectType({
      a: new ObjectType({ b: new IntType(), c: new StringType() }),
    });
    const objType2 = new ObjectType({
      a: new ObjectType({ b: new IntType() }),
    });
    wider(objType2, objType1);
  });

  test("ObjectType with nested UnionType compares correctly", () => {
    const objType1 = new ObjectType({
      a: UnionType.create([new IntType(), new StringType()]),
    });
    const objType2 = new ObjectType({
      a: new IntType(),
    });
    narrower(objType2, objType1);
    wider(objType1, objType2);
  });
});

describe("UnionType", () => {
  test("UnionType with same members are equal", () => {
    const unionType1 = UnionType.create([new IntType(), new StringType()]);
    const unionType2 = UnionType.create([new StringType(), new IntType()]);
    equal(unionType1, unionType2);
  });

  test("UnionType with subset of members is narrower", () => {
    const unionType1 = UnionType.create([
      new IntType(),
      new ObjectType({ a: new IntType() }),
    ]);
    const unionType2 = UnionType.create([
      new IntType(),
      new ObjectType({ a: new IntType() }),
      new StringType(),
    ]);
    narrower(unionType1, unionType2);
  });

  test("UnionType with superset of members is wider", () => {
    const unionType1 = UnionType.create([
      new IntType(),
      new ObjectType({ a: new IntType() }),
    ]);
    const unionType2 = UnionType.create([
      new IntType(),
      new ObjectType({ a: new IntType() }),
      new StringType(),
    ]);
    wider(unionType2, unionType1);
  });

  test("UnionTypes with different members are incompatible", () => {
    const unionType1 = UnionType.create([
      new IntType(),
      new ObjectType({ a: new IntType() }),
    ]);
    const unionType2 = UnionType.create([
      new StringType(),
      new ObjectType({ a: new StringType() }),
    ]);
    incompatible(unionType1, unionType2);
  });

  test("UnionType is wider than its members", () => {
    const unionType = UnionType.create([new IntType(), new StringType()]);
    const intType = new IntType();
    const stringType = new StringType();
    wider(unionType, intType);
    wider(unionType, stringType);
  });

  test("Members of a UnionType are narrower than the UnionType", () => {
    const unionType = UnionType.create([new IntType(), new StringType()]);
    const intType = new IntType();
    const stringType = new StringType();
    narrower(intType, unionType);
    narrower(stringType, unionType);
  });

  test("UnionType create simplifies nested unions and removes duplicates and never types", () => {
    const unionType = UnionType.create([
      new IntType(),
      new StringType(),
      new IntType(),
      UnionType.create([new IntType(), new StringType()]),
    ]);
    const simplifiedUnion = UnionType.create([new IntType(), new StringType()]);
    equal(unionType, simplifiedUnion);
  });

  test("UnionType with no members is never", () => {
    const unionType = UnionType.create([]);
    const neverType = new NeverType();
    equal(unionType, neverType);
  });

  test("UnionType with one member simplifies to that member", () => {
    const unionType = UnionType.create([new IntType(), new IntType()]);
    const intType = new IntType();
    equal(unionType, intType);
  });

  test("UnionType with nested unions compares correctly", () => {
    const unionType1 = UnionType.create([
      new IntType(),
      new ObjectType({ a: new IntType() }),
    ]);
    const unionType2 = UnionType.create([
      new StringType(),
      new ObjectType({ a: new StringType() }),
    ]);
    const mixedUnionType = UnionType.create([unionType1, unionType2]);
    wider(mixedUnionType, unionType1);
  });

  test("UnionType with nested ObjectTypes simplifies correctly", () => {
    const unionType = UnionType.create([
      new ObjectType({ a: new IntType() }),
      new ObjectType({ a: new IntType() }),
    ]);
    const simplifiedUnion = UnionType.create([
      new ObjectType({ a: new IntType() }),
    ]);
    equal(unionType, simplifiedUnion);
  });

  test("UnionType with NeverType simplifies to other members", () => {
    // in fact, this should be an IntType since UnionType.create can create a
    // union if there is more than one member, return the single member if there
    // is only one, and return NeverType if there are none.
    const unionType = UnionType.create([new IntType(), new NeverType()]);
    const intType = new IntType();
    equal(unionType, intType);
  });

  test("UnionType with duplicate members simplifies correctly", () => {
    const unionType = UnionType.create([
      new IntType(),
      new IntType(),
      new StringType(),
    ]);
    const simplifiedUnion = UnionType.create([new IntType(), new StringType()]);
    equal(unionType, simplifiedUnion);
  });
});

describe("GenericType", () => {
  test("GenericType with same parameters is equal", () => {
    const genericType1 = new GenericType([new GenericParameter("A")]);
    const genericType2 = new GenericType([new GenericParameter("B")]);
    equal(genericType1, genericType2);
  });

  test("GenericType with same constraints is equal", () => {
    const genericType1 = new GenericType([
      new GenericParameter("A", new IntType()),
    ]);
    const genericType2 = new GenericType([
      new GenericParameter("B", new IntType()),
    ]);
    equal(genericType1, genericType2);
  });

  test("GenericType with multiple same constraints is equal", () => {
    const genericType1 = new GenericType([
      new GenericParameter("A", new IntType()),
      new GenericParameter("B", new StringType()),
    ]);
    const genericType2 = new GenericType([
      new GenericParameter("C", new StringType()),
      new GenericParameter("D", new IntType()),
    ]);
    equal(genericType1, genericType2);
  });

  test("<A, B>{ a: A, b: B } is equal to <C, D>{ a: C, b: D } when constraints are the same", () => {
    const a = new GenericParameter("A", new IntType());
    const b = new GenericParameter("B", new StringType());
    const c = new GenericParameter("C", new IntType());
    const d = new GenericParameter("D", new StringType());
    const genericType1 = new GenericType([a, b], new ObjectType({ a, b }));
    const genericType2 = new GenericType(
      [d, c],
      new ObjectType({ a: c, b: d }),
    );
    equal(genericType1, genericType2);
  });

  test("<A, B>{ a: A, b: B } is incompatible with <C, D>{ a: C, b: D } when constraints differ", () => {
    const a = new GenericParameter("A", new IntType());
    const b = new GenericParameter("B", new StringType());
    const c = new GenericParameter("C", new StringType());
    const d = new GenericParameter("D", new IntType());
    const genericType1 = new GenericType([a, b], new ObjectType({ a, b }));
    const genericType2 = new GenericType(
      [d, c],
      new ObjectType({ a: c, b: d }),
    );
    incompatible(genericType1, genericType2);
  });

  test("<A>{ a: A } is wider than <B>{ a: B, b: int }", () => {
    const a = new GenericParameter("A");
    const b = new GenericParameter("B");
    const genericType1 = new GenericType([a], new ObjectType({ a }));
    const genericType2 = new GenericType(
      [b],
      new ObjectType({ a: b, b: new IntType() }),
    );
    wider(genericType1, genericType2);
  });

  test("<A: int>{ a: A } is narrower than <B>{ a: B }", () => {
    const a = new GenericParameter("A", new IntType());
    const b = new GenericParameter("B");
    const genericType1 = new GenericType([a], new ObjectType({ a }));
    const genericType2 = new GenericType([b], new ObjectType({ a: b }));
    narrower(genericType1, genericType2);
  });

  test("<A: int>{ a: A } is incompatible with <B: string>{ a: B }", () => {
    const a = new GenericParameter("A", new IntType());
    const b = new GenericParameter("B", new StringType());
    const genericType1 = new GenericType([a], new ObjectType({ a }));
    const genericType2 = new GenericType([b], new ObjectType({ a: b }));
    incompatible(genericType1, genericType2);
  });

  test("<A>{ a: A } is wider than <B>{ a: B, b: int }", () => {
    const a = new GenericParameter("A");
    const b = new GenericParameter("B");
    const genericType1 = new GenericType([a], new ObjectType({ a }));
    const genericType2 = new GenericType(
      [b],
      new ObjectType({ a: b, b: new IntType() }),
    );
    wider(genericType1, genericType2);
  });

  test("<A: int>{ a: A } is equal { a: int }", () => {
    const a = new GenericParameter("A", new IntType());
    const genericType = new GenericType([a], new ObjectType({ a }));
    const objType = new ObjectType({ a: new IntType() });
    equal(genericType, objType);
  });

  test("<A>{ a: A } is narrower than { a: int }", () => {
    const a = new GenericParameter("A");
    const genericType = new GenericType([a], new ObjectType({ a }));
    const objType = new ObjectType({ a: new IntType() });
    narrower(genericType, objType);
  });

  test("<A>{ a: A, b: A } is narrower than <B, C>{ a: B, b: C }", () => {
    const a = new GenericParameter("A");
    const b = new GenericParameter("B");
    const c = new GenericParameter("C");
    const genericType1 = new GenericType([a], new ObjectType({ a, b: a }));
    const genericType2 = new GenericType(
      [b, c],
      new ObjectType({ a: b, b: c }),
    );
    narrower(genericType1, genericType2);
  });
});

describe("Recursive Objects", () => {
  test("Recursive ObjectType is equal to another recursive ObjectType with same structure", () => {
    const objType1 = new ObjectType({
      a: new IntType(),
      b: null as any,
    });
    objType1.properties.b = objType1;
    const objType2 = new ObjectType({
      a: new IntType(),
      b: null as any,
    });
    objType2.properties.b = objType2;
    equal(objType1, objType2);
  });

  test("Recursive ObjectType is incompatible with another recursive ObjectType with different structure", () => {
    const objType1 = new ObjectType({
      a: new IntType(),
      b: null as any,
    });
    objType1.properties.b = objType1;
    const objType2 = new ObjectType({
      a: new IntType(),
      b: new ObjectType({ c: new StringType() }),
    });
    incompatible(objType1, objType2);
  });

  test("Recursive ObjectType is incompatible with another recursive ObjectType with different recursive structure", () => {
    const objType1 = new ObjectType({
      a: new IntType(),
      b: null as any,
    });
    objType1.properties.b = objType1;
    const objType2 = new ObjectType({
      a: new IntType(),
      b: new ObjectType({
        a: new IntType(),
        b: new ObjectType({
          a: new IntType(),
          b: new StringType(),
        }),
      }),
    });
    incompatible(objType1, objType2);
  });
});

describe("Recursive Generics", () => {
  test("<A: { b: B} | int, B: { a: A } | string>{ a: A, b: B } is equal to <C: { b: D } | int, D: { a: C} | string>{ a: C, b: D }", () => {
    const a = new GenericParameter("A");
    const b = new GenericParameter(
      "B",
      UnionType.create([new ObjectType({ a }), new StringType()]),
    );
    a.constraint = UnionType.create([new ObjectType({ b }), new IntType()]);
    const genericType1 = new GenericType([a, b], new ObjectType({ a, b }));
    const c = new GenericParameter("C");
    const d = new GenericParameter(
      "D",
      UnionType.create([new ObjectType({ a: c }), new StringType()]),
    );
    c.constraint = UnionType.create([
      new ObjectType({ b: d }),
      new IntType(),
    ]);
    const genericType2 = new GenericType(
      [c, d],
      new ObjectType({ a: c, b: d }),
    );
    equal(genericType1, genericType2);
  });
});
