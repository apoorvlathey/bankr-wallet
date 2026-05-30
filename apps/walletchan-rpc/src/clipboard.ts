import { spawn } from "node:child_process";

interface ClipboardCommand {
  command: string;
  args: string[];
}

export interface ClipboardResult {
  success: boolean;
  command?: string;
  error?: string;
}

export async function copyToClipboard(value: string): Promise<ClipboardResult> {
  const commands = getClipboardCommands();
  let lastError = "No clipboard command configured for this platform";

  for (const command of commands) {
    const result = await tryClipboardCommand(command, value);
    if (result.success) return result;
    lastError = result.error || lastError;
  }

  return { success: false, error: lastError };
}

function getClipboardCommands(): ClipboardCommand[] {
  if (process.platform === "darwin") {
    return [{ command: "pbcopy", args: [] }];
  }
  if (process.platform === "win32") {
    return [{ command: "clip.exe", args: [] }];
  }
  return [
    { command: "wl-copy", args: [] },
    { command: "xclip", args: ["-selection", "clipboard"] },
    { command: "xsel", args: ["--clipboard", "--input"] },
  ];
}

function tryClipboardCommand(
  command: ClipboardCommand,
  value: string,
): Promise<ClipboardResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    const child = spawn(command.command, command.args, {
      stdio: ["pipe", "ignore", "pipe"],
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        success: false,
        command: command.command,
        error: `${command.command} timed out`,
      });
    }, 2_000);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        command: command.command,
        error: error.message,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(
        code === 0
          ? { success: true, command: command.command }
          : {
              success: false,
              command: command.command,
              error:
                stderr.trim() ||
                `${command.command} exited with status ${code ?? "unknown"}`,
            },
      );
    });

    child.stdin.end(value);
  });
}
