import type { AbstractType } from "./AbstractType";
import { expect } from "bun:test";

export function printType(type: AbstractType): void {
  console.log(type.toString());
}

export function printCompare(a: AbstractType | Error, b: AbstractType | Error) {
  if (a instanceof Error) throw a;
  if (b instanceof Error) throw b;

  console.log(`Comparing ${a.toString()} to ${b.toString()}:`);
  console.log(a.compareTo(b));
  console.log(`Comparing ${b.toString()} to ${a.toString()}:`);
  console.log(b.compareTo(a));
}

export function wider(a: AbstractType | Error, b: AbstractType | Error) {
  if (a instanceof Error) {
    expect(a).fail("Expected a to be a type, but got an error: " + a.message);
    return;
  }
  if (b instanceof Error) {
    expect(b).fail("Expected b to be a type, but got an error: " + b.message);
    return;
  }

  expect(a.compareTo(b)).toMatchObject({ type: "wider" });
  expect(b.compareTo(a)).toMatchObject({ type: "narrower" });
}

export function narrower(a: AbstractType | Error, b: AbstractType | Error) {
  if (a instanceof Error) {
    expect(a).fail("Expected a to be a type, but got an error: " + a.message);
    return;
  }
  if (b instanceof Error) {
    expect(b).fail("Expected b to be a type, but got an error: " + b.message);
    return;
  }

  expect(a.compareTo(b)).toMatchObject({ type: "narrower" });
  expect(b.compareTo(a)).toMatchObject({ type: "wider" });
}

export function equal(a: AbstractType | Error, b: AbstractType | Error) {
  if (a instanceof Error) {
    expect(a).fail("Expected a to be a type, but got an error: " + a.message);
    return;
  }
  if (b instanceof Error) {
    expect(b).fail("Expected b to be a type, but got an error: " + b.message);
    return;
  }

  expect(a.compareTo(b)).toMatchObject({ type: "equal" });
  expect(b.compareTo(a)).toMatchObject({ type: "equal" });
}

export function incompatible(a: AbstractType | Error, b: AbstractType | Error) {
  if (a instanceof Error) {
    expect(a).fail("Expected a to be a type, but got an error: " + a.message);
    return;
  }
  if (b instanceof Error) {
    expect(b).fail("Expected b to be a type, but got an error: " + b.message);
    return;
  }

  expect(a.compareTo(b).type).toBe("incompatible");
  expect(b.compareTo(a).type).toBe("incompatible");
}
