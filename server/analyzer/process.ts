import { spawn } from "node:child_process";

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    input?: string;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    captureStdout?: boolean;
  } = {}
) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: "pipe"
    });

    let stdout = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (options.captureStdout) {
        stdout += text;
      }
      options.onStdout?.(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      options.onStderr?.(text);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout });
        return;
      }

      reject(new Error(`Command failed with exit code ${code}`));
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}
