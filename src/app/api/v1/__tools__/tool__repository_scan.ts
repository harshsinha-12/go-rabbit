import { logger, withToolLogging } from "@/utils";
import { getRepositoryScanPrompt } from "../__prompts__";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { z } from "zod";
import { exploreCodebase, readRepositoryFile } from "./tool__workspace";

const execFileAsync = promisify(execFile);

export const TOOL_SCAN_REPOSITORY_FOR_ISSUE = "scanRepositoryForIssue";

export const RepositoryScanSchema = z.object({
  repositoryPath: z.string(),
  repositoryTree: z.string(),
  relevantFiles: z.array(z.string()),
  relevantTests: z.array(z.string()),
  projectConventions: z.array(z.string()),
  detectedTestCommands: z.array(z.string()),
  readmeSummary: z.string(),
  goModSummary: z.string(),
});

export type RepositoryScan = z.infer<typeof RepositoryScanSchema>;

export const DEF_SCAN_REPOSITORY_FOR_ISSUE: OpenAI.Chat.Completions.ChatCompletionTool =
  {
    type: "function",
    function: {
      name: TOOL_SCAN_REPOSITORY_FOR_ISSUE,
      description:
        "Scans a cloned Go repository for files, tests, conventions, and validation commands relevant to a GitHub issue.",
      parameters: {
        type: "object",
        properties: {
          repositoryPath: {
            type: "string",
            description: "Absolute path to the cloned repository checkout.",
          },
          issueTitle: {
            type: "string",
            description: "GitHub issue title.",
          },
          issueBody: {
            type: "string",
            description: "GitHub issue body.",
          },
        },
        required: ["repositoryPath", "issueTitle", "issueBody"],
        additionalProperties: false,
      },
    },
  };

export type ScanRepositoryForIssueInput = {
  repositoryPath: string;
  issueTitle: string;
  issueBody: string;
};

function getSearchTerms(issueTitle: string, issueBody: string) {
  const text = `${issueTitle} ${issueBody}`.toLowerCase();
  const terms = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4)
    .filter(
      (term) =>
        ![
          "this",
          "that",
          "with",
          "from",
          "have",
          "when",
          "should",
          "would",
          "could",
          "issue",
          "github",
        ].includes(term),
    );

  return Array.from(new Set(terms)).slice(0, 12);
}

function compactContent(content: string, maxLength = 1200) {
  return content.length > maxLength
    ? `${content.slice(0, maxLength)}\n...[truncated]`
    : content;
}

function buildRepositoryTree(filePaths: string[], maxLines = 420) {
  const tree = new Map<string, Set<string>>();

  for (const filePath of filePaths.sort()) {
    const parts = filePath.split(path.sep);
    let prefix = "";

    parts.forEach((part, index) => {
      const key = prefix;
      const label = index === parts.length - 1 ? part : `${part}/`;
      const children = tree.get(key) ?? new Set<string>();
      children.add(label);
      tree.set(key, children);
      prefix = prefix ? `${prefix}${path.sep}${part}` : part;
    });
  }

  const lines: string[] = [];
  const render = (prefix: string, depth: number) => {
    if (lines.length >= maxLines) {
      return;
    }

    const children = Array.from(tree.get(prefix) ?? []).sort((a, b) => {
      const aIsDir = a.endsWith("/");
      const bIsDir = b.endsWith("/");

      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }

      return a.localeCompare(b);
    });

    for (const child of children) {
      if (lines.length >= maxLines) {
        return;
      }

      lines.push(`${"  ".repeat(depth)}${child}`);

      if (child.endsWith("/")) {
        const nextPrefix = prefix
          ? `${prefix}${path.sep}${child.slice(0, -1)}`
          : child.slice(0, -1);
        render(nextPrefix, depth + 1);
      }
    }
  };

  render("", 0);

  if (lines.length >= maxLines) {
    lines.push("...[tree truncated]");
  }

  return lines.join("\n");
}

