export type ErrorResult = { success: false; error: string };
export type SuccessResult<T, S> = {
  success: true;
  value: T;
  remaining: InputState<S>;
};

/**
 * Result of a parser operation, indicating success or failure.
 *
 * If successful, contains the parsed value and remaining input.
 * If failed, contains an error message.
 */
export type ParserResult<T, S> = SuccessResult<T, S> | ErrorResult;

/**
 * Input to a parser function.
 */
export type InputState<UserState = unknown> = {
  src: string;
  index: number;
  line: number;
  column: number;
  state?: UserState;
};

/**
 * Creates an InputState from a string.
 */
export const createInputState = <UserState = unknown>(
  src: string,
  state?: UserState,
): InputState<UserState> => ({
  src,
  index: 0,
  line: 1,
  column: 1,
  state,
});

const noNewState = Symbol("noNewState");

/**
 * Produces a new InputState by advancing the current state by a given number of characters.
 */
export const advanceBy = <S = unknown>(
  input: InputState<S>,
  count: number,
  newState: S | typeof noNewState = noNewState,
): InputState<S> => {
  let { index, line, column, src, state } = input;
  for (let i = 0; i < count; i++) {
    if (index >= src.length) {
      break;
    }
    const char = src[index]!;
    index++;
    if (char === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return {
    src,
    index,
    line,
    column,
    state: newState === noNewState ? state : newState,
  };
};

/**
 * Produces a new InputState by replacing the current state with a new state.
 */
export const withState = <S = unknown>(
  input: InputState,
  newState: S,
): InputState<S> => {
  return {
    src: input.src,
    index: input.index,
    line: input.line,
    column: input.column,
    state: newState,
  };
};

/**
 * Gets the remaining unparsed input as a string.
 */
export const remStr = <S = unknown>(input: InputState<S>): string => {
  return input.src.slice(input.index);
};

/**
 * A parser function that takes an input string and returns a ParserResult.
 */
export type Parser<T, S = unknown> = (
  input: InputState<S>,
) => ParserResult<T, S>;

type GParser = Parser<any, any>;

const er = <S>(
  strings: TemplateStringsArray,
  ...values: any[]
): ParserResult<never, S> => {
  let message = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    message += values[i] + strings[i + 1]!;
  }
  return { success: false, error: message };
};

const EOF: ErrorResult = { success: false, error: "Unexpected end of input." };

type GetT<P extends GParser> = P extends Parser<infer R, any> ? R : never;
type GetS<P extends GParser> = P extends Parser<any, infer U> ? U : never;

/**
 * Parses a single character. If a character is provided, it parses that specific character.
 */
export const char = (char?: string): Parser<string> => {
  if (char === undefined) {
    return <S>(input: InputState<S>): ParserResult<string, S> => {
      const rem = remStr(input);
      if (rem.length === 0) {
        return EOF;
      }
      return {
        success: true,
        value: rem[0]!,
        remaining: advanceBy(input, 1),
      };
    };
  }
  return <S>(input: InputState<S>): ParserResult<string, S> => {
    const rem = remStr(input);
    if (rem.length === 0) {
      return EOF;
    }
    if (char.includes(rem[0]!)) {
      return {
        success: true,
        value: rem[0]!,
        remaining: advanceBy(input, 1),
      };
    }
    return er`Expected a char from '${char}' but got '${rem[0]!}'.`;
  };
};
/**
 * Parses the end of the input.
 */
export const eof = <S>(input: InputState<S>): ParserResult<null, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return { success: true, value: null, remaining: input };
  }
  return er`Expected end of input but got '${rem}'.`;
};
/**
 * Parses a single whitespace character (space, tab, newline, or carriage return).
 */
export const whitespace = <S>(
  input: InputState<S>,
): ParserResult<string, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return EOF;
  }
  const char = rem[0]!;
  if (char === " " || char === "\t" || char === "\n" || char === "\r") {
    return { success: true, value: char, remaining: advanceBy(input, 1) };
  }
  return er`Expected whitespace but got '${char}'.`;
};
/**
 * Parses and skips over any whitespace characters.
 */
export const skipWhitespace = <S>(
  input: InputState<S>,
): ParserResult<null, S> => {
  const rem = remStr(input);
  let index = 0;
  while (index < rem.length) {
    const char = rem[index]!;
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index++;
    } else {
      break;
    }
  }
  return { success: true, value: null, remaining: advanceBy(input, index) };
};
/**
 * Parses a specific literal string from the input.
 */
export const literal =
  <T extends string>(literal: T, caseSensitive = true) =>
  <S>(input: InputState<S>): ParserResult<T, S> => {
    const rem = remStr(input);
    if (rem.length < literal.length) {
      return EOF;
    }
    const inputSlice = rem.slice(0, literal.length);
    const matches = caseSensitive
      ? inputSlice === literal
      : inputSlice.toLowerCase() === literal.toLowerCase();
    if (matches) {
      return {
        success: true,
        value: literal,
        remaining: advanceBy(input, literal.length),
      };
    }
    return er`Expected literal '${literal}' but got '${inputSlice}'.`;
  };
