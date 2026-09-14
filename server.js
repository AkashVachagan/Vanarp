import express from "express";
import fs from "fs";
import registerRouter from "./routers/registerRouter.js";
import fileRouter from "./routers/fileRouter.js";
import folderRouter from "./routers/folderRouter.js";
import clearRouter from "./routers/clearRouter.js";

const app = express();

app.use(express.text());
app.use(express.json());

app.use("/user", registerRouter);

app.use("/file", fileRouter);

app.use("/folder", folderRouter);

app.use("/clear", clearRouter);

app.listen(3000, (req, res) => {
    fs.mkdirSync("./codes", {recursive : true});
    fs.mkdirSync("./file-tree", {recursive : true});
    fs.mkdirSync("./user", {recursive : true});
    fs.mkdirSync("./jwt", {recursive : true});

    if (!fs.existsSync("./user/userInfo.json")){
        fs.writeFileSync("./user/userInfo.json", JSON.stringify([], null, 2));
    }
    if (!fs.existsSync("./jwt/token.json")){
        fs.writeFileSync("./jwt/token.json", JSON.stringify([], null, 2));
    }

    console.log("server successfully started");
});