const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const useAnimation = Boolean(process.stdout.isTTY) && !process.env.CI;
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

let activeSpinner: TerminalSpinner | null = null;

function color(code: number, value: string): string {
  return useColor ? `\u001b[${code}m${value}\u001b[0m` : value;
}

function writeLine(stream: NodeJS.WriteStream, message = ""): void {
  const spinner = activeSpinner;
  spinner?.clearLine();
  stream.write(`${message}\n`);
  spinner?.render();
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return minutes > 0 ? `${minutes}:${remainingSeconds}` : `${seconds}s`;
}

class TerminalSpinner {
  private readonly startedAt = Date.now();
  private enabled = false;
  private frameIndex = 0;
  private lineVisible = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly message: string) {}

  start(): void {
    if (!useAnimation || activeSpinner) {
      log.dim(`${this.message}...`);
      return;
    }

    this.enabled = true;
    activeSpinner = this;
    this.render();
    this.timer = setInterval(() => this.render(), 120);
    this.timer.unref?.();
  }

  render(): void {
    if (!this.enabled || this.stopped || activeSpinner !== this) return;

    const elapsedMs = Date.now() - this.startedAt;
    const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
    const dotCount = Math.floor(elapsedMs / 400) % 4;
    const dots = ".".repeat(dotCount).padEnd(3, " ");

    this.frameIndex += 1;
    this.lineVisible = true;
    process.stdout.write(
      `\r${style.cyan(frame)} ${this.message}${dots} ${style.dim(formatElapsed(elapsedMs))}`,
    );
  }

  clearLine(): void {
    if (!this.enabled || !this.lineVisible) return;
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    this.lineVisible = false;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearLine();
    if (activeSpinner === this) {
      activeSpinner = null;
    }
  }
}

export const style = {
  bold: (value: string) => color(1, value),
  dim: (value: string) => color(2, value),
  green: (value: string) => color(32, value),
  yellow: (value: string) => color(33, value),
  red: (value: string) => color(31, value),
  blue: (value: string) => color(34, value),
  purple: (value: string) => color(35, value),
  cyan: (value: string) => color(36, value),
};

export const log = {
  raw(message = ""): void {
    writeLine(process.stdout, message);
  },
  info(message: string): void {
    writeLine(process.stdout, message);
  },
  dim(message: string): void {
    writeLine(process.stdout, style.dim(message));
  },
  success(message: string): void {
    writeLine(process.stdout, style.green(message));
  },
  warn(message: string): void {
    writeLine(process.stderr, style.yellow(message));
  },
  error(message: string): void {
    writeLine(process.stderr, style.red(message));
  },
};

export async function withSpinner<T>(
  message: string,
  operation: () => Promise<T>,
): Promise<T> {
  const spinner = new TerminalSpinner(message);
  spinner.start();
  try {
    return await operation();
  } finally {
    spinner.stop();
  }
}

export function stopActiveSpinner(): void {
  activeSpinner?.stop();
}