/**
 * Parses input matching a given regular expression pattern.
 */
export const regex = (pattern: RegExp) => {
  if (pattern.flags.indexOf("y") === -1) {
    pattern = new RegExp(pattern.source, pattern.flags + "y");
  }
  return <S>(input: InputState<S>): ParserResult<string, S> => {
    pattern.lastIndex = 0;
    const rem = remStr(input);
    const match = pattern.exec(rem);
    if (match && match.index === 0) {
      const matchedString = match[0]!;
      return {
        success: true,
        value: matchedString,
        remaining: advanceBy(input, matchedString.length),
      };
    }
    return er`Input did not match the pattern ${pattern}.`;
  };
};
/**
 * Parses the next word (a sequence of non-whitespace characters).
 */
export const nextWord = <S>(input: InputState<S>): ParserResult<string, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return EOF;
  }
  const match = /^[^\s]+/.exec(rem);
  if (match) {
    const word = match[0]!;
    return {
      success: true,
      value: word,
      remaining: advanceBy(input, word.length),
    };
  }
  return er`Expected a word but got '${rem[0]!}'.`;
};
/**
 * Tries multiple parsers in sequence and returns the result of the first successful one.
 */
export const choice =
  <Parsers extends GParser[]>(
    ...parsers: Parsers
  ): Parser<GetT<Parsers[number]>, GetS<Parsers[number]>> =>
  <S>(input: InputState<S>): ParserResult<GetT<Parsers[number]>, S> => {
    for (const parser of parsers) {
      const result = parser(input);
      if (result.success) {
        return result;
      }
    }
    return er`No parsers matched the input.`;
  };
/**
 * Parses a sequence of parsers in order and returns their results as an array.
 */
export const sequence =
  <Parsers extends GParser[]>(
    ...parsers: Parsers
  ): Parser<
    {
      [K in keyof Parsers]: GetT<Parsers[K]>;
    },
    GetS<Parsers[number]>
  > =>
  <S>(
    input: InputState<S>,
  ): ParserResult<
    {
      [K in keyof Parsers]: GetT<Parsers[K]>;
    },
    S
  > => {
    const values: any[] = [];
    let remaining = input;

    for (const parser of parsers) {
      const result = parser(remaining);
      if (!result.success) {
        return result;
      }
      values.push(result.value);
      remaining = result.remaining;
    }

    return {
      success: true,
      value: values as {
        [K in keyof Parsers]: Parsers[K] extends Parser<infer R, any>
          ? R
          : never;
      },
      remaining,
    };
  };
/**
 * Parses zero or more occurrences of a given parser and returns an array of results.
 */
export const many =
  <P extends GParser>(parser: P): Parser<GetT<P>[], GetS<P>> =>
  <S>(input: InputState<S>): ParserResult<GetT<P>[], S> => {
    const values: unknown[] = [];
    let remaining = input;
    while (true) {
      const result = parser(remaining);
      if (!result.success) {
        break;
      }
      values.push(result.value);
      remaining = result.remaining;
    }
    return {
      success: true,
      value: values as P extends Parser<infer T, unknown> ? T[] : never,
      remaining,
    };
  };
/**
 * Transforms the result of a parser using a mapping function.
 */
export const map =
  <U, P extends GParser, S>(
    parser: P,
    fn: (value: GetT<P>, start: InputState<S>, end: InputState<S>) => U,
  ): Parser<U, GetS<P>> =>
  (input: InputState<S>): ParserResult<U, GetS<P>> => {
    const result = parser(input);
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      value: fn(result.value, input, result.remaining),
      remaining: result.remaining,
    };
  };
/**
 * Ensures the first parser succeeds and then verifies it satisfies a condition.
 */
export const and =
  <P extends GParser, S>(
    parser: P,
    condition: (
      value: GetT<P>,
      start: InputState<S>,
      end: InputState<S>,
    ) => boolean,
  ): Parser<GetT<P>, GetS<P>> =>
  (input: InputState<S>): ParserResult<GetT<P>, GetS<P>> => {
    const result = parser(input);
    if (!result.success) {
      return result;
    }
    if (!condition(result.value, input, result.remaining)) {
      return er`Parsed value did not satisfy the condition.`;
    }
    return result;
  };
/**
 * Errors if the first parser succeeds; otherwise, runs the second parser.
 */
export const not =
  <P extends GParser, R extends GParser>(
    parser: P,
    ifNotParser: R,
  ): Parser<GetT<R>, GetS<P> & GetS<R>> =>
  <S>(input: InputState<S>): ParserResult<GetT<R>, S> => {
    const result = parser(input);
    if (result.success) {
      return er`Expected parser to fail but it succeeded.`;
    }
    return ifNotParser(input);
  };
/**
 * Parses zero or one occurrence of a given parser.
 */
