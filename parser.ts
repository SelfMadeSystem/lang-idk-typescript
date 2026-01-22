/**
 * Result of a parser operation, indicating success or failure.
 *
 * If successful, contains the parsed value and remaining input.
 * If failed, contains an error message.
 */
export type ParserResult<T> =
  | { success: true; value: T; remaining: string }
  | { success: false; error: string };

/**
 * A parser function that takes an input string and returns a ParserResult.
 */
export type Parser<T> = (input: string) => ParserResult<T>;

type ErrorFn = (...input: any) => ParserResult<never>;

const er = (
  strings: TemplateStringsArray,
  ...values: any[]
): ParserResult<never> => {
  let message = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    message += values[i] + strings[i + 1]!;
  }
  return { success: false, error: message };
};

const ers = {
  EOF: () => er`Unexpected end of input.`,
} as const satisfies Record<string, ErrorFn>;

export const parsers = {
  /**
   * Parses a single character. If a character is provided, it parses that specific character.
   */
  char: (char?: string) => {
    if (char === undefined) {
      return (input: string): ParserResult<string> => {
        if (input.length === 0) {
          return ers.EOF();
        }
        return { success: true, value: input[0]!, remaining: input.slice(1) };
      };
    }
    return (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      if (char.includes(input[0]!)) {
        return { success: true, value: input[0]!, remaining: input.slice(1) };
      }
      return er`Expected a char from '${char}' but got '${input[0]!}'.`;
    };
  },
  /**
   * Parses the end of the input.
   */
  eof: (input: string): ParserResult<null> => {
    if (input.length === 0) {
      return { success: true, value: null, remaining: input };
    }
    return er`Expected end of input but got '${input}'.`;
  },
  /**
   * Parses a single whitespace character (space, tab, newline, or carriage return).
   */
  whitespace:
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const char = input[0]!;
      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        return { success: true, value: char, remaining: input.slice(1) };
      }
      return er`Expected whitespace but got '${char}'.`;
    },
  /**
   * Parses and skips over any whitespace characters.
   */
  skipWhitespace:
    (input: string): ParserResult<null> => {
      let index = 0;
      while (index < input.length) {
        const char = input[index]!;
        if (char === " " || char === "\t" || char === "\n" || char === "\r") {
          index++;
        } else {
          break;
        }
      }
      return { success: true, value: null, remaining: input.slice(index) };
    },
  /**
   * Parses a specific literal string from the input.
   */
  literal:
    <T extends string>(literal: T, caseSensitive = true) =>
    (input: string): ParserResult<T> => {
      if (input.length < literal.length) {
        return ers.EOF();
      }
      const inputSlice = input.slice(0, literal.length);
      const matches = caseSensitive
        ? inputSlice === literal
        : inputSlice.toLowerCase() === literal.toLowerCase();
      if (matches) {
        return {
          success: true,
          value: literal,
          remaining: input.slice(literal.length),
        };
      }
      return er`Expected literal '${literal}' but got '${inputSlice}'.`;
    },
  /**
   * Parses input matching a given regular expression pattern.
   */
  regex: (pattern: RegExp) => {
    if (pattern.flags.indexOf("y") === -1) {
      pattern = new RegExp(pattern.source, pattern.flags + "y");
    }
    return (input: string): ParserResult<string> => {
      pattern.lastIndex = 0;
      const match = pattern.exec(input);
      if (match && match.index === 0) {
        const matchedString = match[0]!;
        return {
          success: true,
          value: matchedString,
          remaining: input.slice(matchedString.length),
        };
      }
      return er`Input did not match the pattern ${pattern}.`;
    };
  },
  /**
   * Parses the next word (a sequence of non-whitespace characters).
   */
  nextWord:
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const match = /^[^\s]+/.exec(input);
      if (match) {
        const word = match[0]!;
        return {
          success: true,
          value: word,
          remaining: input.slice(word.length),
        };
      }
      return er`Expected a word but got '${input[0]!}'.`;
    },
  /**
   * Tries multiple parsers in sequence and returns the result of the first successful one.
   */
  choice:
    <Parsers extends Parser<any>[]>(
      ...parsers: Parsers
    ): Parser<Parsers[number] extends Parser<infer R> ? R : never> =>
    (input: string) => {
      for (const parser of parsers) {
        const result = parser(input);
        if (result.success) {
          return result;
        }
      }
      return er`No parsers matched the input.`;
    },
  /**
   * Parses a sequence of parsers in order and returns their results as an array.
   */
  sequence:
    <Parsers extends Parser<any>[]>(
      ...parsers: Parsers
    ): Parser<{
      [K in keyof Parsers]: Parsers[K] extends Parser<infer R> ? R : never;
    }> =>
    (input: string) => {
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
          [K in keyof Parsers]: Parsers[K] extends Parser<infer R> ? R : never;
        },
        remaining,
      };
    },
  /**
   * Parses zero or more occurrences of a given parser and returns an array of results.
   */
  many:
    <T>(parser: Parser<T>): Parser<T[]> =>
    (input: string): ParserResult<T[]> => {
      const values: T[] = [];
      let remaining = input;
      while (true) {
        const result = parser(remaining);
        if (!result.success) {
          break;
        }
        values.push(result.value);
        remaining = result.remaining;
      }
      return { success: true, value: values, remaining };
    },
  /**
   * Transforms the result of a parser using a mapping function.
   */
  map:
    <T, U>(parser: Parser<T>, fn: (value: T) => U): Parser<U> =>
    (input: string): ParserResult<U> => {
      const result = parser(input);
      if (!result.success) {
        return result;
      }
      return {
        success: true,
        value: fn(result.value),
        remaining: result.remaining,
      };
    },
  /**
   * Errors if the first parser succeeds; otherwise, runs the second parser.
   */
  not:
    <T, U>(parser: Parser<T>, ifNotParser: Parser<U>): Parser<U> =>
    (input: string): ParserResult<U> => {
      const result = parser(input);
      if (result.success) {
        return er`Expected parser to fail but it succeeded.`;
      }
      return ifNotParser(input);
    },
  /**
   * Parses zero or one occurrence of a given parser.
   */
  optional:
    <T>(parser: Parser<T>): Parser<T | null> =>
    (input: string): ParserResult<T | null> => {
      const result = parser(input);
      if (result.success) {
        return result;
      }
      return { success: true, value: null, remaining: input };
    },
  /**
   * Parses zero or more occurrences of a given parser, separated by another parser.
   */
  sepBy:
    <T, U>(parser: Parser<T>, separator: Parser<U>): Parser<T[]> =>
    (input: string): ParserResult<T[]> => {
      const values: T[] = [];
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
    },
  /**
   * Allows for the definition of recursive parsers.
   */
  recursive: <T>(parserThunk: (self: Parser<T>) => Parser<T>): Parser<T> => {
    let parser: Parser<T> | null = null;
    const recursiveParser: Parser<T> = (input: string): ParserResult<T> => {
      if (parser === null) {
        parser = parserThunk(recursiveParser);
      }
      return parser(input);
    };
    return recursiveParser;
  },
  /**
   * Checks if the input matches the given parser without consuming any input.
   */
  lookahead:
    <T>(parser: Parser<T>): Parser<T> =>
    (input: string): ParserResult<T> => {
      const result = parser(input);
      if (!result.success) {
        return result;
      }
      return {
        success: true,
        value: result.value,
        remaining: input,
      };
    },

  ///////////////////////////////////
  // Extra parsers for convenience //
  ///////////////////////////////////

  /**
   * Parses a single alphabetic character (a-z, A-Z).
   */
  alpha:
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const char = input[0]!;
      if ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z")) {
        return { success: true, value: char, remaining: input.slice(1) };
      }
      return er`Expected alphabetic character but got '${char}'.`;
    },

  /**
   * Parses a single alphanumeric character (a-z, A-Z, 0-9).
   */
  alphanumeric:
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const char = input[0]!;
      if (
        (char >= "a" && char <= "z") ||
        (char >= "A" && char <= "Z") ||
        (char >= "0" && char <= "9")
      ) {
        return { success: true, value: char, remaining: input.slice(1) };
      }
      return er`Expected alphanumeric character but got '${char}'.`;
    },

  /**
   * Parses a single digit character (0-9).
   */
  digit:
    (radix = 10) =>
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const char = input[0]!;
      const digit = parseInt(char, radix);
      if (!isNaN(digit) && digit.toString(radix) === char.toLowerCase()) {
        return { success: true, value: char, remaining: input.slice(1) };
      }
      return er`Expected digit but got '${char}'.`;
    },
  
  /**
   * Parses a number (integer or floating-point) with signs. Not including
   * exponent notation or bases.
   */
  number:
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const match = /^[+-]?(\d+(\.\d*)?|\.\d+)/.exec(input);
      if (match) {
        const numStr = match[0]!;
        return {
          success: true,
          value: numStr,
          remaining: input.slice(numStr.length),
        };
      }
      return er`Expected number but got '${input[0]!}'.`;
    },
  /**
   * Parses a number in exponent notation (e.g., 1.23e+10).
   */
  exponentNumber:
    (input: string): ParserResult<string> => {
      if (input.length === 0) {
        return ers.EOF();
      }
      const match = /^[+-]?(\d+(\.\d*)?|\.\d+)[eE][+-]?\d+/.exec(input);
      if (match) {
        const numStr = match[0]!;
        return {
          success: true,
          value: numStr,
          remaining: input.slice(numStr.length),
        };
      }
      return er`Expected exponent number but got '${input[0]!}'.`;
    },
  /**
   * Parses a number, either in standard or exponent notation.
   */
  anyNumber:
    (input: string): ParserResult<string> => {
      const exponentResult = parsers.exponentNumber(input);
      if (exponentResult.success) {
        return exponentResult;
      }
      return parsers.number(input);
    },
} as const satisfies Record<
  string,
  ((...input: any) => Parser<unknown>) | Parser<unknown>
>;

export default parsers;
