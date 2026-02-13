import {
  type Parser,
  type ParserResult,
  type InputState,
  createInputState,
  withState,
  literal,
  regex,
  skipWhitespace,
  sequence,
  map,
  choice,
  many,
  eof,
} from "./parser/parserLib";

/**
 * Example: Variable Declaration and Usage Parser
 *
 * This example demonstrates using custom state to track defined variables
 * while parsing a simple variable declaration and reference language.
 */

// Custom state type: tracks variables that have been declared
type VarState = {
  definedVars: Set<string>;
};

// Token types
type VarToken =
  | { type: "declare"; name: string }
  | { type: "reference"; name: string }
  | { type: "error"; message: string };

/**
 * Parses a variable name (identifier)
 */
const identifier: Parser<string, VarState> = (input: InputState<VarState>) => {
  const nameResult = regex(/^[a-zA-Z_][a-zA-Z0-9_]*/)(input);
  if (!nameResult.success) {
    return nameResult;
  }
  return nameResult;
};

/**
 * Parses a variable declaration: "let x" or "const y"
 * Updates the state to track the new variable
 */
const varDeclaration: Parser<VarToken, VarState> = (
  input: InputState<VarState>,
) => {
  // Try to parse "let" or "const"
  const declKeyword = choice(literal("let", true), literal("const", true));

  const declResult = declKeyword(input);
  if (!declResult.success) {
    return declResult;
  }

  // Skip whitespace after keyword
  const skipWsResult = skipWhitespace(declResult.remaining);
  if (!skipWsResult.success) {
    return skipWsResult;
  }

  // Parse the identifier
  const idResult = identifier(skipWsResult.remaining);
  if (!idResult.success) {
    return idResult;
  }

  const varName = idResult.value;
  const newState = {
    definedVars: new Set([
      ...(idResult.remaining.state?.definedVars || []),
      varName,
    ]),
  };

  return {
    success: true,
    value: { type: "declare" as const, name: varName },
    remaining: withState(idResult.remaining, newState),
  };
};

/**
 * Parses a variable reference
 * Checks if the variable is defined in the state
 */
const varReference: Parser<VarToken, VarState> = (
  input: InputState<VarState>,
) => {
  const idResult = identifier(input);
  if (!idResult.success) {
    return idResult;
  }

  const varName = idResult.value;
  const definedVars = idResult.remaining.state?.definedVars || new Set();

  if (!definedVars.has(varName)) {
    return {
      success: false,
      error: `Variable '${varName}' is not defined`,
    };
  }

  return {
    success: true,
    value: { type: "reference" as const, name: varName },
    remaining: idResult.remaining,
  };
};

/**
 * Parses a single statement (declaration or reference)
 */
const statement: Parser<VarToken, VarState> = (input: InputState<VarState>) => {
  const skipWsResult = skipWhitespace(input);
  if (!skipWsResult.success) {
    return skipWsResult;
  }

  const choiceResult = choice(
    varDeclaration,
    varReference,
  )(skipWsResult.remaining);
  if (!choiceResult.success) {
    return choiceResult;
  }

  // Skip trailing whitespace
  const trailingWsResult = skipWhitespace(choiceResult.remaining);
  if (!trailingWsResult.success) {
    return trailingWsResult;
  }

  return {
    success: true,
    value: choiceResult.value,
    remaining: trailingWsResult.remaining,
  };
};

/**
 * Parses a program: multiple statements separated by newlines
 */
const program: Parser<VarToken[], VarState> = many(statement);

// Example usage:
const input = "let x\nlet y\nx\ny\nz";
const initialState: VarState = { definedVars: new Set() };
const parseResult = program(createInputState(input, initialState));

if (parseResult.success) {
  console.log("Parsed successfully:");
  console.log(parseResult.value);
  console.log("Remaining input:", parseResult.remaining);
  console.log("Final defined vars:", parseResult.remaining.state?.definedVars);
} else {
  console.log("Parse error:", parseResult.error);
}