async function safeRead(repositoryPath: string, filePath: string) {
  try {
    const result = await readRepositoryFile({
      repositoryPath,
      filePath,
      maxBytes: 4000,
    });
    return result.content;
  } catch {
    return "";
  }
}

async function searchRepository(repositoryPath: string, terms: string[]) {
  const matches = new Set<string>();

  for (const term of terms.slice(0, 8)) {
    try {
      const { stdout } = await execFileAsync(
        "rg",
        ["--files-with-matches", "--glob", "!vendor/**", term, repositoryPath],
        { maxBuffer: 1024 * 1024 * 5 },
      );

      stdout
        .split("\n")
        .filter(Boolean)
        .map((filePath) => path.relative(repositoryPath, filePath))
        .filter((filePath) => filePath && !filePath.startsWith(".."))
        .slice(0, 20)
        .forEach((filePath) => matches.add(filePath));
    } catch {
      // rg exits non-zero when no matches are found.
    }
  }

  return Array.from(matches).slice(0, 40);
}

export async function scanRepositoryForIssue({
  repositoryPath,
  issueTitle,
  issueBody,
}: ScanRepositoryForIssueInput): Promise<RepositoryScan> {
  return withToolLogging(
    TOOL_SCAN_REPOSITORY_FOR_ISSUE,
    { repositoryPath, issueTitle },
    async () => {
      logger.debug({ repositoryPath, issueTitle }, "Scanning repository for issue");
      logger.debug(
        { prompt: getRepositoryScanPrompt() },
        "Using repository scan prompt contract",
      );

      const codebase = await exploreCodebase({ repositoryPath, maxFiles: 900 });
      const terms = getSearchTerms(issueTitle, issueBody);
      const matchedFiles = await searchRepository(repositoryPath, terms);
      const packageMatches = matchedFiles
        .flatMap((filePath) => {
          const directory = path.dirname(filePath);

          if (directory === "." || directory === "") {
            return [];
          }

          return codebase.files
            .map((file) => file.path)
            .filter(
              (candidate) =>
                path.dirname(candidate) === directory &&
                /\.(go|md)$/.test(candidate),
            );
        })
        .slice(0, 60);
      const relevantTests = Array.from(
        new Set([
          ...matchedFiles.filter((filePath) => /_test\.go$/.test(filePath)),
          ...packageMatches.filter((filePath) => /_test\.go$/.test(filePath)),
          ...codebase.groupedFiles.test.slice(0, 15),
        ]),
      ).slice(0, 20);

      const relevantFiles = Array.from(
        new Set([
          ...matchedFiles.filter((filePath) => !/_test\.go$/.test(filePath)),
          ...packageMatches.filter((filePath) => !/_test\.go$/.test(filePath)),
          ...codebase.groupedFiles.config.slice(0, 8),
          ...codebase.groupedFiles.source.slice(0, 20),
        ]),
      ).slice(0, 40);

      const readme = await safeRead(repositoryPath, "README.md");
      const goMod = await safeRead(repositoryPath, "go.mod");
      const hasMakefile = codebase.groupedFiles.config.includes("Makefile");

      return RepositoryScanSchema.parse({
        repositoryPath,
        repositoryTree: buildRepositoryTree(codebase.files.map((file) => file.path)),
        relevantFiles,
        relevantTests,
        projectConventions: [
          "Prefer focused changes in the package related to the selected issue.",
          "Add or update nearby Go tests before broad validation.",
          hasMakefile
            ? "Makefile is present; inspect it before choosing broad validation commands."
            : "No root Makefile was found in the compact scan.",
        ],
        detectedTestCommands: [
          "go test ./...",
          ...(hasMakefile ? ["make test"] : []),
        ],
        readmeSummary: compactContent(readme || "README.md was not found."),
        goModSummary: compactContent(goMod || "go.mod was not found."),
      });
    },
  );
}

export const scanRepositoryForIssueTool = scanRepositoryForIssue;
