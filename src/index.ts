import fs from "fs";
import yaml from "js-yaml";
import jsonata from "jsonata";
import path from "path";
import { Application, Context } from "probot";
import {
  ColumnConfig,
  Config,
  defaultConfig,
  parseConfig,
  ProjectConfig
} from "./lib/config";
import {
  addProjectCardMutation,
  getIssueProjectCardsQuery,
  getProjectByNameQuery,
  moveProjectCardMutation
} from "./lib/graphql";
import {
  addLabelsIfNotPresent,
  hasLabel,
  removeLabelsIfPresent
} from "./lib/labels";

const loadYAML = (file: string) =>
  yaml.safeLoad(
    fs.readFileSync(path.resolve(__dirname, "..", file)).toString()
  );

const getConfig = async (context: Context) =>
  parseConfig(
    process.env.LOCAL_CONFIG_PATH == null
      ? await context.config("project-rules.yml", defaultConfig)
      : loadYAML(process.env.LOCAL_CONFIG_PATH)
  );

type ProjectCard = {
  id: string;
  project: { id: string; number: number; name: string };
  column?: { id: string; name: string };
};

type Project = {
  id: string;
  name: string;
  columns: ProjectColumn[];
};

type ProjectColumn = {
  id: string;
  name: string;
};

const getProjectByName = async (
  context: Context,
  projectName: string
): Promise<Project> => {
  const response = ((await context.github.query(
    getProjectByNameQuery,
    context.issue({ projectName })
  )) as any) as {
    repository: {
      projects: {
        nodes: [
          {
            id: string;
            name: string;
            columns: {
              nodes: ProjectColumn[];
            };
          }
        ];
      };
    };
  };

  let projectResponse = response.repository.projects.nodes.find(
    node => node.name == projectName
  );

  if (projectResponse == null) {
    throw new Error(`can't find project with name ${projectName}`);
  }

  return {
    ...projectResponse,
    columns: projectResponse.columns.nodes
  };
};

const getIssueProjectCards = async (context: Context) => {
  const response = ((await context.github.query(
    getIssueProjectCardsQuery,
    context.issue()
  )) as any) as {
    repository: {
      issue: {
        projectCards: {
          nodes: ProjectCard[];
        };
      };
    };
  };

  return response.repository.issue.projectCards.nodes;
};

const issueIsInProject = (
  projectCards: ProjectCard[],
  projectName: string
): boolean => projectCards.some(card => card.project.name == projectName);

const issueIsClosed = (context: Context): boolean =>
  context.payload.issue.state === "closed";

const issueIsAllowedInColumn = (
  context: Context,
  columnConfig: ColumnConfig
): boolean =>
  columnConfig.closed === true
    ? issueIsClosed(context)
    : !issueIsClosed(context);

const issueShouldBeAutoAddedToProject = (
  context: Context,
  projectConfig: ProjectConfig,
  projectCards: ProjectCard[]
): boolean => {
  // already in project
  if (projectCards.find(card => card.project.name == projectConfig.name)) {
    return true;
  }

  // issue should be auto-added to project
  if (
    projectConfig.autoAddIssuesMatching &&
    jsonata(projectConfig.autoAddIssuesMatching).evaluate(context.payload.issue)
  ) {
    return true;
  }

  return false;
};

const getExpectedProjectPlacements = (
  context: Context,
  config: Config,
  projectCards: ProjectCard[],
  newLabel?: string
): { projectConfig: ProjectConfig; columnConfig: ColumnConfig }[] =>
  config.projects.reduce(
    (results, projectConfig) => {
      if (
        !issueIsInProject(projectCards, projectConfig.name) &&
        !issueShouldBeAutoAddedToProject(context, projectConfig, projectCards)
      ) {
        return results;
      }

      const projectCard = projectCards.find(
        card => card.project.name == projectConfig.name
      );

      const currentColumnName =
        projectCard && projectCard.column ? projectCard.column.name : undefined;

      const { columns } = projectConfig;

      const columnConfig =
        columns.find(c => c.closed === true && issueIsClosed(context)) ||
        columns.find(c => newLabel != null && c.label === newLabel) ||
        columns.find(c => c.label != null && hasLabel(context, c.label)) ||
        columns.find(
          c =>
            c.name === currentColumnName && issueIsAllowedInColumn(context, c)
        ) ||
        columns.find(c => c.default === true);

      if (columnConfig == null) {
        throw new Error(
          "project with an auto add config must have a default column"
        );
      }

      return [
        ...results,
        {
          projectConfig,
          columnConfig
        }
      ];
    },
    [] as { projectConfig: ProjectConfig; columnConfig: ColumnConfig }[]
  );

