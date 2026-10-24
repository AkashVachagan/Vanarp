import express from "express";
import fs from "fs";
import crypto from "crypto";
import tokenVerification from "../middleware/tokenVerify.js";

const router = express.Router();
const store = "./git";
const snapshotDir = `${store}/snapshots`;
fs.mkdirSync(snapshotDir, { recursive: true });
function readSnapshot(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const file = `${snapshotDir}/${id}.json`;
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
}
function writeSnapshot(snapshot) {
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.writeFileSync(`${snapshotDir}/${snapshot.snapshot_id}.json`, JSON.stringify(snapshot, null, 2));
}
function usernameFor(userId) {
    const users = JSON.parse(fs.readFileSync("./user/userInfo.json", "utf-8"));
    return users.find((user) => user.user_id === userId)?.name || "User";
}
function authorized(snapshot, userId) {
    return snapshot && (snapshot.owner_user_id === userId || snapshot.access_user_ids.includes(userId));
}
function collectSnapshotTree(nodes, prefix, files, total) {
    return (nodes || []).map((node) => {
        if (node.type === "folder") return { name: node.name, type: "folder", content: collectSnapshotTree(node.content, [...prefix, node.name], files, total) };
        const content = fs.readFileSync(`./codes/${node.file_id}.txt`, "utf-8");
        total.size += Buffer.byteLength(content);
        if (total.size > 20 * 1024 * 1024) throw new Error("This project exceeds the 20 MB snapshot limit");
        files.push({ path: [...prefix, node.name], content });
        return { name: node.name, type: "file" };
    });
}
function visibleSummary(snapshot, userId) {
    return {
        snapshot_id: snapshot.snapshot_id,
        owner_user_id: snapshot.owner_user_id,
        owner_username: snapshot.owner_username,
        created_at: snapshot.created_at,
        file_count: snapshot.files.length,
        files: snapshot.files.map((file) => file.path.join("/")),
        access_user_ids: snapshot.owner_user_id === userId ? snapshot.access_user_ids : undefined,
        can_manage: snapshot.owner_user_id === userId
    };
}

router.get("/", tokenVerification, (req, res) => {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const snapshots = fs.readdirSync(snapshotDir).filter((name) => name.endsWith(".json")).map((name) => {
        try { return JSON.parse(fs.readFileSync(`${snapshotDir}/${name}`, "utf-8")); } catch { return null; }
    }).filter((snapshot) => authorized(snapshot, req.user_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return res.json({ snapshots: snapshots.map((snapshot) => visibleSummary(snapshot, req.user_id)) });
});

router.post("/push", tokenVerification, (req, res) => {
    const treePath = `./file-tree/${req.user_id}.json`;
    if (!fs.existsSync(treePath)) return res.status(404).json({ error: "File tree not found" });
    try {
        const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));
        const files = [];
        const snapshotTree = collectSnapshotTree(tree.content, [], files, { size: 0 });
        const snapshot = {
            snapshot_id: crypto.randomUUID(),
            owner_user_id: req.user_id,
            owner_username: usernameFor(req.user_id),
            created_at: new Date().toISOString(),
            access_user_ids: [],
            tree: snapshotTree,
            files
        };
        writeSnapshot(snapshot);
        return res.status(201).json({ snapshot: visibleSummary(snapshot, req.user_id) });
    } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.get("/:snapshotId", tokenVerification, (req, res) => {
    const snapshot = readSnapshot(req.params.snapshotId);
    if (!authorized(snapshot, req.user_id)) return res.status(snapshot ? 403 : 404).json({ error: snapshot ? "Access denied" : "Snapshot not found" });
    return res.json({ snapshot: { ...visibleSummary(snapshot, req.user_id), tree: snapshot.tree, files: snapshot.files } });
});

router.put("/:snapshotId/access", tokenVerification, (req, res) => {
    const snapshot = readSnapshot(req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ error: "Snapshot not found" });
    if (snapshot.owner_user_id !== req.user_id) return res.status(403).json({ error: "Only the owner can share this snapshot" });
    const sessionId = String(req.body?.session_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !fs.existsSync(`./sessions/${sessionId}.json`)) return res.status(400).json({ error: "Join a session before sharing a snapshot" });
    const session = JSON.parse(fs.readFileSync(`./sessions/${sessionId}.json`, "utf-8"));
    if (!session.members.some((member) => member.user_id === req.user_id)) return res.status(403).json({ error: "You are not a member of this session" });
    const requested = Array.isArray(req.body?.user_ids) ? req.body.user_ids : [];
    if (requested.some((id) => !session.members.some((member) => member.user_id === id))) return res.status(400).json({ error: "Share access only with members of this session" });
    snapshot.access_user_ids = [...new Set(requested.filter((id) => id !== req.user_id))];
    writeSnapshot(snapshot);
    return res.json({ message: "Snapshot access updated", access_user_ids: snapshot.access_user_ids });
});

router.post("/:snapshotId/copy-root", tokenVerification, (req, res) => {
    const snapshot = readSnapshot(req.params.snapshotId);
    if (!authorized(snapshot, req.user_id)) return res.status(snapshot ? 403 : 404).json({ error: snapshot ? "Access denied" : "Snapshot not found" });
    const treePath = `./file-tree/${req.user_id}.json`;
    if (!fs.existsSync(treePath)) return res.status(404).json({ error: "File tree not found" });
    const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));
    const hasCurrentFiles = tree.content.length > 0;
    const backupName = String(req.body?.backup_name || "").trim();
    if (hasCurrentFiles && !/^[A-Za-z0-9]+$/.test(backupName)) return res.status(400).json({ error: "Enter a backup folder name using letters and numbers" });
    if (hasCurrentFiles && tree.content.some((node) => node.name === backupName)) return res.status(409).json({ error: "A file or folder already uses that backup name" });

    const usedNames = new Set(tree.content.map((node) => node.name));
    const safeOwnerName = snapshot.owner_username.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "User";
    const baseName = `copied from ${safeOwnerName}`;
    let copiedName = baseName;
    for (let suffix = 2; usedNames.has(copiedName); suffix++) copiedName = `${baseName} ${suffix}`;
    const currentUserId = req.user_id;
    const writtenCodes = [];
    const fileContents = new Map(snapshot.files.map((file) => [JSON.stringify(file.path), file.content]));
    const copyNodes = (nodes, prefix = []) => (nodes || []).map((node) => {
        if (node.type === "folder") return { name: node.name, type: "folder", content: copyNodes(node.content, [...prefix, node.name]) };
        const filePath = [...prefix, node.name];
        const fileId = `${currentUserId}-${crypto.randomUUID()}`;
        fs.writeFileSync(`./codes/${fileId}.txt`, fileContents.get(JSON.stringify(filePath)) || "");
        writtenCodes.push(fileId);
        return { name: node.name, type: "file", file_id: fileId };
    });

    try {
        const copiedTree = { name: copiedName, type: "folder", content: copyNodes(snapshot.tree) };
        const previousContent = tree.content;
        tree.content = hasCurrentFiles ? [{ name: backupName, type: "folder", content: previousContent }] : [];
        tree.content.push(copiedTree);
        fs.writeFileSync(treePath, JSON.stringify(tree, null, 2));
        return res.json({ message: "Root copied", backup_name: hasCurrentFiles ? backupName : null, copied_folder: copiedName });
    } catch (error) {
        for (const fileId of writtenCodes) { try { fs.unlinkSync(`./codes/${fileId}.txt`); } catch {} }
        return res.status(500).json({ error: `Could not copy snapshot: ${error.message}` });
    }
});

export default router;
