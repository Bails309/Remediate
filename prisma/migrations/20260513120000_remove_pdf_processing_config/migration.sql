-- Drop the external PDF Processing API configuration. The pentest PDF pipeline now
-- exclusively uses the in-process Trustmarque parser (`lib/pentest-pdf-builtin.ts`); the
-- table, the processor enum, and the auth-scheme enum are no longer referenced anywhere in
-- the codebase.
DROP TABLE IF EXISTS "PdfProcessingConfig";
DROP TYPE IF EXISTS "PdfProcessor";
DROP TYPE IF EXISTS "PdfApiAuthScheme";
