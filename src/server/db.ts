import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import type { CutConfig, ExpectedProgramRow, LocalPartLifecycle, PartSummary, ProgramSummary } from "../shared/types.js";
import type { ProgramMachinabilitySummary, ToolpathPartData } from "./toolpathClient.js";

type DatabaseConnection = Database.Database;

type PartRow = {
  id: string;
  name: string;
  units: string;
  local_lifecycle: LocalPartLifecycle;
  toolpath_status: string;
  program_id: string | null;
  program_ids_json: string;
  failure_code: string | null;
  failure_reason: string | null;
  created_at: string;
};

type ExpectedRow = {
  part_id: string;
  cut_config_id: string;
  cut_config_name: string;
};

type ProgramRow = {
  id: string;
  url: string | null;
  part_id: string;
  cut_config_id: string | null;
  cut_config_name: string | null;
  status: string;
  score: number | null;
  setup_count: number | null;
  total_duration_seconds: number | null;
  failure_code: string | null;
  failure_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const TERMINAL_PROGRAM_STATUSES = new Set(["ready", "failed", "error", "cancelled"]);

export class PartRepository {
  constructor(private readonly db: DatabaseConnection) {
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  static open(databasePath: string): PartRepository {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    return new PartRepository(new Database(databasePath));
  }

  close(): void {
    this.db.close();
  }

  createPart(part: ToolpathPartData, cutConfigs: CutConfig[]): PartSummary {
    const insertPart = this.db.prepare(`
      INSERT INTO parts (
        id, name, units, local_lifecycle, toolpath_status, program_id, program_ids_json,
        failure_code, failure_reason, created_at
      )
      VALUES (
        @id, @name, @units, @localLifecycle, @toolpathStatus, @programId, @programIdsJson,
        @failureCode, @failureReason, @createdAt
      )
    `);

    const insertExpected = this.db.prepare(`
      INSERT INTO expected_programs (part_id, cut_config_id, cut_config_name)
      VALUES (@partId, @cutConfigId, @cutConfigName)
    `);

    const transaction = this.db.transaction(() => {
      insertPart.run({
        id: part.id,
        name: part.name,
        units: part.units,
        localLifecycle: "created",
        toolpathStatus: part.status,
        programId: part.programId,
        programIdsJson: JSON.stringify(part.programIds),
        failureCode: part.failureCode,
        failureReason: part.failureReason,
        createdAt: part.createdAt
      });

      for (const cutConfig of cutConfigs) {
        insertExpected.run({
          partId: part.id,
          cutConfigId: cutConfig.id,
          cutConfigName: cutConfig.name
        });
      }
    });

    transaction();
    return this.getPart(part.id);
  }

  setLocalLifecycle(partId: string, lifecycle: LocalPartLifecycle, failureReason?: string): void {
    this.db
      .prepare(
        `
        UPDATE parts
        SET local_lifecycle = @lifecycle,
            failure_reason = COALESCE(@failureReason, failure_reason)
        WHERE id = @partId
      `
      )
      .run({
        partId,
        lifecycle,
        failureReason: failureReason ?? null
      });
  }

  updateToolpathPart(part: ToolpathPartData, localLifecycle?: LocalPartLifecycle): PartSummary {
    this.db
      .prepare(
        `
        UPDATE parts
        SET name = @name,
            units = @units,
            local_lifecycle = COALESCE(@localLifecycle, local_lifecycle),
            toolpath_status = @toolpathStatus,
            program_id = @programId,
            program_ids_json = @programIdsJson,
            failure_code = @failureCode,
            failure_reason = @failureReason
        WHERE id = @id
      `
      )
      .run({
        id: part.id,
        name: part.name,
        units: part.units,
        localLifecycle: localLifecycle ?? null,
        toolpathStatus: part.status,
        programId: part.programId,
        programIdsJson: JSON.stringify(part.programIds),
        failureCode: part.failureCode,
        failureReason: part.failureReason
      });

    return this.getPart(part.id);
  }

  updatePartProgramIds(partId: string, programIds: string[]): void {
    this.db
      .prepare(
        `
        UPDATE parts
        SET program_ids_json = @programIdsJson
        WHERE id = @partId
      `
      )
      .run({
        partId,
        programIdsJson: JSON.stringify(programIds)
      });
  }

  upsertProgram(program: ProgramSummary): void {
    this.db
      .prepare(
        `
        INSERT INTO programs (
          id, url, part_id, cut_config_id, cut_config_name, status, score,
          setup_count, total_duration_seconds, failure_code, failure_reason, created_at, updated_at
        )
        VALUES (
          @id, @url, @partId, @cutConfigId, @cutConfigName, @status, @score,
          @setupCount, @totalDurationSeconds, @failureCode, @failureReason, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          url = COALESCE(excluded.url, programs.url),
          cut_config_id = COALESCE(excluded.cut_config_id, programs.cut_config_id),
          cut_config_name = COALESCE(excluded.cut_config_name, programs.cut_config_name),
          status = excluded.status,
          score = COALESCE(excluded.score, programs.score),
          setup_count = COALESCE(excluded.setup_count, programs.setup_count),
          total_duration_seconds = COALESCE(excluded.total_duration_seconds, programs.total_duration_seconds),
          failure_code = excluded.failure_code,
          failure_reason = excluded.failure_reason,
          updated_at = excluded.updated_at
      `
      )
      .run({
        id: program.id,
        url: program.url,
        partId: program.partId,
        cutConfigId: program.cutConfigId,
        cutConfigName: program.cutConfigName,
        status: program.status,
        score: program.score,
        setupCount: program.setupCount,
        totalDurationSeconds: program.totalDurationSeconds,
        failureCode: program.failureCode,
        failureReason: program.failureReason,
        createdAt: program.createdAt,
        updatedAt: program.updatedAt
      });
  }

  updateProgramMachinability(report: ProgramMachinabilitySummary): void {
    this.db
      .prepare(
        `
        UPDATE programs
        SET score = @score,
            setup_count = @setupCount,
            total_duration_seconds = @totalDurationSeconds,
            failure_code = @failureCode,
            failure_reason = @failureReason
        WHERE id = @programId AND part_id = @partId
      `
      )
      .run({
        partId: report.partId,
        programId: report.programId,
        score: report.machinabilityScore,
        setupCount: report.setupCount,
        totalDurationSeconds: report.totalDurationSeconds,
        failureCode: report.failureCode,
        failureReason: report.failureReason
      });
  }

  listParts(): PartSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM parts ORDER BY datetime(created_at) DESC")
      .all() as PartRow[];

    return rows.map((row) => this.toPartSummary(row));
  }

  getPart(partId: string): PartSummary {
    const row = this.db.prepare("SELECT * FROM parts WHERE id = ?").get(partId) as PartRow | undefined;

    if (!row) {
      throw new Error(`Part ${partId} was not found`);
    }

    return this.toPartSummary(row);
  }

  listProcessableParts(): PartSummary[] {
    return this.listParts().filter(
      (part) => part.localLifecycle === "processing" || (part.localLifecycle === "ready" && !isPartFullySettled(part))
    );
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        units TEXT NOT NULL,
        local_lifecycle TEXT NOT NULL,
        toolpath_status TEXT NOT NULL,
        program_id TEXT,
        program_ids_json TEXT NOT NULL,
        failure_code TEXT,
        failure_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expected_programs (
        part_id TEXT NOT NULL,
        cut_config_id TEXT NOT NULL,
        cut_config_name TEXT NOT NULL,
        PRIMARY KEY (part_id, cut_config_id),
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        url TEXT,
        part_id TEXT NOT NULL,
        cut_config_id TEXT,
        cut_config_name TEXT,
        status TEXT NOT NULL,
        score REAL,
        setup_count INTEGER,
        total_duration_seconds REAL,
        failure_code TEXT,
        failure_reason TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
      );
    `);
    // Keep migrations additive so existing local demo databases survive code updates.
    this.addColumnIfMissing("programs", "url", "TEXT");
    this.addColumnIfMissing("programs", "setup_count", "INTEGER");
    this.addColumnIfMissing("programs", "total_duration_seconds", "REAL");
  }

  private addColumnIfMissing(tableName: string, columnName: string, columnType: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  }

  private toPartSummary(row: PartRow): PartSummary {
    const expectedRows = this.db
      .prepare("SELECT * FROM expected_programs WHERE part_id = ? ORDER BY rowid ASC")
      .all(row.id) as ExpectedRow[];
    const programRows = this.db
      .prepare("SELECT * FROM programs WHERE part_id = ? ORDER BY datetime(created_at) ASC, id ASC")
      .all(row.id) as ProgramRow[];
    const programs = programRows.map(toProgramSummary);
    const programIds = parseProgramIds(row.program_ids_json);
    const rows = buildDashboardRows(expectedRows, programs, programIds, row.local_lifecycle);
    const scores = programs
      .map((program) => program.score)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

    return {
      id: row.id,
      name: row.name,
      units: row.units,
      localLifecycle: row.local_lifecycle,
      toolpathStatus: row.toolpath_status,
      programId: row.program_id,
      programIds,
      failureCode: row.failure_code,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      averageScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      rows
    };
  }
}

export function isPartFullySettled(part: PartSummary): boolean {
  if (part.failureCode || part.localLifecycle === "failed") {
    return true;
  }

  if (part.rows.length === 0) {
    return false;
  }

  return part.rows.every(
    (row) =>
      row.programId !== null &&
      TERMINAL_PROGRAM_STATUSES.has(String(row.status).toLowerCase()) &&
      (row.score !== null || row.failureReason !== null)
  );
}

function toProgramSummary(row: ProgramRow): ProgramSummary {
  return {
    id: row.id,
    url: row.url,
    partId: row.part_id,
    cutConfigId: row.cut_config_id,
    cutConfigName: row.cut_config_name,
    status: row.status,
    score: row.score,
    setupCount: row.setup_count,
    totalDurationSeconds: row.total_duration_seconds,
    failureCode: row.failure_code,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildDashboardRows(
  expectedRows: ExpectedRow[],
  programs: ProgramSummary[],
  programIds: string[],
  fallbackStatus: LocalPartLifecycle
): ExpectedProgramRow[] {
  const usedProgramIds = new Set<string>();

  return expectedRows.map((expected, index) => {
    const program =
      programs.find((candidate) => candidate.cutConfigId === expected.cut_config_id && !usedProgramIds.has(candidate.id)) ??
      programs.find((candidate) => candidate.id === programIds[index] && !usedProgramIds.has(candidate.id)) ??
      null;

    if (program) {
      usedProgramIds.add(program.id);
    }

    return {
      cutConfigId: expected.cut_config_id,
      cutConfigName: expected.cut_config_name,
      programId: program?.id ?? programIds[index] ?? null,
      programUrl: program?.url ?? null,
      status: program?.status ?? fallbackStatus,
      score: program?.score ?? null,
      setupCount: program?.setupCount ?? null,
      totalDurationSeconds: program?.totalDurationSeconds ?? null,
      failureReason: program?.failureReason ?? null
    };
  });
}

function parseProgramIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
