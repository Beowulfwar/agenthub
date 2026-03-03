declare module 'inquirer' {
  interface Question {
    type?: string;
    name?: string;
    message?: string | (() => string);
    default?: unknown;
    choices?: unknown[];
    validate?: (input: any) => boolean | string | Promise<boolean | string>;
    filter?: (input: unknown) => unknown;
    when?: boolean | ((answers: Record<string, unknown>) => boolean);
  }

  interface Inquirer {
    prompt<T = Record<string, unknown>>(
      questions: Question | Question[],
    ): Promise<T>;
  }

  const inquirer: Inquirer;
  export default inquirer;
}
