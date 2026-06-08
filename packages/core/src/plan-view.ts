import type { PlanDocument, PlanTask, PlanViewModel, PlanViewTask } from "./types.js";

export function buildPlanViewModel(input: {
  taskName: string;
  planFile: string;
  plan: PlanDocument;
}): PlanViewModel {
  const { taskName, planFile, plan } = input;
  const total = plan.tasks.length;
  const completed = plan.tasks.filter((task) => task.status === "done").length;
  const orderedTasks = orderPlanViewTasks(plan.tasks);

  return {
    taskName,
    planFile,
    title: plan.title,
    status: plan.status,
    collapsedSummary: total > 0 ? `${completed}/${total} ${plan.title}` : plan.title,
    counts: {
      completed,
      total,
    },
    goal: {
      text: plan.goal.text,
      defaultCollapsed: true,
    },
    tasks: {
      ordering: "unfinished_first_stable",
      items: orderedTasks,
    },
    expanded: {
      sections: [
        {
          id: "goal",
          label: "Goal",
          type: "disclosure",
          defaultExpanded: false,
          content: {
            text: plan.goal.text,
          },
        },
        {
          id: "tasks",
          label: "Tasks",
          type: "list",
          defaultExpanded: true,
          ordering: "unfinished_first_stable",
          items: orderedTasks,
        },
      ],
    },
    renderHints: {
      defaultCollapsed: true,
      supportsGoalDisclosure: true,
      refreshOn: ["plan.write", "plan.edit", "plan.done"],
    },
  };
}

function orderPlanViewTasks(tasks: PlanTask[]): PlanViewTask[] {
  const indexed = tasks.map((task, index) => ({ task, index }));
  indexed.sort((left, right) => {
    const leftDone = left.task.status === "done";
    const rightDone = right.task.status === "done";
    if (leftDone !== rightDone) {
      return leftDone ? 1 : -1;
    }
    return left.index - right.index;
  });
  return indexed.map(({ task }) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    ...(task.detail ? { detail: task.detail } : {}),
  }));
}
