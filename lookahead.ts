import {
  createInputState,
  remStr,
  char,
  lookahead,
  sequence,
  nextWord,
  map,
} from "./parser/parserLib";

// Define a parser that ensures the next word starts with "a"
const startsWithA = lookahead(char("a"));

// Define a parser for a word that starts with "a"
const wordStartingWithA = map(
  sequence(startsWithA, nextWord),
  ([, word]) => word,
);

// Test inputs
const inputs = ["apple pie", "banana split", "avocado toast"];

inputs.forEach((input) => {
  const result = wordStartingWithA(createInputState(input));
  if (result.success) {
    console.log(`Parsed word: ${result.value}`);
    console.log(`Remaining input: "${remStr(result.remaining)}"`);
  } else {
    console.error(`Failed to parse: ${result.error}`);
  }
});
