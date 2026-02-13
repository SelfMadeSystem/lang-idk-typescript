import {
  createInputState,
  char,
  literal,
  sequence,
  choice,
  map,
  recursive,
  many,
  skipWhitespace,
  anyNumber,
} from "./parser/parserLib";

type Expression =
  | { type: "Number"; value: number }
  | {
      type: "BinaryExpression";
      operator: string;
      left: Expression;
      right: Expression;
    };

// Define a parser for arithmetic expressions with precedence
const expressionParser = recursive<Expression>((expr) => {
  // Parse a number
  const number = map(anyNumber, (value) => ({
    type: "Number" as const,
    value: parseFloat(value),
  }));

  // Parse a parenthesized expression
  const parenthesized = map(
    sequence(literal("("), skipWhitespace, expr, skipWhitespace, literal(")")),
    ([, , innerExpr]) => innerExpr,
  );

  // Parse a term (either a number or a parenthesized expression)
  const term = choice(parenthesized, number);

  // Parse multiplication and division (higher precedence)
  const factor = map(
    sequence(
      skipWhitespace,
      term,
      skipWhitespace,
      many(
        map(
          sequence(char("*/"), skipWhitespace, term),
          ([operator, , right]) => ({ operator, right }),
        ),
      ),
    ),
    ([, first, , rest]) => {
      return rest.reduce(
        (acc, { operator, right }) => ({
          type: "BinaryExpression" as const,
          operator,
          left: acc,
          right,
        }),
        first,
      );
    },
  );

  // Parse addition and subtraction (lower precedence)
  const expression = map(
    sequence(
      skipWhitespace,
      factor,
      skipWhitespace,
      many(
        map(
          sequence(char("+-"), skipWhitespace, factor),
          ([operator, , right]) => ({ operator, right }),
        ),
      ),
    ),
    ([, first, , rest]) => {
      return rest.reduce(
        (acc, { operator, right }) => ({
          type: "BinaryExpression" as const,
          operator,
          left: acc,
          right,
        }),
        first,
      );
    },
  );

  return expression;
});

// Example input
const input = "3+ -5.5*(2--8)";

// Parse the input
const result = expressionParser(createInputState(input));

const interpret = (expr: Expression): number => {
  switch (expr.type) {
    case "Number":
      return expr.value;
    case "BinaryExpression":
      const left = interpret(expr.left);
      const right = interpret(expr.right);
      switch (expr.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        default:
          throw new Error(`Unknown operator: ${expr.operator}`);
      }
  }
};

if (result.success) {
  const ast = result.value;
  console.log("Parsed AST:", JSON.stringify(ast, null, 2));
  const evaluated = interpret(ast);
  console.log("Evaluated Result:", evaluated);
} else {
  console.error("Parsing failed:", result.error);
}
