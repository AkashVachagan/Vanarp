import express from "express";
import fs from "fs";
import crypto from "crypto";
import tokenVerification from "../middleware/tokenVerify.js";

const router = express.Router();
const sessionsDir = "./sessions";
fs.mkdirSync(sessionsDir, { recursive: true });

function usernameFor(userId) {
    const users = JSON.parse(fs.readFileSync("./user/userInfo.json", "utf-8"));
    return users.find((user) => user.user_id === userId)?.name || "User";
}
function validId(id) { return /^[0-9a-f-]{36}$/i.test(id); }
function loadSession(id) {
    if (!validId(id)) return null;
    const file = `${sessionsDir}/${id}.json`;
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
}
function saveSession(session) {
    fs.writeFileSync(`${sessionsDir}/${session.session_id}.json`, JSON.stringify(session, null, 2));
}
function memberRequired(req, res, next) {
    const session = loadSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (!session.members.some((member) => member.user_id === req.user_id)) return res.status(403).json({ error: "You are not a member of this session" });
    req.session = session;
    next();
}
function collectFiles(nodes, result = []) {
    for (const node of nodes || []) {
        if (node.type === "file") result.push(node);
        else if (node.type === "folder") collectFiles(node.content, result);
    }
    return result;
}

router.post("/create", tokenVerification, (req, res) => {
    const sessionId = crypto.randomUUID();
    const session = {
        session_id: sessionId,
        created_at: new Date().toISOString(),
        members: [{ user_id: req.user_id, username: usernameFor(req.user_id), joined_at: new Date().toISOString() }],
        messages: [],
        deliveries: []
    };
    saveSession(session);
    return res.status(201).json({ session_id: sessionId, members: session.members });
});

router.post("/join", tokenVerification, (req, res) => {
    const sessionId = String(req.body?.session_id || "").trim();
    const session = loadSession(sessionId);
    if (!session) return res.status(404).json({ error: "Session code not found" });
    if (!session.members.some((member) => member.user_id === req.user_id)) {
        session.members.push({ user_id: req.user_id, username: usernameFor(req.user_id), joined_at: new Date().toISOString() });
        saveSession(session);
    }
    return res.status(200).json({ session_id: session.session_id, members: session.members });
});

router.get("/:sessionId", tokenVerification, memberRequired, (req, res) => {
    const { session_id, members, messages, call_room } = req.session;
    return res.json({ session_id, current_user_id: req.user_id, members, messages, call_room: call_room || null });
});

router.post("/:sessionId/call", tokenVerification, memberRequired, (req, res) => {
    if (!req.session.call_room) {
        req.session.call_room = `gcode-${crypto.randomUUID()}`;
        saveSession(req.session);
    }
    return res.json({ room_name: req.session.call_room, meeting_url: `https://meet.jit.si/${req.session.call_room}` });
});

router.post("/:sessionId/leave", tokenVerification, memberRequired, (req, res) => {
    req.session.members = req.session.members.filter((member) => member.user_id !== req.user_id);
    saveSession(req.session);
    return res.json({ message: "Left session" });
});

router.post("/:sessionId/chat", tokenVerification, memberRequired, (req, res) => {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (message.length > 4000) return res.status(400).json({ error: "Message is too long (4000 character limit)" });
    const entry = { message_id: crypto.randomUUID(), user_id: req.user_id, username: usernameFor(req.user_id), message, sent_at: new Date().toISOString() };
    req.session.messages.push(entry);
    saveSession(req.session);
    return res.status(201).json(entry);
});

router.post("/:sessionId/send-code", tokenVerification, memberRequired, (req, res) => {
    const recipients = [...new Set(Array.isArray(req.body?.recipients) ? req.body.recipients : [])]
        .filter((id) => id !== req.user_id && req.session.members.some((member) => member.user_id === id));
    const requestedIds = [...new Set(Array.isArray(req.body?.file_ids) ? req.body.file_ids : [])];
    if (!recipients.length) return res.status(400).json({ error: "Choose at least one other session member" });
    if (!requestedIds.length) return res.status(400).json({ error: "Choose at least one file" });
    if (requestedIds.length > 20) return res.status(400).json({ error: "You can send up to 20 files at a time" });

    const treePath = `./file-tree/${req.user_id}.json`;
    if (!fs.existsSync(treePath)) return res.status(404).json({ error: "File tree not found" });
    const tree = JSON.parse(fs.readFileSync(treePath, "utf-8"));
    const ownedFiles = collectFiles(tree.content);
    const files = requestedIds.map((id) => ownedFiles.find((file) => file.file_id === id));
    if (files.some((file) => !file)) return res.status(403).json({ error: "One or more selected files do not belong to you" });

    const codeFiles = files.map((file) => ({ fileName: file.name, file_id: file.file_id, content: fs.readFileSync(`./codes/${file.file_id}.txt`, "utf-8") }));
    if (codeFiles.some((file) => file.content.length > 500_000)) return res.status(413).json({ error: "A selected file is too large to send" });
    const senderName = usernameFor(req.user_id);
    for (const recipientId of recipients) {
        req.session.deliveries.push({ delivery_id: crypto.randomUUID(), sender_id: req.user_id, sender_name: senderName, recipient_id: recipientId, files: codeFiles, sent_at: new Date().toISOString() });
    }
    saveSession(req.session);
    return res.status(201).json({ message: "Code sent", recipient_count: recipients.length, file_count: codeFiles.length });
});

router.get("/:sessionId/received", tokenVerification, memberRequired, (req, res) => {
    const deliveries = req.session.deliveries.filter((delivery) => delivery.recipient_id === req.user_id);
    return res.json({ deliveries });
});

export default router;
