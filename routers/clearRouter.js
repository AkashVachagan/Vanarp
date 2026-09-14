import express from "express";
import fs from "fs";

const router = express.Router();

router.put("/", (req, res) => {
    fs.rmSync("./codes", {recursive : true});
    fs.rmSync("./file-tree", {recursive : true});
    fs.rmSync("./jwt", {recursive : true});
    fs.rmSync("./user", {recursive: true});
    fs.rmSync("./ai-chat-log", {recursive: true, force: true});

    console.log("server database cleared");
    return res.status(200).json({
        message: "server database cleared"
    });
});

export default router;