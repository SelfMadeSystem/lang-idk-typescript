import { Module } from "./ast";
import { createInputState } from "./parserLib";
import test from './test.mylang' with { type: "text" };

const result = Module.parse("test")(createInputState(test));

if (!result.success) {
  console.error("Parsing failed:", result.error);
} else {
  console.log("Parsing succeeded:");
  console.log(result.value.toLangString());
  console.log(result.value.toAstString());
}
