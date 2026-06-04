import { logger } from "@/utils";
import { execFile } from "node:child_process";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";

const execFileAsync = promisify(execFile);

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
  "vendor",
]);

export const TOOL_EXPLORE_CODEBASE = "exploreCodebase";
export const TOOL_READ_REPOSITORY_FILE = "readRepositoryFile";
export const TOOL_WRITE_REPOSITORY_FILE = "writeRepositoryFile";
export const TOOL_GET_REPOSITORY_DIFF = "getRepositoryDiff";

export const DEF_EXPLORE_CODEBASE: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_EXPLORE_CODEBASE,
      description:
        "Explores a cloned repository and returns a compact codebase map with important config, source, test, and styling files.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: {
            type: "string",
            description: "Absolute path to the cloned repository checkout.",
          },
          maxFiles: {
            type: "number",
            description:
              "Maximum number of files to return. Defaults to 120 to keep context compact.",
          },
        },
        required: ["repositoryPath"],
        additionalProperties: false,
      },
    },
  };

export const DEF_READ_REPOSITORY_FILE: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_READ_REPOSITORY_FILE,
      description:
        "Reads a text file from inside a cloned repository checkout for agent context gathering.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: {
            type: "string",
            description: "Absolute path to the cloned repository checkout.",
          },
          filePath: {
            type: "string",
            description:
              "Repository-relative file path to read, for example go.mod or app/page.tsx.",
          },
          maxBytes: {
            type: "number",
            description:
              "Maximum bytes to return. Defaults to 20000 to avoid flooding model context.",
          },
        },
        required: ["repositoryPath", "filePath"],
        additionalProperties: false,
      },
    },
  };

export const DEF_WRITE_REPOSITORY_FILE: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_WRITE_REPOSITORY_FILE,
      description:
        "Creates or overwrites a text file inside a cloned repository checkout after the patch has been approved.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: {
            type: "string",
            description: "Absolute path to the cloned repository checkout.",
          },
          filePath: {
            type: "string",
            description:
              "Repository-relative file path to create or overwrite.",
          },
          content: {
            type: "string",
            description: "Full UTF-8 file content to write.",
          },
        },
        required: ["repositoryPath", "filePath", "content"],
        additionalProperties: false,
      },
    },
  };

export const DEF_GET_REPOSITORY_DIFF: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_GET_REPOSITORY_DIFF,
      description:
        "Returns the current git diff for a cloned repository after edits are applied.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: {
            type: "string",
            description: "Absolute path to the cloned repository checkout.",
          },
          filePath: {
            type: "string",
            description:
              "Optional repository-relative file path to diff only one file.",
          },
        },
        required: ["repositoryPath"],
        additionalProperties: false,
      },
    },
  };

export type ExploreCodebaseInput = {
  repositoryPath: string;
  maxFiles?: number;
};

export type ReadRepositoryFileInput = {
  repositoryPath: string;
  filePath: string;
  maxBytes?: number;
};

export type WriteRepositoryFileInput = {
  repositoryPath: string;
  filePath: string;
  content: string;
};

export type GetRepositoryDiffInput = {
  repositoryPath: string;
  filePath?: string;
};

type CodebaseFile = {
  path: string;
  kind: "config" | "source" | "test" | "style" | "doc" | "other";
};

function resolveRepositoryPath(repositoryPath: string) {
  return path.resolve(repositoryPath);
}

function resolveInsideRepository(repositoryPath: string, filePath: string) {
  const repositoryRoot = resolveRepositoryPath(repositoryPath);
  const resolvedPath = path.resolve(repositoryRoot, filePath);
  const isInside =
    resolvedPath === repositoryRoot ||
    resolvedPath.startsWith(`${repositoryRoot}${path.sep}`);

  if (!isInside) {
    throw new Error(`File path escapes repository root: ${filePath}`);
  }

  return { repositoryRoot, resolvedPath };
}

