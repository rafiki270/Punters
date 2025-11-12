# Backup & Restore Specification

This document is the source of truth for everything related to exporting and restoring Punters data.

## Artifacts

There are two admin endpoints:

| Endpoint | File | Purpose |
| --- | --- | --- |
| `GET /api/admin/backup/db` | `punters-backup-*.db` | Raw SQLite file for quick snapshots or debugging. |
| `GET /api/admin/backup/zip` | `punters-backup-*.zip` | Canonical full backup. Contains the SQLite database plus all media payloads. |

Always prefer the ZIP. It is self-describing, versioned, and resilient against future changes (for example moving media outside of SQLite).

## ZIP layout (format v1)

```
/manifest.json            # format + integrity metadata (see below)
/database.db              # byte-for-byte SQLite database
/images/<id>-<filename>   # binary payloads for every Asset row (filenames sanitized)
```

Notes:
- `database.db` is always present so the archive can be restored without extra tooling.
- `images/*` assets duplicate what already lives in SQLite (`Asset.data`). They future-proof the format in case assets move to the filesystem or object storage later.

### Manifest schema

`manifest.json` is UTF-8 JSON with this shape:

```json
{
  "formatVersion": 1,
  "generatedAt": "2024-07-01T12:34:56.000Z",
  "generator": "punters@0.1.0",
  "database": {
    "engine": "sqlite",
    "filename": "database.db",
    "sizeBytes": 123456,
    "sha256": "…"
  },
  "assets": {
    "directory": "images",
    "totalBytes": 4242,
    "files": [
      {
        "id": 12,
        "filename": "logo.png",
        "path": "images/12-logo.png",
        "sizeBytes": 2048,
        "sha256": "…"
      }
    ]
  }
}
```

Rules:
- Every binary payload that ships inside the archive has a SHA-256 checksum so we can detect corruption during restore.
- Paths inside `assets.files[].path` MUST match the actual entry names in the ZIP.
- Always bump `formatVersion` and extend (never break) the manifest when adding future payloads.

## Restore pipeline

1. Admin UI lets the operator pick either a `.zip` (preferred) or `.db` file. The input now accepts both.
2. `POST /api/admin/restore/db` uploads the file as multipart form data.
3. The server:
   - Reads the stream into memory (fastify enforces a size limit).
   - Detects whether the payload is a ZIP or raw SQLite file.
   - For ZIPs, parses entries, validates the manifest, and verifies SHA-256 for `database.db`.
   - Writes the validated database to a temp file, swaps it into place atomically, and reconnects Prisma.
4. The UI reloads the app after a successful restore.

If any validation fails (missing manifest, hash mismatch, invalid SQLite header, etc.) the server returns HTTP 400 with a reason string that the UI now surfaces.

## Operational guidance

- Store backups off the device running Punters. The manifest makes it easy to audit what a ZIP contains without unpacking it: `jq '.' manifest.json`.
- You can verify integrity manually by hashing files and comparing them with `manifest.json`.
- When migrating to a new machine, restore using the ZIP so that future asset locations (filesystem, CDN, …) can be reconstructed.
- Keep the `Docs/backup.md` file in sync whenever you add new payloads, manifest fields, or endpoints.

## Extending the format

1. Add new fields rather than changing existing ones so older restorers continue to work.
2. Store any new binary artifacts inside the ZIP and reference them from `manifest.json`.
3. Update the automated tests in `tests/backup.archive.test.ts` to cover the new behavior.
4. Mention the change in this document and in `AGENTS.md` if it alters coordination between agents.
