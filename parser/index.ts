import { Module } from "./ast";
import { createInputState } from "./parserLib";

export function parse(source: string, filename: string) {
  const result = Module.parse(filename)(createInputState(source));
  
  if (!result.success) {
    throw new Error(`Parsing failed: ${result.error}`);
  }
  
  return result.value;
}