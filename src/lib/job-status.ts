export const JOB_STATUSES = ["saved", "applied", "discarded"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
