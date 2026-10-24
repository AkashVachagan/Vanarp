import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { promisify } from "util";
import tokenVerification from "../middleware/tokenVerify.js";

const router = express.Router();
const mkdtemp = promisify(fs.mkdtemp);
const rm = promisify(fs.rm);
const MAX_OUTPUT = 512 * 1024;
const TIMEOUT_MS = 5000;

function execute(command, args, cwd) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd,
            env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: cwd, LANG: "C.UTF-8" },
            stdio: ["ignore", "pipe", "pipe"],
            detached: true
        });
        let stdout = "";
        let stderr = "";
        let size = 0;
        let timedOut = false;
        let capped = false;
        const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
        const timer = setTimeout(() => { timedOut = true; stop(); }, TIMEOUT_MS);
        const collect = (target) => (chunk) => {
            size += chunk.length;
            if (size > MAX_OUTPUT) { capped = true; stop(); return; }
            if (target === "stdout") stdout += chunk.toString();
            else stderr += chunk.toString();
        };
        child.stdout.on("data", collect("stdout"));
        child.stderr.on("data", collect("stderr"));
        child.on("error", (error) => { clearTimeout(timer); resolve({ stdout, stderr: `${stderr}${error.message}\n`, exitCode: 1, timedOut, capped }); });
        child.on("close", (exitCode) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, exitCode, timedOut, capped });
        });
    });
}

router.post("/*path", tokenVerification, async (req, res) => {
    const userId = req.user_id;
    const filePath = req.params.path;
    const treePath = `./file-tree/${userId}.json`;
    if (!fs.existsSync(treePath)) return res.status(404).json({ error: "File tree not found" });
    let current = JSON.parse(fs.readFileSync(treePath, "utf-8"));
    for (const folderName of filePath.slice(0, -1)) {
        current = current.content?.find((entry) => entry.name === folderName && entry.type === "folder");
        if (!current) return res.status(404).json({ error: "File not found" });
    }
    const file = current.content?.find((entry) => entry.name === filePath.at(-1) && entry.type === "file");
    if (!file) return res.status(404).json({ error: "File not found" });

    const extension = path.extname(file.name).toLowerCase();
    const runners = {
        ".js": (dir) => [process.execPath, [path.join(dir, "main.js")]],
        ".mjs": (dir) => [process.execPath, [path.join(dir, "main.mjs")]],
        ".py": (dir) => ["python3", ["-I", path.join(dir, "main.py")]],
        ".c": (dir) => ["gcc", ["main.c", "-O0", "-std=c11", "-o", "program"]],
        ".cpp": (dir) => ["g++", ["main.cpp", "-O0", "-std=c++17", "-o", "program"]]
    };
    if (!runners[extension]) return res.status(400).json({ error: "Run supports .js, .mjs, .py, .c, and .cpp files" });

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "gcode-run-"));
    try {
        const sourceName = extension === ".mjs" ? "main.mjs" : `main${extension}`;
        const code = typeof req.body?.code === "string" ? req.body.code : fs.readFileSync(`./codes/${file.file_id}.txt`, "utf-8");
        fs.writeFileSync(path.join(tempDir, sourceName), code, { mode: 0o600 });
        if (extension === ".c" || extension === ".cpp") {
            const [compiler, args] = runners[extension](tempDir);
            const compiled = await execute(compiler, args, tempDir);
            if (compiled.exitCode !== 0 || compiled.timedOut || compiled.capped) {
                return res.json({ output: compiled.stdout, error: compiled.stderr, exitCode: compiled.exitCode, timedOut: compiled.timedOut, outputLimit: compiled.capped });
            }
            const result = await execute(path.join(tempDir, "program"), [], tempDir);
            return res.json({ output: result.stdout, error: result.stderr, exitCode: result.exitCode, timedOut: result.timedOut, outputLimit: result.capped });
        }
        const [command, args] = runners[extension](tempDir);
        const result = await execute(command, args, tempDir);
        return res.json({ output: result.stdout, error: result.stderr, exitCode: result.exitCode, timedOut: result.timedOut, outputLimit: result.capped });
    } catch (error) {
        return res.status(500).json({ error: `Could not run file: ${error.message}` });
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

export default router;
