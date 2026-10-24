import fs from "fs";

const tokenVerification = (req, res, next) => {
    const tokenListString = fs.readFileSync("./jwt/token.json", "utf-8");
    const tokenList = JSON.parse(tokenListString);
    const tokenBearer = req.headers.authorization;
    if (!tokenBearer){
        console.log("no token was sent");
        return res.status(401).json({
            error: "no token was sent"
        });
    }

    const [scheme, token] = tokenBearer.split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "invalid authorization header" });
    const jwt = tokenList.find(child => child.token === token);
    if (!jwt){
        console.log("token invalid");
        return res.status(401).json({
            error: "token invalid"
        });
    }

    if (Date.now() > jwt.expiresAt){
        console.log("token expired, relogin");
        return res.status(403).json({
            error: "token expired"
        });
    }

    const user_id = jwt.user_id;
    req.user_id = user_id;

    next();
}

export default tokenVerification;
