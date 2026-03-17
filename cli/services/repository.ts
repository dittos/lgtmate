import { CliError } from "../errors.ts";

type RepositoryReference = {
  owner: string | null;
  repo: string;
};

type ResolvedRepository = {
  repositoryPath: string;
  repository: {
    owner: string;
    repo: string;
  };
};

type StorageLike = {
  readSettings(): Promise<{
    repoMappings: Record<string, string>;
    launcher: Record<string, unknown>;
  }>;
  writeSettings(settings: {
    repoMappings: Record<string, string>;
    launcher: Record<string, unknown>;
  }): Promise<void>;
};

function normalizeRepositoryKey(value: string): string {
  return value.trim().toLowerCase();
}

export function createRepositoryService(deps: {
  storage: StorageLike;
  getGitRepositoryRoot(): Promise<string>;
  getGithubRepository(repositoryPath: string): Promise<{ owner: string; repo: string }>;
}) {
  async function registerRepositoryMapping(
    owner: string,
    repo: string,
    repositoryPath: string
  ): Promise<void> {
    const settings = await deps.storage.readSettings();
    const repositoryKey = `${owner}/${repo}`.toLowerCase();

    await deps.storage.writeSettings({
      ...settings,
      repoMappings: {
        ...settings.repoMappings,
        [repositoryKey]: repositoryPath
      }
    });
  }

  async function resolveMappedRepository(
    repositoryRef: RepositoryReference
  ): Promise<ResolvedRepository> {
    const settings = await deps.storage.readSettings();
    const entries = Object.entries(settings.repoMappings);

    if (entries.length === 0) {
      throw new CliError(
        "No local clone mappings are configured. Run `lgtm <pr-number>` inside a clone first."
      );
    }

    if (repositoryRef.owner) {
      const repositoryKey = normalizeRepositoryKey(`${repositoryRef.owner}/${repositoryRef.repo}`);
      const repositoryPath = settings.repoMappings[repositoryKey];

      if (!repositoryPath) {
        throw new CliError(
          `No local clone mapping found for ${repositoryRef.owner}/${repositoryRef.repo}.`
        );
      }

      const repository = await deps.getGithubRepository(repositoryPath);
      return { repositoryPath, repository };
    }

    const requestedRepo = normalizeRepositoryKey(repositoryRef.repo);
    const matches = entries.filter(([repositoryKey]) => {
      const [, mappedRepo = ""] = repositoryKey.split("/");
      return mappedRepo === requestedRepo;
    });

    if (matches.length === 0) {
      throw new CliError(`No local clone mapping found for ${repositoryRef.repo}.`);
    }

    if (matches.length > 1) {
      const choices = matches.map(([repositoryKey]) => repositoryKey).sort();
      throw new CliError(
        `Repository name \`${repositoryRef.repo}\` is ambiguous. Use one of: ${choices.join(", ")}`
      );
    }

    const [, repositoryPath] = matches[0];
    const repository = await deps.getGithubRepository(repositoryPath);
    return { repositoryPath, repository };
  }

  async function resolveRepository(
    repositoryRef: RepositoryReference | null
  ): Promise<ResolvedRepository> {
    if (repositoryRef) {
      return resolveMappedRepository(repositoryRef);
    }

    const repositoryPath = await deps.getGitRepositoryRoot().catch((error: unknown) => {
      throw new CliError(
        error instanceof Error ? error.message : "Current directory is not a git repository."
      );
    });
    const repository = await deps.getGithubRepository(repositoryPath);

    await registerRepositoryMapping(repository.owner, repository.repo, repositoryPath);

    return {
      repositoryPath,
      repository
    };
  }

  return {
    resolveRepository
  };
}