const getProjectColumnByName = async (
  context: Context,
  projectName: string,
  columnName: string
): Promise<ProjectColumn> => {
  const project = await getProjectByName(context, projectName);
  const column = project.columns.find(column => column.name === columnName);

  if (column == null) {
    throw new Error(
      `Can't find column "${columnName}" in project ${projectName} (columns: ${project.columns
        .map(c => JSON.stringify(c.name))
        .join(", ")})`
    );
  }

  return column;
};

const updateLabels = async (
  context: Context,
  projectConfig: ProjectConfig,
  columnConfig: ColumnConfig
) => {
  context.log.info(columnConfig, "updating labels");
  const projectControlledLabels = projectConfig.columns
    .map(c => c.label)
    .filter(l => l != null) as string[];
  const labelsToRemove = projectControlledLabels.filter(
    l => l !== columnConfig.label
  );
  if (columnConfig.label != null) {
    await addLabelsIfNotPresent(context, [columnConfig.label]);
  }
  await removeLabelsIfPresent(context, labelsToRemove);
};

export = (app: Application) => {
  app.on("issues", async context => {
    if (context.isBot) {
      context.log("ignoring bot-initiated issue event");
      return;
    }

    const { issue } = context.payload;

    const config = await getConfig(context);
    const projectCards = await getIssueProjectCards(context);

    const newLabel =
      context.payload.action === "labeled"
        ? (context.payload.label.name as string)
        : undefined;

    getExpectedProjectPlacements(
      context,
      config,
      projectCards,
      newLabel
    ).forEach(async ({ projectConfig, columnConfig }) => {
      const projectName = projectConfig.name;
      const columnName = columnConfig.name;

      const projectCard = projectCards.find(
        card => card.project.name == projectName
      );

      if (
        projectCard &&
        projectCard.column &&
        projectCard.column.name === columnName
      ) {
        context.log.debug("issue is already in the expected column");
        await updateLabels(context, projectConfig, columnConfig);
        return;
      }

      const column = await getProjectColumnByName(
        context,
        projectName,
        columnName
      );

      if (projectCard == null) {
        context.log.debug("adding issue to column");
        await context.github.query(addProjectCardMutation, {
          card: {
            contentId: issue.node_id,
            projectColumnId: column.id
          }
        });
      } else {
        context.log.debug("moving issue to new column");
        await context.github.query(moveProjectCardMutation, {
          card: {
            cardId: projectCard.id,
            columnId: column.id
          }
        });
      }

      await updateLabels(context, projectConfig, columnConfig);
    });
  });

  app.on("project_card", async context => {
    if (context.isBot) {
      context.log("ignoring bot-initiated project_card event");
      return;
    }

    const config = await getConfig(context);

    app.log.debug(context.payload, "project_card");

    const issue = (await context.github.request({
      method: "GET",
      url: context.payload.project_card.content_url as string,
      headers: {}
    })).data;

    context.payload.issue = issue;

    const projectCards = await getIssueProjectCards(context);

    const projectCard = projectCards.find(
      c => c.id === context.payload.project_card.node_id
    );

    if (projectCard == null) {
      context.log.info("can't find project card");
      return;
    }

    const projectConfig = config.projects.find(
      p => p.name === projectCard.project.name
    );

    if (projectConfig == null) {
      context.log.info("project card is not in a controlled project");
      return;
    }

    if (projectCard.column == null) {
      app.log.info("no column set for project card");
      return;
    }

    const columnConfig = projectConfig.columns.find(
      c => c.name === projectCard.column!.name
    );

    if (columnConfig == null) {
      app.log.info("no column config found for project card's column");
      return;
    }

    await updateLabels(context, projectConfig, columnConfig);
  });
};
