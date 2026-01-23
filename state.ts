import {
  createInputState,
  withState,
  remStr,
  type InputState,
  type ParserResult,
  type Parser,
  literal,
  nextWord,
  skipWhitespace,
  choice,
  many,
} from "./parser";

type MyState = { stack: string[] };
type MyInput = InputState<MyState>;

type Item =
  | { type: "push"; name: string }
  | { type: "pop"; name: string | null }
  | { type: "word"; text: string };

/**
 * Parses a "@push NAME" directive and updates the user state by pushing NAME.
 */
const pushCmd: Parser<Item, MyState> = (input: MyInput) => {
  // sequence(literal("@push"), skipWhitespace, nextWord)
  const seq = (input0: MyInput) => {
    const a = literal("@push")(input0);
    if (!a.success) return a;
    const b = skipWhitespace(a.remaining);
    if (!b.success) return b;
    const c = nextWord(b.remaining);
    if (!c.success) return c;
    return {
      success: true,
      value: [a.value, null, c.value],
      remaining: c.remaining,
    } as const;
  };

  const result = seq(input);
  if (!result.success) return result;
  const name = result.value[2]!;
  const prior = (input.state as MyState | undefined) ?? { stack: [] };
  const newState: MyState = { stack: [...prior.stack, name] };
  return {
    success: true,
    value: { type: "push", name },
    remaining: withState<MyState>(result.remaining, newState),
  } as const;
};

/**
 * Parses a "@pop" directive and updates the user state by popping.
 */
const popCmd: Parser<Item, MyState> = (input: MyInput) => {
  const res = literal("@pop")(input);
  if (!res.success) return res;
  const prior = (input.state as MyState | undefined) ?? { stack: [] };
  const popped = prior.stack.length
    ? prior.stack[prior.stack.length - 1]!
    : null;
  const newState: MyState = {
    stack: prior.stack.slice(0, Math.max(0, prior.stack.length - 1)),
  };
  return {
    success: true,
    value: { type: "pop", name: popped },
    remaining: withState<MyState>(res.remaining, newState),
  } as const;
};

/**
 * Parses a plain word token (does not change state).
 */
const wordCmd: Parser<Item, MyState> = (input: MyInput) => {
  const res = nextWord(input);
  if (!res.success) return res;
  return {
    success: true,
    value: { type: "word", text: res.value },
    remaining: res.remaining,
  } as const;
};

/**
 * Combine: skip leading whitespace, then try push/pop/word.
 */
const itemParser = (input: MyInput): ParserResult<Item, MyState> => {
  const skipped = skipWhitespace(input);
  if (!skipped.success) return skipped;
  return choice(pushCmd, popCmd, wordCmd)(skipped.remaining);
};

/**
 * Parse many items until EOF or no more tokens.
 */
const parser = many(itemParser);

const sample = "@push A\nhello world\n@push B\nfoo @pop bar\n";
const initial = createInputState<MyState>(sample, { stack: [] });

const result = parser(initial);

if (result.success) {
  console.log("Parsed items:", JSON.stringify(result.value, null, 2));
  console.log(
    "Final user state:",
    JSON.stringify(result.remaining.state, null, 2),
  );
  console.log("Remaining text:", JSON.stringify(remStr(result.remaining)));
} else {
  console.error("Parse error:", result.error);
}
