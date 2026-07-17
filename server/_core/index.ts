import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "../auth";
import { appRouter } from "../routers";
import { supabase } from "../supabase";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function isFiniteOrNull(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCallbackRows(rows: unknown): Array<{ category: string; actual: number | null; budget: number | null }> {
  if (!Array.isArray(rows)) {
    throw new Error("Expected an array of financial rows.");
  }

  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      throw new Error("Invalid financial row object.");
    }

    const src = row as Record<string, unknown>;
    const category = typeof src.category === "string" ? src.category.trim() : "";
    if (!category) {
      throw new Error("Each financial row must include a non-empty category.");
    }

    const actual = src.actual === undefined ? null : src.actual;
    const budget = src.budget === undefined ? null : src.budget;

    if (!isFiniteOrNull(actual) || !isFiniteOrNull(budget)) {
      throw new Error("Financial row values must be finite numbers or null.");
    }

    return {
      category,
      actual,
      budget,
    };
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

  // Supabase email+password auth routes
  registerAuthRoutes(app);

  app.post("/api/financials/import-result", express.json({ limit: "256kb" }), async (req, res) => {
    try {
      const secretHeader = String(req.header("X-Kynli-Webhook-Secret") || "").trim();
      const expectedSecret = String(process.env.N8N_FINANCIAL_IMPORT_WEBHOOK_SECRET || "").trim();

      if (!expectedSecret || !secretHeader || secretHeader !== expectedSecret) {
        return res.status(401).json({ received: false });
      }

      if (!req.is("application/json")) {
        return res.status(400).json({ received: false });
      }

      const body = req.body as Record<string, unknown>;
      const importId = typeof body.import_id === "string" ? body.import_id.trim() : "";
      const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!importId || !uuidRegex.test(importId)) {
        return res.status(400).json({ received: false });
      }

      const { data: job, error: jobError } = await supabase
        .from("financial_import_jobs")
        .select("id, import_id, tenant_slug, month, year, status")
        .eq("import_id", importId)
        .maybeSingle();

      if (jobError) return res.status(500).json({ received: false });
      if (!job) return res.status(404).json({ received: false });

      if (status === "failed") {
        if (String(job.status || "") === "ready_for_review") {
          return res.status(200).json({ received: true });
        }

        const safeError = typeof body.error_message === "string"
          ? body.error_message.slice(0, 1000)
          : "Unable to extract financial data.";

        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("financial_import_jobs")
          .update({
            status: "failed",
            error_message: safeError,
            completed_at: now,
            updated_at: now,
          })
          .eq("import_id", importId);

        if (updateError) return res.status(500).json({ received: false });
        return res.status(200).json({ received: true });
      }

      if (status !== "completed") {
        return res.status(400).json({ received: false });
      }

      const businessSlug = typeof body.business_slug === "string" ? body.business_slug.trim() : "";
      const month = body.month;
      const year = body.year;

      if (!businessSlug || businessSlug !== String(job.tenant_slug || "")) {
        return res.status(400).json({ received: false });
      }
      if (typeof month !== "number" || !Number.isInteger(month) || month !== Number(job.month)) {
        return res.status(400).json({ received: false });
      }
      if (typeof year !== "number" || !Number.isInteger(year) || year !== Number(job.year)) {
        return res.status(400).json({ received: false });
      }

      let incomeSources: Array<{ category: string; actual: number | null; budget: number | null }>;
      let expenses: Array<{ category: string; actual: number | null; budget: number | null }>;
      try {
        incomeSources = normalizeCallbackRows(body.income_sources);
        expenses = normalizeCallbackRows(body.expenses);
      } catch {
        return res.status(400).json({ received: false });
      }

      const notesRaw = body.notes;
      const notes = notesRaw == null ? null : (typeof notesRaw === "string" ? notesRaw : undefined);
      if (notesRaw !== undefined && notes === undefined) {
        return res.status(400).json({ received: false });
      }

      const hasFinancialSummaryField = Object.prototype.hasOwnProperty.call(body, "financial_summary");
      const financialSummaryRaw = body.financial_summary;
      const financialSummaryType = financialSummaryRaw === null ? "null" : typeof financialSummaryRaw;
      const financialSummary =
        financialSummaryRaw == null
          ? ""
          : typeof financialSummaryRaw === "string"
            ? financialSummaryRaw.trim()
            : undefined;
      if (financialSummary === undefined) {
        console.info("[financials.import-result] invalid financial_summary", {
          importId,
          status,
          hasFinancialSummaryField,
          financialSummaryType,
          normalizedFinancialSummaryLength: null,
        });
        return res.status(400).json({ received: false });
      }
      if (financialSummary.length > 10_000) {
        console.info("[financials.import-result] financial_summary too long", {
          importId,
          status,
          hasFinancialSummaryField,
          financialSummaryType,
          normalizedFinancialSummaryLength: financialSummary.length,
        });
        return res.status(400).json({ received: false });
      }

      const normalized = {
        incomeSources,
        expenses,
        financialSummary,
        notes: (notes ?? "").trim(),
      };

      console.info("[financials.import-result] normalized payload", {
        importId,
        status,
        hasFinancialSummaryField,
        financialSummaryType,
        normalizedFinancialSummaryLength: financialSummary.length,
      });

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("financial_import_jobs")
        .update({
          status: "ready_for_review",
          extracted_data: normalized,
          error_message: null,
          completed_at: now,
          updated_at: now,
        })
        .eq("import_id", importId);

      if (updateError) return res.status(500).json({ received: false });

      const initialSummary = financialSummary;
      if (initialSummary) {
        const { data: existingVersion } = await supabase
          .from("financial_summary_versions")
          .select("id")
          .eq("import_id", importId)
          .limit(1)
          .maybeSingle();

        if (!existingVersion) {
          await supabase
            .from("financial_summary_versions")
            .insert({
              import_id: importId,
              tenant_slug: String(job.tenant_slug || "").trim(),
              version_number: 1,
              summary: initialSummary,
              change_source: "initial_extraction",
              created_by_user_id: null,
              created_by_role: "system",
            });
        }
      }

      return res.status(200).json({ received: true });
    } catch {
      return res.status(500).json({ received: false });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
