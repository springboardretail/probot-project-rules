import { Context } from "probot";

export const getLabels = (context: Context) => {
  const { issue, pull_request } = context.payload;

  if (issue == null && pull_request == null) {
    throw new Error(`can't get labels from payload: ${context.payload}`);
  }

  const labels: { name: string }[] = (issue || pull_request).labels;
  return labels.map(l => l.name);
};

export const hasLabel = (context: Context, label: string) =>
  getLabels(context).includes(label);

export const addLabelsIfNotPresent = async (
  context: Context,
  labels: string[]
) => {
  context.log.debug(labels, "checking for labels to add");
  labels = labels.filter(l => !hasLabel(context, l));
  if (labels.length == 0) {
    context.log.debug("no labels to add");
    return;
  }
  context.log.debug(labels, "adding labels");
  context.github.issues.addLabels({
    ...context.issue(),
    labels: labels
  });
};

export const removeLabelsIfPresent = async (
  context: Context,
  labels: string[]
) => {
  context.log.debug(labels, "checking for labels to remove");
  labels = labels.filter(l => hasLabel(context, l));
  if (labels.length == 0) {
    context.log.debug("no labels to remove");
    return;
  }
  for (let label of labels) {
    await context.github.issues.removeLabel({
      ...context.issue(),
      name: label
    });
  }
};
