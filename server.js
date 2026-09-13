import express from "express";
import initRouter from "./routers/initRouter.js";
import fileRouter from "./routers/fileRouter.js";
import folderRouter from "./routers/folderRouter.js";

const app = express();

app.use(express.text());

app.use("/", initRouter);

app.use("/file", fileRouter);

app.use("/folder", folderRouter);

app.listen(3000, () => {
    console.log("server successfully started");
});