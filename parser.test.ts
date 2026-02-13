import { expect, test } from "bun:test";
import {
  createInputState,
  advanceBy,
  withState,
  remStr,
  char,
  eof,
  whitespace,
  skipWhitespace,
  literal,
  regex,
  nextWord,
  choice,
  sequence,
  many,
  map,
  not,
  optional,
  sepBy,
  recursive,
  lookahead,
  alpha,
  alphanumeric,
  digit,
  number,
  exponentNumber,
  anyNumber,
} from "./parser/parserLib";

test("createInputState creates initial state correctly", () => {
  const state = createInputState("hello");
  expect(state.src).toBe("hello");
  expect(state.index).toBe(0);
  expect(state.line).toBe(1);
  expect(state.column).toBe(1);
  expect(state.state).toBeUndefined();
});

test("createInputState with custom state", () => {
  const customState = { mode: "test" };
  const state = createInputState("hello", customState);
  expect(state.state).toBe(customState);
});

test("advanceBy advances index and updates line/column", () => {
  const state = createInputState("hello\nworld");
  const advanced = advanceBy(state, 6);
  expect(advanced.index).toBe(6);
  expect(advanced.line).toBe(2);
  expect(advanced.column).toBe(1);
});

test("advanceBy handles multiple newlines", () => {
  const state = createInputState("line1\nline2\nline3");
  const advanced = advanceBy(state, 12);
  expect(advanced.line).toBe(3);
  expect(advanced.column).toBe(1);
});

test("withState replaces state while keeping position", () => {
  const state = createInputState("test", { original: true });
  const newState = withState(state, { original: false });
  expect(newState.index).toBe(0);
  expect(newState.state).toEqual({ original: false });
});

test("remStr returns remaining unparsed input", () => {
  const state = createInputState("hello world");
  expect(remStr(state)).toBe("hello world");
  const advanced = advanceBy(state, 6);
  expect(remStr(advanced)).toBe("world");
});

test("char parses any single character", () => {
  const parser = char();
  const state = createInputState("hello");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("h");
    expect(result.remaining.index).toBe(1);
  }
});

test("char with specific character matches", () => {
  const parser = char("aeiou");
  const state = createInputState("apple");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("a");
  }
});

test("char with specific character fails on non-match", () => {
  const parser = char("aeiou");
  const state = createInputState("hello");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("char returns EOF error on empty input", () => {
  const parser = char();
  const state = createInputState("");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("eof succeeds at end of input", () => {
  const state = createInputState("test");
  const advanced = advanceBy(state, 4);
  const result = eof(advanced);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBeNull();
  }
});

test("eof fails when input remains", () => {
  const state = createInputState("test");
  const result = eof(state);
  expect(result.success).toBe(false);
});

test("whitespace parses single whitespace character", () => {
  const state = createInputState(" hello");
  const result = whitespace(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe(" ");
  }
});

test("whitespace parses tab", () => {
  const state = createInputState("\thello");
  const result = whitespace(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("\t");
  }
});

test("whitespace fails on non-whitespace", () => {
  const state = createInputState("hello");
  const result = whitespace(state);
  expect(result.success).toBe(false);
});

test("skipWhitespace skips multiple whitespace characters", () => {
  const state = createInputState("  \t\nhello");
  const result = skipWhitespace(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.index).toBe(4);
  }
});

test("skipWhitespace handles no whitespace", () => {
  const state = createInputState("hello");
  const result = skipWhitespace(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.index).toBe(0);
  }
});

test("literal parses exact string", () => {
  const parser = literal("hello");
  const state = createInputState("hello world");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("hello");
    expect(result.remaining.index).toBe(5);
  }
});

test("literal case-insensitive mode", () => {
  const parser = literal("HELLO", false);
  const state = createInputState("hello world");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("HELLO");
  }
});

