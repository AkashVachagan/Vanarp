import express from "express";
import fs from "fs";

const router = express.Router();

// initializes file tree
router.get("/", (req, res) => {
    const template = {
        name: "root",
        type: "folder",
        content: []
    };

    fs.mkdirSync("./file-tree", {recursive : true});
    fs.mkdirSync("./codes", {recursive: true});

    fs.writeFileSync("./file-tree/tree.json", JSON.stringify(template, null, 2));
    console.log("File Tree has been initialized");

    return res.status(201).json({
        message: "File Tree has been initialized"
    });
});

export default router;