function classifyFile(filePath: string): CodebaseFile["kind"] {
  const basename = path.basename(filePath);

  if (
    basename === "package.json" ||
    basename === "go.mod" ||
    basename === "go.sum" ||
    basename === "Makefile" ||
    basename.startsWith("tsconfig") ||
    basename.startsWith("next.config") ||
    basename.startsWith("eslint.config")
  ) {
    return "config";
  }

  if (
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) ||
    /_test\.go$/.test(filePath)
  ) {
    return "test";
  }

  if (/\.(css|scss|sass|less)$/.test(filePath)) {
    return "style";
  }

  if (/\.(md|mdx|txt)$/.test(filePath)) {
    return "doc";
  }

  if (/\.(go|ts|tsx|js|jsx)$/.test(filePath)) {
    return "source";
  }

  return "other";
}

async function assertRepositoryDirectory(repositoryPath: string) {
  const repositoryRoot = resolveRepositoryPath(repositoryPath);
  const stats = await stat(repositoryRoot);

  if (!stats.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repositoryPath}`);
  }

  return repositoryRoot;
}

async function collectFiles(
  repositoryRoot: string,
  currentDirectory: string,
  maxFiles: number,
  files: CodebaseFile[],
) {
  if (files.length >= maxFiles) {
    return;
  }

  const entries = await readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (files.length >= maxFiles) {
      return;
    }

    if (entry.name.startsWith(".") && entry.name !== ".github") {
      continue;
    }

    const absolutePath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        await collectFiles(repositoryRoot, absolutePath, maxFiles, files);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = path.relative(repositoryRoot, absolutePath);
    files.push({
      path: relativePath,
      kind: classifyFile(relativePath),
    });
  }
}

export async function exploreCodebase({
  repositoryPath,
  maxFiles = 120,
}: ExploreCodebaseInput) {
  logger.debug({ repositoryPath, maxFiles }, "Exploring codebase");

  const repositoryRoot = await assertRepositoryDirectory(repositoryPath);
  const files: CodebaseFile[] = [];

  await collectFiles(repositoryRoot, repositoryRoot, maxFiles, files);

  const groupedFiles = files.reduce<Record<CodebaseFile["kind"], string[]>>(
    (groups, file) => {
      groups[file.kind].push(file.path);
      return groups;
    },
    {
      config: [],
      source: [],
      test: [],
      style: [],
      doc: [],
      other: [],
    },
  );

  logger.debug(
    {
      repositoryPath,
      filesCount: files.length,
    },
    "Explored codebase",
  );

  return {
    repositoryPath: repositoryRoot,
    files,
    groupedFiles,
  };
}

export async function readRepositoryFile({
  repositoryPath,
  filePath,
  maxBytes = 20000,
}: ReadRepositoryFileInput) {
  logger.debug(
    { repositoryPath, filePath, maxBytes },
    "Reading repository file",
  );

  const { resolvedPath } = resolveInsideRepository(repositoryPath, filePath);
  const content = await readFile(resolvedPath, "utf8");
  const truncated = Buffer.byteLength(content, "utf8") > maxBytes;
  const safeContent = truncated
    ? Buffer.from(content, "utf8").subarray(0, maxBytes).toString("utf8")
    : content;

  return {
    filePath,
    content: safeContent,
    truncated,
  };
}

export async function writeRepositoryFile({
  repositoryPath,
  filePath,
  content,
}: WriteRepositoryFileInput) {
  logger.debug({ repositoryPath, filePath }, "Writing repository file");

  const { resolvedPath } = resolveInsideRepository(repositoryPath, filePath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, content, "utf8");

  return {
    filePath,
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}

export async function getRepositoryDiff({
  repositoryPath,
  filePath,
}: GetRepositoryDiffInput) {
  logger.debug({ repositoryPath, filePath }, "Getting repository diff");

  const repositoryRoot = await assertRepositoryDirectory(repositoryPath);
  const args = ["-C", repositoryRoot, "diff", "--"];

  if (filePath) {
    resolveInsideRepository(repositoryRoot, filePath);
    args.push(filePath);
  }

  const { stdout } = await execFileAsync("git", args, {
    maxBuffer: 1024 * 1024 * 10,
  });

  return {
    repositoryPath: repositoryRoot,
    filePath: filePath ?? null,
    diff: stdout,
  };
}

export const exploreCodebaseTool = exploreCodebase;
export const readRepositoryFileTool = readRepositoryFile;
export const writeRepositoryFileTool = writeRepositoryFile;
export const getRepositoryDiffTool = getRepositoryDiff;
