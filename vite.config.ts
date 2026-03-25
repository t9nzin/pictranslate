import { defineConfig } from "vite";
import { resolve } from "path";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "content-script": resolve(__dirname, "src/content/content-script.ts"),
        offscreen: resolve(__dirname, "src/offscreen/offscreen.ts"),
        popup: resolve(__dirname, "src/popup/popup.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "assets/[name].[ext]",
        format: "es",
      },
    },
    target: "esnext",
    minify: false,
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    {
      name: "copy-extension-files",
      closeBundle() {
        const dist = resolve(__dirname, "dist");

        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(dist, "manifest.json")
        );

        // Copy popup.html
        copyFileSync(
          resolve(__dirname, "src/popup/popup.html"),
          resolve(dist, "popup.html")
        );

        // Copy offscreen.html
        copyFileSync(
          resolve(__dirname, "src/offscreen/offscreen.html"),
          resolve(dist, "offscreen.html")
        );

        // Copy icons
        const iconsSrc = resolve(__dirname, "public/icons");
        const iconsDest = resolve(dist, "icons");
        if (existsSync(iconsSrc)) {
          copyDir(iconsSrc, iconsDest);
        }

        // Copy content.css
        mkdirSync(resolve(dist, "assets"), { recursive: true });
        copyFileSync(
          resolve(__dirname, "src/content/content.css"),
          resolve(dist, "assets/content.css")
        );

        // Copy popup.css
        copyFileSync(
          resolve(__dirname, "src/popup/popup.css"),
          resolve(dist, "popup.css")
        );

        // Copy Tesseract.js worker, core, and language data
        const tesseractDir = resolve(dist, "tesseract");
        mkdirSync(tesseractDir, { recursive: true });

        copyFileSync(
          resolve(__dirname, "node_modules/tesseract.js/dist/worker.min.js"),
          resolve(tesseractDir, "worker.min.js")
        );
        copyFileSync(
          resolve(__dirname, "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js"),
          resolve(tesseractDir, "tesseract-core-simd-lstm.wasm.js")
        );
        copyFileSync(
          resolve(__dirname, "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm"),
          resolve(tesseractDir, "tesseract-core-simd-lstm.wasm")
        );

        // Copy language data (gzipped traineddata)
        const langDir = resolve(tesseractDir, "lang-data");
        mkdirSync(langDir, { recursive: true });
        const langs = ["eng", "kor", "jpn", "chi_sim"];
        for (const lang of langs) {
          copyFileSync(
            resolve(__dirname, `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`),
            resolve(langDir, `${lang}.traineddata.gz`)
          );
        }

        // Inline shared chunks into entry files that need them
        // Content scripts can't use ES module imports
        inlineImports(dist);

        console.log("Extension files copied to dist/");
      },
    },
  ],
});

/**
 * Inline any `import { ... } from './path'` statements by replacing them
 * with the actual exported values from the chunk files, then remove chunks.
 */
function inlineImports(dist: string) {
  const entries = ["content-script.js", "popup.js", "offscreen.js", "service-worker.js"];

  for (const entry of entries) {
    const filePath = resolve(dist, entry);
    if (!existsSync(filePath)) continue;

    let code = readFileSync(filePath, "utf-8");

    // Find all import statements like: import { X as Y } from './assets/foo.js';
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?\n?/g;
    let match;

    while ((match = importRegex.exec(code)) !== null) {
      const importClause = match[1];
      const importPath = match[2];
      const chunkPath = resolve(dist, importPath);

      if (!existsSync(chunkPath)) continue;

      const chunkCode = readFileSync(chunkPath, "utf-8");

      // Parse import bindings: "D as DEFAULT_SETTINGS" -> { D: "DEFAULT_SETTINGS" }
      const bindings = importClause.split(",").map((b) => {
        const parts = b.trim().split(/\s+as\s+/);
        return { exported: parts[0].trim(), local: (parts[1] || parts[0]).trim() };
      });

      // Extract the exported values from the chunk
      // Chunks typically look like: const X = { ... }; export { X as D };
      let inlinedCode = chunkCode
        // Remove export statements
        .replace(/export\s*\{[^}]*\}\s*;?\n?/g, "")
        .trim();

      // Rename exported names to local names used in the importing file
      for (const binding of bindings) {
        // Find the original variable name in the chunk's export
        const exportMatch = chunkCode.match(
          new RegExp(`export\\s*\\{\\s*([\\w]+)\\s+as\\s+${binding.exported}\\s*\\}`)
        );
        const originalName = exportMatch ? exportMatch[1] : binding.exported;

        if (originalName !== binding.local) {
          // Replace the variable declaration name
          inlinedCode = inlinedCode.replace(
            new RegExp(`(const|let|var)\\s+${originalName}\\b`),
            `$1 ${binding.local}`
          );
        }
      }

      // Replace the import statement with the inlined code
      code = code.replace(match[0], inlinedCode + "\n");
    }

    writeFileSync(filePath, code);
  }
}
