import { randomUUID } from "node:crypto";
import {
  existingTestOutcome,
  prepareTestPrintBatch,
  testPrintConflict,
  testPrintMissing,
  type TestPrintStore,
  type TestPrintCreateInput,
  type TestPrintJob,
  type TestPrintOutcome,
  type TestPrintResult,
} from "./warehouseTestPrint";
export class MemoryTestPrintStore implements TestPrintStore {
  private jobs: TestPrintJob[] = [];
  clear() {
    this.jobs = [];
  }
  async create(
    input: TestPrintCreateInput,
    actor: string,
  ): Promise<TestPrintResult> {
    const existing = this.jobs.find(
      (j) => j.requestId === input.requestId && j.createdBy === actor,
    );
    if (existing)
      return existing.requestKey === input.requestKey
        ? { ok: true, job: structuredClone(existing) }
        : testPrintConflict();
    const job: TestPrintJob = {
      ...structuredClone(input),
      id: randomUUID(),
      createdBy: actor,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    prepareTestPrintBatch(job);
    this.jobs.push(job);
    return { ok: true, job: structuredClone(job) };
  }
  async get(id: string) {
    return structuredClone(this.jobs.find((j) => j.id === id) ?? null);
  }
  async findByRequest(requestId: string, actor: string) {
    return structuredClone(
      this.jobs.find(
        (j) => j.requestId === requestId && j.createdBy === actor,
      ) ?? null,
    );
  }
  async list(shipmentId: string, page: number) {
    const jobs = this.jobs.filter((j) => j.shipmentId === shipmentId).reverse();
    return {
      total: jobs.length,
      jobs: structuredClone(jobs.slice((page - 1) * 25, page * 25)),
    };
  }
  async recordOutcome(
    id: string,
    outcome: TestPrintOutcome,
    reason: string,
    actor: string,
  ): Promise<TestPrintResult> {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return testPrintMissing();
    if (job.status !== "pending")
      return existingTestOutcome(structuredClone(job), outcome, reason);
    Object.assign(job, {
      status: outcome,
      reason,
      outcomeBy: actor,
      outcomeAt: new Date().toISOString(),
    });
    return { ok: true, job: structuredClone(job) };
  }
}
