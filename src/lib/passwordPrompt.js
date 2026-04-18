import readline from 'node:readline';

export function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.history = rl.history.slice(1);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });

    rl._writeToOutput = function writeToOutput(text) {
      if (!rl.stdoutMuted) {
        rl.output.write(text);
        return;
      }
      if (text.includes(question)) {
        rl.output.write(text);
        return;
      }
      rl.output.write('*');
    };
  });
}
