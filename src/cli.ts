function printHelp(bin = "artefact") {
  console.log(`
Usage: ${bin} <command> [args]

Commands:
  echo <message>          Print the message back to stdout
  add <a> <b>             Add two numbers
  subtract <a> <b>        Subtract b from a
`);
}

function parseNumber(value: string, name: string): number {
  const n = Number(value);
  if (Number.isNaN(n)) {
    console.error(`Error: "${name}" must be a number, got "${value}"`);
    process.exit(1);
  }
  return n;
}

export function run(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  switch (command) {
    case "echo": {
      if (args.length === 0) {
        console.error("Error: echo requires a message");
        process.exit(1);
      }
      console.log(args.join(" "));
      break;
    }

    case "add": {
      if (args.length < 2) {
        console.error("Error: add requires two numbers");
        process.exit(1);
      }
      const a = parseNumber(args[0]!, "a");
      const b = parseNumber(args[1]!, "b");
      console.log(a + b);
      break;
    }

    case "subtract": {
      if (args.length < 2) {
        console.error("Error: subtract requires two numbers");
        process.exit(1);
      }
      const a = parseNumber(args[0]!, "a");
      const b = parseNumber(args[1]!, "b");
      console.log(a - b);
      break;
    }

    default: {
      if (command) {
        console.error(`Error: unknown command "${command}"`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
    }
  }
}
