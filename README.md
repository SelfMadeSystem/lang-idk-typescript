# Lang-IDK

Lang-IDK is a statically-typed, expressive programming language designed with a focus on advanced type systems. It started out as a parser library inspired by Haskell's Parsec but evolved into a powerful type system. While it is not yet a fully-fledged language, Lang-IDK's type system combines nominal and structural typing, first-class generics, and type-level computation to enable powerful abstractions and compile-time guarantees.

## Features

- **Nominal and Structural Types**: Choose between strict type identity (nominal) and flexible compatibility (structural).
- **First-Class Generics**: Generics are standalone types, enabling advanced type manipulation and reuse.
- **Type-Level Logic**: Built-in support for boolean logic and conditional types at the type level.
- **Recursive Types**: Define complex data structures like linked lists and trees.
- **Algebraic Data Types**: Expressive constructs like `Option` and `Result` for functional programming.
- **Explicit Subtyping**: Use `narrower` and `wider` to define subtype relationships.

## Example Code

```ts
type User {
  name: string;
  age: int;
};

type Admin (User & {
  role: string;
});

narrower(Admin, User);

type Some<T> T;
type None;
type Option = <T> (Some<T> | None);

wider(Option<int>, Some<int>);

type LinkedList<T> {
  value: T;
  next: (LinkedList<T> | None);
};

print(LinkedList<string>); // LinkedList{ value: string, next: (LinkedList<string> | None) }
```

## Use Cases

Lang-IDK is ideal for:

- **Advanced Type-Safe Programming**: Build systems with strict compile-time guarantees.
- **Domain-Specific Languages (DSLs)**: Create DSLs for data modeling, schema validation, and more.
- **Metaprogramming**: Generate code and ensure correctness at compile time.
- **Functional Programming**: Leverage algebraic data types and type-level computation.
- **Static Analysis and Verification**: Write programs that require formal verification or static analysis.

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/SelfMadeSystem/lang-idk-typescript.git
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Run the language runtime:

   ```bash
   bun ./runtime/run.ts
   ```

4. Explore the examples in the `runtime/test.mylang` file.

## Contributing

This is a personal project and is not currently open for contributions. However, if you have suggestions or want to discuss ideas, feel free to reach out!

## License

Lang-IDK is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

Lang-IDK: Explore the future of type systems!
