import express, { raw } from "express";
import fs from "fs";

const router = express.Router();

// creates a folder
router.post("/*path", (req, res) => {
    const folderPath = req.params.path;
    const fileContentString = fs.readFileSync("./file-tree/tree.json", "utf-8");
    const fileContent = JSON.parse(fileContentString)
    let current = fileContent;

    if (!/^[A-Za-z0-9]+$/.test(folderPath[folderPath.length - 1])){
        console.log("Invalid folder name");
        return res.status(400).json({
            error: "Folder Name is invalid"
        });
    }

    for (let i = 0; i < folderPath.length - 1; i++){
        current = current.content.find(child => (child.name === folderPath[i] && child.type === "folder"));
        if (!current){
            console.log("Folder Path is invalid");
            return res.status(400).json({
                error: "Folder Path is invalid"
            });
        }
    }

    if (current.content.find(child => (child.name === folderPath[folderPath.length - 1] && child.type === "folder"))){
        console.log("Folder already exists");
        return res.status(409).json({
            error: "Folder already exists"
        });
    }

    const template = {
        name: folderPath[folderPath.length - 1],
        type: "folder",
        content: []
    };

    current.content.push(template);

    fs.writeFileSync("./file-tree/tree.json", JSON.stringify(fileContent, null, 2));

    console.log("Folder has been created");
    return res.status(201).json({
        message: "Folder has been created"
    });
});

// deletes a folder
router.delete("/*path", (req, res) => {
    const folderPath = req.params.path;
    const fileContentString = fs.readFileSync("./file-tree/tree.json", "utf-8");
    const fileContent = JSON.parse(fileContentString)
    let current = fileContent;

    for (let i = 0; i < folderPath.length - 1; i++){
        current = current.content.find(child => (child.name === folderPath[i] && child.type === "folder"));
        if (!current){
            console.log("Folder Path is invalid");
            return res.status(400).json({
                error: "Folder Path is invalid"
            });
        }
    }

    const folderObject = current.content.find(child => (child.name === folderPath[folderPath.length - 1] && child.type === "folder"));

    if (!folderObject){
        console.log("Folder doesn't exist");
        return res.status(400).json({
            error: "Folder doesn't exist"
        });
    }
    else{
        if (folderObject.content.length === 0){
            const ind = current.content.indexOf(folderObject);
            current.content.splice(ind, 1);
            fs.writeFileSync("./file-tree/tree.json", JSON.stringify(fileContent, null, 2));
            console.log("Folder has been deleted");

            return res.status(200).json({
                error: "Folder has been deleted"
            });
        }
        else{
            console.log("Folder has children. Can't delete folder");

            return res.status(400).json({
                error: "Folder doesn't exist"
            });
        }
    }
});

// renames a folder
router.patch("/*path", (req, res) => {
    const folderPath = req.params.path;
    const fileContentString = fs.readFileSync("./file-tree/tree.json", "utf-8");
    const fileContent = JSON.parse(fileContentString)
    let current = fileContent;

    if (!/^[A-Za-z0-9]+$/.test(req.body)){
        console.log("Invalid folder name");
        return res.status(400).json({
            error: "Folder Name is invalid"
        });
    }

    for (let i = 0; i < folderPath.length - 1; i++){
        current = current.content.find(child => (child.name === folderPath[i] && child.type === "folder"));
        if (!current){
            console.log("Folder Path is invalid");
            return res.status(400).json({
                error: "Folder Path is invalid"
            });
        }
    }

    const folderObject = current.content.find(child => (child.name === folderPath[folderPath.length - 1] && child.type === "folder"));

    if (!folderObject){
        console.log("Folder doesn't exist");
        return res.status(400).json({
            error: "Folder doesn't exist"
        });
    }
    else{
        folderObject.name = req.body;
        return res.status(200).json({
            message: "Folder has been renamed"
        });
    }
});

export default router;