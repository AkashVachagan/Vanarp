import express from "express";
import fs from "fs";
import registerRouter from "./routers/registerRouter.js";
import fileRouter from "./routers/fileRouter.js";
import folderRouter from "./routers/folderRouter.js";
import clearRouter from "./routers/clearRouter.js";
import aiRouter from "./routers/aiRouter.js";
import runRouter from "./routers/runRouter.js";
import sessionRouter from "./routers/sessionRouter.js";
import gitRouter from "./routers/gitRouter.js";

const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:5173");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.use(express.text());
app.use(express.json());

app.use("/user", registerRouter);

app.use("/file", fileRouter);

app.use("/run", runRouter);

app.use("/session", sessionRouter);

app.use("/git", gitRouter);

app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "gcode-backend" }));

app.use("/ai", aiRouter);

app.use("/folder", folderRouter);

app.use("/clear", clearRouter);

app.listen(3000, (req, res) => {
    fs.mkdirSync("./codes", {recursive : true});
    fs.mkdirSync("./file-tree", {recursive : true});
    fs.mkdirSync("./user", {recursive : true});
    fs.mkdirSync("./jwt", {recursive : true});
    fs.mkdirSync("./ai-chat-log", {recursive : true});
    fs.mkdirSync("./sessions", {recursive : true});
    fs.mkdirSync("./git/snapshots", {recursive : true});

    if (!fs.existsSync("./user/userInfo.json")){
        fs.writeFileSync("./user/userInfo.json", JSON.stringify([], null, 2));
    }
    if (!fs.existsSync("./jwt/token.json")){
        fs.writeFileSync("./jwt/token.json", JSON.stringify([], null, 2));
    }

    console.log("server successfully started with code runner at POST /run/*path");
});