test("literal fails on mismatch", () => {
  const parser = literal("hello");
  const state = createInputState("world");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("regex matches pattern at start", () => {
  const parser = regex(/\d+/);
  const state = createInputState("123abc");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("123");
  }
});

test("regex fails on non-match", () => {
  const parser = regex(/\d+/);
  const state = createInputState("abc123");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("nextWord parses non-whitespace sequence", () => {
  const state = createInputState("hello world");
  const result = nextWord(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("hello");
  }
});

test("nextWord fails on empty input", () => {
  const state = createInputState("");
  const result = nextWord(state);
  expect(result.success).toBe(false);
});

test("choice returns first successful parser", () => {
  const parser1 = literal("hello");
  const parser2 = literal("world");
  const state = createInputState("hello");
  const result = choice(parser1, parser2)(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("hello");
  }
});

test("choice tries next parser if first fails", () => {
  const parser1 = literal("hello");
  const parser2 = literal("world");
  const state = createInputState("world");
  const result = choice(parser1, parser2)(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("world");
  }
});

test("choice fails if all parsers fail", () => {
  const parser1 = literal("hello");
  const parser2 = literal("world");
  const state = createInputState("test");
  const result = choice(parser1, parser2)(state);
  expect(result.success).toBe(false);
});

test("sequence parses multiple parsers in order", () => {
  const parser = sequence(literal("a"), literal("b"), literal("c"));
  const state = createInputState("abc");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toEqual(["a", "b", "c"]);
  }
});

test("sequence fails if any parser fails", () => {
  const parser = sequence(literal("a"), literal("b"), literal("c"));
  const state = createInputState("abd");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("many parses zero or more occurrences", () => {
  const parser = many(char("a"));
  const state = createInputState("aaab");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toEqual(["a", "a", "a"]);
  }
});

test("many returns empty array when parser fails immediately", () => {
  const parser = many(char("a"));
  const state = createInputState("bbb");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toEqual([]);
  }
});

test("map transforms parser result", () => {
  const parser = map(digit(), (d) => parseInt(d));
  const state = createInputState("5");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe(5);
  }
});

test("map propagates parser failure", () => {
  const parser = map(digit(), (d) => parseInt(d));
  const state = createInputState("a");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("optional succeeds and returns value on match", () => {
  const parser = optional(literal("hello"));
  const state = createInputState("hello world");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("hello");
  }
});

test("optional returns null on no match", () => {
  const parser = optional(literal("hello"));
  const state = createInputState("world");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBeNull();
  }
});

test("not fails if parser succeeds", () => {
  const notParser = not(literal("a"), literal("b"));
  const state = createInputState("a");
  const result = notParser(state);
  expect(result.success).toBe(false);
});

test("not succeeds and runs second parser if first fails", () => {
  const notParser = not(literal("a"), literal("b"));
  const state = createInputState("b");
  const result = notParser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("b");
  }
});

test("sepBy parses items separated by delimiter", () => {
  const parser = sepBy(digit(), literal(","));
  const state = createInputState("1,2,3");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toEqual(["1", "2", "3"]);
  }
});

test("sepBy returns single item without separator", () => {
  const parser = sepBy(digit(), literal(","));
  const state = createInputState("5");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toEqual(["5"]);
  }
});

test("sepBy returns empty array if first item fails", () => {
  const parser = sepBy(digit(), literal(","));
  const state = createInputState("a");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toEqual([]);
  }
});

test("lookahead checks pattern without consuming input", () => {
  const parser = lookahead(literal("hello"));
  const state = createInputState("hello world");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("hello");
    expect(result.remaining.index).toBe(0);
  }
});

test("lookahead fails if pattern doesn't match", () => {
  const parser = lookahead(literal("goodbye"));
  const state = createInputState("hello world");
  const result = parser(state);
  expect(result.success).toBe(false);
});

test("recursive allows recursive parser definition", () => {
  const parser = recursive<string>(
    (self) =>
      choice(literal("a"), sequence(literal("("), self, literal(")"))) as any,
  );
  const state = createInputState("((a))");
  const result = sequence(parser, eof)(state);
  expect(result.success).toBe(true);
});

test("alpha parses alphabetic character", () => {
  const state = createInputState("abc123");
  const result = alpha(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("a");
  }
});

test("alpha fails on digit", () => {
  const state = createInputState("123abc");
  const result = alpha(state);
  expect(result.success).toBe(false);
});

