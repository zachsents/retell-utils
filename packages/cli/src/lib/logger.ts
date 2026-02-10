import chalk from "chalk"
import cliSpinners from "cli-spinners"

let quietMode = false

/** Enable or disable quiet mode globally. */
export function setQuiet(quiet: boolean) {
  quietMode = quiet
}

/** Returns true if quiet mode is enabled. */
export function isQuiet() {
  return quietMode
}

/** Log a message (suppressed in quiet mode). */
export function log(...args: Parameters<typeof console.log>) {
  if (!quietMode) {
    console.log(...args)
  }
}

/** Log a dim message (suppressed in quiet mode). */
export function dim(message: string) {
  if (!quietMode) {
    console.log(chalk.dim(message))
  }
}

/** Log a bold message (suppressed in quiet mode). */
export function bold(message: string) {
  if (!quietMode) {
    console.log(chalk.bold(message))
  }
}

/** Log a success message (suppressed in quiet mode). */
export function success(message: string) {
  if (!quietMode) {
    console.log(chalk.green(message))
  }
}

/** Log a warning message (suppressed in quiet mode). */
export function warn(message: string) {
  if (!quietMode) {
    console.log(chalk.yellow(message))
  }
}

/** Log an error message (suppressed in quiet mode). */
export function error(message: string) {
  if (!quietMode) {
    console.log(chalk.red(message))
  }
}

type Spinner = {
  stop: (message?: string) => void
}

/** Creates a spinner that shows progress. Returns a no-op spinner in quiet mode. */
export function createSpinner(text: string): Spinner {
  if (quietMode) {
    return { stop: () => {} }
  }

  const spinner = cliSpinners.dots
  let frameIndex = 0
  let currentText = text

  const interval = setInterval(() => {
    const frame = spinner.frames[frameIndex % spinner.frames.length]
    process.stdout.write(`\r${chalk.cyan(frame)} ${currentText}`)
    frameIndex++
  }, spinner.interval)

  return {
    stop: (message?: string) => {
      clearInterval(interval)
      process.stdout.write("\r" + " ".repeat(currentText.length + 10) + "\r")
      if (message) {
        console.log(message)
      }
    },
  }
}
