import express from "express";
import fs from "fs";
import crypto from "crypto";
import tokenVerification from "../middleware/tokenVerify.js";

const router = express.Router();

// creates a file
router.post("/*path", tokenVerification, (req, res) => {
    const filePath = req.params.path;
    const user_id = req.user_id;
    const fileContentString = fs.readFileSync(`./file-tree/${user_id}.json`, "utf-8");
    const fileContent = JSON.parse(fileContentString);
    let current = fileContent;

    const fileComponents = filePath[filePath.length - 1].split(".");
    if (fileComponents.length !== 2){
        console.log("Invalid file name");
        return res.status(400).json({
            error: "Invalid file name"
        });
    }
    
    if (!/^[A-Za-z0-9]+$/.test(fileComponents[0])){
        console.log("Invalid File name");
        return res.status(400).json({
            error: "Invalid file name"
        });
    }

    if (!/^[a-z]+$/.test(fileComponents[1])){
        console.log("Invalid File extension");
        return res.status(400).json({
            error: "Invalid file extension"
        });
    }

    for (let i = 0; i < filePath.length - 1; i++){
        current = current.content.find(child => (child.name === filePath[i] && child.type === "folder"));
        if (!current){
            console.log("File Path is invalid");
            return res.status(400).json({
                error: "File Path is invalid"
            });
        } 
    }

    if (current.content.find(child => (child.name === filePath[filePath.length - 1] && child.type === "file"))){
        console.log("File already exists");
        return res.status(409).json({
            error: "File already exists"
        }); 
    }

    const randomFileID = crypto.randomUUID();

    const template = {
        name: filePath[filePath.length - 1],
        type: "file",
        file_id: randomFileID
    };

    current.content.push(template);
    fs.writeFileSync(`./file-tree/${user_id}.json`, JSON.stringify(fileContent, null, 2));
    fs.writeFileSync(`./codes/${randomFileID}.txt`, "");

    console.log("File has been created");
    return res.status(201).json({
        message: "File has been created"
    });
});

// updates contents of the file
router.put("/*path", tokenVerification, (req, res) => {
    const filePath = req.params.path;
    const user_id = req.user_id;
    const fileContentString = fs.readFileSync(`./file-tree/${user_id}.json`, "utf-8");
    const fileContent = JSON.parse(fileContentString);
    let current = fileContent;
    const code = req.body;

    for (let i = 0; i < filePath.length - 1; i++){
        current = current.content.find(child => (child.name === filePath[i] && child.type === "folder"));
        if (!current){
            console.log("File Path is invalid");
            return res.status(400).json({
                error: "File Path is invalid"
            });
        }
    }

    const fileObject = current.content.find(child => (child.name === filePath[filePath.length - 1] && child.type === "file"));
    if (!fileObject){
        console.log("File doesn't exist");
        return res.status(404).json({
            message: "File not found"
        });
    } 

    const fileId = fileObject.file_id;

    fs.writeFileSync(`./codes/${fileId}.txt`, code);

    console.log("File Content has been updated");
    return res.status(201).json({
        message: "File content has been updated"
    });
});

// deletes the file
router.delete("/*path", tokenVerification, (req, res) => {
    const filePath = req.params.path;
    const user_id = req.user_id;
    const fileContentString = fs.readFileSync(`./file-tree/${user_id}.json`, "utf-8");
    const fileContent = JSON.parse(fileContentString);
    let current = fileContent;

    for (let i = 0; i < filePath.length - 1; i++){
        current = current.content.find(child => (child.name === filePath[i] && child.type === "folder"));
        if (!current){
            console.log("File Path is invalid");
            return res.status(400).json({
                error: "File Path is invalid"
            });
        }
    }

    const fileObject = current.content.find(child => (child.name === filePath[filePath.length - 1] && child.type === "file"));

    if (!fileObject){
        console.log("File doesn't exist");
        return res.status(404).json({
            message: "File not found"
        });
    } 
    else{
        const ind = current.content.indexOf(fileObject);
        const fileId = fileObject.file_id;

        current.content.splice(ind, 1);
        fs.writeFileSync(`./file-tree/${user_id}.json`, JSON.stringify(fileContent, null, 2));
        fs.unlinkSync(`./codes/${fileId}.txt`);
    }

    console.log("File hash been deleted");
    return res.status(200).json({
        message: "File has been deleted"
    });
})

// renames the file
router.patch("/*path", tokenVerification, (req, res) => {
    const filePath = req.params.path;
    const user_id = req.user_id;
    const fileContentString = fs.readFileSync(`./file-tree/${user_id}.json`, "utf-8");
    const fileContent = JSON.parse(fileContentString);
    let current = fileContent;

    const fileComponents = req.body.split(".");
    if (fileComponents.length !== 2){
        console.log("Invalid file name");
        return res.status(400).json({
            error: "Invalid file name"
        });
    }
    
    if (!/^[A-Za-z0-9]+$/.test(fileComponents[0])){
        console.log("Invalid File name");
        return res.status(400).json({
            error: "Invalid file name"
        });
    }

    if (!/^[a-z]+$/.test(fileComponents[1])){
        console.log("Invalid File extension");
        return res.status(400).json({
            error: "Invalid file extension"
        });
    }

    for (let i = 0; i < filePath.length - 1; i++){
        current = current.content.find(child => (child.name === filePath[i] && child.type === "folder"));
        if (!current){
            console.log("File Path is invalid");
            return res.status(400).json({
                error: "File Path is invalid"
            });
        }
    }

    const fileObject = current.content.find(child => (child.name === filePath[filePath.length - 1] && child.type === "file"));

    if (!fileObject){
        console.log("File doesn't exist");
        return res.status(404).json({
            message: "File not found"
        });
    }
    else{
        fileObject.name = req.body;
        fs.writeFileSync(`./file-tree/${user_id}.json`, JSON.stringify(fileContent, null, 2));
    }

    console.log("File hash been renamed");
    return res.status(201).json({
        message: "File has been renamed"
    });
})

export default router;