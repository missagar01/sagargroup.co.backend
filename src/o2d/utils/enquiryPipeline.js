// Shared stage definitions for the enquiry pipeline (FM -> Proposal -> Demo -> Negotiation -> Close)

const STAGE_ORDER = ["fm", "proposal", "demo", "negotiation", "close"];

const STAGE_LABELS = {
  fm: "First Meeting",
  proposal: "Proposal",
  demo: "Demonstration",
  negotiation: "Negotiation",
  close: "Closer",
};

function plannedCol(stage) {
  return `${stage}_planned`;
}

function actualCol(stage) {
  return `${stage}_actual`;
}

function nextStage(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

// Attaches per-stage status + overall pipeline status to a raw enquiry row.
function computeEnquiryStatus(row) {
  const now = new Date();

  const stages = STAGE_ORDER.map((key) => {
    const planned = row[plannedCol(key)];
    const actual = row[actualCol(key)];

    let status;
    if (actual) status = "completed";
    else if (!planned) status = "not_started";
    else if (new Date(planned) < now) status = "overdue";
    else status = "pending";

    return { key, label: STAGE_LABELS[key], planned, actual, status };
  });

  const activeStage = stages.find((s) => s.status !== "completed");

  return {
    ...row,
    stages,
    current_stage: activeStage ? activeStage.key : null,
    overall_status: activeStage
      ? activeStage.status === "not_started"
        ? "blocked"
        : activeStage.status
      : "completed",
  };
}

module.exports = {
  STAGE_ORDER,
  STAGE_LABELS,
  plannedCol,
  actualCol,
  nextStage,
  computeEnquiryStatus,
};
