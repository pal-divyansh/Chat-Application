import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer } from 'vite';
import { Server } from 'http';
import { nanoid } from "nanoid";

export async function createViteServer(httpServer: Server) {
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer
      },
      watch: {
        usePolling: true,
        interval: 100
      }
    },
    appType: 'custom'
  });

  return vite;
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer(server);
  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