test("alphanumeric parses letter or digit", () => {
  const state1 = createInputState("a123");
  const result1 = alphanumeric(state1);
  expect(result1.success).toBe(true);

  const state2 = createInputState("9abc");
  const result2 = alphanumeric(state2);
  expect(result2.success).toBe(true);
  if (result2.success) {
    expect(result2.value).toBe("9");
  }
});

test("digit parses decimal digit", () => {
  const parser = digit();
  const state = createInputState("5abc");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("5");
  }
});

test("digit parses hex digit with radix", () => {
  const parser = digit(16);
  const state = createInputState("F0");
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("F");
  }
});

test("number parses integer", () => {
  const state = createInputState("123abc");
  const result = number(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("123");
  }
});

test("number parses floating-point", () => {
  const state = createInputState("123.456abc");
  const result = number(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("123.456");
  }
});

test("number parses signed number", () => {
  const state = createInputState("-42.5");
  const result = number(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("-42.5");
  }
});

test("exponentNumber parses scientific notation", () => {
  const state = createInputState("1.23e+10");
  const result = exponentNumber(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("1.23e+10");
  }
});

test("exponentNumber parses lowercase e", () => {
  const state = createInputState("5e-3");
  const result = exponentNumber(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("5e-3");
  }
});

test("anyNumber parses exponent notation", () => {
  const state = createInputState("1.5e10");
  const result = anyNumber(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("1.5e10");
  }
});

test("anyNumber falls back to standard number", () => {
  const state = createInputState("42.5");
  const result = anyNumber(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.value).toBe("42.5");
  }
});

test("char preserves custom state", () => {
  const customState = { counter: 0, mode: "test" };
  const state = createInputState("hello", customState);
  const parser = char();
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("advanceBy preserves state by default", () => {
  const customState = { counter: 5 };
  const state = createInputState("hello", customState);
  const advanced = advanceBy(state, 2);
  expect(advanced.state).toEqual(customState);
});

test("advanceBy replaces state when provided", () => {
  const oldState = { counter: 5 };
  const newState = { counter: 10 };
  const input = createInputState("hello", oldState);
  const advanced = advanceBy(input, 2, newState);
  expect(advanced.state).toEqual(newState);
});

test("sequence preserves custom state through all parsers", () => {
  const customState = { items: ["a", "b"] };
  const state = createInputState("abc", customState);
  const parser = sequence(char(), char(), char());
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("many preserves custom state", () => {
  const customState = { level: 1 };
  const state = createInputState("aaab", customState);
  const parser = many(char("a"));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("map preserves custom state", () => {
  const customState = { parsed: true };
  const state = createInputState("5", customState);
  const parser = map(digit(), (d) => parseInt(d));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("optional preserves custom state on match", () => {
  const customState = { optional: true };
  const state = createInputState("hello", customState);
  const parser = optional(literal("hello"));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("optional preserves custom state on no match", () => {
  const customState = { optional: false };
  const state = createInputState("world", customState);
  const parser = optional(literal("hello"));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
    expect(result.value).toBeNull();
  }
});

test("choice preserves custom state from successful parser", () => {
  const customState = { choice: 1 };
  const state = createInputState("hello", customState);
  const parser = choice(literal("hello"), literal("world"));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("sepBy preserves custom state", () => {
  const customState = { sep: "comma" };
  const state = createInputState("1,2,3", customState);
  const parser = sepBy(digit(), literal(","));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});

test("lookahead preserves state without advancing", () => {
  const customState = { lookahead: true };
  const state = createInputState("hello world", customState);
  const parser = lookahead(literal("hello"));
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.index).toBe(0);
    expect(result.remaining.state).toEqual(customState);
  }
});

test("withState changes state explicitly", () => {
  const oldState = { version: 1 };
  const newState = { version: 2, updated: true };
  const input = createInputState("test", oldState);
  const result = withState(input, newState);
  expect(result.state).toEqual(newState);
  expect(result.index).toBe(0);
});

test("recursive parser preserves custom state", () => {
  const customState = { depth: 0 };
  const state = createInputState("a", customState);
  const parser = recursive<string>((self) => char());
  const result = parser(state);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.remaining.state).toEqual(customState);
  }
});
