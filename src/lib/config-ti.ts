/**
 * This module was automatically generated by `ts-interface-builder`
 */
import * as t from "ts-interface-checker";
// tslint:disable:object-literal-key-quotes

export const Config = t.iface([], {
  "projects": t.array("ProjectConfig"),
});

export const ColumnConfig = t.iface([], {
  "name": "string",
  "label": t.opt("string"),
  "default": t.opt("boolean"),
  "closed": t.opt("boolean"),
});

export const ProjectConfig = t.iface([], {
  "name": "string",
  "columns": t.array("ColumnConfig"),
  "autoAddIssuesMatching": t.opt("string"),
});

const exportedTypeSuite: t.ITypeSuite = {
  Config,
  ColumnConfig,
  ProjectConfig,
};
export default exportedTypeSuite;
