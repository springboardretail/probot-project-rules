import { Config } from "./config-ti";

export interface Config {
  projects: ProjectConfig[];
}

export interface ColumnConfig {
  name: string;
  label: string;
  default?: boolean;
}

export interface ProjectConfig {
  name: string;
  columns: ColumnConfig[];
  autoAddIssuesMatching?: string;
}

import configTI from "./config-ti";
import { createCheckers } from "ts-interface-checker";

const checkers = createCheckers(configTI);

export const parseConfig = (configInput: any): Config => {
  const error = checkers.Config.strictValidate(configInput);

  if (error) {
    throw error;
  }

  return configInput;
};

export const defaultConfig: Config = { projects: [] };
