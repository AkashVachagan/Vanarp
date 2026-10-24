import express from "express";
import fs from "fs";
import crypto from "crypto";
import tokenVerification from "../middleware/tokenVerify.js";

const router = express.Router();

// creates a chat_id for a chat with AI for a particular user_id
router.post("/createChatLog", tokenVerification, (req, res) => {
    const user_id = req.user_id;
    const chat_id = crypto.randomUUID();
    fs.mkdirSync(`./ai-chat-log/${user_id}`, {recursive : true});
    fs.writeFileSync(`./ai-chat-log/${user_id}/${chat_id}.json`, JSON.stringify([], null, 2));

    console.log("AI chat_id was successfully created");
    return res.status(201).json({
        chat_id: chat_id
    });
});

// gets chat_id, file_id's as file_ids in a list along with question in a json
// req.body(json) -> chat_id, file_ids(list) - fileName: file_id, query
router.post("/chat", tokenVerification, async (req, res) => {
    const user_id = req.user_id;
    const chat_id = req.body.chat_id;
    const fileObjects = req.body.file_ids;
    const userQuery = req.body.query;
    const chatLogString = fs.readFileSync(`./ai-chat-log/${user_id}/${chat_id}.json`, "utf-8");
    const chatLog = JSON.parse(chatLogString);

    const fileContent = [];
    for (const fileObject of fileObjects){
        const fileName = fileObject.fileName;
        const content = fs.readFileSync(`./codes/${fileObject.file_id}.txt`, "utf-8");
        fileContent.push({
            [fileName]: content
        });
    }

    const userPrompt = `
        List of jsons with relevant files in the json format fileName:fileContents :
        ${JSON.stringify(fileContent, null, 2)}

        Question:
        ${userQuery}
    `;

    const template = {
        model: "qwen2.5-coder:7b",
        messages: [
            {
                role: "system",
                content: "You are an AI assisstant in a live coding environment. You may be given additional files as context and asked questions. Keep your answer short, consise and not too long"
            },
            ...chatLog,
            {
                role: "user",
                content: userPrompt
            }
        ],
        stream: false
    };


    const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(template)
    });

    const data = await response.json();
    const aiResponse = data.message.content;

    // user query
    chatLog.push({
        role: "user",
        content: userQuery
    });

    // ai response
    chatLog.push({
        role: "assistant",
        content: aiResponse
    });

    fs.writeFileSync(`./ai-chat-log/${user_id}/${chat_id}.json`, JSON.stringify(chatLog, null, 2));

    console.log("AI responsded to user query");
    return res.status(200).json({
        message: aiResponse
    });
});

export default router;