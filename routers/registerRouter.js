import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";

const router = express.Router();

const THIRTY_MINUTES = 30 * 60 * 1000;

// user registration
// update userList.json -> username, hash, user_id
// update tree.json
// update token.json
router.post("/register", async (req, res) => {
    const {username, password} = req.body;
    const userListString = fs.readFileSync("./user/userInfo.json", "utf-8");
    const tokenListString = fs.readFileSync("./jwt/token.json", "utf-8");
    const userList = JSON.parse(userListString);
    const tokenList = JSON.parse(tokenListString);
    const randomUserId = crypto.randomUUID();
    const randomToken = crypto.randomUUID();

    if (userList.find(child => child.name === username)){
        console.log("user already exists");
        return res.status(409).json({
            error: "user already exists"
        });
    }
    
    const hashPass = await bcrypt.hash(password, 12);

    const userTemplate = {
        name: username,
        hash: hashPass,
        user_id: randomUserId
    };
    userList.push(userTemplate);

    const treeTemplate = {
        user_id: randomUserId,
        name: username,
        type: "folder",
        content: []
    };

    const tokenTemplate = {
        user_id: randomUserId,
        token: randomToken,
        expiresAt: Date.now() + THIRTY_MINUTES
    }
    tokenList.push(tokenTemplate);
    
    fs.writeFileSync("./user/userInfo.json", JSON.stringify(userList, null, 2));
    fs.writeFileSync(`./file-tree/${randomUserId}.json`, JSON.stringify(treeTemplate, null, 2));
    fs.writeFileSync("./jwt/token.json", JSON.stringify(tokenList, null, 2));
    console.log("user registration successful");

    return res.status(201).json({
        token: randomToken
    });
});

// user login
router.post("/login", async (req, res) => {
    const {username, password} = req.body;
    const userListString = fs.readFileSync("./user/userInfo.json", "utf-8");
    const tokenListString = fs.readFileSync("./jwt/token.json", "utf-8");
    const userList = JSON.parse(userListString);
    const tokenList = JSON.parse(tokenListString);
    const randomToken = crypto.randomUUID();

    const userInfo = userList.find(child => child.name === username);
    if (!userInfo){
        console.log("username not found");
        return res.status(404).json({
            error: "username not found"
        });
    }

    const valid = await bcrypt.compare(password, userInfo.hash);

    if (!valid){
        console.log("incorrect password");
        return res.status(400).json({
            error: "incorrect password"
        });
    }

    const user_id = userInfo.user_id;
    const jwt = tokenList.find(child => child.user_id = user_id);
    if (!jwt){
        console.log("user jwt not available");
        return res.status(500).json({
            error: "user jwt not available"
        });
    }

    jwt.token = randomToken;
    jwt.expiresAt = Date.now() + THIRTY_MINUTES;

    fs.writeFileSync("./jwt/token.json", JSON.stringify(tokenList, null, 2));

    console.log("User token created");
    return res.status(200).json({
        token: randomToken
    });
})

export default router;