export const optional =
  <P extends GParser>(parser: P): Parser<GetT<P> | null, GetS<P>> =>
  <S>(input: InputState<S>): ParserResult<GetT<P> | null, S> => {
    const result = parser(input);
    if (result.success) {
      return result;
    }
    return { success: true, value: null, remaining: input };
  };
/**
 * Parses zero or more occurrences of a given parser, separated by another parser.
 */
export const sepBy =
  <P extends GParser, SParser extends GParser>(
    parser: P,
    separator: SParser,
  ): Parser<GetT<P>[], GetS<P> & GetS<SParser>> =>
  <S>(input: InputState<S>): ParserResult<GetT<P>[], S> => {
    const values: GetT<P>[] = [];
    let remaining = input;

    const firstResult = parser(remaining);
    if (!firstResult.success) {
      return { success: true, value: values, remaining };
    }

    values.push(firstResult.value);
    remaining = firstResult.remaining;

    while (true) {
      const sepResult = separator(remaining);
      if (!sepResult.success) {
        break;
      }
      remaining = sepResult.remaining;

      const itemResult = parser(remaining);
      if (!itemResult.success) {
        break;
      }
      values.push(itemResult.value);
      remaining = itemResult.remaining;
    }

    return { success: true, value: values, remaining };
  };
/**
 * Allows for the definition of recursive parsers.
 */
export function recursive<T, S = unknown>(
  parserThunk: (self: Parser<T, S>) => Parser<T, S>,
): Parser<T, S> {
  let parser: Parser<T, S> | null = null;
  return (input: InputState<S>): ParserResult<T, S> => {
    if (parser === null) {
      parser = parserThunk(recursive(parserThunk));
    }
    return parser(input);
  };
}
/**
 * Checks if the input matches the given parser without consuming any input.
 */
export const lookahead =
  <P extends GParser>(parser: P): Parser<GetT<P>, GetS<P>> =>
  <S>(input: InputState<S>): ParserResult<GetT<P>, S> => {
    const result = parser(input);
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      value: result.value,
      remaining: input,
    };
  };

///////////////////////////////////
// Extra parsers for convenience //
///////////////////////////////////

/**
 * Parses a single alphabetic character (a-z, A-Z).
 */
export const alpha = <S>(input: InputState<S>): ParserResult<string, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return EOF;
  }
  const char = rem[0]!;
  if ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z")) {
    return { success: true, value: char, remaining: advanceBy(input, 1) };
  }
  return er`Expected alphabetic character but got '${char}'.`;
};

/**
 * Parses a single alphanumeric character (a-z, A-Z, 0-9).
 */
export const alphanumeric = <S>(
  input: InputState<S>,
): ParserResult<string, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return EOF;
  }
  const char = rem[0]!;
  if (
    (char >= "a" && char <= "z") ||
    (char >= "A" && char <= "Z") ||
    (char >= "0" && char <= "9")
  ) {
    return { success: true, value: char, remaining: advanceBy(input, 1) };
  }
  return er`Expected alphanumeric character but got '${char}'.`;
};

/**
 * Parses a single digit character (0-9).
 */
export const digit =
  <S>(radix = 10) =>
  (input: InputState<S>): ParserResult<string, S> => {
    const rem = remStr(input);
    if (rem.length === 0) {
      return EOF;
    }
    const char = rem[0]!;
    const digit = parseInt(char, radix);
    if (!isNaN(digit) && digit.toString(radix) === char.toLowerCase()) {
      return { success: true, value: char, remaining: advanceBy(input, 1) };
    }
    return er`Expected digit but got '${char}'.`;
  };

/**
 * Parses a number (integer or floating-point) with signs. Not including
 * exponent notation or bases.
 */
export const number = <S>(input: InputState<S>): ParserResult<string, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return EOF;
  }
  const match = /^[+-]?(\d+(\.\d*)?|\.\d+)/.exec(rem);
  if (match) {
    const numStr = match[0]!;
    return {
      success: true,
      value: numStr,
      remaining: advanceBy(input, numStr.length),
    };
  }
  return er`Expected number but got '${rem[0]!}'.`;
};
/**
 * Parses a number in exponent notation (e.g., 1.23e+10).
 */
export const exponentNumber = <S>(
  input: InputState<S>,
): ParserResult<string, S> => {
  const rem = remStr(input);
  if (rem.length === 0) {
    return EOF;
  }
  const match = /^[+-]?(\d+(\.\d*)?|\.\d+)[eE][+-]?\d+/.exec(rem);
  if (match) {
    const numStr = match[0]!;
    return {
      success: true,
      value: numStr,
      remaining: advanceBy(input, numStr.length),
    };
  }
  return er`Expected exponent number but got '${rem[0]!}'.`;
};
/**
 * Parses a number, either in standard or exponent notation.
 */
export const anyNumber = <S>(input: InputState<S>): ParserResult<string, S> => {
  const exponentResult = exponentNumber(input);
  if (exponentResult.success) {
    return exponentResult;
  }
  return number(input);
};
