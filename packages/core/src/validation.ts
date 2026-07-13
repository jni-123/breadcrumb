import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

import type {
  BreadcrumbManifest,
  BreadcrumbReport,
  BreadcrumbReportInput,
  RepositoryManifest,
  ValidationResult,
} from "./types.js";

const loadSchema = (name: string): object => {
  const candidates = [
    new URL(`../../../protocol/schemas/${name}`, import.meta.url),
    new URL(`../schemas/${name}`, import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(
        readFileSync(fileURLToPath(candidate), "utf8"),
      ) as object;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Breadcrumb schema not found: ${name}`);
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("uri", {
  type: "string",
  validate: (value: string): boolean => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
});

const reportValidator = ajv.compile(loadSchema("report-0.1.schema.json"));
const manifestValidator = ajv.compile(loadSchema("manifest-0.1.schema.json"));
const repositoryValidator = ajv.compile(
  loadSchema("repository-0.1.schema.json"),
);

const formatErrors = (errors: ErrorObject[] | null | undefined): string[] =>
  (errors ?? []).map((error) =>
    `${error.instancePath || "/"} ${error.message ?? "is invalid"}`.trim(),
  );

const result = (
  validator: ValidateFunction,
  value: unknown,
): ValidationResult => ({
  valid: validator(value),
  errors: formatErrors(validator.errors),
});

export const validateReport = (value: unknown): ValidationResult =>
  result(reportValidator, value);

export const validateManifest = (value: unknown): ValidationResult =>
  result(manifestValidator, value);

export const validateRepositoryManifest = (value: unknown): ValidationResult =>
  result(repositoryValidator, value);

export const isBreadcrumbReportInput = (
  value: unknown,
): value is BreadcrumbReportInput => reportValidator(value);

export const isBreadcrumbReport = (value: unknown): value is BreadcrumbReport =>
  reportValidator(value) &&
  typeof value === "object" &&
  value !== null &&
  "deduplication" in value;

export const isBreadcrumbManifest = (
  value: unknown,
): value is BreadcrumbManifest => manifestValidator(value);

export const isRepositoryManifest = (
  value: unknown,
): value is RepositoryManifest => repositoryValidator(value);
